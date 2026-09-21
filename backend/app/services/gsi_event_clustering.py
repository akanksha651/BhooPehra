from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timezone
from math import atan2, cos, radians, sin, sqrt
from pathlib import Path
from typing import Any

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.landslide_event import LandslideEvent


# ============================================================================
# Configuration
# ============================================================================

CLUSTER_DISTANCE_KM = 5.0
CLUSTER_TIME_DAYS = 14
MIN_CLUSTER_SIZE = 2

OUTPUT_FILE = (
    "data/gsi/gsi_event_cluster_analysis.json"
)


# ============================================================================
# Date utilities
# ============================================================================

def normalize_date(
    value: date | str | None,
) -> date | None:
    """
    Normalize a PostgreSQL/SQLAlchemy date or ISO date string
    into a Python date object.
    """

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


def date_difference_days(
    date_1: date | str | None,
    date_2: date | str | None,
) -> int | None:
    """
    Calculate absolute difference between two dates.

    Handles both Python date objects and ISO date strings.
    """

    normalized_1 = normalize_date(
        date_1
    )

    normalized_2 = normalize_date(
        date_2
    )

    if (
        normalized_1 is None
        or normalized_2 is None
    ):
        return None

    return abs(
        (normalized_1 - normalized_2).days
    )


# ============================================================================
# Geographic utilities
# ============================================================================

def haversine_km(
    latitude_1: float,
    longitude_1: float,
    latitude_2: float,
    longitude_2: float,
) -> float:
    """
    Calculate great-circle distance between two WGS84 coordinates.
    """

    earth_radius_km = 6371.0088

    lat1 = radians(
        latitude_1
    )

    lat2 = radians(
        latitude_2
    )

    delta_lat = radians(
        latitude_2 - latitude_1
    )

    delta_lon = radians(
        longitude_2 - longitude_1
    )

    a = (
        sin(delta_lat / 2) ** 2
        + cos(lat1)
        * cos(lat2)
        * sin(delta_lon / 2) ** 2
    )

    c = 2 * atan2(
        sqrt(a),
        sqrt(1 - a),
    )

    return (
        earth_radius_km * c
    )


# ============================================================================
# Event serialization
# ============================================================================

def serialize_event(
    event: LandslideEvent,
) -> dict[str, Any]:
    occurrence_date = normalize_date(
        event.occurrence_date
    )

    return {
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
        "latitude": (
            float(event.latitude)
            if event.latitude is not None
            else None
        ),
        "longitude": (
            float(event.longitude)
            if event.longitude is not None
            else None
        ),
        "verification_status": (
            event.verification_status
        ),
    }


# ============================================================================
# Event Cluster
# ============================================================================

