from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ============================================================
# BhooPehra - Final GSI Training Feature Fusion
# ============================================================
#
# Combines:
#
#   1. Terrain + rainfall base features
#   2. Bhuvan LULC features
#   3. OSM road features
#   4. Lithology features
#
# Output:
#
#   gsi_final_training_dataset.json
#   gsi_final_training_quality.json
#
# PostgreSQL/PostGIS is NOT modified.
# ============================================================


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data" / "gsi"

BASE_DATASET = (
    DATA_DIR / "gsi_training_feature_dataset.json"
)

LULC_DATASET = (
    DATA_DIR / "gsi_training_lulc_features.json"
)

ROAD_DATASET = (
    DATA_DIR / "gsi_training_road_features.json"
)

LITHOLOGY_DATASET = (
    DATA_DIR / "gsi_training_lithology_features.json"
)

OUTPUT_DATASET = (
    DATA_DIR / "gsi_final_training_dataset.json"
)

QUALITY_REPORT = (
    DATA_DIR / "gsi_final_training_quality.json"
)


# ============================================================
# UTILITIES
# ============================================================

def save_json(
    path: Path,
    payload: dict[str, Any],
) -> None:

    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with path.open(
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            payload,
            file,
            indent=2,
            ensure_ascii=False,
            default=str,
        )


def load_json(
    path: Path,
) -> Any:

    if not path.exists():

        raise FileNotFoundError(
            f"Required dataset not found: {path}"
        )

    with path.open(
        "r",
        encoding="utf-8",
    ) as file:

        return json.load(file)


def clean_text(
    value: Any,
) -> str:

    if value is None:
        return ""

    return str(
        value
    ).strip()


def safe_float(
    value: Any,
) -> float | None:

    if value is None:
        return None

    if isinstance(
        value,
        bool,
    ):
        return float(value)

    try:

        number = float(value)

        if not math.isfinite(
            number
        ):
            return None

        return number

    except (
        TypeError,
        ValueError,
    ):

        return None


# ============================================================
# RECORD ID
# ============================================================

def get_record_id(
    record: dict[str, Any],
) -> str:

    for key in (
        "record_id",
        "sample_id",
        "id",
        "event_id",
    ):

        value = clean_text(
            record.get(key)
        )

        if value:
            return value

    return ""


# ============================================================
# LABEL
# ============================================================

def normalize_label(
    record: dict[str, Any],
) -> int | None:

    value = record.get(
        "label"
    )

    if value is not None:

        if isinstance(
            value,
            bool,
        ):

            return int(value)

        if isinstance(
            value,
            (int, float),
        ):

            if value in (
                0,
                1,
            ):

                return int(value)

        text = clean_text(
            value
        ).upper()

        if text in {
            "0",
            "NEGATIVE",
            "BACKGROUND",
            "BACKGROUND_CANDIDATE",
            "UNVERIFIED_BACKGROUND",
        }:

            return 0

        if text in {
            "1",
            "POSITIVE",
            "LANDSLIDE",
            "EVENT",
        }:

            return 1

    # --------------------------------------------------------
    # Current negative sampler convention.
    # --------------------------------------------------------

    record_id = (
        get_record_id(
            record
        ).upper()
    )

    if record_id.startswith(
        "NEG-"
    ):

        return 0

    if record_id.startswith(
        "GSI_BACKGROUND_"
    ):

        return 0

    label_name = clean_text(
        record.get(
            "label_name"
        )
    ).upper()

    if label_name == (
        "BACKGROUND_CANDIDATE"
    ):

        return 0

    return None


# ============================================================
# RECORD LIST EXTRACTION
# ============================================================

