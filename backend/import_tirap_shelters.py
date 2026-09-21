from app.db.database import SessionLocal
from sqlalchemy import text

SOURCE = (
    "Arunachal Pradesh SDMA - Tirap District Disaster Management Plan 2020-21 - "
    "Safe Shelter Places - "
    "https://sdma-arunachal.in/storage/2020/10/DDMP-TIRAP-2020-21.pdf"
)

shelters = [
    ("SH-TRP-001", "Higher Secondary School, Khonsa", 500),
    ("SH-TRP-002", "Govt. Town Sec. School Khonsa", 200),
    ("SH-TRP-003", "Govt. Middle School, Bank Colony", 150),
    ("SH-TRP-004", "Kendra Vidyalaya, Khonsa", 300),
    ("SH-TRP-005", "Don Bosco, Kheti", 300),
    ("SH-TRP-006", "Pinewood Middle School, Khonsa", 150),
    ("SH-TRP-007", "Bo-Peep Middle School, Khonsa", 100),
    ("SH-TRP-008", "Don Bosco Youth Center, Khonsa", 100),
    ("SH-TRP-009", "Arun Jyoti School, Khonsa", 100),
    ("SH-TRP-010", "Circuit House and Community Hall, Khonsa", 300),
    ("SH-TRP-011", "Assam Rifle Ground and Helipad", 500),
    ("SH-TRP-012", "Hr. Sec. School Borduria and Deomali", None),
]

db = SessionLocal()

try:
    district_id = db.execute(
        text("""
            SELECT id
            FROM districts
            WHERE LOWER(name) = LOWER('Tirap')
            LIMIT 1
        """)
    ).scalar_one_or_none()

    if district_id is None:
        raise RuntimeError("Tirap district not found in districts table")

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

    print("TIRAP_SHELTER_IMPORT_OK")
    print(f"DISTRICT_ID={district_id}")
    print(f"INSERTED={inserted}")
    print(f"SKIPPED_EXISTING={skipped}")

finally:
    db.close()
