from __future__ import annotations

import json
import math
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

import geopandas as gpd
from pyproj import CRS, Transformer
from shapely.geometry import Point


# ============================================================
# BhooPehra - Road Spatial Feature Engineering
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[2]

INPUT_DATASET = (
    BASE_DIR
    / "data"
    / "gsi"
    / "gsi_training_terrain_dataset.json"
)

OUTPUT_DATASET = (
    BASE_DIR
    / "data"
    / "gsi"
    / "gsi_training_road_features.json"
)

QUALITY_REPORT = (
    BASE_DIR
    / "data"
    / "gsi"
    / "gsi_training_road_quality.json"
)


# ============================================================
# Road dataset
# ============================================================

ROAD_DATA_DIR = (
    BASE_DIR
    / "data"
    / "roads"
)

ROAD_ARCHIVE = (
    ROAD_DATA_DIR
    / "north-eastern-zone-latest-free.gpkg.zip"
)

ROAD_GPKG = (
    ROAD_DATA_DIR
    / "north-eastern-zone-latest-free.gpkg"
)

ROAD_SOURCE_URL = (
    "https://download.geofabrik.de/"
    "asia/india/"
    "north-eastern-zone-latest-free.gpkg.zip"
)

ROAD_SOURCE = (
    "OpenStreetMap contributors via Geofabrik "
    "North-Eastern India extract"
)


# ============================================================
# Spatial settings
# ============================================================

DENSITY_RADIUS_1KM = 1000.0
DENSITY_RADIUS_5KM = 5000.0

MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024

USER_AGENT = (
    "BhooPehra/0.1 "
    "(landslide-research-prototype)"
)


# ============================================================
# JSON helpers
# ============================================================

def load_json(
    path: Path,
) -> Any:
    with path.open(
        "r",
        encoding="utf-8",
    ) as handle:
        return json.load(handle)


def write_json(
    path: Path,
    payload: Any,
) -> None:
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with path.open(
        "w",
        encoding="utf-8",
    ) as handle:
        json.dump(
            payload,
            handle,
            indent=2,
            ensure_ascii=False,
            default=str,
        )


# ============================================================
# Training dataset
# ============================================================

def load_training_dataset() -> dict[str, Any]:
    if not INPUT_DATASET.exists():
        raise FileNotFoundError(
            f"Terrain dataset not found: "
            f"{INPUT_DATASET}"
        )

    payload = load_json(
        INPUT_DATASET
    )

    if not isinstance(
        payload,
        dict,
    ):
        raise ValueError(
            "Terrain dataset must be a JSON object."
        )

    records = payload.get(
        "records"
    )

    if not isinstance(
        records,
        list,
    ):
        raise ValueError(
            "Terrain dataset does not contain "
            "a 'records' list."
        )

    return payload


# ============================================================
# Download / cache road dataset
# ============================================================

def download_road_dataset() -> Path:
    ROAD_DATA_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    if (
        ROAD_GPKG.exists()
        and ROAD_GPKG.stat().st_size > 1_000_000
    ):
        print(
            "Using cached road GeoPackage:"
        )
        print(
            ROAD_GPKG
        )

        return ROAD_GPKG

    print(
        "\nDownloading North-Eastern India "
        "road dataset..."
    )

    print(
        f"Source: {ROAD_SOURCE_URL}"
    )

    request = urllib.request.Request(
        ROAD_SOURCE_URL,
        headers={
            "User-Agent": USER_AGENT,
        },
    )

    with urllib.request.urlopen(
        request,
        timeout=120,
    ) as response:

        content_length = response.headers.get(
            "Content-Length"
        )

        if content_length:
            expected_size = int(
                content_length
            )

            if expected_size > MAX_DOWNLOAD_BYTES:
                raise RuntimeError(
                    "Road dataset is larger than "
                    "the configured safety limit."
                )

            print(
                "Expected download size: "
                f"{expected_size / 1024 / 1024:.1f} MB"
            )

        with ROAD_ARCHIVE.open(
            "wb"
        ) as handle:

            total = 0

            while True:
                chunk = response.read(
                    1024 * 1024
                )

                if not chunk:
                    break

                total += len(
                    chunk
                )

                if total > MAX_DOWNLOAD_BYTES:
                    raise RuntimeError(
                        "Road dataset exceeded "
                        "download safety limit."
                    )

                handle.write(
                    chunk
                )

                print(
                    f"\rDownloaded: "
                    f"{total / 1024 / 1024:.1f} MB",
                    end="",
                )

    print()

    if not ROAD_ARCHIVE.exists():
        raise RuntimeError(
            "Road archive was not created."
        )

    print(
        "\nExtracting GeoPackage..."
    )

    with zipfile.ZipFile(
        ROAD_ARCHIVE,
        "r",
    ) as archive:

        members = archive.namelist()

        gpkg_members = [
            member
            for member in members
            if member.lower().endswith(
                ".gpkg"
            )
        ]

        if not gpkg_members:
            raise RuntimeError(
                "No GeoPackage found inside "
                "the downloaded archive."
            )

        selected_member = gpkg_members[0]

        archive.extract(
            selected_member,
            ROAD_DATA_DIR,
        )

        extracted_path = (
            ROAD_DATA_DIR
            / selected_member
        )

        if extracted_path != ROAD_GPKG:
            if ROAD_GPKG.exists():
                ROAD_GPKG.unlink()

            extracted_path.replace(
                ROAD_GPKG
            )

    print(
        "Road GeoPackage:"
    )

    print(
        ROAD_GPKG
    )

    return ROAD_GPKG


