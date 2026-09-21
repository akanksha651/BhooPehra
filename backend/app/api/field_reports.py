from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.district import District
from app.models.field_report import FieldReport
from app.models.risk_zone import RiskZone


router = APIRouter(
    prefix="/api/field-reports",
    tags=["Field Reports"],
)


ALLOWED_SEVERITIES = {
    "CRITICAL",
    "HIGH",
    "MODERATE",
    "LOW",
}


ALLOWED_STATUSES = {
    "PENDING SYNC",
    "SUBMITTED",
    "VERIFIED",
    "REJECTED",
}


ALLOWED_RESPONSE_STATUSES = {
    "NOT_STARTED",
    "ALERT_GENERATED",
    "TEAM_ASSIGNED",
    "IN_PROGRESS",
    "RESOLVED",
}


RESPONSE_STATUS_LABELS = {
    "NOT_STARTED": "Not Started",
    "ALERT_GENERATED": "Alert Generated",
    "TEAM_ASSIGNED": "Team Assigned",
    "IN_PROGRESS": "In Progress",
    "RESOLVED": "Resolved",
}


RESPONSE_STATUS_ORDER = {
    "NOT_STARTED": 0,
    "ALERT_GENERATED": 1,
    "TEAM_ASSIGNED": 2,
    "IN_PROGRESS": 3,
    "RESOLVED": 4,
}


class FieldReportCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    reporter: str = Field(min_length=1, max_length=150)
    reporter_token: str | None = Field(default=None, min_length=16, max_length=128)
    hazard: str = Field(min_length=1, max_length=80)

    severity: str = Field(default="MODERATE")

    location: str = Field(min_length=1, max_length=200)
    state: str = Field(min_length=1, max_length=100)

    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)

    description: str = Field(min_length=1)

    road_impact: str = Field(
        default="No immediate impact",
        max_length=200,
    )

    village_impact: str = Field(
        default="No villages currently exposed",
        max_length=200,
    )

    photo_count: int = Field(
        default=0,
        ge=0,
    )

    district_id: int | None = None
    risk_zone_id: int | None = None


class FieldReportStatusUpdate(BaseModel):
    status: str
    verification_notes: str | None = None


class FieldReportResponseUpdate(BaseModel):
    response_status: str
    assigned_team: str | None = Field(
        default=None,
        max_length=150,
    )
    response_notes: str | None = None


def _validate_severity(severity: str) -> str:
    normalized = severity.strip().upper()

    if normalized not in ALLOWED_SEVERITIES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid severity. Allowed values: "
                + ", ".join(sorted(ALLOWED_SEVERITIES))
            ),
        )

    return normalized


def _validate_status(status: str) -> str:
    normalized = status.strip().upper()

    if normalized not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid status. Allowed values: "
                + ", ".join(sorted(ALLOWED_STATUSES))
            ),
        )

    return normalized


def _validate_response_status(response_status: str) -> str:
    normalized = response_status.strip().upper()

    if normalized not in ALLOWED_RESPONSE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid response status. Allowed values: "
                + ", ".join(sorted(ALLOWED_RESPONSE_STATUSES))
            ),
        )

    return normalized


def _utc_iso(value: datetime | None) -> str | None:
    """
    Convert the database UTC datetime into an explicit UTC ISO timestamp.

    Database timestamps are currently stored as naive UTC datetimes.
    Appending Z tells the frontend/browser that the timestamp is UTC,
    preventing the browser from interpreting UTC as local time.
    """
    if value is None:
        return None

    return value.isoformat(timespec="milliseconds") + "Z"


def _generate_report_code(db: Session) -> str:
    """
    Generate the next field-report code.

    Example:
    FR-0001
    FR-0002
    FR-0003
    """
    last_id = db.scalar(
        select(func.max(FieldReport.id))
    )

    next_number = (last_id or 0) + 1

    return f"FR-{next_number:04d}"


