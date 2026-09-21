from app.db.database import SessionLocal
from sqlalchemy import text
import csv

db = SessionLocal()

sql = """
SELECT
    id,
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
    ST_AsText(geometry) AS geometry_text,
    capacity,
    created_at,
    updated_at
FROM infrastructure_assets
WHERE UPPER(asset_type) = 'SHELTER'
ORDER BY id
"""

rows = db.execute(text(sql)).mappings().all()

with open("shelter_backup_before_import.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys() if rows else ["id"])
    writer.writeheader()
    writer.writerows(rows)

db.close()

print("SHELTER_BACKUP_OK")
print("ROWS", len(rows))
print("FILE", "shelter_backup_before_import.csv")
