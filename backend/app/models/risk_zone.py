from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class RiskZone(Base):
    __tablename__ = "risk_zones"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    district_id: Mapped[int] = mapped_column(
        ForeignKey("districts.id"),
        nullable=False,
    )

    risk_level: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    probability: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    confidence: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    rainfall_trigger: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    priority: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )

    affected_villages: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    affected_roads: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    geometry = mapped_column(
        Geometry(
            geometry_type="POLYGON",
            srid=4326,
        ),
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