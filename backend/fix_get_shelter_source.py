from pathlib import Path

p = Path("app/api/shelters.py")
s = p.read_text(encoding="utf-8")

old = """                ia.district_id,
                ia.capacity,
                ia.risk_zone_id,"""

new = """                ia.district_id,
                ia.capacity,
                ia.source,
                ia.risk_zone_id,"""

if old not in s:
    raise SystemExit("TARGET_BLOCK_NOT_FOUND")

s = s.replace(old, new, 1)
p.write_text(s, encoding="utf-8")

print("GET_SHELTER_SOURCE_SELECT_OK")
