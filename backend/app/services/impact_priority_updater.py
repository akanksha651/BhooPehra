from __future__ import annotations

from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.field_report import FieldReport
from app.models.infrastructure_asset import InfrastructureAsset
from app.models.rainfall_observation import RainfallObservation
from app.models.risk_zone import RiskZone
from app.services.impact_priority import calculate_impact_priority
from app.services.risk_engine import calculate_risk


ZERO_EVIDENCE = {
    "field_reports": 0,
    "verified_reports": 0,
    "critical_reports": 0,
    "high_reports": 0,
    "photo_reports": 0,
}


def _latest_rainfall_by_district(
    db: Session,
) -> dict[int, RainfallObservation]:
    rows = db.scalars(
        select(RainfallObservation).order_by(
            RainfallObservation.district_id,
            RainfallObservation.observed_at.desc(),
            RainfallObservation.id.desc(),
        )
    ).all()

    latest: dict[int, RainfallObservation] = {}

    for observation in rows:
        if observation.district_id not in latest:
            latest[observation.district_id] = observation

    return latest


def _field_report_evidence_by_district(
    db: Session,
) -> dict[int, dict[str, int]]:
    rows = db.execute(
        select(
            FieldReport.district_id,
            func.count(FieldReport.id).label("report_count"),
            func.sum(
                case(
                    (FieldReport.status == "VERIFIED", 1),
                    else_=0,
                )
            ).label("verified_count"),
            func.sum(
                case(
                    (FieldReport.severity == "CRITICAL", 1),
                    else_=0,
                )
            ).label("critical_count"),
            func.sum(
                case(
                    (FieldReport.severity == "HIGH", 1),
                    else_=0,
                )
            ).label("high_count"),
            func.sum(
                case(
                    (FieldReport.photo_count > 0, 1),
                    else_=0,
                )
            ).label("photo_reports"),
        )
        .where(FieldReport.district_id.is_not(None))
        .group_by(FieldReport.district_id)
    ).all()

    evidence: dict[int, dict[str, int]] = {}

    for (
        district_id,
        report_count,
        verified_count,
        critical_count,
        high_count,
        photo_reports,
    ) in rows:
        if district_id is None:
            continue

        evidence[int(district_id)] = {
            "field_reports": int(report_count or 0),
            "verified_reports": int(verified_count or 0),
            "critical_reports": int(critical_count or 0),
            "high_reports": int(high_count or 0),
            "photo_reports": int(photo_reports or 0),
        }

    return evidence


def _field_report_evidence_by_risk_zone(
    db: Session,
) -> dict[int, dict[str, int]]:
    rows = db.execute(
        select(
            FieldReport.risk_zone_id,
            func.count(FieldReport.id).label("report_count"),
            func.sum(
                case(
                    (FieldReport.status == "VERIFIED", 1),
                    else_=0,
                )
            ).label("verified_count"),
            func.sum(
                case(
                    (FieldReport.severity == "CRITICAL", 1),
                    else_=0,
                )
            ).label("critical_count"),
            func.sum(
                case(
                    (FieldReport.severity == "HIGH", 1),
                    else_=0,
                )
            ).label("high_count"),
            func.sum(
                case(
                    (FieldReport.photo_count > 0, 1),
                    else_=0,
                )
            ).label("photo_reports"),
        )
        .where(FieldReport.risk_zone_id.is_not(None))
        .group_by(FieldReport.risk_zone_id)
    ).all()

    evidence: dict[int, dict[str, int]] = {}

    for (
        risk_zone_id,
        report_count,
        verified_count,
        critical_count,
        high_count,
        photo_reports,
    ) in rows:
        if risk_zone_id is None:
            continue

        evidence[int(risk_zone_id)] = {
            "field_reports": int(report_count or 0),
            "verified_reports": int(verified_count or 0),
            "critical_reports": int(critical_count or 0),
            "high_reports": int(high_count or 0),
            "photo_reports": int(photo_reports or 0),
        }

    return evidence


def _field_evidence_score(
    *,
    field_reports: int,
    verified_reports: int,
    critical_reports: int,
    high_reports: int,
    photo_reports: int,
) -> float:
    if field_reports <= 0:
        return 0.0

    report_signal = min(field_reports / 4.0, 1.0) * 30.0
    verified_signal = min(verified_reports / 2.0, 1.0) * 30.0

    severity_signal = min(
        critical_reports * 20.0 + high_reports * 10.0,
        30.0,
    )

    photo_signal = min(
        photo_reports / 3.0,
        1.0,
    ) * 10.0

    return round(
        min(
            report_signal
            + verified_signal
            + severity_signal
            + photo_signal,
            100.0,
        ),
        2,
    )


