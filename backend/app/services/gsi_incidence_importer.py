from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import requests
from geoalchemy2 import WKTElement
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.landslide_event import LandslideEvent


GSI_INCIDENCE_URL = (
    "https://bhusanket.gsi.gov.in/WebAPI_v2/LandslideIncidence/datalist"
)

GSI_PORTAL_URL = "https://bhusanket.gsi.gov.in/"

NORTHEAST_STATES = {
    "arunachal pradesh",
    "assam",
    "manipur",
    "meghalaya",
    "mizoram",
    "nagaland",
    "sikkim",
    "tripura",
}


# Only clear security-probe / injection / placeholder patterns.
# Do NOT reject ordinary words such as "select".
REJECT_PATTERNS = [
    "waitfor",
    "pg_sleep",
    "dbms_pipe",
    "sleep(",
    "union select",
    "drop table",
    "insert into",
    "delete from",
    "update ",
    "../",
    "..\\",
    "/etc/passwd",
    "windows/win.ini",
    "file:///etc/",
    "<script",
    "javascript:",
    "defaultstringvalue",
    "default string value",
    " or 1=1",
    "' or ",
    '" or ',
]


MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}


MONTH_ALIASES = {
    "jan": "january",
    "feb": "february",
    "mar": "march",
    "apr": "april",
    "jun": "june",
    "jul": "july",
    "aug": "august",
    "sep": "september",
    "sept": "september",
    "oct": "october",
    "nov": "november",
    "dec": "december",
}


ASSESSMENT_TERMS = [
    "assessment of landslide prone areas",
    "landslide prone areas",
    "landslide susceptibility assessment",
    "susceptibility assessment",
    "hazard assessment",
    "vulnerability assessment",
    "landslide hazard mapping",
    "susceptibility mapping",
    "prone area assessment",
]


LANDSLIDE_TERMS = [
    "landslide",
    "land slide",
    "debris slide",
    "rock fall",
    "rockfall",
    "debris flow",
    "slope failure",
    "mudslide",
]


COORDINATE_KEYS_LAT = [
    "latitude",
    "lat",
    "u_lat",
]


COORDINATE_KEYS_LON = [
    "longitude",
    "lon",
    "long",
    "u_long",
]


def clean_text(value: Any) -> str | None:
    if value is None:
        return None

    text = str(value).strip()

    if not text:
        return None

    return text


def normalize_state(value: Any) -> str | None:
    text = clean_text(value)

    if not text:
        return None

    normalized = re.sub(r"\s+", " ", text).strip().lower()

    aliases = {
        "arunachal pradesh": "Arunachal Pradesh",
        "assam": "Assam",
        "manipur": "Manipur",
        "meghalaya": "Meghalaya",
        "mizoram": "Mizoram",
        "nagaland": "Nagaland",
        "sikkim": "Sikkim",
        "tripura": "Tripura",
    }

    return aliases.get(normalized)


def normalize_district(value: Any) -> str | None:
    text = clean_text(value)

    if not text:
        return None

    text = re.sub(r"\s+", " ", text).strip()

    # Known cosmetic spelling issue in the GSI incidence endpoint.
    text = re.sub(
        r"\bAizwal\b",
        "Aizawl",
        text,
        flags=re.IGNORECASE,
    )

    return text


def contains_rejected_content(row: dict[str, Any]) -> bool:
    combined = " ".join(
        str(value)
        for value in row.values()
        if value is not None
    ).lower()

    return any(
        pattern in combined
        for pattern in REJECT_PATTERNS
    )


