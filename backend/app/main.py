from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.alerts import router as alerts_router
from app.api.dashboard import router as dashboard_router
from app.api.district_boundaries import router as district_boundaries_router
from app.api.districts import router as districts_router
from app.api.field_reports import router as field_reports_router
from app.api.infrastructure import router as infrastructure_router
from app.api.landslides import router as landslides_router
from app.api.resources import router as resources_router
from app.api.risk import router as risk_router
from app.api.routing import router as routing_router
from app.api.search import router as search_router
from app.api.shelters import router as shelters_router
from app.api.weather import router as weather_router
from app.db.database import SessionLocal
from app.services.impact_priority_updater import (
    update_infrastructure_priorities,
)
from app.services.risk_zone_updater import update_risk_zones
from app.services.weather_ingestion import ingest_all_district_rainfall


logger = logging.getLogger("bhoopehra.weather")

# Open-Meteo's current ingestion pipeline provides hourly weather/rainfall
# observations. Keep the scheduler aligned with that source resolution.
WEATHER_REFRESH_INTERVAL_SECONDS = 60 * 60


async def _run_weather_ingestion_once() -> None:
    """
    Execute one complete real-data risk refresh cycle.

    Pipeline:
    1. Ingest latest real Open-Meteo rainfall/weather observations.
    2. Recalculate existing RiskZone dynamic rainfall-driven risk fields.
    3. Recalculate infrastructure risk, impact and operational priority.

    A fresh database session is created for each cycle.
    """

    db = SessionLocal()

    try:
        # ---------------------------------------------------------
        # STEP 1: Real weather/rainfall ingestion
        # ---------------------------------------------------------
        ingestion_result = await asyncio.to_thread(
            ingest_all_district_rainfall,
            db,
        )

        logger.info(
            "Weather ingestion completed: source=%s districts=%s "
            "created=%s updated=%s skipped=%s failed=%s",
            ingestion_result.get("source"),
            ingestion_result.get("district_count"),
            ingestion_result.get("created_count"),
            ingestion_result.get("updated_count"),
            ingestion_result.get("skipped_count"),
            ingestion_result.get("failed_count"),
        )

        # ---------------------------------------------------------
        # STEP 2: Recalculate RiskZones from latest rainfall
        # ---------------------------------------------------------
        risk_result = await asyncio.to_thread(
            update_risk_zones,
            db,
        )

        logger.info(
            "Risk-zone recalculation completed: updated=%s skipped=%s",
            risk_result.get("updated_count"),
            risk_result.get("skipped_count"),
        )

        # ---------------------------------------------------------
        # STEP 3: Recalculate infrastructure risk/impact/priority
        # ---------------------------------------------------------
        infrastructure_result = await asyncio.to_thread(
            update_infrastructure_priorities,
            db,
        )

        logger.info(
            "Infrastructure recalculation completed: updated=%s skipped=%s",
            len(infrastructure_result.get("updated", [])),
            len(infrastructure_result.get("skipped", [])),
        )

        logger.info(
            "Automated risk refresh cycle completed successfully: "
            "weather -> risk_zones -> infrastructure"
        )

    except Exception:
        logger.exception(
            "Automated risk refresh cycle failed. "
            "No fabricated weather or risk data was generated."
        )

        # Roll back any unexpected uncommitted transaction state.
        with contextlib.suppress(Exception):
            db.rollback()

    finally:
        db.close()


async def _weather_ingestion_loop() -> None:
    """
    Continuously refresh real weather observations and downstream
    rainfall-driven risk state.

    The first cycle runs immediately after application startup.
    Subsequent cycles run once per configured source-resolution interval.
    """
    while True:

        logger.info("Automated risk refresh cycle starting.")
        await _run_weather_ingestion_once()
        logger.info("Automated risk refresh cycle finished.")
        await asyncio.sleep(WEATHER_REFRESH_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    Manage application-wide background services.

    The hourly worker performs the complete automated chain:

    Open-Meteo ingestion
        -> RiskZone recalculation
        -> Infrastructure recalculation

    Alert generation remains an explicit operational action and is not
    automatically created by the weather scheduler.
    """

    print("BhooPehra scheduler: creating weather/risk task.", flush=True)
    weather_task = asyncio.create_task(
        _weather_ingestion_loop(),
        name="bhoopehra-weather-ingestion",
    )
    print("BhooPehra scheduler: weather/risk task created.", flush=True)

    def _report_scheduler_task(task: asyncio.Task) -> None:
        if task.cancelled():
            print("BhooPehra scheduler: task cancelled.", flush=True)
            return
        error = task.exception()
        if error is not None:
            print(f"BhooPehra scheduler: task crashed: {error!r}", flush=True)
        else:
            print("BhooPehra scheduler: task exited normally.", flush=True)

    weather_task.add_done_callback(_report_scheduler_task)

    logger.info(
        "Weather/risk scheduler started. Refresh interval=%s seconds.",
        WEATHER_REFRESH_INTERVAL_SECONDS,
    )

    try:
        yield
    finally:
        logger.info(
            "Stopping weather/risk scheduler."
        )

        weather_task.cancel()

        with contextlib.suppress(asyncio.CancelledError):
            await weather_task

        logger.info(
            "Weather/risk scheduler stopped."
        )


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "BhooPehra landslide early-warning and "
        "risk-monitoring backend API."
    ),
    lifespan=lifespan,
)


# Allow the configured frontend plus the standard local Vite
# development origins. localhost and 127.0.0.1 are different
# browser origins even when they point to the same machine.
allowed_origins = list(
    dict.fromkeys(
        [
            settings.frontend_url,
            "http://localhost:5174",
            "http://127.0.0.1:5174",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Core application routers.
app.include_router(risk_router)
app.include_router(infrastructure_router)
app.include_router(weather_router)
app.include_router(districts_router)
app.include_router(district_boundaries_router)
app.include_router(dashboard_router)
app.include_router(landslides_router)
app.include_router(search_router)
app.include_router(routing_router)


# Operational/community routers.
app.include_router(alerts_router)
app.include_router(field_reports_router)
app.include_router(resources_router)
app.include_router(shelters_router)


# Persisted ML training metrics generated by the existing
# GSI model-training pipeline.
MODEL_METRICS_PATH = (
    Path(__file__).resolve().parents[1]
    / "data"
    / "gsi"
    / "model"
    / "bhoopehra_gsi_training_metrics.json"
)


@app.get("/")
def root():
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "status": "operational",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "bhoopehra-api",
        "environment": settings.environment,
    }


@app.get("/api/risk/ml/metrics")
def ml_metrics():
    """Return the persisted training metrics generated by the ML pipeline."""
    if not MODEL_METRICS_PATH.is_file():
        raise HTTPException(
            status_code=503,
            detail="ML training metrics artifact is unavailable.",
        )

    try:
        payload = json.loads(
            MODEL_METRICS_PATH.read_text(encoding="utf-8")
        )
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=503,
            detail="ML training metrics artifact could not be read.",
        ) from exc

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=503,
            detail="ML training metrics artifact has an invalid format.",
        )

    return {
        "status": "available",
        "source": str(
            MODEL_METRICS_PATH.relative_to(
                Path(__file__).resolve().parents[1]
            )
        ).replace("\\", "/"),
        "training_metrics": payload.get("training_metrics"),
        "generated_at_utc": payload.get("generated_at_utc"),
        "schema_version": payload.get("schema_version"),
    }