def _apply_field_evidence_escalation(
    *,
    base_priority: str,
    risk_level: str,
    risk_probability: float,
    asset_type: str,
    field_reports: int,
    verified_reports: int,
    critical_reports: int,
    high_reports: int,
    photo_reports: int,
) -> str:
    priority_rank = {
        "P1": 1,
        "P2": 2,
        "P3": 3,
    }

    current_priority = (
        base_priority.upper()
        if base_priority
        else "P3"
    )

    if current_priority not in priority_rank:
        current_priority = "P3"

    normalized_risk = (
        risk_level or "LOW"
    ).upper()

    normalized_asset_type = (
        asset_type or "OTHER"
    ).upper()

    if field_reports <= 0:
        return current_priority

    if (
        verified_reports >= 1
        and critical_reports >= 1
        and normalized_risk in {"HIGH", "CRITICAL"}
    ):
        if normalized_asset_type in {
            "ROAD",
            "HIGHWAY",
            "BRIDGE",
            "HOSPITAL",
        }:
            return "P1"

        return "P2"

    if (
        verified_reports >= 2
        and normalized_risk in {"HIGH", "CRITICAL"}
    ):
        if normalized_asset_type in {
            "ROAD",
            "HIGHWAY",
            "BRIDGE",
            "HOSPITAL",
        }:
            return "P1"

        return "P2"

    if (
        verified_reports >= 1
        and critical_reports >= 1
        and normalized_risk == "MODERATE"
    ):
        return min(
            current_priority,
            "P2",
            key=lambda value: priority_rank[value],
        )

    if (
        verified_reports >= 2
        and field_reports >= 3
        and risk_probability >= 0.35
    ):
        return min(
            current_priority,
            "P2",
            key=lambda value: priority_rank[value],
        )

    if (
        field_reports >= 2
        and photo_reports >= 2
        and (
            critical_reports >= 1
            or high_reports >= 2
        )
        and risk_probability >= 0.25
    ):
        return min(
            current_priority,
            "P2",
            key=lambda value: priority_rank[value],
        )

    return current_priority


def _recommendation(
    *,
    priority: str,
    asset_type: str,
) -> str:
    asset_type = (
        asset_type or "OTHER"
    ).upper()

    if priority == "P1":
        if asset_type in {"ROAD", "HIGHWAY"}:
            return (
                "Immediate field verification and traffic control; "
                "assess closure/diversion requirement."
            )

        if asset_type == "BRIDGE":
            return (
                "Immediate structural inspection and access-control "
                "readiness; assess closure requirement."
            )

        if asset_type == "HOSPITAL":
            return (
                "Protect hospital access and activate contingency "
                "response coordination."
            )

        if asset_type == "SCHOOL":
            return (
                "Immediate safety review and evacuation readiness "
                "required."
            )

        if asset_type == "VILLAGE":
            return (
                "Prepare community warning and evacuation route "
                "readiness."
            )

        return (
            "Immediate field verification and response-team "
            "assessment required."
        )

    if priority == "P2":
        if asset_type in {"ROAD", "HIGHWAY"}:
            return (
                "Increase monitoring and prepare traffic management "
                "or diversion if conditions worsen."
            )

        if asset_type == "BRIDGE":
            return (
                "Increase structural monitoring and prepare "
                "access-control measures."
            )

        if asset_type == "HOSPITAL":
            return (
                "Maintain emergency access and review alternate "
                "transport arrangements."
            )

        if asset_type == "SCHOOL":
            return (
                "Review evacuation plan and restrict access during "
                "elevated alerts."
            )

        if asset_type == "VILLAGE":
            return (
                "Increase community monitoring and maintain "
                "warning readiness."
            )

        return (
            "Increase monitoring and schedule field verification."
        )

    return (
        "Continue monitoring and reassess if rainfall or field "
        "evidence increases."
    )


