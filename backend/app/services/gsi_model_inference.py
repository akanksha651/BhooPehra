"""
BhooPehra - GSI Landslide Model Inference

Loads the trained XGBoost model and converts a feature record into:

    probability
    risk level
    confidence
    evidence
    model metadata

This module is read-only with respect to PostgreSQL/PostGIS.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
from xgboost import XGBClassifier


# =====================================================================
# PATHS
# =====================================================================

BASE_DIR = Path(__file__).resolve().parents[2]

MODEL_DIR = (
    BASE_DIR
    / "data"
    / "gsi"
    / "model"
)

MODEL_FILE = (
    MODEL_DIR
    / "bhoopehra_gsi_xgboost_model.json"
)

SCHEMA_FILE = (
    MODEL_DIR
    / "bhoopehra_gsi_feature_schema.json"
)


# =====================================================================
# FEATURE ALIASES
# =====================================================================

ALIASES: dict[str, list[str]] = {
    "elevation_m": [
        "elevation_m",
        "elevation",
        "elev_m",
        "elev",
    ],
    "slope_deg": [
        "slope_deg",
        "slope",
        "slope_degrees",
    ],
    "aspect_deg": [
        "aspect_deg",
        "aspect",
        "aspect_degrees",
    ],
    "rainfall_24h_mm": [
        "rainfall_24h_mm",
        "rain_24h_mm",
        "rainfall_24h",
        "rain_24h",
    ],
    "rainfall_72h_mm": [
        "rainfall_72h_mm",
        "rain_72h_mm",
        "rainfall_72h",
        "rain_72h",
    ],
    "rainfall_7d_mm": [
        "rainfall_7d_mm",
        "rain_7d_mm",
        "rainfall_7d",
        "rain_7d",
    ],
    "rainfall_30d_mm": [
        "rainfall_30d_mm",
        "rain_30d_mm",
        "rainfall_30d",
        "rain_30d",
    ],
    "antecedent_rainfall_mm": [
        "antecedent_rainfall_mm",
        "antecedent_rainfall",
        "antecedent_rain_mm",
    ],
    "rainfall_intensity_mm_h": [
        "rainfall_intensity_mm_h",
        "rainfall_intensity",
        "rain_intensity_mm_h",
        "rain_intensity",
    ],
    "soil_moisture": [
        "soil_moisture",
        "soil_moisture_index",
        "soil_moisture_value",
    ],
    "forecast_rainfall_mm": [
        "forecast_rainfall_mm",
        "forecast_rainfall",
        "forecast_rain_mm",
    ],
    "distance_to_road_m": [
        "distance_to_road_m",
        "nearest_road_distance_m",
        "road_distance_m",
        "nearest_road_distance",
        "distance_road_m",
    ],
    "nearest_road_importance": [
        "nearest_road_importance",
        "road_importance",
        "nearest_road_priority",
    ],
    "road_length_1km_m": [
        "road_length_1km_m",
        "road_length_within_1km_m",
        "road_length_1km",
    ],
    "road_length_5km_m": [
        "road_length_5km_m",
        "road_length_within_5km_m",
        "road_length_5km",
    ],
    "road_count_1km": [
        "road_count_1km",
        "roads_within_1km",
        "road_count_within_1km",
    ],
    "road_count_5km": [
        "road_count_5km",
        "roads_within_5km",
        "road_count_within_5km",
    ],
    "road_density_1km_km_per_km2": [
        "road_density_1km_km_per_km2",
        "road_density_1km",
        "road_density_1km_km2",
    ],
    "road_density_5km_km_per_km2": [
        "road_density_5km_km_per_km2",
        "road_density_5km",
        "road_density_5km_km2",
    ],
    "state": [
        "state",
        "state_name",
    ],
    "nearest_road_class": [
        "nearest_road_class",
        "road_class",
        "nearest_class",
    ],
    "lulc_class": [
        "lulc_class",
        "normalized_lulc_class",
        "normalized_class",
        "land_cover_class",
        "lulc",
    ],
    "lithology_class": [
        "lithology_class",
        "normalized_lithology",
        "lithology",
        "geology_class",
    ],
}


# =====================================================================
# MODEL HOLDER
# =====================================================================

_model: XGBClassifier | None = None
_schema: dict[str, Any] | None = None


# =====================================================================
# JSON
# =====================================================================

def load_json(
    path: Path,
) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(
            f"Required model file not found: {path}"
        )

    with path.open(
        "r",
        encoding="utf-8",
    ) as handle:
        value = json.load(handle)

    if not isinstance(value, dict):
        raise ValueError(
            f"Expected JSON object: {path}"
        )

    return value


# =====================================================================
# MODEL LOADING
# =====================================================================

def load_model() -> XGBClassifier:
    global _model

    if _model is None:
        if not MODEL_FILE.exists():
            raise FileNotFoundError(
                "BhooPehra GSI model does not exist. "
                f"Expected: {MODEL_FILE}"
            )

        model = XGBClassifier()

        model.load_model(
            str(MODEL_FILE)
        )

        _model = model

    return _model


def load_schema() -> dict[str, Any]:
    global _schema

    if _schema is None:
        _schema = load_json(
            SCHEMA_FILE
        )

    return _schema


# =====================================================================
# RECURSIVE VALUE LOOKUP
# =====================================================================

def normalize_key(
    value: Any,
) -> str:
    return (
        str(value)
        .strip()
        .lower()
        .replace("-", "_")
        .replace(" ", "_")
    )


def recursive_find(
    obj: Any,
    target_keys: set[str],
    results: list[Any],
) -> None:
    if isinstance(obj, dict):
        for key, value in obj.items():
            if normalize_key(key) in target_keys:
                results.append(value)

            recursive_find(
                value,
                target_keys,
                results,
            )

    elif isinstance(obj, list):
        for item in obj:
            recursive_find(
                item,
                target_keys,
                results,
            )


def resolve_value(
    record: dict[str, Any],
    feature_name: str,
) -> Any:
    aliases = ALIASES.get(
        feature_name,
        [feature_name],
    )

    targets = {
        normalize_key(alias)
        for alias in aliases
    }

    results: list[Any] = []

    recursive_find(
        record,
        targets,
        results,
    )

    if not results:
        return None

    for value in results:
        if value is None:
            continue

        if isinstance(value, str):
            if value.strip():
                return value
        else:
            return value

    return None


# =====================================================================
# CATEGORY NORMALIZATION
# =====================================================================

def normalize_category(
    value: Any,
) -> str:
    if value is None:
        return "UNKNOWN"

    text = str(value).strip()

    if not text:
        return "UNKNOWN"

    return text.upper()


# =====================================================================
# NUMERIC VALUE
# =====================================================================

def numeric_value(
    value: Any,
) -> float | None:
    if value is None:
        return None

    try:
        number = float(value)

        if not math.isfinite(number):
            return None

        return number

    except (
        TypeError,
        ValueError,
    ):
        return None


# =====================================================================
# FEATURE VECTOR
# =====================================================================

def build_feature_vector(
    record: dict[str, Any],
) -> tuple[
    np.ndarray,
    list[str],
    list[str],
]:
    schema = load_schema()

    selected_features = schema.get(
        "selected_features",
        [],
    )

    vocabularies = schema.get(
        "categorical_vocabularies",
        {},
    )

    medians = schema.get(
        "numeric_medians",
        [],
    )

    if not selected_features:
        raise RuntimeError(
            "Model schema contains no selected_features."
        )

    values: list[float] = []
    feature_names: list[str] = []
    missing_features: list[str] = []

    numeric_feature_names = set(
        schema.get(
            "numeric_features",
            [],
        )
    )

    for feature_name in selected_features:

        # ---------------------------------------------------------
        # Numeric feature
        # ---------------------------------------------------------

        if feature_name in numeric_feature_names:
            raw = resolve_value(
                record,
                feature_name,
            )

            number = numeric_value(
                raw
            )

            if number is None:
                missing_features.append(
                    feature_name
                )

                # Find the matching median by position.
                try:
                    numeric_index = (
                        schema[
                            "numeric_features"
                        ].index(
                            feature_name
                        )
                    )

                    number = float(
                        medians[
                            numeric_index
                        ]
                    )

                except (
                    ValueError,
                    IndexError,
                    KeyError,
                ):
                    number = 0.0

            values.append(
                float(number)
            )

            feature_names.append(
                feature_name
            )

            continue

        # ---------------------------------------------------------
        # One-hot categorical feature
        # ---------------------------------------------------------

        if "__" in feature_name:
            base_feature, category = (
                feature_name.split(
                    "__",
                    1,
                )
            )

            raw = resolve_value(
                record,
                base_feature,
            )

            actual = normalize_category(
                raw
            )

            values.append(
                1.0
                if actual == category
                else 0.0
            )

            feature_names.append(
                feature_name
            )

            continue

        # ---------------------------------------------------------
        # Unknown schema feature
        # ---------------------------------------------------------

        values.append(0.0)

        feature_names.append(
            feature_name
        )

    vector = np.asarray(
        [values],
        dtype=float,
    )

    return (
        vector,
        feature_names,
        missing_features,
    )


# =====================================================================
# RISK CLASSIFICATION
# =====================================================================

def risk_level(
    probability: float,
) -> str:
    if probability >= 0.80:
        return "CRITICAL"

    if probability >= 0.60:
        return "HIGH"

    if probability >= 0.40:
        return "MODERATE"

    return "LOW"


def confidence_level(
    probability: float,
    missing_count: int,
    total_features: int,
) -> str:
    if total_features <= 0:
        return "LOW"

    missing_ratio = (
        missing_count
        / total_features
    )

    distance_from_boundary = abs(
        probability - 0.50
    )

    if (
        missing_ratio <= 0.10
        and distance_from_boundary >= 0.25
    ):
        return "HIGH"

    if (
        missing_ratio <= 0.25
        and distance_from_boundary >= 0.10
    ):
        return "MEDIUM"

    return "LOW"


# =====================================================================
# EVIDENCE
# =====================================================================

def build_evidence(
    record: dict[str, Any],
) -> list[dict[str, Any]]:
    evidence = []

    slope = numeric_value(
        resolve_value(
            record,
            "slope_deg",
        )
    )

    rainfall_24h = numeric_value(
        resolve_value(
            record,
            "rainfall_24h_mm",
        )
    )

    rainfall_72h = numeric_value(
        resolve_value(
            record,
            "rainfall_72h_mm",
        )
    )

    soil_moisture = numeric_value(
        resolve_value(
            record,
            "soil_moisture",
        )
    )

    distance_to_road = numeric_value(
        resolve_value(
            record,
            "distance_to_road_m",
        )
    )

    road_density = numeric_value(
        resolve_value(
            record,
            "road_density_1km_km_per_km2",
        )
    )

    lulc = normalize_category(
        resolve_value(
            record,
            "lulc_class",
        )
    )

    lithology = normalize_category(
        resolve_value(
            record,
            "lithology_class",
        )
    )

    if slope is not None:
        evidence.append(
            {
                "feature": "slope_deg",
                "value": slope,
                "description": (
                    f"Terrain slope: {slope:.2f}°"
                ),
            }
        )

    if rainfall_24h is not None:
        evidence.append(
            {
                "feature": "rainfall_24h_mm",
                "value": rainfall_24h,
                "description": (
                    f"24-hour rainfall: "
                    f"{rainfall_24h:.2f} mm"
                ),
            }
        )

    if rainfall_72h is not None:
        evidence.append(
            {
                "feature": "rainfall_72h_mm",
                "value": rainfall_72h,
                "description": (
                    f"72-hour rainfall: "
                    f"{rainfall_72h:.2f} mm"
                ),
            }
        )

    if soil_moisture is not None:
        evidence.append(
            {
                "feature": "soil_moisture",
                "value": soil_moisture,
                "description": (
                    f"Soil moisture indicator: "
                    f"{soil_moisture:.3f}"
                ),
            }
        )

    if distance_to_road is not None:
        evidence.append(
            {
                "feature": "distance_to_road_m",
                "value": distance_to_road,
                "description": (
                    f"Nearest mapped road: "
                    f"{distance_to_road:.1f} m"
                ),
            }
        )

    if road_density is not None:
        evidence.append(
            {
                "feature": (
                    "road_density_1km_km_per_km2"
                ),
                "value": road_density,
                "description": (
                    f"Road density within 1 km: "
                    f"{road_density:.3f} km/km²"
                ),
            }
        )

    if lulc != "UNKNOWN":
        evidence.append(
            {
                "feature": "lulc_class",
                "value": lulc,
                "description": (
                    f"Land-cover class: {lulc}"
                ),
            }
        )

    if lithology != "UNKNOWN":
        evidence.append(
            {
                "feature": "lithology_class",
                "value": lithology,
                "description": (
                    f"Lithology class: {lithology}"
                ),
            }
        )

    return evidence


# =====================================================================
# PUBLIC INFERENCE FUNCTION
# =====================================================================

def predict_risk(
    record: dict[str, Any],
) -> dict[str, Any]:
    model = load_model()
    schema = load_schema()

    (
        vector,
        feature_names,
        missing_features,
    ) = build_feature_vector(
        record
    )

    probability = float(
        model.predict_proba(
            vector
        )[0, 1]
    )

    probability = max(
        0.0,
        min(
            1.0,
            probability,
        ),
    )

    level = risk_level(
        probability
    )

    confidence = confidence_level(
        probability,
        len(missing_features),
        len(feature_names),
    )

    evidence = build_evidence(
        record
    )

    record_id = (
        record.get("record_id")
        or record.get("id")
        or record.get("sample_id")
    )

    return {
        "record_id": record_id,
        "model": {
            "name": "BhooPehra GSI XGBoost",
            "version": schema.get(
                "schema_version",
                "unknown",
            ),
        },
        "prediction": {
            "landslide_probability": round(
                probability,
                4,
            ),
            "landslide_probability_percent": round(
                probability * 100,
                2,
            ),
            "risk_level": level,
            "confidence": confidence,
        },
        "features": {
            "used": feature_names,
            "missing_and_imputed": (
                missing_features
            ),
        },
        "evidence": evidence,
        "warnings": [
            "Prototype model trained on a small historical/background dataset.",
            "Background samples are not confirmed landslide-free observations.",
            "Prediction is a risk score, not a guaranteed landslide forecast.",
        ],
    }


# =====================================================================
# HEALTH CHECK
# =====================================================================

def model_health() -> dict[str, Any]:
    model = load_model()
    schema = load_schema()

    return {
        "status": "READY",
        "model_file": str(
            MODEL_FILE
        ),
        "schema_file": str(
            SCHEMA_FILE
        ),
        "feature_count": len(
            schema.get(
                "selected_features",
                [],
            )
        ),
        "model_loaded": (
            model is not None
        ),
        "risk_threshold": schema.get(
            "risk_threshold",
            0.50,
        ),
    }


# =====================================================================
# LOCAL TEST
# =====================================================================

if __name__ == "__main__":
    print()
    print("=" * 72)
    print(
        "BhooPehra - GSI Model Inference Test"
    )
    print("=" * 72)

    health = model_health()

    print()
    print("MODEL HEALTH:")
    print(
        json.dumps(
            health,
            indent=2,
        )
    )

    test_record = {
        "record_id": "LOCAL-TEST-001",

        "elevation_m": 1500,
        "slope_deg": 32,
        "aspect_deg": 145,

        "rainfall_24h_mm": 80,
        "rainfall_72h_mm": 150,

        "soil_moisture": 0.65,

        "distance_to_road_m": 250,
        "nearest_road_importance": 3,

        "road_length_1km_m": 5000,
        "road_length_5km_m": 50000,

        "road_count_1km": 15,
        "road_count_5km": 70,

        "road_density_1km_km_per_km2": 1.59,
        "road_density_5km_km_per_km2": 0.64,

        "state": "SIKKIM",

        "nearest_road_class": (
            "NATIONAL_HIGHWAY"
        ),

        "lulc_class": "FOREST",

        "lithology_class": (
            "METAMORPHIC"
        ),
    }

    result = predict_risk(
        test_record
    )

    print()
    print("TEST PREDICTION:")
    print(
        json.dumps(
            result,
            indent=2,
        )
    )

    print()
    print(
        "Database modified: False"
    )

    print("=" * 72)