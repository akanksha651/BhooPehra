from sqlalchemy import text
from app.db.database import SessionLocal

UPDATES = [
    (20, 28.073010, 96.543050, "GeoNames"),
    (21, 27.884390, 96.812450, "OSM"),
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

    print("ANJAW_LOCALITY_MAPPING_OK")
    print("MAPPED=2")
    print("REMAINING_PENDING=1")

finally:
    db.close()