def _asset_criticality(
    asset_type: str,
) -> tuple[int, int, int]:
    normalized = (
        asset_type or "OTHER"
    ).upper()

    if normalized in {
        "HOSPITAL",
        "BRIDGE",
    }:
        return 1, 0, 0

    if normalized == "HIGHWAY":
        return 0, 1, 1

    if normalized == "ROAD":
        return 0, 1, 0

    if normalized in {
        "SCHOOL",
        "VILLAGE",
    }:
        return 0, 0, 1

    return 0, 0, 1


def _normalized_asset_type(
    asset: InfrastructureAsset,
) -> str:
    return (
        asset.asset_type or "OTHER"
    ).upper()


def _asset_is_road(
    asset: InfrastructureAsset,
) -> bool:
    return _normalized_asset_type(asset) in {
        "ROAD",
        "HIGHWAY",
    }


def _asset_is_highway(
    asset: InfrastructureAsset,
) -> bool:
    return _normalized_asset_type(asset) == "HIGHWAY"


def _known_operational_exposure_for_zone(
    db: Session,
    zone: RiskZone,
) -> dict[str, Any]:
    """
    Operational inventory associated with the risk zone.

    This does NOT claim spatial intersection.

    Risk-zone assignment is treated as known operational context,
    while geometry intersection is treated as separate verification.
    """

    assets = db.scalars(
        select(InfrastructureAsset)
        .where(
            InfrastructureAsset.risk_zone_id == zone.id,
        )
        .order_by(InfrastructureAsset.id)
    ).all()

    result: dict[str, Any] = {
        "known_asset_count": len(assets),
        "known_population_exposed": 0,
        "known_affected_villages": 0,
        "known_affected_roads": 0,
        "known_critical_assets": 0,
        "known_high_assets": 0,
        "known_moderate_assets": 0,
        "known_assets": [],
    }

    for asset in assets:
        normalized = _normalized_asset_type(asset)

        critical, high, moderate = _asset_criticality(
            asset.asset_type
        )

        result["known_critical_assets"] += critical
        result["known_high_assets"] += high
        result["known_moderate_assets"] += moderate

        if normalized == "VILLAGE":
            result["known_affected_villages"] += 1

        if _asset_is_road(asset):
            result["known_affected_roads"] += 1

        result["known_assets"].append(
            {
                "id": asset.id,
                "asset_code": asset.asset_code,
                "name": asset.name,
                "asset_type": asset.asset_type,
                "geometry_available": asset.geometry is not None,
                "reason": (
                    "KNOWN_RISK_ZONE_ASSIGNMENT"
                    if asset.geometry is None
                    else "KNOWN_RISK_ZONE_ASSIGNMENT_REQUIRES_SPATIAL_VERIFICATION"
                ),
            }
        )

    return result