def parse_exact_date(text: str) -> date | None:
    """
    Parse exact day/month/year dates.

    Supported examples:

        09.06.2023
        09/06/2023
        09-06-2023
        09th June 2023
        26 May, 2020
        8th Sept 2021
        10th July, 2020
    """

    numeric_pattern = re.compile(
        r"\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b"
    )

    match = numeric_pattern.search(text)

    if match:
        day = int(match.group(1))
        month = int(match.group(2))
        year = int(match.group(3))

        try:
            return date(
                year,
                month,
                day,
            )
        except ValueError:
            pass

    month_pattern = re.compile(
        r"\b"
        r"(\d{1,2})"
        r"(?:st|nd|rd|th)?"
        r"\s+"
        r"(January|February|March|April|May|June|July|August|"
        r"September|October|November|December|"
        r"Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)"
        r"(?:\s*,)?"
        r"\s+"
        r"(20\d{2})"
        r"\b",
        flags=re.IGNORECASE,
    )

    match = month_pattern.search(text)

    if match:
        day = int(match.group(1))
        month_name = match.group(2).lower()
        year = int(match.group(3))

        month_name = MONTH_ALIASES.get(
            month_name,
            month_name,
        )

        month = MONTHS.get(month_name)

        if month:
            try:
                return date(
                    year,
                    month,
                    day,
                )
            except ValueError:
                pass

    return None


def parse_year_month(
    text: str,
) -> tuple[int | None, int | None]:
    """
    Extract year/month when an exact day isn't available.

    Examples:

        July 2023
        September 2021
        June-July 2020
        November 2019
    """

    pattern = re.compile(
        r"\b"
        r"(January|February|March|April|May|June|July|August|"
        r"September|October|November|December|"
        r"Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)"
        r"(?:\s*[-/&]\s*"
        r"(January|February|March|April|May|June|July|August|"
        r"September|October|November|December|"
        r"Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec))?"
        r"(?:\s*,?\s*)"
        r"(20\d{2})"
        r"\b",
        flags=re.IGNORECASE,
    )

    match = pattern.search(text)

    if not match:
        return None, None

    month_name = match.group(1).lower()

    month_name = MONTH_ALIASES.get(
        month_name,
        month_name,
    )

    month = MONTHS.get(month_name)

    year = int(match.group(3))

    return year, month


def parse_occurrence_date(
    row: dict[str, Any],
) -> tuple[
    date | None,
    int | None,
    int | None,
    str,
]:
    """
    Return:

        exact date
        year
        month
        date precision

    We never invent an exact day when GSI only gives month/year.
    """

    title = clean_text(
        row.get("title")
    ) or ""

    description = clean_text(
        row.get("description")
    ) or ""

    text = f"{title} {description}"

    exact = parse_exact_date(text)

    if exact:
        return (
            exact,
            exact.year,
            exact.month,
            "DAY",
        )

    year, month = parse_year_month(text)

    if year and month:
        return (
            None,
            year,
            month,
            "MONTH",
        )

    year_match = re.search(
        r"\b(20\d{2})\b",
        text,
    )

    if year_match:
        year = int(
            year_match.group(1)
        )

        return (
            None,
            year,
            None,
            "YEAR",
        )

    return (
        None,
        None,
        None,
        "UNKNOWN",
    )


def dms_to_decimal(
    degrees: float,
    minutes: float,
    seconds: float,
    hemisphere: str,
) -> float:
    value = (
        abs(degrees)
        + minutes / 60
        + seconds / 3600
    )

    hemisphere = hemisphere.upper()

    if hemisphere in {
        "S",
        "W",
    }:
        value = -value

    return value


