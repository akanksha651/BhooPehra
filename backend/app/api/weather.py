from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.rainfall_observation import RainfallObservation
from app.services.location_weather import get_location_weather


router = APIRouter(
    prefix="/api/weather",
    tags=["Weather"],
)


@router.get("/rainfall")
def get_rainfall_observations(
    db: Session = Depends(get_db),
):
    observations = db.scalars(
        select(RainfallObservation).order_by(
            RainfallObservation.observed_at.desc()
        )
    ).all()

    return [
        {
            "id": observation.id,
            "district_id": observation.district_id,
            "observed_at": observation.observed_at,
            "rainfall_1h": observation.rainfall_1h,
            "rainfall_24h": observation.rainfall_24h,
            "rainfall_48h": observation.rainfall_48h,
            "rainfall_72h": observation.rainfall_72h,
            "antecedent_rainfall": observation.antecedent_rainfall,
            "soil_moisture": observation.soil_moisture,
            "trigger_level": observation.trigger_level,
            "source": observation.source,
            "data_type": observation.data_type,
            "created_at": observation.created_at,
        }
        for observation in observations
    ]


@router.get("/location")
def get_location_specific_weather(
    latitude: float = Query(
        ...,
        ge=-90,
        le=90,
        description="Browser GPS latitude",
    ),
    longitude: float = Query(
        ...,
        ge=-180,
        le=180,
        description="Browser GPS longitude",
    ),
):
    """
    Fetch live location-specific weather/rainfall
    using browser-provided GPS coordinates.

    Data comes directly from Open-Meteo and is
    model-derived. Nothing is written to the database.
    """

    try:
        return get_location_weather(
            latitude=latitude,
            longitude=longitude,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Live weather provider could not be reached "
                "or returned invalid data."
            ),
        ) from exc