# ============================================================
# Discover road layer
# ============================================================

def discover_road_layer(
    gpkg_path: Path,
) -> str:

    print(
        "\nInspecting GeoPackage layers..."
    )

    layers = gpd.list_layers(
        gpkg_path
    )

    if layers.empty:
        raise RuntimeError(
            "GeoPackage contains no layers."
        )

    print(
        "Available layers:"
    )

    for _, row in layers.iterrows():
        print(
            f"  {row['name']} | "
            f"{row['geometry_type']}"
        )

    candidates: list[str] = []

    for _, row in layers.iterrows():

        name = str(
            row["name"]
        ).lower()

        geometry_type = str(
            row["geometry_type"]
        ).lower()

        if (
            "road" in name
            and (
                "line" in geometry_type
                or "linestring" in geometry_type
                or geometry_type == "unknown"
            )
        ):
            candidates.append(
                str(row["name"])
            )

    if not candidates:

        for _, row in layers.iterrows():

            name = str(
                row["name"]
            ).lower()

            if (
                "transport" in name
                or "highway" in name
            ):
                candidates.append(
                    str(row["name"])
                )

    if not candidates:
        raise RuntimeError(
            "Could not automatically identify "
            "a road line layer in the GeoPackage."
        )

    selected = candidates[0]

    print(
        f"\nSelected road layer: {selected}"
    )

    return selected


# ============================================================
# Load roads
# ============================================================

def load_roads(
    gpkg_path: Path,
    layer: str,
) -> gpd.GeoDataFrame:

    print(
        "\nLoading road network..."
    )

    roads = gpd.read_file(
        gpkg_path,
        layer=layer,
    )

    if roads.empty:
        raise RuntimeError(
            "Road layer is empty."
        )

    if roads.crs is None:
        raise RuntimeError(
            "Road layer has no CRS."
        )

    print(
        f"Road features loaded: "
        f"{len(roads):,}"
    )

    print(
        f"Road CRS: {roads.crs}"
    )

    # Keep only valid, non-empty line geometries.
    roads = roads[
        roads.geometry.notna()
        & ~roads.geometry.is_empty
    ].copy()

    roads = roads[
        roads.geometry.geom_type.isin(
            [
                "LineString",
                "MultiLineString",
            ]
        )
    ].copy()

    print(
        f"Usable road geometries: "
        f"{len(roads):,}"
    )

    # Standardize to WGS84 for geographic indexing.
    roads = roads.to_crs(
        "EPSG:4326"
    )

    return roads


# ============================================================
# Road classification
# ============================================================

def find_highway_column(
    roads: gpd.GeoDataFrame,
) -> str | None:

    preferred = [
        "fclass",
        "highway",
        "highway_type",
        "type",
        "class",
        "road_type",
        "ref",
    ]

    columns_lower = {
        str(column).lower(): column
        for column in roads.columns
    }

    for name in preferred:
        if name in columns_lower:
            return columns_lower[name]

    for column in roads.columns:

        lower = str(
            column
        ).lower()

        if (
            "highway" in lower
            or "fclass" in lower
            or "road" in lower
        ):
            return column

    return None


