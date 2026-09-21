from pathlib import Path

p = Path("app/api/shelters.py")
s = p.read_text(encoding="utf-8")

start = s.index('@router.get("/{shelter_id}")')
end = s.index('@router.put("/{shelter_id}/location")', start)

block = s[start:end]

old = """                ia.district_id,
                ia.capacity,
                ia.risk_zone_id,"""

new = """                ia.district_id,
                ia.capacity,
                ia.source,
                ia.risk_zone_id,"""

if old not in block:
    raise SystemExit("GET_SHELTER_TARGET_NOT_FOUND")

block = block.replace(old, new, 1)
s = s[:start] + block + s[end:]

p.write_text(s, encoding="utf-8")

print("GET_SHELTER_SOURCE_SELECT_FIXED")
