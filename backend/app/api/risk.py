from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.district import District
from app.models.risk_zone import RiskZone
from app.services.risk_engine import calculate_risk
from app.services.risk_zone_updater import update_risk_zones
from app.services.gsi_model_inference import (
    model_health,
    predict_risk,
)
from app.services.risk_zone_ml import (
    predict_zone_ml_risk,
)
from app.services.risk_fusion import (
    fuse_risk,
)


router = APIRouter(
    prefix="/api/risk",
    tags=["Risk"],
)


class RiskPredictionRequest(BaseModel):
    record_id: str | None = None

    elevation_m: float | None = None
    slope_deg: float | None = None
    aspect_deg: float | None = None

    rainfall_24h_mm: float | None = None
    rainfall_72h_mm: float | None = None
    rainfall_7d_mm: float | None = None
    rainfall_30d_mm: float | None = None

    antecedent_rainfall_mm: float | None = None
    rainfall_intensity_mm_h: float | None = None
    soil_moisture: float | None = None
    forecast_rainfall_mm: float | None = None

    distance_to_road_m: float | None = None
    nearest_road_importance: float | None = None

    road_length_1km_m: float | None = None
    road_length_5km_m: float | None = None

    road_count_1km: float | None = None
    road_count_5km: float | None = None

    road_density_1km_km_per_km2: float | None = None
    road_density_5km_km_per_km2: float | None = None

    state: str | None = None
    nearest_road_class: str | None = None
    lulc_class: str | None = None
    lithology_class: str | None = None


def get_latest_rainfall(
    db: Session,
    district_id: int,
):
    from app.models.rainfall_observation import (
        RainfallObservation,
    )

    statement = (
        select(
            RainfallObservation
        )
        .where(
            RainfallObservation.district_id
            == district_id,
        )
        .order_by(
            RainfallObservation.observed_at.desc(),
            RainfallObservation.id.desc(),
        )
        .limit(1)
    )

    return db.scalars(
        statement
    ).first()


def risk_zone_to_dict(
    zone: RiskZone,
    district: District,
    geometry: dict[str, Any] | None,
    calculated_risk: dict[str, Any] | None = None,
) -> dict[str, Any]:

    result = {
        "id": zone.id,
        "name": zone.name,
        "district": {
            "id": district.id,
            "name": district.name,
            "state": district.state,
            "code": district.code,
        },
        "risk_level": zone.risk_level,
        "probability": zone.probability,
        "confidence": zone.confidence,
        "rainfall_trigger": zone.rainfall_trigger,
        "priority": zone.priority,
        "affected_villages": zone.affected_villages,
        "affected_roads": zone.affected_roads,
        "geometry": geometry,
        "created_at": zone.created_at,
        "updated_at": zone.updated_at,
    }

    if calculated_risk is not None:
        result["risk_engine"] = calculated_risk

    return result


def calculate_zone_risk(
    db: Session,
    district_id: int,
) -> dict[str, Any] | None:

    rainfall = get_latest_rainfall(
        db=db,
        district_id=district_id,
    )

    if rainfall is None:
        return None

    result = calculate_risk(
        rainfall_1h=rainfall.rainfall_1h,
        rainfall_24h=rainfall.rainfall_24h,
        rainfall_48h=rainfall.rainfall_48h,
        rainfall_72h=rainfall.rainfall_72h,
        antecedent_rainfall=rainfall.antecedent_rainfall,
        soil_moisture=rainfall.soil_moisture,
    )

    return {
        "probability": result.probability,
        "risk_level": result.risk_level,
        "confidence": result.confidence,
        "rainfall_trigger": result.rainfall_trigger,
        "rainfall_observation": {
            "id": rainfall.id,
            "observed_at": rainfall.observed_at,
            "rainfall_1h": rainfall.rainfall_1h,
            "rainfall_24h": rainfall.rainfall_24h,
            "rainfall_48h": rainfall.rainfall_48h,
            "rainfall_72h": rainfall.rainfall_72h,
            "antecedent_rainfall": (
                rainfall.antecedent_rainfall
            ),
            "soil_moisture": (
                rainfall.soil_moisture
            ),
            "trigger_level": (
                rainfall.trigger_level
            ),
            "source": rainfall.source,
        },
    }


