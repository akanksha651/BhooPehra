import re
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.district import District
from app.models.field_report import FieldReport
from app.models.infrastructure_asset import InfrastructureAsset
from app.models.landslide_event import LandslideEvent
from app.models.risk_zone import RiskZone


router = APIRouter(
    prefix="/api/search",
    tags=["Search"],
)


def normalize_text(value: str | None) -> str:
    if not value:
        return ""

    return value.strip().lower()


def normalize_field_report_query(value: str) -> str:
    """
    Normalize short field-report identifiers such as:
    FR-1, FR-01, FR-001 -> FR-0001
    """
    normalized = normalize_text(value)

    match = re.fullmatch(r"fr[-\s]?(\d+)", normalized)
    if not match:
        return normalized

    return f"fr-{int(match.group(1)):04d}"


def serialize_result(
    *,
    result_type: str,
    result_id: int,
    name: str,
    subtitle: str,
    district: str | None,
    state: str | None,
    latitude: float | None,
    longitude: float | None,
    risk: str | None = None,
    priority: str | None = None,
    source: str | None = None,
) -> dict[str, Any]:
    return {
        "type": result_type,
        "id": result_id,
        "name": name,
        "subtitle": subtitle,
        "district": district,
        "state": state,
        "latitude": latitude,
        "longitude": longitude,
        "risk": risk,
        "priority": priority,
        "source": source,
    }


