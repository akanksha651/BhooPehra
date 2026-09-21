from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.services.road_blockage import (
    ROAD_MATCH_TOLERANCE_M,
    sync_verified_field_report_blockages,
)


router = APIRouter(
    prefix="/api/routing",
    tags=["routing"],
)


ROUTING_TABLE = "road_routing_edges"
VERTEX_TABLE = "road_routing_vertices"


def _safe_int(value: Any, default: int = 0) -> int:
    """
    Safely normalize database/API count values.

    Handles:
    - integers
    - floats
    - numeric strings
    - dictionaries containing a count/value
    - None
    """

    if value is None:
        return default

    if isinstance(value, bool):
        return int(value)

    if isinstance(value, dict):
        for key in (
            "count",
            "value",
            "total",
            "blocked",
            "blocked_edges",
            "rows",
            "rowcount",
        ):
            if key in value:
                return _safe_int(value[key], default)

        if len(value) == 1:
            return _safe_int(
                next(iter(value.values())),
                default,
            )

        return default

    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default

    if isinstance(value, dict):
        for key in (
            "value",
            "distance",
            "distance_m",
            "length",
        ):
            if key in value:
                return _safe_float(
                    value[key],
                    default,
                )

        if len(value) == 1:
            return _safe_float(
                next(iter(value.values())),
                default,
            )

        return default

    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _nearest_vertex(
    db: Session,
    latitude: float,
    longitude: float,
) -> dict[str, Any] | None:
    """
    Snap a requested coordinate to the nearest real routing vertex.

    No synthetic point or geometry is created.
    """

    result = db.execute(
        text(
            f"""
            SELECT
                id,
                ST_Distance(
                    geometry::geography,
                    ST_SetSRID(
                        ST_MakePoint(
                            :longitude,
                            :latitude
                        ),
                        4326
                    )::geography
                ) AS distance_m
            FROM {VERTEX_TABLE}
            ORDER BY
                geometry::geography <->
                ST_SetSRID(
                    ST_MakePoint(
                        :longitude,
                        :latitude
                    ),
                    4326
                )::geography
            LIMIT 1
            """
        ),
        {
            "latitude": latitude,
            "longitude": longitude,
        },
    ).mappings().first()

    if result is None:
        return None

    return {
        "id": _safe_int(result["id"]),
        "distance_m": _safe_float(
            result["distance_m"]
        ),
    }


def _route_geometry(
    db: Session,
    start_vertex: int,
    end_vertex: int,
) -> dict[str, Any] | None:
    """
    Calculate the shortest route using the real pgRouting graph.

    Blocked routing edges are excluded.
    Costs are real road lengths in metres.
    """

    result = db.execute(
        text(
            f"""
            WITH route AS (
                SELECT *
                FROM pgr_dijkstra(
                    $$
                    SELECT
                        id,
                        source,
                        target,
                        cost,
                        reverse_cost
                    FROM {ROUTING_TABLE}
                    WHERE blocked = FALSE
                    $$,
                    :start_vertex,
                    :end_vertex,
                    directed := TRUE
                )
            ),
            route_edges AS (
                SELECT
                    r.seq,
                    r.path_seq,
                    r.node,
                    r.edge,
                    r.cost,
                    r.agg_cost,
                    e.geometry
                FROM route r
                JOIN {ROUTING_TABLE} e
                    ON e.id = r.edge
                WHERE r.edge <> -1
            )
            SELECT
                COUNT(*) AS edge_count,
                SUM(
                    ST_Length(
                        geometry::geography
                    )
                ) AS distance_m,
                ST_AsGeoJSON(
                    ST_LineMerge(
                        ST_Union(
                            geometry
                            ORDER BY seq, path_seq
                        )
                    )
                ) AS geometry
            FROM route_edges
            """
        ),
        {
            "start_vertex": start_vertex,
            "end_vertex": end_vertex,
        },
    ).mappings().first()

    if result is None:
        return None

    edge_count = _safe_int(
        result["edge_count"]
    )

    if edge_count == 0:
        return None

    return {
        "edge_count": edge_count,
        "distance_m": _safe_float(
            result["distance_m"]
        ),
        "geometry": result["geometry"],
    }


