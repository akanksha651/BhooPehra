from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.alert import Alert
from app.services.alert_engine import generate_alerts


router = APIRouter(
    prefix="/api/alerts",
    tags=["Alerts"],
)


def serialize_alert(alert: Alert) -> dict[str, Any]:
    return {
        "id": alert.id,
        "alert_key": alert.alert_key,
        "asset_id": alert.asset_id,
        "risk_zone_id": alert.risk_zone_id,
        "asset_code": alert.asset_code,
        "asset_name": alert.asset_name,
        "alert_type": alert.alert_type,
        "severity": alert.severity,
        "title": alert.title,
        "message": alert.message,
        "risk_level": alert.risk_level,
        "probability": alert.probability,
        "probability_percent": round(alert.probability * 100, 1),
        "rainfall_trigger": alert.rainfall_trigger,
        "confidence": alert.confidence,
        "source": alert.source,
        "priority": alert.priority,
        "recommended_action": alert.recommended_action,
        "status": alert.status,
        "created_at": (
            alert.created_at.isoformat()
            if isinstance(alert.created_at, datetime)
            else None
        ),
        "updated_at": (
            alert.updated_at.isoformat()
            if isinstance(alert.updated_at, datetime)
            else None
        ),
    }


@router.get("")
def get_alerts(
    status: str | None = None,
    severity: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    statement = select(Alert).order_by(
        Alert.created_at.desc(),
        Alert.id.desc(),
    )

    if status:
        statement = statement.where(
            Alert.status == status.upper()
        )

    if severity:
        statement = statement.where(
            Alert.severity == severity.upper()
        )

    alerts = db.scalars(statement).all()

    return {
        "count": len(alerts),
        "data": [
            serialize_alert(alert)
            for alert in alerts
        ],
    }


# IMPORTANT:
# Keep this route BEFORE /{alert_id}.
@router.post("/generate")
def generate_alerts_endpoint(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return generate_alerts(db)


@router.get("/{alert_id}")
def get_alert(
    alert_id: int,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    alert = db.get(Alert, alert_id)

    if alert is None:
        return {
            "error": "Alert not found",
            "alert_id": alert_id,
        }

    return {
        "data": serialize_alert(alert),
    }


@router.patch("/{alert_id}/status")
def update_alert_status(
    alert_id: int,
    status: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    allowed_statuses = {
        "ACTIVE",
        "ACKNOWLEDGED",
        "RESOLVED",
    }

    normalized_status = status.upper()

    if normalized_status not in allowed_statuses:
        return {
            "error": "Invalid alert status.",
            "allowed_statuses": sorted(
                allowed_statuses
            ),
        }

    alert = db.get(Alert, alert_id)

    if alert is None:
        return {
            "error": "Alert not found",
            "alert_id": alert_id,
        }

    alert.status = normalized_status
    alert.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(alert)

    return {
        "success": True,
        "data": serialize_alert(alert),
    }