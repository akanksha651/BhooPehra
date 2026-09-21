from __future__ import annotations

from datetime import datetime
from typing import Any

import requests
from sqlalchemy import text

from app.db.database import SessionLocal
from app.services.weather_ingestion import _fetch_open_meteo


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any) -> int | None:
    if value is None:
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _validate_coordinates(
    latitude: float,
    longitude: float,
) -> None:
    if not -90 <= latitude <= 90:
        raise ValueError(
            "Latitude must be between -90 and 90."
        )

    if not -180 <= longitude <= 180:
        raise ValueError(
            "Longitude must be between -180 and 180."
        )


def _validate_ner_location(
    latitude: float,
    longitude: float,
) -> dict[str, Any]:
    """
    Verify that the requested GPS coordinate falls inside
    an actual Northeast district polygon stored in PostGIS.

    No synthetic boundary or hardcoded coordinate is used.
    """

    db = SessionLocal()

    try:
        row = db.execute(
            text(
                """
                SELECT
                    id,
                    name,
                    state
                FROM districts
                WHERE state = ANY(:states)
                  AND geometry IS NOT NULL
                  AND ST_Covers(
                      geometry,
                      ST_SetSRID(
                          ST_MakePoint(
                              :longitude,
                              :latitude
                          ),
                          4326
                      )
                  )
                ORDER BY state, name
                LIMIT 1
                """
            ),
            {
                "states": [
                    "Arunachal Pradesh",
                    "Assam",
                    "Manipur",
                    "Meghalaya",
                    "Mizoram",
                    "Nagaland",
                    "Sikkim",
                    "Tripura",
                ],
                "longitude": longitude,
                "latitude": latitude,
            },
        ).mappings().first()

    finally:
        db.close()

    if row is None:
        raise ValueError(
            "Location is outside BhooPehra NER coverage. "
            "Live location weather is available only within "
            "the North Eastern Region."
        )

    return {
        "district_id": int(row["id"]),
        "district_name": row["name"],
        "state": row["state"],
    }


def _get_current_hour_index(
    hourly: dict[str, Any],
) -> int:
    times = hourly.get("time")

    if not isinstance(times, list) or not times:
        raise ValueError(
            "Open-Meteo response does not contain hourly timestamps."
        )

    now = datetime.now().astimezone()

    valid_indices: list[int] = []

    for index, raw_time in enumerate(times):
        if not isinstance(raw_time, str):
            continue

        try:
            parsed = datetime.fromisoformat(
                raw_time.replace("Z", "+00:00")
            )
        except ValueError:
            continue

        if parsed.tzinfo is None:
            parsed = parsed.replace(
                tzinfo=now.tzinfo
            )

        if parsed <= now:
            valid_indices.append(index)

    if not valid_indices:
        raise ValueError(
            "Open-Meteo response does not contain "
            "a current or past hourly observation."
        )

    return valid_indices[-1]


def _value_at(
    hourly: dict[str, Any],
    key: str,
    index: int,
) -> float | int | None:
    values = hourly.get(key)

    if not isinstance(values, list):
        return None

    if index >= len(values):
        return None

    return values[index]


def _slice_values(
    hourly: dict[str, Any],
    key: str,
    start: int,
    end: int,
) -> list[float]:
    values = hourly.get(key)

    if not isinstance(values, list):
        return []

    result: list[float] = []

    for value in values[start:end]:
        parsed = _safe_float(value)

        if parsed is not None:
            result.append(parsed)

    return result


def _sum_values(
    hourly: dict[str, Any],
    key: str,
    start: int,
    end: int,
) -> float | None:
    values = _slice_values(
        hourly,
        key,
        start,
        end,
    )

    if not values:
        return None

    return round(sum(values), 2)


def get_location_weather(
    *,
    latitude: float,
    longitude: float,
) -> dict[str, Any]:
    """
    Fetch real Open-Meteo weather data for a browser GPS
    coordinate only after verifying that the coordinate is
    inside the real Northeast district boundaries stored
    in PostGIS.

    This function does NOT write anything to the database.
    """

    _validate_coordinates(
        latitude,
        longitude,
    )

    ner_location = _validate_ner_location(
        latitude,
        longitude,
    )

    payload = _fetch_open_meteo(
        latitude=latitude,
        longitude=longitude,
    )

    hourly = payload.get("hourly")

    if not isinstance(hourly, dict):
        raise ValueError(
            "Open-Meteo response does not contain hourly data."
        )

    current_index = _get_current_hour_index(
        hourly
    )

    start_24h = max(
        0,
        current_index - 23,
    )

    start_48h = max(
        0,
        current_index - 47,
    )

    start_72h = max(
        0,
        current_index - 71,
    )

    precipitation_1h = _safe_float(
        _value_at(
            hourly,
            "precipitation",
            current_index,
        )
    )

    rain_1h = _safe_float(
        _value_at(
            hourly,
            "rain",
            current_index,
        )
    )

    precipitation_24h = _sum_values(
        hourly,
        "precipitation",
        start_24h,
        current_index + 1,
    )

    precipitation_48h = _sum_values(
        hourly,
        "precipitation",
        start_48h,
        current_index + 1,
    )

    precipitation_72h = _sum_values(
        hourly,
        "precipitation",
        start_72h,
        current_index + 1,
    )

    soil_moisture = _safe_float(
        _value_at(
            hourly,
            "soil_moisture_0_to_7cm",
            current_index,
        )
    )

    soil_moisture_percent = (
        round(soil_moisture * 100, 1)
        if soil_moisture is not None
        else None
    )

    observed_at = None

    times = hourly.get("time")

    if isinstance(times, list):
        if current_index < len(times):
            observed_at = times[current_index]

    return {
        "success": True,
        "location": {
            "latitude": round(latitude, 6),
            "longitude": round(longitude, 6),
        },
        "coverage": {
            "region": "North Eastern Region",
            "district_id": ner_location["district_id"],
            "district_name": ner_location["district_name"],
            "state": ner_location["state"],
        },
        "source": "Open-Meteo",
        "data_type": "MODEL_DERIVED",
        "observed_at": observed_at,
        "current": {
            "precipitation_1h_mm": precipitation_1h,
            "rain_1h_mm": rain_1h,
            "soil_moisture_percent": soil_moisture_percent,
        },
        "rainfall": {
            "1h_mm": precipitation_1h,
            "24h_mm": precipitation_24h,
            "48h_mm": precipitation_48h,
            "72h_mm": precipitation_72h,
        },
        "provenance": {
            "provider": "Open-Meteo",
            "data_type": "MODEL_DERIVED",
            "ground_station_measurement": False,
            "coverage_validation": "PostGIS_NER_DISTRICT_GEOMETRY",
        },
    }