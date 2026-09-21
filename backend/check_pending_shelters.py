from sqlalchemy import text
from app.db.database import SessionLocal

db = SessionLocal()

try:
    rows = db.execute(
        text("""
            SELECT d.name, COUNT(*)
            FROM infrastructure_assets ia
            JOIN districts d ON d.id = ia.district_id
            WHERE ia.asset_type = 'SHELTER'
              AND ia.geometry IS NULL
            GROUP BY d.name
            ORDER BY d.name
        """)
    ).all()

    print("PENDING_SHELTERS_BY_DISTRICT")
    for name, count in rows:
        print(f"{name}: {count}")

finally:
    db.close()