# =====================================================================
# ML HEALTH
# =====================================================================

@router.get("/ml/health")
def get_ml_model_health() -> dict[str, Any]:

    try:
        return model_health()

    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "NOT_READY",
                "error": str(exc),
            },
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "status": "ERROR",
                "error": str(exc),
            },
        ) from exc


# =====================================================================
# DIRECT ML PREDICTION
# =====================================================================

@router.post("/ml/predict")
def predict_ml_risk(
    request: RiskPredictionRequest,
) -> dict[str, Any]:

    try:
        record = request.model_dump(
            exclude_none=True,
        )

        return predict_risk(
            record,
        )

    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "ML model unavailable",
                "message": str(exc),
            },
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "ML prediction failed",
                "message": str(exc),
            },
        ) from exc


# =====================================================================
# ZONE ML PREDICTION
# =====================================================================

@router.get("/ml/zone/{zone_id}")
def get_zone_ml_risk(
    zone_id: int,
    db: Session = Depends(get_db),
) -> dict[str, Any]:

    try:
        return predict_zone_ml_risk(
            db=db,
            zone_id=zone_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Zone ML prediction failed",
                "message": str(exc),
            },
        ) from exc


# =====================================================================
# ZONE FUSION
# =====================================================================

@router.get("/fusion/zone/{zone_id}")
def get_zone_risk_fusion(
    zone_id: int,
    db: Session = Depends(get_db),
) -> dict[str, Any]:

    try:

        ml_result = predict_zone_ml_risk(
            db=db,
            zone_id=zone_id,
        )

        zone = db.get(
            RiskZone,
            zone_id,
        )

        if zone is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Risk zone {zone_id} "
                    "was not found."
                ),
            )

        rule_result = calculate_zone_risk(
            db=db,
            district_id=zone.district_id,
        )

        if rule_result is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    "No rainfall observation was "
                    "available for this zone."
                ),
            )

        fusion = fuse_risk(
            ml_result=ml_result,
            rule_result=rule_result,
        )

        return {
            "zone": ml_result.get(
                "zone",
                {
                    "id": zone.id,
                    "name": zone.name,
                },
            ),
            "risk_fusion": fusion,
        }

    except HTTPException:
        raise

    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Risk fusion failed",
                "message": str(exc),
            },
        ) from exc


# =====================================================================
# EXISTING RISK ZONES
# =====================================================================

@router.get("/zones")
def get_risk_zones(
    district_id: int | None = Query(
        default=None,
        description="Filter risk zones by district ID.",
    ),
    risk_level: str | None = Query(
        default=None,
        description=(
            "Filter by risk level, e.g. "
            "CRITICAL, HIGH, MODERATE, LOW."
        ),
    ),
    priority: str | None = Query(
        default=None,
        description=(
            "Filter by operational priority, "
            "e.g. P1, P2, P3."
        ),
    ),
    db: Session = Depends(get_db),
):

    geometry_json = func.ST_AsGeoJSON(
        RiskZone.geometry
    )

    statement = (
        select(
            RiskZone,
            District,
            geometry_json.label(
                "geometry_json"
            ),
        )
        .join(
            District,
            RiskZone.district_id
            == District.id,
        )
        .order_by(
            RiskZone.probability.desc(),
            RiskZone.id.asc(),
        )
    )

    if district_id is not None:
        statement = statement.where(
            RiskZone.district_id
            == district_id,
        )

    if risk_level is not None:
        statement = statement.where(
            func.upper(
                RiskZone.risk_level
            )
            == risk_level.upper(),
        )

    if priority is not None:
        statement = statement.where(
            func.upper(
                RiskZone.priority
            )
            == priority.upper(),
        )

    rows = db.execute(
        statement
    ).all()

    zones = []

    for (
        zone,
        district,
        geometry_json_value,
    ) in rows:

        geometry = None

        if geometry_json_value:
            geometry = json.loads(
                geometry_json_value,
            )

        calculated_risk = calculate_zone_risk(
            db=db,
            district_id=district.id,
        )

        zone_result = risk_zone_to_dict(
            zone=zone,
            district=district,
            geometry=geometry,
            calculated_risk=calculated_risk,
        )

        # ---------------------------------------------------------
        # ML + rule fusion
        # ---------------------------------------------------------

        try:

            ml_result = predict_zone_ml_risk(
                db=db,
                zone_id=zone.id,
            )

            if calculated_risk is not None:

                zone_result[
                    "risk_fusion"
                ] = fuse_risk(
                    ml_result=ml_result,
                    rule_result=calculated_risk,
                )

            else:

                zone_result[
                    "risk_fusion"
                ] = {
                    "status": "NO_RULE_ENGINE_DATA",
                    "ml": ml_result,
                    "database_write": False,
                }

        except Exception as exc:

            zone_result[
                "risk_fusion"
            ] = {
                "status": "UNAVAILABLE",
                "error": str(exc),
                "database_write": False,
            }

        zones.append(
            zone_result
        )

    return {
        "count": len(zones),
        "filters": {
            "district_id": district_id,
            "risk_level": (
                risk_level.upper()
                if risk_level
                else None
            ),
            "priority": (
                priority.upper()
                if priority
                else None
            ),
        },
        "zones": zones,
    }


