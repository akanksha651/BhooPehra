from sqlalchemy import text
from app.db.database import SessionLocal

UPDATES = [
    (39, 27.3627, 96.3452, "Changlang locality reference"),
    (40, 27.3627, 96.3452, "Changlang locality reference"),
    (41, 27.3627, 96.3452, "Changlang locality reference"),
    (42, 27.3627, 96.3452, "Changlang locality reference"),
    (43, 27.3627, 96.3452, "Changlang locality reference"),
    (44, 27.3627, 96.3452, "Changlang locality reference"),
    (45, 27.3627, 96.3452, "Changlang locality reference"),
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
    print("CHANGLANG_LOCALITY_MAPPING_OK")
    print("MAPPED=7")

finally:
    db.close()
