from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ImpactPriorityResult:
    impact_score: float
    priority: str
    exposure_level: str
    recommended_action: str


def _clamp(
    value: float,
    minimum: float = 0.0,
    maximum: float = 100.0,
) -> float:
    return max(minimum, min(maximum, value))


def _population_score(population_exposed: int) -> float:
    if population_exposed <= 0:
        return 0.0

    if population_exposed >= 10000:
        return 100.0

    if population_exposed >= 5000:
        return 85.0

    if population_exposed >= 2000:
        return 70.0

    if population_exposed >= 1000:
        return 55.0

    if population_exposed >= 500:
        return 40.0

    return 25.0


def _road_importance_score(
    road_count: int,
    critical_road_count: int = 0,
) -> float:
    score = min(road_count * 15.0, 60.0)

    if critical_road_count > 0:
        score += 40.0

    return _clamp(score)


def _infrastructure_score(
    critical_assets: int,
    high_assets: int,
    moderate_assets: int,
) -> float:
    score = (
        critical_assets * 40.0
        + high_assets * 25.0
        + moderate_assets * 10.0
    )

    return _clamp(score)


def _accessibility_score(
    accessibility_score: float,
) -> float:
    return _clamp(accessibility_score)


def _field_evidence_score(
    field_reports: int,
    verified_reports: int,
) -> float:
    if field_reports <= 0:
        return 0.0

    verified_ratio = verified_reports / field_reports

    score = min(field_reports * 15.0, 60.0)
    score += min(verified_ratio * 40.0, 40.0)

    return _clamp(score)


def _base_priority_from_score(
    impact_score: float,
) -> str:
    if impact_score >= 75:
        return "P1"

    if impact_score >= 50:
        return "P2"

    return "P3"


def _apply_operational_escalation(
    *,
    base_priority: str,
    risk_probability: float,
    asset_type: str,
    critical_assets: int,
    high_assets: int,
    critical_road_count: int,
) -> str:
    """
    Apply operational escalation rules on top of the impact score.

    These rules ensure that critical risk and critical infrastructure
    cannot be downgraded solely because a weighted score is lower.
    """

    normalized_type = asset_type.upper().strip()

    probability_percent = risk_probability * 100.0

    is_critical_risk = probability_percent >= 75.0
    is_high_risk = probability_percent >= 55.0

    is_critical_asset = normalized_type in {
        "HOSPITAL",
        "BRIDGE",
    }

    is_critical_road = (
        normalized_type in {"ROAD", "HIGHWAY"}
        and critical_road_count > 0
    )

    is_high_priority_asset = (
        critical_assets > 0
        or high_assets > 0
    )

    # CRITICAL risk + road/bridge/hospital = immediate P1.
    if is_critical_risk and (
        is_critical_asset
        or is_critical_road
    ):
        return "P1"

    # CRITICAL risk at other exposed assets should never
    # fall below P2.
    if is_critical_risk:
        if base_priority == "P3":
            return "P2"

        return base_priority

    # HIGH risk + critical infrastructure = P1.
    if is_high_risk and is_critical_asset:
        return "P1"

    # HIGH risk + important infrastructure/road = minimum P2.
    if is_high_risk and is_high_priority_asset:
        if base_priority == "P3":
            return "P2"

        return base_priority

    return base_priority


def _exposure_level(
    impact_score: float,
    priority: str,
) -> str:
    if priority == "P1" or impact_score >= 75:
        return "SEVERE"

    if priority == "P2" or impact_score >= 50:
        return "HIGH"

    return "MODERATE"


def _recommended_action(
    priority: str,
    asset_type: str,
) -> str:
    normalized_type = asset_type.upper().strip()

    if priority == "P1":
        if normalized_type in {"ROAD", "HIGHWAY"}:
            return (
                "Immediate road inspection, traffic monitoring "
                "and alternate-route preparedness required."
            )

        if normalized_type == "BRIDGE":
            return (
                "Immediate structural inspection and alternate "
                "route preparedness required."
            )

        if normalized_type == "HOSPITAL":
            return (
                "Protect emergency access, verify evacuation routes "
                "and maintain alternate transport access."
            )

        if normalized_type == "SCHOOL":
            return (
                "Immediate safety review and evacuation readiness "
                "required."
            )

        if normalized_type == "VILLAGE":
            return (
                "Prepare community warning and evacuation route "
                "readiness."
            )

        return (
            "Immediate field verification and emergency "
            "response coordination required."
        )

    if priority == "P2":
        if normalized_type in {"ROAD", "HIGHWAY"}:
            return (
                "Increase patrol frequency and monitor slope "
                "and rainfall conditions."
            )

        if normalized_type == "BRIDGE":
            return (
                "Conduct structural inspection and monitor "
                "approach slope conditions."
            )

        if normalized_type == "HOSPITAL":
            return (
                "Maintain emergency access and review "
                "alternate transport arrangements."
            )

        if normalized_type == "SCHOOL":
            return (
                "Review evacuation plan and restrict access "
                "during elevated alerts."
            )

        if normalized_type == "VILLAGE":
            return (
                "Increase community monitoring and maintain "
                "warning readiness."
            )

        return (
            "Enhanced monitoring and field verification recommended."
        )

    return (
        "Continue monitoring and review conditions if "
        "risk indicators increase."
    )


def calculate_impact_priority(
    *,
    risk_probability: float,
    population_exposed: int = 0,
    road_count: int = 0,
    critical_road_count: int = 0,
    critical_assets: int = 0,
    high_assets: int = 0,
    moderate_assets: int = 0,
    accessibility_score: float = 0.0,
    field_reports: int = 0,
    verified_reports: int = 0,
    asset_type: str = "OTHER",
) -> ImpactPriorityResult:
    """
    Calculate operational impact and response priority.

    risk_probability must be supplied as a value from 0.0 to 1.0.

    The engine combines:
    - dynamic landslide risk
    - exposed population
    - road importance
    - infrastructure criticality
    - accessibility
    - field evidence

    Operational escalation rules are then applied so that
    critical/high-risk infrastructure is not incorrectly downgraded
    by the weighted score alone.
    """

    risk_score = _clamp(
        risk_probability * 100.0,
    )

    population_score = _population_score(
        population_exposed,
    )

    road_score = _road_importance_score(
        road_count=road_count,
        critical_road_count=critical_road_count,
    )

    infrastructure_score = _infrastructure_score(
        critical_assets=critical_assets,
        high_assets=high_assets,
        moderate_assets=moderate_assets,
    )

    accessibility_component = _accessibility_score(
        accessibility_score,
    )

    field_score = _field_evidence_score(
        field_reports=field_reports,
        verified_reports=verified_reports,
    )

    impact_score = (
        risk_score * 0.35
        + population_score * 0.20
        + road_score * 0.15
        + infrastructure_score * 0.15
        + accessibility_component * 0.05
        + field_score * 0.10
    )

    impact_score = round(
        _clamp(impact_score),
        2,
    )

    base_priority = _base_priority_from_score(
        impact_score,
    )

    priority = _apply_operational_escalation(
        base_priority=base_priority,
        risk_probability=risk_probability,
        asset_type=asset_type,
        critical_assets=critical_assets,
        high_assets=high_assets,
        critical_road_count=critical_road_count,
    )

    exposure_level = _exposure_level(
        impact_score=impact_score,
        priority=priority,
    )

    recommended_action = _recommended_action(
        priority=priority,
        asset_type=asset_type,
    )

    return ImpactPriorityResult(
        impact_score=impact_score,
        priority=priority,
        exposure_level=exposure_level,
        recommended_action=recommended_action,
    )