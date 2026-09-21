from sqlalchemy import text
from app.db.database import SessionLocal

db = SessionLocal()

try:
    result = db.execute(
        text("""
            UPDATE infrastructure_assets
            SET
                geometry = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                source = source || ' | coordinate_basis=LOCALITY_COORDINATE | coordinate_source=TRAI Gyawe Purang H.Q. reference',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
              AND geometry IS NULL
        """),
        {
            "id": 98,
            "lat": 27.46710,
            "lon": 93.12300
        }
    )

    db.commit()

    print("EAST_KAMENG_GYAWE_PURANG_MAPPING_OK")
    print("UPDATED=", result.rowcount)

finally:
    db.close()