def parse_dms_coordinates(
    text: str,
) -> tuple[float, float] | None:
    """
    Parse DMS coordinates.

    Examples:

        23° 44' 29.43"N, 92° 42' 28.29"E
        25°31’44.45” N; 91°15’42.79” E
        25°31'44.45"N 91°15'42.79"E

    Supports ASCII and Unicode degree/prime/quote characters.
    """

    number = r"([+-]?\d+(?:\.\d+)?)"

    separator = r"\s*(?:[,;]|\s{2,})\s*"

    dms_pattern = re.compile(
        number
        + r"\s*(?:°|º)\s*"
        + r"(\d+(?:\.\d+)?)"
        + r"\s*(?:'|′|’)\s*"
        + r"(\d+(?:\.\d+)?)"
        + r"\s*(?:\"|″|”)\s*"
        + r"([NS])"
        + separator
        + number
        + r"\s*(?:°|º)\s*"
        + r"(\d+(?:\.\d+)?)"
        + r"\s*(?:'|′|’)\s*"
        + r"(\d+(?:\.\d+)?)"
        + r"\s*(?:\"|″|”)\s*"
        + r"([EW])",
        flags=re.IGNORECASE,
    )

    match = dms_pattern.search(text)

    if not match:
        return None

    lat = dms_to_decimal(
        float(match.group(1)),
        float(match.group(2)),
        float(match.group(3)),
        match.group(4),
    )

    lon = dms_to_decimal(
        float(match.group(5)),
        float(match.group(6)),
        float(match.group(7)),
        match.group(8),
    )

    return validate_coordinates(
        lat,
        lon,
    )


def parse_decimal_coordinates(
    text: str,
) -> tuple[float, float] | None:
    """
    Parse decimal coordinates.

    Examples:

        25.782° N, 93.802° E
        25.782 N, 93.802 E
        25.782, 93.802
    """

    hemisphere_pattern = re.compile(
        r"([+-]?\d{1,3}(?:\.\d+)?)"
        r"\s*°?\s*([NS])"
        r"\s*[,;]\s*"
        r"([+-]?\d{1,3}(?:\.\d+)?)"
        r"\s*°?\s*([EW])",
        flags=re.IGNORECASE,
    )

    match = hemisphere_pattern.search(text)

    if match:
        lat = float(
            match.group(1)
        )

        lon = float(
            match.group(3)
        )

        if match.group(2).upper() == "S":
            lat = -abs(lat)

        if match.group(4).upper() == "W":
            lon = -abs(lon)

        return validate_coordinates(
            lat,
            lon,
        )

    plain_pattern = re.compile(
        r"(?<!\d)"
        r"([+-]?\d{1,3}\.\d+)"
        r"\s*[,;]\s*"
        r"([+-]?\d{1,3}\.\d+)"
        r"(?!\d)"
    )

    match = plain_pattern.search(text)

    if match:
        lat = float(
            match.group(1)
        )

        lon = float(
            match.group(2)
        )

        return validate_coordinates(
            lat,
            lon,
        )

    return None


def validate_coordinates(
    latitude: float,
    longitude: float,
) -> tuple[float, float] | None:
    """
    Broad geographic sanity check.

    Prevents obviously malformed coordinates from entering PostGIS.
    """

    if not (
        -10
        <= latitude
        <= 40
    ):
        return None

    if not (
        70
        <= longitude
        <= 110
    ):
        return None

    return (
        round(latitude, 7),
        round(longitude, 7),
    )


def extract_coordinates(
    row: dict[str, Any],
) -> tuple[float, float] | None:
    """
    Priority:

        1. explicit API coordinates
        2. DMS coordinates in description/title
        3. decimal coordinates in description/title
    """

    latitude = None
    longitude = None

    for key in COORDINATE_KEYS_LAT:
        value = row.get(key)

        if value not in (
            None,
            "",
            "null",
        ):
            try:
                latitude = float(value)
                break
            except (
                TypeError,
                ValueError,
            ):
                pass

    for key in COORDINATE_KEYS_LON:
        value = row.get(key)

        if value not in (
            None,
            "",
            "null",
        ):
            try:
                longitude = float(value)
                break
            except (
                TypeError,
                ValueError,
            ):
                pass

    if (
        latitude is not None
        and longitude is not None
    ):
        explicit = validate_coordinates(
            latitude,
            longitude,
        )

        if explicit:
            return explicit

    title = clean_text(
        row.get("title")
    ) or ""

    description = clean_text(
        row.get("description")
    ) or ""

    text = f"{title} {description}"

    coordinates = parse_dms_coordinates(
        text
    )

    if coordinates:
        return coordinates

    return parse_decimal_coordinates(
        text
    )


