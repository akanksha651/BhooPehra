from datetime import date, datetime

from geoalchemy2 import Geometry
from sqlalchemy import Date, DateTime, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class LandslideEvent(Base):
    __tablename__ = "landslide_events"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    source_record_id: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
    )

    source: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="GSI",
    )

    source_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="Official GSI landslide incidence report",
    )

    state: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    district: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    slide_name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    locality: Mapped[str | None] = mapped_column(
        String(300),
        nullable=True,
    )

    occurrence_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    latitude: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    longitude: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    landslide_type: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    material_type: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    area_sq_m: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    length_m: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    width_m: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    depth_m: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    source_url: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    verification_status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="GSI_VERIFIED",
    )

    geometry = mapped_column(
        Geometry(
            geometry_type="POINT",
            srid=4326,
        ),
        nullable=False,
    )

    imported_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )