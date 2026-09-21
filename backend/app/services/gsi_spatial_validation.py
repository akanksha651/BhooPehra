from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.services.gsi_training_dataset import load_gsi_events


OUTPUT_DIR = Path("data/gsi")

POSITIVE_FILE = OUTPUT_DIR / "gsi_training_positive_candidates.json"
NEGATIVE_FILE = OUTPUT_DIR / "gsi_training_negative_candidates.json"

VALIDATED_NEGATIVE_FILE = (
    OUTPUT_DIR / "gsi_training_negative_validated.json"
)

VALIDATED_DATASET_FILE = (
    OUTPUT_DIR / "gsi_training_spatial_validated.json"
)

QUALITY_REPORT_FILE = (
    OUTPUT_DIR / "gsi_spatial_validation_quality.json"
)


# ------------------------------------------------------------------
# PROVISIONAL NORTHEAST SAMPLING ENVELOPE
# ------------------------------------------------------------------
#
# This is intentionally NOT represented as an official administrative
# boundary. It is only a geographic screening envelope used to prevent
# obviously out-of-region background points from entering the dataset.
#
# Official state polygons should replace this before final ML training.
#
NORTHEAST_ENVELOPE = {
    "min_latitude": 21.5,
    "max_latitude": 29.8,
    "min_longitude": 88.0,
    "max_longitude": 97.5,
}


NORTHEAST_STATES = {
    "ARUNACHAL PRADESH",
    "ASSAM",
    "MANIPUR",
    "MEGHALAYA",
    "MIZORAM",
    "NAGALAND",
    "SIKKIM",
    "TRIPURA",
}


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


def load_json(
    path: Path,
) -> Any:

    if not path.exists():

        raise FileNotFoundError(
            f"Required file not found: {path}"
        )

    return json.loads(
        path.read_text(
            encoding="utf-8",
        )
    )


def extract_records(
    payload: Any,
) -> list[dict[str, Any]]:

    if isinstance(
        payload,
        list,
    ):

        return [
            item
            for item in payload
            if isinstance(
                item,
                dict,
            )
        ]

    if not isinstance(
        payload,
        dict,
    ):

        return []

    records = payload.get(
        "records"
    )

    if isinstance(
        records,
        list,
    ):

        return [
            item
            for item in records
            if isinstance(
                item,
                dict,
            )
        ]

    data = payload.get(
        "data"
    )

    if isinstance(
        data,
        list,
    ):

        return [
            item
            for item in data
            if isinstance(
                item,
                dict,
            )
        ]

    return []


def coordinate_is_valid(
    latitude: Any,
    longitude: Any,
) -> bool:

    try:

        lat = float(
            latitude
        )

        lon = float(
            longitude
        )

    except (
        TypeError,
        ValueError,
    ):

        return False

    return (
        -90.0 <= lat <= 90.0
        and
        -180.0 <= lon <= 180.0
    )


def point_inside_provisional_envelope(
    latitude: float,
    longitude: float,
) -> bool:

    return (
        NORTHEAST_ENVELOPE[
            "min_latitude"
        ]
        <= latitude
        <=
        NORTHEAST_ENVELOPE[
            "max_latitude"
        ]
        and
        NORTHEAST_ENVELOPE[
            "min_longitude"
        ]
        <= longitude
        <=
        NORTHEAST_ENVELOPE[
            "max_longitude"
        ]
    )


def validate_record(
    record: dict[str, Any],
    dataset_type: str,
) -> dict[str, Any]:

    latitude = record.get(
        "latitude"
    )

    longitude = record.get(
        "longitude"
    )

    if not coordinate_is_valid(
        latitude,
        longitude,
    ):

        result = dict(
            record
        )

        result[
            "spatial_validation"
        ] = {
            "status": "REJECTED",
            "reason": "INVALID_OR_MISSING_COORDINATES",
        }

        return result

    latitude = float(
        latitude
    )

    longitude = float(
        longitude
    )

    inside = point_inside_provisional_envelope(
        latitude,
        longitude,
    )

    result = dict(
        record
    )

    result[
        "dataset_type"
    ] = dataset_type

    result[
        "validation_source"
    ] = (
        "BhooPehra provisional Northeast "
        "geographic envelope"
    )

    result[
        "validation_timestamp_utc"
    ] = datetime.now(
        timezone.utc
    ).isoformat()

    if inside:

        result[
            "spatial_validation"
        ] = {
            "status": "ACCEPTED",
            "reason": (
                "INSIDE_PROVISIONAL_NORTHEAST_ENVELOPE"
            ),
            "latitude": latitude,
            "longitude": longitude,
        }

    else:

        result[
            "spatial_validation"
        ] = {
            "status": "REJECTED",
            "reason": (
                "OUTSIDE_PROVISIONAL_NORTHEAST_ENVELOPE"
            ),
            "latitude": latitude,
            "longitude": longitude,
        }

    return result


