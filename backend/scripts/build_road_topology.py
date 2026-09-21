from __future__ import annotations

import sys

from sqlalchemy import text

from app.db.database import engine


SOURCE_NAME = (
    "OpenStreetMap contributors via Geofabrik "
    "North-Eastern India extract"
)

ROUTING_TABLE = "road_routing_edges"
VERTEX_TABLE = "road_routing_vertices"


def print_section(title: str) -> None:
    print()
    print("=" * 60)
    print(title)
    print("=" * 60)


def verify_source_network(connection) -> None:
    result = connection.execute(
        text(
            """
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (
                    WHERE geometry IS NOT NULL
                ) AS geometry_count,
                COUNT(*) FILTER (
                    WHERE GeometryType(geometry) = 'LINESTRING'
                ) AS linestring_count
            FROM road_network
            WHERE source = :source
            """
        ),
        {"source": SOURCE_NAME},
    ).mappings().one()

    print(f"Road rows          : {result['total']:,}")
    print(f"Geometry present   : {result['geometry_count']:,}")
    print(f"LineString geometry: {result['linestring_count']:,}")

    if result["total"] == 0:
        raise RuntimeError(
            "No road_network rows found for the expected OSM source."
        )

    if result["geometry_count"] != result["total"]:
        raise RuntimeError(
            "Some road_network rows do not contain geometry."
        )

    if result["linestring_count"] != result["total"]:
        raise RuntimeError(
            "Some road_network geometries are not LINESTRING."
        )


def create_routing_tables(connection) -> None:
    connection.execute(
        text(
            f"""
            DROP TABLE IF EXISTS {ROUTING_TABLE} CASCADE;
            DROP TABLE IF EXISTS {VERTEX_TABLE} CASCADE;

            CREATE TABLE {VERTEX_TABLE} (
                id BIGSERIAL PRIMARY KEY,
                x DOUBLE PRECISION NOT NULL,
                y DOUBLE PRECISION NOT NULL,
                geometry geometry(Point, 4326) NOT NULL
            );

            CREATE TABLE {ROUTING_TABLE} (
                id BIGSERIAL PRIMARY KEY,

                source_road_id BIGINT NOT NULL,

                source BIGINT NOT NULL,
                target BIGINT NOT NULL,

                osm_id VARCHAR(30) NOT NULL,
                fclass VARCHAR(30) NOT NULL,
                name VARCHAR(150),
                ref VARCHAR(50),
                oneway VARCHAR(1) NOT NULL,
                maxspeed INTEGER,
                layer INTEGER,
                bridge VARCHAR(1),
                tunnel VARCHAR(1),

                source_name VARCHAR(200) NOT NULL,

                blocked BOOLEAN NOT NULL DEFAULT FALSE,
                blockage_source VARCHAR(50),
                blockage_report_id INTEGER,
                blockage_verified_at TIMESTAMP,
                blockage_notes TEXT,

                cost DOUBLE PRECISION NOT NULL,
                reverse_cost DOUBLE PRECISION NOT NULL,

                geometry geometry(LineString, 4326) NOT NULL
            );
            """
        )
    )


def build_vertices(connection) -> None:
    connection.execute(
        text(
            f"""
            INSERT INTO {VERTEX_TABLE} (
                x,
                y,
                geometry
            )
            SELECT
                x,
                y,
                ST_SetSRID(
                    ST_MakePoint(x, y),
                    4326
                ) AS geometry
            FROM (
                SELECT DISTINCT
                    ST_X(ST_StartPoint(geometry)) AS x,
                    ST_Y(ST_StartPoint(geometry)) AS y
                FROM road_network
                WHERE source = :source

                UNION

                SELECT DISTINCT
                    ST_X(ST_EndPoint(geometry)) AS x,
                    ST_Y(ST_EndPoint(geometry)) AS y
                FROM road_network
                WHERE source = :source
            ) AS endpoints
            ORDER BY x, y;
            """
        ),
        {"source": SOURCE_NAME},
    )

    count = connection.execute(
        text(
            f"""
            SELECT COUNT(*)
            FROM {VERTEX_TABLE};
            """
        )
    ).scalar_one()

    print(f"Routing vertices created: {count:,}")


def create_vertex_lookup_index(connection) -> None:
    connection.execute(
        text(
            f"""
            CREATE UNIQUE INDEX idx_{VERTEX_TABLE}_xy
                ON {VERTEX_TABLE} (x, y);
            """
        )
    )

    connection.execute(
        text(
            f"""
            CREATE INDEX idx_{VERTEX_TABLE}_geometry
                ON {VERTEX_TABLE}
                USING GIST (geometry);
            """
        )
    )