def build_geometry(
    latitude: float | None,
    longitude: float | None,
) -> WKTElement | None:
    """
    Create a PostGIS POINT geometry.

    WKT coordinate order is:
        longitude latitude

    SRID 4326 = WGS84.
    """

    if (
        latitude is None
        or longitude is None
    ):
        return None

    return WKTElement(
        f"POINT({longitude} {latitude})",
        srid=4326,
    )


def classify_record(
    title: str,
    description: str,
    latitude: float | None,
    longitude: float | None,
    occurrence_date: date | None,
    occurrence_year: int | None,
    occurrence_month: int | None,
    district: str | None,
) -> tuple[str, str]:
    """
    Classification:

        SPATIAL_EVENT
            Actual landslide report with usable coordinates.

        HISTORICAL_NONSPATIAL
            Actual landslide report without usable coordinates.

        REVIEW_REQUIRED
            Assessment / ambiguous / insufficiently reliable record.
    """

    combined = (
        f"{title} {description}"
    ).lower()

    if any(
        term in combined
        for term in ASSESSMENT_TERMS
    ):
        return (
            "REVIEW_REQUIRED",
            "assessment_or_susceptibility_record",
        )

    has_landslide_term = any(
        term in combined
        for term in LANDSLIDE_TERMS
    )

    if not has_landslide_term:
        return (
            "REVIEW_REQUIRED",
            "not_confirmed_as_landslide_occurrence",
        )

    if (
        occurrence_date is None
        and occurrence_year is None
    ):
        return (
            "REVIEW_REQUIRED",
            "unknown_occurrence_date",
        )

    if (
        latitude is not None
        and longitude is not None
    ):
        return (
            "SPATIAL_EVENT",
            "usable_coordinates",
        )

    return (
        "HISTORICAL_NONSPATIAL",
        "no_usable_coordinates",
    )


def detect_district_conflict(
    state: str,
    district: str | None,
    title: str,
    description: str,
) -> dict[str, Any] | None:
    """
    Detect obvious conflicts between the API district and the textual
    description.

    We flag conflicts instead of silently changing GSI's data.
    """

    combined = (
        f"{title} {description}"
    )

    known_districts = [
        "Senapati",
        "Noney",
        "Papumpare",
        "Papum Pare",
        "Udalguri",
        "Dimapur",
        "Wokha",
        "East Khasi Hills",
        "West Khasi Hills",
        "West Garo Hills",
        "South Garo Hills",
        "East Jaintia Hills",
        "West Jaintia Hills",
        "North Sikkim",
        "East Sikkim",
    ]

    textual_matches: list[str] = []

    for candidate in known_districts:
        if re.search(
            rf"\b{re.escape(candidate)}\s+District\b",
            combined,
            flags=re.IGNORECASE,
        ):
            textual_matches.append(
                candidate
            )

    if (
        not textual_matches
        or not district
    ):
        return None

    normalized_api = re.sub(
        r"\s+",
        " ",
        district,
    ).strip().lower()

    conflicts = [
        candidate
        for candidate in textual_matches
        if candidate.lower()
        not in normalized_api
        and candidate.lower().replace(
            " ",
            "",
        )
        not in normalized_api.replace(
            " ",
            "",
        )
    ]

    if not conflicts:
        return None

    return {
        "issue": "district_text_field_conflict",
        "api_district": district,
        "textual_districts": textual_matches,
        "conflicting_districts": conflicts,
        "state": state,
        "title": title,
    }


def build_fingerprint(
    state: str,
    district: str | None,
    title: str,
    occurrence_date: date | None,
    occurrence_year: int | None,
    occurrence_month: int | None,
    latitude: float | None,
    longitude: float | None,
) -> str:
    lat_key = (
        f"{latitude:.5f}"
        if latitude is not None
        else ""
    )

    lon_key = (
        f"{longitude:.5f}"
        if longitude is not None
        else ""
    )

    normalized_title = re.sub(
        r"\s+",
        " ",
        title.lower(),
    ).strip()

    raw = "|".join(
        [
            state.lower(),
            (district or "").lower(),
            normalized_title,
            (
                occurrence_date.isoformat()
                if occurrence_date
                else ""
            ),
            str(
                occurrence_year or ""
            ),
            str(
                occurrence_month or ""
            ),
            lat_key,
            lon_key,
        ]
    )

    return hashlib.sha256(
        raw.encode("utf-8")
    ).hexdigest()