def _spatial_exposure_for_zone(
    db: Session,
    zone: RiskZone,
) -> dict[str, Any]:
    """
    Calculate spatially verified exposure using PostGIS.

    Rules:
    - ST_Intersects is the only spatial verification.
    - No synthetic coordinates.
    - Assets without geometry remain unverified.
    - Assets with geometry but outside the risk-zone polygon are
      spatially unverified, even if they are assigned to the zone.
    - Known operational inventory is reported separately.
    """

    known = _known_operational_exposure_for_zone(
        db,
        zone,
    )

    result: dict[str, Any] = {
        "zone_id": zone.id,
        "geometry_available": zone.geometry is not None,

        "spatial_verification_status": (
            "UNVERIFIED"
            if zone.geometry is None
            else "PARTIAL"
        ),

        "spatial_asset_count": 0,
        "spatial_population_exposed": 0,
        "spatial_affected_villages": 0,
        "spatial_affected_roads": 0,

        "road_count": 0,
        "critical_road_count": 0,
        "critical_assets": 0,
        "high_assets": 0,
        "moderate_assets": 0,

        "villages": 0,
        "schools": 0,
        "hospitals": 0,
        "bridges": 0,

        "unverified_asset_count": 0,
        "unverified_assets": [],

        "outside_zone_asset_count": 0,
        "outside_zone_assets": [],

        "known_operational_exposure": known,
    }

    if zone.geometry is None:
        result["unverified_asset_count"] = (
            known["known_asset_count"]
        )

        result["unverified_assets"] = [
            {
                **item,
                "reason": "RISK_ZONE_GEOMETRY_UNAVAILABLE",
            }
            for item in known["known_assets"]
        ]

        return result

    zone_assets = db.scalars(
        select(InfrastructureAsset)
        .where(
            InfrastructureAsset.risk_zone_id == zone.id,
        )
        .order_by(InfrastructureAsset.id)
    ).all()

    spatial_assets = db.scalars(
        select(InfrastructureAsset)
        .where(
            InfrastructureAsset.risk_zone_id == zone.id,
            InfrastructureAsset.geometry.is_not(None),
            func.ST_Intersects(
                InfrastructureAsset.geometry,
                zone.geometry,
            ),
        )
        .order_by(InfrastructureAsset.id)
    ).all()

    spatial_ids = {
        asset.id
        for asset in spatial_assets
    }

    for asset in zone_assets:
        if asset.geometry is None:
            result["unverified_asset_count"] += 1

            result["unverified_assets"].append(
                {
                    "id": asset.id,
                    "asset_code": asset.asset_code,
                    "name": asset.name,
                    "asset_type": asset.asset_type,
                    "reason": "GEOMETRY_UNAVAILABLE",
                }
            )

        elif asset.id not in spatial_ids:
            result["outside_zone_asset_count"] += 1

            result["outside_zone_assets"].append(
                {
                    "id": asset.id,
                    "asset_code": asset.asset_code,
                    "name": asset.name,
                    "asset_type": asset.asset_type,
                    "reason": (
                        "GEOMETRY_AVAILABLE_BUT_NO_ZONE_INTERSECTION"
                    ),
                }
            )

    for asset in spatial_assets:
        result["spatial_asset_count"] += 1

        result["spatial_population_exposed"] += max(
            int(asset.exposure_count or 0),
            0,
        )

        critical, high, moderate = _asset_criticality(
            asset.asset_type
        )

        result["critical_assets"] += critical
        result["high_assets"] += high
        result["moderate_assets"] += moderate

        normalized = _normalized_asset_type(asset)

        if _asset_is_road(asset):
            result["road_count"] += 1
            result["spatial_affected_roads"] += 1

        if _asset_is_highway(asset):
            result["critical_road_count"] += 1

        if normalized == "VILLAGE":
            result["villages"] += 1
            result["spatial_affected_villages"] += 1

        elif normalized == "SCHOOL":
            result["schools"] += 1

        elif normalized == "HOSPITAL":
            result["hospitals"] += 1

        elif normalized == "BRIDGE":
            result["bridges"] += 1

    if result["spatial_asset_count"] == 0:
        result["spatial_verification_status"] = "UNVERIFIED"
    elif (
        result["spatial_asset_count"]
        < known["known_asset_count"]
    ):
        result["spatial_verification_status"] = "PARTIAL"
    else:
        result["spatial_verification_status"] = "VERIFIED"

    return result


def _district_spatial_asset_summary(
    db: Session,
) -> dict[int, dict[str, Any]]:
    """
    District-level asset geometry inventory.

    This is inventory metadata only and does not imply that an asset
    intersects a particular risk zone.
    """

    rows = db.execute(
        select(
            InfrastructureAsset.district_id,
            func.count(InfrastructureAsset.id).label(
                "asset_count"
            ),
            func.sum(
                case(
                    (
                        InfrastructureAsset.geometry.is_not(None),
                        1,
                    ),
                    else_=0,
                )
            ).label(
                "geometry_count"
            ),
            func.sum(
                case(
                    (
                        InfrastructureAsset.geometry.is_(None),
                        1,
                    ),
                    else_=0,
                )
            ).label(
                "missing_geometry_count"
            ),
        )
        .group_by(
            InfrastructureAsset.district_id
        )
    ).all()

    summary: dict[int, dict[str, Any]] = {}

    for (
        district_id,
        asset_count,
        geometry_count,
        missing_geometry_count,
    ) in rows:
        summary[int(district_id)] = {
            "asset_count": int(asset_count or 0),
            "geometry_count": int(
                geometry_count or 0
            ),
            "missing_geometry_count": int(
                missing_geometry_count or 0
            ),
        }

    return summary


def _risk_zone_spatial_inventory(
    db: Session,
) -> dict[int, dict[str, Any]]:
    zones = db.scalars(
        select(RiskZone).order_by(
            RiskZone.id
        )
    ).all()

    inventory: dict[int, dict[str, Any]] = {}

    for zone in zones:
        inventory[zone.id] = (
            _spatial_exposure_for_zone(
                db,
                zone,
            )
        )

    return inventory


