from __future__ import annotations

import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
import requests
from shapely.geometry import Point
from sqlalchemy.orm import Session

from app.services.gsi_event_clustering import (
    haversine_km,
)

from app.services.gsi_training_dataset import (
    load_gsi_events,
)


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[2]

OUTPUT_DIR = (
    BASE_DIR
    / "data"
    / "gsi"
)

NEGATIVE_DATASET_FILE = (
    OUTPUT_DIR
    / "gsi_training_negative_candidates.json"
)

QUALITY_REPORT_FILE = (
    OUTPUT_DIR
    / "gsi_negative_sampling_quality.json"
)

BOUNDARY_FILE = (
    OUTPUT_DIR
    / "india_states_2019.geojson"
)


# ============================================================
# STATE BOUNDARY SOURCE
# ============================================================

BOUNDARY_URL = (
    "https://raw.githubusercontent.com/"
    "india-in-data/india-states-2019/"
    "master/india_states.geojson"
)

BOUNDARY_SOURCE = (
    "India States and UTs 2019 "
    "geospatial boundary dataset"
)


# ============================================================
# SAMPLING CONFIGURATION
# ============================================================

SEED = 26001

# Keep the original configurable ratio.
NEGATIVE_TO_POSITIVE_RATIO = 1.0

# Known GSI event safety distance.
MIN_DISTANCE_FROM_EVENT_KM = 10.0

# Safety distance from multi-event cluster centroid.
MIN_DISTANCE_FROM_CLUSTER_KM = 10.0

# Keep generated background candidates separated.
MIN_BACKGROUND_SEPARATION_KM = 5.0

# Candidate generation upper bound.
CANDIDATE_MULTIPLIER = 20

MAX_CANDIDATES = 10000


# ============================================================
# NORTHEAST STATES
# ============================================================

NORTHEAST_STATES = {
    "Arunachal Pradesh",
    "Assam",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Sikkim",
    "Tripura",
}


STATE_ALIASES = {
    "arunachal pradesh": "Arunachal Pradesh",
    "arunachal": "Arunachal Pradesh",
    "assam": "Assam",
    "manipur": "Manipur",
    "meghalaya": "Meghalaya",
    "mizoram": "Mizoram",
    "nagaland": "Nagaland",
    "sikkim": "Sikkim",
    "tripura": "Tripura",
}


# ============================================================
# JSON
# ============================================================

def save_json(
    path: Path,
    payload: Any,
) -> None:

    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    path.write_text(
        json.dumps(
            payload,
            indent=2,
            ensure_ascii=False,
            default=str,
        ),
        encoding="utf-8",
    )


# ============================================================
# POSITIVE EVENTS
# ============================================================

