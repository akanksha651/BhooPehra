from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.district import District
from app.models.rainfall_observation import RainfallObservation
from app.models.risk_zone import RiskZone
from app.models.infrastructure_asset import InfrastructureAsset


router = APIRouter(
    prefix="/api/dashboard",
    tags=["Dashboard"],
)


@router.get("/summary")
def get_dashboard_summary(
    db: Session = Depends(get_db),
):
    total_districts = db.scalar(
        select(func.count(District.id))
    ) or 0

    total_risk_zones = db.scalar(
        select(func.count(RiskZone.id))
    ) or 0

    critical_zones = db.scalar(
        select(func.count(RiskZone.id)).where(
            RiskZone.risk_level == "CRITICAL"
        )
    ) or 0

    high_zones = db.scalar(
        select(func.count(RiskZone.id)).where(
            RiskZone.risk_level == "HIGH"
        )
    ) or 0

    total_assets = db.scalar(
        select(func.count(InfrastructureAsset.id))
    ) or 0

    at_risk_assets = db.scalar(
        select(func.count(InfrastructureAsset.id)).where(
            InfrastructureAsset.status == "AT_RISK"
        )
    ) or 0

    p1_assets = db.scalar(
        select(func.count(InfrastructureAsset.id)).where(
            InfrastructureAsset.priority == "P1"
        )
    ) or 0

    latest_rainfall = db.scalars(
        select(RainfallObservation)
        .order_by(RainfallObservation.observed_at.desc())
        .limit(1)
    ).first()

    return {
        "districts": {
            "total": total_districts,
        },
        "risk": {
            "total_zones": total_risk_zones,
            "critical": critical_zones,
            "high": high_zones,
        },
        "infrastructure": {
            "total_assets": total_assets,
            "at_risk": at_risk_assets,
            "priority_p1": p1_assets,
        },
        "latest_rainfall": (
            {
                "district_id": latest_rainfall.district_id,
                "observed_at": latest_rainfall.observed_at,
                "rainfall_1h": latest_rainfall.rainfall_1h,
                "rainfall_24h": latest_rainfall.rainfall_24h,
                "rainfall_48h": latest_rainfall.rainfall_48h,
                "rainfall_72h": latest_rainfall.rainfall_72h,
                "antecedent_rainfall": (
                    latest_rainfall.antecedent_rainfall
                ),
                "soil_moisture": latest_rainfall.soil_moisture,
                "trigger_level": latest_rainfall.trigger_level,
                "source": latest_rainfall.source,
            }
            if latest_rainfall
            else None
        ),
    }