def validate_records(
    records: list[dict[str, Any]],
    dataset_type: str,
) -> tuple[
    list[dict[str, Any]],
    dict[str, int],
]:

    validated = []

    counters = {
        "input": len(records),
        "accepted": 0,
        "rejected_invalid_coordinates": 0,
        "rejected_outside_envelope": 0,
    }

    for index, record in enumerate(
        records,
        start=1,
    ):

        result = validate_record(
            record,
            dataset_type,
        )

        validation = result[
            "spatial_validation"
        ]

        reason = validation[
            "reason"
        ]

        if validation[
            "status"
        ] == "ACCEPTED":

            counters[
                "accepted"
            ] += 1

        elif reason == (
            "INVALID_OR_MISSING_COORDINATES"
        ):

            counters[
                "rejected_invalid_coordinates"
            ] += 1

        else:

            counters[
                "rejected_outside_envelope"
            ] += 1

        validated.append(
            result
        )

        print(
            f"[{index}/{len(records)}] "
            f"{dataset_type} | "
            f"{record.get('latitude')}, "
            f"{record.get('longitude')} | "
            f"{validation['status']} | "
            f"{reason}"
        )

    return (
        validated,
        counters,
    )


def build_validated_negative_dataset(
    records: list[dict[str, Any]],
) -> list[dict[str, Any]]:

    accepted = []

    for record in records:

        validation = record.get(
            "spatial_validation",
            {},
        )

        if validation.get(
            "status"
        ) != "ACCEPTED":

            continue

        clean_record = dict(
            record
        )

        clean_record[
            "label"
        ] = 0

        clean_record[
            "label_name"
        ] = (
            "BACKGROUND_CANDIDATE"
        )

        clean_record[
            "sampling_status"
        ] = (
            "UNVERIFIED_BACKGROUND"
        )

        accepted.append(
            clean_record
        )

    return accepted


def build_quality_report(
    positive_counters: dict[str, int],
    negative_counters: dict[str, int],
    validated_negative_count: int,
) -> dict[str, Any]:

    return {
        "generated_at_utc": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),
        "validation_method": (
            "Provisional geographic envelope"
        ),
        "envelope": NORTHEAST_ENVELOPE,
        "northeast_states": sorted(
            NORTHEAST_STATES
        ),
        "positive_validation": (
            positive_counters
        ),
        "background_validation": (
            negative_counters
        ),
        "validated_background_candidates": (
            validated_negative_count
        ),
        "warnings": [
            (
                "This is NOT an official administrative boundary."
            ),
            (
                "The envelope is only a geographic screening layer."
            ),
            (
                "Background candidates are NOT verified "
                "non-landslide observations."
            ),
            (
                "Official state polygons must be attached before "
                "final ML training."
            ),
            (
                "Terrain, geology, land-cover and rainfall "
                "features are not attached yet."
            ),
            (
                "No database records were modified."
            ),
        ],
    }


