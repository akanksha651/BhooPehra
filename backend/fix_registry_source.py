from pathlib import Path

path = Path(r".\app\api\shelters.py")
text = path.read_text(encoding="utf-8")

old = """                ia.name,
                ia.district_id,
                ia.capacity,
                ia.risk_zone_id,
                rz.risk_level,"""

new = """                ia.name,
                ia.district_id,
                ia.capacity,
                ia.source,
                ia.risk_zone_id,
                rz.risk_level,"""

if text.count(old) < 1:
    raise RuntimeError("Registry SELECT block not found")

text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print("REGISTRY_SOURCE_EDIT_OK")
