from __future__ import annotations

import sys
from pathlib import Path

import geopandas as gpd
from sqlalchemy import text

from app.db.database import engine
from app.services.gsi_road_features import ROAD_GPKG


ROAD_LAYER = "gis_osm_roads_free"

SOURCE_NAME = (
    "OpenStreetMap contributors via Geofabrik "
    "North-Eastern India extract"
)

# Keep the complete OSM road layer. Routing access filtering will be
# handled later by the routing service, not during source ingestion.
REQUIRED_COLUMNS = [
    "osm_id",
    "fclass",
    "name",
    "ref",
    "oneway",
    "maxspeed",
    "layer",
    "bridge",
    "tunnel",
    "geometry",
]


def load_source_roads() -> gpd.GeoDataFrame:
    """Load the real OSM road layer from the cached GeoPackage."""

    if not Path(ROAD_GPKG).exists():
        raise FileNotFoundError(
            f"Road GeoPackage not found: {ROAD_GPKG}"
        )

    print(f"Reading source: {ROAD_GPKG}")
    print(f"Layer: {ROAD_LAYER}")

    roads = gpd.read_file(
        ROAD_GPKG,
        layer=ROAD_LAYER,
        columns=REQUIRED_COLUMNS,
    )

    if roads.empty:
        raise RuntimeError(
            "The OSM road layer contains no records."
        )

    print(f"Source features loaded: {len(roads):,}")
    print(f"Source CRS: {roads.crs}")

    return roads


def validate_source_roads(
    roads: gpd.GeoDataFrame,
) -> gpd.GeoDataFrame:
    """Validate and normalize source road records."""

    missing = [
        column
        for column in REQUIRED_COLUMNS
        if column not in roads.columns
    ]

    if missing:
        raise RuntimeError(
            "Required road columns are missing: "
            + ", ".join(missing)
        )

    if roads.crs is None:
        raise RuntimeError(
            "Source road layer has no CRS."
        )

    # The existing road feature service already reads this source
    # as geographic WGS84 data. Preserve that convention explicitly.
    roads = roads.to_crs(epsg=4326)

    roads = roads[
        roads.geometry.notna()
        & ~roads.geometry.is_empty
    ].copy()

    roads = roads[
        roads.geometry.geom_type == "LineString"
    ].copy()

    roads["osm_id"] = (
        roads["osm_id"]
        .astype(str)
        .str.strip()
    )

    roads = roads[
        roads["osm_id"].notna()
        & (roads["osm_id"] != "")
    ].copy()

    # An OSM feature should be represented only once in our routing
    # source table.
    roads = roads.drop_duplicates(
        subset=["osm_id"],
        keep="first",
    ).copy()

    if roads.empty:
        raise RuntimeError(
            "No valid LineString OSM road features remain "
            "after validation."
        )

    print(
        f"Validated LineString features: {len(roads):,}"
    )

    return roads


def normalize_value(value: object) -> object:
    """Convert pandas NaN/NA values to SQL NULL."""

    if value is None:
        return None

    try:
        if value != value:
            return None
    except Exception:
        pass

    return value


def build_rows(
    roads: gpd.GeoDataFrame,
) -> list[dict]:
    """
    Convert GeoDataFrame records into database-ready rows.

    Geometry is sent as WKT and reconstructed by PostGIS.
    Routing topology/cost is intentionally left unset here.
    """

    rows: list[dict] = []

    for record in roads.itertuples(index=False):
        geometry = record.geometry

        if geometry is None or geometry.is_empty:
            continue

        rows.append(
            {
                "osm_id": str(record.osm_id),
                "fclass": str(
                    normalize_value(record.fclass)
                    or "unknown"
                ),
                "name": normalize_value(record.name),
                "ref": normalize_value(record.ref),
                "oneway": str(
                    normalize_value(record.oneway)
                    or "B"
                ),
                "maxspeed": normalize_value(record.maxspeed),
                "layer": normalize_value(record.layer),
                "bridge": normalize_value(record.bridge),
                "tunnel": normalize_value(record.tunnel),
                "source": SOURCE_NAME,
                "blocked": False,
                "blockage_source": None,
                "blockage_report_id": None,
                "blockage_verified_at": None,
                "blockage_notes": None,
                "source_vertex": None,
                "target_vertex": None,
                "cost": None,
                "reverse_cost": None,
                "wkt": geometry.wkt,
            }
        )

    if not rows:
        raise RuntimeError(
            "No database rows could be prepared."
        )

    return rows


def clear_existing_source_rows(connection) -> None:
    """
    Remove only rows belonging to this exact OSM source.

    This keeps the table safe for reruns while avoiding an
    unconditional TRUNCATE of the road table.
    """

    result = connection.execute(
        text(
            """
            DELETE FROM road_network
            WHERE source = :source
            """
        ),
        {"source": SOURCE_NAME},
    )

    print(
        "Existing source rows removed: "
        f"{result.rowcount:,}"
    )