def update_risk_zone_exposure(
    db: Session,
) -> dict[str, Any]:
    """
    Update risk-zone exposure without destroying known operational data.

    IMPORTANT:
    affected_villages and affected_roads are operational exposure
    indicators. They are NOT overwritten with zero merely because
    spatial verification is incomplete.

    Priority:
    1. Preserve existing seeded operational exposure.
    2. Include known assets assigned to the risk zone.
    3. Increase counts when verified spatial exposure proves a larger
       count.
    4. Report spatial counts separately.
    """

    zones = db.scalars(
        select(RiskZone).order_by(
            RiskZone.id
        )
    ).all()

    updated: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for zone in zones:
        if zone.geometry is None:
            skipped.append(
                {
                    "zone_id": zone.id,
                    "zone_name": zone.name,
                    "reason": "RISK_ZONE_GEOMETRY_UNAVAILABLE",
                }
            )
            continue

        exposure = _spatial_exposure_for_zone(
            db,
            zone,
        )

        known = exposure[
            "known_operational_exposure"
        ]

        previous_villages = int(
            zone.affected_villages or 0
        )

        previous_roads = int(
            zone.affected_roads or 0
        )

        known_villages = int(
            known["known_affected_villages"]
        )

        known_roads = int(
            known["known_affected_roads"]
        )

        spatial_villages = int(
            exposure["spatial_affected_villages"]
        )

        spatial_roads = int(
            exposure["spatial_affected_roads"]
        )

        # Never downgrade seeded operational exposure merely because
        # spatial coverage is incomplete.
        zone.affected_villages = max(
            previous_villages,
            known_villages,
            spatial_villages,
        )

        zone.affected_roads = max(
            previous_roads,
            known_roads,
            spatial_roads,
        )

        updated.append(
            {
                "zone_id": zone.id,
                "zone_name": zone.name,

                "affected_villages": (
                    zone.affected_villages
                ),
                "affected_roads": (
                    zone.affected_roads
                ),

                "previous_operational_villages": (
                    previous_villages
                ),
                "previous_operational_roads": (
                    previous_roads
                ),

                "known_affected_villages": (
                    known_villages
                ),
                "known_affected_roads": (
                    known_roads
                ),

                "spatial_affected_villages": (
                    spatial_villages
                ),
                "spatial_affected_roads": (
                    spatial_roads
                ),

                "spatial_asset_count": (
                    exposure["spatial_asset_count"]
                ),
                "unverified_asset_count": (
                    exposure["unverified_asset_count"]
                ),
                "outside_zone_asset_count": (
                    exposure["outside_zone_asset_count"]
                ),

                "spatial_verification_status": (
                    exposure[
                        "spatial_verification_status"
                    ]
                ),

                "exposure_basis": (
                    "SPATIAL_VERIFIED_PLUS_KNOWN_OPERATIONAL"
                ),
            }
        )

    return {
        "updated_count": len(updated),
        "skipped_count": len(skipped),
        "exposure_basis": (
            "SPATIAL_VERIFIED_PLUS_KNOWN_OPERATIONAL"
        ),
        "synthetic_coordinates_created": False,
        "updated": updated,
        "skipped": skipped,
    }