def classify_road(
    value: Any,
) -> str:

    if value is None:
        return "UNKNOWN"

    text = str(
        value
    ).strip().lower()

    if not text:
        return "UNKNOWN"

    if (
        "motorway" in text
        or "expressway" in text
    ):
        return "MOTORWAY"

    if (
        "trunk" in text
        or "national" in text
        or text in {
            "nh",
            "nhw",
        }
    ):
        return "NATIONAL_HIGHWAY"

    if (
        "primary" in text
        or "state" in text
        or text in {
            "sh",
            "shw",
        }
    ):
        return "STATE_HIGHWAY"

    if (
        "secondary" in text
        or "district" in text
    ):
        return "DISTRICT_ROAD"

    if (
        "tertiary" in text
        or "residential" in text
        or "unclassified" in text
    ):
        return "LOCAL_ROAD"

    if (
        "service" in text
        or "track" in text
        or "path" in text
        or "foot" in text
    ):
        return "MINOR_ACCESS"

    return "OTHER"


def road_importance_score(
    road_class: str,
) -> float:

    scores = {
        "MOTORWAY": 1.00,
        "NATIONAL_HIGHWAY": 1.00,
        "STATE_HIGHWAY": 0.80,
        "DISTRICT_ROAD": 0.60,
        "LOCAL_ROAD": 0.30,
        "MINOR_ACCESS": 0.10,
        "OTHER": 0.20,
        "UNKNOWN": 0.15,
    }

    return scores.get(
        road_class,
        0.15,
    )


# ============================================================
# Local metric CRS
# ============================================================

def build_local_metric_crs(
    latitude: float,
    longitude: float,
) -> CRS:
    """
    Build a local Azimuthal Equidistant CRS centered
    on the sample point.

    This is used specifically for local distance,
    buffering and road-length calculations.

    Distances and lengths are therefore measured in
    metres around the actual sample location.
    """

    return CRS.from_proj4(
        "+proj=aeqd "
        f"+lat_0={latitude} "
        f"+lon_0={longitude} "
        "+datum=WGS84 "
        "+units=m "
        "+no_defs"
    )


def build_local_transformers(
    latitude: float,
    longitude: float,
) -> tuple[
    Transformer,
    Transformer,
    CRS,
]:

    metric_crs = build_local_metric_crs(
        latitude,
        longitude,
    )

    forward = Transformer.from_crs(
        "EPSG:4326",
        metric_crs,
        always_xy=True,
    )

    backward = Transformer.from_crs(
        metric_crs,
        "EPSG:4326",
        always_xy=True,
    )

    return (
        forward,
        backward,
        metric_crs,
    )


# ============================================================
# Road metrics
# ============================================================

