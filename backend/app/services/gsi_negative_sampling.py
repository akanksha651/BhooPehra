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

from app.db.database import SessionLocal
from app.services.gsi_event_clustering import haversine_km
from app.services.gsi_training_dataset import load_gsi_events


BASE_DIR = Path(__file__).resolve().parents[2]
OUTPUT_DIR = BASE_DIR / "data" / "gsi"

NEGATIVE_DATASET_FILE = OUTPUT_DIR / "gsi_training_negative_candidates.json"
QUALITY_REPORT_FILE = OUTPUT_DIR / "gsi_negative_sampling_quality.json"
BOUNDARY_FILE = OUTPUT_DIR / "india_states_2019.geojson"

BOUNDARY_URL = (
    "https://raw.githubusercontent.com/"
    "india-in-data/india-states-2019/master/india_states.geojson"
)

SEED = 26001
MIN_DISTANCE_FROM_EVENT_KM = 10.0
MIN_DISTANCE_FROM_CLUSTER_KM = 10.0
MIN_DISTANCE_BETWEEN_NEGATIVES_KM = 5.0
NEGATIVE_TO_POSITIVE_RATIO = 1.0
MAX_CANDIDATES = 20000

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


def save_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as file:
        json.dump(
            payload,
            file,
            indent=2,
            ensure_ascii=False,
            default=str,
        )


