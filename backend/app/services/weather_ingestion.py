from datetime import datetime
from time import sleep
from typing import Any
from zoneinfo import ZoneInfo

import requests
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.district import District
from app.models.infrastructure_asset import InfrastructureAsset
from app.models.rainfall_observation import RainfallObservation
from app.models.risk_zone import RiskZone
from app.services.risk_engine import calculate_risk


OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

SOURCE_NAME = "Open-Meteo"

REQUEST_TIMEOUT_SECONDS = 30

MAX_REQUEST_ATTEMPTS = 3

RETRY_BACKOFF_SECONDS = 1


def _safe_float(
    value: Any,
    default: float = 0.0,
) -> float:
    if value is None:
        return default

    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_observation_time(
    value: str,
) -> datetime:
    return datetime.fromisoformat(value)


def _calculate_accumulation(
    precipitation: list[float],
    index: int,
    hours: int,
) -> float:
    start = max(
        0,
        index - hours + 1,
    )

    values = precipitation[start : index + 1]

    return round(
        sum(
            _safe_float(value)
            for value in values
        ),
        2,
    )


def _calculate_trigger_level(
    *,
    rainfall_1h: float,
    rainfall_24h: float,
    rainfall_48h: float,
    rainfall_72h: float,
    antecedent_rainfall: float,
    soil_moisture: float | None,
) -> str:
    result = calculate_risk(
        rainfall_1h=rainfall_1h,
        rainfall_24h=rainfall_24h,
        rainfall_48h=rainfall_48h,
        rainfall_72h=rainfall_72h,
        antecedent_rainfall=antecedent_rainfall,
        soil_moisture=soil_moisture,
    )

    return result.rainfall_trigger


def _fetch_open_meteo(
    *,
    latitude: float,
    longitude: float,
) -> dict[str, Any]:
    parameters = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": (
            "precipitation,"
            "rain,"
            "soil_moisture_0_to_7cm"
        ),
        "past_days": 3,
        "forecast_days": 1,
        "timezone": "Asia/Kolkata",
        "cell_selection": "land",
    }

    last_error: Exception | None = None

    for attempt in range(
        1,
        MAX_REQUEST_ATTEMPTS + 1,
    ):
        try:
            response = requests.get(
                OPEN_METEO_URL,
                params=parameters,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )

            if (
                response.status_code
                in {429, 500, 502, 503, 504}
                and attempt < MAX_REQUEST_ATTEMPTS
            ):
                sleep(
                    RETRY_BACKOFF_SECONDS * attempt
                )
                continue

            response.raise_for_status()

            payload = response.json()

            if not isinstance(payload, dict):
                raise ValueError(
                    "Open-Meteo returned an invalid response."
                )

            hourly = payload.get("hourly")

            if not isinstance(hourly, dict):
                raise ValueError(
                    "Open-Meteo response does not contain hourly data."
                )

            return payload

        except requests.RequestException as exc:
            last_error = exc

            if attempt >= MAX_REQUEST_ATTEMPTS:
                raise

            sleep(
                RETRY_BACKOFF_SECONDS * attempt
            )

    if last_error is not None:
        raise last_error

    raise RuntimeError(
        "Open-Meteo request failed without a captured error."
    )


def _get_district_coordinates(
    db: Session,
) -> dict[int, tuple[float, float]]:
    """
    Use real PostGIS district geometry as the coordinate source.

    Coverage includes districts with operational risk zones and
    districts containing shelter infrastructure assets. No
    artificial latitude/longitude values are introduced.
    """

    risk_zone_districts = select(
        RiskZone.district_id.label("district_id")
    ).where(
        RiskZone.geometry.is_not(None)
    )

    shelter_districts = select(
        InfrastructureAsset.district_id.label("district_id")
    ).where(
        InfrastructureAsset.asset_type == "SHELTER"
    )

    covered_districts = risk_zone_districts.union(
        shelter_districts
    ).subquery()

    statement = (
        select(
            District.id,
            func.ST_Y(
                func.ST_Centroid(
                    District.geometry
                )
            ),
            func.ST_X(
                func.ST_Centroid(
                    District.geometry
                )
            ),
        )
        .join(
            covered_districts,
            covered_districts.c.district_id == District.id,
        )
        .where(
            District.geometry.is_not(None)
        )
        .order_by(
            District.id.asc()
        )
    )

    rows = db.execute(statement).all()

    coordinates: dict[int, tuple[float, float]] = {}

    for district_id, latitude, longitude in rows:
        if district_id is None:
            continue

        if latitude is None or longitude is None:
            continue

        coordinates[int(district_id)] = (
            float(latitude),
            float(longitude),
        )

    return coordinates


