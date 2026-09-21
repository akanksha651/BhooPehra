from app.db.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

try:
    rows = db.execute(
        text("""
            SELECT
                id,
                source_record_id,
                state,
                district,
                slide_name,
                occurrence_date,
                ST_AsText(geometry) AS geom
            FROM landslide_events
            WHERE source = 'GSI'
            ORDER BY id DESC
            LIMIT 25
        """)
    ).mappings().all()

    print(f"GSI records found: {len(rows)}")
    print()

    for row in rows:
        print(
            f"{row['id']} | "
            f"{row['source_record_id']} | "
            f"{row['state']} | "
            f"{row['district']} | "
            f"{row['occurrence_date']} | "
            f"{row['geom']} | "
            f"{row['slide_name']}"
        )

finally:
    db.close()