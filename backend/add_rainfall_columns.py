from sqlalchemy import text

from app.db.database import engine


sql = """
ALTER TABLE rainfall_observations
    ADD COLUMN IF NOT EXISTS source_latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS source_longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS source_timezone VARCHAR(60);
"""


with engine.begin() as connection:
    connection.execute(text(sql))


print("Rainfall observation source columns added successfully.")