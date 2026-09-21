from sqlalchemy import text
from app.db.database import SessionLocal

UPDATES = [
    (52, 27.53952, 96.10076, "Diyun locality reference"),
    (54, 27.53952, 96.10076, "Diyun locality reference"),
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
    print("CHANGLANG_DIYUN_MAPPING_OK")
    print("MAPPED=2")

finally:
    db.close()
