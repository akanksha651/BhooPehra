from datetime import date
from pathlib import Path
import sys


# Make the backend directory importable when this script
# is executed directly from the scripts directory.
BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


from geoalchemy2.elements import WKTElement
from sqlalchemy import select

from app.core.config import settings
from app.db.database import Base, SessionLocal, engine
from app.models.landslide_event import LandslideEvent


GSI_EVENTS = [
    {
        "source_record_id": "GSI-SK-2021-INDIRA-BYPASS-I",
        "source": "GSI",
        "source_type": "Official GSI landslide incidence report",
        "state": "Sikkim",
        "district": "East District",
        "slide_name": "Indira Bye Pass-I",
        "locality": "Indira Bye Pass Road, Gangtok",
        "occurrence_date": date(2021, 5, 18),
        "latitude": 27.3288888889,
        "longitude": 88.6077777778,
        "landslide_type": "Slide",
        "material_type": "Rock",
        "area_sq_m": 74.31,
        "length_m": 12.19,
        "width_m": 6.096,
        "depth_m": 1.22,
        "source_url": (
            "https://bhusanket.gsi.gov.in/"
            "Output/LS_Incidence_Report/2021/"
            "Landslide%20at%20Indira%20Bye%20Pass%20I%2C%20"
            "Gangtok%2C%20East%20District%2C%20Sikkim%20"
            "%2818th%20May%202021%29.pdf"
        ),
        "verification_status": "GSI_VERIFIED",
    },
    {
        "source_record_id": "GSI-SK-2021-SWASTIK-II",
        "source": "GSI",
        "source_type": "Official GSI landslide incidence report",
        "state": "Sikkim",
        "district": "East District",
        "slide_name": "Swastik-II",
        "locality": "NH-10, Gangtok",
        "occurrence_date": date(2021, 6, 6),
        "latitude": 27.3533333333,
        "longitude": 88.6166666667,
        "landslide_type": None,
        "material_type": "Debris material",
        "area_sq_m": 15.0,
        "length_m": 10.0,
        "width_m": 1.5,
        "depth_m": 0.30,
        "source_url": (
            "https://bhusanket.gsi.gov.in/"
            "Output/LS_Incidence_Report/2021/"
            "Landslide%20at%20Swastik-II%2C%20Gangtok%2C%20"
            "East%20District%2C%20Sikkim%20%286th%20June%202021%29.pdf"
        ),
        "verification_status": "GSI_VERIFIED",
    },
    {
        "source_record_id": "GSI-AR-2020-TIGDO",
        "source": "GSI",
        "source_type": "Official GSI landslide incidence report",
        "state": "Arunachal Pradesh",
        "district": "Papum Pare",
        "slide_name": "Tigdo Slide",
        "locality": "Yupia-Potin Road, about 4 km from Doimukh town",
        "occurrence_date": date(2020, 7, 10),
        "latitude": 27.1346944444,
        "longitude": 93.7434722222,
        "landslide_type": None,
        "material_type": None,
        "area_sq_m": 112.0,
        "length_m": 7.0,
        "width_m": 16.0,
        "depth_m": 2.5,
        "source_url": (
            "https://bhusanket.gsi.gov.in/"
            "Output/LS_Incidence_Report/2020/"
            "Landslide%20at%20Tigdo%20Village%2C%20"
            "Papumpare%20District%2C%20Arunachal%20Pradesh%20"
            "%2810th%20July%2C%202020%29.pdf"
        ),
        "verification_status": "GSI_VERIFIED",
    },
]


def create_point(latitude: float, longitude: float) -> WKTElement:
    """
    Create a PostGIS POINT geometry using WGS84 / EPSG:4326.

    WKT uses longitude first, latitude second:
    POINT(longitude latitude)
    """
    return WKTElement(
        f"POINT({longitude} {latitude})",
        srid=4326,
    )


def main() -> None:
    print("==============================================")
    print("BhooPehra GSI Verified Event Importer")
    print("==============================================")
    print()
    print(f"Database: {settings.database_url}")
    print()

    # Create the table if it does not already exist.
    Base.metadata.create_all(
        bind=engine,
        tables=[LandslideEvent.__table__],
    )

    db = SessionLocal()

    inserted = 0
    skipped = 0

    try:
        for event in GSI_EVENTS:
            existing = db.scalar(
                select(LandslideEvent).where(
                    LandslideEvent.source_record_id
                    == event["source_record_id"]
                )
            )

            if existing is not None:
                skipped += 1

                print(
                    f"SKIP   {event['source_record_id']} "
                    "| already exists"
                )

                continue

            landslide_event = LandslideEvent(
                source_record_id=event["source_record_id"],
                source=event["source"],
                source_type=event["source_type"],
                state=event["state"],
                district=event["district"],
                slide_name=event["slide_name"],
                locality=event["locality"],
                occurrence_date=event["occurrence_date"],
                latitude=event["latitude"],
                longitude=event["longitude"],
                landslide_type=event["landslide_type"],
                material_type=event["material_type"],
                area_sq_m=event["area_sq_m"],
                length_m=event["length_m"],
                width_m=event["width_m"],
                depth_m=event["depth_m"],
                source_url=event["source_url"],
                verification_status=event["verification_status"],
                geometry=create_point(
                    event["latitude"],
                    event["longitude"],
                ),
            )

            db.add(landslide_event)

            print(
                f"INSERT {event['source_record_id']} "
                f"| {event['slide_name']} "
                f"| {event['district']}, {event['state']}"
            )

            inserted += 1

        db.commit()

    except Exception:
        db.rollback()

        print()
        print("==============================================")
        print("IMPORT FAILED")
        print("==============================================")
        print()
        print(
            "The database transaction was rolled back, "
            "so no partial records were saved."
        )
        print()

        raise

    finally:
        db.close()

    print()
    print("==============================================")
    print("Import completed successfully.")
    print("==============================================")
    print(f"Inserted : {inserted}")
    print(f"Skipped  : {skipped}")
    print(f"Total    : {inserted + skipped}")
    print()


if __name__ == "__main__":
    main()