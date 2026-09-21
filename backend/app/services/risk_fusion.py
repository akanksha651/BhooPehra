from __future__ import annotations

from typing import Any

from app.services.risk_zone_ml import predict_zone_ml_risk


def _normalize_level(value: Any) -> str:
    if value is None:
        return "UNKNOWN"

    return str(value).strip().upper()


def _risk_score(
    level: str,
) -> float:
    scores = {
        "LOW": 0.25,
        "MODERATE": 0.50,
        "HIGH": 0.75,
        "CRITICAL": 1.00,
    }

    return scores.get(
        _normalize_level(level),
        0.0,
    )


def _final_level(
    score: float,
) -> str:
    if score >= 0.80:
        return "CRITICAL"

    if score >= 0.60:
        return "HIGH"

    if score >= 0.40:
        return "MODERATE"

    return "LOW"


def _combine_confidence(
    ml_confidence: str,
    rule_confidence: str,
) -> str:
    ml = _normalize_level(
        ml_confidence
    )

    rule = _normalize_level(
        rule_confidence
    )

    if ml == "LOW" or rule == "LOW":
        return "LOW"

    if ml == "MEDIUM" or rule == "MEDIUM":
        return "MEDIUM"

    if ml == "HIGH" and rule == "HIGH":
        return "HIGH"

    return "MEDIUM"


def _assessment(
    ml_level: str,
    rule_level: str,
    ml_probability: float,
) -> str:

    ml_level = _normalize_level(
        ml_level
    )

    rule_level = _normalize_level(
        rule_level
    )

    if (
        ml_level in {"HIGH", "CRITICAL"}
        and rule_level in {"LOW", "MINIMAL"}
    ):
        return "REVIEW_REQUIRED"

    if (
        ml_level in {"LOW", "MODERATE"}
        and rule_level in {"HIGH", "CRITICAL"}
    ):
        return "REVIEW_REQUIRED"

    if (
        ml_level in {"HIGH", "CRITICAL"}
        and rule_level in {"HIGH", "CRITICAL"}
    ):
        return "ELEVATED"

    if (
        ml_probability >= 0.60
        and rule_level not in {
            "HIGH",
            "CRITICAL",
        }
    ):
        return "ML_ELEVATED"

    if (
        ml_probability < 0.40
        and rule_level in {
            "LOW",
            "MINIMAL",
        }
    ):
        return "LOW_CONCERN"

    return "MODERATE_REVIEW"


def _build_evidence(
    ml_result: dict[str, Any],
    rule_result: dict[str, Any],
) -> list[dict[str, Any]]:

    evidence: list[dict[str, Any]] = []

    ml_prediction = ml_result.get(
        "prediction",
        {},
    )

    ml_probability = float(
        ml_prediction.get(
            "landslide_probability",
            0.0,
        )
    )

    ml_level = _normalize_level(
        ml_prediction.get(
            "risk_level"
        )
    )

    rule_probability = float(
        rule_result.get(
            "probability",
            0.0,
        )
    )

    rule_level = _normalize_level(
        rule_result.get(
            "risk_level"
        )
    )

    rainfall_trigger = _normalize_level(
        rule_result.get(
            "rainfall_trigger"
        )
    )

    if ml_probability >= 0.60:
        evidence.append(
            {
                "type": "ML_SIGNAL",
                "severity": "HIGH",
                "description": (
                    f"ML model estimates "
                    f"{ml_probability * 100:.1f}% "
                    "landslide probability."
                ),
            }
        )

    elif ml_probability >= 0.40:
        evidence.append(
            {
                "type": "ML_SIGNAL",
                "severity": "MODERATE",
                "description": (
                    f"ML model estimates "
                    f"{ml_probability * 100:.1f}% "
                    "landslide probability."
                ),
            }
        )

    else:
        evidence.append(
            {
                "type": "ML_SIGNAL",
                "severity": "LOW",
                "description": (
                    f"ML model estimates "
                    f"{ml_probability * 100:.1f}% "
                    "landslide probability."
                ),
            }
        )

    evidence.append(
        {
            "type": "RULE_ENGINE",
            "severity": rule_level,
            "description": (
                f"Rainfall rule engine indicates "
                f"{rule_level} risk with "
                f"{rule_probability * 100:.1f}% "
                "probability."
            ),
        }
    )

    evidence.append(
        {
            "type": "RAINFALL_TRIGGER",
            "severity": rainfall_trigger,
            "description": (
                f"Current rainfall trigger level: "
                f"{rainfall_trigger}."
            ),
        }
    )

    for item in ml_result.get(
        "evidence",
        [],
    ):
        if isinstance(item, dict):
            evidence.append(
                {
                    "type": "ML_FEATURE",
                    "severity": "INFO",
                    "feature": item.get(
                        "feature"
                    ),
                    "value": item.get(
                        "value"
                    ),
                    "description": item.get(
                        "description"
                    ),
                }
            )

    return evidence