class EventCluster:
    """
    In-memory cluster.

    This class never modifies the database.
    """

    def __init__(
        self,
        cluster_id: int,
    ) -> None:

        self.cluster_id = cluster_id

        self.events: list[
            dict[str, Any]
        ] = []

    def add(
        self,
        event: dict[str, Any],
    ) -> None:

        self.events.append(
            event
        )

    @property
    def size(self) -> int:

        return len(
            self.events
        )

    @property
    def states(self) -> list[str]:

        return sorted(
            {
                event["state"]
                for event in self.events
                if event.get("state")
            }
        )

    @property
    def districts(self) -> list[str]:

        return sorted(
            {
                event["district"]
                for event in self.events
                if event.get("district")
            }
        )

    @property
    def dates(self) -> list[date]:

        normalized_dates = []

        for event in self.events:

            event_date = normalize_date(
                event.get(
                    "occurrence_date"
                )
            )

            if event_date:
                normalized_dates.append(
                    event_date
                )

        return sorted(
            set(
                normalized_dates
            )
        )

    def centroid(
        self,
    ) -> tuple[
        float,
        float,
    ] | None:

        spatial_events = [
            event
            for event in self.events
            if event.get("latitude") is not None
            and event.get("longitude") is not None
        ]

        if not spatial_events:
            return None

        latitude = (
            sum(
                float(event["latitude"])
                for event in spatial_events
            )
            / len(spatial_events)
        )

        longitude = (
            sum(
                float(event["longitude"])
                for event in spatial_events
            )
            / len(spatial_events)
        )

        return (
            round(
                latitude,
                7,
            ),
            round(
                longitude,
                7,
            ),
        )

    def max_pairwise_distance_km(
        self,
    ) -> float:

        spatial_events = [
            event
            for event in self.events
            if event.get("latitude") is not None
            and event.get("longitude") is not None
        ]

        maximum = 0.0

        for index, event_a in enumerate(
            spatial_events
        ):

            for event_b in spatial_events[
                index + 1:
            ]:

                distance = haversine_km(
                    float(
                        event_a["latitude"]
                    ),
                    float(
                        event_a["longitude"]
                    ),
                    float(
                        event_b["latitude"]
                    ),
                    float(
                        event_b["longitude"]
                    ),
                )

                maximum = max(
                    maximum,
                    distance,
                )

        return round(
            maximum,
            3,
        )

    def date_span_days(
        self,
    ) -> int | None:

        dates = self.dates

        if not dates:
            return None

        if len(dates) == 1:
            return 0

        return (
            dates[-1] - dates[0]
        ).days

    def to_dict(
        self,
    ) -> dict[str, Any]:

        centroid = self.centroid()

        return {
            "cluster_id": self.cluster_id,
            "size": self.size,
            "states": self.states,
            "districts": self.districts,
            "centroid": (
                {
                    "latitude": centroid[0],
                    "longitude": centroid[1],
                }
                if centroid
                else None
            ),
            "date_span_days": (
                self.date_span_days()
            ),
            "max_pairwise_distance_km": (
                self.max_pairwise_distance_km()
            ),
            "events": self.events,
        }


# ============================================================================
# Pairwise clustering logic
# ============================================================================

def events_should_cluster(
    event_a: dict[str, Any],
    event_b: dict[str, Any],
) -> tuple[
    bool,
    dict[str, Any],
]:
    """
    Determine whether two GSI observations are close enough in
    space and time to be treated as one candidate episode.

    This is a heuristic for ML dataset preparation.

    It does NOT claim that two records are definitely the same
    physical landslide.
    """

    latitude_a = event_a.get(
        "latitude"
    )

    longitude_a = event_a.get(
        "longitude"
    )

    latitude_b = event_b.get(
        "latitude"
    )

    longitude_b = event_b.get(
        "longitude"
    )

    if (
        latitude_a is None
        or longitude_a is None
        or latitude_b is None
        or longitude_b is None
    ):

        return (
            False,
            {
                "reason": (
                    "missing_coordinates"
                )
            },
        )

    distance_km = haversine_km(
        float(latitude_a),
        float(longitude_a),
        float(latitude_b),
        float(longitude_b),
    )

    date_gap_days = date_difference_days(
        event_a.get(
            "occurrence_date"
        ),
        event_b.get(
            "occurrence_date"
        ),
    )

    spatial_match = (
        distance_km
        <= CLUSTER_DISTANCE_KM
    )

    temporal_match = (
        date_gap_days is not None
        and date_gap_days
        <= CLUSTER_TIME_DAYS
    )

    should_cluster = (
        spatial_match
        and temporal_match
    )

    if should_cluster:

        reason = (
            "spatial_and_temporal_match"
        )

    elif not spatial_match:

        reason = (
            "spatial_threshold_not_met"
        )

    elif date_gap_days is None:

        reason = (
            "temporal_information_missing"
        )

    else:

        reason = (
            "temporal_threshold_not_met"
        )

    return (
        should_cluster,
        {
            "distance_km": round(
                distance_km,
                3,
            ),
            "date_gap_days": (
                date_gap_days
            ),
            "spatial_match": (
                spatial_match
            ),
            "temporal_match": (
                temporal_match
            ),
            "reason": reason,
        },
    )


# ============================================================================
# Connected components
# ============================================================================

def build_connected_components(
    events: list[
        dict[str, Any]
    ],
) -> tuple[
    list[
        list[dict[str, Any]]
    ],
    list[dict[str, Any]],
]:
    """
    Build connected components from pairwise spatial-temporal matches.

    If A matches B and B matches C, A/B/C are treated as one
    candidate cluster.
    """

    count = len(
        events
    )

    parent = list(
        range(count)
    )

    rank = [0] * count

    def find(
        node: int,
    ) -> int:

        while (
            parent[node]
            != node
        ):

            parent[node] = parent[
                parent[node]
            ]

            node = parent[node]

        return node

    def union(
        node_a: int,
        node_b: int,
    ) -> None:

        root_a = find(
            node_a
        )

        root_b = find(
            node_b
        )

        if root_a == root_b:
            return

        if rank[root_a] < rank[root_b]:

            parent[root_a] = root_b

        elif rank[root_a] > rank[root_b]:

            parent[root_b] = root_a

        else:

            parent[root_b] = root_a

            rank[root_a] += 1

    diagnostics: list[
        dict[str, Any]
    ] = []

    for index_a in range(
        count
    ):

        for index_b in range(
            index_a + 1,
            count,
        ):

            should_cluster, evidence = (
                events_should_cluster(
                    events[index_a],
                    events[index_b],
                )
            )

            diagnostics.append(
                {
                    "event_a_id": (
                        events[
                            index_a
                        ]["id"]
                    ),
                    "event_b_id": (
                        events[
                            index_b
                        ]["id"]
                    ),
                    **evidence,
                }
            )

            if should_cluster:

                union(
                    index_a,
                    index_b,
                )

    groups: dict[
        int,
        list[
            dict[str, Any]
        ],
    ] = defaultdict(
        list
    )

    for index, event in enumerate(
        events
    ):

        groups[
            find(index)
        ].append(
            event
        )

    clusters = list(
        groups.values()
    )

    clusters.sort(
        key=lambda cluster: (
            -len(cluster),
            min(
                event["id"]
                for event in cluster
            ),
        )
    )

    return (
        clusters,
        diagnostics,
    )


# ============================================================================
# Cluster interpretation
# ============================================================================

def interpret_cluster(
    cluster: EventCluster,
) -> str:

    if cluster.size == 1:

        return (
            "SINGLETON_EVENT"
        )

    date_span = (
        cluster.date_span_days()
    )

    max_distance = (
        cluster.max_pairwise_distance_km()
    )

    if (
        date_span is not None
        and date_span
        <= CLUSTER_TIME_DAYS
        and max_distance
        <= CLUSTER_DISTANCE_KM
    ):

        return (
            "POSSIBLE_MULTI_OBSERVATION_EPISODE"
        )

    return (
        "SPATIAL_TEMPORAL_CLUSTER"
    )


def build_cluster_analysis(
    events: list[
        dict[str, Any]
    ],
) -> dict[str, Any]:

    (
        clusters_raw,
        diagnostics,
    ) = build_connected_components(
        events
    )

    clusters: list[
        dict[str, Any]
    ] = []

    for cluster_number, raw_cluster in enumerate(
        clusters_raw,
        start=1,
    ):

        cluster = EventCluster(
            cluster_id=cluster_number
        )

        for event in raw_cluster:

            cluster.add(
                event
            )

        cluster_dict = (
            cluster.to_dict()
        )

        cluster_dict[
            "interpretation"
        ] = interpret_cluster(
            cluster
        )

        if (
            cluster.size
            >= MIN_CLUSTER_SIZE
        ):

            cluster_dict[
                "ml_recommendation"
            ] = (
                "REVIEW_BEFORE_INDEPENDENT_POSITIVE"
            )

        else:

            cluster_dict[
                "ml_recommendation"
            ] = (
                "INDIVIDUAL_POSITIVE_CANDIDATE"
            )

        clusters.append(
            cluster_dict
        )

    multi_event_clusters = [
        cluster
        for cluster in clusters
        if cluster["size"]
        >= MIN_CLUSTER_SIZE
    ]

    singleton_clusters = [
        cluster
        for cluster in clusters
        if cluster["size"] == 1
    ]

    events_in_multi_clusters = sum(
        cluster["size"]
        for cluster in multi_event_clusters
    )

    return {
        "configuration": {
            "cluster_distance_km": (
                CLUSTER_DISTANCE_KM
            ),
            "cluster_time_days": (
                CLUSTER_TIME_DAYS
            ),
            "min_cluster_size": (
                MIN_CLUSTER_SIZE
            ),
        },
        "summary": {
            "total_spatial_events": len(
                events
            ),
            "total_clusters": len(
                clusters
            ),
            "multi_event_clusters": len(
                multi_event_clusters
            ),
            "singleton_clusters": len(
                singleton_clusters
            ),
            "events_in_multi_event_clusters": (
                events_in_multi_clusters
            ),
        },
        "clusters": clusters,
        "pairwise_diagnostics": diagnostics,
    }


