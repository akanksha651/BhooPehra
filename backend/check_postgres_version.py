from app.db.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

row = db.execute(text("SELECT version()")).one()

print("POSTGRESQL_VERSION")
print(row[0])

db.close()
