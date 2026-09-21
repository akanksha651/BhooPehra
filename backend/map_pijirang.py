from sqlalchemy import text
from app.db.database import SessionLocal

db = SessionLocal()

try:
    result = db.execute(
        text("""
            UPDATE infrastructure_assets
            SET
                geometry = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                source = source || ' | coordinate_basis=LOCALITY_COORDINATE | coordinate_source=Pizirang Veo locality reference',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
              AND geometry IS NULL
        """),
        {
            "id": 100,
            "lat": 27.26749,
            "lon": 93.08802
        }
    )

    db.commit()

    print("EAST_KAMENG_PIZIRANG_MAPPING_OK")
    print("UPDATED=", result.rowcount)

finally:
    db.close()