def build_edges(connection) -> None:
    connection.execute(
        text(
            f"""
            INSERT INTO {ROUTING_TABLE} (
                source_road_id,
                source,
                target,
                osm_id,
                fclass,
                name,
                ref,
                oneway,
                maxspeed,
                layer,
                bridge,
                tunnel,
                source_name,
                blocked,
                blockage_source,
                blockage_report_id,
                blockage_verified_at,
                blockage_notes,
                cost,
                reverse_cost,
                geometry
            )
            SELECT
                r.id AS source_road_id,

                vs.id AS source,
                vt.id AS target,

                r.osm_id,
                r.fclass,
                r.name,
                r.ref,
                r.oneway,
                r.maxspeed,
                r.layer,
                r.bridge,
                r.tunnel,

                r.source,

                FALSE AS blocked,
                NULL AS blockage_source,
                NULL AS blockage_report_id,
                NULL AS blockage_verified_at,
                NULL AS blockage_notes,

                ST_Length(r.geometry::geography) AS cost,

                CASE
                    WHEN r.oneway IN ('F', 'T')
                        THEN -1
                    ELSE ST_Length(r.geometry::geography)
                END AS reverse_cost,

                r.geometry

            FROM road_network r

            INNER JOIN {VERTEX_TABLE} vs
                ON vs.x = ST_X(ST_StartPoint(r.geometry))
                AND vs.y = ST_Y(ST_StartPoint(r.geometry))

            INNER JOIN {VERTEX_TABLE} vt
                ON vt.x = ST_X(ST_EndPoint(r.geometry))
                AND vt.y = ST_Y(ST_EndPoint(r.geometry))

            WHERE r.source = :source;
            """
        ),
        {"source": SOURCE_NAME},
    )

    count = connection.execute(
        text(
            f"""
            SELECT COUNT(*)
            FROM {ROUTING_TABLE};
            """
        )
    ).scalar_one()

    print(f"Routing edges created: {count:,}")


def create_routing_indexes(connection) -> None:
    connection.execute(
        text(
            f"""
            CREATE INDEX idx_{ROUTING_TABLE}_geometry
                ON {ROUTING_TABLE}
                USING GIST (geometry);

            CREATE INDEX idx_{ROUTING_TABLE}_source
                ON {ROUTING_TABLE} (source);

            CREATE INDEX idx_{ROUTING_TABLE}_target
                ON {ROUTING_TABLE} (target);

            CREATE INDEX idx_{ROUTING_TABLE}_blocked
                ON {ROUTING_TABLE} (blocked);

            CREATE INDEX idx_{ROUTING_TABLE}_source_road_id
                ON {ROUTING_TABLE} (source_road_id);

            CREATE INDEX idx_{ROUTING_TABLE}_osm_id
                ON {ROUTING_TABLE} (osm_id);
            """
        )
    )


def validate_graph(connection) -> None:
    result = connection.execute(
        text(
            f"""
            SELECT
                COUNT(*) AS edges,

                COUNT(*) FILTER (
                    WHERE source IS NOT NULL
                ) AS source_vertices,

                COUNT(*) FILTER (
                    WHERE target IS NOT NULL
                ) AS target_vertices,

                COUNT(*) FILTER (
                    WHERE cost > 0
                ) AS positive_costs,

                COUNT(*) FILTER (
                    WHERE reverse_cost >= 0
                ) AS reverse_enabled,

                COUNT(*) FILTER (
                    WHERE blocked = TRUE
                ) AS blocked

            FROM {ROUTING_TABLE};
            """
        )
    ).mappings().one()

    vertex_count = connection.execute(
        text(
            f"""
            SELECT COUNT(*)
            FROM {VERTEX_TABLE};
            """
        )
    ).scalar_one()

    source_count = connection.execute(
        text(
            """
            SELECT COUNT(*)
            FROM road_network
            WHERE source = :source;
            """
        ),
        {"source": SOURCE_NAME},
    ).scalar_one()

    print(f"Routing edges         : {result['edges']:,}")
    print(f"Routing vertices      : {vertex_count:,}")
    print(f"Source vertices       : {result['source_vertices']:,}")
    print(f"Target vertices       : {result['target_vertices']:,}")
    print(f"Positive costs        : {result['positive_costs']:,}")
    print(f"Reverse enabled       : {result['reverse_enabled']:,}")
    print(f"Blocked edges         : {result['blocked']:,}")
    print(f"Original OSM roads    : {source_count:,}")

    if result["edges"] != source_count:
        raise RuntimeError(
            "Routing edge count does not match source road count."
        )

    if result["source_vertices"] != result["edges"]:
        raise RuntimeError(
            "Some routing edges are missing source vertices."
        )

    if result["target_vertices"] != result["edges"]:
        raise RuntimeError(
            "Some routing edges are missing target vertices."
        )

    if result["positive_costs"] != result["edges"]:
        raise RuntimeError(
            "Some routing edges have non-positive costs."
        )

    print()
    print("ROUTING GRAPH VALIDATION: PASSED")


