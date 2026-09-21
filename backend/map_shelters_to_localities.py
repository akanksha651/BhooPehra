from app.db.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

updates = {
    13: (28.068141, 95.334846, "Pasighat locality coordinate"),
    14: (28.068141, 95.334846, "Pasighat locality coordinate"),
    15: (27.849900, 95.218100, "Ruksin locality coordinate"),
    16: (27.946000, 95.183700, "Bilat locality coordinate"),
    17: (27.915087, 95.304039, "Sille locality coordinate"),
    18: (28.041000, 95.435897, "Kiyit locality-area coordinate from East Siang WRD record"),
    19: (28.062325, 95.478786, "Ngopok locality coordinate"),
}

base_source = (
    "East Siang DDMA, Arunachal Pradesh - "
    "District Disaster Management Plan / Shelter's Identified for "
    "Search & Rescue Team - https://sdma-arunachal.in/east-siang-ddma/"
)

for shelter_id, (lat, lon, basis) in updates.items():
    source = f"{base_source} | coordinate_basis=LOCALITY_COORDINATE | coordinate_source={basis}"

    db.execute(
        text("""
            UPDATE infrastructure_assets
            SET
                geometry = ST_SetSRID(
                    ST_MakePoint(:longitude, :latitude),
                    4326
                ),
                source = :source,
                updated_at = NOW()
            WHERE id = :shelter_id
              AND UPPER(asset_type) = 'SHELTER'
        """),
        {
            "shelter_id": shelter_id,
            "latitude": lat,
            "longitude": lon,
            "source": source,
        },
    )

db.commit()

rows = db.execute(
    text("""
        SELECT
            id,
            asset_code,
            name,
            ST_Y(geometry) AS latitude,
            ST_X(geometry) AS longitude,
            source
        FROM infrastructure_assets
        WHERE UPPER(asset_type) = 'SHELTER'
        ORDER BY id
    """)
).fetchall()

print("SHELTER_LOCALITY_MAPPING_OK")
for r in rows:
    print(
        f"{r.id} | {r.asset_code} | {r.name} | "
        f"{r.latitude}, {r.longitude}"
    )

db.close()
