from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection


ROAD_MATCH_TOLERANCE_M = 75.0
BLOCKAGE_SOURCE = "FIELD_REPORT"

ROAD_NETWORK_TABLE = "road_network"
ROUTING_EDGES_TABLE = "road_routing_edges"


def _has_road_impact(value: str | None) -> bool:
    if value is None:
        return False

    normalized = value.strip().upper()

    if not normalized:
        return False

    negative_values = {
        "NO",
        "N",
        "NO IMPACT",
        "NO ROAD IMPACT",
        "NOT AFFECTED",
        "NOT AFFECTED ROAD",
        "NONE",
        "FALSE",
        "0",
    }

    return normalized not in negative_values


def _clear_previous_field_report_blockages(
    db: Connection,
    updated_at: datetime,
) -> dict[str, int]:
    """
    Clear stale FIELD_REPORT blockage state from both the source
    OSM road table and the pgRouting edge table.

    The routing edge is linked to road_network through
    road_routing_edges.source_road_id = road_network.id.
    """

    routing_result = db.execute(
        text(
            f"""
            UPDATE {ROUTING_EDGES_TABLE}
            SET
                blocked = FALSE,
                blockage_source = NULL,
                blockage_report_id = NULL,
                blockage_verified_at = NULL,
                blockage_notes = NULL
            WHERE blockage_source = :blockage_source
            """
        ),
        {
            "blockage_source": BLOCKAGE_SOURCE,
        },
    )

    road_result = db.execute(
        text(
            f"""
            UPDATE {ROAD_NETWORK_TABLE}
            SET
                blocked = FALSE,
                blockage_source = NULL,
                blockage_report_id = NULL,
                blockage_verified_at = NULL,
                blockage_notes = NULL,
                updated_at = :updated_at
            WHERE blockage_source = :blockage_source
            """
        ),
        {
            "updated_at": updated_at,
            "blockage_source": BLOCKAGE_SOURCE,
        },
    )

    return {
        "road_network_rows": int(road_result.rowcount),
        "routing_edge_rows": int(routing_result.rowcount),
    }


def _block_routing_edges(
    db: Connection,
    road_id: int,
    report_id: int,
    verified_at: datetime,
    blockage_notes: str | None,
) -> int:
    """
    Propagate a verified road blockage from road_network to all
    pgRouting edges generated from that source road.

    The source-road relationship is explicit:
        road_routing_edges.source_road_id = road_network.id
    """

    result = db.execute(
        text(
            f"""
            UPDATE {ROUTING_EDGES_TABLE}
            SET
                blocked = TRUE,
                blockage_source = :blockage_source,
                blockage_report_id = :report_id,
                blockage_verified_at = :verified_at,
                blockage_notes = :blockage_notes
            WHERE source_road_id = :road_id
            """
        ),
        {
            "blockage_source": BLOCKAGE_SOURCE,
            "report_id": report_id,
            "verified_at": verified_at,
            "blockage_notes": blockage_notes,
            "road_id": road_id,
        },
    )

    return int(result.rowcount)


