from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.models.field_report import FieldReport
from app.models.infrastructure_asset import InfrastructureAsset
from app.models.rainfall_observation import RainfallObservation
from app.services.risk_fusion import fuse_risk
from app.services.risk_zone_ml import predict_zone_ml_risk


@dataclass(frozen=True)
class AlertEngineResult:
    severity: str
    alert_type: str
    title: str
    message: str


def _latest_rainfall_by_district(
    db: Session,
) -> dict[int, RainfallObservation]:

    observations = db.scalars(
        select(RainfallObservation).order_by(
            RainfallObservation.district_id.asc(),
            RainfallObservation.observed_at.desc(),
            RainfallObservation.id.desc(),
        )
    ).all()

    latest: dict[int, RainfallObservation] = {}

    for observation in observations:
        if observation.district_id not in latest:
            latest[observation.district_id] = observation

    return latest


def _field_report_evidence_by_district(
    db: Session,
) -> dict[int, tuple[int, int]]:

    statement = (
        select(
            FieldReport.district_id,
            func.count(FieldReport.id),
            func.sum(
                case(
                    (FieldReport.status == "VERIFIED", 1),
                    else_=0,
                )
            ),
        )
        .where(
            FieldReport.district_id.is_not(None)
        )
        .group_by(
            FieldReport.district_id
        )
    )

    rows = db.execute(statement).all()

    evidence: dict[int, tuple[int, int]] = {}

    for district_id, total_reports, verified_reports in rows:

        if district_id is None:
            continue

        evidence[int(district_id)] = (
            int(total_reports or 0),
            int(verified_reports or 0),
        )

    return evidence


def _normalize(
    value: Any,
    default: str = "UNKNOWN",
) -> str:

    if value is None:
        return default

    return str(value).strip().upper()


def _build_fusion(
    *,
    db: Session,
    asset: InfrastructureAsset,
) -> dict[str, Any] | None:

    if asset.risk_zone_id is None:
        return None

    try:
        ml_result = predict_zone_ml_risk(
            db=db,
            zone_id=asset.risk_zone_id,
        )
    except Exception:
        return None

    rule_result = {
        "probability": float(
            asset.probability or 0.0
        ),
        "risk_level": _normalize(
            asset.risk_level,
            "LOW",
        ),
        "confidence": "HIGH",
        "rainfall_trigger": "MINIMAL",
    }

    rainfall = None

    try:
        rainfall = db.scalar(
            select(RainfallObservation)
            .where(
                RainfallObservation.district_id
                == asset.district_id
            )
            .order_by(
                RainfallObservation.observed_at.desc(),
                RainfallObservation.id.desc(),
            )
        )
    except Exception:
        rainfall = None

    if rainfall is not None:
        rule_result["rainfall_trigger"] = _normalize(
            rainfall.trigger_level,
            "MINIMAL",
        )

    return fuse_risk(
        ml_result=ml_result,
        rule_result=rule_result,
    )