def insert_rows(
    connection,
    rows: list[dict],
) -> None:
    """
    Bulk insert validated road records.

    Geometry remains authoritative from the source GeoPackage.
    pgRouting topology is deliberately created later.
    """

    insert_sql = text(
        """
        INSERT INTO road_network (
            osm_id,
            fclass,
            name,
            ref,
            oneway,
            maxspeed,
            layer,
            bridge,
            tunnel,
            source,
            blocked,
            blockage_source,
            blockage_report_id,
            blockage_verified_at,
            blockage_notes,
            source_vertex,
            target_vertex,
            cost,
            reverse_cost,
            geometry
        )
        VALUES (
            :osm_id,
            :fclass,
            :name,
            :ref,
            :oneway,
            :maxspeed,
            :layer,
            :bridge,
            :tunnel,
            :source,
            :blocked,
            :blockage_source,
            :blockage_report_id,
            :blockage_verified_at,
            :blockage_notes,
            :source_vertex,
            :target_vertex,
            :cost,
            :reverse_cost,
            ST_GeomFromText(:wkt, 4326)
        )
        """
    )

    # SQLAlchemy executemany through psycopg handles these records
    # as a bulk operation rather than ORM object-by-object inserts.
    batch_size = 5000

    total = len(rows)

    for start in range(0, total, batch_size):
        batch = rows[start : start + batch_size]

        connection.execute(
            insert_sql,
            batch,
        )

        end = min(
            start + len(batch),
            total,
        )

        print(
            f"Imported: {end:,}/{total:,}"
        )


def validate_database(connection) -> None:
    """Validate the imported source data inside PostGIS."""

    summary = connection.execute(
        text(
            """
            SELECT
                COUNT(*) AS total,
                COUNT(geometry) AS geometry_count,
                COUNT(*) FILTER (
                    WHERE ST_SRID(geometry) = 4326
                ) AS srid_4326_count,
                COUNT(*) FILTER (
                    WHERE GeometryType(geometry) = 'LINESTRING'
                ) AS linestring_count,
                COUNT(*) FILTER (
                    WHERE blocked = FALSE
                ) AS unblocked_count,
                COUNT(*) FILTER (
                    WHERE source_vertex IS NOT NULL
                       OR target_vertex IS NOT NULL
                ) AS topology_count
            FROM road_network
            WHERE source = :source
            """
        ),
        {"source": SOURCE_NAME},
    ).mappings().one()

    print()
    print("=" * 60)
    print("POSTGIS ROAD IMPORT VALIDATION")
    print("=" * 60)
    print(
        f"Total imported       : {summary['total']:,}"
    )
    print(
        f"Geometry present     : {summary['geometry_count']:,}"
    )
    print(
        f"SRID 4326            : {summary['srid_4326_count']:,}"
    )
    print(
        f"LineString geometry  : {summary['linestring_count']:,}"
    )
    print(
        f"Initially unblocked  : {summary['unblocked_count']:,}"
    )
    print(
        f"Topology assigned    : {summary['topology_count']:,}"
    )

    if summary["total"] == 0:
        raise RuntimeError(
            "Database validation failed: no road rows imported."
        )

    if summary["total"] != summary["geometry_count"]:
        raise RuntimeError(
            "Database validation failed: some rows have no geometry."
        )

    if summary["total"] != summary["srid_4326_count"]:
        raise RuntimeError(
            "Database validation failed: some geometries are not SRID 4326."
        )

    if summary["total"] != summary["linestring_count"]:
        raise RuntimeError(
            "Database validation failed: some geometries are not LineStrings."
        )

    if summary["total"] != summary["unblocked_count"]:
        raise RuntimeError(
            "Database validation failed: imported rows are not initially unblocked."
        )

    if summary["topology_count"] != 0:
        raise RuntimeError(
            "Database validation failed: topology should not exist yet."
        )

    print()
    print("IMPORT VALIDATION: PASSED")


def main() -> None:
    print()
    print("=" * 60)
    print("BhooPehra OSM Road Network Importer")
    print("=" * 60)
    print()
    print(
        "Source: OpenStreetMap contributors via "
        "Geofabrik North-Eastern India extract"
    )
    print(
        f"Layer : {ROAD_LAYER}"
    )
    print(
        "Target: PostgreSQL/PostGIS road_network"
    )
    print()

    roads = load_source_roads()
    roads = validate_source_roads(roads)

    print()
    print("Preparing database rows...")

    rows = build_rows(roads)

    print(
        f"Rows prepared: {len(rows):,}"
    )

    print()
    print("Starting database transaction...")

    with engine.begin() as connection:
        clear_existing_source_rows(connection)
        insert_rows(
            connection,
            rows,
        )
        validate_database(connection)

    print()
    print("=" * 60)
    print("ROAD NETWORK IMPORT COMPLETED")
    print("=" * 60)
    print(
        f"Imported real OSM road features: {len(rows):,}"
    )
    print(
        "pgRouting topology: NOT BUILT YET"
    )
    print(
        "Current blockage state: UNBLOCKED"
    )
    print(
        "Synthetic coordinates: NONE"
    )
    print()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print()
        print("=" * 60)
        print("ROAD NETWORK IMPORT FAILED")
        print("=" * 60)
        print(str(exc))
        print()
        sys.exit(1)