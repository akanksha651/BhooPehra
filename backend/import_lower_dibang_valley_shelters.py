from app.db.database import SessionLocal
from sqlalchemy import text

SOURCE = (
    "Arunachal Pradesh SDMA - Lower Dibang Valley DDMP 2020-21 - "
    "District Disaster Management Plan - "
    "https://sdma-arunachal.in/storage/2020/10/DDMP-LOWER-DIBANG-VALLEY-2020.pdf"
)

shelters = [
    ("SH-LDV-001", "Auditorium - Govt. HSS Roing", 500),
    ("SH-LDV-002", "Sports Club - Near HS School", 600),
    ("SH-LDV-003", "Open Ground - VKV School", 1000),
    ("SH-LDV-004", "Multipurpose Building - Roing", 1000),
]

db = SessionLocal()

try:
    district_id = db.execute(
        text("""
            SELECT id
            FROM districts
            WHERE LOWER(name) = LOWER('Lower Dibang Valley')
            LIMIT 1
        """)
    ).scalar_one_or_none()

    if district_id is None:
        raise RuntimeError("Lower Dibang Valley district not found in districts table")

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
                    :district_id,
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
                "district_id": district_id,
                "capacity": capacity,
                "source": SOURCE,
            },
        )
        inserted += 1

    db.commit()

    print("LOWER_DIBANG_VALLEY_SHELTER_IMPORT_OK")
    print(f"DISTRICT_ID={district_id}")
    print(f"INSERTED={inserted}")
    print(f"SKIPPED_EXISTING={skipped}")

finally:
    db.close()