def extract_positive_points(
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:

    points: list[
        dict[str, Any]
    ] = []

    for event in events:

        latitude = event.get(
            "latitude"
        )

        longitude = event.get(
            "longitude"
        )

        if (
            latitude is None
            or longitude is None
        ):
            continue

        try:
            latitude = float(
                latitude
            )

            longitude = float(
                longitude
            )

        except (
            TypeError,
            ValueError,
        ):
            continue

        points.append(
            {
                "event_id": event[
                    "id"
                ],
                "latitude": latitude,
                "longitude": longitude,
                "occurrence_date": event.get(
                    "occurrence_date"
                ),
                "state": event.get(
                    "state"
                ),
                "district": event.get(
                    "district"
                ),
            }
        )

    return points


# ============================================================
# ORIGINAL EVENT EXTENT
# ============================================================

def calculate_sampling_extent(
    points: list[
        dict[str, Any]
    ],
) -> dict[str, float]:
    """
    Calculate the event bounding box.

    This remains available for compatibility and
    quality reporting.

    IMPORTANT:
    It is NOT used as the final geographic validity
    filter. Final sampling is restricted using actual
    Northeast state polygons.
    """

    if not points:
        raise ValueError(
            "No positive spatial points available."
        )

    latitudes = [
        point["latitude"]
        for point in points
    ]

    longitudes = [
        point["longitude"]
        for point in points
    ]

    min_latitude = min(
        latitudes
    )

    max_latitude = max(
        latitudes
    )

    min_longitude = min(
        longitudes
    )

    max_longitude = max(
        longitudes
    )

    latitude_padding = 1.0
    longitude_padding = 1.0

    return {
        "min_latitude": max(
            -90.0,
            min_latitude
            - latitude_padding,
        ),
        "max_latitude": min(
            90.0,
            max_latitude
            + latitude_padding,
        ),
        "min_longitude": max(
            -180.0,
            min_longitude
            - longitude_padding,
        ),
        "max_longitude": min(
            180.0,
            max_longitude
            + longitude_padding,
        ),
    }


# ============================================================
# STATE NORMALIZATION
# ============================================================

def normalize_state_name(
    value: Any,
) -> str | None:

    if value is None:
        return None

    text = (
        str(value)
        .strip()
        .lower()
    )

    return STATE_ALIASES.get(
        text
    )


def find_state_column(
    gdf: gpd.GeoDataFrame,
) -> str:

    candidates = [
        "ST_NM",
        "st_nm",
        "STATE",
        "State",
        "state",
        "NAME_1",
        "name_1",
        "NAME",
        "Name",
        "name",
    ]

    for column in candidates:

        if column in gdf.columns:
            return column

    raise ValueError(
        "Could not identify the state-name "
        "column in the boundary dataset.\n"
        f"Available columns: {list(gdf.columns)}"
    )


# ============================================================
# BOUNDARY DOWNLOAD
# ============================================================

def download_boundary_dataset() -> None:

    if BOUNDARY_FILE.exists():

        print(
            "Using cached Northeast state boundaries:"
        )

        print(
            f"  {BOUNDARY_FILE}"
        )

        return

    print(
        "Downloading Northeast state boundaries..."
    )

    BOUNDARY_FILE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    response = requests.get(
        BOUNDARY_URL,
        timeout=60,
        headers={
            "User-Agent": (
                "BhooPehra/1.0 "
                "landslide-research-prototype"
            )
        },
    )

    response.raise_for_status()

    if not response.content:
        raise RuntimeError(
            "Boundary download returned empty content."
        )

    BOUNDARY_FILE.write_bytes(
        response.content
    )

    print(
        "Boundary download completed."
    )

    print(
        f"  Size: "
        f"{len(response.content) / 1024 / 1024:.2f} MB"
    )


# ============================================================
# LOAD NORTHEAST POLYGONS
# ============================================================

def load_northeast_boundaries() -> gpd.GeoDataFrame:

    download_boundary_dataset()

    print(
        "Reading Northeast state polygons..."
    )

    gdf = gpd.read_file(
        BOUNDARY_FILE
    )

    if gdf.empty:
        raise ValueError(
            "Boundary dataset is empty."
        )

    if gdf.crs is None:
        raise ValueError(
            "Boundary dataset has no CRS."
        )

    state_column = find_state_column(
        gdf
    )

    gdf = gdf[
        gdf.geometry.notna()
    ].copy()

    gdf[
        "resolved_state"
    ] = (
        gdf[state_column]
        .map(
            normalize_state_name
        )
    )

    gdf = gdf[
        gdf[
            "resolved_state"
        ].isin(
            NORTHEAST_STATES
        )
    ].copy()

    if gdf.empty:
        raise ValueError(
            "No Northeast state polygons "
            "were found."
        )

    gdf = gdf.to_crs(
        "EPSG:4326"
    )

    # Repair invalid geometries where possible.
    try:
        gdf["geometry"] = (
            gdf.geometry.make_valid()
        )
    except Exception:
        pass

    print(
        f"Northeast polygons loaded: "
        f"{len(gdf)}"
    )

    print(
        "States:"
    )

    for state in sorted(
        gdf[
            "resolved_state"
        ].dropna().unique()
    ):
        print(
            f"  {state}"
        )

    return gdf[
        [
            "resolved_state",
            "geometry",
        ]
    ].copy()


# ============================================================
# POINT-IN-POLYGON STATE RESOLUTION
# ============================================================

def resolve_state_for_point(
    latitude: float,
    longitude: float,
    boundaries: gpd.GeoDataFrame,
) -> str | None:

    point = Point(
        longitude,
        latitude,
    )

    for _, row in boundaries.iterrows():

        geometry = row.geometry

        if geometry is None:
            continue

        try:

            if geometry.covers(
                point
            ):
                return str(
                    row[
                        "resolved_state"
                    ]
                )

        except Exception:
            continue

    return None


# ============================================================
# EVENT DISTANCE
# ============================================================

def point_is_far_from_positive_events(
    latitude: float,
    longitude: float,
    positive_points: list[
        dict[str, Any]
    ],
) -> tuple[
    bool,
    float,
    int | str | None,
]:

    minimum_distance = float(
        "inf"
    )

    nearest_event_id = None

    for point in positive_points:

        distance = haversine_km(
            latitude,
            longitude,
            point["latitude"],
            point["longitude"],
        )

        if (
            distance
            < minimum_distance
        ):

            minimum_distance = (
                distance
            )

            nearest_event_id = (
                point["event_id"]
            )

    safe = (
        minimum_distance
        >= MIN_DISTANCE_FROM_EVENT_KM
    )

    return (
        safe,
        round(
            minimum_distance,
            3,
        ),
        nearest_event_id,
    )


# ============================================================
# CLUSTER DISTANCE
# ============================================================

def point_is_far_from_clusters(
    latitude: float,
    longitude: float,
    clusters: list[
        dict[str, Any]
    ],
) -> tuple[
    bool,
    float,
    int | None,
]:

    minimum_distance = float(
        "inf"
    )

    nearest_cluster_id = None

    for cluster in clusters:

        centroid = cluster.get(
            "centroid"
        )

        if not centroid:
            continue

        try:

            distance = haversine_km(
                latitude,
                longitude,
                float(
                    centroid[
                        "latitude"
                    ]
                ),
                float(
                    centroid[
                        "longitude"
                    ]
                ),
            )

        except (
            TypeError,
            ValueError,
            KeyError,
        ):
            continue

        if (
            distance
            < minimum_distance
        ):

            minimum_distance = (
                distance
            )

            nearest_cluster_id = (
                cluster.get(
                    "cluster_id"
                )
            )

    if minimum_distance == float(
        "inf"
    ):

        return (
            True,
            float("inf"),
            None,
        )

    safe = (
        minimum_distance
        >= MIN_DISTANCE_FROM_CLUSTER_KM
    )

    return (
        safe,
        round(
            minimum_distance,
            3,
        ),
        nearest_cluster_id,
    )


# ============================================================
# BACKGROUND SEPARATION
# ============================================================

def point_is_far_from_background(
    latitude: float,
    longitude: float,
    backgrounds: list[
        dict[str, Any]
    ],
) -> bool:

    for record in backgrounds:

        distance = haversine_km(
            latitude,
            longitude,
            float(
                record[
                    "latitude"
                ]
            ),
            float(
                record[
                    "longitude"
                ]
            ),
        )

        if (
            distance
            < MIN_BACKGROUND_SEPARATION_KM
        ):
            return False

    return True


# ============================================================
# RANDOM CANDIDATE
# ============================================================

def generate_random_candidate(
    extent: dict[str, float],
    rng: random.Random,
) -> tuple[
    float,
    float,
]:

    latitude = rng.uniform(
        extent[
            "min_latitude"
        ],
        extent[
            "max_latitude"
        ],
    )

    longitude = rng.uniform(
        extent[
            "min_longitude"
        ],
        extent[
            "max_longitude"
        ],
    )

    return (
        round(
            latitude,
            7,
        ),
        round(
            longitude,
            7,
        ),
    )


# ============================================================
# NEGATIVE CANDIDATES
# ============================================================

def generate_negative_candidates(
    positive_points: list[
        dict[str, Any]
    ],
    cluster_analysis: dict[str, Any],
    target_count: int,
    boundaries: gpd.GeoDataFrame,
) -> tuple[
    list[dict[str, Any]],
    dict[str, Any],
]:

    if not positive_points:
        raise ValueError(
            "Cannot generate background samples "
            "without positive spatial events."
        )

    extent = calculate_sampling_extent(
        positive_points
    )

    rng = random.Random(
        SEED
    )

    multi_event_clusters = [
        cluster
        for cluster in cluster_analysis.get(
            "clusters",
            [],
        )
        if cluster.get(
            "size",
            1,
        ) >= 2
    ]

    candidate_limit = min(
        MAX_CANDIDATES,
        max(
            target_count
            * CANDIDATE_MULTIPLIER,
            target_count,
        ),
    )

    negatives: list[
        dict[str, Any]
    ] = []

    generated = 0

    rejected_outside_state = 0
    rejected_near_event = 0
    rejected_near_cluster = 0
    rejected_duplicate = 0

    occupied: list[
        tuple[float, float]
    ] = []

    state_counts: dict[
        str,
        int,
    ] = {}

    while (
        len(negatives)
        < target_count
        and generated
        < candidate_limit
    ):

        generated += 1

        latitude, longitude = (
            generate_random_candidate(
                extent,
                rng,
            )
        )

        # ----------------------------------------------------
        # ACTUAL STATE POLYGON CHECK
        # ----------------------------------------------------

        state = resolve_state_for_point(
            latitude,
            longitude,
            boundaries,
        )

        if state is None:

            rejected_outside_state += 1

            continue

        # ----------------------------------------------------
        # DISTANCE FROM POSITIVE EVENTS
        # ----------------------------------------------------

        (
            safe_from_events,
            nearest_distance,
            nearest_event_id,
        ) = point_is_far_from_positive_events(
            latitude,
            longitude,
            positive_points,
        )

        if not safe_from_events:

            rejected_near_event += 1

            continue

        # ----------------------------------------------------
        # DISTANCE FROM MULTI-EVENT CLUSTERS
        # ----------------------------------------------------

        (
            safe_from_clusters,
            cluster_distance,
            nearest_cluster_id,
        ) = point_is_far_from_clusters(
            latitude,
            longitude,
            multi_event_clusters,
        )

        if not safe_from_clusters:

            rejected_near_cluster += 1

            continue

        # ----------------------------------------------------
        # DISTANCE FROM OTHER BACKGROUND POINTS
        # ----------------------------------------------------

        if not point_is_far_from_background(
            latitude,
            longitude,
            negatives,
        ):

            rejected_duplicate += 1

            continue

        occupied.append(
            (
                latitude,
                longitude,
            )
        )

        sample_id = (
            f"GSI_BACKGROUND_"
            f"{len(negatives) + 1:04d}"
        )

        record = {
            "sample_id": sample_id,
            "label": 0,
            "label_name": (
                "BACKGROUND_CANDIDATE"
            ),
            "sample_type": (
                "SPATIAL_BACKGROUND"
            ),
            "latitude": latitude,
            "longitude": longitude,
            "state": state,
            "nearest_positive_event_id": (
                nearest_event_id
            ),
            "nearest_positive_distance_km": (
                nearest_distance
            ),
            "nearest_cluster_id": (
                nearest_cluster_id
            ),
            "nearest_cluster_distance_km": (
                cluster_distance
                if cluster_distance
                != float("inf")
                else None
            ),
            "source": (
                "BhooPehra_BACKGROUND_SAMPLER"
            ),
            "sampling_seed": SEED,
            "sampling_status": (
                "UNVERIFIED_BACKGROUND"
            ),
            "state_boundary_source": (
                BOUNDARY_SOURCE
            ),
            "state_boundary_url": (
                BOUNDARY_URL
            ),
            "minimum_distance_from_event_km": (
                MIN_DISTANCE_FROM_EVENT_KM
            ),
            "minimum_distance_from_cluster_km": (
                MIN_DISTANCE_FROM_CLUSTER_KM
            ),
            "minimum_background_separation_km": (
                MIN_BACKGROUND_SEPARATION_KM
            ),
        }

        negatives.append(
            record
        )

        state_counts[state] = (
            state_counts.get(
                state,
                0,
            )
            + 1
        )

        print(
            f"[{len(negatives):02d}/"
            f"{target_count}] "
            f"{state} | "
            f"{latitude:.6f}, "
            f"{longitude:.6f} | "
            f"nearest event="
            f"{nearest_distance:.2f} km"
        )

    statistics = {
        "target_count": target_count,
        "generated_candidates": generated,
        "accepted": len(
            negatives
        ),
        "rejected_outside_state_polygon": (
            rejected_outside_state
        ),
        "rejected_near_event": (
            rejected_near_event
        ),
        "rejected_near_cluster": (
            rejected_near_cluster
        ),
        "rejected_duplicate": (
            rejected_duplicate
        ),
        "candidate_limit": (
            candidate_limit
        ),
        "minimum_distance_from_event_km": (
            MIN_DISTANCE_FROM_EVENT_KM
        ),
        "minimum_distance_from_cluster_km": (
            MIN_DISTANCE_FROM_CLUSTER_KM
        ),
        "minimum_background_separation_km": (
            MIN_BACKGROUND_SEPARATION_KM
        ),
        "state_counts": dict(
            sorted(
                state_counts.items()
            )
        ),
    }

    return (
        negatives,
        statistics,
    )


# ============================================================
# QUALITY REPORT
# ============================================================

def build_quality_report(
    positive_points: list[
        dict[str, Any]
    ],
    negative_candidates: list[
        dict[str, Any]
    ],
    sampling_statistics: dict[str, Any],
    extent: dict[str, float],
) -> dict[str, Any]:

    positive_count = len(
        positive_points
    )

    negative_count = len(
        negative_candidates
    )

    ratio = (
        negative_count
        / positive_count
        if positive_count
        else None
    )

    missing_states = sum(
        1
        for record in negative_candidates
        if not record.get(
            "state"
        )
    )

    duplicate_coordinates = 0

    seen_coordinates: set[
        tuple[float, float]
    ] = set()

    for record in negative_candidates:

        coordinate = (
            round(
                float(
                    record[
                        "latitude"
                    ]
                ),
                6,
            ),
            round(
                float(
                    record[
                        "longitude"
                    ]
                ),
                6,
            ),
        )

        if coordinate in seen_coordinates:

            duplicate_coordinates += 1

        seen_coordinates.add(
            coordinate
        )

    target_reached = (
        negative_count
        == sampling_statistics[
            "target_count"
        ]
    )

    state_labels_valid = (
        missing_states == 0
    )

    unique_coordinates = (
        duplicate_coordinates == 0
    )

    if (
        target_reached
        and state_labels_valid
        and unique_coordinates
    ):
        overall_status = "PASS"
    else:
        overall_status = (
            "PARTIAL_COVERAGE_REVIEW"
        )

    return {
        "generated_at_utc": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),
        "database_operation": (
            "READ_ONLY"
        ),
        "sampling_method": (
            "reproducible_uniform_random "
            "candidate generation followed by "
            "actual Northeast state polygon "
            "point-in-polygon validation"
        ),
        "sampling_extent": extent,
        "positive_events": (
            positive_count
        ),
        "negative_background_candidates": (
            negative_count
        ),
        "negative_to_positive_ratio": (
            ratio
        ),
        "target_count_reached": (
            target_reached
        ),
        "missing_state_labels": (
            missing_states
        ),
        "duplicate_coordinates": (
            duplicate_coordinates
        ),
        "all_backgrounds_have_state": (
            state_labels_valid
        ),
        "coordinates_unique": (
            unique_coordinates
        ),
        "overall_status": (
            overall_status
        ),
        "state_boundary_source": (
            BOUNDARY_SOURCE
        ),
        "state_boundary_url": (
            BOUNDARY_URL
        ),
        "sampling_statistics": (
            sampling_statistics
        ),
        "warnings": [
            (
                "Background candidates are NOT "
                "confirmed non-landslide observations."
            ),
            (
                "State membership is determined "
                "using actual Northeast state "
                "polygons."
            ),
            (
                "The event bounding box is used "
                "only as a candidate-generation "
                "area; it is not the final "
                "geographic validity filter."
            ),
            (
                "The state boundary dataset is "
                "a 2019 public geospatial dataset "
                "and should be treated as "
                "provisional rather than an "
                "authoritative 2026 administrative "
                "boundary source."
            ),
            (
                "Terrain, geology, land-cover, "
                "rainfall and hydrological "
                "features are not attached by "
                "this service."
            ),
            (
                "Do not treat background candidates "
                "as verified ML negatives."
            ),
        ],
        "database_modified": False,
    }


