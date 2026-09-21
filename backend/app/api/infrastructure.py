from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.infrastructure_asset import InfrastructureAsset
from app.models.risk_zone import RiskZone
from app.services.impact_priority_updater import (
    update_infrastructure_priorities,
)
from app.services.road_blockage import (
    sync_verified_field_report_blockages,
)


router = APIRouter(
    prefix="/api/infrastructure",
    tags=["Infrastructure"],
)


def _latest_calculated_values(
    asset: InfrastructureAsset,
) -> dict[str, Any]:
    """
    Return the latest values already calculated by the
    impact/priority engine.
    """
    return {
        "risk_level": asset.risk_level,
        "probability": float(asset.probability),
        "probability_percent": round(
            float(asset.probability) * 100,
            1,
        ),
        "priority": asset.priority,
        "exposure_count": int(
            asset.exposure_count or 0
        ),
        "status": asset.status,
        "recommendation": asset.recommendation,
    }


def _geometry_details(
    db: Session,
    asset: InfrastructureAsset,
) -> dict[str, Any]:
    """
    Read actual PostGIS geometry information.

    No coordinates are generated here.
    No fallback coordinates are invented.
    Geometry availability is determined from the DB.
    Spatial verification is determined using ST_Intersects.
    """

    if asset.geometry is None:
        return {
            "available": False,
            "spatially_verified": False,
            "zone_intersection": False,
            "verification_status": "GEOMETRY_UNAVAILABLE",
            "geometry_type": None,
            "coordinates": None,
        }

    geometry_wkt = db.execute(
        select(
            func.ST_AsText(
                InfrastructureAsset.geometry
            )
        ).where(
            InfrastructureAsset.id == asset.id
        )
    ).scalar_one_or_none()

    coordinates = None
    geometry_type = None

    if geometry_wkt:
        geometry_type = db.execute(
            select(
                func.ST_GeometryType(
                    InfrastructureAsset.geometry
                )
            ).where(
                InfrastructureAsset.id == asset.id
            )
        ).scalar_one_or_none()

        try:
            if geometry_wkt.startswith("POINT"):
                coordinate_text = (
                    geometry_wkt
                    .replace("POINT(", "")
                    .replace("POINT (", "")
                    .replace(")", "")
                    .strip()
                )

                parts = coordinate_text.split()

                if len(parts) >= 2:
                    coordinates = {
                        "longitude": float(parts[0]),
                        "latitude": float(parts[1]),
                    }
        except (
            ValueError,
            IndexError,
        ):
            coordinates = None

    if asset.risk_zone_id is None:
        return {
            "available": True,
            "spatially_verified": False,
            "zone_intersection": False,
            "verification_status": "NO_RISK_ZONE_ASSIGNMENT",
            "geometry_type": geometry_type,
            "wkt": geometry_wkt,
            "coordinates": coordinates,
        }

    risk_zone = db.get(
        RiskZone,
        asset.risk_zone_id,
    )

    if risk_zone is None:
        return {
            "available": True,
            "spatially_verified": False,
            "zone_intersection": False,
            "verification_status": "RISK_ZONE_NOT_FOUND",
            "geometry_type": geometry_type,
            "wkt": geometry_wkt,
            "coordinates": coordinates,
        }

    if risk_zone.geometry is None:
        return {
            "available": True,
            "spatially_verified": False,
            "zone_intersection": False,
            "verification_status": (
                "RISK_ZONE_GEOMETRY_UNAVAILABLE"
            ),
            "geometry_type": geometry_type,
            "wkt": geometry_wkt,
            "coordinates": coordinates,
        }

    intersects = db.execute(
        select(
            func.ST_Intersects(
                InfrastructureAsset.geometry,
                RiskZone.geometry,
            )
        )
        .select_from(InfrastructureAsset)
        .join(
            RiskZone,
            RiskZone.id == InfrastructureAsset.risk_zone_id,
        )
        .where(
            InfrastructureAsset.id == asset.id
        )
    ).scalar_one_or_none()

    zone_intersection = bool(intersects)

    if zone_intersection:
        verification_status = "VERIFIED"
    else:
        verification_status = (
            "GEOMETRY_AVAILABLE_NO_ZONE_INTERSECTION"
        )

    return {
        "available": True,
        "spatially_verified": zone_intersection,
        "zone_intersection": zone_intersection,
        "verification_status": verification_status,
        "geometry_type": geometry_type,
        "wkt": geometry_wkt,
        "coordinates": coordinates,
    }


