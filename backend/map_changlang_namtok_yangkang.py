from sqlalchemy import text
from app.db.database import SessionLocal

UPDATES = [
    (78, 27.212993, 95.71692, "Namtok locality reference"),
    (79, 27.268535, 96.062183, "Yangkang locality reference"),
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
    print("CHANGLANG_NAMTOK_YANGKANG_MAPPING_OK")
    print("MAPPED=2")

finally:
    db.close()
