from datetime import date
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.landslide_event import LandslideEvent


router = APIRouter(
    prefix="/api/landslides",
    tags=["Landslides"],
)


def serialize_event(event: LandslideEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "source_record_id": event.source_record_id,
        "source": event.source,
        "source_type": event.source_type,
        "state": event.state,
        "district": event.district,
        "slide_name": event.slide_name,
        "locality": event.locality,
        "occurrence_date": (
            event.occurrence_date.isoformat()
            if isinstance(event.occurrence_date, date)
            else None
        ),
        "latitude": event.latitude,
        "longitude": event.longitude,
        "landslide_type": event.landslide_type,
        "material_type": event.material_type,
        "area_sq_m": event.area_sq_m,
        "length_m": event.length_m,
        "width_m": event.width_m,
        "depth_m": event.depth_m,
        "source_url": event.source_url,
        "verification_status": event.verification_status,
    }


@router.get("/events")
def get_landslide_events(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    statement = (
        select(LandslideEvent)
        .order_by(
            LandslideEvent.occurrence_date.desc(),
            LandslideEvent.id.desc(),
        )
    )

    events = db.scalars(statement).all()

    return {
        "count": len(events),
        "source": "GSI",
        "verification_status": "GSI_VERIFIED",
        "data": [
            serialize_event(event)
            for event in events
        ],
    }


@router.get("/events/{event_id}")
def get_landslide_event(
    event_id: int,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    event = db.get(LandslideEvent, event_id)

    if event is None:
        return {
            "error": "Landslide event not found",
            "event_id": event_id,
        }

    return {
        "data": serialize_event(event),
    }