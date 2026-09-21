from sqlalchemy import text
from app.db.database import SessionLocal

db = SessionLocal()

try:
    result = db.execute(
        text("""
            UPDATE infrastructure_assets
            SET
                geometry = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                source = source || ' | coordinate_basis=LOCALITY_COORDINATE | coordinate_source=NIVEDI Sompoi-I georeference',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
              AND geometry IS NULL
        """),
        {
            "id": 51,
            "lat": 27.5851,
            "lon": 96.1331
        }
    )

    db.commit()

    print("CHANGLANG_SOMPOI_MAPPING_OK")
    print("UPDATED=", result.rowcount)

finally:
    db.close()