def load_northeast_boundaries() -> gpd.GeoDataFrame:
    """
    Load provisional Northeast India state boundaries.

    Source:
    india-in-data/india-states-2019

    This is a community-maintained 2019 boundary dataset.
    It is NOT treated as an official 2026 administrative source.
    """

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not BOUNDARY_FILE.exists():
        response = requests.get(
            BOUNDARY_URL,
            timeout=60,
            headers={
                "User-Agent": "BhooPehra/0.1",
            },
        )
        response.raise_for_status()
        BOUNDARY_FILE.write_bytes(response.content)

    boundaries = gpd.read_file(BOUNDARY_FILE)

    if boundaries.empty:
        raise RuntimeError("Boundary dataset is empty.")

    state_column = None

    preferred_columns = [
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

    for column in preferred_columns:
        if column in boundaries.columns:
            state_column = column
            break

    if state_column is None:
        raise RuntimeError(
            "Could not identify state-name column in boundary dataset. "
            f"Available columns: {list(boundaries.columns)}"
        )

    boundaries = boundaries.rename(columns={state_column: "state"})

    boundaries["state"] = (
        boundaries["state"]
        .astype(str)
        .str.strip()
    )

    boundaries = boundaries[
        boundaries["state"].isin(NORTHEAST_STATES)
    ].copy()

    if boundaries.empty:
        raise RuntimeError(
            "No Northeast states found in boundary dataset. "
            f"Available states: {sorted(boundaries['state'].unique())}"
        )

    if boundaries.crs is None:
        boundaries = boundaries.set_crs("EPSG:4326")

    boundaries = boundaries.to_crs("EPSG:4326")

    boundaries["geometry"] = boundaries.geometry.make_valid()

    boundaries = boundaries[
        boundaries.geometry.notna()
        & ~boundaries.geometry.is_empty
    ].copy()

    boundaries = boundaries[["state", "geometry"]].reset_index(drop=True)

    return boundaries


def resolve_state_for_point(
    latitude: float,
    longitude: float,
    boundaries: gpd.GeoDataFrame,
) -> str | None:
    """
    Resolve a WGS84 point to one of the Northeast state polygons.
    """

    point = Point(float(longitude), float(latitude))

    for row in boundaries.itertuples(index=False):
        geometry = row.geometry

        if geometry.contains(point) or geometry.covers(point):
            return str(row.state)

    return None


def extract_positive_points(
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []

    for event in events:
        latitude = event.get("latitude")
        longitude = event.get("longitude")

        if latitude is None or longitude is None:
            continue

        try:
            latitude = float(latitude)
            longitude = float(longitude)
        except (TypeError, ValueError):
            continue

        if not (-90 <= latitude <= 90):
            continue

        if not (-180 <= longitude <= 180):
            continue

        points.append(
            {
                "event_id": event.get("id"),
                "source_record_id": event.get("source_record_id"),
                "latitude": latitude,
                "longitude": longitude,
                "state": event.get("state"),
                "district": event.get("district"),
            }
        )

    return points


def extract_cluster_points(
    cluster_analysis: dict[str, Any],
) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []

    clusters = cluster_analysis.get("clusters", [])

    for cluster in clusters:
        cluster_id = cluster.get("cluster_id")

        for event in cluster.get("events", []):
            latitude = event.get("latitude")
            longitude = event.get("longitude")

            if latitude is None or longitude is None:
                continue

            try:
                latitude = float(latitude)
                longitude = float(longitude)
            except (TypeError, ValueError):
                continue

            points.append(
                {
                    "cluster_id": cluster_id,
                    "latitude": latitude,
                    "longitude": longitude,
                }
            )

    return points


def calculate_sampling_extent(
    boundaries: gpd.GeoDataFrame,
) -> dict[str, float]:
    """
    Calculate a geographic sampling envelope around the complete
    Northeast state union.

    Candidate points are still required to fall inside the actual
    state polygons.
    """

    union_geometry = boundaries.geometry.union_all()

    min_x, min_y, max_x, max_y = union_geometry.bounds

    return {
        "min_lat": float(min_y),
        "max_lat": float(max_y),
        "min_lon": float(min_x),
        "max_lon": float(max_x),
    }


def point_is_far_from_positive_events(
    latitude: float,
    longitude: float,
    positive_points: list[dict[str, Any]],
    minimum_distance_km: float,
) -> tuple[bool, float | None, Any]:
    """
    Ensure candidate is sufficiently far from every positive event.

    Returns:
        accepted,
        nearest_distance_km,
        nearest_event_id
    """

    nearest_distance = math.inf
    nearest_event_id = None

    for point in positive_points:
        distance = haversine_km(
            latitude,
            longitude,
            point["latitude"],
            point["longitude"],
        )

        if distance < nearest_distance:
            nearest_distance = distance
            nearest_event_id = point.get("event_id")

        if distance < minimum_distance_km:
            return False, distance, point.get("event_id")

    if nearest_distance == math.inf:
        return True, None, None

    return True, nearest_distance, nearest_event_id


def point_is_far_from_clusters(
    latitude: float,
    longitude: float,
    cluster_points: list[dict[str, Any]],
    minimum_distance_km: float,
) -> tuple[bool, float | None, Any]:
    """
    Ensure candidate is sufficiently far from clustered historical events.
    """

    nearest_distance = math.inf
    nearest_cluster_id = None

    for point in cluster_points:
        distance = haversine_km(
            latitude,
            longitude,
            point["latitude"],
            point["longitude"],
        )

        if distance < nearest_distance:
            nearest_distance = distance
            nearest_cluster_id = point.get("cluster_id")

        if distance < minimum_distance_km:
            return False, distance, point.get("cluster_id")

    if nearest_distance == math.inf:
        return True, None, None

    return True, nearest_distance, nearest_cluster_id


def point_is_far_from_negative_samples(
    latitude: float,
    longitude: float,
    negative_points: list[dict[str, Any]],
    minimum_distance_km: float,
) -> bool:
    for point in negative_points:
        distance = haversine_km(
            latitude,
            longitude,
            point["latitude"],
            point["longitude"],
        )

        if distance < minimum_distance_km:
            return False

    return True


def generate_random_candidate(
    extent: dict[str, float],
    rng: random.Random,
) -> tuple[float, float]:
    latitude = rng.uniform(
        extent["min_lat"],
        extent["max_lat"],
    )

    longitude = rng.uniform(
        extent["min_lon"],
        extent["max_lon"],
    )

    return latitude, longitude


def generate_negative_candidates(
    positive_points: list[dict[str, Any]],
    cluster_analysis: dict[str, Any],
    target_count: int,
    boundaries: gpd.GeoDataFrame | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Generate spatial background candidates inside actual Northeast
    state polygons.

    Important:
    These are NOT confirmed non-landslide locations.
    They are background candidates sufficiently separated from
    known historical positive events.
    """

    if boundaries is None:
        boundaries = load_northeast_boundaries()

    extent = calculate_sampling_extent(boundaries)

    cluster_points = extract_cluster_points(cluster_analysis)

    rng = random.Random(SEED)

    negative_candidates: list[dict[str, Any]] = []

    attempts = 0
    outside_boundary = 0
    too_close_to_event = 0
    too_close_to_cluster = 0
    too_close_to_negative = 0

    while (
        len(negative_candidates) < target_count
        and attempts < MAX_CANDIDATES
    ):
        attempts += 1

        latitude, longitude = generate_random_candidate(
            extent,
            rng,
        )

        state = resolve_state_for_point(
            latitude,
            longitude,
            boundaries,
        )

        if state is None:
            outside_boundary += 1
            continue

        accepted, nearest_event_distance, nearest_event_id = (
            point_is_far_from_positive_events(
                latitude,
                longitude,
                positive_points,
                MIN_DISTANCE_FROM_EVENT_KM,
            )
        )

        if not accepted:
            too_close_to_event += 1
            continue

        accepted, nearest_cluster_distance, nearest_cluster_id = (
            point_is_far_from_clusters(
                latitude,
                longitude,
                cluster_points,
                MIN_DISTANCE_FROM_CLUSTER_KM,
            )
        )

        if not accepted:
            too_close_to_cluster += 1
            continue

        if not point_is_far_from_negative_samples(
            latitude,
            longitude,
            negative_candidates,
            MIN_DISTANCE_BETWEEN_NEGATIVES_KM,
        ):
            too_close_to_negative += 1
            continue

        sample_number = len(negative_candidates) + 1

        negative_candidates.append(
            {
                "sample_id": f"NEG-{sample_number:04d}",
                "label": 0,
                "label_name": "BACKGROUND_CANDIDATE",
                "sample_type": "SPATIAL_BACKGROUND",
                "latitude": round(latitude, 7),
                "longitude": round(longitude, 7),
                "state": state,
                "state_boundary_source": BOUNDARY_URL,
                "state_boundary_status": "PROVISIONAL_2019",
                "nearest_positive_event_id": nearest_event_id,
                "nearest_positive_distance_km": (
                    round(nearest_event_distance, 3)
                    if nearest_event_distance is not None
                    else None
                ),
                "nearest_cluster_id": nearest_cluster_id,
                "nearest_cluster_distance_km": (
                    round(nearest_cluster_distance, 3)
                    if nearest_cluster_distance is not None
                    else None
                ),
                "source": "BhooPehra_BACKGROUND_SAMPLER",
                "sampling_seed": SEED,
                "sampling_status": "UNVERIFIED_BACKGROUND",
            }
        )

    state_counts: dict[str, int] = {}

    for record in negative_candidates:
        state = record["state"]
        state_counts[state] = state_counts.get(state, 0) + 1

    diagnostics = {
        "target_count": target_count,
        "generated_count": len(negative_candidates),
        "attempts": attempts,
        "max_candidates": MAX_CANDIDATES,
        "acceptance_rate": (
            round(len(negative_candidates) / attempts, 4)
            if attempts
            else 0.0
        ),
        "rejections": {
            "outside_northeast_boundary": outside_boundary,
            "too_close_to_positive_event": too_close_to_event,
            "too_close_to_cluster": too_close_to_cluster,
            "too_close_to_other_negative": too_close_to_negative,
        },
        "state_counts": state_counts,
        "sampling_extent": extent,
        "minimum_distance_from_event_km": MIN_DISTANCE_FROM_EVENT_KM,
        "minimum_distance_from_cluster_km": MIN_DISTANCE_FROM_CLUSTER_KM,
        "minimum_distance_between_negatives_km": (
            MIN_DISTANCE_BETWEEN_NEGATIVES_KM
        ),
        "boundary_source": BOUNDARY_URL,
        "boundary_status": "PROVISIONAL_2019",
    }

    return negative_candidates, diagnostics


def build_quality_report(
    positive_points: list[dict[str, Any]],
    negative_candidates: list[dict[str, Any]],
    diagnostics: dict[str, Any],
    cluster_analysis: dict[str, Any],
) -> dict[str, Any]:
    states = sorted(
        {
            record.get("state")
            for record in negative_candidates
            if record.get("state")
        }
    )

    missing_state_records = [
        record.get("sample_id")
        for record in negative_candidates
        if not record.get("state")
    ]

    return {
        "dataset": "BhooPehra GSI Negative Sampling Quality",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "positive_spatial_events": len(positive_points),
        "negative_background_candidates": len(negative_candidates),
        "positive_to_negative_ratio": (
            len(negative_candidates) / len(positive_points)
            if positive_points
            else None
        ),
        "states_present_in_background": states,
        "missing_state_count": len(missing_state_records),
        "missing_state_sample_ids": missing_state_records,
        "boundary": {
            "source": BOUNDARY_URL,
            "status": "PROVISIONAL_2019",
            "official_2026_boundary_verified": False,
            "northeast_states": sorted(NORTHEAST_STATES),
        },
        "sampling": diagnostics,
        "cluster_summary": {
            "total_clusters": cluster_analysis.get(
                "total_clusters"
            ),
            "multi_event_clusters": cluster_analysis.get(
                "multi_event_clusters"
            ),
            "singleton_clusters": cluster_analysis.get(
                "singleton_clusters"
            ),
        },
        "training_warning": (
            "BACKGROUND_CANDIDATE does not mean confirmed absence "
            "of landslides. Candidates are spatially separated from "
            "known positive events and require downstream validation."
        ),
        "feature_pipeline_note": (
            "State labels are now attached to background candidates "
            "so state-specific LULC extraction can be performed."
        ),
    }


def run_gsi_negative_sampling(
    db: Session,
    negative_to_positive_ratio: float = NEGATIVE_TO_POSITIVE_RATIO,
) -> dict[str, Any]:
    """
    Read-only negative/background sampling pipeline.

    Existing database records are never modified.
    """

    if negative_to_positive_ratio <= 0:
        raise ValueError(
            "negative_to_positive_ratio must be greater than zero."
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    events = load_gsi_events(db)

    positive_points = extract_positive_points(events)

    if not positive_points:
        raise RuntimeError(
            "No spatial GSI positive events available for "
            "negative sampling."
        )

    from app.services.gsi_event_clustering import (
        analyze_gsi_event_clusters,
    )

    cluster_analysis = analyze_gsi_event_clusters(db)

    target_count = max(
        1,
        round(
            len(positive_points)
            * negative_to_positive_ratio
        ),
    )

    boundaries = load_northeast_boundaries()

    negative_candidates, diagnostics = generate_negative_candidates(
        positive_points=positive_points,
        cluster_analysis=cluster_analysis,
        target_count=target_count,
        boundaries=boundaries,
    )

    quality_report = build_quality_report(
        positive_points=positive_points,
        negative_candidates=negative_candidates,
        diagnostics=diagnostics,
        cluster_analysis=cluster_analysis,
    )

    dataset_payload = {
        "dataset": "BhooPehra GSI Background Candidates",
        "version": "0.2",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "database_operation": "READ_ONLY",
        "boundary_source": BOUNDARY_URL,
        "boundary_status": "PROVISIONAL_2019",
        "label_definition": {
            "label": 0,
            "label_name": "BACKGROUND_CANDIDATE",
            "meaning": (
                "Spatially sampled candidate inside Northeast state "
                "boundaries and separated from known GSI positive "
                "events. Not confirmed non-landslide."
            ),
        },
        "sampling": diagnostics,
        "records": negative_candidates,
    }

    save_json(
        NEGATIVE_DATASET_FILE,
        dataset_payload,
    )

    save_json(
        QUALITY_REPORT_FILE,
        quality_report,
    )

    return {
        "status": "success",
        "source": "GSI historical spatial events",
        "database_operation": "READ_ONLY",
        "positive_spatial_events": len(positive_points),
        "target_negative_candidates": target_count,
        "negative_candidates": len(negative_candidates),
        "boundary_source": BOUNDARY_URL,
        "boundary_status": "PROVISIONAL_2019",
        "state_counts": diagnostics["state_counts"],
        "dataset_file": str(
            NEGATIVE_DATASET_FILE.relative_to(BASE_DIR)
        ),
        "quality_report_file": str(
            QUALITY_REPORT_FILE.relative_to(BASE_DIR)
        ),
        "quality_report": quality_report,
    }


def print_negative_sampling_report(
    result: dict[str, Any],
) -> None:
    print()
    print("=" * 72)
    print("BhooPehra - GSI Negative / Background Sampling")
    print("=" * 72)

    print(
        f"Positive spatial events: "
        f"{result.get('positive_spatial_events')}"
    )

    print(
        f"Target background candidates: "
        f"{result.get('target_negative_candidates')}"
    )

    print(
        f"Generated background candidates: "
        f"{result.get('negative_candidates')}"
    )

    print()
    print("STATE DISTRIBUTION")

    for state, count in sorted(
        result.get("state_counts", {}).items()
    ):
        print(f"  {state}: {count}")

    print()
    print("BOUNDARY")

    print(
        f"  Source: {result.get('boundary_source')}"
    )

    print(
        f"  Status: {result.get('boundary_status')}"
    )

    print()
    print("OUTPUT")

    print(
        f"  Dataset: {result.get('dataset_file')}"
    )

    print(
        f"  Quality: {result.get('quality_report_file')}"
    )

    print()
    print(
        "WARNING: Background candidates are NOT confirmed "
        "non-landslide locations."
    )

    print("=" * 72)
    print()


if __name__ == "__main__":
    db = SessionLocal()

    try:
        result = run_gsi_negative_sampling(db)
        print_negative_sampling_report(result)
    finally:
        db.close()