def validate_row(
    row: dict[str, Any],
) -> tuple[bool, str]:
    if contains_rejected_content(row):
        return (
            False,
            "rejected_content",
        )

    state = normalize_state(
        row.get("state")
    )

    if state is None:
        return (
            False,
            "non_northeast_state",
        )

    title = clean_text(
        row.get("title")
    )

    if not title:
        return (
            False,
            "missing_title",
        )

    description = clean_text(
        row.get("description")
    ) or ""

    combined = (
        f"{title} {description}"
    ).lower()

    if not any(
        term in combined
        for term in LANDSLIDE_TERMS
    ) and not any(
        term in combined
        for term in ASSESSMENT_TERMS
    ):
        return (
            False,
            "not_landslide_event",
        )

    return (
        True,
        "accepted",
    )


def fetch_gsi_incidence(
    timeout: tuple[int, int] = (15, 120),
) -> list[dict[str, Any]]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/142.0.0.0 Safari/537.36"
        ),
        "Accept": (
            "application/json,text/plain,*/*"
        ),
        "Referer": GSI_PORTAL_URL,
        "Origin": GSI_PORTAL_URL.rstrip("/"),
    }

    response = requests.get(
        GSI_INCIDENCE_URL,
        headers=headers,
        timeout=timeout,
    )

    response.raise_for_status()

    payload = response.json()

    if not isinstance(
        payload,
        dict,
    ):
        raise RuntimeError(
            "Unexpected GSI API response format."
        )

    if payload.get(
        "statusCode"
    ) != 200:
        raise RuntimeError(
            "GSI API returned "
            f"statusCode={payload.get('statusCode')}: "
            f"{payload.get('statusMessage')}"
        )

    rows = payload.get(
        "result"
    )

    if not isinstance(
        rows,
        list,
    ):
        raise RuntimeError(
            "GSI API response does not contain a result list."
        )

    return rows