def _build_alert_result(
    *,
    asset: InfrastructureAsset,
    rainfall: RainfallObservation | None,
    field_reports: int,
    verified_reports: int,
    fusion: dict[str, Any] | None,
) -> AlertEngineResult | None:

    if rainfall is None:
        return None

    risk_level = _normalize(
        asset.risk_level,
        "LOW",
    )

    priority = _normalize(
        asset.priority,
        "P3",
    )

    rainfall_trigger = _normalize(
        rainfall.trigger_level,
        "MINIMAL",
    )

    has_verified_evidence = verified_reports > 0

    # ------------------------------------------------------------
    # Fusion signal
    # ------------------------------------------------------------

    if fusion is not None:

        fused_level = _normalize(
            fusion.get("final_risk_level"),
            "LOW",
        )

        fused_probability = float(
            fusion.get(
                "final_probability",
                0.0,
            )
        )

        assessment = _normalize(
            fusion.get(
                "operational_assessment"
            ),
            "MODERATE_REVIEW",
        )

        agreement = fusion.get(
            "agreement",
            {},
        )

        disagreement = bool(
            agreement.get(
                "signal_disagreement",
                False,
            )
        )

        rainfall_level = _normalize(
            fusion.get(
                "signals",
                {},
            )
            .get(
                "rule_engine",
                {},
            )
            .get(
                "rainfall_trigger"
            ),
            rainfall_trigger,
        )

        # --------------------------------------------------------
        # CRITICAL fused risk
        # --------------------------------------------------------

        if fused_level == "CRITICAL":

            if has_verified_evidence:
                return AlertEngineResult(
                    severity="CRITICAL",
                    alert_type="FUSION_CRITICAL_FIELD_EVIDENCE",
                    title=(
                        f"Critical fused risk + verified evidence: "
                        f"{asset.name}"
                    ),
                    message=(
                        f"{asset.name} has CRITICAL fused landslide "
                        f"risk with {fused_probability * 100:.1f}% "
                        f"estimated probability. "
                        f"{field_reports} field report(s) received "
                        f"and {verified_reports} verified report(s). "
                        f"Immediate operational action is recommended."
                    ),
                )

            return AlertEngineResult(
                severity="CRITICAL",
                alert_type="FUSION_CRITICAL",
                title=(
                    f"Critical fused landslide risk: "
                    f"{asset.name}"
                ),
                message=(
                    f"{asset.name} has CRITICAL fused landslide "
                    f"risk with {fused_probability * 100:.1f}% "
                    f"estimated probability. "
                    f"Rainfall trigger is {rainfall_level}. "
                    f"Immediate operational action is recommended."
                ),
            )

        # --------------------------------------------------------
        # HIGH fused risk
        # --------------------------------------------------------

        if fused_level == "HIGH":

            if has_verified_evidence:
                return AlertEngineResult(
                    severity="HIGH",
                    alert_type="FUSION_HIGH_FIELD_EVIDENCE",
                    title=(
                        f"High fused risk + verified evidence: "
                        f"{asset.name}"
                    ),
                    message=(
                        f"{asset.name} has HIGH fused landslide "
                        f"risk with {fused_probability * 100:.1f}% "
                        f"estimated probability. "
                        f"{field_reports} field report(s) received "
                        f"and {verified_reports} verified report(s). "
                        f"Priority field verification is recommended."
                    ),
                )

            return AlertEngineResult(
                severity="HIGH",
                alert_type="FUSION_HIGH",
                title=(
                    f"High fused landslide risk: "
                    f"{asset.name}"
                ),
                message=(
                    f"{asset.name} has HIGH fused landslide risk "
                    f"with {fused_probability * 100:.1f}% "
                    f"estimated probability. "
                    f"Rainfall trigger is {rainfall_level}. "
                    f"Priority field verification is recommended."
                ),
            )

        # --------------------------------------------------------
        # MODERATE + disagreement
        #
        # Not an emergency alert.
        # P1/P2 assets get a review alert.
        # --------------------------------------------------------

        if (
            fused_level == "MODERATE"
            and assessment == "REVIEW_REQUIRED"
            and priority in {"P1", "P2"}
        ):

            if disagreement:
                return AlertEngineResult(
                    severity="MEDIUM",
                    alert_type="FUSION_REVIEW_REQUIRED",
                    title=(
                        f"Risk signal disagreement: "
                        f"{asset.name}"
                    ),
                    message=(
                        f"{asset.name} has MODERATE fused landslide "
                        f"risk ({fused_probability * 100:.1f}%), "
                        f"but ML and rainfall signals disagree. "
                        f"Rainfall trigger is {rainfall_level}. "
                        f"Priority review and field verification "
                        f"are recommended."
                    ),
                )

            return AlertEngineResult(
                severity="MEDIUM",
                alert_type="FUSION_MODERATE_REVIEW",
                title=(
                    f"Moderate fused landslide risk: "
                    f"{asset.name}"
                ),
                message=(
                    f"{asset.name} has MODERATE fused landslide "
                    f"risk ({fused_probability * 100:.1f}%). "
                    f"Priority review is recommended."
                ),
            )

    # ------------------------------------------------------------
    # Existing rule-engine fallback
    # ------------------------------------------------------------

    if (
        priority == "P1"
        and risk_level == "CRITICAL"
        and rainfall_trigger in {
            "VERY_HIGH",
            "HIGH",
        }
    ):

        if has_verified_evidence:
            return AlertEngineResult(
                severity="CRITICAL",
                alert_type="FIELD_EVIDENCE_IMMEDIATE",
                title=(
                    f"Verified field evidence at "
                    f"{asset.name}"
                ),
                message=(
                    f"{asset.name} is under CRITICAL landslide "
                    f"risk with {rainfall_trigger} rainfall trigger. "
                    f"{field_reports} field report(s) received and "
                    f"{verified_reports} verified report(s). "
                    f"Immediate operational action is recommended."
                ),
            )

        return AlertEngineResult(
            severity="CRITICAL",
            alert_type="IMMEDIATE_ACTION",
            title=(
                f"Immediate action required: "
                f"{asset.name}"
            ),
            message=(
                f"{asset.name} is under CRITICAL landslide risk "
                f"with {rainfall_trigger} rainfall trigger. "
                f"Immediate operational action is recommended."
            ),
        )

    if (
        priority == "P1"
        and risk_level in {
            "CRITICAL",
            "HIGH",
        }
    ):

        if has_verified_evidence:
            return AlertEngineResult(
                severity="CRITICAL",
                alert_type="FIELD_EVIDENCE_PRIORITY",
                title=(
                    f"Verified field evidence: "
                    f"{asset.name}"
                ),
                message=(
                    f"{asset.name} requires priority intervention "
                    f"under {risk_level} landslide risk. "
                    f"{field_reports} field report(s) received and "
                    f"{verified_reports} verified report(s)."
                ),
            )

        return AlertEngineResult(
            severity="CRITICAL",
            alert_type="PRIORITY_ACTION",
            title=(
                f"Priority action required: "
                f"{asset.name}"
            ),
            message=(
                f"{asset.name} requires priority intervention "
                f"under {risk_level} landslide risk."
            ),
        )

    if (
        priority in {
            "P1",
            "P2",
        }
        and rainfall_trigger == "VERY_HIGH"
    ):

        if has_verified_evidence:
            return AlertEngineResult(
                severity="CRITICAL",
                alert_type="FIELD_EVIDENCE_RAINFALL",
                title=(
                    f"Verified field evidence + extreme rainfall: "
                    f"{asset.name}"
                ),
                message=(
                    f"{asset.name} has {rainfall_trigger} rainfall "
                    f"trigger with {risk_level} landslide risk. "
                    f"{field_reports} field report(s) received and "
                    f"{verified_reports} verified report(s). "
                    f"Immediate monitoring and operational review "
                    f"are recommended."
                ),
            )

        return AlertEngineResult(
            severity="CRITICAL",
            alert_type="RAINFALL_TRIGGER",
            title=(
                f"Extreme rainfall trigger: "
                f"{asset.name}"
            ),
            message=(
                f"{asset.name} has {rainfall_trigger} rainfall "
                f"trigger with {risk_level} landslide risk. "
                f"Immediate monitoring and operational review "
                f"are recommended."
            ),
        )

    if (
        priority in {
            "P1",
            "P2",
        }
        and rainfall_trigger == "HIGH"
        and risk_level == "HIGH"
    ):

        if has_verified_evidence:
            return AlertEngineResult(
                severity="HIGH",
                alert_type="FIELD_EVIDENCE_RISK",
                title=(
                    f"Verified field evidence: "
                    f"{asset.name}"
                ),
                message=(
                    f"{asset.name} is under HIGH landslide risk "
                    f"with HIGH rainfall trigger. "
                    f"{field_reports} field report(s) received and "
                    f"{verified_reports} verified report(s)."
                ),
            )

        return AlertEngineResult(
            severity="HIGH",
            alert_type="RAINFALL_RISK",
            title=(
                f"High rainfall-driven risk: "
                f"{asset.name}"
            ),
            message=(
                f"{asset.name} is under HIGH landslide risk "
                f"with HIGH rainfall trigger."
            ),
        )

    if (
        priority == "P2"
        and risk_level == "HIGH"
        and rainfall_trigger == "MODERATE"
    ):

        if has_verified_evidence:
            return AlertEngineResult(
                severity="MEDIUM",
                alert_type="FIELD_EVIDENCE_ELEVATED",
                title=(
                    f"Verified field evidence: "
                    f"{asset.name}"
                ),
                message=(
                    f"{asset.name} has elevated landslide risk. "
                    f"{field_reports} field report(s) received and "
                    f"{verified_reports} verified report(s)."
                ),
            )

        return AlertEngineResult(
            severity="MEDIUM",
            alert_type="ELEVATED_RISK",
            title=(
                f"Elevated landslide risk: "
                f"{asset.name}"
            ),
            message=(
                f"{asset.name} has elevated landslide risk "
                f"and requires monitoring."
            ),
        )

    if risk_level == "CRITICAL":

        if has_verified_evidence:
            return AlertEngineResult(
                severity="HIGH",
                alert_type="FIELD_EVIDENCE_CRITICAL",
                title=(
                    f"Verified field evidence: "
                    f"{asset.name}"
                ),
                message=(
                    f"{asset.name} remains at CRITICAL landslide "
                    f"risk. {field_reports} field report(s) received "
                    f"and {verified_reports} verified report(s)."
                ),
            )

        return AlertEngineResult(
            severity="HIGH",
            alert_type="CRITICAL_RISK",
            title=(
                f"Critical landslide risk: "
                f"{asset.name}"
            ),
            message=(
                f"{asset.name} remains at CRITICAL landslide risk "
                f"and requires close operational monitoring."
            ),
        )

    return None


