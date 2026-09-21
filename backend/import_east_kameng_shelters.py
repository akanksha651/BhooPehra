from sqlalchemy import text
from app.db.database import SessionLocal

SOURCE = "East Kameng Resource Inventory, Government of Arunachal Pradesh / SDMA - https://sdma-arunachal.in/wp-content/uploads/2020/08/Resource-Inventory-East-Kameng.pdf"

shelters = [
    ("SH-EK-001", "Seppa - Govt. Higher Secondary School, JNV, VKV, DIET, DUDA Tourist Lodge, Circuit House, General Ground, Officers Club, Abo Tani Manch", "Capacity: 3000-4000 persons"),
    ("SH-EK-002", "Seijosa - CO Office, Community Hall, Govt. Hr. Sec School, Govt. Middle School, General Ground, VKV School", "Capacity: 1000-1500 persons"),
    ("SH-EK-003", "Chayang Tajo - CO Office, Govt. Sec School, Middle School, General Ground", "Capacity: 1000-1500 persons"),
    ("SH-EK-004", "Bameng - CO Office, Govt. Sec School, Middle School, General Ground", "Capacity: 1000-1500 persons"),
    ("SH-EK-005", "Lada - CO Office, Govt. Sec School, Middle School, General Ground", "Capacity: 1000-1500 persons"),
    ("SH-EK-006", "Khenewa - CO Office, Govt. Sec School, Middle School, General Ground", "Capacity: 1000-1500 persons"),
    ("SH-EK-007", "Sawa - CO Office, Govt. Middle School, General Ground", "Capacity: 1000-1500 persons"),
    ("SH-EK-008", "Pipu-Dipu - CO Office, Govt. Middle School, General Ground", "Capacity: 1000-1500 persons"),
    ("SH-EK-009", "Gyawepurang - Govt. Middle School, General Ground", "Capacity: 1000-1500 persons"),
    ("SH-EK-010", "Richu-Kurung - CO Office, Govt. Sec School, Middle School, General Ground", "Capacity: 1000-1500 persons"),
    ("SH-EK-011", "Pijirang - CO Office, Govt. Sec School, Middle School, General Ground", "Capacity: 1000-1500 persons"),
    ("SH-EK-012", "Pakke-Kessang - CO Office, Govt. Sec School, Middle School, General Ground", "Capacity: 1000-1500 persons"),
    ("SH-EK-013", "Disingpasso - CO Office, Govt. Sec School, Middle School, General Ground", "Capacity: 1000-1500 persons"),
]

db = SessionLocal()

try:
    inserted = 0
    skipped = 0

    for code, name, capacity_note in shelters:
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
                    :code, :name, 'SHELTER', 12,
                    'LOW', 0.11, 'P3', 0,
                    'MONITORING',
                    'Coordinate and capacity verification required before evacuation routing.',
                    NULL, NULL, :source,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """),
            {
                "code": code,
                "name": name,
                "source": SOURCE + " | " + capacity_note
            }
        )
        inserted += 1

    db.commit()

    print("EAST_KAMENG_SHELTER_IMPORT_OK")
    print("DISTRICT_ID=12")
    print("INSERTED=", inserted)
    print("SKIPPED_EXISTING=", skipped)

finally:
    db.close()
