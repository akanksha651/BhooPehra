from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from geoalchemy2 import Geometry

from app.db.database import Base


class District(Base):
    __tablename__ = "districts"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    state: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    code: Mapped[str | None] = mapped_column(
        String(20),
        unique=True,
        nullable=True,
    )

    geometry = mapped_column(
        Geometry(
            geometry_type="MULTIPOLYGON",
            srid=4326,
        ),
        nullable=True,
    )