def _base_alert_key(
    *,
    asset: InfrastructureAsset,
    rainfall: RainfallObservation,
    verified_reports: int,
    alert_type: str,
) -> str:

    evidence_state = (
        "VERIFIED"
        if verified_reports > 0
        else "NO_VERIFIED"
    )

    return (
        f"ASSET:{asset.id}:"
        f"{(asset.risk_level or 'LOW').upper()}:"
        f"{(asset.priority or 'P3').upper()}:"
        f"{(rainfall.trigger_level or 'MINIMAL').upper()}:"
        f"{evidence_state}:"
        f"{alert_type}"
    )


def _find_active_alert(
    db: Session,
    *,
    asset_id: int,
    alert_key: str,
) -> Alert | None:

    return db.scalar(
        select(Alert)
        .where(
            Alert.asset_id == asset_id,
            Alert.alert_key == alert_key,
            Alert.status.in_(
                [
                    "ACTIVE",
                    "ACKNOWLEDGED",
                ]
            ),
        )
        .limit(1)
    )


def _find_any_alert(
    db: Session,
    *,
    alert_key: str,
) -> Alert | None:

    return db.scalar(
        select(Alert)
        .where(
            Alert.alert_key == alert_key
        )
        .limit(1)
    )


def _build_unique_alert_key(
    db: Session,
    *,
    base_key: str,
) -> tuple[str, bool]:

    if _find_any_alert(
        db,
        alert_key=base_key,
    ) is None:
        return base_key, False

    counter = 2

    while True:

        candidate = (
            f"{base_key}:REOPENED:{counter}"
        )

        if _find_any_alert(
            db,
            alert_key=candidate,
        ) is None:
            return candidate, True

        counter += 1


