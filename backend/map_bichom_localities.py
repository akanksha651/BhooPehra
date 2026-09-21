from sqlalchemy import text
from app.db.database import SessionLocal

UPDATES = [
    (82, 27.3723294, 92.5457904, "Nafra locality reference"),
    (83, 27.3723294, 92.5457904, "Nafra locality reference"),
    (84, 27.3723294, 92.5457904, "Nafra locality reference"),
    (87, 27.43930, 92.50880, "TRAI habitation coordinate - Dibbin"),
    (88, 27.28972, 92.84028, "Bana locality reference - ZSI"),
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

    print("BICHOM_LOCALITY_MAPPING_OK")
    print("MAPPED=5")
    print("REMAINING_BICHOM_PENDING=3")

finally:
    db.close()