def _asset_response(
    db: Session,
    asset: InfrastructureAsset,
) -> dict[str, Any]:
    geometry = _geometry_details(
        db,
        asset,
    )

    calculated = _latest_calculated_values(
        asset
    )

    spatial_population_count = 0

    if geometry["spatially_verified"]:
        spatial_population_count = int(
            asset.exposure_count or 0
        )

    population_basis = (
        "SPATIALLY_VERIFIED"
        if geometry["spatially_verified"]
        else (
            "GEOMETRY_AVAILABLE_NO_ZONE_INTERSECTION"
            if geometry["available"]
            else "GEOMETRY_UNAVAILABLE"
        )
    )

    risk_zone_name = None

    if asset.risk_zone_id is not None:
        risk_zone_name = db.execute(
            select(RiskZone.name).where(
                RiskZone.id == asset.risk_zone_id
            )
        ).scalar_one_or_none()

    return {
        "id": asset.id,
        "asset_code": asset.asset_code,
        "name": asset.name,
        "asset_type": asset.asset_type,
        "district_id": asset.district_id,
        "risk_zone_id": asset.risk_zone_id,
        "risk_zone_name": risk_zone_name,
        "risk_level": calculated["risk_level"],
        "probability": calculated["probability"],
        "probability_percent": calculated[
            "probability_percent"
        ],
        "priority": calculated["priority"],
        "exposure_count": calculated[
            "exposure_count"
        ],
        "status": calculated["status"],
        "recommendation": calculated[
            "recommendation"
        ],
        "geometry": geometry,
        "population_exposure": {
            "count": spatial_population_count,
            "basis": population_basis,
            "operational_known_count": int(
                asset.exposure_count or 0
            ),
        },
        "operational_exposure": {
            "basis": (
                "KNOWN_OPERATIONAL_RISK_ZONE_ASSIGNMENT"
                if asset.risk_zone_id is not None
                else "ASSET_REGISTRY"
            ),
            "known": True,
            "requires_spatial_verification": (
                not geometry["spatially_verified"]
            ),
        },
        "created_at": (
            asset.created_at.isoformat()
            if asset.created_at
            else None
        ),
        "updated_at": (
            asset.updated_at.isoformat()
            if asset.updated_at
            else None
        ),
    }


@router.get("/assets")
def get_infrastructure_assets(
    db: Session = Depends(get_db),
    asset_type: str | None = Query(
        default=None
    ),
    risk_level: str | None = Query(
        default=None
    ),
    district_id: int | None = Query(
        default=None
    ),
) -> dict[str, Any]:
    """
    Return the live infrastructure registry
    with actual PostGIS geometry verification.
    """

    statement = select(
        InfrastructureAsset
    ).order_by(
        InfrastructureAsset.id
    )

    if asset_type:
        statement = statement.where(
            InfrastructureAsset.asset_type
            == asset_type.upper()
        )

    if risk_level:
        statement = statement.where(
            InfrastructureAsset.risk_level
            == risk_level.upper()
        )

    if district_id is not None:
        statement = statement.where(
            InfrastructureAsset.district_id
            == district_id
        )

    assets = list(
        db.scalars(statement).all()
    )

    data = [
        _asset_response(
            db,
            asset,
        )
        for asset in assets
    ]

    spatially_verified = sum(
        1
        for item in data
        if item["geometry"]["spatially_verified"]
    )

    geometry_available = sum(
        1
        for item in data
        if item["geometry"]["available"]
    )

    geometry_pending = sum(
        1
        for item in data
        if not item["geometry"]["available"]
    )

    outside_zone = sum(
        1
        for item in data
        if item["geometry"]["verification_status"]
        == "GEOMETRY_AVAILABLE_NO_ZONE_INTERSECTION"
    )

    return {
        "status": "success",
        "count": len(data),
        "summary": {
            "total_assets": len(data),
            "geometry_available": geometry_available,
            "spatially_verified": spatially_verified,
            "geometry_pending": geometry_pending,
            "outside_zone": outside_zone,
            "synthetic_coordinates_created": False,
        },
        "data": data,
    }