def local_road_metrics(
    roads: gpd.GeoDataFrame,
    latitude: float,
    longitude: float,
    highway_column: str | None,
) -> dict[str, Any]:

    latitude = float(
        latitude
    )

    longitude = float(
        longitude
    )

    point = Point(
        longitude,
        latitude,
    )

    (
        forward_transformer,
        _,
        metric_crs,
    ) = build_local_transformers(
        latitude,
        longitude,
    )

    point_x, point_y = (
        forward_transformer.transform(
            longitude,
            latitude,
        )
    )

    point_projected = Point(
        point_x,
        point_y,
    )

    # --------------------------------------------------------
    # Geographic candidate window.
    #
    # 5 km is the largest requested search radius.
    # This is ONLY used to reduce the number of road
    # geometries before accurate metric calculations.
    # --------------------------------------------------------

    lat_delta_5km = (
        DENSITY_RADIUS_5KM
        / 111_320.0
    )

    longitude_scale = max(
        math.cos(
            math.radians(
                latitude
            )
        ),
        0.1,
    )

    lon_delta_5km = (
        DENSITY_RADIUS_5KM
        / (
            111_320.0
            * longitude_scale
        )
    )

    search_box = (
        Point(
            longitude,
            latitude,
        ).buffer(
            max(
                lat_delta_5km,
                lon_delta_5km,
            )
        )
    )

    candidate_positions = list(
        roads.sindex.query(
            search_box,
            predicate="intersects",
        )
    )

    if not candidate_positions:
        return {
            "distance_to_road_m": None,
            "nearest_road_class": "NONE",
            "nearest_road_importance": 0.0,
            "road_length_1km_m": 0.0,
            "road_length_5km_m": 0.0,
            "road_density_1km_km_per_km2": 0.0,
            "road_density_5km_km_per_km2": 0.0,
            "road_count_1km": 0,
            "road_count_5km": 0,
            "metric_crs": metric_crs.to_string(),
        }

    candidate_roads = roads.iloc[
        candidate_positions
    ].copy()

    # --------------------------------------------------------
    # Project only local candidates.
    # --------------------------------------------------------

    candidate_projected = (
        candidate_roads.to_crs(
            metric_crs
        )
    )

    # --------------------------------------------------------
    # Nearest road.
    # --------------------------------------------------------

    distances = (
        candidate_projected.geometry
        .distance(
            point_projected
        )
    )

    nearest_position = (
        distances.idxmin()
    )

    nearest_distance = float(
        distances.loc[
            nearest_position
        ]
    )

    if highway_column is not None:
        raw_class = (
            candidate_roads.loc[
                nearest_position,
                highway_column,
            ]
        )
    else:
        raw_class = None

    nearest_class = classify_road(
        raw_class
    )

    importance = road_importance_score(
        nearest_class
    )

    # --------------------------------------------------------
    # TRUE metric buffers.
    # --------------------------------------------------------

    buffer_1km = (
        point_projected.buffer(
            DENSITY_RADIUS_1KM
        )
    )

    buffer_5km = (
        point_projected.buffer(
            DENSITY_RADIUS_5KM
        )
    )

    # --------------------------------------------------------
    # Identify roads intersecting each buffer.
    # --------------------------------------------------------

    intersects_1km = (
        candidate_projected.geometry
        .intersects(
            buffer_1km
        )
    )

    intersects_5km = (
        candidate_projected.geometry
        .intersects(
            buffer_5km
        )
    )

    roads_1km = (
        candidate_projected.loc[
            intersects_1km
        ]
    )

    roads_5km = (
        candidate_projected.loc[
            intersects_5km
        ]
    )

    # --------------------------------------------------------
    # Clip each road geometry to the actual circular
    # buffer BEFORE measuring its length.
    #
    # This prevents full road segments outside the
    # radius from being counted.
    # --------------------------------------------------------

    clipped_1km = (
        roads_1km.geometry
        .intersection(
            buffer_1km
        )
    )

    clipped_5km = (
        roads_5km.geometry
        .intersection(
            buffer_5km
        )
    )

    road_length_1km = float(
        clipped_1km.length.sum()
    )

    road_length_5km = float(
        clipped_5km.length.sum()
    )

    # --------------------------------------------------------
    # Road density.
    #
    # Circle area:
    #     pi * r^2
    #
    # Density unit:
    #     km of road / km²
    # --------------------------------------------------------

    area_1km_km2 = (
        math.pi
        * (
            DENSITY_RADIUS_1KM
            / 1000.0
        ) ** 2
    )

    area_5km_km2 = (
        math.pi
        * (
            DENSITY_RADIUS_5KM
            / 1000.0
        ) ** 2
    )

    road_density_1km = (
        (
            road_length_1km
            / 1000.0
        )
        / area_1km_km2
    )

    road_density_5km = (
        (
            road_length_5km
            / 1000.0
        )
        / area_5km_km2
    )

    return {
        "distance_to_road_m": round(
            nearest_distance,
            2,
        ),
        "nearest_road_class": (
            nearest_class
        ),
        "nearest_road_importance": round(
            importance,
            3,
        ),
        "road_length_1km_m": round(
            road_length_1km,
            2,
        ),
        "road_length_5km_m": round(
            road_length_5km,
            2,
        ),
        "road_density_1km_km_per_km2": round(
            road_density_1km,
            4,
        ),
        "road_density_5km_km_per_km2": round(
            road_density_5km,
            4,
        ),
        "road_count_1km": int(
            len(
                roads_1km
            )
        ),
        "road_count_5km": int(
            len(
                roads_5km
            )
        ),
        "metric_crs": metric_crs.to_string(),
    }


# ============================================================
# Process records
# ============================================================

