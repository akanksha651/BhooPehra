from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.landslide_event import LandslideEvent
from app.models.rainfall_observation import RainfallObservation


OUTPUT_DIR = Path("data/gsi")

INPUT_DATASET = (
    OUTPUT_DIR / "gsi_training_spatial_validated.json"
)

OUTPUT_DATASET = (
    OUTPUT_DIR / "gsi_training_feature_dataset.json"
)

QUALITY_REPORT = (
    OUTPUT_DIR / "gsi_training_feature_quality.json"
)

ELEVATION_API = (
    "https://api.open-meteo.com/v1/elevation"
)

REQUEST_TIMEOUT = 30

# Historical density radius.
HISTORICAL_RADIUS_KM = 10.0


def load_json(
    path: Path,
) -> Any:

    if not path.exists():
        raise FileNotFoundError(
            f"Required dataset not found: {path}"
        )

    return json.loads(
        path.read_text(
            encoding="utf-8"
        )
    )


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


def haversine_km(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:

    earth_radius_km = 6371.0088

    lat1_rad = math.radians(
        lat1
    )

    lat2_rad = math.radians(
        lat2
    )

    delta_lat = math.radians(
        lat2 - lat1
    )

    delta_lon = math.radians(
        lon2 - lon1
    )

    a = (
        math.sin(delta_lat / 2) ** 2
        +
        math.cos(lat1_rad)
        * math.cos(lat2_rad)
        * math.sin(delta_lon / 2) ** 2
    )

    return (
        2
        * earth_radius_km
        * math.asin(
            math.sqrt(a)
        )
    )


def extract_records(
    payload: dict[str, Any],
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
]:

    positives = payload.get(
        "positive_candidates",
        [],
    )

    backgrounds = payload.get(
        "background_candidates",
        [],
    )

    return (
        [
            item
            for item in positives
            if isinstance(
                item,
                dict,
            )
        ],
        [
            item
            for item in backgrounds
            if isinstance(
                item,
                dict,
            )
        ],
    )


def load_gsi_spatial_events(
    db: Session,
) -> list[dict[str, Any]]:

    statement = (
        select(LandslideEvent)
        .where(
            LandslideEvent.latitude.is_not(None),
            LandslideEvent.longitude.is_not(None),
        )
        .order_by(
            LandslideEvent.id.asc()
        )
    )

    events = db.scalars(
        statement
    ).all()

    return [
        {
            "id": event.id,
            "source_record_id": (
                event.source_record_id
            ),
            "source": event.source,
            "state": event.state,
            "district": event.district,
            "slide_name": event.slide_name,
            "occurrence_date": (
                event.occurrence_date.isoformat()
                if event.occurrence_date
                else None
            ),
            "latitude": float(
                event.latitude
            ),
            "longitude": float(
                event.longitude
            ),
        }
        for event in events
    ]


def fetch_elevations(
    records: list[dict[str, Any]],
) -> dict[str, float | None]:

    valid_records = [
        record
        for record in records
        if record.get("latitude") is not None
        and record.get("longitude") is not None
    ]

    result: dict[
        str,
        float | None,
    ] = {}

    # Open-Meteo accepts up to 100 coordinates per request.
    for start in range(
        0,
        len(valid_records),
        100,
    ):

        batch = valid_records[
            start:start + 100
        ]

        latitudes = ",".join(
            str(
                float(
                    record["latitude"]
                )
            )
            for record in batch
        )

        longitudes = ",".join(
            str(
                float(
                    record["longitude"]
                )
            )
            for record in batch
        )

        response = requests.get(
            ELEVATION_API,
            params={
                "latitude": latitudes,
                "longitude": longitudes,
            },
            timeout=REQUEST_TIMEOUT,
        )

        response.raise_for_status()

        payload = response.json()

        elevations = payload.get(
            "elevation",
            [],
        )

        if len(elevations) != len(batch):
            raise RuntimeError(
                "Elevation API returned an unexpected "
                "number of values."
            )

        for record, elevation in zip(
            batch,
            elevations,
        ):

            sample_id = str(
                record.get(
                    "sample_id",
                    record.get(
                        "event_id",
                        "",
                    ),
                )
            )

            result[
                sample_id
            ] = (
                float(elevation)
                if elevation is not None
                else None
            )

    return result


def calculate_historical_features(
    latitude: float,
    longitude: float,
    events: list[dict[str, Any]],
) -> dict[str, Any]:

    distances = []

    for event in events:

        distance = haversine_km(
            latitude,
            longitude,
            event["latitude"],
            event["longitude"],
        )

        distances.append(
            (
                distance,
                event,
            )
        )

    distances.sort(
        key=lambda item: item[0]
    )

    nearby_events = [
        item
        for item in distances
        if item[0]
        <= HISTORICAL_RADIUS_KM
    ]

    nearest_distance = (
        distances[0][0]
        if distances
        else None
    )

    return {
        "historical_landslide_count": len(
            nearby_events
        ),
        "historical_landslide_density_10km": (
            len(nearby_events)
            / (
                math.pi
                * HISTORICAL_RADIUS_KM
                * HISTORICAL_RADIUS_KM
            )
        ),
        "nearest_landslide_distance_km": (
            round(
                nearest_distance,
                4,
            )
            if nearest_distance is not None
            else None
        ),
    }


def load_latest_rainfall_by_district(
    db: Session,
) -> dict[int, dict[str, Any]]:

    observations = db.scalars(
        select(
            RainfallObservation
        ).order_by(
            RainfallObservation.observed_at.desc()
        )
    ).all()

    latest: dict[
        int,
        dict[str, Any],
    ] = {}

    for observation in observations:

        district_id = observation.district_id

        if district_id is None:
            continue

        if district_id in latest:
            continue

        latest[
            district_id
        ] = {
            "observed_at": (
                observation.observed_at.isoformat()
                if observation.observed_at
                else None
            ),
            "rainfall_1h": (
                observation.rainfall_1h
            ),
            "rainfall_24h": (
                observation.rainfall_24h
            ),
            "rainfall_48h": (
                observation.rainfall_48h
            ),
            "rainfall_72h": (
                observation.rainfall_72h
            ),
            "antecedent_rainfall": (
                observation.antecedent_rainfall
            ),
            "soil_moisture": (
                observation.soil_moisture
            ),
            "trigger_level": (
                observation.trigger_level
            ),
            "source": observation.source,
        }

    return latest


def find_nearest_rainfall_observation(
    latitude: float,
    longitude: float,
    db: Session,
) -> dict[str, Any] | None:

    observations = db.scalars(
        select(
            RainfallObservation
        ).where(
            RainfallObservation.source_latitude.is_not(None),
            RainfallObservation.source_longitude.is_not(None),
        )
    ).all()

    if not observations:
        return None

    nearest = None
    nearest_distance = float(
        "inf"
    )

    for observation in observations:

        distance = haversine_km(
            latitude,
            longitude,
            float(
                observation.source_latitude
            ),
            float(
                observation.source_longitude
            ),
        )

        if distance < nearest_distance:

            nearest_distance = distance
            nearest = observation

    if nearest is None:
        return None

    return {
        "rainfall_observation_id": (
            nearest.id
        ),
        "rainfall_observation_distance_km": round(
            nearest_distance,
            4,
        ),
        "rainfall_observed_at": (
            nearest.observed_at.isoformat()
            if nearest.observed_at
            else None
        ),
        "rainfall_1h": nearest.rainfall_1h,
        "rainfall_24h": nearest.rainfall_24h,
        "rainfall_48h": nearest.rainfall_48h,
        "rainfall_72h": nearest.rainfall_72h,
        "antecedent_rainfall": (
            nearest.antecedent_rainfall
        ),
        "soil_moisture": (
            nearest.soil_moisture
        ),
        "rainfall_trigger": (
            nearest.trigger_level
        ),
        "weather_source": (
            nearest.source
        ),
    }


def build_feature_record(
    record: dict[str, Any],
    elevation: float | None,
    historical_features: dict[str, Any],
    rainfall_features: dict[str, Any] | None,
) -> dict[str, Any]:

    latitude = float(
        record["latitude"]
    )

    longitude = float(
        record["longitude"]
    )

    feature_record = {
        "sample_id": record.get(
            "sample_id"
        ),
        "event_id": record.get(
            "event_id"
        ),
        "label": record.get(
            "label"
        ),
        "label_name": record.get(
            "label_name"
        ),
        "sample_type": record.get(
            "sample_type"
        ),
        "latitude": latitude,
        "longitude": longitude,
        "state": record.get(
            "state"
        ),
        "district": record.get(
            "district"
        ),
        "occurrence_date": record.get(
            "occurrence_date"
        ),
        "elevation_m": elevation,
        **historical_features,
    }

    if rainfall_features:

        feature_record.update(
            rainfall_features
        )

    else:

        feature_record.update(
            {
                "rainfall_observation_id": None,
                "rainfall_observation_distance_km": None,
                "rainfall_observed_at": None,
                "rainfall_1h": None,
                "rainfall_24h": None,
                "rainfall_48h": None,
                "rainfall_72h": None,
                "antecedent_rainfall": None,
                "soil_moisture": None,
                "rainfall_trigger": None,
                "weather_source": None,
            }
        )

    # Explicit provenance flags.
    feature_record[
        "elevation_source"
    ] = "Copernicus GLO-90 via Open-Meteo Elevation API"

    feature_record[
        "historical_source"
    ] = "GSI spatial landslide inventory in BhooPehra DB"

    feature_record[
        "rainfall_source"
    ] = rainfall_features.get(
        "weather_source"
    ) if rainfall_features else None

    feature_record[
        "features_status"
    ] = "PARTIAL_REAL_FEATURE_SET"

    return feature_record


def run_feature_builder(
    db: Session,
) -> dict[str, Any]:

    print()
    print(
        "BhooPehra - GSI Feature Engineering"
    )
    print(
        "=" * 72
    )

    payload = load_json(
        INPUT_DATASET
    )

    positive_records, background_records = (
        extract_records(
            payload
        )
    )

    records = (
        positive_records
        + background_records
    )

    print(
        f"Positive records: "
        f"{len(positive_records)}"
    )

    print(
        f"Background records: "
        f"{len(background_records)}"
    )

    print(
        f"Total feature records: "
        f"{len(records)}"
    )

    gsi_events = load_gsi_spatial_events(
        db
    )

    print(
        f"GSI spatial events available: "
        f"{len(gsi_events)}"
    )

    print()
    print(
        "Fetching real elevation values..."
    )

    elevations = fetch_elevations(
        records
    )

    print(
        f"Elevation values received: "
        f"{len(elevations)}"
    )

    print()
    print(
        "Attaching historical landslide features..."
    )

    feature_records = []

    rainfall_success = 0

    elevation_success = 0

    for index, record in enumerate(
        records,
        start=1,
    ):

        sample_id = str(
            record.get(
                "sample_id",
                record.get(
                    "event_id",
                    "",
                ),
            )
        )

        latitude = float(
            record["latitude"]
        )

        longitude = float(
            record["longitude"]
        )

        elevation = elevations.get(
            sample_id
        )

        if elevation is not None:
            elevation_success += 1

        historical_features = (
            calculate_historical_features(
                latitude,
                longitude,
                gsi_events,
            )
        )

        rainfall_features = (
            find_nearest_rainfall_observation(
                latitude,
                longitude,
                db,
            )
        )

        if rainfall_features:
            rainfall_success += 1

        feature_record = build_feature_record(
            record=record,
            elevation=elevation,
            historical_features=historical_features,
            rainfall_features=rainfall_features,
        )

        feature_records.append(
            feature_record
        )

        print(
            f"[{index}/{len(records)}] "
            f"{sample_id} | "
            f"elevation={elevation} | "
            f"historical={historical_features['historical_landslide_count']} | "
            f"rainfall={'YES' if rainfall_features else 'NO'}"
        )

    quality_report = {
        "generated_at_utc": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),
        "input_file": str(
            INPUT_DATASET
        ),
        "output_file": str(
            OUTPUT_DATASET
        ),
        "records": {
            "total": len(
                feature_records
            ),
            "positive": len(
                positive_records
            ),
            "background": len(
                background_records
            ),
        },
        "feature_coverage": {
            "elevation_available": (
                elevation_success
            ),
            "rainfall_available": (
                rainfall_success
            ),
            "historical_inventory_available": (
                len(gsi_events) > 0
            ),
        },
        "features": {
            "real": [
                "elevation_m",
                "historical_landslide_count",
                "historical_landslide_density_10km",
                "nearest_landslide_distance_km",
                "rainfall_1h",
                "rainfall_24h",
                "rainfall_48h",
                "rainfall_72h",
                "antecedent_rainfall",
                "soil_moisture",
                "rainfall_trigger",
            ],
            "not_yet_attached": [
                "slope",
                "aspect",
                "curvature",
                "geology",
                "land_cover",
                "distance_to_road",
                "road_importance",
            ],
        },
        "warnings": [
            (
                "This dataset is not ready for final ML training."
            ),
            (
                "Background labels remain unverified."
            ),
            (
                "Slope/aspect require an actual DEM raster "
                "rather than a single-point elevation lookup."
            ),
            (
                "Geology and land-cover require spatial source "
                "layers before attachment."
            ),
        ],
    }

    output_payload = {
        "dataset": (
            "BhooPehra GSI Feature Dataset"
        ),
        "version": "0.1",
        "generated_at_utc": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),
        "feature_records": feature_records,
    }

    save_json(
        OUTPUT_DATASET,
        output_payload,
    )

    save_json(
        QUALITY_REPORT,
        quality_report,
    )

    return {
        "status": "success",
        "total_records": len(
            feature_records
        ),
        "positive_records": len(
            positive_records
        ),
        "background_records": len(
            background_records
        ),
        "elevation_available": (
            elevation_success
        ),
        "rainfall_available": (
            rainfall_success
        ),
        "historical_events_used": len(
            gsi_events
        ),
        "output_file": str(
            OUTPUT_DATASET
        ),
        "quality_report": str(
            QUALITY_REPORT
        ),
    }


def print_feature_builder_report(
    result: dict[str, Any],
) -> None:

    print()
    print(
        "=" * 72
    )

    print(
        "BhooPehra - Feature Engineering Report"
    )

    print(
        "=" * 72
    )

    print(
        f"Total records: "
        f"{result['total_records']}"
    )

    print(
        f"Positive records: "
        f"{result['positive_records']}"
    )

    print(
        f"Background records: "
        f"{result['background_records']}"
    )

    print(
        f"Elevation available: "
        f"{result['elevation_available']}"
    )

    print(
        f"Rainfall available: "
        f"{result['rainfall_available']}"
    )

    print(
        f"Historical GSI events used: "
        f"{result['historical_events_used']}"
    )

    print()
    print(
        "Feature dataset:"
    )

    print(
        f"  {result['output_file']}"
    )

    print()
    print(
        "Quality report:"
    )

    print(
        f"  {result['quality_report']}"
    )

    print()
    print(
        "IMPORTANT:"
    )

    print(
        "  These are real features, but the dataset is "
        "NOT ready for final ML training yet."
    )

    print(
        "  Slope/aspect/geology/land-cover/roads remain "
        "to be attached from actual spatial layers."
    )

    print(
        "=" * 72
    )