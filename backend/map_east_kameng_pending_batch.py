from sqlalchemy import text
from app.db.database import SessionLocal

UPDATES = [
    (90, 27.361012, 93.040095, "Seppa locality reference"),
    (91, 27.093366, 93.057620, "Seijosa locality reference"),
    (92, 27.446404, 93.065897, "Chayang Tajo locality reference"),
    (93, 27.546378, 92.946317, "Bameng locality reference"),
    (94, 27.568170, 92.777359, "Lada locality reference"),
    (95, 27.594126, 93.035858, "Khenewa locality reference"),
    (96, 27.446404, 93.065897, "Sawa locality reference"),
    (97, 27.446404, 93.065897, "Pipu-Dipu locality reference"),
    (101, 27.446404, 93.065897, "Pakke-Kessang locality reference"),
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

    print("EAST_KAMENG_PENDING_BATCH_MAPPING_OK")
    print("REQUESTED=", len(UPDATES))
    print("UPDATED=", updated)

finally:
    db.close()