def process_records(
    records: list[dict[str, Any]],
    roads: gpd.GeoDataFrame,
    highway_column: str | None,
) -> tuple[
    list[dict[str, Any]],
    dict[str, int],
]:

    output_records: list[
        dict[str, Any]
    ] = []

    counters = {
        "total": len(records),
        "processed": 0,
        "missing_coordinates": 0,
        "no_nearby_roads": 0,
    }

    for index, record in enumerate(
        records,
        start=1,
    ):

        sample_id = (
            record.get(
                "sample_id"
            )
            or record.get(
                "id"
            )
            or f"RECORD_{index:04d}"
        )

        latitude = record.get(
            "latitude"
        )

        longitude = record.get(
            "longitude"
        )

        print(
            f"[{index}/{len(records)}] "
            f"{sample_id}"
        )

        enriched = dict(
            record
        )

        if (
            latitude is None
            or longitude is None
        ):

            enriched.update(
                {
                    "distance_to_road_m": None,
                    "nearest_road_class": "NONE",
                    "nearest_road_importance": 0.0,
                    "road_length_1km_m": None,
                    "road_length_5km_m": None,
                    "road_density_1km_km_per_km2": None,
                    "road_density_5km_km_per_km2": None,
                    "road_count_1km": 0,
                    "road_count_5km": 0,
                    "road_feature_status": (
                        "MISSING_COORDINATES"
                    ),
                }
            )

            counters[
                "missing_coordinates"
            ] += 1

            output_records.append(
                enriched
            )

            continue

        try:
            latitude_value = float(
                latitude
            )

            longitude_value = float(
                longitude
            )

        except (
            TypeError,
            ValueError,
        ):

            enriched.update(
                {
                    "distance_to_road_m": None,
                    "nearest_road_class": "NONE",
                    "nearest_road_importance": 0.0,
                    "road_length_1km_m": None,
                    "road_length_5km_m": None,
                    "road_density_1km_km_per_km2": None,
                    "road_density_5km_km_per_km2": None,
                    "road_count_1km": 0,
                    "road_count_5km": 0,
                    "road_feature_status": (
                        "INVALID_COORDINATES"
                    ),
                }
            )

            counters[
                "missing_coordinates"
            ] += 1

            output_records.append(
                enriched
            )

            continue

        metrics = local_road_metrics(
            roads=roads,
            latitude=latitude_value,
            longitude=longitude_value,
            highway_column=highway_column,
        )

        enriched.update(
            metrics
        )

        if (
            metrics[
                "distance_to_road_m"
            ]
            is None
        ):

            enriched[
                "road_feature_status"
            ] = "NO_NEARBY_ROAD"

            counters[
                "no_nearby_roads"
            ] += 1

        else:

            enriched[
                "road_feature_status"
            ] = "REAL_OSM_ROAD_FEATURES"

        counters[
            "processed"
        ] += 1

        print(
            "  "
            f"nearest="
            f"{metrics['distance_to_road_m']}m | "
            f"class="
            f"{metrics['nearest_road_class']} | "
            f"importance="
            f"{metrics['nearest_road_importance']} | "
            f"1km_length="
            f"{metrics['road_length_1km_m']}m | "
            f"1km_density="
            f"{metrics['road_density_1km_km_per_km2']} "
            f"km/km²"
        )

        print(
            "  "
            f"5km_length="
            f"{metrics['road_length_5km_m']}m | "
            f"5km_density="
            f"{metrics['road_density_5km_km_per_km2']} "
            f"km/km²"
        )

        output_records.append(
            enriched
        )

    return (
        output_records,
        counters,
    )


# ============================================================
# Main pipeline
# ============================================================

