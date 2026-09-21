from pathlib import Path

path = Path(r".\app\api\shelters.py")
text = path.read_text(encoding="utf-8")

old = '''        "location_verification": (
            "VERIFIED_GEOMETRY"
            if row.get("geometry_available")
            else "LOCATION_PENDING"
        ),'''

new = '''        "location_verification": (
            "LOCALITY_COORDINATE"
            if "coordinate_basis=LOCALITY_COORDINATE" in (row.get("source") or "")
            else (
                "VERIFIED_GEOMETRY"
                if row.get("geometry_available")
                else "LOCATION_PENDING"
            )
        ),'''

if text.count(old) != 1:
    raise RuntimeError(f"Location verification target count: {text.count(old)}")

text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print("LOCATION_VERIFICATION_STATUS_FIX_OK")
