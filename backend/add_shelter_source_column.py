from app.db.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

try:
    db.execute(text("""
        ALTER TABLE infrastructure_assets
        ADD COLUMN IF NOT EXISTS source VARCHAR(300)
    """))
    db.commit()
    print("SOURCE_COLUMN_OK")
except Exception as e:
    db.rollback()
    print("SOURCE_COLUMN_FAILED")
    print(type(e).__name__, str(e))
finally:
    db.close()
