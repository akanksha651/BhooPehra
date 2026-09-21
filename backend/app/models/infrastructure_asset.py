from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class InfrastructureAsset(Base):
    __tablename__ = "infrastructure_assets"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    asset_code: Mapped[str] = mapped_column(
        String(30),
        unique=True,
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    asset_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    district_id: Mapped[int] = mapped_column(
        ForeignKey("districts.id"),
        nullable=False,
    )

    risk_zone_id: Mapped[int | None] = mapped_column(
        ForeignKey("risk_zones.id"),
        nullable=True,
    )

    risk_level: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    probability: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    priority: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )

    exposure_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    recommendation: Mapped[str | None] = mapped_column(
        String(300),
        nullable=True,
    )

    geometry = mapped_column(
        Geometry(
            geometry_type="POINT",
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