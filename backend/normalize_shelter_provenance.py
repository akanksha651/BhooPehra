from app.db.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

source = "East Siang DDMA, Arunachal Pradesh - District Disaster Management Plan / Shelter's Identified for Search & Rescue Team - https://sdma-arunachal.in/east-siang-ddma/"

sql = """
UPDATE infrastructure_assets
SET source = :source
WHERE UPPER(asset_type) = 'SHELTER'
  AND asset_code IN (
      'SH-ES-001',
      'SH-ES-002',
      'SH-ES-003',
      'SH-ES-004',
      'SH-ES-005',
      'SH-ES-006',
      'SH-ES-007',
      'SH-ES-008'
  )
"""

result = db.execute(text(sql), {"source": source})
db.commit()

print("PROVENANCE_NORMALIZED")
print("UPDATED_ROWS", result.rowcount)

db.close()