def _recommendation(
    *,
    priority: str,
    asset_type: str | None,
) -> str:

    asset_type = _normalize(
        asset_type,
        "OTHER",
    )

    if priority == "P1":

        if asset_type == "BRIDGE":
            return (
                "Immediate bridge safety assessment, "
                "traffic restriction if required, "
                "and field verification."
            )

        if asset_type in {
            "ROAD",
            "HIGHWAY",
        }:
            return (
                "Immediate road safety assessment, "
                "traffic control, and field verification."
            )

        return (
            "Immediate field verification and operational "
            "response are recommended."
        )

    if priority == "P2":

        if asset_type in {
            "ROAD",
            "HIGHWAY",
        }:
            return (
                "Prioritise field inspection and prepare "
                "traffic management measures."
            )

        return (
            "Prioritise field verification and continue "
            "close monitoring."
        )

    return (
        "Continue monitoring and escalate if rainfall, "
        "risk, or field evidence increases."
    )


def _reconcile_stale_alerts(
    db: Session,
    *,
    current_asset_ids: set[int],
    latest_rainfall: dict[int, RainfallObservation],
    field_evidence: dict[int, tuple[int, int]],
) -> list[dict]:

    statement = (
        select(Alert)
        .where(
            Alert.status.in_(
                [
                    "ACTIVE",
                    "ACKNOWLEDGED",
                ]
            )
        )
        .order_by(
            Alert.id.asc()
        )
    )

    active_alerts = db.scalars(
        statement
    ).all()

    resolved: list[dict] = []

    for alert in active_alerts:

        if (
            alert.asset_id is None
            or alert.asset_id not in current_asset_ids
        ):
            continue

        asset = db.get(
            InfrastructureAsset,
            alert.asset_id,
        )

        if asset is None:
            continue

        rainfall = latest_rainfall.get(
            asset.district_id
        )

        field_reports, verified_reports = (
            field_evidence.get(
                asset.district_id,
                (0, 0),
            )
        )

        fusion = _build_fusion(
            db=db,
            asset=asset,
        )

        current_result = _build_alert_result(
            asset=asset,
            rainfall=rainfall,
            field_reports=field_reports,
            verified_reports=verified_reports,
            fusion=fusion,
        )

        if current_result is not None:
            continue

        alert.status = "RESOLVED"

        resolved.append(
            {
                "alert_id": alert.id,
                "asset_id": alert.asset_id,
                "asset_code": alert.asset_code,
                "previous_status": "ACTIVE_OR_ACKNOWLEDGED",
                "new_status": "RESOLVED",
            }
        )

    return resolved