@router.get("")
def global_search(
    q: str = Query(
        ...,
        min_length=2,
        max_length=100,
        description=(
            "Search district, risk zone, infrastructure "
            "asset, field report, or GSI historical landslide event."
        ),
    ),
    limit: int = Query(
        20,
        ge=1,
        le=50,
    ),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    query = normalize_field_report_query(q)

    results: list[dict[str, Any]] = []

    # ---------------------------------------------------------
    # 1. DISTRICTS
    # ---------------------------------------------------------

    district_statement = (
        select(District)
        .where(
            or_(
                District.name.ilike(f"%{query}%"),
                District.state.ilike(f"%{query}%"),
                District.code.ilike(f"%{query}%"),
            )
        )
        .order_by(
            func.lower(District.name) == query,
            District.name,
        )
        .limit(limit)
    )

    districts = db.scalars(
        district_statement
    ).all()

    for district in districts:
        latitude = None
        longitude = None

        if district.geometry is not None:
            centroid = func.ST_Centroid(
                district.geometry
            )

            coordinates = db.execute(
                select(
                    func.ST_Y(centroid),
                    func.ST_X(centroid),
                ).where(
                    District.id == district.id
                )
            ).first()

            if coordinates:
                latitude = coordinates[0]
                longitude = coordinates[1]

        results.append(
            serialize_result(
                result_type="district",
                result_id=district.id,
                name=district.name,
                subtitle=f"{district.name}, {district.state}",
                district=district.name,
                state=district.state,
                latitude=latitude,
                longitude=longitude,
                source="BhooPehra District Database",
            )
        )

    # ---------------------------------------------------------
    # 2. RISK ZONES
    # ---------------------------------------------------------

    risk_statement = (
        select(RiskZone, District)
        .join(
            District,
            District.id == RiskZone.district_id,
        )
        .where(
            or_(
                RiskZone.name.ilike(
                    f"%{query}%"
                ),
                RiskZone.risk_level.ilike(
                    f"%{query}%"
                ),
                RiskZone.priority.ilike(
                    f"%{query}%"
                ),
                District.name.ilike(
                    f"%{query}%"
                ),
                District.state.ilike(
                    f"%{query}%"
                ),
            )
        )
        .order_by(
            func.lower(RiskZone.name) == query,
            RiskZone.probability.desc(),
        )
        .limit(limit)
    )

    risk_rows = db.execute(
        risk_statement
    ).all()

    for risk_zone, district in risk_rows:
        latitude = None
        longitude = None

        if risk_zone.geometry is not None:
            centroid = db.execute(
                select(
                    func.ST_Y(
                        func.ST_Centroid(
                            risk_zone.geometry
                        )
                    ),
                    func.ST_X(
                        func.ST_Centroid(
                            risk_zone.geometry
                        )
                    ),
                ).where(
                    RiskZone.id == risk_zone.id
                )
            ).first()

            if centroid:
                latitude = centroid[0]
                longitude = centroid[1]

        results.append(
            serialize_result(
                result_type="risk_zone",
                result_id=risk_zone.id,
                name=risk_zone.name,
                subtitle=(
                    f"{district.name}, "
                    f"{district.state}"
                ),
                district=district.name,
                state=district.state,
                latitude=latitude,
                longitude=longitude,
                risk=risk_zone.risk_level,
                priority=risk_zone.priority,
                source="BhooPehra Risk Engine",
            )
        )

    # ---------------------------------------------------------
    # 3. INFRASTRUCTURE ASSETS
    # ---------------------------------------------------------

    infrastructure_statement = (
        select(
            InfrastructureAsset,
            District,
        )
        .join(
            District,
            District.id
            == InfrastructureAsset.district_id,
        )
        .where(
            or_(
                InfrastructureAsset.name.ilike(
                    f"%{query}%"
                ),
                InfrastructureAsset.asset_code.ilike(
                    f"%{query}%"
                ),
                InfrastructureAsset.asset_type.ilike(
                    f"%{query}%"
                ),
                District.name.ilike(
                    f"%{query}%"
                ),
                District.state.ilike(
                    f"%{query}%"
                ),
            )
        )
        .order_by(
            func.lower(
                InfrastructureAsset.name
            )
            == query,
            InfrastructureAsset.priority,
        )
        .limit(limit)
    )

    infrastructure_rows = db.execute(
        infrastructure_statement
    ).all()

    for asset, district in infrastructure_rows:
        latitude = None
        longitude = None

        if asset.geometry is not None:
            coordinates = db.execute(
                select(
                    func.ST_Y(asset.geometry),
                    func.ST_X(asset.geometry),
                ).where(
                    InfrastructureAsset.id
                    == asset.id
                )
            ).first()

            if coordinates:
                latitude = coordinates[0]
                longitude = coordinates[1]

        results.append(
            serialize_result(
                result_type="infrastructure",
                result_id=asset.id,
                name=asset.name,
                subtitle=(
                    f"{asset.asset_type} • "
                    f"{district.name}"
                ),
                district=district.name,
                state=district.state,
                latitude=latitude,
                longitude=longitude,
                risk=asset.risk_level,
                priority=asset.priority,
                source="BhooPehra Infrastructure Database",
            )
        )

    # ---------------------------------------------------------
    # 4. FIELD REPORTS
    # ---------------------------------------------------------

    field_report_statement = (
        select(
            FieldReport,
            District,
        )
        .outerjoin(
            District,
            District.id == FieldReport.district_id,
        )
        .where(
            or_(
                FieldReport.report_code.ilike(
                    f"%{query}%"
                ),
                FieldReport.title.ilike(
                    f"%{query}%"
                ),
                FieldReport.reporter.ilike(
                    f"%{query}%"
                ),
                FieldReport.hazard.ilike(
                    f"%{query}%"
                ),
                FieldReport.location.ilike(
                    f"%{query}%"
                ),
                FieldReport.state.ilike(
                    f"%{query}%"
                ),
                District.name.ilike(
                    f"%{query}%"
                ),
            )
        )
        .order_by(
            func.lower(
                FieldReport.report_code
            )
            == query,
            FieldReport.submitted_at.desc(),
            FieldReport.id.desc(),
        )
        .limit(limit)
    )

    field_report_rows = db.execute(
        field_report_statement
    ).all()

    for report, district in field_report_rows:
        district_name = (
            district.name
            if district is not None
            else None
        )

        subtitle_parts: list[str] = []

        if report.title:
            subtitle_parts.append(
                report.title
            )

        if report.location:
            subtitle_parts.append(
                report.location
            )

        if district_name:
            subtitle_parts.append(
                district_name
            )

        subtitle = " • ".join(
            subtitle_parts
        )

        results.append(
            serialize_result(
                result_type="field_report",
                result_id=report.id,
                name=report.report_code,
                subtitle=subtitle,
                district=district_name,
                state=report.state,
                latitude=(
                    float(report.latitude)
                    if report.latitude is not None
                    else None
                ),
                longitude=(
                    float(report.longitude)
                    if report.longitude is not None
                    else None
                ),
                risk=report.severity,
                priority=None,
                source="BhooPehra Field Reports",
            )
        )

    # ---------------------------------------------------------
    # 5. GSI HISTORICAL LANDSLIDE EVENTS
    # ---------------------------------------------------------

    gsi_statement = (
        select(LandslideEvent)
        .where(
            or_(
                LandslideEvent.slide_name.ilike(
                    f"%{query}%"
                ),
                LandslideEvent.district.ilike(
                    f"%{query}%"
                ),
                LandslideEvent.state.ilike(
                    f"%{query}%"
                ),
                LandslideEvent.locality.ilike(
                    f"%{query}%"
                ),
                LandslideEvent.source_record_id.ilike(
                    f"%{query}%"
                ),
            )
        )
        .order_by(
            func.lower(
                LandslideEvent.slide_name
            )
            == query,
            LandslideEvent.occurrence_date.desc(),
        )
        .limit(limit)
    )

    gsi_events = db.scalars(
        gsi_statement
    ).all()

    for event in gsi_events:
        subtitle_parts = [
            event.district,
            event.state,
        ]

        if event.occurrence_date:
            subtitle_parts.append(
                event.occurrence_date.isoformat()
            )

        results.append(
            serialize_result(
                result_type="gsi_event",
                result_id=event.id,
                name=event.slide_name,
                subtitle=" • ".join(
                    subtitle_parts
                ),
                district=event.district,
                state=event.state,
                latitude=event.latitude,
                longitude=event.longitude,
                source="GSI",
            )
        )

    # ---------------------------------------------------------
    # RESULT ORDERING
    # ---------------------------------------------------------

    type_priority = {
        "risk_zone": 0,
        "district": 1,
        "infrastructure": 2,
        "field_report": 3,
        "gsi_event": 4,
    }

    results.sort(
        key=lambda item: (
            type_priority.get(
                item["type"],
                99,
            ),
            normalize_text(
                item["name"]
            ),
        )
    )

    results = results[:limit]

    return {
        "query": q,
        "count": len(results),
        "data": results,
    }