def _get_districts(
    db: Session,
) -> list[District]:
    risk_zone_districts = select(
        RiskZone.district_id.label("district_id")
    ).where(
        RiskZone.geometry.is_not(None)
    )

    shelter_districts = select(
        InfrastructureAsset.district_id.label("district_id")
    ).where(
        InfrastructureAsset.asset_type == "SHELTER"
    )

    covered_districts = risk_zone_districts.union(
        shelter_districts
    ).subquery()

    return db.scalars(
        select(District)
        .join(
            covered_districts,
            covered_districts.c.district_id == District.id,
        )
        .where(
            District.geometry.is_not(None)
        )
        .order_by(
            District.id.asc()
        )
    ).all()

def _find_existing_observation(
    db: Session,
    *,
    district_id: int,
    observed_at: datetime,
) -> RainfallObservation | None:
    statement = (
        select(RainfallObservation)
        .where(
            RainfallObservation.district_id == district_id,
            RainfallObservation.observed_at == observed_at,
            RainfallObservation.source == SOURCE_NAME,
        )
        .limit(1)
    )

    return db.scalar(statement)


def ingest_district_rainfall(
    db: Session,
    *,
    district: District,
    latitude: float,
    longitude: float,
) -> dict[str, Any]:
    payload = _fetch_open_meteo(
        latitude=latitude,
        longitude=longitude,
    )

    hourly = payload["hourly"]

    times = hourly.get("time", [])
    precipitation = hourly.get("precipitation", [])
    soil_moisture = hourly.get(
        "soil_moisture_0_to_7cm",
        [],
    )

    if not times:
        raise ValueError(
            "Open-Meteo returned no hourly timestamps."
        )

    if not precipitation:
        raise ValueError(
            "Open-Meteo returned no precipitation data."
        )

    if len(times) != len(precipitation):
        raise ValueError(
            "Open-Meteo time and precipitation arrays "
            "have different lengths."
        )

    # Open-Meteo returns both historical and forecast hours.
    # Only use the latest timestamp that is not in the future
    # according to India Standard Time.
    now_ist = datetime.now(
        ZoneInfo("Asia/Kolkata")
    ).replace(
        tzinfo=None
    )

    valid_indices = [
        index
        for index, value in enumerate(times)
        if _parse_observation_time(value) <= now_ist
    ]

    if not valid_indices:
        raise ValueError(
            "Open-Meteo returned no hourly data at or before "
            "the current India time."
        )

    latest_index = valid_indices[-1]

    observed_at = _parse_observation_time(
        times[latest_index]
    )

    rainfall_1h = _safe_float(
        precipitation[latest_index]
    )

    rainfall_24h = _calculate_accumulation(
        precipitation=precipitation,
        index=latest_index,
        hours=24,
    )

    rainfall_48h = _calculate_accumulation(
        precipitation=precipitation,
        index=latest_index,
        hours=48,
    )

    rainfall_72h = _calculate_accumulation(
        precipitation=precipitation,
        index=latest_index,
        hours=72,
    )

    antecedent_rainfall = rainfall_72h

    soil_moisture_percent: float | None = None

    if (
        isinstance(soil_moisture, list)
        and len(soil_moisture) > latest_index
    ):
        raw_value = soil_moisture[latest_index]

        if raw_value is not None:
            soil_moisture_percent = round(
                _safe_float(raw_value) * 100.0,
                2,
            )

    trigger_level = _calculate_trigger_level(
        rainfall_1h=rainfall_1h,
        rainfall_24h=rainfall_24h,
        rainfall_48h=rainfall_48h,
        rainfall_72h=rainfall_72h,
        antecedent_rainfall=antecedent_rainfall,
        soil_moisture=soil_moisture_percent,
    )

    existing = _find_existing_observation(
        db,
        district_id=district.id,
        observed_at=observed_at,
    )

    if existing is not None:
        existing.rainfall_1h = rainfall_1h
        existing.rainfall_24h = rainfall_24h
        existing.rainfall_48h = rainfall_48h
        existing.rainfall_72h = rainfall_72h
        existing.antecedent_rainfall = antecedent_rainfall
        existing.soil_moisture = soil_moisture_percent
        existing.trigger_level = trigger_level
        existing.source_latitude = _safe_float(
            payload.get("latitude"),
            latitude,
        )
        existing.source_longitude = _safe_float(
            payload.get("longitude"),
            longitude,
        )
        existing.source_timezone = payload.get(
            "timezone"
        )
        existing.data_type = "MODEL_DERIVED"

        observation = existing
        action = "UPDATED"

    else:
        observation = RainfallObservation(
            district_id=district.id,
            observed_at=observed_at,
            rainfall_1h=rainfall_1h,
            rainfall_24h=rainfall_24h,
            rainfall_48h=rainfall_48h,
            rainfall_72h=rainfall_72h,
            antecedent_rainfall=antecedent_rainfall,
            soil_moisture=soil_moisture_percent,
            trigger_level=trigger_level,
            source=SOURCE_NAME,
            source_latitude=_safe_float(
                payload.get("latitude"),
                latitude,
            ),
            source_longitude=_safe_float(
                payload.get("longitude"),
                longitude,
            ),
            source_timezone=payload.get(
                "timezone"
            ),
            data_type="MODEL_DERIVED",
        )

        db.add(observation)

        action = "CREATED"

    db.flush()

    return {
        "success": True,
        "district_id": district.id,
        "district": district.name,
        "state": district.state,
        "action": action,
        "observation_id": observation.id,
        "observed_at": observed_at.isoformat(),
        "rainfall_1h": rainfall_1h,
        "rainfall_24h": rainfall_24h,
        "rainfall_48h": rainfall_48h,
        "rainfall_72h": rainfall_72h,
        "antecedent_rainfall": antecedent_rainfall,
        "soil_moisture": soil_moisture_percent,
        "trigger_level": trigger_level,
        "source": SOURCE_NAME,
        "data_type": observation.data_type,
        "source_latitude": observation.source_latitude,
        "source_longitude": observation.source_longitude,
        "source_timezone": observation.source_timezone,
    }