def generate_alerts(
    db: Session,
) -> dict:

    latest_rainfall = (
        _latest_rainfall_by_district(db)
    )

    field_evidence = (
        _field_report_evidence_by_district(db)
    )

    assets = db.scalars(
        select(InfrastructureAsset)
        .order_by(
            InfrastructureAsset.id.asc()
        )
    ).all()

    current_asset_ids = {
        asset.id
        for asset in assets
    }

    resolved = _reconcile_stale_alerts(
        db,
        current_asset_ids=current_asset_ids,
        latest_rainfall=latest_rainfall,
        field_evidence=field_evidence,
    )

    created: list[dict] = []
    existing_active: list[dict] = []
    skipped: list[dict] = []

    fusion_used_count = 0
    fusion_fallback_count = 0
    review_alert_count = 0

    for asset in assets:

        rainfall = latest_rainfall.get(
            asset.district_id
        )

        if rainfall is None:

            skipped.append(
                {
                    "asset_id": asset.id,
                    "asset_code": asset.asset_code,
                    "reason": (
                        "No rainfall observation available "
                        "for asset district"
                    ),
                }
            )

            continue

        field_reports, verified_reports = (
            field_evidence.get(
                asset.district_id,
                (0, 0),
            )
        )

        fusion = _build_fusion(
            db=db,
            asset=asset,
        )

        if fusion is not None:
            fusion_used_count += 1
        else:
            fusion_fallback_count += 1

        result = _build_alert_result(
            asset=asset,
            rainfall=rainfall,
            field_reports=field_reports,
            verified_reports=verified_reports,
            fusion=fusion,
        )

        if result is None:
            continue

        if result.alert_type in {
            "FUSION_REVIEW_REQUIRED",
            "FUSION_MODERATE_REVIEW",
        }:
            review_alert_count += 1

        evidence_state = (
            "VERIFIED"
            if verified_reports > 0
            else "NO_VERIFIED"
        )

        risk_level = _normalize(
            asset.risk_level,
            "LOW",
        )

        if fusion is not None:
            risk_level = _normalize(
                fusion.get(
                    "final_risk_level",
                    risk_level,
                ),
                risk_level,
            )

        base_key = _base_alert_key(
            asset=asset,
            rainfall=rainfall,
            verified_reports=verified_reports,
            alert_type=result.alert_type,
        )

        active_alert = _find_active_alert(
            db,
            asset_id=asset.id,
            alert_key=base_key,
        )

        if active_alert is not None:
            existing_active.append(
                {
                    "alert_id": active_alert.id,
                    "asset_id": asset.id,
                    "asset_code": asset.asset_code,
                    "severity": active_alert.severity,
                    "status": active_alert.status,
                    "alert_type": active_alert.alert_type,
                }
            )
            continue

        alert_key, reopened = (
            _build_unique_alert_key(
                db,
                base_key=base_key,
            )
        )

        priority = _normalize(
            asset.priority,
            "P3",
        )

        rainfall_trigger = _normalize(
            rainfall.trigger_level,
            "MINIMAL",
        )

        probability = float(
            asset.probability or 0.0
        )

        confidence = "HIGH"

        if fusion is not None:

            probability = float(
                fusion.get(
                    "final_probability",
                    probability,
                )
            )

            confidence = _normalize(
                fusion.get(
                    "final_confidence"
                ),
                "MEDIUM",
            )

        recommended_action = _recommendation(
            priority=priority,
            asset_type=asset.asset_type,
        )

        message = (
            f"{result.message} "
            f"Current probability: "
            f"{probability * 100:.2f}%. "
            f"Confidence: {confidence}. "
            f"Recommended action: "
            f"{recommended_action}"
        )

        alert = Alert(
            alert_key=alert_key,
            asset_id=asset.id,
            risk_zone_id=asset.risk_zone_id,
            asset_code=asset.asset_code,
            asset_name=asset.name,
            alert_type=result.alert_type,
            severity=result.severity,
            title=result.title,
            message=message,
            risk_level=risk_level,
            probability=probability,
            rainfall_trigger=rainfall_trigger,
            confidence=confidence,
            source=rainfall.source,
            priority=priority,
            recommended_action=recommended_action,
            status="ACTIVE",
        )

        db.add(alert)
        db.flush()

        created.append(
            {
                "alert_id": alert.id,
                "asset_id": asset.id,
                "asset_code": asset.asset_code,
                "asset_name": asset.name,
                "severity": alert.severity,
                "alert_type": alert.alert_type,
                "risk_level": alert.risk_level,
                "probability": alert.probability,
                "probability_percent": round(
                    alert.probability * 100,
                    2,
                ),
                "rainfall_trigger": alert.rainfall_trigger,
                "priority": alert.priority,
                "field_reports": field_reports,
                "verified_reports": verified_reports,
                "source": alert.source,
                "confidence": alert.confidence,
                "status": alert.status,
                "alert_key": alert.alert_key,
                "reopened": reopened,
                "fusion_used": fusion is not None,
            }
        )

    db.commit()

    return {
        "success": True,
        "engine": "BhooPehra Alert Engine",
        "model_type": "fusion_aware_rule_based",
        "evidence_source": (
            "ML_risk_fusion_plus_rainfall_plus_"
            "verified_field_reports_plus_priority"
        ),
        "fusion": {
            "enabled": True,
            "fusion_used_count": fusion_used_count,
            "fusion_fallback_count": fusion_fallback_count,
            "review_alert_count": review_alert_count,
        },
        "created_count": len(created),
        "existing_active_count": len(existing_active),
        "resolved_count": len(resolved),
        "skipped_count": len(skipped),
        "created": created,
        "existing_active": existing_active,
        "resolved": resolved,
        "skipped": skipped,
    }
