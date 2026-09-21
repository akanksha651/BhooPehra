from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
)


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


def register_models() -> None:
    """
    Import all SQLAlchemy models so their tables and foreign keys
    are registered in Base.metadata before ORM flush/commit operations.
    """
    from app.models.alert import Alert
    from app.models.district import District
    from app.models.field_report import FieldReport
    from app.models.infrastructure_asset import InfrastructureAsset
    from app.models.landslide_event import LandslideEvent
    from app.models.rainfall_observation import RainfallObservation
    from app.models.risk_zone import RiskZone
    from app.models.road_network import RoadNetwork

    # Keep explicit references so static analyzers and future maintainers
    # can see that these model imports are intentionally registered.
    _ = (
        Alert,
        District,
        FieldReport,
        InfrastructureAsset,
        LandslideEvent,
        RainfallObservation,
        RiskZone,
        RoadNetwork,
    )
