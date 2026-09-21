from app.db.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

try:
    row = db.execute(text("""
        SELECT id, asset_code, name, ST_Y(geometry) AS latitude,
               ST_X(geometry) AS longitude, source
        FROM infrastructure_assets
        WHERE id = 59
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
                     'coordinate_basis=LOCALITY_COORDINATE | coordinate_source=USOF Government telecom dataset - Songkin II coordinate'
        WHERE id = :id
    """), {
        "id": 59,
        "lat": 27.406740,
        "lon": 96.221631
    })

    db.commit()

    row = db.execute(text("""
        SELECT id, asset_code, name,
               ST_Y(geometry) AS latitude,
               ST_X(geometry) AS longitude,
               source
        FROM infrastructure_assets
        WHERE id = 59
    """)).mappings().first()

    print("AFTER:", dict(row) if row else None)
    print("SONGKIN_LOCALITY_MAPPING_OK")

finally:
    db.close()
