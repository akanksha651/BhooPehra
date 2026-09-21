from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, shape
from shapely.validation import explain_validity
from sqlalchemy import func, select

from app.db.database import SessionLocal
from app.models.district import District


BASE_DIR = Path(__file__).resolve().parents[2]

OUTPUT_DIR = BASE_DIR / "data" / "districts"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

QUALITY_REPORT_FILE = OUTPUT_DIR / "district_geometry_quality.json"

SOURCE_URL = (
    "https://livingatlas.esri.in/server/rest/services/"
    "IAB2024/India_Administrative_Boundaries_2024/"
    "MapServer/2/query"
)

NE_STATE_CODES = {
    12: "ARUNACHAL PRADESH",
    18: "ASSAM",
    14: "MANIPUR",
    17: "MEGHALAYA",
    15: "MIZORAM",
    13: "NAGALAND",
    11: "SIKKIM",
    16: "TRIPURA",
}

NE_STATES = set(NE_STATE_CODES.values())

REQUEST_TIMEOUT = 90


def normalize_text(value: str | None) -> str:
    if not value:
        return ""

    value = str(value).upper().strip()

    replacements = {
        "&": " AND ",
        "-": " ",
        "_": " ",
        "/": " ",
        ",": " ",
        ".": " ",
        "'": "",
        '"': "",
        "’": "",
    }

    for old, new in replacements.items():
        value = value.replace(old, new)

    value = re.sub(r"\s+", " ", value)

    return value.strip()


def normalize_state(value: str | None) -> str:
    return normalize_text(value)


def normalize_district(value: str | None) -> str:
    value = normalize_text(value)

    aliases = {
        "DIBANG VALLEY": "DIBANG VALLEY",
        "LOWER DIBANG VALLEY": "LOWER DIBANG VALLEY",
        "UPPER DIBANG VALLEY": "UPPER DIBANG VALLEY",
        "KRA DAADI": "KRA DAADI",
        "LEPA RADA": "LEPA RADA",
        "LOWER SIANG": "LOWER SIANG",
        "PAKKE KESSANG": "PAKKE KESSANG",
        "SHI YOMI": "SHI YOMI",
        "EAST SIANG": "EAST SIANG",
        "WEST SIANG": "WEST SIANG",
    }

    return aliases.get(value, value)


def fetch_state_features(
    state_code: int,
) -> list[dict[str, Any]]:
    params = {
        "where": f"lgd_statecode={state_code}",
        "outFields": (
            "objectid,name,state,"
            "lgd_districtname,lgd_districtcode,"
            "lgd_statecode,censuscode2011"
        ),
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "geojson",
        "resultRecordCount": 100,
    }

    response = requests.get(
        SOURCE_URL,
        params=params,
        timeout=REQUEST_TIMEOUT,
    )

    response.raise_for_status()

    payload = response.json()

    if payload.get("error"):
        raise RuntimeError(
            f"ArcGIS query error for state code "
            f"{state_code}: {payload['error']}"
        )

    features = payload.get("features", [])

    if not features:
        raise RuntimeError(
            f"ArcGIS returned zero districts for "
            f"LGD state code {state_code}."
        )

    return features


def fetch_boundary_features() -> list[dict[str, Any]]:
    """
    Fetch Northeast district polygons from the
    Esri India Administrative Boundaries 2024 layer.

    Each Northeast state is queried separately using
    LGD state code. This avoids the unreliable broad
    ArcGIS query that previously returned HTTP 500.
    """

    all_features: list[dict[str, Any]] = []

    for state_code in sorted(NE_STATE_CODES):
        state_name = NE_STATE_CODES[state_code]

        features = fetch_state_features(
            state_code
        )

        print(
            f"{state_name}: "
            f"{len(features)} district features"
        )

        all_features.extend(features)

    if not all_features:
        raise RuntimeError(
            "No Northeast district features were returned."
        )

    return all_features


