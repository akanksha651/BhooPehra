from app.db.database import SessionLocal
from sqlalchemy import text

SOURCE = (
    "Arunachal Pradesh SDMA - Changlang District Disaster Management Plan 2020-21 - "
    "Identified Safe Shelter - "
    "https://sdma-arunachal.in/wp-content/uploads/2020/10/DDMP-CHANGLANG-2020.pdf"
)

shelters = [
    # Changlang HQ
    ("SH-CHG-001", "Changlang Officers' Club"),
    ("SH-CHG-002", "Women & Children Club, Changlang"),
    ("SH-CHG-003", "Changlang Old Club"),
    ("SH-CHG-004", "Circuit House, Changlang"),
    ("SH-CHG-005", "Multi-Cultural Club near GHSS, Changlang"),
    ("SH-CHG-006", "DIET Auditorium, Changlang"),
    ("SH-CHG-007", "School Building of GHSS, Changlang"),
    ("SH-CHG-008", "Govt Middle School Nadipar"),

    # Bordumsa HQ
    ("SH-CHG-009", "Govt Hr Sec School, Bordumsa"),
    ("SH-CHG-010", "Inspection Bunglow, Bordumsa"),
    ("SH-CHG-011", "Goju Middle School"),
    ("SH-CHG-012", "Gidding Sec School"),

    # Diyun Circle
    ("SH-CHG-013", "Sompoi Sec School"),
    ("SH-CHG-014", "Diyun Sec School"),
    ("SH-CHG-015", "Govt Hr Sec School, Innao"),
    ("SH-CHG-016", "IB, Diyun"),

    # Miao
    ("SH-CHG-017", "Govt Hr Sec, Miao"),
    ("SH-CHG-018", "Circuit House, Miao"),
    ("SH-CHG-019", "Namphai Middle School"),
    ("SH-CHG-020", "Balinong Middle School"),
    ("SH-CHG-021", "Sonking Middle School"),
    ("SH-CHG-022", "Upper Miao, Middle School"),
    ("SH-CHG-023", "Phup Middle School"),

    # Kharsang
    ("SH-CHG-024", "Magantong Middle School"),
    ("SH-CHG-025", "Kuttum Middle School"),
    ("SH-CHG-026", "Kharsang Hr Sec School"),

    # Vijaynagar
    ("SH-CHG-027", "Vijaynagar Sec School"),
    ("SH-CHG-028", "IB, Vijaynagar"),

    # Manmao
    ("SH-CHG-029", "Manmao Sec School"),
    ("SH-CHG-030", "IB, Manmao"),
    ("SH-CHG-031", "Manmao Club"),
    ("SH-CHG-032", "Renuk Middle School"),
    ("SH-CHG-033", "Tengmo Middle School"),

    # Nampong
    ("SH-CHG-034", "Nampong Hr Sec School"),
    ("SH-CHG-035", "Lungpang Middle School"),
    ("SH-CHG-036", "IB, Nampong"),

    # Jairampur
    ("SH-CHG-037", "Jairampur Hr Sec School"),
    ("SH-CHG-038", "IB, Jairampur"),
    ("SH-CHG-039", "Jairampur Club"),

    # Namtok
    ("SH-CHG-040", "Namtok Sec School"),

    # Kimyang / Khimyang
    ("SH-CHG-041", "Yangkang Sec School"),
    ("SH-CHG-042", "Khimyang Sec School"),
    ("SH-CHG-043", "IB, Khimyang"),
]

db = SessionLocal()

try:
    district_id = db.execute(
        text("""
            SELECT id
            FROM districts
            WHERE LOWER(name) = LOWER('Changlang')
            LIMIT 1
        """)
    ).scalar_one_or_none()

    if district_id is None:
        raise RuntimeError("Changlang district not found in districts table")

    inserted = 0
    skipped = 0

    for asset_code, name in shelters:
        exists = db.execute(
            text("""
                SELECT id
                FROM infrastructure_assets
                WHERE asset_code = :asset_code
            """),
            {"asset_code": asset_code},
        ).scalar_one_or_none()

        if exists is not None:
            skipped += 1
            continue

        db.execute(
            text("""
                INSERT INTO infrastructure_assets (
                    asset_code,
                    name,
                    asset_type,
                    district_id,
                    risk_zone_id,
                    risk_level,
                    probability,
                    priority,
                    exposure_count,
                    status,
                    recommendation,
                    geometry,
                    created_at,
                    updated_at,
                    capacity,
                    source
                )
                VALUES (
                    :asset_code,
                    :name,
                    'SHELTER',
                    :district_id,
                    NULL,
                    'LOW',
                    0.11,
                    'P3',
                    0,
                    'MONITORING',
                    'Coordinate and capacity verification required before evacuation routing.',
                    NULL,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP,
                    NULL,
                    :source
                )
            """),
            {
                "asset_code": asset_code,
                "name": name,
                "district_id": district_id,
                "source": SOURCE,
            },
        )

        inserted += 1

    db.commit()

    print("CHANGLANG_SHELTER_IMPORT_OK")
    print(f"DISTRICT_ID={district_id}")
    print(f"INSERTED={inserted}")
    print(f"SKIPPED_EXISTING={skipped}")

finally:
    db.close()