def prepare_clean_records(
    rows: list[dict[str, Any]],
) -> tuple[
    list[dict[str, Any]],
    dict[str, int],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    """
    Fetch → validate → classify → deduplicate.

    Accepted-record counters are calculated AFTER deduplication.
    """

    counters = {
        "fetched": len(rows),
        "accepted_northeast": 0,
        "rejected_content": 0,
        "rejected_state": 0,
        "rejected_missing_title": 0,
        "rejected_not_landslide": 0,
        "rejected_other": 0,
        "deduplicated": 0,
        "spatial_events": 0,
        "historical_nonspatial": 0,
        "review_required": 0,
        "missing_coordinates": 0,
        "exact_day_dates": 0,
        "month_only_dates": 0,
        "year_only_dates": 0,
        "unknown_dates": 0,
        "district_conflicts": 0,
        "training_eligible": 0,
    }

    quarantine: list[
        dict[str, Any]
    ] = []

    quality_issues: list[
        dict[str, Any]
    ] = []

    clean_records: list[
        dict[str, Any]
    ] = []

    fingerprints: set[str] = set()

    for row in rows:

        if not isinstance(
            row,
            dict,
        ):
            counters[
                "rejected_other"
            ] += 1

            quarantine.append(
                {
                    "reason": "row_not_object",
                    "source_id": None,
                }
            )

            continue

        accepted, reason = validate_row(
            row
        )

        if not accepted:

            if reason == "rejected_content":
                counters[
                    "rejected_content"
                ] += 1

            elif reason == "non_northeast_state":
                counters[
                    "rejected_state"
                ] += 1

            elif reason == "missing_title":
                counters[
                    "rejected_missing_title"
                ] += 1

            elif reason == "not_landslide_event":
                counters[
                    "rejected_not_landslide"
                ] += 1

            else:
                counters[
                    "rejected_other"
                ] += 1

            quarantine.append(
                {
                    "reason": reason,
                    "source_id": row.get("id"),
                    "state": row.get("state"),
                    "district": row.get("district"),
                    "title": row.get("title"),
                }
            )

            continue

        state = normalize_state(
            row.get("state")
        )

        district = normalize_district(
            row.get("district")
        )

        title = (
            clean_text(
                row.get("title")
            )
            or "GSI landslide incidence"
        )

        description = clean_text(
            row.get("description")
        )

        (
            occurrence_date,
            occurrence_year,
            occurrence_month,
            date_precision,
        ) = parse_occurrence_date(
            row
        )

        coordinates = extract_coordinates(
            row
        )

        latitude = None
        longitude = None

        if coordinates:
            latitude, longitude = coordinates

        classification, classification_reason = (
            classify_record(
                title=title,
                description=description or "",
                latitude=latitude,
                longitude=longitude,
                occurrence_date=occurrence_date,
                occurrence_year=occurrence_year,
                occurrence_month=occurrence_month,
                district=district,
            )
        )

        district_conflict = detect_district_conflict(
            state=state,
            district=district,
            title=title,
            description=description or "",
        )

        fingerprint = build_fingerprint(
            state=state,
            district=district,
            title=title,
            occurrence_date=occurrence_date,
            occurrence_year=occurrence_year,
            occurrence_month=occurrence_month,
            latitude=latitude,
            longitude=longitude,
        )

        if fingerprint in fingerprints:

            counters[
                "deduplicated"
            ] += 1

            quarantine.append(
                {
                    "reason": (
                        "duplicate_after_normalization"
                    ),
                    "source_id": row.get("id"),
                    "state": state,
                    "district": district,
                    "title": title,
                    "fingerprint": fingerprint,
                }
            )

            continue

        fingerprints.add(
            fingerprint
        )

        counters[
            "accepted_northeast"
        ] += 1

        if classification == "SPATIAL_EVENT":

            counters[
                "spatial_events"
            ] += 1

        elif classification == "HISTORICAL_NONSPATIAL":

            counters[
                "historical_nonspatial"
            ] += 1

        else:

            counters[
                "review_required"
            ] += 1

        if (
            latitude is None
            or longitude is None
        ):
            counters[
                "missing_coordinates"
            ] += 1

        if date_precision == "DAY":

            counters[
                "exact_day_dates"
            ] += 1

        elif date_precision == "MONTH":

            counters[
                "month_only_dates"
            ] += 1

        elif date_precision == "YEAR":

            counters[
                "year_only_dates"
            ] += 1

        else:

            counters[
                "unknown_dates"
            ] += 1

        if district_conflict:
            counters[
                "district_conflicts"
            ] += 1

        # A training point requires:
        # - spatial event
        # - exact date
        # - no district conflict
        training_eligible = (
            classification
            == "SPATIAL_EVENT"
            and occurrence_date is not None
            and district_conflict is None
        )

        if training_eligible:
            counters[
                "training_eligible"
            ] += 1

        if (
            latitude is None
            or longitude is None
        ):
            quality_issues.append(
                {
                    "issue": "missing_coordinates",
                    "source_id": row.get("id"),
                    "state": state,
                    "district": district,
                    "title": title,
                    "classification": classification,
                }
            )

        if occurrence_date is None:
            quality_issues.append(
                {
                    "issue": "non_exact_date",
                    "date_precision": date_precision,
                    "source_id": row.get("id"),
                    "state": state,
                    "district": district,
                    "title": title,
                    "year": occurrence_year,
                    "month": occurrence_month,
                    "classification": classification,
                }
            )

        if district_conflict:
            quality_issues.append(
                district_conflict
            )

        clean_records.append(
            {
                "source_record_id": (
                    str(row.get("id"))
                    if row.get("id") is not None
                    else None
                ),
                "source": "GSI",
                "source_type": (
                    "GSI landslide incidence"
                ),
                "state": state,
                "district": district,
                "slide_name": title,
                "locality": clean_text(
                    row.get("location")
                ),
                "occurrence_date": occurrence_date,
                "occurrence_year": occurrence_year,
                "occurrence_month": occurrence_month,
                "date_precision": date_precision,
                "latitude": latitude,
                "longitude": longitude,
                "landslide_type": None,
                "material_type": None,
                "area_sq_m": None,
                "length_m": None,
                "width_m": None,
                "depth_m": None,
                "source_url": GSI_PORTAL_URL,
                "verification_status": (
                    "GSI_REPORTED_SPATIAL"
                    if classification
                    == "SPATIAL_EVENT"
                    else (
                        "GSI_REPORTED_NONSPATIAL"
                        if classification
                        == "HISTORICAL_NONSPATIAL"
                        else "GSI_REPORTED_REVIEW"
                    )
                ),
                "classification": classification,
                "classification_reason": (
                    classification_reason
                ),
                "training_eligible": (
                    training_eligible
                ),
                "district_conflict": (
                    district_conflict
                ),
                "raw_description": description,
                "fingerprint": fingerprint,
            }
        )

    return (
        clean_records,
        counters,
        quarantine,
        quality_issues,
    )


def write_json(
    path: Path,
    records: Any,
) -> None:
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    path.write_text(
        json.dumps(
            records,
            indent=2,
            ensure_ascii=False,
            default=str,
        ),
        encoding="utf-8",
    )


def write_quarantine_file(
    records: list[dict[str, Any]],
    output_dir: Path,
) -> Path:

    path = (
        output_dir
        / "gsi_incidence_quarantine.json"
    )

    write_json(
        path,
        records,
    )

    return path


def write_clean_preview(
    records: list[dict[str, Any]],
    output_dir: Path,
) -> Path:

    path = (
        output_dir
        / "gsi_incidence_clean_preview.json"
    )

    write_json(
        path,
        records,
    )

    return path


def write_quality_report(
    counters: dict[str, int],
    quality_issues: list[dict[str, Any]],
    output_dir: Path,
) -> Path:

    path = (
        output_dir
        / "gsi_incidence_quality_report.json"
    )

    report = {
        "source": GSI_INCIDENCE_URL,
        "generated_at_utc": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),
        "counters": counters,
        "quality_issue_count": len(
            quality_issues
        ),
        "quality_issues": quality_issues,
    }

    write_json(
        path,
        report,
    )

    return path