# ============================================================
# MAIN DB SERVICE
# ============================================================

def run_gsi_negative_sampling(
    db: Session,
    negative_to_positive_ratio: float = (
        NEGATIVE_TO_POSITIVE_RATIO
    ),
) -> dict[str, Any]:

    if (
        negative_to_positive_ratio
        <= 0
    ):
        raise ValueError(
            "negative_to_positive_ratio "
            "must be greater than zero."
        )

    print()
    print(
        "=" * 72
    )
    print(
        "BhooPehra - GSI Background Sampling"
    )
    print(
        "=" * 72
    )

    # --------------------------------------------------------
    # LOAD GSI EVENTS
    # --------------------------------------------------------

    positive_events = (
        load_gsi_events(
            db
        )
    )

    positive_points = (
        extract_positive_points(
            positive_events
        )
    )

    if not positive_points:
        raise RuntimeError(
            "No spatial GSI events were found."
        )

    print(
        f"Positive spatial events: "
        f"{len(positive_points)}"
    )

    # --------------------------------------------------------
    # CLUSTER ANALYSIS
    # --------------------------------------------------------

    from app.services.gsi_event_clustering import (
        build_cluster_analysis,
    )

    cluster_analysis = (
        build_cluster_analysis(
            positive_events
        )
    )

    # --------------------------------------------------------
    # TARGET COUNT
    # --------------------------------------------------------

    target_count = max(
        1,
        math.ceil(
            len(positive_points)
            * negative_to_positive_ratio
        ),
    )

    print(
        f"Target background candidates: "
        f"{target_count}"
    )

    # --------------------------------------------------------
    # LOAD ACTUAL STATE POLYGONS
    # --------------------------------------------------------

    boundaries = (
        load_northeast_boundaries()
    )

    # --------------------------------------------------------
    # GENERATE
    # --------------------------------------------------------

    (
        negative_candidates,
        sampling_statistics,
    ) = generate_negative_candidates(
        positive_points=positive_points,
        cluster_analysis=cluster_analysis,
        target_count=target_count,
        boundaries=boundaries,
    )

    # --------------------------------------------------------
    # EVENT EXTENT
    # --------------------------------------------------------

    extent = (
        calculate_sampling_extent(
            positive_points
        )
    )

    # --------------------------------------------------------
    # QUALITY
    # --------------------------------------------------------

    quality_report = (
        build_quality_report(
            positive_points=positive_points,
            negative_candidates=negative_candidates,
            sampling_statistics=sampling_statistics,
            extent=extent,
        )
    )

    # --------------------------------------------------------
    # DATASET
    # --------------------------------------------------------

    dataset = {
        "dataset": (
            "BhooPehra GSI Background "
            "Candidates"
        ),
        "version": "0.2",
        "generated_at_utc": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),
        "database_operation": (
            "READ_ONLY"
        ),
        "label_definition": {
            "label_0": (
                "BACKGROUND_CANDIDATE - "
                "not yet verified as a true negative"
            ),
            "label_1": (
                "LANDSLIDE_EVENT - "
                "GSI-reported positive event"
            ),
        },
        "geographic_validation": {
            "method": (
                "actual Northeast state "
                "polygon point-in-polygon"
            ),
            "states": sorted(
                NORTHEAST_STATES
            ),
            "boundary_source": (
                BOUNDARY_SOURCE
            ),
            "boundary_url": (
                BOUNDARY_URL
            ),
        },
        "records": negative_candidates,
    }

    # --------------------------------------------------------
    # SAVE
    # --------------------------------------------------------

    save_json(
        NEGATIVE_DATASET_FILE,
        dataset,
    )

    save_json(
        QUALITY_REPORT_FILE,
        quality_report,
    )

    result = {
        "status": "success",
        "database_operation": (
            "READ_ONLY"
        ),
        "positive_spatial_events": (
            len(positive_points)
        ),
        "target_background_candidates": (
            target_count
        ),
        "generated_background_candidates": (
            len(negative_candidates)
        ),
        "positive_to_background_ratio": (
            (
                len(negative_candidates)
                / len(positive_points)
            )
            if positive_points
            else None
        ),
        "negative_dataset_file": (
            str(
                NEGATIVE_DATASET_FILE
            )
        ),
        "quality_report_file": (
            str(
                QUALITY_REPORT_FILE
            )
        ),
        "sampling_statistics": (
            sampling_statistics
        ),
        "overall_quality_status": (
            quality_report[
                "overall_status"
            ]
        ),
    }

    print_negative_sampling_report(
        result
    )

    return result


