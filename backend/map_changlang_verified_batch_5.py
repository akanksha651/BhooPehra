from sqlalchemy import text
from app.db.database import SessionLocal

UPDATES = [
    (50, 27.5147, 95.9147, "Gidding locality reference"),
    (49, 27.5024502, 95.9061227, "Goju school location reference"),
    (58, 27.4333, 95.97488, "Balinong locality reference"),
    (53, 27.54746, 96.028745, "Innao locality reference"),
    (57, 27.443537, 96.100599, "Namphai locality reference"),
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

    print("CHANGLANG_VERIFIED_BATCH_5_OK")
    print("REQUESTED=", len(UPDATES))
    print("UPDATED=", updated)

finally:
    db.close()
