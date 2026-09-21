from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.district import District
from app.models.rainfall_observation import RainfallObservation
from app.models.risk_zone import RiskZone
from app.services.risk_engine import calculate_risk


def get_latest_rainfall(
    db: Session,
    district_id: int,
) -> RainfallObservation | None:
    statement = (
        select(RainfallObservation)
        .where(
            RainfallObservation.district_id == district_id,
        )
        .order_by(
            RainfallObservation.observed_at.desc(),
            RainfallObservation.id.desc(),
        )
        .limit(1)
    )

    return db.scalars(statement).first()


def update_risk_zones(
    db: Session,
) -> dict[str, Any]:
    """
    Recalculate existing risk zones using the latest rainfall
    observation available for each zone's district.

    IMPORTANT:
    - Existing PostGIS geometry is not modified.
    - Existing priority is not modified.
    - Existing affected villages/roads are not modified.
    - Only dynamic rainfall-driven risk fields are updated.
    """

    statement = (
        select(RiskZone, District)
        .join(
            District,
            RiskZone.district_id == District.id,
        )
        .order_by(
            RiskZone.id.asc(),
        )
    )

    rows = db.execute(statement).all()

    updated = []
    skipped = []

    for zone, district in rows:
        rainfall = get_latest_rainfall(
            db=db,
            district_id=district.id,
        )

        if rainfall is None:
            skipped.append(
                {
                    "zone_id": zone.id,
                    "zone_name": zone.name,
                    "district_id": district.id,
                    "district_name": district.name,
                    "reason": "No rainfall observation available",
                }
            )
            continue

        result = calculate_risk(
            rainfall_1h=rainfall.rainfall_1h,
            rainfall_24h=rainfall.rainfall_24h,
            rainfall_48h=rainfall.rainfall_48h,
            rainfall_72h=rainfall.rainfall_72h,
            antecedent_rainfall=rainfall.antecedent_rainfall,
            soil_moisture=rainfall.soil_moisture,
        )

        previous_risk_level = zone.risk_level
        previous_probability = zone.probability
        previous_confidence = zone.confidence
        previous_rainfall_trigger = zone.rainfall_trigger

        zone.risk_level = result.risk_level
        zone.probability = result.probability
        zone.confidence = result.confidence
        zone.rainfall_trigger = result.rainfall_trigger

        updated.append(
            {
                "zone_id": zone.id,
                "zone_name": zone.name,
                "district_id": district.id,
                "district_name": district.name,
                "previous": {
                    "risk_level": previous_risk_level,
                    "probability": previous_probability,
                    "confidence": previous_confidence,
                    "rainfall_trigger": previous_rainfall_trigger,
                },
                "updated": {
                    "risk_level": result.risk_level,
                    "probability": result.probability,
                    "confidence": result.confidence,
                    "rainfall_trigger": result.rainfall_trigger,
                },
                "rainfall_observation": {
                    "id": rainfall.id,
                    "observed_at": rainfall.observed_at,
                    "rainfall_1h": rainfall.rainfall_1h,
                    "rainfall_24h": rainfall.rainfall_24h,
                    "rainfall_48h": rainfall.rainfall_48h,
                    "rainfall_72h": rainfall.rainfall_72h,
                    "antecedent_rainfall": rainfall.antecedent_rainfall,
                    "soil_moisture": rainfall.soil_moisture,
                    "trigger_level": rainfall.trigger_level,
                    "source": rainfall.source,
                },
            }
        )

    db.commit()

    return {
        "success": True,
        "engine": "BhooPehra Rule-Based Risk Engine",
        "model_type": "transparent_rule_based",
        "ml_model": False,
        "updated_count": len(updated),
        "skipped_count": len(skipped),
        "updated": updated,
        "skipped": skipped,
    }