def fuse_risk(
    ml_result: dict[str, Any],
    rule_result: dict[str, Any],
) -> dict[str, Any]:

    ml_prediction = ml_result.get(
        "prediction",
        {},
    )

    ml_probability = float(
        ml_prediction.get(
            "landslide_probability",
            0.0,
        )
    )

    ml_level = _normalize_level(
        ml_prediction.get(
            "risk_level"
        )
    )

    ml_confidence = _normalize_level(
        ml_prediction.get(
            "confidence"
        )
    )

    rule_probability = float(
        rule_result.get(
            "probability",
            0.0,
        )
    )

    rule_level = _normalize_level(
        rule_result.get(
            "risk_level"
        )
    )

    rule_confidence = _normalize_level(
        rule_result.get(
            "confidence"
        )
    )

    # ---------------------------------------------------------------
    # Weighted fusion
    #
    # ML = 70%
    # Rule engine = 30%
    #
    # ML is the learned spatial susceptibility/risk signal.
    # Rule engine contributes current rainfall trigger evidence.
    # ---------------------------------------------------------------

    fused_probability = (
        0.70 * ml_probability
        + 0.30 * rule_probability
    )

    fused_probability = max(
        0.0,
        min(
            1.0,
            fused_probability,
        ),
    )

    final_level = _final_level(
        fused_probability
    )

    final_confidence = _combine_confidence(
        ml_confidence=ml_confidence,
        rule_confidence=rule_confidence,
    )

    assessment = _assessment(
        ml_level=ml_level,
        rule_level=rule_level,
        ml_probability=ml_probability,
    )

    disagreement = (
        ml_level != rule_level
    )

    evidence = _build_evidence(
        ml_result=ml_result,
        rule_result=rule_result,
    )

    return {
        "status": "ACTIVE",
        "final_probability": round(
            fused_probability,
            4,
        ),
        "final_probability_percent": round(
            fused_probability * 100,
            2,
        ),
        "final_risk_level": final_level,
        "final_confidence": final_confidence,
        "operational_assessment": assessment,
        "signals": {
            "ml": {
                "probability": round(
                    ml_probability,
                    4,
                ),
                "probability_percent": round(
                    ml_probability * 100,
                    2,
                ),
                "risk_level": ml_level,
                "confidence": ml_confidence,
            },
            "rule_engine": {
                "probability": round(
                    rule_probability,
                    4,
                ),
                "probability_percent": round(
                    rule_probability * 100,
                    2,
                ),
                "risk_level": rule_level,
                "confidence": rule_confidence,
                "rainfall_trigger": _normalize_level(
                    rule_result.get(
                        "rainfall_trigger"
                    )
                ),
            },
        },
        "fusion": {
            "method": (
                "weighted_ml_rule_fusion"
            ),
            "ml_weight": 0.70,
            "rule_engine_weight": 0.30,
        },
        "agreement": {
            "signals_agree": not disagreement,
            "signal_disagreement": disagreement,
        },
        "evidence": evidence,
        "database_write": False,
        "warnings": [
            (
                "This fused assessment is a prototype "
                "decision-support score."
            ),
            (
                "It does not constitute a guaranteed "
                "landslide forecast."
            ),
        ],
    }