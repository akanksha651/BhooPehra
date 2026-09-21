from sqlalchemy import text
from app.db.database import SessionLocal

UPDATES = [
    (75, 27.3569, 96.01342, "Jairampur locality reference"),
    (76, 27.3569, 96.01342, "Jairampur locality reference"),
    (77, 27.3569, 96.01342, "Jairampur locality reference"),
]

db = SessionLocal()

try:
    for shelter_id, lat, lon, coord_source in UPDATES:
        db.execute(
            text("""
                UPDATE infrastructure_assets
                SET
                    geometry = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                    source = source || ' | coordinate_basis=LOCALITY_COORDINATE | coordinate_source=' || :coord_source,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :id
            """),
            {
                "id": shelter_id,
                "lat": lat,
                "lon": lon,
                "coord_source": coord_source
            }
        )

    db.commit()
    print("CHANGLANG_JAIRAMPUR_MAPPING_OK")
    print("MAPPED=3")

finally:
    db.close()
