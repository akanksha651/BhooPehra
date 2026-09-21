"""
BhooPehra - GSI Landslide ML Model Training

Leakage-controlled prototype training pipeline.

Important:
- Latitude, longitude and district are NOT used as ML predictors.
- Database is never modified.
- Background samples are sampled background locations, not confirmed
  landslide-free observations.
- Missing numeric values are handled with training-fold median imputation.
- Stratified CV is provided for an initial baseline.
- Spatial/temporal holdout validation is still required before production.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold

try:
    from xgboost import XGBClassifier
except ImportError as exc:
    raise RuntimeError(
        "xgboost is not installed. Run: pip install xgboost"
    ) from exc


# =====================================================================
# PATHS
# =====================================================================

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data" / "gsi"

INPUT_FILE = DATA_DIR / "gsi_final_training_dataset.json"

MODEL_DIR = DATA_DIR / "model"

MODEL_FILE = (
    MODEL_DIR / "bhoopehra_gsi_xgboost_model.json"
)

SCHEMA_FILE = (
    MODEL_DIR / "bhoopehra_gsi_feature_schema.json"
)

METRICS_FILE = (
    MODEL_DIR / "bhoopehra_gsi_training_metrics.json"
)

IMPORTANCE_FILE = (
    MODEL_DIR / "bhoopehra_gsi_feature_importance.json"
)


# =====================================================================
# CONFIGURATION
# =====================================================================

RANDOM_STATE = 42
N_SPLITS = 5

# Initial classification threshold.
RISK_THRESHOLD = 0.50

# If a single feature receives this much importance, flag it.
DOMINANCE_WARNING_THRESHOLD = 0.70

# Features with less than this coverage are excluded.
# 84.6% road-distance coverage is retained.
MIN_NUMERIC_COVERAGE = 0.50


XGB_PARAMS = {
    "n_estimators": 120,
    "max_depth": 2,
    "learning_rate": 0.05,
    "subsample": 0.85,
    "colsample_bytree": 0.80,
    "min_child_weight": 3,
    "reg_alpha": 0.20,
    "reg_lambda": 2.00,
    "objective": "binary:logistic",
    "eval_metric": "logloss",
    "random_state": RANDOM_STATE,
    "n_jobs": -1,
    "tree_method": "hist",
}


# =====================================================================
# FEATURES
# =====================================================================

# Deliberately excludes:
# - latitude
# - longitude
# - district
#
# These can create geographic memorization / missingness leakage.

NUMERIC_FEATURES = [
    "elevation_m",
    "slope_deg",
    "aspect_deg",
    "curvature",
    "roughness",
    "tpi",
    "rainfall_24h_mm",
    "rainfall_72h_mm",
    "rainfall_7d_mm",
    "rainfall_30d_mm",
    "antecedent_rainfall_mm",
    "rainfall_intensity_mm_h",
    "soil_moisture",
    "forecast_rainfall_mm",
    "distance_to_road_m",
    "nearest_road_importance",
    "road_length_1km_m",
    "road_length_5km_m",
    "road_count_1km",
    "road_count_5km",
    "road_density_1km_km_per_km2",
    "road_density_5km_km_per_km2",
]


CATEGORICAL_FEATURES = [
    "state",
    "nearest_road_class",
    "lulc_class",
    "lithology_class",
]


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
    "curvature": [
        "curvature",
        "curvature_value",
        "profile_curvature",
        "plan_curvature",
    ],
    "roughness": [
        "roughness",
        "terrain_roughness",
        "terrain_roughness_m",
    ],
    "tpi": [
        "tpi",
        "topographic_position_index",
        "topographic_position",
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
# BASIC HELPERS
# =====================================================================

def utc_now() -> str:
    return datetime.now(
        timezone.utc
    ).isoformat()


def load_json(
    path: Path,
) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(
            f"Input file not found: {path}"
        )

    with path.open(
        "r",
        encoding="utf-8",
    ) as handle:
        data = json.load(handle)

    if not isinstance(data, dict):
        raise ValueError(
            f"Expected JSON object in {path}"
        )

    return data


def save_json(
    path: Path,
    data: Any,
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
            data,
            handle,
            indent=2,
            ensure_ascii=False,
        )


def get_records(
    payload: dict[str, Any],
) -> list[dict[str, Any]]:
    for key in (
        "feature_records",
        "records",
        "samples",
        "features",
    ):
        value = payload.get(key)

        if isinstance(value, list):
            return [
                item
                for item in value
                if isinstance(item, dict)
            ]

    raise ValueError(
        "Could not find training records."
    )


# =====================================================================
# RECURSIVE FEATURE LOOKUP
# =====================================================================

def normalize_key(
    key: Any,
) -> str:
    return (
        str(key)
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


def resolve_feature_value(
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

    matches: list[Any] = []

    recursive_find(
        record,
        targets,
        matches,
    )

    if not matches:
        return None

    # Prefer numeric values for numeric features.
    for value in matches:
        try:
            number = float(value)

            if math.isfinite(number):
                return number

        except (
            TypeError,
            ValueError,
        ):
            continue

    for value in matches:
        if value is None:
            continue

        if isinstance(value, str):
            if value.strip():
                return value
        else:
            return value

    return None


# =====================================================================
# LABEL / RECORD ID
# =====================================================================

def canonical_label(
    record: dict[str, Any],
) -> int | None:
    raw = None

    for key in (
        "label",
        "target",
        "target_label",
        "class_label",
    ):
        if key in record:
            raw = record[key]
            break

    if raw is None:
        return None

    try:
        value = int(raw)

        if value in (0, 1):
            return value

    except (
        TypeError,
        ValueError,
    ):
        pass

    text = str(raw).strip().upper()

    if text in {
        "POSITIVE",
        "LANDSLIDE",
        "EVENT",
        "1",
        "TRUE",
    }:
        return 1

    if text in {
        "BACKGROUND",
        "NEGATIVE",
        "NON_LANDSLIDE",
        "0",
        "FALSE",
    }:
        return 0

    return None


def canonical_record_id(
    record: dict[str, Any],
    index: int,
) -> str:
    for key in (
        "record_id",
        "id",
        "sample_id",
        "candidate_id",
        "source_record_id",
    ):
        value = record.get(key)

        if value is not None:
            text = str(value).strip()

            if text:
                return text

    return f"RECORD_{index:04d}"


# =====================================================================
# CATEGORICAL ENCODING
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


def build_vocabularies(
    records: list[dict[str, Any]],
) -> dict[str, list[str]]:
    vocabularies = {}

    for feature_name in CATEGORICAL_FEATURES:
        values = set()

        for record in records:
            value = resolve_feature_value(
                record,
                feature_name,
            )

            values.add(
                normalize_category(value)
            )

        vocabularies[
            feature_name
        ] = sorted(values)

    return vocabularies


# =====================================================================
# MATRIX
# =====================================================================

def build_matrix(
    records: list[dict[str, Any]],
    vocabularies: dict[str, list[str]],
) -> tuple[
    np.ndarray,
    list[str],
    dict[str, int],
]:
    rows = []

    coverage = {}

    for feature_name in (
        NUMERIC_FEATURES
        + CATEGORICAL_FEATURES
    ):
        coverage[
            feature_name
        ] = 0

    for record in records:
        row = []

        for feature_name in NUMERIC_FEATURES:
            value = resolve_feature_value(
                record,
                feature_name,
            )

            number = None

            try:
                if value is not None:
                    number = float(value)

                    if not math.isfinite(
                        number
                    ):
                        number = None

            except (
                TypeError,
                ValueError,
            ):
                number = None

            if number is None:
                row.append(
                    float("nan")
                )
            else:
                row.append(number)
                coverage[
                    feature_name
                ] += 1

        for feature_name in CATEGORICAL_FEATURES:
            value = normalize_category(
                resolve_feature_value(
                    record,
                    feature_name,
                )
            )

            if value != "UNKNOWN":
                coverage[
                    feature_name
                ] += 1

            for category in vocabularies[
                feature_name
            ]:
                row.append(
                    1.0
                    if value == category
                    else 0.0
                )

        rows.append(row)

    feature_names = list(
        NUMERIC_FEATURES
    )

    for feature_name in CATEGORICAL_FEATURES:
        for category in vocabularies[
            feature_name
        ]:
            feature_names.append(
                f"{feature_name}__{category}"
            )

    return (
        np.asarray(
            rows,
            dtype=float,
        ),
        feature_names,
        coverage,
    )


# =====================================================================
# FEATURE FILTERING
# =====================================================================

def select_features(
    matrix: np.ndarray,
    feature_names: list[str],
    coverage: dict[str, int],
    total_records: int,
) -> tuple[
    np.ndarray,
    list[str],
    list[str],
]:
    keep = []
    dropped = []

    for index, feature_name in enumerate(
        feature_names
    ):
        # Base numeric/categorical feature.
        if feature_name in coverage:
            ratio = (
                coverage[
                    feature_name
                ]
                / total_records
            )

            if ratio < MIN_NUMERIC_COVERAGE:
                dropped.append(
                    feature_name
                )
                continue

        keep.append(index)

    return (
        matrix[:, keep],
        [
            feature_names[index]
            for index in keep
        ],
        dropped,
    )


# =====================================================================
# IMPUTATION
# =====================================================================

def fit_medians(
    X: np.ndarray,
) -> np.ndarray:
    medians = np.zeros(
        X.shape[1],
        dtype=float,
    )

    for index in range(
        X.shape[1]
    ):
        values = X[:, index]

        valid = values[
            np.isfinite(values)
        ]

        if len(valid):
            medians[index] = float(
                np.median(valid)
            )
        else:
            medians[index] = 0.0

    return medians


def apply_medians(
    X: np.ndarray,
    medians: np.ndarray,
) -> np.ndarray:
    result = X.copy()

    for index in range(
        result.shape[1]
    ):
        mask = ~np.isfinite(
            result[:, index]
        )

        result[
            mask,
            index,
        ] = medians[index]

    return result


# =====================================================================
# METRICS
# =====================================================================

def safe_roc_auc(
    y_true: np.ndarray,
    probability: np.ndarray,
) -> float | None:
    if len(
        np.unique(y_true)
    ) < 2:
        return None

    return float(
        roc_auc_score(
            y_true,
            probability,
        )
    )


def safe_pr_auc(
    y_true: np.ndarray,
    probability: np.ndarray,
) -> float | None:
    if len(
        np.unique(y_true)
    ) < 2:
        return None

    return float(
        average_precision_score(
            y_true,
            probability,
        )
    )


def calculate_metrics(
    y_true: np.ndarray,
    probability: np.ndarray,
) -> dict[str, Any]:
    prediction = (
        probability
        >= RISK_THRESHOLD
    ).astype(int)

    cm = confusion_matrix(
        y_true,
        prediction,
        labels=[0, 1],
    )

    tn, fp, fn, tp = cm.ravel()

    return {
        "threshold": RISK_THRESHOLD,
        "accuracy": float(
            accuracy_score(
                y_true,
                prediction,
            )
        ),
        "precision": float(
            precision_score(
                y_true,
                prediction,
                zero_division=0,
            )
        ),
        "recall": float(
            recall_score(
                y_true,
                prediction,
                zero_division=0,
            )
        ),
        "f1": float(
            f1_score(
                y_true,
                prediction,
                zero_division=0,
            )
        ),
        "roc_auc": safe_roc_auc(
            y_true,
            probability,
        ),
        "pr_auc": safe_pr_auc(
            y_true,
            probability,
        ),
        "brier_score": float(
            brier_score_loss(
                y_true,
                probability,
            )
        ),
        "confusion_matrix": {
            "true_negative": int(tn),
            "false_positive": int(fp),
            "false_negative": int(fn),
            "true_positive": int(tp),
        },
    }


# =====================================================================
# CROSS VALIDATION
# =====================================================================

def cross_validate(
    X: np.ndarray,
    y: np.ndarray,
) -> dict[str, Any]:
    counts = np.bincount(y)

    nonzero = counts[
        counts > 0
    ]

    if len(nonzero) < 2:
        return {
            "status": "INSUFFICIENT_CLASSES",
            "folds": [],
        }

    n_splits = min(
        N_SPLITS,
        int(nonzero.min()),
    )

    if n_splits < 2:
        return {
            "status": "INSUFFICIENT_CLASS_SUPPORT",
            "folds": [],
        }

    splitter = StratifiedKFold(
        n_splits=n_splits,
        shuffle=True,
        random_state=RANDOM_STATE,
    )

    folds = []

    pooled_y = []
    pooled_probability = []

    for fold_number, (
        train_index,
        test_index,
    ) in enumerate(
        splitter.split(X, y),
        start=1,
    ):
        X_train = X[
            train_index
        ]

        X_test = X[
            test_index
        ]

        y_train = y[
            train_index
        ]

        y_test = y[
            test_index
        ]

        medians = fit_medians(
            X_train
        )

        X_train = apply_medians(
            X_train,
            medians,
        )

        X_test = apply_medians(
            X_test,
            medians,
        )

        model = XGBClassifier(
            **XGB_PARAMS
        )

        model.fit(
            X_train,
            y_train,
            verbose=False,
        )

        probability = (
            model.predict_proba(
                X_test
            )[:, 1]
        )

        metrics = calculate_metrics(
            y_test,
            probability,
        )

        metrics[
            "fold"
        ] = fold_number

        metrics[
            "test_samples"
        ] = int(
            len(test_index)
        )

        folds.append(
            metrics
        )

        pooled_y.extend(
            y_test.tolist()
        )

        pooled_probability.extend(
            probability.tolist()
        )

    pooled_y = np.asarray(
        pooled_y,
        dtype=int,
    )

    pooled_probability = np.asarray(
        pooled_probability,
        dtype=float,
    )

    pooled_metrics = calculate_metrics(
        pooled_y,
        pooled_probability,
    )

    metric_names = [
        "accuracy",
        "precision",
        "recall",
        "f1",
        "roc_auc",
        "pr_auc",
        "brier_score",
    ]

    mean_metrics = {}

    for name in metric_names:
        values = [
            fold[name]
            for fold in folds
            if fold.get(name)
            is not None
        ]

        mean_metrics[
            name
        ] = (
            float(np.mean(values))
            if values
            else None
        )

    return {
        "status": "PASS",
        "n_splits": n_splits,
        "folds": folds,
        "mean_fold_metrics": mean_metrics,
        "pooled_out_of_fold_metrics": pooled_metrics,
    }


# =====================================================================
# CALIBRATION
# =====================================================================

def calibration_summary(
    y_true: np.ndarray,
    probability: np.ndarray,
) -> dict[str, Any]:
    try:
        fraction_positive, mean_probability = (
            calibration_curve(
                y_true,
                probability,
                n_bins=5,
                strategy="uniform",
            )
        )

        return {
            "status": "PASS",
            "fraction_positive": [
                float(value)
                for value in fraction_positive
            ],
            "mean_predicted_probability": [
                float(value)
                for value in mean_probability
            ],
        }

    except Exception as exc:
        return {
            "status": "ERROR",
            "error": str(exc),
        }


# =====================================================================
# IMPORTANCE
# =====================================================================

def get_importance(
    model: XGBClassifier,
    feature_names: list[str],
) -> list[dict[str, Any]]:
    values = (
        model.feature_importances_
    )

    results = []

    for index, feature in enumerate(
        feature_names
    ):
        results.append(
            {
                "feature": feature,
                "importance": float(
                    values[index]
                ),
            }
        )

    results.sort(
        key=lambda item: item[
            "importance"
        ],
        reverse=True,
    )

    for rank, item in enumerate(
        results,
        start=1,
    ):
        item["rank"] = rank

    return results


# =====================================================================
# MAIN
# =====================================================================

def run_training() -> dict[str, Any]:
    print()
    print("=" * 72)
    print(
        "BhooPehra - Leakage-Controlled GSI ML Training"
    )
    print("=" * 72)

    print()
    print("Input dataset:")
    print(
        f"  {INPUT_FILE}"
    )

    payload = load_json(
        INPUT_FILE
    )

    records = get_records(
        payload
    )

    print()
    print(
        f"Training records loaded: {len(records)}"
    )

    prepared = []

    for index, record in enumerate(
        records,
        start=1,
    ):
        label = canonical_label(
            record
        )

        if label is None:
            continue

        prepared.append(
            {
                "record_id": canonical_record_id(
                    record,
                    index,
                ),
                "label": label,
                "record": record,
            }
        )

    positive = sum(
        item["label"] == 1
        for item in prepared
    )

    background = sum(
        item["label"] == 0
        for item in prepared
    )

    print()
    print("LABEL DISTRIBUTION:")
    print(
        f"  Positive: {positive}"
    )
    print(
        f"  Background: {background}"
    )

    if positive < 2 or background < 2:
        raise RuntimeError(
            "Both classes require at least two records."
        )

    raw_records = [
        item["record"]
        for item in prepared
    ]

    vocabularies = (
        build_vocabularies(
            raw_records
        )
    )

    (
        matrix,
        feature_names,
        coverage,
    ) = build_matrix(
        raw_records,
        vocabularies,
    )

    # -------------------------------------------------------------
    # Coverage
    # -------------------------------------------------------------

    print()
    print("-" * 72)
    print(
        "FEATURE COVERAGE"
    )
    print("-" * 72)

    coverage_report = {}

    for feature_name in (
        NUMERIC_FEATURES
        + CATEGORICAL_FEATURES
    ):
        available = coverage[
            feature_name
        ]

        percentage = (
            available
            / len(prepared)
            * 100
        )

        coverage_report[
            feature_name
        ] = {
            "available": int(
                available
            ),
            "total": len(
                prepared
            ),
            "coverage_percent": round(
                percentage,
                2,
            ),
        }

        print(
            f"  {feature_name}: "
            f"{available}/{len(prepared)} "
            f"({percentage:.1f}%)"
        )

    (
        matrix,
        selected_feature_names,
        dropped_features,
    ) = select_features(
        matrix,
        feature_names,
        coverage,
        len(prepared),
    )

    print()
    print(
        f"Features before filtering: "
        f"{len(feature_names)}"
    )

    print(
        f"Features after filtering: "
        f"{len(selected_feature_names)}"
    )

    if dropped_features:
        print()
        print(
            "Dropped unavailable/low-coverage features:"
        )

        for feature in dropped_features:
            print(
                f"  - {feature}"
            )

    missing_cells = int(
        np.sum(
            ~np.isfinite(matrix)
        )
    )

    print()
    print(
        f"Missing feature cells before "
        f"imputation: {missing_cells}"
    )

    y = np.asarray(
        [
            item["label"]
            for item in prepared
        ],
        dtype=int,
    )

    # -------------------------------------------------------------
    # Cross-validation
    # -------------------------------------------------------------

    print()
    print("-" * 72)
    print(
        "STRATIFIED CROSS-VALIDATION"
    )
    print("-" * 72)

    cv_results = cross_validate(
        matrix,
        y,
    )

    print(
        f"Status: {cv_results['status']}"
    )

    if cv_results["status"] == "PASS":
        print(
            f"Folds: "
            f"{cv_results['n_splits']}"
        )

        mean_metrics = (
            cv_results[
                "mean_fold_metrics"
            ]
        )

        for name in (
            "accuracy",
            "precision",
            "recall",
            "f1",
            "roc_auc",
            "pr_auc",
            "brier_score",
        ):
            value = mean_metrics.get(
                name
            )

            if value is None:
                print(
                    f"  {name}: N/A"
                )
            else:
                print(
                    f"  {name}: "
                    f"{value:.4f}"
                )

    # -------------------------------------------------------------
    # Final model
    # -------------------------------------------------------------

    print()
    print("-" * 72)
    print(
        "FINAL MODEL TRAINING"
    )
    print("-" * 72)

    medians = fit_medians(
        matrix
    )

    X_final = apply_medians(
        matrix,
        medians,
    )

    model = XGBClassifier(
        **XGB_PARAMS
    )

    model.fit(
        X_final,
        y,
        verbose=False,
    )

    training_probability = (
        model.predict_proba(
            X_final
        )[:, 1]
    )

    training_metrics = (
        calculate_metrics(
            y,
            training_probability,
        )
    )

    calibration = (
        calibration_summary(
            y,
            training_probability,
        )
    )

    print(
        f"Training ROC-AUC: "
        f"{training_metrics['roc_auc']:.4f}"
    )

    print(
        f"Training PR-AUC: "
        f"{training_metrics['pr_auc']:.4f}"
    )

    print(
        f"Training F1: "
        f"{training_metrics['f1']:.4f}"
    )

    print(
        f"Training Brier score: "
        f"{training_metrics['brier_score']:.4f}"
    )

    # -------------------------------------------------------------
    # Feature importance
    # -------------------------------------------------------------

    importance = get_importance(
        model,
        selected_feature_names,
    )

    print()
    print(
        "TOP 20 FEATURES:"
    )

    for item in importance[:20]:
        print(
            f"  {item['rank']:02d}. "
            f"{item['feature']}: "
            f"{item['importance']:.6f}"
        )

    top_feature = (
        importance[0]
        if importance
        else None
    )

    if (
        top_feature
        and top_feature["importance"]
        >= DOMINANCE_WARNING_THRESHOLD
    ):
        dominance_status = (
            "WARNING"
        )

        print()
        print(
            "WARNING:"
        )
        print(
            f"  Feature "
            f"'{top_feature['feature']}' "
            f"dominates the model with "
            f"{top_feature['importance']:.3f} importance."
        )
    else:
        dominance_status = "OK"

    # -------------------------------------------------------------
    # Save model
    # -------------------------------------------------------------

    MODEL_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    model.save_model(
        str(MODEL_FILE)
    )

    schema = {
        "schema_version": "3.0",
        "generated_at_utc": utc_now(),
        "model_type": "XGBoostClassifier",
        "feature_count": len(
            selected_feature_names
        ),
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "selected_features": selected_feature_names,
        "dropped_features": dropped_features,
        "categorical_vocabularies": vocabularies,
        "numeric_medians": [
            float(value)
            for value in medians
        ],
        "risk_threshold": RISK_THRESHOLD,
        "random_state": RANDOM_STATE,
        "xgboost_parameters": XGB_PARAMS,
        "excluded_predictors": [
            "latitude",
            "longitude",
            "district",
        ],
        "notes": [
            "Geographic coordinates are excluded to reduce spatial memorization.",
            "District is excluded because missing district values were strongly associated with the background class.",
            "Missing numeric values are imputed using training-fold medians during CV.",
            "The final model uses medians fitted on the complete prototype dataset.",
            "Background samples are sampled background locations, not confirmed negatives.",
            "Random stratified CV is only a baseline and is not equivalent to spatial/temporal validation.",
            "Production deployment requires more historical events and stronger spatial/temporal validation.",
        ],
    }

    save_json(
        SCHEMA_FILE,
        schema,
    )

    save_json(
        IMPORTANCE_FILE,
        {
            "generated_at_utc": utc_now(),
            "model": "XGBoostClassifier",
            "dominance_status": dominance_status,
            "feature_importance": importance,
        },
    )

    metrics_payload = {
        "generated_at_utc": utc_now(),
        "dataset": {
            "input_file": str(
                INPUT_FILE
            ),
            "records_loaded": len(
                records
            ),
            "records_used": len(
                prepared
            ),
            "positive": positive,
            "background": background,
            "unknown_labels_excluded": (
                len(records)
                - len(prepared)
            ),
        },
        "feature_coverage": coverage_report,
        "feature_matrix": {
            "features_before_filtering": len(
                feature_names
            ),
            "features_after_filtering": len(
                selected_feature_names
            ),
            "dropped_features": dropped_features,
            "missing_cells_before_imputation": missing_cells,
        },
        "leakage_controls": {
            "latitude_used": False,
            "longitude_used": False,
            "district_used": False,
            "dominance_warning_threshold": DOMINANCE_WARNING_THRESHOLD,
            "dominance_status": dominance_status,
        },
        "training": {
            "model": "XGBoostClassifier",
            "parameters": XGB_PARAMS,
            "risk_threshold": RISK_THRESHOLD,
            "training_metrics": training_metrics,
            "calibration": calibration,
        },
        "cross_validation": cv_results,
        "scientific_cautions": [
            "Only 39 prototype samples are currently available.",
            "Background candidates are not confirmed landslide-free observations.",
            "Perfect validation scores should not be interpreted as production performance.",
            "Spatial holdout validation is required because nearby locations can be correlated.",
            "Temporal holdout validation is required when enough dated events are available.",
            "The model currently does not contain all intended dynamic rainfall features because those source features are unavailable in the fused dataset.",
        ],
        "database_modified": False,
    }

    save_json(
        METRICS_FILE,
        metrics_payload,
    )

    # -------------------------------------------------------------
    # Final report
    # -------------------------------------------------------------

    print()
    print("=" * 72)
    print(
        "MODEL TRAINING REPORT"
    )
    print("=" * 72)

    print(
        f"Records used: {len(prepared)}"
    )

    print(
        f"Positive: {positive}"
    )

    print(
        f"Background: {background}"
    )

    print(
        f"Features used: "
        f"{len(selected_feature_names)}"
    )

    print(
        f"Missing cells before imputation: "
        f"{missing_cells}"
    )

    print()
    print(
        "LEAKAGE CONTROLS:"
    )

    print(
        "  Latitude: EXCLUDED"
    )

    print(
        "  Longitude: EXCLUDED"
    )

    print(
        "  District: EXCLUDED"
    )

    print(
        f"  Dominant feature check: "
        f"{dominance_status}"
    )

    print()
    print(
        "OUTPUT FILES:"
    )

    print(
        f"  Model: {MODEL_FILE}"
    )

    print(
        f"  Schema: {SCHEMA_FILE}"
    )

    print(
        f"  Metrics: {METRICS_FILE}"
    )

    print(
        f"  Importance: {IMPORTANCE_FILE}"
    )

    print()
    print(
        "Database modified: False"
    )

    print("=" * 72)

    return {
        "records": len(prepared),
        "positive": positive,
        "background": background,
        "feature_count": len(
            selected_feature_names
        ),
        "cross_validation": cv_results,
        "training_metrics": training_metrics,
        "dominance_status": dominance_status,
    }


if __name__ == "__main__":
    run_training()