from app.db.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

rows = db.execute(
    text("""
        SELECT
            id,
            asset_code,
            name,
            capacity,
            source,
            CASE WHEN geometry IS NULL THEN 'PENDING' ELSE 'MAPPED' END AS mapping_status
        FROM infrastructure_assets
        WHERE asset_type = 'SHELTER'
        ORDER BY id
    """)
).fetchall()

for r in rows:
    print(
        f"{r.id} | {r.asset_code} | {r.name} | "
        f"capacity={r.capacity} | {r.mapping_status}"
    )

db.close()
