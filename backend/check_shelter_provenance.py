from app.db.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

sql = """
SELECT
    id,
    asset_code,
    name,
    capacity,
    source
FROM infrastructure_assets
WHERE UPPER(asset_type) = 'SHELTER'
ORDER BY id
"""

rows = db.execute(text(sql)).all()

print("SHELTER_PROVENANCE_STATE")
for row in rows:
    print(row)

db.close()
