from app.db.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

sql = """
SELECT
    id,
    asset_code,
    name,
    district_id,
    capacity,
    CASE
        WHEN geometry IS NULL THEN 'PENDING'
        ELSE 'MAPPED'
    END AS location_status
FROM infrastructure_assets
WHERE UPPER(asset_type) = 'SHELTER'
ORDER BY id
"""

rows = db.execute(text(sql)).all()

print("CURRENT_SHELTERS")
for row in rows:
    print(row)

print("TOTAL", len(rows))

db.close()
