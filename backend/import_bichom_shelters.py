from sqlalchemy import text
from app.db.database import SessionLocal

SOURCE = "Bichom DDMP 2025-26, Government of Arunachal Pradesh / SDMA - https://sdma-arunachal.in/wp-content/uploads/2026/03/DDMP-BICHOM-2025-26.pdf"

shelters = [
    ("SH-BCH-001", "Community Hall, Nafra"),
    ("SH-BCH-002", "Shungji Ground, Nafra"),
    ("SH-BCH-003", "Govt. Hr. Sec. School, Nafra"),
    ("SH-BCH-004", "Community Hall, Khazalang"),
    ("SH-BCH-005", "Govt. Middle School, Khazalang"),
    ("SH-BCH-006", "Community Hall, Dibbin"),
    ("SH-BCH-007", "Govt. Schools, Bana"),
    ("SH-BCH-008", "Govt. Schools, Lada (Nedo)"),
]

db = SessionLocal()

try:
    inserted = 0
    skipped = 0

    for code, name in shelters:
        exists = db.execute(
            text("SELECT 1 FROM infrastructure_assets WHERE asset_code = :code"),
            {"code": code}
        ).first()

        if exists:
            skipped += 1
            continue

        db.execute(
            text("""
                INSERT INTO infrastructure_assets
                (
                    asset_code, name, asset_type, district_id,
                    risk_level, probability, priority, exposure_count,
                    status, recommendation, geometry, capacity, source,
                    created_at, updated_at
                )
                VALUES
                (
                    :code, :name, 'SHELTER', 10,
                    'LOW', 0.11, 'P3', 0,
                    'MONITORING',
                    'Coordinate and capacity verification required before evacuation routing.',
                    NULL, NULL, :source,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """),
            {"code": code, "name": name, "source": SOURCE}
        )
        inserted += 1

    db.commit()

    print("BICHOM_SHELTER_IMPORT_OK")
    print("DISTRICT_ID=10")
    print("INSERTED=", inserted)
    print("SKIPPED_EXISTING=", skipped)

finally:
    db.close()
