from app.db.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

rows = db.execute(text("""
    SELECT
        conname,
        pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'infrastructure_assets'::regclass
    ORDER BY conname
""")).mappings().all()

for r in rows:
    print(f"{r['conname']} | {r['definition']}")

db.close()