def ensure_multipolygon(geometry):
    if geometry is None or geometry.is_empty:
        raise ValueError(
            "Empty district geometry."
        )

    if geometry.geom_type == "Polygon":
        geometry = MultiPolygon([geometry])

    elif geometry.geom_type == "MultiPolygon":
        pass

    else:
        if hasattr(geometry, "geoms"):
            polygons = [
                geom
                for geom in geometry.geoms
                if geom.geom_type == "Polygon"
            ]

            if polygons:
                geometry = MultiPolygon(
                    polygons
                )

        if geometry.geom_type != "MultiPolygon":
            raise ValueError(
                "Unsupported geometry type: "
                f"{geometry.geom_type}"
            )

    if not geometry.is_valid:
        repaired = geometry.buffer(0)

        if repaired.geom_type == "Polygon":
            repaired = MultiPolygon(
                [repaired]
            )

        geometry = repaired

    if geometry.is_empty:
        raise ValueError(
            "Geometry became empty after "
            "validity repair."
        )

    if geometry.geom_type == "Polygon":
        geometry = MultiPolygon(
            [geometry]
        )

    if geometry.geom_type != "MultiPolygon":
        raise ValueError(
            "Unable to normalize geometry "
            f"to MultiPolygon: {geometry.geom_type}"
        )

    return geometry


def geometry_from_feature(
    feature: dict[str, Any],
):
    geometry_json = feature.get("geometry")

    if not geometry_json:
        raise ValueError(
            "Feature has no geometry."
        )

    geometry = shape(
        geometry_json
    )

    return ensure_multipolygon(
        geometry
    )


def build_source_indexes(
    features: list[dict[str, Any]],
):
    by_code: dict[
        str,
        list[dict[str, Any]],
    ] = {}

    by_name_state: dict[
        tuple[str, str],
        list[dict[str, Any]],
    ] = {}

    for feature in features:
        properties = (
            feature.get("properties") or {}
        )

        code = properties.get(
            "lgd_districtcode"
        )

        if code is not None:
            code_key = str(code).strip()

            by_code.setdefault(
                code_key,
                [],
            ).append(feature)

        name = normalize_district(
            properties.get(
                "lgd_districtname"
            )
            or properties.get("name")
        )

        state = normalize_state(
            properties.get("state")
        )

        if name and state:
            by_name_state.setdefault(
                (name, state),
                [],
            ).append(feature)

    return (
        by_code,
        by_name_state,
    )


def choose_feature(
    district: District,
    by_code,
    by_name_state,
):
    if district.code:
        matches = by_code.get(
            str(district.code).strip(),
            [],
        )

        if len(matches) == 1:
            return matches[0], "LGD_CODE"

        if len(matches) > 1:
            return (
                None,
                "AMBIGUOUS_LGD_CODE",
            )

    key = (
        normalize_district(
            district.name
        ),
        normalize_state(
            district.state
        ),
    )

    matches = by_name_state.get(
        key,
        [],
    )

    if len(matches) == 1:
        return (
            matches[0],
            "NAME_STATE",
        )

    if len(matches) > 1:
        return (
            None,
            "AMBIGUOUS_NAME_STATE",
        )

    return None, "NOT_FOUND"


def write_quality_report(
    report: dict[str, Any],
) -> None:
    QUALITY_REPORT_FILE.write_text(
        json.dumps(
            report,
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def load_district_geometries(
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    started_at = datetime.now(
        timezone.utc
    )

    features = fetch_boundary_features()

    by_code, by_name_state = (
        build_source_indexes(
            features
        )
    )

    db = SessionLocal()

    total = 0
    northeast_total = 0
    updated = 0
    already_had_geometry = 0
    matched_by_code = 0
    matched_by_name_state = 0
    not_found = 0
    ambiguous = 0
    invalid_geometry = 0
    skipped_non_ne = 0

    failures: list[
        dict[str, Any]
    ] = []

    try:
        districts = db.scalars(
            select(District).order_by(
                District.state,
                District.name,
            )
        ).all()

        total = len(districts)

        for district in districts:
            state_key = normalize_state(
                district.state
            )

            if state_key not in NE_STATES:
                skipped_non_ne += 1
                continue

            northeast_total += 1

            feature, match_method = (
                choose_feature(
                    district,
                    by_code,
                    by_name_state,
                )
            )

            if feature is None:
                if match_method.startswith(
                    "AMBIGUOUS"
                ):
                    ambiguous += 1
                else:
                    not_found += 1

                failures.append(
                    {
                        "district_id": district.id,
                        "name": district.name,
                        "state": district.state,
                        "code": district.code,
                        "reason": match_method,
                    }
                )

                continue

            try:
                geometry = (
                    geometry_from_feature(
                        feature
                    )
                )

                if not geometry.is_valid:
                    invalid_geometry += 1

                    failures.append(
                        {
                            "district_id": district.id,
                            "name": district.name,
                            "state": district.state,
                            "code": district.code,
                            "reason": (
                                "INVALID_GEOMETRY"
                            ),
                            "detail": (
                                explain_validity(
                                    geometry
                                )
                            ),
                        }
                    )

                    continue

                if district.geometry is not None:
                    already_had_geometry += 1

                if match_method == "LGD_CODE":
                    matched_by_code += 1

                elif match_method == "NAME_STATE":
                    matched_by_name_state += 1

                if not dry_run:
                    district.geometry = (
                        from_shape(
                            geometry,
                            srid=4326,
                        )
                    )

                updated += 1

            except Exception as exc:
                invalid_geometry += 1

                failures.append(
                    {
                        "district_id": district.id,
                        "name": district.name,
                        "state": district.state,
                        "code": district.code,
                        "reason": (
                            "GEOMETRY_ERROR"
                        ),
                        "detail": str(exc),
                    }
                )

        if not dry_run:
            db.commit()

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()

    finished_at = datetime.now(
        timezone.utc
    )

    report = {
        "dataset": (
            "BhooPehra Northeast "
            "District Geometry"
        ),
        "source": SOURCE_URL,
        "source_layer": (
            "India Administrative "
            "Boundaries 2024 / "
            "District Boundary"
        ),
        "source_geometry": (
            "GeoJSON EPSG:4326"
        ),
        "target_geometry": (
            "PostGIS MULTIPOLYGON EPSG:4326"
        ),
        "states": sorted(
            NE_STATES
        ),
        "started_at_utc": (
            started_at.isoformat()
        ),
        "finished_at_utc": (
            finished_at.isoformat()
        ),
        "dry_run": dry_run,
        "source_feature_count": len(
            features
        ),
        "database_district_count": total,
        "northeast_district_count": (
            northeast_total
        ),
        "updated_count": updated,
        "already_had_geometry": (
            already_had_geometry
        ),
        "matched_by_lgd_code": (
            matched_by_code
        ),
        "matched_by_name_state": (
            matched_by_name_state
        ),
        "not_found": not_found,
        "ambiguous": ambiguous,
        "invalid_geometry": (
            invalid_geometry
        ),
        "skipped_non_ne": (
            skipped_non_ne
        ),
        "failure_count": len(
            failures
        ),
        "failures": failures,
        "quality": (
            "PASS"
            if (
                northeast_total > 0
                and updated == northeast_total
                and invalid_geometry == 0
                and not_found == 0
                and ambiguous == 0
            )
            else "REVIEW_REQUIRED"
        ),
    }

    write_quality_report(
        report
    )

    return report


def verify_district_geometries():
    db = SessionLocal()

    try:
        total = db.scalar(
            select(
                func.count(District.id)
            )
        ) or 0

        with_geometry = db.scalar(
            select(
                func.count(District.id)
            ).where(
                District.geometry.is_not(None)
            )
        ) or 0

        missing_geometry = (
            total - with_geometry
        )

        invalid_count = db.scalar(
            select(
                func.count(District.id)
            ).where(
                District.geometry.is_not(None),
                ~func.ST_IsValid(
                    District.geometry
                ),
            )
        ) or 0

        geometry_type_rows = db.execute(
            select(
                func.ST_GeometryType(
                    District.geometry
                ),
                func.count(District.id),
            )
            .where(
                District.geometry.is_not(None)
            )
            .group_by(
                func.ST_GeometryType(
                    District.geometry
                )
            )
        ).all()

        return {
            "total_districts": total,
            "with_geometry": with_geometry,
            "missing_geometry": (
                missing_geometry
            ),
            "invalid_geometry": (
                invalid_count
            ),
            "geometry_types": {
                str(geometry_type): count
                for geometry_type, count
                in geometry_type_rows
            },
            "quality": (
                "PASS"
                if (
                    total > 0
                    and with_geometry == total
                    and invalid_count == 0
                )
                else "REVIEW_REQUIRED"
            ),
        }

    finally:
        db.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description=(
            "Load Northeast district "
            "MULTIPOLYGON geometries "
            "into PostGIS."
        )
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Validate matching without "
            "writing to DB."
        ),
    )

    parser.add_argument(
        "--verify",
        action="store_true",
        help=(
            "Verify stored district "
            "geometries."
        ),
    )

    args = parser.parse_args()

    if args.verify:
        result = (
            verify_district_geometries()
        )
    else:
        result = (
            load_district_geometries(
                dry_run=args.dry_run
            )
        )

    print(
        json.dumps(
            result,
            indent=2,
            ensure_ascii=False,
        )
    )