def update_infrastructure_priorities(
    db: Session,
) -> dict[str, Any]:
    """
    Recalculate infrastructure risk, impact and operational priority.

    Spatial rules:
    - population exposure is counted only when the asset is spatially
      verified inside its risk-zone polygon.
    - asset criticality is retained for known operational assets even
      when spatial verification is incomplete.
    - no synthetic coordinates are created.
    """

    latest_rainfall = (
        _latest_rainfall_by_district(db)
    )

    field_evidence_by_district = (
        _field_report_evidence_by_district(db)
    )

    field_evidence_by_zone = (
        _field_report_evidence_by_risk_zone(db)
    )

    zones = db.scalars(
        select(RiskZone).order_by(
            RiskZone.id
        )
    ).all()

    zones_by_id = {
        zone.id: zone
        for zone in zones
    }

    zone_exposure: dict[
        int,
        dict[str, Any],
    ] = {}

    for zone in zones:
        zone_exposure[zone.id] = (
            _spatial_exposure_for_zone(
                db,
                zone,
            )
        )

    assets = db.scalars(
        select(InfrastructureAsset).order_by(
            InfrastructureAsset.id
        )
    ).all()

    updated: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for asset in assets:
        rainfall = latest_rainfall.get(
            asset.district_id
        )

        if rainfall is None:
            skipped.append(
                {
                    "asset_id": asset.id,
                    "asset_code": asset.asset_code,
                    "reason": (
                        "No rainfall observation available "
                        "for asset district"
                    ),
                }
            )
            continue

        risk = calculate_risk(
            rainfall_1h=rainfall.rainfall_1h,
            rainfall_24h=rainfall.rainfall_24h,
            rainfall_48h=rainfall.rainfall_48h,
            rainfall_72h=rainfall.rainfall_72h,
            antecedent_rainfall=(
                rainfall.antecedent_rainfall
            ),
            soil_moisture=(
                rainfall.soil_moisture
            ),
        )

        zone_evidence = (
            field_evidence_by_zone.get(
                asset.risk_zone_id,
                ZERO_EVIDENCE.copy(),
            )
        )

        district_evidence = (
            field_evidence_by_district.get(
                asset.district_id,
                ZERO_EVIDENCE.copy(),
            )
        )

        if zone_evidence["field_reports"] > 0:
            evidence = zone_evidence
            evidence_scope = "RISK_ZONE"
        else:
            evidence = district_evidence
            evidence_scope = "DISTRICT"

        spatially_verified = False
        zone_intersection = False
        population_exposed = 0
        spatial_asset_count = 0

        zone = zones_by_id.get(
            asset.risk_zone_id
        )

        if (
            zone is not None
            and asset.geometry is not None
            and zone.geometry is not None
        ):
            zone_intersection = bool(
                db.scalar(
                    select(
                        func.ST_Intersects(
                            asset.geometry,
                            zone.geometry,
                        )
                    )
                )
            )

            if zone_intersection:
                spatially_verified = True
                population_exposed = max(
                    int(
                        asset.exposure_count
                        or 0
                    ),
                    0,
                )

                spatial_asset_count = (
                    zone_exposure[
                        zone.id
                    ][
                        "spatial_asset_count"
                    ]
                )

        if spatially_verified:
            population_exposure_basis = (
                "SPATIAL_VERIFIED"
            )
        elif asset.geometry is None:
            population_exposure_basis = (
                "GEOMETRY_UNAVAILABLE"
            )
        else:
            population_exposure_basis = (
                "GEOMETRY_AVAILABLE_NO_ZONE_INTERSECTION"
            )

        # Keep operational asset criticality even when the exact
        # geometry is not yet verified.
        critical, high, moderate = (
            _asset_criticality(
                asset.asset_type
            )
        )

        normalized_type = (
            asset.asset_type or "OTHER"
        ).upper()

        road_count = (
            1
            if normalized_type
            in {"ROAD", "HIGHWAY"}
            else 0
        )

        critical_road_count = (
            1
            if normalized_type == "HIGHWAY"
            else 0
        )

        field_score = _field_evidence_score(
            field_reports=evidence[
                "field_reports"
            ],
            verified_reports=evidence[
                "verified_reports"
            ],
            critical_reports=evidence[
                "critical_reports"
            ],
            high_reports=evidence[
                "high_reports"
            ],
            photo_reports=evidence[
                "photo_reports"
            ],
        )

        impact_priority = (
            calculate_impact_priority(
                risk_probability=(
                    risk.probability
                ),
                population_exposed=(
                    population_exposed
                ),
                road_count=road_count,
                critical_road_count=(
                    critical_road_count
                ),
                critical_assets=critical,
                high_assets=high,
                moderate_assets=moderate,
                accessibility_score=0.0,
                field_reports=evidence[
                    "field_reports"
                ],
                verified_reports=evidence[
                    "verified_reports"
                ],
                asset_type=asset.asset_type,
            )
        )

        operational_priority = (
            _apply_field_evidence_escalation(
                base_priority=(
                    impact_priority.priority
                ),
                risk_level=risk.risk_level,
                risk_probability=risk.probability,
                asset_type=asset.asset_type,
                field_reports=evidence[
                    "field_reports"
                ],
                verified_reports=evidence[
                    "verified_reports"
                ],
                critical_reports=evidence[
                    "critical_reports"
                ],
                high_reports=evidence[
                    "high_reports"
                ],
                photo_reports=evidence[
                    "photo_reports"
                ],
            )
        )

        exposure_level = (
            impact_priority.exposure_level
        )

        if operational_priority == "P1":
            exposure_level = "SEVERE"

        elif (
            operational_priority == "P2"
            and exposure_level == "MODERATE"
        ):
            exposure_level = "HIGH"

        asset.risk_level = risk.risk_level
        asset.probability = risk.probability
        asset.priority = operational_priority

        asset.status = (
            "AT_RISK"
            if operational_priority == "P1"
            else "MONITORING"
        )

        asset.recommendation = (
            _recommendation(
                priority=operational_priority,
                asset_type=asset.asset_type,
            )
        )

        updated.append(
            {
                "asset_id": asset.id,
                "asset_code": asset.asset_code,
                "asset_name": asset.name,
                "asset_type": asset.asset_type,

                "risk_level": risk.risk_level,
                "probability": risk.probability,
                "confidence": risk.confidence,
                "rainfall_trigger": (
                    risk.rainfall_trigger
                ),

                "priority": operational_priority,
                "base_priority": (
                    impact_priority.priority
                ),
                "impact_score": (
                    impact_priority.impact_score
                ),

                "field_evidence_score": (
                    field_score
                ),
                "exposure_level": (
                    exposure_level
                ),
                "field_evidence_scope": (
                    evidence_scope
                ),

                "field_reports": (
                    evidence["field_reports"]
                ),
                "verified_reports": (
                    evidence[
                        "verified_reports"
                    ]
                ),
                "critical_reports": (
                    evidence[
                        "critical_reports"
                    ]
                ),
                "high_reports": (
                    evidence[
                        "high_reports"
                    ]
                ),
                "photo_reports": (
                    evidence[
                        "photo_reports"
                    ]
                ),

                "spatially_verified": (
                    spatially_verified
                ),
                "zone_intersection": (
                    zone_intersection
                ),
                "population_exposed": (
                    population_exposed
                ),
                "population_exposure_basis": (
                    population_exposure_basis
                ),
                "spatial_asset_count": (
                    spatial_asset_count
                ),

                "geometry_available": (
                    asset.geometry is not None
                ),

                "operational_exposure_basis": (
                    "RISK_ZONE_ASSIGNMENT"
                    if asset.risk_zone_id is not None
                    else "DISTRICT_ASSET_INVENTORY"
                ),

                "rainfall_source": (
                    rainfall.source
                ),
            }
        )

    zone_update = (
        update_risk_zone_exposure(db)
    )

    db.commit()

    district_inventory = (
        _district_spatial_asset_summary(db)
    )

    spatial_verified_count = sum(
        1
        for item in updated
        if item["spatially_verified"]
    )

    unverified_count = sum(
        1
        for item in updated
        if not item["spatially_verified"]
    )

    geometry_available_count = sum(
        1
        for item in updated
        if item["geometry_available"]
    )

    return {
        "status": "success",

        "engine": (
            "postgis_spatial_exposure_plus_"
            "known_operational_exposure_"
            "risk_impact_priority"
        ),

        "spatial_method": "ST_Intersects",

        "exposure_basis": (
            "SPATIAL_VERIFIED_PLUS_KNOWN_OPERATIONAL"
        ),

        "synthetic_coordinates_created": False,

        "updated_count": len(updated),
        "skipped_count": len(skipped),

        "geometry_available_assets": (
            geometry_available_count
        ),

        "spatially_verified_assets": (
            spatial_verified_count
        ),

        "unverified_geometry_or_location_assets": (
            unverified_count
        ),

        "risk_zone_exposure": zone_update,

        "district_asset_inventory": (
            district_inventory
        ),

        "field_report_evidence": {
            "districts_with_reports": len(
                field_evidence_by_district
            ),
            "risk_zones_with_reports": len(
                field_evidence_by_zone
            ),
            "total_reports": sum(
                item["field_reports"]
                for item
                in field_evidence_by_district.values()
            ),
            "total_verified_reports": sum(
                item["verified_reports"]
                for item
                in field_evidence_by_district.values()
            ),
            "total_critical_reports": sum(
                item["critical_reports"]
                for item
                in field_evidence_by_district.values()
            ),
            "total_high_reports": sum(
                item["high_reports"]
                for item
                in field_evidence_by_district.values()
            ),
            "total_photo_reports": sum(
                item["photo_reports"]
                for item
                in field_evidence_by_district.values()
            ),
        },

        "updated": updated,
        "skipped": skipped,
    }