# =====================================================================
# SINGLE ZONE
# =====================================================================

@router.get("/zones/{zone_id}")
def get_risk_zone(
    zone_id: int,
    db: Session = Depends(get_db),
):

    geometry_json = func.ST_AsGeoJSON(
        RiskZone.geometry
    )

    statement = (
        select(
            RiskZone,
            District,
            geometry_json.label(
                "geometry_json"
            ),
        )
        .join(
            District,
            RiskZone.district_id
            == District.id,
        )
        .where(
            RiskZone.id == zone_id,
        )
    )

    row = db.execute(
        statement
    ).first()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Risk zone {zone_id} "
                "was not found."
            ),
        )

    (
        zone,
        district,
        geometry_json_value,
    ) = row

    geometry = None

    if geometry_json_value:
        geometry = json.loads(
            geometry_json_value,
        )

    calculated_risk = calculate_zone_risk(
        db=db,
        district_id=district.id,
    )

    result = risk_zone_to_dict(
        zone=zone,
        district=district,
        geometry=geometry,
        calculated_risk=calculated_risk,
    )

    try:

        ml_result = predict_zone_ml_risk(
            db=db,
            zone_id=zone.id,
        )

        if calculated_risk is not None:

            result[
                "risk_fusion"
            ] = fuse_risk(
                ml_result=ml_result,
                rule_result=calculated_risk,
            )

        else:

            result[
                "risk_fusion"
            ] = {
                "status": (
                    "NO_RULE_ENGINE_DATA"
                ),
                "ml": ml_result,
                "database_write": False,
            }

    except Exception as exc:

        result[
            "risk_fusion"
        ] = {
            "status": "UNAVAILABLE",
            "error": str(exc),
            "database_write": False,
        }

    return result


# =====================================================================
# RULE-BASED ENGINE
# =====================================================================

@router.get(
    "/engine/district/{district_id}"
)
def get_district_risk_calculation(
    district_id: int,
    db: Session = Depends(get_db),
):

    district = db.get(
        District,
        district_id,
    )

    if district is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"District {district_id} "
                "was not found."
            ),
        )

    calculated_risk = calculate_zone_risk(
        db=db,
        district_id=district_id,
    )

    if calculated_risk is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "No rainfall observation was found "
                f"for district ID {district_id}."
            ),
        )

    return {
        "district": {
            "id": district.id,
            "name": district.name,
            "state": district.state,
            "code": district.code,
        },
        "engine": (
            "BhooPehra Rule-Based Risk Engine"
        ),
        "model_type": "transparent_rule_based",
        "ml_model": False,
        "data": calculated_risk,
    }


# =====================================================================
# RECALCULATE
# =====================================================================

@router.post("/recalculate")
def recalculate_risk_zones(
    db: Session = Depends(get_db),
):

    return update_risk_zones(
        db=db,
    )