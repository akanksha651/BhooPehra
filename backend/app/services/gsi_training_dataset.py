from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.landslide_event import LandslideEvent
from app.services.gsi_event_clustering import (
    build_cluster_analysis,
)


OUTPUT_DIR = Path("data/gsi")

POSITIVE_DATASET_FILE = (
    OUTPUT_DIR / "gsi_training_positive_candidates.json"
)

QUALITY_REPORT_FILE = (
    OUTPUT_DIR / "gsi_training_dataset_quality.json"
)


def normalize_date(
    value: date | str | None,
) -> date | None:

    if value is None:
        return None

    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, date):
        return value

    if isinstance(value, str):

        value = value.strip()

        if not value:
            return None

        try:
            return date.fromisoformat(
                value[:10]
            )
        except ValueError:
            return None

    return None


def load_gsi_events(
    db: Session,
) -> list[dict[str, Any]]:
    """
    Load GSI events with valid spatial coordinates.

    IMPORTANT:
        The returned schema intentionally uses "id" because the
        existing clustering service expects event["id"].
    """

    statement = (
        select(LandslideEvent)
        .where(
            LandslideEvent.source == "GSI"
        )
        .where(
            LandslideEvent.latitude.is_not(
                None
            )
        )
        .where(
            LandslideEvent.longitude.is_not(
                None
            )
        )
        .order_by(
            LandslideEvent.occurrence_date.asc(),
            LandslideEvent.id.asc(),
        )
    )

    events = db.scalars(
        statement
    ).all()

    result: list[
        dict[str, Any]
    ] = []

    for event in events:

        occurrence_date = normalize_date(
            event.occurrence_date
        )

        result.append(
            {
                "id": event.id,
                "source_record_id": (
                    event.source_record_id
                ),
                "source": event.source,
                "state": event.state,
                "district": event.district,
                "slide_name": event.slide_name,
                "locality": event.locality,
                "occurrence_date": (
                    occurrence_date.isoformat()
                    if occurrence_date
                    else None
                ),
                "latitude": float(
                    event.latitude
                ),
                "longitude": float(
                    event.longitude
                ),
                "verification_status": (
                    event.verification_status
                ),
            }
        )

    return result


def build_cluster_lookup(
    cluster_analysis: dict[str, Any],
) -> dict[int, dict[str, Any]]:
    """
    Map database event ID -> cluster metadata.
    """

    lookup: dict[
        int,
        dict[str, Any],
    ] = {}

    for cluster in cluster_analysis.get(
        "clusters",
        [],
    ):

        cluster_id = int(
            cluster["cluster_id"]
        )

        for event in cluster.get(
            "events",
            [],
        ):

            event_id = int(
                event["id"]
            )

            lookup[event_id] = {
                "cluster_id": cluster_id,
                "cluster_size": int(
                    cluster["size"]
                ),
                "interpretation": (
                    cluster[
                        "interpretation"
                    ]
                ),
                "ml_recommendation": (
                    cluster[
                        "ml_recommendation"
                    ]
                ),
                "date_span_days": (
                    cluster[
                        "date_span_days"
                    ]
                ),
                "max_pairwise_distance_km": (
                    cluster[
                        "max_pairwise_distance_km"
                    ]
                ),
            }

    return lookup


def build_positive_candidates(
    events: list[dict[str, Any]],
    cluster_lookup: dict[int, dict[str, Any]],
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    """
    Build cluster-aware positive candidates.

    Rules:

    - exact-date spatial events can become positive candidates
    - singleton = one positive candidate
    - multi-event cluster = one episode candidate
    - month-only/no-date events are excluded
    """

    candidates: list[
        dict[str, Any]
    ] = []

    excluded: list[
        dict[str, Any]
    ] = []

    processed_clusters: set[
        int
    ] = set()

    for event in events:

        event_id = int(
            event["id"]
        )

        cluster = cluster_lookup.get(
            event_id
        )

        if cluster is None:

            excluded.append(
                {
                    "event_id": event_id,
                    "reason": (
                        "cluster_information_missing"
                    ),
                }
            )

            continue

        occurrence_date = normalize_date(
            event.get(
                "occurrence_date"
            )
        )

        if occurrence_date is None:

            excluded.append(
                {
                    "event_id": event_id,
                    "reason": (
                        "missing_exact_occurrence_date"
                    ),
                    "cluster_id": cluster[
                        "cluster_id"
                    ],
                }
            )

            continue

        cluster_id = int(
            cluster["cluster_id"]
        )

        cluster_size = int(
            cluster["cluster_size"]
        )

        # ---------------------------------------------------------------
        # Multi-event cluster
        # ---------------------------------------------------------------

        if cluster_size >= 2:

            if (
                cluster_id
                in processed_clusters
            ):
                continue

            processed_clusters.add(
                cluster_id
            )

            cluster_events = [
                item
                for item in events
                if cluster_lookup.get(
                    int(item["id"])
                , {}).get(
                    "cluster_id"
                )
                == cluster_id
            ]

            dated_events = [
                item
                for item in cluster_events
                if normalize_date(
                    item.get(
                        "occurrence_date"
                    )
                )
                is not None
            ]

            if not dated_events:

                excluded.append(
                    {
                        "cluster_id": cluster_id,
                        "reason": (
                            "cluster_has_no_exact_date"
                        ),
                    }
                )

                continue

            latitude_values = [
                float(
                    item["latitude"]
                )
                for item in cluster_events
                if item.get(
                    "latitude"
                )
                is not None
            ]

            longitude_values = [
                float(
                    item["longitude"]
                )
                for item in cluster_events
                if item.get(
                    "longitude"
                )
                is not None
            ]

            centroid_latitude = (
                sum(
                    latitude_values
                )
                / len(
                    latitude_values
                )
            )

            centroid_longitude = (
                sum(
                    longitude_values
                )
                / len(
                    longitude_values
                )
            )

            cluster_dates = sorted(
                normalize_date(
                    item.get(
                        "occurrence_date"
                    )
                )
                for item in dated_events
            )

            cluster_dates = [
                item
                for item in cluster_dates
                if item is not None
            ]

            representative_date = (
                cluster_dates[0]
            )

            candidates.append(
                {
                    "sample_id": (
                        f"GSI_CLUSTER_{cluster_id}"
                    ),
                    "label": 1,
                    "label_name": (
                        "LANDSLIDE_EVENT"
                    ),
                    "sample_type": (
                        "CLUSTERED_POSITIVE"
                    ),
                    "cluster_id": cluster_id,
                    "cluster_size": cluster_size,
                    "source_event_ids": [
                        int(
                            item["id"]
                        )
                        for item in cluster_events
                    ],
                    "source_record_ids": [
                        item[
                            "source_record_id"
                        ]
                        for item in cluster_events
                    ],
                    "state": (
                        cluster_events[0][
                            "state"
                        ]
                    ),
                    "district": (
                        cluster_events[0][
                            "district"
                        ]
                    ),
                    "slide_name": (
                        "Multi-observation GSI "
                        "landslide episode"
                    ),
                    "occurrence_date": (
                        representative_date.isoformat()
                    ),
                    "latitude": round(
                        centroid_latitude,
                        7,
                    ),
                    "longitude": round(
                        centroid_longitude,
                        7,
                    ),
                    "cluster_date_span_days": (
                        cluster[
                            "date_span_days"
                        ]
                    ),
                    "cluster_max_distance_km": (
                        cluster[
                            "max_pairwise_distance_km"
                        ]
                    ),
                    "source": "GSI",
                    "verification_status": (
                        "GSI_REPORTED_SPATIAL"
                    ),
                }
            )

            continue

        # ---------------------------------------------------------------
        # Singleton
        # ---------------------------------------------------------------

        candidates.append(
            {
                "sample_id": (
                    f"GSI_EVENT_{event_id}"
                ),
                "label": 1,
                "label_name": (
                    "LANDSLIDE_EVENT"
                ),
                "sample_type": (
                    "SINGLETON_POSITIVE"
                ),
                "cluster_id": cluster_id,
                "cluster_size": 1,
                "source_event_ids": [
                    event_id
                ],
                "source_record_ids": [
                    event[
                        "source_record_id"
                    ]
                ],
                "state": event[
                    "state"
                ],
                "district": event[
                    "district"
                ],
                "slide_name": event[
                    "slide_name"
                ],
                "occurrence_date": (
                    occurrence_date.isoformat()
                ),
                "latitude": event[
                    "latitude"
                ],
                "longitude": event[
                    "longitude"
                ],
                "cluster_date_span_days": 0,
                "cluster_max_distance_km": 0.0,
                "source": "GSI",
                "verification_status": event[
                    "verification_status"
                ],
            }
        )

    return (
        candidates,
        excluded,
    )


def build_quality_report(
    events: list[dict[str, Any]],
    cluster_analysis: dict[str, Any],
    candidates: list[dict[str, Any]],
    excluded: list[dict[str, Any]],
) -> dict[str, Any]:

    singleton_candidates = sum(
        1
        for item in candidates
        if item["sample_type"]
        == "SINGLETON_POSITIVE"
    )

    clustered_candidates = sum(
        1
        for item in candidates
        if item["sample_type"]
        == "CLUSTERED_POSITIVE"
    )

    exact_date_events = sum(
        1
        for event in events
        if normalize_date(
            event.get(
                "occurrence_date"
            )
        )
        is not None
    )

    missing_date_events = (
        len(events)
        - exact_date_events
    )

    return {
        "generated_at_utc": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),
        "source": "GSI",
        "database_operation": (
            "READ_ONLY"
        ),
        "input": {
            "spatial_events": len(
                events
            ),
            "exact_date_events": (
                exact_date_events
            ),
            "missing_exact_date_events": (
                missing_date_events
            ),
        },
        "clustering": (
            cluster_analysis[
                "summary"
            ]
        ),
        "positive_dataset": {
            "positive_candidates": len(
                candidates
            ),
            "singleton_positive_candidates": (
                singleton_candidates
            ),
            "clustered_positive_candidates": (
                clustered_candidates
            ),
        },
        "excluded_records": {
            "count": len(
                excluded
            ),
            "records": excluded,
        },
        "warnings": [
            (
                "This dataset contains positive-event candidates only."
            ),
            (
                "Negative/background samples have not been generated."
            ),
            (
                "Terrain, geology, land-cover and rainfall features "
                "have not been attached yet."
            ),
            (
                "Clustered observations are represented as one "
                "episode-level candidate to reduce duplicate "
                "positive-label inflation."
            ),
        ],
    }