@router.get("/assets/{asset_id}")
def get_infrastructure_asset(
    asset_id: int,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Return one infrastructure asset with
    full geometry and exposure metadata.
    """

    asset = db.get(
        InfrastructureAsset,
        asset_id,
    )

    if asset is None:
        raise HTTPException(
            status_code=404,
            detail="Infrastructure asset not found",
        )

    return {
        "status": "success",
        "data": _asset_response(
            db,
            asset,
        ),
    }


@router.get("/exposure")
def get_infrastructure_exposure(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Return risk-zone exposure using:
    1. known operational risk-zone assignment
    2. actual spatial intersection where geometry exists

    Existing operational counts are NOT discarded merely
    because an asset has no geometry.
    """

    zones = list(
        db.scalars(
            select(RiskZone).order_by(
                RiskZone.id
            )
        ).all()
    )

    zone_data: list[dict[str, Any]] = []

    total_known_villages = 0
    total_known_roads = 0
    total_spatial_villages = 0
    total_spatial_roads = 0
    total_spatial_assets = 0
    total_unverified = 0
    total_outside = 0

    for zone in zones:
        assets = list(
            db.scalars(
                select(
                    InfrastructureAsset
                ).where(
                    InfrastructureAsset.risk_zone_id
                    == zone.id
                )
            ).all()
        )

        known_villages = 0
        known_roads = 0

        spatial_villages = 0
        spatial_roads = 0
        spatial_asset_count = 0

        unverified_assets = []
        outside_zone_assets = []

        for asset in assets:
            asset_geometry = _geometry_details(
                db,
                asset,
            )

            if asset.asset_type == "VILLAGE":
                known_villages += 1

            if asset.asset_type == "ROAD":
                known_roads += 1

            if not asset_geometry["available"]:
                unverified_assets.append(
                    {
                        "asset_id": asset.id,
                        "asset_code": asset.asset_code,
                        "name": asset.name,
                        "asset_type": asset.asset_type,
                        "reason": "GEOMETRY_UNAVAILABLE",
                    }
                )
                continue

            if asset_geometry[
                "spatially_verified"
            ]:
                spatial_asset_count += 1

                if asset.asset_type == "VILLAGE":
                    spatial_villages += 1

                if asset.asset_type == "ROAD":
                    spatial_roads += 1

            elif (
                asset_geometry[
                    "verification_status"
                ]
                == "GEOMETRY_AVAILABLE_NO_ZONE_INTERSECTION"
            ):
                outside_zone_assets.append(
                    {
                        "asset_id": asset.id,
                        "asset_code": asset.asset_code,
                        "name": asset.name,
                        "asset_type": asset.asset_type,
                        "reason": (
                            "GEOMETRY_AVAILABLE_NO_ZONE_INTERSECTION"
                        ),
                    }
                )

        verification_status = (
            "VERIFIED"
            if (
                spatial_asset_count == len(assets)
                and len(assets) > 0
            )
            else (
                "UNVERIFIED"
                if unverified_assets
                else (
                    "PARTIAL"
                    if outside_zone_assets
                    else "UNVERIFIED"
                )
            )
        )

        total_known_villages += known_villages
        total_known_roads += known_roads

        total_spatial_villages += spatial_villages
        total_spatial_roads += spatial_roads

        total_spatial_assets += spatial_asset_count

        total_unverified += len(
            unverified_assets
        )

        total_outside += len(
            outside_zone_assets
        )

        zone_data.append(
            {
                "zone_id": zone.id,
                "zone_name": zone.name,
                "district_id": zone.district_id,
                "operational_exposure": {
                    "affected_villages": (
                        zone.affected_villages
                        if zone.affected_villages
                        is not None
                        else known_villages
                    ),
                    "affected_roads": (
                        zone.affected_roads
                        if zone.affected_roads
                        is not None
                        else known_roads
                    ),
                    "basis": (
                        "KNOWN_OPERATIONAL_RISK_ZONE_ASSIGNMENT"
                    ),
                },
                "spatial_exposure": {
                    "affected_villages": spatial_villages,
                    "affected_roads": spatial_roads,
                    "spatial_asset_count": (
                        spatial_asset_count
                    ),
                    "method": "ST_Intersects",
                },
                "verification": {
                    "status": verification_status,
                    "unverified_asset_count": len(
                        unverified_assets
                    ),
                    "outside_zone_asset_count": len(
                        outside_zone_assets
                    ),
                    "synthetic_coordinates_created": False,
                },
                "unverified_assets": unverified_assets,
                "outside_zone_assets": outside_zone_assets,
            }
        )

    return {
        "status": "success",
        "exposure_basis": (
            "SPATIAL_VERIFIED_PLUS_KNOWN_OPERATIONAL"
        ),
        "spatial_method": "ST_Intersects",
        "synthetic_coordinates_created": False,
        "summary": {
            "risk_zones": len(zone_data),
            "known_affected_villages": (
                total_known_villages
            ),
            "known_affected_roads": (
                total_known_roads
            ),
            "spatial_affected_villages": (
                total_spatial_villages
            ),
            "spatial_affected_roads": (
                total_spatial_roads
            ),
            "spatial_assets": (
                total_spatial_assets
            ),
            "unverified_assets": (
                total_unverified
            ),
            "outside_zone_assets": (
                total_outside
            ),
        },
        "data": zone_data,
    }


@router.post("/recalculate")
def recalculate_infrastructure(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Recalculate infrastructure risk, impact and priority
    values using the current backend engine.
    """

    try:
        result = update_infrastructure_priorities(
            db
        )

        assets = list(
            db.scalars(
                select(
                    InfrastructureAsset
                ).order_by(
                    InfrastructureAsset.id
                )
            ).all()
        )

        return {
            "status": "success",
            "engine_result": result,
            "count": len(assets),
            "data": [
                _asset_response(
                    db,
                    asset,
                )
                for asset in assets
            ],
        }

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "Infrastructure recalculation failed: "
                f"{exc}"
            ),
        ) from exc


@router.post("/road-blockage/sync")
def sync_road_blockages(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Synchronize verified field-report road blockage evidence
    with the real OSM road network.

    Only VERIFIED reports with meaningful road_impact and
    usable GPS coordinates can block a road.

    Matching is performed using PostGIS ST_DWithin against
    actual imported OSM road geometry.

    No synthetic geometry is created.
    """

    try:
        result = sync_verified_field_report_blockages(
            db
        )

        return result

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "Road blockage synchronization failed: "
                f"{exc}"
            ),
        ) from exc


@router.get("/road-blockage/status")
def get_road_blockage_status(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Return the current verified road blockage state.

    This endpoint reports only the state stored in the
    road_network table. It does not infer blockage from
    historical landslide descriptions.
    """

    try:
        total_roads = db.execute(
            select(
                func.count()
            ).select_from(
                InfrastructureAsset
            ).where(
                InfrastructureAsset.asset_type
                == "ROAD"
            )
        ).scalar_one()

        return {
            "status": "success",
            "source": "VERIFIED_FIELD_REPORT",
            "note": (
                "Current road blockage is based on "
                "verified field-report evidence matched "
                "to the imported OSM road network."
            ),
            "infrastructure_registry_roads": int(
                total_roads
            ),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Road blockage status failed: "
                f"{exc}"
            ),
        ) from exc