def run_gsi_spatial_validation(
    db: Session,
) -> dict[str, Any]:

    print()
    print(
        "BhooPehra - Spatial Validation"
    )
    print(
        "=" * 72
    )

    db_events = load_gsi_events(
        db
    )

    database_spatial_events = len(
        [
            event
            for event in db_events
            if event.get(
                "latitude"
            ) is not None
            and event.get(
                "longitude"
            ) is not None
        ]
    )

    positive_payload = load_json(
        POSITIVE_FILE
    )

    negative_payload = load_json(
        NEGATIVE_FILE
    )

    positive_records = extract_records(
        positive_payload
    )

    negative_records = extract_records(
        negative_payload
    )

    print(
        f"Positive candidates: "
        f"{len(positive_records)}"
    )

    print(
        f"Background candidates: "
        f"{len(negative_records)}"
    )

    print()
    print(
        "Using provisional Northeast geographic envelope..."
    )

    print(
        f"Latitude: "
        f"{NORTHEAST_ENVELOPE['min_latitude']} "
        f"to "
        f"{NORTHEAST_ENVELOPE['max_latitude']}"
    )

    print(
        f"Longitude: "
        f"{NORTHEAST_ENVELOPE['min_longitude']} "
        f"to "
        f"{NORTHEAST_ENVELOPE['max_longitude']}"
    )

    print()
    print(
        "Validating positive candidates..."
    )

    (
        validated_positive,
        positive_counters,
    ) = validate_records(
        positive_records,
        "POSITIVE",
    )

    print()
    print(
        "Validating background candidates..."
    )

    (
        validated_negative,
        negative_counters,
    ) = validate_records(
        negative_records,
        "BACKGROUND",
    )

    validated_negative_clean = (
        build_validated_negative_dataset(
            validated_negative
        )
    )

    quality_report = build_quality_report(
        positive_counters=positive_counters,
        negative_counters=negative_counters,
        validated_negative_count=len(
            validated_negative_clean
        ),
    )

    validated_dataset = {
        "dataset": (
            "BhooPehra GSI Spatially Validated Dataset"
        ),
        "version": "0.1",
        "generated_at_utc": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),
        "validation_method": (
            "PROVISIONAL_GEOGRAPHIC_ENVELOPE"
        ),
        "positive_candidates": (
            validated_positive
        ),
        "background_candidates": (
            validated_negative_clean
        ),
    }

    validated_negative_payload = {
        "dataset": (
            "BhooPehra GSI Validated Background Candidates"
        ),
        "version": "0.1",
        "generated_at_utc": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),
        "label_definition": {
            "label": 0,
            "meaning": (
                "BACKGROUND_CANDIDATE — "
                "inside provisional Northeast "
                "geographic envelope; not a verified negative"
            ),
        },
        "records": validated_negative_clean,
    }

    save_json(
        VALIDATED_NEGATIVE_FILE,
        validated_negative_payload,
    )

    save_json(
        VALIDATED_DATASET_FILE,
        validated_dataset,
    )

    save_json(
        QUALITY_REPORT_FILE,
        quality_report,
    )

    return {
        "status": "success",
        "database_operation": "READ_ONLY",
        "database_spatial_events": (
            database_spatial_events
        ),
        "positive_input": len(
            positive_records
        ),
        "positive_accepted": (
            positive_counters[
                "accepted"
            ]
        ),
        "background_input": len(
            negative_records
        ),
        "background_accepted": len(
            validated_negative_clean
        ),
        "positive_validation": (
            positive_counters
        ),
        "background_validation": (
            negative_counters
        ),
        "validated_negative_file": str(
            VALIDATED_NEGATIVE_FILE
        ),
        "validated_dataset_file": str(
            VALIDATED_DATASET_FILE
        ),
        "quality_report_file": str(
            QUALITY_REPORT_FILE
        ),
    }


def print_spatial_validation_report(
    result: dict[str, Any],
) -> None:

    print()
    print(
        "=" * 72
    )

    print(
        "BhooPehra - Spatial Validation Report"
    )

    print(
        "=" * 72
    )

    print(
        f"Database spatial GSI events: "
        f"{result['database_spatial_events']}"
    )

    print()
    print(
        "POSITIVE CANDIDATES"
    )

    print(
        f"  Input: "
        f"{result['positive_input']}"
    )

    print(
        f"  Accepted by envelope: "
        f"{result['positive_accepted']}"
    )

    print()
    print(
        "BACKGROUND CANDIDATES"
    )

    print(
        f"  Input: "
        f"{result['background_input']}"
    )

    print(
        f"  Accepted by envelope: "
        f"{result['background_accepted']}"
    )

    print()
    print(
        "Validated background dataset:"
    )

    print(
        f"  {result['validated_negative_file']}"
    )

    print()
    print(
        "Combined spatial dataset:"
    )

    print(
        f"  {result['validated_dataset_file']}"
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
        "  This is a PROVISIONAL geographic validation."
    )

    print(
        "  It is NOT an official administrative boundary."
    )

    print(
        "  Background points remain UNVERIFIED negatives."
    )

    print(
        "  Database records were NOT modified."
    )

    print(
        "=" * 72
    )