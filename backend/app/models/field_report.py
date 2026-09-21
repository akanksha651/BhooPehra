from __future__ import annotations

from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class FieldReport(Base):
    __tablename__ = "field_reports"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    report_code: Mapped[str] = mapped_column(
        String(30),
        unique=True,
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    reporter: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    # Anonymous prototype ownership identifier.
    #
    # This is a stable browser/device-scoped token supplied by the
    # Community client. It is NOT an authenticated user identity.
    reporter_token: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
        index=True,
    )

    hazard: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
    )

    severity: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )

    # Evidence / verification status.
    # Kept separate from operational response tracking.
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="SUBMITTED",
        index=True,
    )

    # Operational response tracking.
    #
    # NOT_STARTED
    # ALERT_GENERATED
    # TEAM_ASSIGNED
    # IN_PROGRESS
    # RESOLVED
    response_status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="NOT_STARTED",
        index=True,
    )

    assigned_team: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    alert_generated_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    assigned_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    response_notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    district_id: Mapped[int | None] = mapped_column(
        ForeignKey("districts.id"),
        nullable=True,
        index=True,
    )

    risk_zone_id: Mapped[int | None] = mapped_column(
        ForeignKey("risk_zones.id"),
        nullable=True,
        index=True,
    )

    location: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    state: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    latitude: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    longitude: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    road_impact: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        default="No immediate impact",
    )

    village_impact: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        default="No villages currently exposed",
    )

    photo_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    verification_notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        index=True,
    )

    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    geometry = mapped_column(
        Geometry(
            geometry_type="POINT",
            srid=4326,
        ),
        nullable=False,
    )