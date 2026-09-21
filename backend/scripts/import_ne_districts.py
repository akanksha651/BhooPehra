from __future__ import annotations

import csv
import io
import re
import tempfile
import warnings
from pathlib import Path

import py7zr
import requests
from sqlalchemy import create_engine, text

from app.core.config import settings


GITHUB_RELEASE_API = (
    "https://api.github.com/repos/"
    "ramSeraph/opendata/releases/tags/"
    "lgd-latest-extra1"
)

NORTHEAST_STATES = {
    "ARUNACHAL PRADESH": "AR",
    "ASSAM": "AS",
    "MANIPUR": "MN",
    "MEGHALAYA": "ML",
    "MIZORAM": "MZ",
    "NAGALAND": "NL",
    "SIKKIM": "SK",
    "TRIPURA": "TR",
}


def normalize(value: object) -> str:
    if value is None:
        return ""

    return " ".join(
        str(value)
        .strip()
        .upper()
        .split()
    )


def display_name(value: str) -> str:
    value = value.strip()

    if value.isupper():
        return value.title()

    return value


def create_http_session() -> requests.Session:
    session = requests.Session()

    session.headers.update(
        {
            "User-Agent": (
                "BhooPehra/0.1 "
                "(landslide-risk-research-platform)"
            ),
            "Accept": "application/json",
        }
    )

    return session


def get_release(
    session: requests.Session,
) -> dict:
    print("Reading current LGD dump metadata...")

    response = session.get(
        GITHUB_RELEASE_API,
        timeout=60,
        verify=False,
    )

    response.raise_for_status()

    payload = response.json()

    if not payload.get("assets"):
        raise RuntimeError(
            "The LGD current-month release contains no assets."
        )

    return payload


def find_district_asset(
    release: dict,
) -> dict:
    assets = release.get(
        "assets",
        [],
    )

    candidates = []

    for asset in assets:
        name = asset.get(
            "name",
            "",
        )

        lower_name = name.lower()

        if (
            "district" in lower_name
            and lower_name.endswith(
                ".csv.7z"
            )
        ):
            candidates.append(asset)

    if not candidates:
        raise RuntimeError(
            "Could not find a district CSV archive "
            "inside the current LGD release."
        )

    def extract_date(
        name: str,
    ) -> str:
        match = re.search(
            r"(\d{2}[A-Za-z]{3}\d{4})",
            name,
        )

        if match:
            return match.group(1)

        return ""

    candidates.sort(
        key=lambda asset: extract_date(
            asset.get("name", "")
        )
    )

    selected = candidates[-1]

    print(
        "Selected LGD district archive:"
    )
    print(
        f"  {selected['name']}"
    )

    return selected


def download_asset(
    session: requests.Session,
    asset: dict,
    destination: Path,
) -> None:
    print()
    print(
        "Downloading current LGD district data..."
    )

    url = asset.get(
        "browser_download_url"
    )

    if not url:
        raise RuntimeError(
            "Selected LGD asset does not contain "
            "a browser download URL."
        )

    response = session.get(
        url,
        timeout=120,
        verify=False,
        stream=True,
    )

    response.raise_for_status()

    with destination.open(
        "wb"
    ) as output:
        for chunk in response.iter_content(
            chunk_size=1024 * 1024
        ):
            if chunk:
                output.write(chunk)

    print(
        f"Downloaded: {destination.name}"
    )


def extract_archive(
    archive_path: Path,
    extract_dir: Path,
) -> list[Path]:
    print()
    print(
        "Extracting LGD district archive..."
    )

    with py7zr.SevenZipFile(
        archive_path,
        mode="r",
    ) as archive:
        archive.extractall(
            path=extract_dir
        )

    csv_files = list(
        extract_dir.rglob("*.csv")
    )

    if not csv_files:
        raise RuntimeError(
            "LGD archive was downloaded successfully "
            "but no CSV file was found inside it."
        )

    print(
        f"CSV files extracted: {len(csv_files)}"
    )

    for csv_file in csv_files:
        print(
            f"  {csv_file.name}"
        )

    return csv_files


