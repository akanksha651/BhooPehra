from app.db.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

rows = db.execute(text("""
    SELECT
        id,
        asset_code,
        name,
        district_id,
        capacity,
        source
    FROM infrastructure_assets
    WHERE UPPER(asset_type) = 'SHELTER'
    ORDER BY id
""")).mappings().all()

print(f"EXISTING_SHELTERS={len(rows)}")

for r in rows:
    print(
        f"{r['id']} | {r['asset_code']} | "
        f"{r['district_id']} | {r['name']} | "
        f"capacity={r['capacity']}"
    )

db.close()
