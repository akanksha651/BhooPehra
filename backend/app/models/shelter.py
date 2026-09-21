from math import asin, cos, radians, sin, sqrt

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.database import get_db


router = APIRouter(
    prefix="/api/shelters",
    tags=["Shelters"],
)


def haversine_km(
    latitude_1: float,
    longitude_1: float,
    latitude_2: float,
    longitude_2: float,
) -> float:
    earth_radius_km = 6371.0088

    lat1 = radians(latitude_1)
    lat2 = radians(latitude_2)
    delta_lat = radians(latitude_2 - latitude_1)
    delta_lon = radians(longitude_2 - longitude_1)

    a = (
        sin(delta_lat / 2) ** 2
        + cos(lat1) * cos(lat2) * sin(delta_lon / 2) ** 2
    )

    return 2 * earth_radius_km * asin(sqrt(a))


def get_safety_status(risk_level: str | None) -> str:
    if not risk_level:
        return "OUTSIDE_MONITORED_RISK_ZONE"

    normalized = risk_level.upper()

    if normalized in {"CRITICAL", "HIGH"}:
        return "UNSAFE"

    if normalized == "MODERATE":
        return "CAUTION"

    if normalized == "LOW":
        return "SAFE_BASELINE"

    return "UNKNOWN"


@router.get("/nearest")
def get_nearest_shelters(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    """
    Return nearest mapped shelter assets and shelter registry status.

    Shelter records are maintained in infrastructure_assets with
    asset_type = 'SHELTER'.

    Shelters without geometry remain registered but are excluded
    from distance and route calculations.
    """

    summary = db.execute(
        text(
            """
            SELECT
                COUNT(*) AS registered_shelters,
                COUNT(*) FILTER (
                    WHERE geometry IS NOT NULL
                ) AS mapped_shelters,
                COUNT(*) FILTER (
                    WHERE geometry IS NULL
                ) AS location_pending
            FROM infrastructure_assets
            WHERE asset_type = 'SHELTER'
            """
        )
    ).mappings().one()

    rows = db.execute(
        text(
            """
            SELECT
                a.id,
                a.asset_code,
                a.name,
                a.district_id,
                d.name AS district_name,
                d.state AS state_name,
                a.capacity,
                a.status AS operational_status,
                a.geometry,

                rz.id AS risk_zone_id,
                rz.name AS risk_zone_name,
                rz.risk_level AS risk_zone_level,
                rz.probability AS risk_zone_probability

            FROM infrastructure_assets a

            LEFT JOIN districts d
                ON d.id = a.district_id

            LEFT JOIN risk_zones rz
                ON rz.id = a.risk_zone_id

            WHERE
                a.asset_type = 'SHELTER'
                AND a.geometry IS NOT NULL
            """
        )
    ).mappings().all()

    shelters = []

    for row in rows:
        point = row["geometry"]

        if point is None:
            continue

        coordinates = db.execute(
            text(
                """
                SELECT
                    ST_Y(:geometry) AS latitude,
                    ST_X(:geometry) AS longitude
                """
            ),
            {"geometry": point},
        ).mappings().one()

        shelter_latitude = coordinates["latitude"]
        shelter_longitude = coordinates["longitude"]

        if shelter_latitude is None or shelter_longitude is None:
            continue

        shelter_latitude = float(shelter_latitude)
        shelter_longitude = float(shelter_longitude)

        distance_km = haversine_km(
            latitude,
            longitude,
            shelter_latitude,
            shelter_longitude,
        )

        risk_zone_level = row["risk_zone_level"]

        shelters.append(
            {
                "id": row["id"],
                "shelter_code": row["asset_code"],
                "name": row["name"],
                "asset_type": "SHELTER",
                "district_id": row["district_id"],
                "district_name": row["district_name"],
                "state": row["state_name"],
                "capacity": row["capacity"],
                "operational_status": row["operational_status"],
                "verification_status": "MAPPED",
                "latitude": shelter_latitude,
                "longitude": shelter_longitude,
                "straight_line_distance_km": round(
                    distance_km,
                    3,
                ),
                "route_distance_km": None,
                "route_status": "NOT_CALCULATED",
                "risk_zone": {
                    "id": row["risk_zone_id"],
                    "name": row["risk_zone_name"],
                    "risk_level": risk_zone_level,
                    "probability": (
                        float(row["risk_zone_probability"])
                        if row["risk_zone_probability"] is not None
                        else None
                    ),
                },
                "safety_status": get_safety_status(
                    risk_zone_level
                ),
                "safety_basis": (
                    "ASSIGNED_RISK_ZONE"
                    if row["risk_zone_id"] is not None
                    else "NO_VERIFIED_RISK_ZONE_RELATIONSHIP"
                ),
                "source": "Infrastructure asset registry",
            }
        )

    shelters.sort(
        key=lambda item: item["straight_line_distance_km"]
    )

    selected = shelters[:limit]

    if shelters:
        result_status = "MAPPED_SHELTERS_AVAILABLE"
    else:
        result_status = "NO_MAPPED_SHELTERS_AVAILABLE"

    return {
        "status": "success",
        "result_status": result_status,
        "query": {
            "latitude": latitude,
            "longitude": longitude,
        },
        "shelter_registry": {
            "registered_shelters": int(
                summary["registered_shelters"]
            ),
            "mapped_shelters": int(
                summary["mapped_shelters"]
            ),
            "location_pending": int(
                summary["location_pending"]
            ),
        },
        "data_source": {
            "table": "infrastructure_assets",
            "filter": "asset_type = SHELTER",
            "geometry_required_for_nearest": True,
        },
        "routing_note": (
            "Straight-line distance is shown until a verified road "
            "route can be calculated."
        ),
        "safety_note": (
            "Shelter safety is classified from an assigned risk zone "
            "only. It is not inferred from the shelter's default "
            "asset risk fields."
        ),
        "shelters": selected,
    }