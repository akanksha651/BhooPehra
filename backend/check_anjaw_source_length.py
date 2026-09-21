from sqlalchemy import text
from app.db.database import SessionLocal

db = SessionLocal()

try:
    rows = db.execute(
        text("""
            SELECT id, asset_code, length(source), source
            FROM infrastructure_assets
            WHERE id IN (20, 21)
            ORDER BY id
        """)
    ).all()

    for row in rows:
        print(row)

finally:
    db.close()
