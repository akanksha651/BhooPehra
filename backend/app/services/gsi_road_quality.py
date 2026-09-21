from __future__ import annotations

import json
import math
import statistics
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parents[2]

INPUT_DATASET = (
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


DISTANCE_OUTLIER_M = 5000.0
DENSITY_OUTLIER_1KM_M = 50000.0
DENSITY_OUTLIER_5KM_M = 250000.0


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(
            f"Input dataset not found: {path}"
        )

    with path.open(
        "r",
        encoding="utf-8",
    ) as handle:
        payload = json.load(handle)

    if not isinstance(payload, dict):
        raise ValueError(
            "Road dataset must be a JSON object."
        )

    return payload


def write_json(
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
    ) as handle:
        json.dump(
            payload,
            handle,
            indent=2,
            ensure_ascii=False,
        )


def percentile(
    values: list[float],
    p: float,
) -> float | None:

    if not values:
        return None

    ordered = sorted(values)

    if len(ordered) == 1:
        return ordered[0]

    position = (
        (len(ordered) - 1)
        * p
    )

    lower = math.floor(position)
    upper = math.ceil(position)

    if lower == upper:
        return ordered[lower]

    fraction = (
        position - lower
    )

    return (
        ordered[lower]
        + (
            ordered[upper]
            - ordered[lower]
        )
        * fraction
    )


def summary(
    values: list[float],
) -> dict[str, float | int | None]:

    if not values:
        return {
            "count": 0,
            "min": None,
            "p25": None,
            "median": None,
            "mean": None,
            "p75": None,
            "p95": None,
            "max": None,
            "std": None,
        }

    return {
        "count": len(values),
        "min": round(
            min(values),
            3,
        ),
        "p25": round(
            percentile(
                values,
                0.25,
            ),
            3,
        ),
        "median": round(
            statistics.median(values),
            3,
        ),
        "mean": round(
            statistics.mean(values),
            3,
        ),
        "p75": round(
            percentile(
                values,
                0.75,
            ),
            3,
        ),
        "p95": round(
            percentile(
                values,
                0.95,
            ),
            3,
        ),
        "max": round(
            max(values),
            3,
        ),
        "std": round(
            statistics.stdev(values)
            if len(values) > 1
            else 0.0,
            3,
        ),
    }


def safe_float(
    value: Any,
) -> float | None:

    if value is None:
        return None

    try:
        result = float(value)

        if not math.isfinite(result):
            return None

        return result

    except (
        TypeError,
        ValueError,
    ):
        return None


def validate_distance(
    value: float | None,
) -> list[str]:

    issues: list[str] = []

    if value is None:
        issues.append(
            "MISSING_DISTANCE"
        )
        return issues

    if value < 0:
        issues.append(
            "NEGATIVE_DISTANCE"
        )

    if value > DISTANCE_OUTLIER_M:
        issues.append(
            "DISTANCE_AT_OR_BEYOND_SEARCH_LIMIT"
        )

    return issues


def validate_density(
    value: float | None,
    limit: float,
    name: str,
) -> list[str]:

    issues: list[str] = []

    if value is None:
        issues.append(
            f"MISSING_{name}"
        )
        return issues

    if value < 0:
        issues.append(
            f"NEGATIVE_{name}"
        )

    if value > limit:
        issues.append(
            f"UNUSUALLY_HIGH_{name}"
        )

    return issues


def compare_groups(
    positive_values: list[float],
    background_values: list[float],
) -> dict[str, Any]:

    positive_summary = summary(
        positive_values
    )

    background_summary = summary(
        background_values
    )

    result: dict[str, Any] = {
        "positive": positive_summary,
        "background": background_summary,
    }

    if (
        positive_values
        and background_values
    ):

        positive_median = statistics.median(
            positive_values
        )

        background_median = statistics.median(
            background_values
        )

        result[
            "median_difference"
        ] = round(
            positive_median
            - background_median,
            3,
        )

        result[
            "positive_median_lower_than_background"
        ] = (
            positive_median
            < background_median
        )

    else:

        result[
            "median_difference"
        ] = None

        result[
            "positive_median_lower_than_background"
        ] = None

    return result


def road_class_counts(
    records: list[dict[str, Any]],
) -> dict[str, dict[str, int]]:

    result = {
        "all": {},
        "positive": {},
        "background": {},
    }

    for record in records:

        road_class = str(
            record.get(
                "nearest_road_class",
                "UNKNOWN",
            )
        )

        label = str(
            record.get(
                "label",
                record.get(
                    "target",
                    record.get(
                        "sample_type",
                        "",
                    ),
                ),
            )
        ).lower()

        if label in {
            "1",
            "positive",
            "landslide",
            "event",
        }:
            group = "positive"

        elif label in {
            "0",
            "background",
            "negative",
            "non_event",
        }:
            group = "background"

        else:
            group = None

        result["all"][road_class] = (
            result["all"].get(
                road_class,
                0,
            )
            + 1
        )

        if group:
            result[group][road_class] = (
                result[group].get(
                    road_class,
                    0,
                )
                + 1
            )

    return result


def extract_label(
    record: dict[str, Any],
) -> int | None:

    candidates = [
        record.get("label"),
        record.get("target"),
        record.get("class"),
    ]

    for value in candidates:

        if value is None:
            continue

        if isinstance(
            value,
            bool,
        ):
            return int(value)

        try:

            numeric = int(value)

            if numeric in {
                0,
                1,
            }:
                return numeric

        except (
            TypeError,
            ValueError,
        ):
            pass

        text = str(
            value
        ).strip().lower()

        if text in {
            "positive",
            "landslide",
            "event",
            "1",
        }:
            return 1

        if text in {
            "background",
            "negative",
            "non_event",
            "0",
        }:
            return 0

    return None


def run() -> dict[str, Any]:

    print(
        "\nBhooPehra - Road Feature "
        "Quality Validation"
    )

    payload = load_json(
        INPUT_DATASET
    )

    records = payload.get(
        "records"
    )

    if not isinstance(
        records,
        list,
    ):
        raise ValueError(
            "Input dataset does not contain "
            "a valid 'records' list."
        )

    print(
        f"Total records: {len(records)}"
    )

    # -------------------------------------------------
    # Storage for statistical analysis.
    # -------------------------------------------------

    all_distances: list[float] = []
    positive_distances: list[float] = []
    background_distances: list[float] = []

    all_density_1km: list[float] = []
    positive_density_1km: list[float] = []
    background_density_1km: list[float] = []

    all_density_5km: list[float] = []
    positive_density_5km: list[float] = []
    background_density_5km: list[float] = []

    all_road_counts_1km: list[float] = []
    positive_road_counts_1km: list[float] = []
    background_road_counts_1km: list[float] = []

    all_road_counts_5km: list[float] = []
    positive_road_counts_5km: list[float] = []
    background_road_counts_5km: list[float] = []

    importance_values: list[float] = []

    issues: list[dict[str, Any]] = []

    missing_distance = 0
    missing_class = 0
    missing_density = 0

    positive_count = 0
    background_count = 0
    unknown_label_count = 0

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

        label = extract_label(
            record
        )

        if label == 1:
            positive_count += 1

        elif label == 0:
            background_count += 1

        else:
            unknown_label_count += 1

        distance = safe_float(
            record.get(
                "distance_to_road_m"
            )
        )

        density_1km = safe_float(
            record.get(
                "road_length_1km_m"
            )
        )

        density_5km = safe_float(
            record.get(
                "road_length_5km_m"
            )
        )

        count_1km = safe_float(
            record.get(
                "road_count_1km"
            )
        )

        count_5km = safe_float(
            record.get(
                "road_count_5km"
            )
        )

        importance = safe_float(
            record.get(
                "nearest_road_importance"
            )
        )

        road_class = record.get(
            "nearest_road_class"
        )

        record_issues: list[str] = []

        record_issues.extend(
            validate_distance(
                distance
            )
        )

        record_issues.extend(
            validate_density(
                density_1km,
                DENSITY_OUTLIER_1KM_M,
                "ROAD_LENGTH_1KM",
            )
        )

        record_issues.extend(
            validate_density(
                density_5km,
                DENSITY_OUTLIER_5KM_M,
                "ROAD_LENGTH_5KM",
            )
        )

        if count_1km is not None:
            if count_1km < 0:
                record_issues.append(
                    "NEGATIVE_ROAD_COUNT_1KM"
                )

        if count_5km is not None:
            if count_5km < 0:
                record_issues.append(
                    "NEGATIVE_ROAD_COUNT_5KM"
                )

        if (
            importance is not None
            and not (
                0.0
                <= importance
                <= 1.0
            )
        ):
            record_issues.append(
                "ROAD_IMPORTANCE_OUT_OF_RANGE"
            )

        if (
            road_class is None
            or str(road_class).strip()
            == ""
        ):
            missing_class += 1
            record_issues.append(
                "MISSING_ROAD_CLASS"
            )

        if distance is None:
            missing_distance += 1

        if (
            density_1km is None
            or density_5km is None
        ):
            missing_density += 1

        if distance is not None:
            all_distances.append(
                distance
            )

            if label == 1:
                positive_distances.append(
                    distance
                )

            elif label == 0:
                background_distances.append(
                    distance
                )

        if density_1km is not None:
            all_density_1km.append(
                density_1km
            )

            if label == 1:
                positive_density_1km.append(
                    density_1km
                )

            elif label == 0:
                background_density_1km.append(
                    density_1km
                )

        if density_5km is not None:
            all_density_5km.append(
                density_5km
            )

            if label == 1:
                positive_density_5km.append(
                    density_5km
                )

            elif label == 0:
                background_density_5km.append(
                    density_5km
                )

        if count_1km is not None:
            all_road_counts_1km.append(
                count_1km
            )

            if label == 1:
                positive_road_counts_1km.append(
                    count_1km
                )

            elif label == 0:
                background_road_counts_1km.append(
                    count_1km
                )

        if count_5km is not None:
            all_road_counts_5km.append(
                count_5km
            )

            if label == 1:
                positive_road_counts_5km.append(
                    count_5km
                )

            elif label == 0:
                background_road_counts_5km.append(
                    count_5km
                )

        if importance is not None:
            importance_values.append(
                importance
            )

        if record_issues:

            issues.append(
                {
                    "sample_id": sample_id,
                    "label": label,
                    "issues": sorted(
                        set(record_issues)
                    ),
                    "distance_to_road_m": distance,
                    "nearest_road_class": road_class,
                    "road_length_1km_m": density_1km,
                    "road_length_5km_m": density_5km,
                }
            )

    # -------------------------------------------------
    # Cross-feature consistency checks.
    # -------------------------------------------------

    consistency_issues: list[
        dict[str, Any]
    ] = []

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

        distance = safe_float(
            record.get(
                "distance_to_road_m"
            )
        )

        density_1km = safe_float(
            record.get(
                "road_length_1km_m"
            )
        )

        density_5km = safe_float(
            record.get(
                "road_length_5km_m"
            )
        )

        count_1km = safe_float(
            record.get(
                "road_count_1km"
            )
        )

        count_5km = safe_float(
            record.get(
                "road_count_5km"
            )
        )

        local_issues: list[str] = []

        if (
            distance is not None
            and distance <= 1000
            and (
                density_1km is not None
                and density_1km <= 0
            )
        ):
            local_issues.append(
                "NEAR_ROAD_BUT_ZERO_1KM_LENGTH"
            )

        if (
            density_1km is not None
            and density_5km is not None
            and density_1km
            > density_5km
        ):
            local_issues.append(
                "1KM_LENGTH_EXCEEDS_5KM_LENGTH"
            )

        if (
            count_1km is not None
            and count_5km is not None
            and count_1km
            > count_5km
        ):
            local_issues.append(
                "1KM_COUNT_EXCEEDS_5KM_COUNT"
            )

        if (
            count_1km == 0
            and density_1km is not None
            and density_1km > 0
        ):
            local_issues.append(
                "POSITIVE_LENGTH_WITH_ZERO_COUNT"
            )

        if (
            count_5km == 0
            and density_5km is not None
            and density_5km > 0
        ):
            local_issues.append(
                "POSITIVE_5KM_LENGTH_WITH_ZERO_COUNT"
            )

        if local_issues:

            consistency_issues.append(
                {
                    "sample_id": sample_id,
                    "issues": local_issues,
                }
            )

    # -------------------------------------------------
    # Road-class distributions.
    # -------------------------------------------------

    class_counts = road_class_counts(
        records
    )

    # -------------------------------------------------
    # Quality status.
    # -------------------------------------------------

    critical_issue_codes = {
        "NEGATIVE_DISTANCE",
        "NEGATIVE_ROAD_COUNT_1KM",
        "NEGATIVE_ROAD_COUNT_5KM",
        "NEGATIVE_ROAD_LENGTH_1KM",
        "NEGATIVE_ROAD_LENGTH_5KM",
        "ROAD_IMPORTANCE_OUT_OF_RANGE",
        "1KM_LENGTH_EXCEEDS_5KM_LENGTH",
        "1KM_COUNT_EXCEEDS_5KM_COUNT",
    }

    critical_issues = 0

    for issue in issues:

        for code in issue[
            "issues"
        ]:

            if code in critical_issue_codes:
                critical_issues += 1

    for issue in consistency_issues:

        critical_issues += len(
            issue["issues"]
        )

    if critical_issues > 0:
        overall_status = (
            "REVIEW_REQUIRED"
        )

    elif missing_distance > 0:
        overall_status = (
            "PARTIAL_COVERAGE_REVIEW"
        )

    else:
        overall_status = "PASS"

    # -------------------------------------------------
    # Final report.
    # -------------------------------------------------

    report: dict[str, Any] = {
        "status": overall_status,
        "input_dataset": str(
            INPUT_DATASET
        ),
        "total_records": len(
            records
        ),
        "positive_records": positive_count,
        "background_records": background_count,
        "unknown_label_records": (
            unknown_label_count
        ),
        "missing": {
            "distance_to_road_m": (
                missing_distance
            ),
            "nearest_road_class": (
                missing_class
            ),
            "road_density_features": (
                missing_density
            ),
        },
        "feature_summary": {
            "distance_to_road_m": summary(
                all_distances
            ),
            "road_length_1km_m": summary(
                all_density_1km
            ),
            "road_length_5km_m": summary(
                all_density_5km
            ),
            "road_count_1km": summary(
                all_road_counts_1km
            ),
            "road_count_5km": summary(
                all_road_counts_5km
            ),
            "nearest_road_importance": summary(
                importance_values
            ),
        },
        "positive_vs_background": {
            "distance_to_road_m": compare_groups(
                positive_distances,
                background_distances,
            ),
            "road_length_1km_m": compare_groups(
                positive_density_1km,
                background_density_1km,
            ),
            "road_length_5km_m": compare_groups(
                positive_density_5km,
                background_density_5km,
            ),
            "road_count_1km": compare_groups(
                positive_road_counts_1km,
                background_road_counts_1km,
            ),
            "road_count_5km": compare_groups(
                positive_road_counts_5km,
                background_road_counts_5km,
            ),
        },
        "road_class_distribution": class_counts,
        "outlier_thresholds": {
            "distance_to_road_m": (
                DISTANCE_OUTLIER_M
            ),
            "road_length_1km_m": (
                DENSITY_OUTLIER_1KM_M
            ),
            "road_length_5km_m": (
                DENSITY_OUTLIER_5KM_M
            ),
        },
        "record_issues": issues,
        "consistency_issues": (
            consistency_issues
        ),
        "critical_issue_count": (
            critical_issues
        ),
        "scientific_interpretation": [
            (
                "Road proximity is treated as a "
                "predictor associated with terrain "
                "modification and exposure, not proof "
                "of landslide causation."
            ),
            (
                "OpenStreetMap road coverage may be "
                "incomplete or differently classified "
                "across Northeast India."
            ),
            (
                "A missing road within the search "
                "window means no mapped road was found; "
                "it does not prove that no physical road "
                "exists."
            ),
            (
                "Positive/background differences are "
                "descriptive only at this stage because "
                "the training sample is very small."
            ),
            (
                "No statistical significance or "
                "predictive importance claim should be "
                "made until the dataset is expanded."
            ),
        ],
    }

    write_json(
        QUALITY_REPORT,
        report,
    )

    # -------------------------------------------------
    # Console report.
    # -------------------------------------------------

    print(
        "\nBhooPehra - Road Quality Report"
    )

    print(
        f"Overall status: "
        f"{overall_status}"
    )

    print(
        f"Positive records: "
        f"{positive_count}"
    )

    print(
        f"Background records: "
        f"{background_count}"
    )

    print(
        f"Unknown labels: "
        f"{unknown_label_count}"
    )

    print(
        "\nMissing:"
    )

    print(
        "  Distance: "
        f"{missing_distance}"
    )

    print(
        "  Road class: "
        f"{missing_class}"
    )

    print(
        "  Density features: "
        f"{missing_density}"
    )

    print(
        "\nDistance to road:"
    )

    print(
        summary(
            all_distances
        )
    )

    print(
        "\nRoad length within 1 km:"
    )

    print(
        summary(
            all_density_1km
        )
    )

    print(
        "\nRoad length within 5 km:"
    )

    print(
        summary(
            all_density_5km
        )
    )

    print(
        "\nPositive vs background "
        "median distance:"
    )

    print(
        "  Positive: "
        f"{statistics.median(positive_distances):.2f} m"
        if positive_distances
        else "  Positive: N/A"
    )

    print(
        "  Background: "
        f"{statistics.median(background_distances):.2f} m"
        if background_distances
        else "  Background: N/A"
    )

    print(
        "\nRoad classes:"
    )

    for road_class, count in sorted(
        class_counts["all"].items()
    ):

        print(
            f"  {road_class}: {count}"
        )

    print(
        "\nRecord-level issues: "
        f"{len(issues)}"
    )

    print(
        "Consistency issues: "
        f"{len(consistency_issues)}"
    )

    print(
        "Critical issue count: "
        f"{critical_issues}"
    )

    print(
        "\nQuality report:"
    )

    print(
        QUALITY_REPORT
    )

    print(
        "\nNo database records were modified."
    )

    return report


if __name__ == "__main__":
    run()