from __future__ import annotations

from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class RoadNetwork(Base):
    __tablename__ = "road_network"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    osm_id: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        index=True,
    )

    fclass: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        index=True,
    )

    name: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    ref: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    oneway: Mapped[str] = mapped_column(
        String(1),
        nullable=False,
    )

    maxspeed: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    layer: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    bridge: Mapped[str | None] = mapped_column(
        String(1),
        nullable=True,
    )

    tunnel: Mapped[str | None] = mapped_column(
        String(1),
        nullable=True,
    )

    source: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        default="OpenStreetMap contributors via Geofabrik North-Eastern India extract",
    )

    blocked: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        index=True,
    )

    blockage_source: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    blockage_report_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        index=True,
    )

    blockage_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    blockage_notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    source_vertex: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        index=True,
    )

    target_vertex: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        index=True,
    )

    cost: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    reverse_cost: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    geometry = mapped_column(
        Geometry(
            geometry_type="LINESTRING",
            srid=4326,
        ),
        nullable=False,
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