@router.get("/status")
def routing_status(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Return current routing graph health/status.
    """

    try:
        edge_counts = db.execute(
            text(
                f"""
                SELECT
                    COUNT(*) AS total_edges,
                    COUNT(*) FILTER (
                        WHERE blocked = TRUE
                    ) AS blocked_edges,
                    COUNT(*) FILTER (
                        WHERE blocked = FALSE
                    ) AS available_edges
                FROM {ROUTING_TABLE}
                """
            )
        ).mappings().one()

        vertex_count = db.execute(
            text(
                f"""
                SELECT COUNT(*) AS total_vertices
                FROM {VERTEX_TABLE}
                """
            )
        ).scalar_one()

        road_count = db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM road_network
                """
            )
        ).scalar_one()

        blocked_road_count = db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM road_network
                WHERE blocked = TRUE
                """
            )
        ).scalar_one()

        return {
            "status": "operational",
            "routing_engine": "pgRouting",
            "routing_graph": {
                "edges": _safe_int(
                    edge_counts["total_edges"]
                ),
                "available_edges": _safe_int(
                    edge_counts["available_edges"]
                ),
                "blocked_edges": _safe_int(
                    edge_counts["blocked_edges"]
                ),
                "vertices": _safe_int(
                    vertex_count
                ),
            },
            "road_network": {
                "roads": _safe_int(
                    road_count
                ),
                "blocked_roads": _safe_int(
                    blocked_road_count
                ),
            },
            "source": (
                "OpenStreetMap contributors via "
                "Geofabrik North-Eastern India extract"
            ),
            "synthetic_geometry": False,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Routing status unavailable: {exc}"
            ),
        ) from exc


@router.post("/sync-blockages")
def sync_blockages(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Synchronize verified field-report road blockages
    into the actual pgRouting graph.

    Flow:

        VERIFIED Field Report
                â†“
        road_impact present
                â†“
        PostGIS nearest real OSM road
                â†“
        road_network.blocked = TRUE
                â†“
        matching road_routing_edges.blocked = TRUE

    Only verified reports with usable GPS and meaningful
    road impact are allowed to block a road.

    No synthetic geometry is created.
    """

    try:
        road_sync = (
            sync_verified_field_report_blockages(
                db=db,
                tolerance_m=ROAD_MATCH_TOLERANCE_M,
            )
        )

        matched = road_sync.get(
            "matched",
            [],
        )

        if not isinstance(matched, list):
            matched = []

        # Clear existing routing blockage state.
        #
        # The canonical source remains road_network.blocked.
        # This prevents stale routing blockages.
        clear_result = db.execute(
            text(
                f"""
                UPDATE {ROUTING_TABLE}
                SET blocked = FALSE
                WHERE blocked = TRUE
                """
            )
        )

        cleared_routing_rows = _safe_int(
            getattr(
                clear_result,
                "rowcount",
                0,
            )
        )

        # Propagate canonical blocked road state
        # into the routing graph.
        #
        # The routing graph was created from the same
        # real OSM road geometries.
        blocked_edges_result = db.execute(
            text(
                f"""
                UPDATE {ROUTING_TABLE} AS edge
                SET blocked = TRUE
                FROM road_network AS road
                WHERE road.blocked = TRUE
                  AND ST_Equals(
                      edge.geometry,
                      road.geometry
                  )
                """
            )
        )

        routing_blocked_edges = _safe_int(
            getattr(
                blocked_edges_result,
                "rowcount",
                0,
            )
        )

        db.commit()

        enriched_matches: list[dict[str, Any]] = []

        for item in matched:
            if not isinstance(item, dict):
                continue

            road_id = item.get("road_id")

            routing_edge_count = 0

            if road_id is not None:
                routing_edge_count = (
                    db.execute(
                        text(
                            f"""
                            SELECT COUNT(*)
                            FROM {ROUTING_TABLE} AS edge
                            WHERE edge.blocked = TRUE
                              AND EXISTS (
                                  SELECT 1
                                  FROM road_network AS road
                                  WHERE road.id = :road_id
                                    AND ST_Equals(
                                        edge.geometry,
                                        road.geometry
                                    )
                              )
                            """
                        ),
                        {
                            "road_id": road_id,
                        },
                    ).scalar_one()
                )

            enriched = dict(item)

            enriched[
                "road_network_rows_updated"
            ] = 1

            enriched[
                "routing_edges_blocked"
            ] = _safe_int(
                routing_edge_count
            )

            enriched_matches.append(
                enriched
            )

        final_blocked_roads = db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM road_network
                WHERE blocked = TRUE
                """
            )
        ).scalar_one()

        final_blocked_edges = db.execute(
            text(
                f"""
                SELECT COUNT(*)
                FROM {ROUTING_TABLE}
                WHERE blocked = TRUE
                """
            )
        ).scalar_one()

        previous_clear = road_sync.get(
            "cleared_previous_field_report_blockages",
            0,
        )

        return {
            "status": "success",
            "blockage_source": "FIELD_REPORT",
            "routing_sync_method": (
                "road_network canonical blockage state "
                "propagated to road_routing_edges by "
                "PostGIS ST_Equals"
            ),
            "spatial_method": (
                "PostGIS ST_DWithin + nearest road ordering"
            ),
            "synthetic_geometry_created": False,
            "match_tolerance_m": (
                ROAD_MATCH_TOLERANCE_M
            ),
            "verified_reports_seen": _safe_int(
                road_sync.get(
                    "verified_reports_seen",
                    0,
                )
            ),
            "eligible_road_impact_reports": _safe_int(
                road_sync.get(
                    "eligible_road_impact_reports",
                    0,
                )
            ),
            "matched_reports": _safe_int(
                road_sync.get(
                    "matched_reports",
                    0,
                )
            ),
            "unmatched_reports": _safe_int(
                road_sync.get(
                    "unmatched_reports",
                    0,
                )
            ),
            "road_network_blocked": _safe_int(
                final_blocked_roads
            ),
            "routing_blocked_edges": _safe_int(
                final_blocked_edges
            ),
            "cleared_previous_field_report_blockages": {
                "road_network_rows": _safe_int(
                    previous_clear
                ),
                "routing_edge_rows": (
                    cleared_routing_rows
                ),
            },
            "matched": enriched_matches,
            "unmatched": road_sync.get(
                "unmatched",
                [],
            ),
        }

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "Road blockage synchronization "
                f"failed: {exc}"
            ),
        ) from exc


@router.get("/route")
def calculate_route(
    start_latitude: float = Query(...),
    start_longitude: float = Query(...),
    end_latitude: float = Query(...),
    end_longitude: float = Query(...),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Calculate a real alternate route between two coordinates.

    Coordinates are snapped to the nearest real routing
    vertices.

    Blocked roads are excluded by pgRouting.
    """

    try:
        start = _nearest_vertex(
            db,
            start_latitude,
            start_longitude,
        )

        end = _nearest_vertex(
            db,
            end_latitude,
            end_longitude,
        )

        if start is None:
            return {
                "status": "route_unavailable",
                "reason": "NO_START_ROUTING_VERTEX",
                "message": (
                    "No real routing vertex is available "
                    "for the requested start location."
                ),
            }

        if end is None:
            return {
                "status": "route_unavailable",
                "reason": "NO_END_ROUTING_VERTEX",
                "message": (
                    "No real routing vertex is available "
                    "for the requested destination."
                ),
            }

        route = _route_geometry(
            db,
            start["id"],
            end["id"],
        )

        if route is None:
            return {
                "status": "route_unavailable",
                "reason": (
                    "NO_ROUTE_AVOIDING_BLOCKED_ROADS"
                ),
                "message": (
                    "No route was found using the current "
                    "routing graph while avoiding blocked roads."
                ),
                "routing_engine": "pgRouting",
                "blocked_edges_excluded": True,
                "start_vertex": start["id"],
                "end_vertex": end["id"],
                "start_snap_distance_m": round(
                    start["distance_m"],
                    2,
                ),
                "end_snap_distance_m": round(
                    end["distance_m"],
                    2,
                ),
            }

        distance_m = _safe_float(
            route["distance_m"]
        )

        route_geometry = route["geometry"]

        if isinstance(
            route_geometry,
            str,
        ):
            route_geometry = json.loads(
                route_geometry
            )

        return {
            "status": "route_found",
            "routing_engine": "pgRouting",
            "source": (
                "OpenStreetMap contributors via "
                "Geofabrik North-Eastern India extract"
            ),
            "blocked_edges_excluded": True,
            "matched_vertices": {
                "start": _safe_int(
                    start["id"]
                ),
                "end": _safe_int(
                    end["id"]
                ),
            },
            "snap_distances_m": {
                "start": round(
                    _safe_float(
                        start["distance_m"]
                    ),
                    2,
                ),
                "end": round(
                    _safe_float(
                        end["distance_m"]
                    ),
                    2,
                ),
            },
            "distance_m": round(
                distance_m,
                2,
            ),
            "distance_km": round(
                distance_m / 1000.0,
                3,
            ),
            "edge_count": _safe_int(
                route["edge_count"]
            ),
            "eta_minutes": None,
            "eta_status": (
                "UNAVAILABLE_NO_VERIFIED_ROUTE_SPEED"
            ),
            "geometry": {
                "type": "Feature",
                "properties": {
                    "routing_engine": "pgRouting",
                    "blocked_edges_excluded": True,
                    "distance_m": round(
                        distance_m,
                        2,
                    ),
                    "distance_km": round(
                        distance_m / 1000.0,
                        3,
                    ),
                    "edge_count": _safe_int(
                        route["edge_count"]
                    ),
                },
                "geometry": route_geometry,
            },
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Route calculation failed: {exc}"
            ),
        ) from exc