def _serialize_report(
    report: FieldReport,
    district_name: str | None = None,
) -> dict[str, Any]:
    return {
        "id": report.id,
        "report_code": report.report_code,

        "title": report.title,
        "reporter": report.reporter,
        "hazard": report.hazard,

        "severity": report.severity,
        "status": report.status,

        # Operational response tracking
        "response_status": report.response_status,
        "response_status_label": RESPONSE_STATUS_LABELS.get(
            report.response_status,
            report.response_status,
        ),
        "assigned_team": report.assigned_team,
        "alert_generated_at": _utc_iso(
            report.alert_generated_at
        ),
        "assigned_at": _utc_iso(
            report.assigned_at
        ),
        "started_at": _utc_iso(
            report.started_at
        ),
        "resolved_at": _utc_iso(
            report.resolved_at
        ),
        "response_notes": report.response_notes,

        "district_id": report.district_id,
        "district_name": district_name,

        "risk_zone_id": report.risk_zone_id,

        "location": report.location,
        "state": report.state,

        "latitude": report.latitude,
        "longitude": report.longitude,

        "description": report.description,

        "road_impact": report.road_impact,
        "village_impact": report.village_impact,

        "photo_count": report.photo_count,

        "verification_notes": report.verification_notes,

        "submitted_at": _utc_iso(report.submitted_at),
        "verified_at": _utc_iso(report.verified_at),
        "created_at": _utc_iso(report.created_at),
        "updated_at": _utc_iso(report.updated_at),
    }


def _load_reports(
    db: Session,
    statement,
) -> list[dict[str, Any]]:
    rows = db.execute(
        statement.outerjoin(
            District,
            FieldReport.district_id == District.id,
        )
    ).all()

    return [
        _serialize_report(
            report,
            district_name,
        )
        for report, district_name in rows
    ]