# ============================================================================
# Database retrieval
# ============================================================================

def get_gsi_spatial_events(
    db: Session,
) -> list[
    dict[str, Any]
]:

    statement = (
        select(
            LandslideEvent
        )
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

    return [
        serialize_event(
            event
        )
        for event in events
    ]


def analyze_gsi_event_clusters(
    db: Session,
) -> dict[str, Any]:

    events = get_gsi_spatial_events(
        db
    )

    analysis = (
        build_cluster_analysis(
            events
        )
    )

    analysis[
        "status"
    ] = "success"

    analysis[
        "database_operation"
    ] = "READ_ONLY"

    analysis[
        "message"
    ] = (
        "GSI event clustering completed. "
        "No database records were modified."
    )

    return analysis


# ============================================================================
# Export
# ============================================================================

def export_cluster_analysis(
    analysis: dict[str, Any],
    output_path: str = OUTPUT_FILE,
) -> str:

    path = Path(
        output_path
    )

    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    path.write_text(
        json.dumps(
            analysis,
            indent=2,
            ensure_ascii=False,
            default=str,
        ),
        encoding="utf-8",
    )

    return str(
        path
    )


# ============================================================================
# Human-readable report
# ============================================================================

def print_cluster_report(
    analysis: dict[str, Any],
) -> None:

    summary = analysis[
        "summary"
    ]

    configuration = analysis[
        "configuration"
    ]

    print()

    print(
        "=" * 72
    )

    print(
        "BhooPehra - GSI Event Clustering Analysis"
    )

    print(
        "=" * 72
    )

    print(
        f"Spatial events: "
        f"{summary['total_spatial_events']}"
    )

    print(
        f"Total clusters: "
        f"{summary['total_clusters']}"
    )

    print(
        f"Multi-event clusters: "
        f"{summary['multi_event_clusters']}"
    )

    print(
        f"Singleton clusters: "
        f"{summary['singleton_clusters']}"
    )

    print(
        f"Events in multi-event clusters: "
        f"{summary['events_in_multi_event_clusters']}"
    )

    print()

    print(
        f"Spatial threshold: "
        f"{configuration['cluster_distance_km']} km"
    )

    print(
        f"Temporal threshold: "
        f"{configuration['cluster_time_days']} days"
    )

    print()

    print(
        "-" * 72
    )

    for cluster in analysis[
        "clusters"
    ]:

        print(
            f"CLUSTER {cluster['cluster_id']} "
            f"| size={cluster['size']} "
            f"| {cluster['interpretation']}"
        )

        print(
            "  States: "
            + (
                ", ".join(
                    cluster["states"]
                )
                if cluster["states"]
                else "N/A"
            )
        )

        print(
            "  Districts: "
            + (
                ", ".join(
                    cluster["districts"]
                )
                if cluster["districts"]
                else "N/A"
            )
        )

        print(
            "  Max distance: "
            f"{cluster['max_pairwise_distance_km']} km"
        )

        print(
            "  Date span: "
            f"{cluster['date_span_days']} days"
        )

        print(
            "  ML recommendation: "
            f"{cluster['ml_recommendation']}"
        )

        for event in cluster[
            "events"
        ]:

            print(
                "    "
                f"{event['id']} | "
                f"{event['occurrence_date']} | "
                f"{event['state']} | "
                f"{event['district']} | "
                f"{event['slide_name']}"
            )

        print()

    print(
        "=" * 72
    )

    print(
        "READ-ONLY analysis complete."
    )

    print(
        "=" * 72
    )

    print()


# ============================================================================
# Main entry point
# ============================================================================

def run_gsi_event_clustering(
    db: Session,
    export: bool = True,
) -> dict[str, Any]:

    analysis = (
        analyze_gsi_event_clusters(
            db
        )
    )

    if export:

        output_path = (
            export_cluster_analysis(
                analysis
            )
        )

        analysis[
            "output_file"
        ] = output_path

    return analysis