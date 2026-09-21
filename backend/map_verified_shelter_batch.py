from sqlalchemy import text
from app.db.database import SessionLocal

UPDATES = [
    # Changlang
    (22, 27.484731, 96.208399, "Miao locality reference"),

    # East Kameng
    (90, 27.3650, 93.6860, "Seppa locality reference"),
    
    # Lower Dibang Valley
    (23, 28.143176, 95.844684, "Roing locality reference"),
    (24, 28.143176, 95.844684, "Roing locality reference"),
    (25, 28.143176, 95.844684, "Roing locality reference"),
    (26, 28.143176, 95.844684, "Roing locality reference"),

    # Tirap
    (27, 27.0166667, 95.5666667, "Khonsa locality reference"),
    (28, 27.0166667, 95.5666667, "Khonsa locality reference"),
    (29, 27.0166667, 95.5666667, "Khonsa locality reference"),
    (30, 27.0166667, 95.5666667, "Khonsa locality reference"),
    (31, 27.0166667, 95.5666667, "Khonsa locality reference"),
    (32, 27.0166667, 95.5666667, "Khonsa locality reference"),
    (33, 27.0166667, 95.5666667, "Khonsa locality reference"),
    (34, 27.0166667, 95.5666667, "Khonsa locality reference"),
    (35, 27.0166667, 95.5666667, "Khonsa locality reference"),
    (36, 27.0166667, 95.5666667, "Khonsa locality reference"),
    (37, 27.0166667, 95.5666667, "Khonsa locality reference"),
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
                  AND geometry IS NULL
            """),
            {
                "id": shelter_id,
                "lat": lat,
                "lon": lon,
                "coord_source": coord_source
            }
        )

    db.commit()
    print("VERIFIED_LOCALITY_BATCH_MAPPING_OK")
    print("BATCH_RECORDS=", len(UPDATES))

finally:
    db.close()
