from app.db.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

rows = db.execute(text("""
    SELECT
        column_name,
        data_type,
        is_nullable
    FROM information_schema.columns
    WHERE table_name = 'infrastructure_assets'
    ORDER BY ordinal_position
""")).mappings().all()

for r in rows:
    print(f"{r['column_name']} | {r['data_type']} | nullable={r['is_nullable']}")

db.close()