def run_dijkstra_test(connection) -> None:
    endpoints = connection.execute(
        text(
            f"""
            SELECT source, target
            FROM {ROUTING_TABLE}
            WHERE source IS NOT NULL
              AND target IS NOT NULL
            ORDER BY id
            LIMIT 1;
            """
        )
    ).mappings().one()

    start_vertex = endpoints["source"]
    end_vertex = endpoints["target"]

    print(f"Real graph test: {start_vertex} -> {end_vertex}")

    result = connection.execute(
        text(
            f"""
            SELECT *
            FROM pgr_dijkstra(
                $sql$
                    SELECT
                        id,
                        source,
                        target,
                        cost,
                        reverse_cost
                    FROM {ROUTING_TABLE}
                    WHERE blocked = FALSE
                $sql$,
                :start_vertex,
                :end_vertex,
                directed := TRUE
            );
            """
        ),
        {
            "start_vertex": start_vertex,
            "end_vertex": end_vertex,
        },
    ).fetchall()

    print(f"Dijkstra rows: {len(result)}")

    if not result:
        raise RuntimeError(
            "pgRouting Dijkstra returned no route on the real graph."
        )

    print()
    print("DIJKSTRA TEST: PASSED")


def print_summary(connection) -> None:
    result = connection.execute(
        text(
            f"""
            SELECT
                COUNT(*) AS edges,

                COUNT(DISTINCT source_road_id) AS source_roads,

                COUNT(*) FILTER (
                    WHERE blocked = TRUE
                ) AS blocked,

                ROUND(
                    (
                        SUM(
                            ST_Length(geometry::geography)
                        ) / 1000.0
                    )::numeric,
                    2
                ) AS mapped_km

            FROM {ROUTING_TABLE};
            """
        )
    ).mappings().one()

    print(f"Routing edges        : {result['edges']:,}")
    print(f"Mapped source roads  : {result['source_roads']:,}")
    print(f"Blocked edges        : {result['blocked']:,}")
    print(f"Mapped road length   : {result['mapped_km']:,} km")


def main() -> int:
    print()
    print("=" * 60)
    print("BhooPehra Fast pgRouting 4.x Topology Builder")
    print("=" * 60)
    print()
    print("Topology strategy: exact OSM road endpoints")
    print("Endpoint lookup: indexed X/Y coordinates")
    print("Crossing separation: intentionally not run globally")
    print("Synthetic geometry: NONE")

    try:
        with engine.begin() as connection:

            print_section("SOURCE ROAD NETWORK CHECK")
            verify_source_network(connection)

            print_section("CREATING ROUTING GRAPH TABLES")
            create_routing_tables(connection)

            print_section("BUILDING ENDPOINT VERTICES")
            build_vertices(connection)

            print_section("CREATING VERTEX LOOKUP INDEX")
            create_vertex_lookup_index(connection)

            print_section("BUILDING ROUTING EDGES")
            build_edges(connection)

            print_section("CREATING ROUTING INDEXES")
            create_routing_indexes(connection)

            print_section("ROUTING GRAPH VALIDATION")
            validate_graph(connection)

            print_section("PGRouting DIJKSTRA TEST")
            run_dijkstra_test(connection)

            print_section("ROUTING GRAPH SUMMARY")
            print_summary(connection)

        print()
        print("=" * 60)
        print("PGRouting TOPOLOGY BUILD: PASSED")
        print("=" * 60)

        return 0

    except Exception as exc:
        print()
        print("=" * 60)
        print("PGRouting TOPOLOGY BUILD FAILED")
        print("=" * 60)
        print(exc)

        return 1


if __name__ == "__main__":
    sys.exit(main())