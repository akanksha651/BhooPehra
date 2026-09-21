from sqlalchemy import text
from app.db.database import SessionLocal

db = SessionLocal()

try:
    rows = db.execute(
        text("""
            SELECT id, asset_code, name, source
            FROM infrastructure_assets
            WHERE asset_type = 'SHELTER'
              AND district_id = 11
              AND geometry IS NULL
            ORDER BY id
        """)
    ).mappings().all()

    print("CHANGLANG_PENDING_SHELTERS")
    print("COUNT=", len(rows))

    for r in rows:
        print(dict(r))

finally:
    db.close()
