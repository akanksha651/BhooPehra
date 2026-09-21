from sqlalchemy import text
from app.db.database import SessionLocal

db = SessionLocal()

try:
    db.execute(
        text("""
            UPDATE infrastructure_assets
            SET
                geometry = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                source = source || ' | coordinate_basis=LOCALITY_COORDINATE | coordinate_source=Kharsang locality reference',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
        """),
        {
            "id": 64,
            "lat": 27.42104,
            "lon": 96.02149
        }
    )

    db.commit()
    print("CHANGLANG_KHARSANG_MAPPING_OK")
    print("MAPPED=1")

finally:
    db.close()