def run() -> dict[str, Any]:

    print(
        "\nBhooPehra - Road Spatial "
        "Feature Engineering"
    )

    print(
        "Metric calculation:"
    )

    print(
        "Local Azimuthal Equidistant projection "
        "centered on every sample."
    )

    payload = (
        load_training_dataset()
    )

    records = payload[
        "records"
    ]

    print(
        f"Training records: "
        f"{len(records)}"
    )

    # --------------------------------------------------------
    # Road dataset
    # --------------------------------------------------------

    gpkg_path = (
        download_road_dataset()
    )

    # --------------------------------------------------------
    # Road layer
    # --------------------------------------------------------

    road_layer = (
        discover_road_layer(
            gpkg_path
        )
    )

    # --------------------------------------------------------
    # Load roads
    # --------------------------------------------------------

    roads = load_roads(
        gpkg_path,
        road_layer,
    )

    highway_column = (
        find_highway_column(
            roads
        )
    )

    print(
        "Road classification column: "
        f"{highway_column}"
    )

    # --------------------------------------------------------
    # Process
    # --------------------------------------------------------

    (
        output_records,
        counters,
    ) = process_records(
        records,
        roads,
        highway_column,
    )

    # --------------------------------------------------------
    # Build output dataset
    # --------------------------------------------------------

    result = dict(
        payload
    )

    result[
        "dataset"
    ] = (
        "BhooPehra GSI Terrain + "
        "Road Feature Dataset"
    )

    result[
        "road_features_status"
    ] = (
        "REAL_OSM_ROAD_FEATURES"
    )

    result[
        "road_source"
    ] = ROAD_SOURCE

    result[
        "road_source_url"
    ] = ROAD_SOURCE_URL

    result[
        "road_layer"
    ] = road_layer

    result[
        "road_features"
    ] = [
        "distance_to_road_m",
        "nearest_road_class",
        "nearest_road_importance",
        "road_length_1km_m",
        "road_length_5km_m",
        "road_density_1km_km_per_km2",
        "road_density_5km_km_per_km2",
        "road_count_1km",
        "road_count_5km",
    ]

    result[
        "records"
    ] = output_records

    result[
        "database_modified"
    ] = False

    # --------------------------------------------------------
    # Quality report
    # --------------------------------------------------------

    quality = {
        "status": "success",
        "input_dataset": str(
            INPUT_DATASET
        ),
        "output_dataset": str(
            OUTPUT_DATASET
        ),
        "road_source": ROAD_SOURCE,
        "road_source_url": ROAD_SOURCE_URL,
        "road_layer": road_layer,
        "road_classification_column": (
            highway_column
        ),
        "road_feature_count": int(
            len(roads)
        ),
        "counters": counters,
        "feature_definitions": {
            "distance_to_road_m": (
                "Metric distance from the sample "
                "point to the nearest mapped road."
            ),
            "nearest_road_class": (
                "Class inferred from the OSM "
                "road classification attribute."
            ),
            "nearest_road_importance": (
                "Transparent normalized importance "
                "score based on road class."
            ),
            "road_length_1km_m": (
                "Mapped road length actually "
                "inside a 1 km circular buffer "
                "around the sample."
            ),
            "road_length_5km_m": (
                "Mapped road length actually "
                "inside a 5 km circular buffer "
                "around the sample."
            ),
            "road_density_1km_km_per_km2": (
                "Road length in kilometres divided "
                "by the area of the 1 km radius "
                "circle in square kilometres."
            ),
            "road_density_5km_km_per_km2": (
                "Road length in kilometres divided "
                "by the area of the 5 km radius "
                "circle in square kilometres."
            ),
            "road_count_1km": (
                "Number of mapped road geometries "
                "intersecting the 1 km circular buffer."
            ),
            "road_count_5km": (
                "Number of mapped road geometries "
                "intersecting the 5 km circular buffer."
            ),
        },
        "scientific_notes": [
            (
                "Road features are derived from "
                "current OpenStreetMap road geometry "
                "rather than hardcoded values."
            ),
            (
                "Geographic coordinates are converted "
                "to a local Azimuthal Equidistant metric "
                "projection centered on each sample."
            ),
            (
                "Road lengths are measured only after "
                "clipping road geometries to the actual "
                "circular search buffer."
            ),
            (
                "Road density is reported as kilometres "
                "of mapped road per square kilometre."
            ),
            (
                "OSM road coverage is not equivalent "
                "to an official government road inventory; "
                "coverage and classification can vary."
            ),
            (
                "Road proximity should be treated as "
                "a predictor of exposure/anthropogenic "
                "terrain modification, not as proof of "
                "landslide causation."
            ),
        ],
        "database_modified": False,
    }

    # --------------------------------------------------------
    # Save
    # --------------------------------------------------------

    write_json(
        OUTPUT_DATASET,
        result,
    )

    write_json(
        QUALITY_REPORT,
        quality,
    )

    # --------------------------------------------------------
    # Final report
    # --------------------------------------------------------

    print(
        "\nBhooPehra - Road Feature Report"
    )

    print(
        f"Total records: "
        f"{counters['total']}"
    )

    print(
        f"Processed: "
        f"{counters['processed']}"
    )

    print(
        f"Missing coordinates: "
        f"{counters['missing_coordinates']}"
    )

    print(
        f"No nearby roads: "
        f"{counters['no_nearby_roads']}"
    )

    print(
        f"Road geometries used: "
        f"{len(roads):,}"
    )

    print(
        "\nCalculation:"
    )

    print(
        "1 km / 5 km buffers = true metric "
        "circular buffers."
    )

    print(
        "Road length = clipped geometry length."
    )

    print(
        "Road density = km road / km²."
    )

    print(
        "\nRoad feature dataset:"
    )

    print(
        OUTPUT_DATASET
    )

    print(
        "\nQuality report:"
    )

    print(
        QUALITY_REPORT
    )

    print(
        "\nDatabase was not modified."
    )

    return quality


if __name__ == "__main__":
    run()