def write_json(
    path: Path,
    payload: Any,
) -> None:

    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    path.write_text(
        json.dumps(
            payload,
            indent=2,
            ensure_ascii=False,
            default=str,
        ),
        encoding="utf-8",
    )


def run_gsi_training_dataset(
    db: Session,
) -> dict[str, Any]:
    """
    Build the first positive-event training layer.

    PostgreSQL is read-only.
    """

    events = load_gsi_events(
        db
    )

    cluster_analysis = (
        build_cluster_analysis(
            events
        )
    )

    cluster_lookup = (
        build_cluster_lookup(
            cluster_analysis
        )
    )

    (
        candidates,
        excluded,
    ) = build_positive_candidates(
        events=events,
        cluster_lookup=cluster_lookup,
    )

    quality_report = (
        build_quality_report(
            events=events,
            cluster_analysis=cluster_analysis,
            candidates=candidates,
            excluded=excluded,
        )
    )

    write_json(
        POSITIVE_DATASET_FILE,
        {
            "dataset": (
                "BhooPehra GSI Positive "
                "Event Candidates"
            ),
            "version": "0.1",
            "generated_at_utc": (
                datetime.now(
                    timezone.utc
                ).isoformat()
            ),
            "database_operation": (
                "READ_ONLY"
            ),
            "label_definition": {
                "label_1": (
                    "GSI-reported landslide event"
                ),
                "label_0": (
                    "Not generated yet"
                ),
            },
            "records": candidates,
        },
    )

    write_json(
        QUALITY_REPORT_FILE,
        quality_report,
    )

    return {
        "status": "success",
        "database_operation": (
            "READ_ONLY"
        ),
        "input_spatial_events": len(
            events
        ),
        "positive_candidates": len(
            candidates
        ),
        "excluded": len(
            excluded
        ),
        "singleton_positive_candidates": sum(
            1
            for item in candidates
            if item["sample_type"]
            == "SINGLETON_POSITIVE"
        ),
        "clustered_positive_candidates": sum(
            1
            for item in candidates
            if item["sample_type"]
            == "CLUSTERED_POSITIVE"
        ),
        "positive_dataset_file": str(
            POSITIVE_DATASET_FILE
        ),
        "quality_report_file": str(
            QUALITY_REPORT_FILE
        ),
    }


def print_training_dataset_report(
    result: dict[str, Any],
) -> None:

    print()
    print("=" * 72)
    print(
        "BhooPehra - GSI Training Dataset Preparation"
    )
    print("=" * 72)

    print(
        f"Input spatial events: "
        f"{result['input_spatial_events']}"
    )

    print(
        f"Positive candidates: "
        f"{result['positive_candidates']}"
    )

    print(
        f"Singleton positives: "
        f"{result['singleton_positive_candidates']}"
    )

    print(
        f"Clustered positives: "
        f"{result['clustered_positive_candidates']}"
    )

    print(
        f"Excluded: "
        f"{result['excluded']}"
    )

    print()

    print(
        "Positive dataset:"
    )

    print(
        f"  {result['positive_dataset_file']}"
    )

    print()

    print(
        "Quality report:"
    )

    print(
        f"  {result['quality_report_file']}"
    )

    print()

    print(
        "IMPORTANT:"
    )

    print(
        "  Negative/background samples are NOT generated yet."
    )

    print(
        "  Terrain/geology/rainfall features are NOT attached yet."
    )

    print(
        "  Original GSI database records were NOT modified."
    )

    print()

    print("=" * 72)