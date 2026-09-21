from app.db.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

rows = db.execute(text("""
    SELECT id, state, name
    FROM districts
    WHERE LOWER(state) IN (
        'arunachal pradesh',
        'assam',
        'manipur',
        'meghalaya',
        'mizoram',
        'nagaland',
        'sikkim',
        'tripura'
    )
    ORDER BY state, name
""")).mappings().all()

for r in rows:
    print(f"{r['id']} | {r['state']} | {r['name']}")

print(f"TOTAL_NER_DISTRICTS={len(rows)}")

db.close()
