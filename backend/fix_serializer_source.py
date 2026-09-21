from pathlib import Path

path = Path(r".\app\api\shelters.py")
text = path.read_text(encoding="utf-8")

old = '''        "capacity": (
            int(row["capacity"])
            if row["capacity"] is not None
            else None
        ),
        "risk_zone_id": ('''

new = '''        "capacity": (
            int(row["capacity"])
            if row["capacity"] is not None
            else None
        ),
        "source": row["source"],
        "risk_zone_id": ('''

if text.count(old) != 1:
    raise RuntimeError(f"Serializer target count: {text.count(old)}")

text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print("SERIALIZER_SOURCE_EDIT_OK")