def sync_verified_field_report_blockages(
    db: Connection,
    tolerance_m: float = ROAD_MATCH_TOLERANCE_M,
) -> dict[str, Any]:
    """
    Synchronize verified field-report road impacts with the real
    OSM road network and the pgRouting graph.

    Rules:
    - Only VERIFIED field reports are eligible.
    - Report must have usable GPS coordinates.
    - road_impact must contain a meaningful positive value.
    - GPS must spatially match a real OSM road within tolerance.
    - No synthetic geometry is created.
    - Previous FIELD_REPORT blockage state is cleared from both
      road_network and road_routing_edges before current verified
      evidence is reapplied.
    - A matched road is marked blocked in both tables.
    """

    now = datetime.utcnow()

    cleared = _clear_previous_field_report_blockages(
        db,
        updated_at=now,
    )

    verified_reports = db.execute(
        text(
            f"""
            SELECT
                id,
                report_code,
                title,
                status,
                road_impact,
                latitude,
                longitude,
                verification_notes,
                verified_at
            FROM field_reports
            WHERE UPPER(status) = 'VERIFIED'
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
            ORDER BY
                COALESCE(
                    verified_at,
                    updated_at,
                    submitted_at,
                    created_at
                ) DESC,
                id DESC
            """
        )
    ).mappings().all()

    eligible_reports = [
        dict(report)
        for report in verified_reports
        if _has_road_impact(report.get("road_impact"))
    ]

    matched: list[dict[str, Any]] = []
    unmatched: list[dict[str, Any]] = []

    for report in eligible_reports:
        match = db.execute(
            text(
                f"""
                SELECT
                    id,
                    osm_id,
                    fclass,
                    name,
                    ref,
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
                FROM {ROAD_NETWORK_TABLE}
                WHERE ST_DWithin(
                    geometry::geography,
                    ST_SetSRID(
                        ST_MakePoint(
                            :longitude,
                            :latitude
                        ),
                        4326
                    )::geography,
                    :tolerance_m
                )
                ORDER BY
                    geometry::geography <->
                    ST_SetSRID(
                        ST_MakePoint(
                            :longitude,
                            :latitude
                        ),
                        4326
                    )::geography,
                    id
                LIMIT 1
                """
            ),
            {
                "latitude": float(report["latitude"]),
                "longitude": float(report["longitude"]),
                "tolerance_m": tolerance_m,
            },
        ).mappings().first()

        if match is None:
            unmatched.append(
                {
                    "report_id": report["id"],
                    "report_code": report["report_code"],
                    "reason": "NO_OSM_ROAD_WITHIN_MATCH_TOLERANCE",
                    "tolerance_m": tolerance_m,
                }
            )
            continue

        verified_at = report.get("verified_at") or now
        notes = (
            report.get("verification_notes")
            or report.get("road_impact")
        )

        road_update = db.execute(
            text(
                f"""
                UPDATE {ROAD_NETWORK_TABLE}
                SET
                    blocked = TRUE,
                    blockage_source = :blockage_source,
                    blockage_report_id = :report_id,
                    blockage_verified_at = :verified_at,
                    blockage_notes = :blockage_notes,
                    updated_at = :updated_at
                WHERE id = :road_id
                """
            ),
            {
                "blockage_source": BLOCKAGE_SOURCE,
                "report_id": report["id"],
                "verified_at": verified_at,
                "blockage_notes": notes,
                "updated_at": now,
                "road_id": match["id"],
            },
        )

        routing_edges_updated = _block_routing_edges(
            db,
            road_id=int(match["id"]),
            report_id=int(report["id"]),
            verified_at=verified_at,
            blockage_notes=notes,
        )

        if routing_edges_updated == 0:
            unmatched.append(
                {
                    "report_id": report["id"],
                    "report_code": report["report_code"],
                    "reason": (
                        "OSM_ROAD_MATCHED_BUT_NO_ROUTING_EDGE_LINKED"
                    ),
                    "road_id": int(match["id"]),
                    "osm_id": match["osm_id"],
                }
            )
            continue

        matched.append(
            {
                "report_id": report["id"],
                "report_code": report["report_code"],
                "road_id": int(match["id"]),
                "osm_id": match["osm_id"],
                "road_class": match["fclass"],
                "road_name": match["name"],
                "road_ref": match["ref"],
                "match_distance_m": round(
                    float(match["distance_m"]),
                    2,
                ),
                "match_tolerance_m": tolerance_m,
                "road_network_rows_updated": int(
                    road_update.rowcount
                ),
                "routing_edges_blocked": routing_edges_updated,
            }
        )

    db.commit()

    road_network_blocked_count = db.execute(
        text(
            f"""
            SELECT COUNT(*)
            FROM {ROAD_NETWORK_TABLE}
            WHERE blocked = TRUE
            """
        )
    ).scalar_one()

    routing_blocked_count = db.execute(
        text(
            f"""
            SELECT COUNT(*)
            FROM {ROUTING_EDGES_TABLE}
            WHERE blocked = TRUE
            """
        )
    ).scalar_one()

    return {
        "status": "success",
        "blockage_source": BLOCKAGE_SOURCE,
        "spatial_method": (
            "PostGIS ST_DWithin + nearest road ordering"
        ),
        "routing_sync_method": (
            "road_routing_edges.source_road_id = road_network.id"
        ),
        "synthetic_geometry_created": False,
        "match_tolerance_m": tolerance_m,
        "verified_reports_seen": len(verified_reports),
        "eligible_road_impact_reports": len(eligible_reports),
        "matched_reports": len(matched),
        "unmatched_reports": len(unmatched),
        "road_network_blocked": int(
            road_network_blocked_count
        ),
        "routing_blocked_edges": int(
            routing_blocked_count
        ),
        "cleared_previous_field_report_blockages": {
            "road_network_rows": cleared["road_network_rows"],
            "routing_edge_rows": cleared["routing_edge_rows"],
        },
        "matched": matched,
        "unmatched": unmatched,
    }