@router.get("/safest-shelter")
def calculate_safest_shelter_route(
    start_latitude: float = Query(..., ge=-90.0, le=90.0),
    start_longitude: float = Query(..., ge=-180.0, le=180.0),
    limit: int = Query(10, ge=1, le=20),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Find the safest *reachable* verified shelter for a real start point.

    Decision order:
        1. Authority-verified shelter geometry must exist.
        2. Shelter must have an assigned current risk zone.
        3. HIGH / CRITICAL shelters are excluded.
        4. The route must be reachable on the real pgRouting graph.
        5. blocked routing edges are excluded.
        6. LOW-risk shelters are preferred over MODERATE-risk shelters.
        7. Within the same safety class, shortest real road distance wins.
        8. Capacity is only a tie-breaker; it never overrides safety.

    No shelter coordinate, route geometry, distance, or ETA is fabricated.
    """

    try:
        start = _nearest_vertex(
            db,
            start_latitude,
            start_longitude,
        )

        if start is None:
            return {
                "status": "route_unavailable",
                "reason": "NO_START_ROUTING_VERTEX",
                "message": (
                    "No real routing vertex is available for the requested "
                    "start location."
                ),
                "routing_engine": "pgRouting",
                "blocked_edges_excluded": True,
                "synthetic_geometry": False,
            }

        registry = db.execute(
            text(
                """
                SELECT
                    COUNT(*)::int AS registered_shelters,
                    COUNT(*) FILTER (
                        WHERE geometry IS NOT NULL
                    )::int AS mapped_shelters,
                    COUNT(*) FILTER (
                        WHERE geometry IS NULL
                    )::int AS location_pending,
                    COUNT(*) FILTER (
                        WHERE geometry IS NOT NULL
                          AND risk_zone_id IS NULL
                    )::int AS mapped_risk_pending
                FROM infrastructure_assets
                WHERE UPPER(asset_type) = 'SHELTER'
                """
            )
        ).mappings().one()

        shelter_rows = db.execute(
            text(
                """
                SELECT
                    ia.id,
                    ia.asset_code,
                    ia.name,
                    ia.capacity,
                    ia.district_id,
                    ia.risk_zone_id,
                    UPPER(rz.risk_level) AS risk_level,
                    ST_Y(ia.geometry) AS latitude,
                    ST_X(ia.geometry) AS longitude
                FROM infrastructure_assets ia
                LEFT JOIN risk_zones rz
                    ON rz.id = ia.risk_zone_id
                WHERE UPPER(ia.asset_type) = 'SHELTER'
                  AND ia.geometry IS NOT NULL
                  AND ia.risk_zone_id IS NOT NULL
                  AND UPPER(COALESCE(rz.risk_level, ''))
                      NOT IN ('HIGH', 'CRITICAL')
                ORDER BY
                    CASE UPPER(COALESCE(rz.risk_level, ''))
                        WHEN 'LOW' THEN 0
                        WHEN 'MODERATE' THEN 1
                        ELSE 2
                    END,
                    ia.id
                LIMIT :limit
                """
            ),
            {"limit": limit},
        ).mappings().all()

        if not shelter_rows:
            if int(registry["mapped_shelters"] or 0) == 0:
                reason = "NO_MAPPED_SHELTERS_AVAILABLE"
                message = (
                    "No shelter with Authority-verified coordinates is "
                    "currently available for road routing."
                )
            elif int(registry["mapped_risk_pending"] or 0) > 0:
                reason = "MAPPED_SHELTERS_REQUIRE_RISK_VERIFICATION"
                message = (
                    "Mapped shelter coordinates exist, but their current "
                    "risk-zone safety state is not verified. No shelter is "
                    "recommended until that safety state is available."
                )
            else:
                reason = "NO_SAFE_MAPPED_SHELTERS_AVAILABLE"
                message = (
                    "No mapped shelter with an acceptable current risk "
                    "status is available for routing."
                )

            return {
                "status": "route_unavailable",
                "reason": reason,
                "message": message,
                "routing_engine": "pgRouting",
                "blocked_edges_excluded": True,
                "synthetic_geometry": False,
                "shelter_registry": {
                    "registered_shelters": int(
                        registry["registered_shelters"] or 0
                    ),
                    "mapped_shelters": int(
                        registry["mapped_shelters"] or 0
                    ),
                    "location_pending": int(
                        registry["location_pending"] or 0
                    ),
                    "mapped_risk_pending": int(
                        registry["mapped_risk_pending"] or 0
                    ),
                },
            }

        candidates: list[dict[str, Any]] = []

        safety_rank = {
            "LOW": 0,
            "MODERATE": 1,
        }

        for row in shelter_rows:
            end = _nearest_vertex(
                db,
                float(row["latitude"]),
                float(row["longitude"]),
            )

            base = {
                "shelter_id": int(row["id"]),
                "shelter_name": row["name"],
                "asset_code": row["asset_code"],
                "capacity": (
                    int(row["capacity"])
                    if row["capacity"] is not None
                    else None
                ),
                "district_id": (
                    int(row["district_id"])
                    if row["district_id"] is not None
                    else None
                ),
                "risk_zone_id": int(row["risk_zone_id"]),
                "risk_level": row["risk_level"],
                "safety_status": (
                    "LOW_RISK"
                    if row["risk_level"] == "LOW"
                    else "CAUTION"
                ),
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"]),
            }

            if end is None:
                candidates.append(
                    {
                        **base,
                        "status": "route_unavailable",
                        "reason": "NO_SHELTER_ROUTING_VERTEX",
                    }
                )
                continue

            route = _route_geometry(
                db,
                start["id"],
                end["id"],
            )

            if route is None:
                candidates.append(
                    {
                        **base,
                        "status": "route_unavailable",
                        "reason": "NO_ROUTE_AVOIDING_BLOCKED_ROADS",
                        "shelter_snap_distance_m": round(
                            _safe_float(end["distance_m"]),
                            2,
                        ),
                    }
                )
                continue

            route_geometry = route["geometry"]
            if isinstance(route_geometry, str):
                route_geometry = json.loads(route_geometry)

            distance_m = _safe_float(route["distance_m"])
            edge_count = _safe_int(route["edge_count"])

            candidates.append(
                {
                    **base,
                    "status": "route_found",
                    "distance_m": round(distance_m, 2),
                    "distance_km": round(distance_m / 1000.0, 3),
                    "edge_count": edge_count,
                    "shelter_snap_distance_m": round(
                        _safe_float(end["distance_m"]),
                        2,
                    ),
                    "geometry": {
                        "type": "Feature",
                        "properties": {
                            "shelter_id": int(row["id"]),
                            "risk_level": row["risk_level"],
                            "routing_engine": "pgRouting",
                            "blocked_edges_excluded": True,
                            "distance_m": round(distance_m, 2),
                            "distance_km": round(distance_m / 1000.0, 3),
                            "edge_count": edge_count,
                        },
                        "geometry": route_geometry,
                    },
                }
            )

        reachable = [
            item
            for item in candidates
            if item.get("status") == "route_found"
        ]

        if not reachable:
            return {
                "status": "route_unavailable",
                "reason": "NO_SAFE_SHELTER_ROUTE_AVOIDING_BLOCKED_ROADS",
                "message": (
                    "No safe mapped shelter is reachable using the current "
                    "routing graph while avoiding blocked roads."
                ),
                "routing_engine": "pgRouting",
                "blocked_edges_excluded": True,
                "synthetic_geometry": False,
                "start": {
                    "latitude": start_latitude,
                    "longitude": start_longitude,
                    "routing_vertex": start["id"],
                    "snap_distance_m": round(
                        _safe_float(start["distance_m"]),
                        2,
                    ),
                },
                "candidates": candidates,
            }

        reachable.sort(
            key=lambda item: (
                safety_rank.get(
                    str(item.get("risk_level") or "").upper(),
                    99,
                ),
                float(item["distance_m"]),
                -int(item.get("capacity") or 0),
            )
        )

        recommended = reachable[0]
        alternatives = reachable[1:]

        return {
            "status": "route_found",
            "reason": "SAFEST_REACHABLE_SHELTER",
            "message": (
                "Recommended the safest reachable mapped shelter by current "
                "risk state first, then real road distance, while excluding "
                "blocked routing edges."
            ),
            "routing_engine": "pgRouting",
            "blocked_edges_excluded": True,
            "synthetic_geometry": False,
            "selection_basis": [
                "AUTHORITY_VERIFIED_SHELTER_GEOMETRY",
                "CURRENT_RISK_SAFETY",
                "REAL_PGROUTING_REACHABILITY",
                "BLOCKED_ROADS_EXCLUDED",
                "ROAD_DISTANCE",
                "CAPACITY_TIE_BREAKER",
            ],
            "start": {
                "latitude": start_latitude,
                "longitude": start_longitude,
                "routing_vertex": start["id"],
                "snap_distance_m": round(
                    _safe_float(start["distance_m"]),
                    2,
                ),
            },
            "recommended_shelter": recommended,
            "alternatives": alternatives,
            "evaluated_candidates": candidates,
            "eta_minutes": None,
            "eta_status": "UNAVAILABLE_NO_VERIFIED_ROUTE_SPEED",
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Safest shelter route calculation failed: {exc}"
            ),
        ) from exc