def read_district_csv(
    csv_path: Path,
) -> list[dict[str, str]]:
    print()
    print(
        f"Reading district CSV: {csv_path.name}"
    )

    raw = csv_path.read_bytes()

    text_content = None

    encodings = [
        "utf-8-sig",
        "utf-8",
        "cp1252",
        "latin-1",
    ]

    for encoding in encodings:
        try:
            text_content = raw.decode(
                encoding
            )
            break
        except UnicodeDecodeError:
            continue

    if text_content is None:
        raise RuntimeError(
            "Could not decode the LGD district CSV."
        )

    sample = text_content[:10000]

    try:
        dialect = csv.Sniffer().sniff(
            sample,
            delimiters=",;\t|",
        )
    except csv.Error:
        dialect = csv.excel

    reader = csv.DictReader(
        io.StringIO(text_content),
        dialect=dialect,
    )

    if not reader.fieldnames:
        raise RuntimeError(
            "LGD district CSV has no header."
        )

    fieldnames = [
        field.strip()
        if field
        else ""
        for field in reader.fieldnames
    ]

    print(
        "Detected columns:"
    )

    for field in fieldnames:
        print(
            f"  {field}"
        )

    state_field = find_field(
        fieldnames,
        [
            "State Name",
            "State Name (In English)",
            "stateNameEnglish",
            "State",
        ],
    )

    district_field = find_field(
        fieldnames,
        [
            "District Name",
            "District Name (In English)",
            "districtNameEnglish",
            "District",
        ],
    )

    district_code_field = find_field(
        fieldnames,
        [
            "District Code",
            "districtCode",
            "District LGD Code",
        ],
    )

    if not state_field:
        raise RuntimeError(
            "Could not identify the state-name column "
            "in the LGD district CSV."
        )

    if not district_field:
        raise RuntimeError(
            "Could not identify the district-name column "
            "in the LGD district CSV."
        )

    rows: list[dict[str, str]] = []

    for row in reader:
        state_raw = (
            row.get(
                state_field,
                ""
            )
            or ""
        )

        district_raw = (
            row.get(
                district_field,
                ""
            )
            or ""
        )

        state = normalize(
            state_raw
        )

        district = normalize(
            district_raw
        )

        if state not in NORTHEAST_STATES:
            continue

        if not district:
            continue

        code = ""

        if district_code_field:
            code = (
                row.get(
                    district_code_field,
                    ""
                )
                or ""
            ).strip()

        if not code:
            code = (
                f"{NORTHEAST_STATES[state]}-"
                f"{district.replace(' ', '-')}"
            )[:50]

        rows.append(
            {
                "state": display_name(
                    state
                ),
                "name": display_name(
                    district
                ),
                "code": code,
            }
        )

    unique: dict[
        tuple[str, str],
        dict[str, str],
    ] = {}

    for row in rows:
        key = (
            normalize(row["state"]),
            normalize(row["name"]),
        )

        unique[key] = row

    result = list(
        unique.values()
    )

    result.sort(
        key=lambda row: (
            normalize(row["state"]),
            normalize(row["name"]),
        )
    )

    return result


def find_field(
    fieldnames: list[str],
    candidates: list[str],
) -> str | None:
    normalized = {
        normalize(field): field
        for field in fieldnames
    }

    for candidate in candidates:
        field = normalized.get(
            normalize(candidate)
        )

        if field:
            return field

    for field in fieldnames:
        normalized_field = normalize(
            field
        )

        for candidate in candidates:
            normalized_candidate = normalize(
                candidate
            )

            if (
                normalized_candidate
                in normalized_field
            ):
                return field

    return None