def extract_records(
    payload: Any,
    source_name: str,
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

        raise ValueError(
            f"{source_name} has unsupported JSON format."
        )

    for key in (
        "feature_records",
        "records",
        "samples",
        "features",
    ):

        value = payload.get(
            key
        )

        if isinstance(
            value,
            list,
        ):

            return [
                item
                for item in value
                if isinstance(
                    item,
                    dict,
                )
            ]

    raise ValueError(
        f"{source_name} does not contain "
        "feature_records/records/samples/features."
    )


# ============================================================
# LOAD ALL DATASETS
# ============================================================

def load_datasets() -> dict[
    str,
    list[dict[str, Any]],
]:

    base_payload = load_json(
        BASE_DATASET
    )

    lulc_payload = load_json(
        LULC_DATASET
    )

    road_payload = load_json(
        ROAD_DATASET
    )

    lithology_payload = load_json(
        LITHOLOGY_DATASET
    )

    datasets = {

        "base": extract_records(
            base_payload,
            "terrain/rainfall dataset",
        ),

        "lulc": extract_records(
            lulc_payload,
            "LULC dataset",
        ),

        "road": extract_records(
            road_payload,
            "road dataset",
        ),

        "lithology": extract_records(
            lithology_payload,
            "lithology dataset",
        ),
    }

    return datasets


# ============================================================
# INDEX DATASETS BY RECORD ID
# ============================================================

def index_records(
    records: list[dict[str, Any]],
    dataset_name: str,
) -> dict[
    str,
    dict[str, Any],
]:

    indexed: dict[
        str,
        dict[str, Any],
    ] = {}

    duplicates = 0

    for record in records:

        record_id = get_record_id(
            record
        )

        if not record_id:

            continue

        if record_id in indexed:

            duplicates += 1
            continue

        indexed[
            record_id
        ] = record

    if duplicates:

        print(
            f"WARNING: {dataset_name} "
            f"contains {duplicates} duplicate IDs."
        )

    return indexed


# ============================================================
# NUMERIC FEATURE DEFINITIONS
# ============================================================

# These are the features that are allowed to pass into
# the ML-ready numeric matrix.
#
# We deliberately do NOT blindly convert every numeric field
# because metadata fields such as IDs, years, object IDs,
# timestamps, etc. should not become model predictors.

NUMERIC_FEATURES = [

    # --------------------------------------------------------
    # Coordinates
    # --------------------------------------------------------

    "latitude",
    "longitude",

    # --------------------------------------------------------
    # Terrain
    # --------------------------------------------------------

    "elevation_m",
    "slope_deg",
    "aspect_deg",
    "curvature",
    "roughness",
    "tpi",

    # --------------------------------------------------------
    # Rainfall / trigger
    # --------------------------------------------------------

    "rainfall_24h_mm",
    "rainfall_72h_mm",
    "rainfall_7d_mm",
    "rainfall_30d_mm",
    "antecedent_rainfall_mm",
    "rainfall_intensity_mm_h",
    "soil_moisture",
    "forecast_rainfall_mm",

    # --------------------------------------------------------
    # Road features
    # --------------------------------------------------------

    "distance_to_road_m",
    "nearest_road_importance",
    "road_length_1km_m",
    "road_length_5km_m",
    "road_count_1km",
    "road_count_5km",

    "road_density_1km_km_per_km2",
    "road_density_5km_km_per_km2",
]


# ============================================================
# ALIASES
# ============================================================

FEATURE_ALIASES = {

    # Terrain naming variants
    "elevation":
        "elevation_m",

    "elevation_mean":
        "elevation_m",

    "slope":
        "slope_deg",

    "slope_degrees":
        "slope_deg",

    "aspect":
        "aspect_deg",

    # Rainfall variants
    "rainfall_24h":
        "rainfall_24h_mm",

    "rainfall_72h":
        "rainfall_72h_mm",

    "rainfall_7d":
        "rainfall_7d_mm",

    "rainfall_30d":
        "rainfall_30d_mm",

    "rain_24h_mm":
        "rainfall_24h_mm",

    "rain_72h_mm":
        "rainfall_72h_mm",

    # Road variants
    "road_density_1km":
        "road_density_1km_km_per_km2",

    "road_density_5km":
        "road_density_5km_km_per_km2",
}


# ============================================================
# CATEGORICAL FEATURES
# ============================================================

CATEGORICAL_FEATURES = [

    "state",

    "district",

    "nearest_road_class",

    "lulc_class",

    "lithology_class",
]


# ============================================================
# SOURCE FEATURE EXTRACTION
# ============================================================

def get_numeric_feature(
    merged: dict[str, Any],
    feature_name: str,
) -> float | None:

    # Direct field.
    if feature_name in merged:

        value = safe_float(
            merged.get(
                feature_name
            )
        )

        if value is not None:
            return value

    # Alias search.
    for source_name, target_name in (
        FEATURE_ALIASES.items()
    ):

        if target_name != feature_name:
            continue

        if source_name not in merged:
            continue

        value = safe_float(
            merged.get(
                source_name
            )
        )

        if value is not None:
            return value

    return None


def get_lulc_class(
    record: dict[str, Any],
) -> str | None:

    candidates = [

        record.get(
            "normalized_lulc_class"
        ),

        record.get(
            "lulc_class"
        ),

        record.get(
            "normalized_class"
        ),

        record.get(
            "land_cover_class"
        ),
    ]

    for value in candidates:

        text = clean_text(
            value
        )

        if text:
            return text

    # Some versions store the normalized class
    # inside a nested extraction object.

    extraction = record.get(
        "extraction"
    )

    if isinstance(
        extraction,
        dict,
    ):

        for key in (
            "normalized_lulc_class",
            "lulc_class",
            "normalized_class",
        ):

            text = clean_text(
                extraction.get(
                    key
                )
            )

            if text:
                return text

    return None


def get_lithology_class(
    record: dict[str, Any],
) -> str | None:

    for key in (
        "lithology_class",
        "normalized_lithology",
        "lithology",
    ):

        value = clean_text(
            record.get(
                key
            )
        )

        if value:
            return value

    return None


# ============================================================
# BUILD MERGED RECORD
# ============================================================

def build_merged_record(
    base_record: dict[str, Any],
    lulc_record: dict[str, Any] | None,
    road_record: dict[str, Any] | None,
    lithology_record: dict[str, Any] | None,
) -> dict[str, Any]:

    record_id = get_record_id(
        base_record
    )

    merged = dict(
        base_record
    )

    # --------------------------------------------------------
    # Overlay feature-engineering outputs.
    #
    # We do not overwrite core identity/label metadata with
    # external dataset metadata.
    # --------------------------------------------------------

    if lulc_record:

        for key, value in (
            lulc_record.items()
        ):

            if key in {
                "record_id",
                "sample_id",
                "id",
                "label",
            }:

                continue

            merged[
                key
            ] = value

    if road_record:

        for key, value in (
            road_record.items()
        ):

            if key in {
                "record_id",
                "sample_id",
                "id",
                "label",
            }:

                continue

            merged[
                key
            ] = value

    if lithology_record:

        for key, value in (
            lithology_record.items()
        ):

            if key in {
                "record_id",
                "sample_id",
                "id",
                "label",
            }:

                continue

            merged[
                key
            ] = value

    # --------------------------------------------------------
    # Canonical identity.
    # --------------------------------------------------------

    merged[
        "record_id"
    ] = record_id

    # --------------------------------------------------------
    # Canonical coordinates.
    # --------------------------------------------------------

    latitude = safe_float(
        base_record.get(
            "latitude"
        )
    )

    longitude = safe_float(
        base_record.get(
            "longitude"
        )
    )

    if latitude is None:

        latitude = safe_float(
            lulc_record.get(
                "latitude"
            )
            if lulc_record
            else None
        )

    if longitude is None:

        longitude = safe_float(
            lulc_record.get(
                "longitude"
            )
            if lulc_record
            else None
        )

    merged[
        "latitude"
    ] = latitude

    merged[
        "longitude"
    ] = longitude

    # --------------------------------------------------------
    # Canonical label.
    # --------------------------------------------------------

    label = normalize_label(
        base_record
    )

    if label is None:

        if lulc_record:

            label = normalize_label(
                lulc_record
            )

    if label is None:

        if road_record:

            label = normalize_label(
                road_record
            )

    if label is None:

        if lithology_record:

            label = normalize_label(
                lithology_record
            )

    merged[
        "label"
    ] = label

    # --------------------------------------------------------
    # Canonical LULC.
    # --------------------------------------------------------

    merged[
        "lulc_class"
    ] = get_lulc_class(
        lulc_record or {}
    )

    # --------------------------------------------------------
    # Canonical lithology.
    # --------------------------------------------------------

    merged[
        "lithology_class"
    ] = get_lithology_class(
        lithology_record or {}
    )

    # --------------------------------------------------------
    # Canonical road class.
    # --------------------------------------------------------

    road_class = clean_text(
        road_record.get(
            "nearest_road_class"
        )
        if road_record
        else None
    )

    if not road_class:

        road_class = (
            "NONE"
            if road_record
            else None
        )

    merged[
        "nearest_road_class"
    ] = road_class or None

    return merged


# ============================================================
# CREATE ML RECORD
# ============================================================

def create_ml_record(
    merged: dict[str, Any],
) -> dict[str, Any]:

    record_id = get_record_id(
        merged
    )

    label = normalize_label(
        merged
    )

    # --------------------------------------------------------
    # Numeric vector.
    # --------------------------------------------------------

    numeric_features: dict[
        str,
        float | None,
    ] = {}

    for feature_name in (
        NUMERIC_FEATURES
    ):

        numeric_features[
            feature_name
        ] = get_numeric_feature(
            merged,
            feature_name,
        )

    # --------------------------------------------------------
    # Categorical vector.
    # --------------------------------------------------------

    categorical_features = {

        "state":
            clean_text(
                merged.get(
                    "state"
                )
            ) or None,

        "district":
            clean_text(
                merged.get(
                    "district"
                )
            ) or None,

        "nearest_road_class":
            clean_text(
                merged.get(
                    "nearest_road_class"
                )
            ) or None,

        "lulc_class":
            clean_text(
                merged.get(
                    "lulc_class"
                )
            ) or None,

        "lithology_class":
            clean_text(
                merged.get(
                    "lithology_class"
                )
            ) or None,
    }

    # --------------------------------------------------------
    # One-hot encoding.
    #
    # We generate stable category dictionaries from the full
    # dataset later. This record initially contains raw
    # categorical values only.
    # --------------------------------------------------------

    return {

        "record_id":
            record_id,

        "label":
            label,

        "sample_type":
            (
                "POSITIVE"
                if label == 1
                else (
                    "BACKGROUND"
                    if label == 0
                    else "UNKNOWN"
                )
            ),

        "latitude":
            safe_float(
                merged.get(
                    "latitude"
                )
            ),

        "longitude":
            safe_float(
                merged.get(
                    "longitude"
                )
            ),

        "numeric_features":
            numeric_features,

        "categorical_features":
            categorical_features,

        "provenance": {

            "terrain_rainfall":
                "GSI-derived training feature dataset",

            "lulc":
                clean_text(
                    merged.get(
                        "lulc_source"
                    )
                )
                or
                "ISRO / NRSC Bhuvan LULC 50K 2015-16",

            "roads":
                clean_text(
                    merged.get(
                        "road_source"
                    )
                )
                or
                "OpenStreetMap / Geofabrik",

            "lithology":
                clean_text(
                    merged.get(
                        "lithology_source"
                    )
                )
                or
                "GLiM fallback; GSI Bhukosh intended authoritative source",
        },

        "quality_flags": {

            "road_feature_status":
                clean_text(
                    merged.get(
                        "road_feature_status"
                    )
                )
                or None,

            "lithology_match_type":
                clean_text(
                    merged.get(
                        "match_type"
                    )
                )
                or None,

            "lithology_class":
                clean_text(
                    merged.get(
                        "lithology_class"
                    )
                )
                or None,

            "lulc_match_status":
                clean_text(
                    merged.get(
                        "lulc_match_status"
                    )
                )
                or None,
        },
    }


# ============================================================
# CATEGORICAL VOCABULARIES
# ============================================================

def build_vocabularies(
    records: list[
        dict[str, Any]
    ],
) -> dict[
    str,
    list[str],
]:

    vocabularies: dict[
        str,
        list[str],
    ] = {}

    for feature_name in (
        CATEGORICAL_FEATURES
    ):

        values = set()

        for record in records:

            value = (
                record[
                    "categorical_features"
                ].get(
                    feature_name
                )
            )

            if value is None:
                continue

            value = clean_text(
                value
            )

            if value:
                values.add(
                    value
                )

        vocabularies[
            feature_name
        ] = sorted(
            values
        )

    return vocabularies


# ============================================================
# ONE-HOT ENCODING
# ============================================================

def create_encoded_features(
    record: dict[str, Any],
    vocabularies: dict[
        str,
        list[str],
    ],
) -> dict[str, float]:

    encoded: dict[
        str,
        float,
    ] = {}

    # --------------------------------------------------------
    # Numeric values.
    #
    # Missing values remain NaN in the encoded vector.
    # JSON cannot safely represent NaN for all consumers,
    # therefore we use None in the main dataset and a
    # separate missing-indicator feature.
    # --------------------------------------------------------

    for feature_name, value in (
        record[
            "numeric_features"
        ].items()
    ):

        encoded[
            feature_name
        ] = (
            float(value)
            if value is not None
            else None
        )

        encoded[
            f"{feature_name}__missing"
        ] = (
            1.0
            if value is None
            else 0.0
        )

    # --------------------------------------------------------
    # One-hot categorical values.
    # --------------------------------------------------------

    categorical = record[
        "categorical_features"
    ]

    for feature_name, categories in (
        vocabularies.items()
    ):

        value = categorical.get(
            feature_name
        )

        for category in categories:

            encoded_name = (
                f"{feature_name}__"
                f"{category}"
            )

            encoded[
                encoded_name
            ] = (
                1.0
                if value == category
                else 0.0
            )

    return encoded


# ============================================================
# QUALITY REPORT
# ============================================================

def build_quality_report(
    base_records: list[
        dict[str, Any]
    ],
    lulc_records: list[
        dict[str, Any]
    ],
    road_records: list[
        dict[str, Any]
    ],
    lithology_records: list[
        dict[str, Any]
    ],
    final_records: list[
        dict[str, Any]
    ],
) -> dict[str, Any]:

    base_ids = {
        get_record_id(
            record
        )
        for record in base_records
        if get_record_id(
            record
        )
    }

    lulc_ids = {
        get_record_id(
            record
        )
        for record in lulc_records
        if get_record_id(
            record
        )
    }

    road_ids = {
        get_record_id(
            record
        )
        for record in road_records
        if get_record_id(
            record
        )
    }

    lithology_ids = {
        get_record_id(
            record
        )
        for record in lithology_records
        if get_record_id(
            record
        )
    }

    total = len(
        final_records
    )

    positive = sum(
        record.get(
            "label"
        ) == 1
        for record in final_records
    )

    background = sum(
        record.get(
            "label"
        ) == 0
        for record in final_records
    )

    unknown = sum(
        record.get(
            "label"
        ) is None
        for record in final_records
    )

    lulc_available = sum(
        bool(
            record[
                "categorical_features"
            ].get(
                "lulc_class"
            )
        )
        for record in final_records
    )

    lithology_available = sum(
        bool(
            record[
                "categorical_features"
            ].get(
                "lithology_class"
            )
        )
        for record in final_records
    )

    road_distance_available = sum(
        record[
            "numeric_features"
        ].get(
            "distance_to_road_m"
        )
        is not None
        for record in final_records
    )

    terrain_numeric_counts: dict[
        str,
        int,
    ] = {}

    for feature_name in (
        NUMERIC_FEATURES
    ):

        count = sum(
            record[
                "numeric_features"
            ].get(
                feature_name
            )
            is not None
            for record in final_records
        )

        terrain_numeric_counts[
            feature_name
        ] = count

    return {

        "version":
            "1.0",

        "generated_at_utc":
            datetime.now(
                timezone.utc
            ).isoformat(),

        "dataset":
            "BhooPehra Final GSI Training Dataset",

        "counts": {

            "base_records":
                len(
                    base_records
                ),

            "lulc_records":
                len(
                    lulc_records
                ),

            "road_records":
                len(
                    road_records
                ),

            "lithology_records":
                len(
                    lithology_records
                ),

            "final_records":
                total,

            "positive_records":
                positive,

            "background_records":
                background,

            "unknown_labels":
                unknown,
        },

        "join_coverage": {

            "base_to_lulc":
                round(
                    (
                        len(
                            base_ids
                            & lulc_ids
                        )
                        / len(base_ids)
                        * 100
                    )
                    if base_ids
                    else 0,
                    2,
                ),

            "base_to_roads":
                round(
                    (
                        len(
                            base_ids
                            & road_ids
                        )
                        / len(base_ids)
                        * 100
                    )
                    if base_ids
                    else 0,
                    2,
                ),

            "base_to_lithology":
                round(
                    (
                        len(
                            base_ids
                            & lithology_ids
                        )
                        / len(base_ids)
                        * 100
                    )
                    if base_ids
                    else 0,
                    2,
                ),
        },

        "feature_coverage": {

            "lulc":
                round(
                    lulc_available
                    / total
                    * 100,
                    2,
                )
                if total
                else 0,

            "lithology":
                round(
                    lithology_available
                    / total
                    * 100,
                    2,
                )
                if total
                else 0,

            "road_distance":
                round(
                    road_distance_available
                    / total
                    * 100,
                    2,
                )
                if total
                else 0,

            "numeric_features":
                terrain_numeric_counts,
        },

        "class_counts": {

            "lulc": count_categories(
                final_records,
                "lulc_class",
            ),

            "lithology":
                count_categories(
                    final_records,
                    "lithology_class",
                ),

            "road_class":
                count_categories(
                    final_records,
                    "nearest_road_class",
                ),
        },

        "scientific_notes": [

            (
                "Positive labels originate from "
                "GSI-derived historical landslide "
                "candidates."
            ),

            (
                "Background samples are sampled "
                "background candidates and should "
                "not be interpreted as confirmed "
                "landslide-free observations."
            ),

            (
                "LULC uses ISRO/NRSC Bhuvan "
                "2015-16 1:50,000 data."
            ),

            (
                "Road features use mapped OSM "
                "road geometry and are exposure/"
                "anthropogenic-terrain predictors."
            ),

            (
                "Lithology currently uses GLiM "
                "as a fallback because the intended "
                "GSI Bhukosh lithology service is "
                "not reliably available in the "
                "preprocessing environment."
            ),

            (
                "No database records are modified "
                "by this fusion stage."
            ),
        ],

        "quality": {

            "status":
                (
                    "PASS"
                    if (
                        total == len(
                            base_records
                        )
                        and positive > 0
                        and background > 0
                        and unknown == 0
                        and lulc_available == total
                        and lithology_available == total
                    )
                    else "REVIEW"
                ),

            "requirements": {

                "base_dataset_complete":
                    total == len(
                        base_records
                    ),

                "both_classes_present":
                    positive > 0
                    and background > 0,

                "no_unknown_labels":
                    unknown == 0,

                "complete_lulc":
                    lulc_available == total,

                "complete_lithology":
                    lithology_available == total,
            },
        },

        "database_modified":
            False,
    }


# ============================================================
# CATEGORY COUNTING
# ============================================================

def count_categories(
    records: list[
        dict[str, Any]
    ],
    feature_name: str,
) -> dict[str, int]:

    counts: dict[
        str,
        int,
    ] = {}

    for record in records:

        value = record[
            "categorical_features"
        ].get(
            feature_name
        )

        if not value:
            continue

        counts[
            value
        ] = (
            counts.get(
                value,
                0,
            )
            + 1
        )

    return dict(
        sorted(
            counts.items()
        )
    )


# ============================================================
# MAIN RUNNER
# ============================================================

def run() -> dict[str, Any]:

    print()
    print("=" * 72)
    print(
        "BhooPehra - Final GSI Training Feature Fusion"
    )
    print("=" * 72)

    print()

    print(
        "Base dataset:"
    )
    print(
        f"  {BASE_DATASET}"
    )

    print(
        "LULC dataset:"
    )
    print(
        f"  {LULC_DATASET}"
    )

    print(
        "Road dataset:"
    )
    print(
        f"  {ROAD_DATASET}"
    )

    print(
        "Lithology dataset:"
    )
    print(
        f"  {LITHOLOGY_DATASET}"
    )

    print()

    # --------------------------------------------------------
    # Load.
    # --------------------------------------------------------

    datasets = load_datasets()

    base_records = datasets[
        "base"
    ]

    lulc_records = datasets[
        "lulc"
    ]

    road_records = datasets[
        "road"
    ]

    lithology_records = datasets[
        "lithology"
    ]

    print(
        f"Base records: "
        f"{len(base_records)}"
    )

    print(
        f"LULC records: "
        f"{len(lulc_records)}"
    )

    print(
        f"Road records: "
        f"{len(road_records)}"
    )

    print(
        f"Lithology records: "
        f"{len(lithology_records)}"
    )

    print()

    # --------------------------------------------------------
    # Index.
    # --------------------------------------------------------

    lulc_index = index_records(
        lulc_records,
        "LULC",
    )

    road_index = index_records(
        road_records,
        "Road",
    )

    lithology_index = index_records(
        lithology_records,
        "Lithology",
    )

    # --------------------------------------------------------
    # Merge.
    # --------------------------------------------------------

    ml_records: list[
        dict[str, Any]
    ] = []

    missing_lulc = 0
    missing_road = 0
    missing_lithology = 0

    unknown_labels = 0

    for index, base_record in enumerate(
        base_records,
        start=1,
    ):

        record_id = get_record_id(
            base_record
        )

        lulc_record = lulc_index.get(
            record_id
        )

        road_record = road_index.get(
            record_id
        )

        lithology_record = (
            lithology_index.get(
                record_id
            )
        )

        if lulc_record is None:
            missing_lulc += 1

        if road_record is None:
            missing_road += 1

        if lithology_record is None:
            missing_lithology += 1

        merged = build_merged_record(
            base_record,
            lulc_record,
            road_record,
            lithology_record,
        )

        ml_record = create_ml_record(
            merged
        )

        if ml_record[
            "label"
        ] is None:

            unknown_labels += 1

        ml_records.append(
            ml_record
        )

        print(
            f"[{index:02d}/{len(base_records):02d}] "
            f"{record_id} | "
            f"label={ml_record['label']} | "
            f"LULC="
            f"{ml_record['categorical_features'].get('lulc_class')} | "
            f"lithology="
            f"{ml_record['categorical_features'].get('lithology_class')} | "
            f"road="
            f"{ml_record['categorical_features'].get('nearest_road_class')}"
        )

    # --------------------------------------------------------
    # Vocabulary.
    # --------------------------------------------------------

    vocabularies = build_vocabularies(
        ml_records
    )

    # --------------------------------------------------------
    # Encoded feature vectors.
    # --------------------------------------------------------

    for record in ml_records:

        record[
            "encoded_features"
        ] = create_encoded_features(
            record,
            vocabularies,
        )

    # --------------------------------------------------------
    # Feature order.
    # --------------------------------------------------------

    encoded_feature_names: list[
        str
    ] = []

    if ml_records:

        encoded_feature_names = list(
            ml_records[
                0
            ][
                "encoded_features"
            ].keys()
        )

    # --------------------------------------------------------
    # Quality.
    # --------------------------------------------------------

    quality = build_quality_report(
        base_records,
        lulc_records,
        road_records,
        lithology_records,
        ml_records,
    )

    quality[
        "join_issues"
    ] = {

        "missing_lulc_records":
            missing_lulc,

        "missing_road_records":
            missing_road,

        "missing_lithology_records":
            missing_lithology,

        "unknown_labels":
            unknown_labels,
    }

    quality[
        "encoded_feature_count"
    ] = len(
        encoded_feature_names
    )

    quality[
        "encoded_feature_names"
    ] = encoded_feature_names

    # --------------------------------------------------------
    # Final dataset.
    # --------------------------------------------------------

    payload = {

        "dataset":
            "BhooPehra Final GSI Training Dataset",

        "version":
            "1.0",

        "generated_at_utc":
            datetime.now(
                timezone.utc
            ).isoformat(),

        "database_modified":
            False,

        "target":

            {
                "name":
                    "label",

                "definition":
                    "1 = historical landslide positive candidate; "
                    "0 = sampled background candidate",

                "positive_count":
                    sum(
                        record.get(
                            "label"
                        ) == 1
                        for record in ml_records
                    ),

                "background_count":
                    sum(
                        record.get(
                            "label"
                        ) == 0
                        for record in ml_records
                    ),
            },

        "feature_groups": {

            "numeric":
                NUMERIC_FEATURES,

            "categorical":
                CATEGORICAL_FEATURES,

            "encoded":
                encoded_feature_names,
        },

        "categorical_vocabularies":
            vocabularies,

        "records":
            ml_records,

        "sources": {

            "historical_events":
                "Geological Survey of India / GSI NLFC-derived records",

            "terrain_rainfall":
                str(
                    BASE_DATASET
                ),

            "lulc":
                "ISRO / NRSC Bhuvan LULC 50K 2015-16",

            "roads":
                "OpenStreetMap / Geofabrik North-Eastern Zone",

            "lithology":
                (
                    "GLiM fallback; "
                    "GSI Bhukosh intended authoritative source"
                ),
        },

        "quality_report":
            str(
                QUALITY_REPORT
            ),
    }

    # --------------------------------------------------------
    # Write.
    # --------------------------------------------------------

    save_json(
        OUTPUT_DATASET,
        payload,
    )

    save_json(
        QUALITY_REPORT,
        quality,
    )

    # --------------------------------------------------------
    # Final report.
    # --------------------------------------------------------

    print()
    print("=" * 72)
    print(
        "FINAL TRAINING DATASET REPORT"
    )
    print("=" * 72)

    print(
        f"Final records: "
        f"{len(ml_records)}"
    )

    print(
        f"Positive: "
        f"{quality['counts']['positive_records']}"
    )

    print(
        f"Background: "
        f"{quality['counts']['background_records']}"
    )

    print(
        f"Unknown labels: "
        f"{quality['counts']['unknown_labels']}"
    )

    print()

    print(
        "JOIN COVERAGE:"
    )

    print(
        f"  Base -> LULC: "
        f"{quality['join_coverage']['base_to_lulc']}%"
    )

    print(
        f"  Base -> Roads: "
        f"{quality['join_coverage']['base_to_roads']}%"
    )

    print(
        f"  Base -> Lithology: "
        f"{quality['join_coverage']['base_to_lithology']}%"
    )

    print()

    print(
        "FEATURE COVERAGE:"
    )

    print(
        f"  LULC: "
        f"{quality['feature_coverage']['lulc']}%"
    )

    print(
        f"  Lithology: "
        f"{quality['feature_coverage']['lithology']}%"
    )

    print(
        f"  Road distance: "
        f"{quality['feature_coverage']['road_distance']}%"
    )

    print()

    print(
        "ENCODED FEATURE COUNT: "
        f"{quality['encoded_feature_count']}"
    )

    print()

    print(
        "LULC CLASSES:"
    )

    for name, count in (
        quality[
            "class_counts"
        ][
            "lulc"
        ].items()
    ):

        print(
            f"  {name}: {count}"
        )

    print()

    print(
        "LITHOLOGY CLASSES:"
    )

    for name, count in (
        quality[
            "class_counts"
        ][
            "lithology"
        ].items()
    ):

        print(
            f"  {name}: {count}"
        )

    print()

    print(
        "ROAD CLASSES:"
    )

    for name, count in (
        quality[
            "class_counts"
        ][
            "road_class"
        ].items()
    ):

        print(
            f"  {name}: {count}"
        )

    print()

    print(
        f"Overall quality: "
        f"{quality['quality']['status']}"
    )

    print(
        "Database modified: False"
    )

    print()

    print(
        "Final dataset:"
    )

    print(
        OUTPUT_DATASET
    )

    print()

    print(
        "Quality report:"
    )

    print(
        QUALITY_REPORT
    )

    print("=" * 72)

    return payload


# ============================================================
# CLI
# ============================================================

if __name__ == "__main__":
    run()