def import_clean_records(
    db: Session,
    records: list[dict[str, Any]],
    dry_run: bool = True,
) -> dict[str, Any]:
    """
    Import safe GSI records into LandslideEvent.

    Rules:

        SPATIAL_EVENT
            Imported with PostGIS POINT geometry.

        HISTORICAL_NONSPATIAL
            NOT imported because the current LandslideEvent schema
            requires a non-null geometry.

        REVIEW_REQUIRED
            NOT imported automatically.

    Existing GSI records with the same source_record_id are updated.
    """

    created = 0
    updated = 0

    skipped_nonspatial = 0
    skipped_review = 0
    skipped_invalid_geometry = 0

    existing_by_source_id: dict[
        str,
        LandslideEvent,
    ] = {}

    existing_events = db.scalars(
        select(
            LandslideEvent
        ).where(
            LandslideEvent.source == "GSI"
        )
    ).all()

    for event in existing_events:

        if event.source_record_id:

            existing_by_source_id[
                str(
                    event.source_record_id
                )
            ] = event

    for record in records:

        classification = record.get(
            "classification"
        )

        if classification == "REVIEW_REQUIRED":

            skipped_review += 1
            continue

        if classification == "HISTORICAL_NONSPATIAL":

            skipped_nonspatial += 1
            continue

        latitude = record.get(
            "latitude"
        )

        longitude = record.get(
            "longitude"
        )

        geometry = build_geometry(
            latitude=latitude,
            longitude=longitude,
        )

        if geometry is None:

            skipped_invalid_geometry += 1
            continue

        source_record_id = record.get(
            "source_record_id"
        )

        if (
            source_record_id
            and source_record_id
            in existing_by_source_id
        ):

            event = existing_by_source_id[
                source_record_id
            ]

            event.source_type = (
                record["source_type"]
            )

            event.state = record[
                "state"
            ]

            event.district = record[
                "district"
            ]

            event.slide_name = record[
                "slide_name"
            ]

            event.locality = record[
                "locality"
            ]

            event.occurrence_date = record[
                "occurrence_date"
            ]

            event.latitude = latitude

            event.longitude = longitude

            event.geometry = geometry

            event.landslide_type = record[
                "landslide_type"
            ]

            event.material_type = record[
                "material_type"
            ]

            event.area_sq_m = record[
                "area_sq_m"
            ]

            event.length_m = record[
                "length_m"
            ]

            event.width_m = record[
                "width_m"
            ]

            event.depth_m = record[
                "depth_m"
            ]

            event.source_url = record[
                "source_url"
            ]

            event.verification_status = (
                record[
                    "verification_status"
                ]
            )

            updated += 1

            continue

        event = LandslideEvent(
            source_record_id=(
                source_record_id
            ),
            source=record[
                "source"
            ],
            source_type=record[
                "source_type"
            ],
            state=record[
                "state"
            ],
            district=record[
                "district"
            ],
            slide_name=record[
                "slide_name"
            ],
            locality=record[
                "locality"
            ],
            occurrence_date=record[
                "occurrence_date"
            ],
            latitude=latitude,
            longitude=longitude,
            landslide_type=record[
                "landslide_type"
            ],
            material_type=record[
                "material_type"
            ],
            area_sq_m=record[
                "area_sq_m"
            ],
            length_m=record[
                "length_m"
            ],
            width_m=record[
                "width_m"
            ],
            depth_m=record[
                "depth_m"
            ],
            source_url=record[
                "source_url"
            ],
            verification_status=record[
                "verification_status"
            ],
            geometry=geometry,
        )

        db.add(event)

        created += 1

    if dry_run:

        db.rollback()

    else:

        try:
            db.commit()

        except Exception:

            db.rollback()
            raise

    return {
        "dry_run": dry_run,
        "created": created,
        "updated": updated,
        "skipped_nonspatial": (
            skipped_nonspatial
        ),
        "skipped_review": (
            skipped_review
        ),
        "skipped_invalid_geometry": (
            skipped_invalid_geometry
        ),
        "total_processed": len(
            records
        ),
    }


def run_gsi_incidence_import(
    db: Session,
    dry_run: bool = True,
    output_dir: str = "data/gsi",
) -> dict[str, Any]:

    raw_rows = fetch_gsi_incidence()

    (
        clean_records,
        counters,
        quarantine,
        quality_issues,
    ) = prepare_clean_records(
        raw_rows
    )

    output_path = Path(
        output_dir
    )

    quarantine_path = (
        write_quarantine_file(
            quarantine,
            output_path,
        )
    )

    preview_path = (
        write_clean_preview(
            clean_records,
            output_path,
        )
    )

    quality_report_path = (
        write_quality_report(
            counters,
            quality_issues,
            output_path,
        )
    )

    import_result = (
        import_clean_records(
            db=db,
            records=clean_records,
            dry_run=dry_run,
        )
    )

    return {
        "status": "success",
        "source": GSI_INCIDENCE_URL,
        "source_type": (
            "GSI landslide incidence"
        ),
        "counters": counters,
        "quarantine_records": len(
            quarantine
        ),
        "clean_records": len(
            clean_records
        ),
        "quality_issues": len(
            quality_issues
        ),
        "quarantine_file": str(
            quarantine_path
        ),
        "clean_preview_file": str(
            preview_path
        ),
        "quality_report_file": str(
            quality_report_path
        ),
        "import": import_result,
    }