def upsert_districts(
    districts: list[dict[str, str]],
) -> tuple[int, int, dict[str, int]]:
    engine = create_engine(
        settings.database_url,
        future=True,
    )

    inserted = 0
    updated = 0

    state_counts: dict[str, int] = {}

    with engine.begin() as connection:
        for district in districts:
            name = district["name"]
            state = district["state"]
            code = district["code"]

            existing = connection.execute(
                text(
                    """
                    SELECT id
                    FROM districts
                    WHERE LOWER(name) = LOWER(:name)
                      AND LOWER(state) = LOWER(:state)
                    LIMIT 1
                    """
                ),
                {
                    "name": name,
                    "state": state,
                },
            ).mappings().first()

            if existing:
                connection.execute(
                    text(
                        """
                        UPDATE districts
                        SET
                            name = :name,
                            state = :state,
                            code = :code
                        WHERE id = :id
                        """
                    ),
                    {
                        "id": existing["id"],
                        "name": name,
                        "state": state,
                        "code": code,
                    },
                )

                updated += 1

            else:
                connection.execute(
                    text(
                        """
                        INSERT INTO districts (
                            name,
                            state,
                            code
                        )
                        VALUES (
                            :name,
                            :state,
                            :code
                        )
                        """
                    ),
                    {
                        "name": name,
                        "state": state,
                        "code": code,
                    },
                )

                inserted += 1

            state_counts[state] = (
                state_counts.get(
                    state,
                    0,
                )
                + 1
            )

    engine.dispose()

    return (
        inserted,
        updated,
        state_counts,
    )


def main() -> None:
    print()
    print("=" * 60)
    print("BhooPehra Northeast District Importer")
    print("=" * 60)
    print()

    print(
        "Source:"
        " Current-month LGD district dump"
    )

    print(
        "Region:"
        " Arunachal Pradesh, Assam, Manipur,"
        " Meghalaya, Mizoram, Nagaland, Sikkim, Tripura"
    )

    print()

    warnings.filterwarnings(
        "ignore",
        message="Unverified HTTPS request",
    )

    session = create_http_session()

    release = get_release(
        session
    )

    print(
        f"Release: {release.get('tag_name')}"
    )

    print(
        f"Published: {release.get('published_at')}"
    )

    asset = find_district_asset(
        release
    )

    with tempfile.TemporaryDirectory(
        prefix="bhoopehra_lgd_"
    ) as temp_dir:
        temp_path = Path(
            temp_dir
        )

        archive_path = (
            temp_path
            / asset["name"]
        )

        download_asset(
            session,
            asset,
            archive_path,
        )

        extract_dir = (
            temp_path
            / "extracted"
        )

        extract_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        csv_files = extract_archive(
            archive_path,
            extract_dir,
        )

        district_csv = None

        for csv_file in csv_files:
            if "district" in csv_file.name.lower():
                district_csv = csv_file
                break

        if district_csv is None:
            district_csv = csv_files[0]

        districts = read_district_csv(
            district_csv
        )

    print()
    print(
        f"Northeast districts found: "
        f"{len(districts)}"
    )

    if not districts:
        raise RuntimeError(
            "No Northeast districts were found "
            "in the current LGD dataset."
        )

    print()
    print(
        "Districts to be imported:"
    )

    for district in districts:
        print(
            f"  {district['state']}"
            f"  |  {district['name']}"
            f"  |  LGD {district['code']}"
        )

    inserted, updated, state_counts = (
        upsert_districts(
            districts
        )
    )

    print()
    print("-" * 60)
    print("Import completed successfully")
    print("-" * 60)

    print(
        f"Inserted : {inserted}"
    )

    print(
        f"Updated  : {updated}"
    )

    print()
    print(
        "Northeast coverage:"
    )

    for state in sorted(
        state_counts
    ):
        print(
            f"  {state:<25}"
            f"{state_counts[state]:>3}"
        )

    print()
    print(
        "Total Northeast districts:"
        f" {sum(state_counts.values())}"
    )

    print()
    print("=" * 60)


if __name__ == "__main__":
    main()