@router.get("")
def get_field_reports(
    severity: str | None = Query(default=None),
    status: str | None = Query(default=None),
    response_status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    district_id: int | None = Query(default=None),
    x_reporter_token: str | None = Header(default=None, alias="X-Reporter-Token"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:

    statement = (
        select(
            FieldReport,
            District.name,
        )
        .outerjoin(
            District,
            FieldReport.district_id == District.id,
        )
        .order_by(
            FieldReport.submitted_at.desc(),
            FieldReport.id.desc(),
        )
    )

    if severity:
        statement = statement.where(
            FieldReport.severity
            == _validate_severity(severity)
        )

    if status:
        statement = statement.where(
            FieldReport.status
            == _validate_status(status)
        )

    if response_status:
        statement = statement.where(
            FieldReport.response_status
            == _validate_response_status(response_status)
        )

    if district_id is not None:
        statement = statement.where(
            FieldReport.district_id == district_id
        )

    # Community ownership filter.
    # Authority / Field Team requests that do not send this header retain
    # the existing full-list behavior.
    if x_reporter_token is not None:
        reporter_token = x_reporter_token.strip()

        if len(reporter_token) < 16 or len(reporter_token) > 128:
            raise HTTPException(
                status_code=400,
                detail="Invalid X-Reporter-Token",
            )

        statement = statement.where(
            FieldReport.reporter_token == reporter_token
        )

    if search and search.strip():
        search_query = f"%{search.strip()}%"

        statement = statement.where(
            FieldReport.title.ilike(search_query)
            | FieldReport.reporter.ilike(search_query)
            | FieldReport.location.ilike(search_query)
            | FieldReport.state.ilike(search_query)
            | FieldReport.hazard.ilike(search_query)
            | FieldReport.report_code.ilike(search_query)
            | District.name.ilike(search_query)
        )

    rows = db.execute(statement).all()

    data = [
        _serialize_report(
            report,
            district_name,
        )
        for report, district_name in rows
    ]

    return {
        "count": len(data),
        "data": data,
    }


@router.get("/summary")
def get_field_report_summary(
    db: Session = Depends(get_db),
) -> dict[str, Any]:

    reports = db.scalars(
        select(FieldReport)
    ).all()

    return {
        "total": len(reports),

        "pending_sync": sum(
            report.status == "PENDING SYNC"
            for report in reports
        ),

        "submitted": sum(
            report.status == "SUBMITTED"
            for report in reports
        ),

        "verified": sum(
            report.status == "VERIFIED"
            for report in reports
        ),

        "rejected": sum(
            report.status == "REJECTED"
            for report in reports
        ),

        "critical": sum(
            report.severity == "CRITICAL"
            for report in reports
        ),

        "high": sum(
            report.severity == "HIGH"
            for report in reports
        ),

        "moderate": sum(
            report.severity == "MODERATE"
            for report in reports
        ),

        "low": sum(
            report.severity == "LOW"
            for report in reports
        ),

        # Operational response counts
        "response": {
            "not_started": sum(
                report.response_status == "NOT_STARTED"
                for report in reports
            ),
            "alert_generated": sum(
                report.response_status == "ALERT_GENERATED"
                for report in reports
            ),
            "team_assigned": sum(
                report.response_status == "TEAM_ASSIGNED"
                for report in reports
            ),
            "in_progress": sum(
                report.response_status == "IN_PROGRESS"
                for report in reports
            ),
            "resolved": sum(
                report.response_status == "RESOLVED"
                for report in reports
            ),
        },
    }


@router.get("/{report_id}")
def get_field_report(
    report_id: int,
    db: Session = Depends(get_db),
) -> dict[str, Any]:

    statement = (
        select(
            FieldReport,
            District.name,
        )
        .outerjoin(
            District,
            FieldReport.district_id == District.id,
        )
        .where(
            FieldReport.id == report_id
        )
    )

    row = db.execute(statement).first()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Field report not found",
        )

    report, district_name = row

    return {
        "data": _serialize_report(
            report,
            district_name,
        )
    }


@router.post("", status_code=201)
def create_field_report(
    payload: FieldReportCreate,
    db: Session = Depends(get_db),
) -> dict[str, Any]:

    severity = _validate_severity(
        payload.severity
    )

    if payload.district_id is not None:
        district = db.get(
            District,
            payload.district_id,
        )

        if district is None:
            raise HTTPException(
                status_code=400,
                detail="District not found",
            )

    if payload.risk_zone_id is not None:
        risk_zone = db.get(
            RiskZone,
            payload.risk_zone_id,
        )

        if risk_zone is None:
            raise HTTPException(
                status_code=400,
                detail="Risk zone not found",
            )

    now = datetime.utcnow()

    report = FieldReport(
        report_code=_generate_report_code(db),

        title=payload.title.strip(),
        reporter=payload.reporter.strip(),
        reporter_token=(
            payload.reporter_token.strip()
            if payload.reporter_token is not None
            else None
        ),
        hazard=payload.hazard.strip(),

        severity=severity,
        status="SUBMITTED",

        # New operational response lifecycle
        response_status="NOT_STARTED",
        assigned_team=None,
        alert_generated_at=None,
        assigned_at=None,
        started_at=None,
        resolved_at=None,
        response_notes=None,

        district_id=payload.district_id,
        risk_zone_id=payload.risk_zone_id,

        location=payload.location.strip(),
        state=payload.state.strip(),

        latitude=payload.latitude,
        longitude=payload.longitude,

        description=payload.description.strip(),

        road_impact=payload.road_impact.strip(),
        village_impact=payload.village_impact.strip(),

        photo_count=payload.photo_count,

        submitted_at=now,
        created_at=now,
        updated_at=now,

        geometry=(
            f"SRID=4326;"
            f"POINT({payload.longitude} {payload.latitude})"
        ),
    )

    db.add(report)
    db.commit()
    db.refresh(report)

    district_name = None

    if report.district_id is not None:
        district = db.get(
            District,
            report.district_id,
        )

        if district is not None:
            district_name = district.name

    return {
        "message": "Field report created successfully",
        "data": _serialize_report(
            report,
            district_name,
        ),
    }


@router.patch("/{report_id}/status")
def update_field_report_status(
    report_id: int,
    payload: FieldReportStatusUpdate,
    db: Session = Depends(get_db),
) -> dict[str, Any]:

    report = db.get(
        FieldReport,
        report_id,
    )

    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Field report not found",
        )

    new_status = _validate_status(
        payload.status
    )

    current_response_status = report.response_status or "NOT_STARTED"

    # Once an operational response has started, evidence cannot be silently
    # downgraded/rejected through the verification endpoint.
    if (
        new_status == "REJECTED"
        and current_response_status != "NOT_STARTED"
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "A report with an active or completed response workflow "
                "cannot be rejected."
            ),
        )

    report.status = new_status
    report.verification_notes = (
        payload.verification_notes
    )
    report.updated_at = datetime.utcnow()

    if new_status == "VERIFIED":
        report.verified_at = datetime.utcnow()

    elif new_status in {
        "SUBMITTED",
        "PENDING SYNC",
    }:
        report.verified_at = None

    db.commit()
    db.refresh(report)

    district_name = None

    if report.district_id is not None:
        district = db.get(
            District,
            report.district_id,
        )

        if district is not None:
            district_name = district.name

    return {
        "message": "Field report status updated successfully",
        "data": _serialize_report(
            report,
            district_name,
        ),
    }


