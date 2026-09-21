from app.db.database import SessionLocal
from sqlalchemy import text

SOURCE = (
    "Arunachal Pradesh SDMA - District: Anjaw - Resource Inventory - "
    "List Of Temporary Shelters - "
    "https://sdma-arunachal.in/wp-content/uploads/2020/08/Resource-Inventory-Anjaw.pdf"
)

shelters = [
    ("SH-ANJ-001", "Multipurpose Building - Hayuliang (Upper Flat)", 500),
    ("SH-ANJ-002", "Multipurpose Building - Hawai (Urban Area)", 500),
    ("SH-ANJ-003", "Community Hall - Kibithoo/Walong/Manchal/Goiliang/Metengliang/Chaglagam", 100),
]

db = SessionLocal()

try:
    inserted = 0
    skipped = 0

    for asset_code, name, capacity in shelters:
        exists = db.execute(
            text("""
                SELECT id
                FROM infrastructure_assets
                WHERE asset_code = :asset_code
            """),
            {"asset_code": asset_code},
        ).scalar_one_or_none()

        if exists is not None:
            skipped += 1
            continue

        db.execute(
            text("""
                INSERT INTO infrastructure_assets (
                    asset_code,
                    name,
                    asset_type,
                    district_id,
                    risk_zone_id,
                    risk_level,
                    probability,
                    priority,
                    exposure_count,
                    status,
                    recommendation,
                    geometry,
                    created_at,
                    updated_at,
                    capacity,
                    source
                )
                VALUES (
                    :asset_code,
                    :name,
                    'SHELTER',
                    9,
                    NULL,
                    'LOW',
                    0.11,
                    'P3',
                    0,
                    'MONITORING',
                    'Coordinate verification required before evacuation routing.',
                    NULL,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP,
                    :capacity,
                    :source
                )
            """),
            {
                "asset_code": asset_code,
                "name": name,
                "capacity": capacity,
                "source": SOURCE,
            },
        )
        inserted += 1

    db.commit()

    print(f"ANJAW_SHELTER_IMPORT_OK")
    print(f"INSERTED={inserted}")
    print(f"SKIPPED_EXISTING={skipped}")

finally:
    db.close()
