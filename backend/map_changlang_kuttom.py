from sqlalchemy import text
from app.db.database import SessionLocal

db = SessionLocal()

try:
    db.execute(
        text("""
            UPDATE infrastructure_assets
            SET
                geometry = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                source = source || ' | coordinate_basis=LOCALITY_COORDINATE | coordinate_source=Kuttom locality reference',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
        """),
        {
            "id": 63,
            "lat": 27.44421,
            "lon": 96.02673
        }
    )

    db.commit()
    print("CHANGLANG_KUTTOM_MAPPING_OK")
    print("MAPPED=1")

finally:
    db.close()
