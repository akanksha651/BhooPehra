from app.db.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

try:
    updates = [
        (85, 27.39352, 92.62141, "Khazalang/Lapusa locality reference"),
        (86, 27.39352, 92.62141, "Khazalang/Lapusa locality reference"),
    ]

    for asset_id, lat, lon, ref in updates:
        db.execute(text("""
            UPDATE infrastructure_assets
            SET geometry = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                source = COALESCE(source, '') ||
                    ' | coordinate_basis=LOCALITY_COORDINATE | coordinate_source=' || :ref
            WHERE id = :id
        """), {
            "id": asset_id,
            "lat": lat,
            "lon": lon,
            "ref": ref
        })

    db.commit()

    rows = db.execute(text("""
        SELECT id, asset_code, name,
               ST_Y(geometry) AS latitude,
               ST_X(geometry) AS longitude
        FROM infrastructure_assets
        WHERE id IN (85,86)
        ORDER BY id
    """)).mappings().all()

    for row in rows:
        print(dict(row))

    print("KHAZALANG_LOCALITY_MAPPING_OK")

finally:
    db.close()
