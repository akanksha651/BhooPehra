from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RiskEngineResult:
    probability: float
    risk_level: str
    confidence: str
    rainfall_trigger: str


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def _rainfall_score(
    rainfall_1h: float,
    rainfall_24h: float,
    rainfall_48h: float,
    rainfall_72h: float,
    antecedent_rainfall: float,
) -> float:
    """
    Convert rainfall observations into a normalized trigger score.

    This is the initial transparent rule-based engine.
    It is intentionally not presented as an ML prediction.
    """

    score_1h = _clamp(rainfall_1h / 50.0)
    score_24h = _clamp(rainfall_24h / 150.0)
    score_48h = _clamp(rainfall_48h / 250.0)
    score_72h = _clamp(rainfall_72h / 350.0)
    score_antecedent = _clamp(antecedent_rainfall / 500.0)

    weighted_score = (
        score_1h * 0.25
        + score_24h * 0.30
        + score_48h * 0.20
        + score_72h * 0.15
        + score_antecedent * 0.10
    )

    return _clamp(weighted_score)


def _soil_moisture_score(soil_moisture: float | None) -> float:
    """
    Convert soil moisture into a normalized saturation contribution.

    Expected soil moisture is treated as a percentage when supplied.
    Missing soil moisture does not penalize the rainfall score.
    """

    if soil_moisture is None:
        return 0.0

    return _clamp(soil_moisture / 100.0)


def _determine_rainfall_trigger(
    rainfall_score: float,
    soil_score: float,
) -> str:
    combined_score = (
        rainfall_score * 0.75
        + soil_score * 0.25
    )

    if combined_score >= 0.75:
        return "VERY_HIGH"

    if combined_score >= 0.55:
        return "HIGH"

    if combined_score >= 0.35:
        return "MODERATE"

    if combined_score >= 0.15:
        return "LOW"

    return "MINIMAL"


def _determine_risk_level(probability: float) -> str:
    probability_percent = probability * 100.0

    if probability_percent >= 75:
        return "CRITICAL"

    if probability_percent >= 55:
        return "HIGH"

    if probability_percent >= 35:
        return "MODERATE"

    return "LOW"


def _determine_confidence(
    rainfall_1h: float,
    rainfall_24h: float,
    rainfall_48h: float,
    rainfall_72h: float,
    soil_moisture: float | None,
) -> str:
    """
    Confidence represents how complete the trigger evidence is.

    This is evidence completeness, not statistical model confidence.
    """

    available_features = 4

    if soil_moisture is not None:
        available_features += 1

    if available_features >= 5:
        return "HIGH"

    if available_features >= 4:
        return "MODERATE"

    return "LOW"


def calculate_risk(
    *,
    rainfall_1h: float,
    rainfall_24h: float,
    rainfall_48h: float,
    rainfall_72h: float,
    antecedent_rainfall: float,
    soil_moisture: float | None = None,
) -> RiskEngineResult:
    """
    Calculate a transparent rainfall-triggered landslide risk.

    The result is suitable for the current BhooPehra rule-based
    prototype layer.

    It should NOT be interpreted as a trained ML probability until
    a validated ML model is integrated.
    """

    rainfall_score = _rainfall_score(
        rainfall_1h=rainfall_1h,
        rainfall_24h=rainfall_24h,
        rainfall_48h=rainfall_48h,
        rainfall_72h=rainfall_72h,
        antecedent_rainfall=antecedent_rainfall,
    )

    soil_score = _soil_moisture_score(
        soil_moisture=soil_moisture,
    )

    combined_score = (
        rainfall_score * 0.75
        + soil_score * 0.25
    )

    probability = round(
        _clamp(combined_score),
        4,
    )

    risk_level = _determine_risk_level(
        probability,
    )

    rainfall_trigger = _determine_rainfall_trigger(
        rainfall_score=rainfall_score,
        soil_score=soil_score,
    )

    confidence = _determine_confidence(
        rainfall_1h=rainfall_1h,
        rainfall_24h=rainfall_24h,
        rainfall_48h=rainfall_48h,
        rainfall_72h=rainfall_72h,
        soil_moisture=soil_moisture,
    )

    return RiskEngineResult(
        probability=probability,
        risk_level=risk_level,
        confidence=confidence,
        rainfall_trigger=rainfall_trigger,
    )