# ============================================================
# REPORT
# ============================================================

def print_negative_sampling_report(
    result: dict[str, Any],
) -> None:

    print()
    print(
        "=" * 72
    )

    print(
        "BhooPehra - GSI Background Sampling"
    )

    print(
        "=" * 72
    )

    print(
        f"Positive spatial events: "
        f"{result['positive_spatial_events']}"
    )

    print(
        f"Target background candidates: "
        f"{result['target_background_candidates']}"
    )

    print(
        f"Generated background candidates: "
        f"{result['generated_background_candidates']}"
    )

    print(
        f"Background / positive ratio: "
        f"{result['positive_to_background_ratio']}"
    )

    print()

    statistics = (
        result[
            "sampling_statistics"
        ]
    )

    print(
        "Sampling statistics:"
    )

    print(
        f"  Candidates generated: "
        f"{statistics['generated_candidates']}"
    )

    print(
        f"  Rejected outside state polygon: "
        f"{statistics['rejected_outside_state_polygon']}"
    )

    print(
        f"  Rejected near event: "
        f"{statistics['rejected_near_event']}"
    )

    print(
        f"  Rejected near cluster: "
        f"{statistics['rejected_near_cluster']}"
    )

    print(
        f"  Rejected duplicate/too close: "
        f"{statistics['rejected_duplicate']}"
    )

    print()

    print(
        "State distribution:"
    )

    for (
        state,
        count,
    ) in statistics[
        "state_counts"
    ].items():

        print(
            f"  {state}: {count}"
        )

    print()

    print(
        f"Overall quality status: "
        f"{result['overall_quality_status']}"
    )

    print()

    print(
        "Negative dataset:"
    )

    print(
        f"  {result['negative_dataset_file']}"
    )

    print()

    print(
        "Quality report:"
    )

    print(
        f"  {result['quality_report_file']}"
    )

    print()

    print(
        "IMPORTANT:"
    )

    print(
        "  These are BACKGROUND CANDIDATES, "
        "not verified negatives."
    )

    print(
        "  State labels are assigned using "
        "actual state polygons."
    )

    print(
        "  PostgreSQL/PostGIS data was not modified."
    )

    print(
        "=" * 72
    )


# ============================================================
# OPTIONAL STANDALONE EXECUTION
# ============================================================

if __name__ == "__main__":

    from app.db.database import SessionLocal

    db = SessionLocal()

    try:

        run_gsi_negative_sampling(
            db
        )

    finally:

        db.close()