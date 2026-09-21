from app.db.database import SessionLocal
from sqlalchemy import text

updates = [
    (38, 27.02931, 95.47571, "BORDURIA_LOCALITY"),
    (89, None, None, None),
]

db = SessionLocal()

try:
    row = db.execute(text("""
        SELECT id, asset_code, name
        FROM infrastructure_assets
        WHERE id = 38
    """)).mappings().first()

    print("BEFORE:", dict(row) if row else None)

    db.execute(text("""
        UPDATE infrastructure_assets
        SET geometry = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
            source = COALESCE(source, '') ||
                     CASE
                       WHEN COALESCE(source, '') = '' THEN ''
                       ELSE ' | '
                     END ||
                     'coordinate_basis=LOCALITY_COORDINATE | coordinate_source=OpenStreetMap-derived Borduria locality coordinate (Mapcarta)'
        WHERE id = :id
    """), {
        "id": 38,
        "lat": 27.02931,
        "lon": 95.47571
    })

    db.commit()

    row = db.execute(text("""
        SELECT
            id,
            asset_code,
            name,
            ST_Y(geometry) AS latitude,
            ST_X(geometry) AS longitude,
            source
        FROM infrastructure_assets
        WHERE id = 38
    """)).mappings().first()

    print("AFTER:", dict(row) if row else None)
    print("BORDURIA_LOCALITY_MAPPING_OK")

finally:
    db.close()