def ingest_all_district_rainfall(
    db: Session,
) -> dict[str, Any]:
    coordinates = _get_district_coordinates(db)

    districts = _get_districts(db)

    results: list[dict[str, Any]] = []

    created_count = 0
    updated_count = 0
    skipped_count = 0
    failed_count = 0

    for district in districts:
        district_coordinates = coordinates.get(
            district.id
        )

        if district_coordinates is None:
            skipped_count += 1

            results.append(
                {
                    "success": False,
                    "district_id": district.id,
                    "district": district.name,
                    "state": district.state,
                    "status": "SKIPPED",
                    "reason": (
                        "No PostGIS risk-zone centroid "
                        "available for this district."
                    ),
                }
            )

            continue

        latitude, longitude = district_coordinates

        try:
            result = ingest_district_rainfall(
                db,
                district=district,
                latitude=latitude,
                longitude=longitude,
            )

            results.append(result)

            if result["action"] == "CREATED":
                created_count += 1

            elif result["action"] == "UPDATED":
                updated_count += 1

        except Exception as exc:
            failed_count += 1

            results.append(
                {
                    "success": False,
                    "district_id": district.id,
                    "district": district.name,
                    "state": district.state,
                    "status": "FAILED",
                    "reason": str(exc),
                }
            )

    db.commit()

    return {
        "success": failed_count == 0,
        "source": SOURCE_NAME,
        "district_count": len(districts),
        "districts_with_coordinates": len(
            coordinates
        ),
        "created_count": created_count,
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "failed_count": failed_count,
        "data": results,
    }


if __name__ == "__main__":
    from app.db.database import SessionLocal

    db = SessionLocal()

    try:
        result = ingest_all_district_rainfall(db)

        print(
            "Open-Meteo rainfall ingestion completed."
        )

        print(
            f"Districts processed: "
            f"{result['district_count']}"
        )

        print(
            f"Created: "
            f"{result['created_count']}"
        )

        print(
            f"Updated: "
            f"{result['updated_count']}"
        )

        print(
            f"Skipped: "
            f"{result['skipped_count']}"
        )

        print(
            f"Failed: "
            f"{result['failed_count']}"
        )

        for item in result["data"]:
            print(item)

    finally:
        db.close()

