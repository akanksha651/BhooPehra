from pathlib import Path

path = Path(r".\app\api\shelters.py")
text = path.read_text(encoding="utf-8")

old_serializer = '''        "capacity": (
            int(row["capacity"])
            if row["capacity"] is not None
            else None
        ),
        "risk_zone_id": ('''

new_serializer = '''        "capacity": (
            int(row["capacity"])
            if row["capacity"] is not None
            else None
        ),
        "source": row["source"],
        "risk_zone_id": ('''

old_sql = '''                ia.capacity,
                ia.risk_zone_id,
                rz.risk_level,'''

new_sql = '''                ia.capacity,
                ia.source,
                ia.risk_zone_id,
                rz.risk_level,'''

if text.count(old_serializer) != 1:
    raise RuntimeError(
        f"Serializer target count unexpected: {text.count(old_serializer)}"
    )

if text.count(old_sql) != 1:
    raise RuntimeError(
        f"Registry SQL target count unexpected: {text.count(old_sql)}"
    )

text = text.replace(old_serializer, new_serializer, 1)
text = text.replace(old_sql, new_sql, 1)

path.write_text(text, encoding="utf-8")

print("SHELTER_API_SOURCE_EDIT_OK")
print("FILE", path)
print("CHANGES", 2)