@router.patch("/{report_id}/response")
def update_field_report_response(
    report_id: int,
    payload: FieldReportResponseUpdate,
    db: Session = Depends(get_db),
) -> dict[str, Any]:

    report = db.get(
        FieldReport,
        report_id,
    )

    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Field report not found",
        )

    # Operational response is only valid for evidence that Authority has verified.
    # This is enforced server-side as well as in the frontend so unverified
    # reports cannot enter the response lifecycle by bypassing the UI.
    if report.status != "VERIFIED":
        raise HTTPException(
            status_code=409,
            detail=(
                "Operational response is blocked until the field report "
                "is verified by Authority."
            ),
        )

    new_response_status = _validate_response_status(
        payload.response_status
    )

    current_response_status = (
        report.response_status or "NOT_STARTED"
    )

    current_order = RESPONSE_STATUS_ORDER[
        current_response_status
    ]

    new_order = RESPONSE_STATUS_ORDER[
        new_response_status
    ]

    # Same-state updates are allowed so that notes/team
    # information can be edited without advancing the workflow.
    if new_response_status == current_response_status:

        if (
            new_response_status == "TEAM_ASSIGNED"
            and payload.assigned_team is not None
        ):
            assigned_team = payload.assigned_team.strip()

            if assigned_team:
                report.assigned_team = assigned_team

        if payload.response_notes is not None:
            report.response_notes = (
                payload.response_notes.strip()
                or None
            )

        report.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(report)

    else:
        # Response lifecycle is intentionally sequential:
        #
        # NOT_STARTED
        #      ↓
        # ALERT_GENERATED
        #      ↓
        # TEAM_ASSIGNED
        #      ↓
        # IN_PROGRESS
        #      ↓
        # RESOLVED

        if new_order != current_order + 1:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid response transition: "
                    f"{current_response_status} -> "
                    f"{new_response_status}. "
                    "Response stages must advance sequentially."
                ),
            )

        now = datetime.utcnow()

        if new_response_status == "ALERT_GENERATED":
            report.alert_generated_at = now

        elif new_response_status == "TEAM_ASSIGNED":
            assigned_team = (
                payload.assigned_team or ""
            ).strip()

            if not assigned_team:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "assigned_team is required "
                        "when assigning a response team."
                    ),
                )

            report.assigned_team = assigned_team
            report.assigned_at = now

        elif new_response_status == "IN_PROGRESS":
            if not report.assigned_team:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "A response team must be assigned "
                        "before starting the response."
                    ),
                )

            report.started_at = now

        elif new_response_status == "RESOLVED":
            report.resolved_at = now

        report.response_status = new_response_status

        if payload.response_notes is not None:
            report.response_notes = (
                payload.response_notes.strip()
                or None
            )

        report.updated_at = now

        db.commit()
        db.refresh(report)

    district_name = None

    if report.district_id is not None:
        district = db.get(
            District,
            report.district_id,
        )

        if district is not None:
            district_name = district.name

    return {
        "message": (
            "Field report response status updated successfully"
        ),
        "data": _serialize_report(
            report,
            district_name,
        ),
    }