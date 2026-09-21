from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class RainfallObservation(Base):
    __tablename__ = "rainfall_observations"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    district_id: Mapped[int] = mapped_column(
        ForeignKey("districts.id"),
        nullable=False,
        index=True,
    )

    observed_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        index=True,
    )

    rainfall_1h: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )

    rainfall_24h: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )

    rainfall_48h: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )

    rainfall_72h: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )

    antecedent_rainfall: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )

    soil_moisture: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    trigger_level: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    source: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    data_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="MODEL_DERIVED",
        server_default="MODEL_DERIVED",
        index=True,
    )

    source_latitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    source_longitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    source_timezone: Mapped[str | None] = mapped_column(
        String(60),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )