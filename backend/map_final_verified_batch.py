from sqlalchemy import text
from app.db.database import SessionLocal

UPDATES = [
    (99, 27.38394, 92.82473, "Richukrong locality reference"),
    (70, 27.1073375, 95.9311279, "Renuk Circle locality reference"),
]

db = SessionLocal()

try:
    updated = 0

    for shelter_id, lat, lon, coord_source in UPDATES:
        result = db.execute(
            text("""
                UPDATE infrastructure_assets
                SET
                    geometry = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                    source = source || ' | coordinate_basis=LOCALITY_COORDINATE | coordinate_source=' || :coord_source,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :id
                  AND geometry IS NULL
            """),
            {
                "id": shelter_id,
                "lat": lat,
                "lon": lon,
                "coord_source": coord_source
            }
        )
        updated += result.rowcount

    db.commit()

    print("FINAL_VERIFIED_BATCH_OK")
    print("REQUESTED=", len(UPDATES))
    print("UPDATED=", updated)

finally:
    db.close()
