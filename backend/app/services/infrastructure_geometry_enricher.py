from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from geoalchemy2.shape import from_shape
from shapely.geometry import LineString, Point, shape
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import SessionLocal, register_models
from app.models.infrastructure_asset import InfrastructureAsset


BASE_DIR = Path(__file__).resolve().parents[2]

OUTPUT_DIR = BASE_DIR / "data" / "infrastructure"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

REPORT_FILE = (
    OUTPUT_DIR
    / "infrastructure_geometry_enrichment.json"
)

SOURCE_URL = (
    "https://overpass-api.de/api/interpreter"
)

REQUEST_TIMEOUT = 120

USER_AGENT = (
    "BhooPehra/0.1 "
    "(landslide-risk-prototype; "
    "read-only OSM geometry enrichment)"
)


ASSET_EXPECTED_TYPES = {
    "ROAD": {
        "way",
    },
    "HIGHWAY": {
        "way",
    },
    "BRIDGE": {
        "node",
        "way",
        "relation",
    },
    "HOSPITAL": {
        "node",
        "way",
    },
    "SCHOOL": {
        "node",
        "way",
    },
    "VILLAGE": {
        "node",
        "way",
        "relation",
    },
}


def normalize_text(
    value: str | None,
) -> str:
    if not value:
        return ""

    value = str(value).upper().strip()

    value = (
        value.replace("&", " AND ")
        .replace("-", " ")
        .replace("_", " ")
        .replace("/", " ")
        .replace(",", " ")
        .replace(".", " ")
        .replace("'", "")
        .replace('"', "")
        .replace("’", "")
    )

    value = re.sub(
        r"\s+",
        " ",
        value,
    )

    return value.strip()


def compact_text(
    value: str | None,
) -> str:
    return normalize_text(value).replace(
        " ",
        "",
    )


def asset_matches_candidate(
    asset: InfrastructureAsset,
    candidate: dict[str, Any],
) -> bool:
    properties = (
        candidate.get("tags") or {}
    )

    candidate_name = (
        properties.get("name")
        or properties.get("official_name")
        or properties.get("alt_name")
    )

    if not candidate_name:
        return False

    asset_name = compact_text(
        asset.name
    )

    osm_name = compact_text(
        candidate_name
    )

    if asset_name == osm_name:
        return True

    # Conservative fallback:
    # every word in the seeded asset name must
    # occur in the candidate name.
    asset_words = {
        word
        for word in normalize_text(
            asset.name
        ).split()
        if len(word) >= 3
    }

    osm_words = {
        word
        for word in normalize_text(
            candidate_name
        ).split()
        if len(word) >= 3
    }

    if not asset_words:
        return False

    return asset_words.issubset(
        osm_words
    )


def expected_osm_tags(
    asset_type: str,
) -> str:
    asset_type = (
        asset_type or "OTHER"
    ).upper()

    if asset_type in {
        "ROAD",
        "HIGHWAY",
    }:
        return """
          ["highway"]
        """

    if asset_type == "BRIDGE":
        return """
          ["bridge"]
        """

    if asset_type == "HOSPITAL":
        return """
          ["amenity"="hospital"]
        """

    if asset_type == "SCHOOL":
        return """
          ["amenity"="school"]
        """

    if asset_type == "VILLAGE":
        return """
          ["place"="village"]
        """

    return """
      ["name"]
    """


def build_overpass_query(
    assets: list[InfrastructureAsset],
) -> str:
    names = []

    for asset in assets:
        escaped = (
            asset.name
            .replace("\\", "\\\\")
            .replace('"', '\\"')
        )

        names.append(
            escaped
        )

    name_regex = "|".join(
        re.escape(name)
        for name in names
    )

    # Northeast India bounding box:
    # south,west,north,east
    bbox = (
        "21.5,88.0,29.8,97.5"
    )

    query = f"""
[out:json][timeout:100];

(
"""

    for asset in assets:
        escaped = (
            asset.name
            .replace("\\", "\\\\")
            .replace('"', '\\"')
        )

        asset_type = (
            asset.asset_type or "OTHER"
        ).upper()

        if asset_type in {
            "ROAD",
            "HIGHWAY",
        }:
            query += f"""
  way["name"="{escaped}"]({bbox});
"""

        elif asset_type == "BRIDGE":
            query += f"""
  node["name"="{escaped}"]({bbox});
  way["name"="{escaped}"]({bbox});
"""

        elif asset_type == "HOSPITAL":
            query += f"""
  node["name"="{escaped}"]["amenity"="hospital"]({bbox});
  way["name"="{escaped}"]["amenity"="hospital"]({bbox});
"""

        elif asset_type == "SCHOOL":
            query += f"""
  node["name"="{escaped}"]["amenity"="school"]({bbox});
  way["name"="{escaped}"]["amenity"="school"]({bbox});
"""

        elif asset_type == "VILLAGE":
            query += f"""
  node["name"="{escaped}"]["place"="village"]({bbox});
  way["name"="{escaped}"]["place"="village"]({bbox});
"""

    query += """
);

out body geom;
"""

    return query


def fetch_overpass(
    query: str,
) -> dict[str, Any]:
    response = requests.post(
        SOURCE_URL,
        data={
            "data": query,
        },
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        },
        timeout=REQUEST_TIMEOUT,
    )

    response.raise_for_status()

    payload = response.json()

    if payload.get("remark"):
        raise RuntimeError(
            f"Overpass returned remark: "
            f"{payload['remark']}"
        )

    return payload


def candidate_geometry(
    element: dict[str, Any],
):
    element_type = element.get(
        "type"
    )

    if element_type == "node":
        lat = element.get("lat")
        lon = element.get("lon")

        if lat is None or lon is None:
            return None

        return Point(
            float(lon),
            float(lat),
        )

    geometry = element.get(
        "geometry"
    )

    if not geometry:
        return None

    coordinates = [
        (
            float(point["lon"]),
            float(point["lat"]),
        )
        for point in geometry
        if (
            "lat" in point
            and "lon" in point
        )
    ]

    if len(coordinates) < 2:
        return None

    return LineString(
        coordinates
    )


def normalize_geometry_for_asset(
    geometry,
    asset_type: str,
):
    asset_type = (
        asset_type or "OTHER"
    ).upper()

    if asset_type in {
        "ROAD",
        "HIGHWAY",
    }:
        if geometry.geom_type == "LineString":
            return geometry

        if geometry.geom_type == "Point":
            return geometry

    if asset_type in {
        "BRIDGE",
        "HOSPITAL",
        "SCHOOL",
        "VILLAGE",
    }:
        if geometry.geom_type == "Point":
            return geometry

        if geometry.geom_type == "LineString":
            return geometry.centroid

    return geometry


def candidate_score(
    asset: InfrastructureAsset,
    element: dict[str, Any],
) -> float:
    tags = (
        element.get("tags") or {}
    )

    candidate_name = (
        tags.get("name")
        or tags.get("official_name")
        or ""
    )

    score = 0.0

    if compact_text(
        candidate_name
    ) == compact_text(
        asset.name
    ):
        score += 70.0

    elif asset_matches_candidate(
        asset,
        element,
    ):
        score += 50.0

    asset_type = (
        asset.asset_type or "OTHER"
    ).upper()

    element_type = element.get(
        "type"
    )

    if element_type in ASSET_EXPECTED_TYPES.get(
        asset_type,
        set(),
    ):
        score += 10.0

    if asset_type in {
        "HOSPITAL",
        "SCHOOL",
        "VILLAGE",
    }:
        expected = {
            "HOSPITAL": (
                "hospital"
            ),
            "SCHOOL": (
                "school"
            ),
            "VILLAGE": (
                "village"
            ),
        }.get(asset_type)

        if expected:
            if (
                tags.get("amenity")
                == expected
                or tags.get("place")
                == expected
            ):
                score += 20.0

    if asset_type in {
        "ROAD",
        "HIGHWAY",
    }:
        if tags.get("highway"):
            score += 20.0

    if asset_type == "BRIDGE":
        if (
            tags.get("bridge")
            or tags.get("man_made")
            == "bridge"
        ):
            score += 20.0

    return score


def find_candidates(
    assets: list[InfrastructureAsset],
    elements: list[dict[str, Any]],
) -> dict[
    int,
    list[dict[str, Any]],
]:
    candidates: dict[
        int,
        list[dict[str, Any]],
    ] = {
        asset.id: []
        for asset in assets
    }

    for asset in assets:
        for element in elements:
            if not asset_matches_candidate(
                asset,
                element,
            ):
                continue

            geometry = candidate_geometry(
                element
            )

            if geometry is None:
                continue

            normalized = (
                normalize_geometry_for_asset(
                    geometry,
                    asset.asset_type,
                )
            )

            score = candidate_score(
                asset,
                element,
            )

            candidates[
                asset.id
            ].append(
                {
                    "element_type": element.get(
                        "type"
                    ),
                    "element_id": element.get(
                        "id"
                    ),
                    "tags": element.get(
                        "tags",
                        {},
                    ),
                    "score": score,
                    "geometry_type": (
                        normalized.geom_type
                    ),
                    "geometry": normalized,
                }
            )

    for asset_id in candidates:
        candidates[asset_id].sort(
            key=lambda item: item[
                "score"
            ],
            reverse=True,
        )

    return candidates


def serialize_candidate(
    candidate: dict[str, Any],
) -> dict[str, Any]:
    geometry = candidate[
        "geometry"
    ]

    return {
        "element_type": candidate[
            "element_type"
        ],
        "element_id": candidate[
            "element_id"
        ],
        "score": candidate[
            "score"
        ],
        "geometry_type": candidate[
            "geometry_type"
        ],
        "tags": candidate[
            "tags"
        ],
        "geometry_wkt": (
            geometry.wkt
        ),
    }


def run_enrichment(
    db: Session,
    *,
    dry_run: bool = True,
) -> dict[str, Any]:
    assets = db.scalars(
        select(
            InfrastructureAsset
        ).order_by(
            InfrastructureAsset.id
        )
    ).all()

    assets = [
        asset
        for asset in assets
        if asset.geometry is None
    ]

    if not assets:
        return {
            "status": "success",
            "message": (
                "All infrastructure assets "
                "already have geometry."
            ),
            "assets_considered": 0,
            "updated_count": 0,
            "review_required_count": 0,
            "dry_run": dry_run,
        }

    query = build_overpass_query(
        assets
    )

    payload = fetch_overpass(
        query
    )

    elements = payload.get(
        "elements",
        [],
    )

    candidates = find_candidates(
        assets,
        elements,
    )

    updated = []
    review_required = []
    no_match = []

    for asset in assets:
        asset_candidates = candidates.get(
            asset.id,
            [],
        )

        if not asset_candidates:
            no_match.append(
                {
                    "asset_id": asset.id,
                    "asset_code": (
                        asset.asset_code
                    ),
                    "name": asset.name,
                    "asset_type": (
                        asset.asset_type
                    ),
                    "reason": (
                        "NO_VERIFIED_OSM_NAME_MATCH"
                    ),
                }
            )
            continue

        best = asset_candidates[0]

        # Minimum confidence for automatic write.
        #
        # Exact name + correct object/type normally
        # reaches 80+.
        if best["score"] < 80.0:
            review_required.append(
                {
                    "asset_id": asset.id,
                    "asset_code": (
                        asset.asset_code
                    ),
                    "name": asset.name,
                    "asset_type": (
                        asset.asset_type
                    ),
                    "reason": (
                        "MATCH_SCORE_BELOW_80"
                    ),
                    "best_score": (
                        best["score"]
                    ),
                    "candidates": [
                        serialize_candidate(
                            candidate
                        )
                        for candidate
                        in asset_candidates[:5]
                    ],
                }
            )
            continue

        geometry = best[
            "geometry"
        ]

        if geometry.is_empty:
            review_required.append(
                {
                    "asset_id": asset.id,
                    "asset_code": (
                        asset.asset_code
                    ),
                    "name": asset.name,
                    "reason": (
                        "EMPTY_GEOMETRY"
                    ),
                }
            )
            continue

        if not dry_run:
            asset.geometry = from_shape(
                geometry,
                srid=4326,
            )

        updated.append(
            {
                "asset_id": asset.id,
                "asset_code": (
                    asset.asset_code
                ),
                "name": asset.name,
                "asset_type": (
                    asset.asset_type
                ),
                "match_score": (
                    best["score"]
                ),
                "element_type": (
                    best["element_type"]
                ),
                "element_id": (
                    best["element_id"]
                ),
                "geometry_type": (
                    best["geometry_type"]
                ),
                "tags": best["tags"],
                "geometry_wkt": (
                    geometry.wkt
                ),
                "status": (
                    "WOULD_UPDATE"
                    if dry_run
                    else "UPDATED"
                ),
            }
        )

    if not dry_run:
        db.commit()

    report = {
        "dataset": (
            "BhooPehra Infrastructure "
            "Geometry Enrichment"
        ),
        "source": SOURCE_URL,
        "source_license": (
            "OpenStreetMap ODbL"
        ),
        "generated_at_utc": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),
        "dry_run": dry_run,
        "assets_considered": len(
            assets
        ),
        "overpass_elements_returned": len(
            elements
        ),
        "updated_count": len(
            updated
        ),
        "review_required_count": len(
            review_required
        ),
        "no_match_count": len(
            no_match
        ),
        "updated": updated,
        "review_required": (
            review_required
        ),
        "no_match": no_match,
        "policy_note": (
            "One-time small-volume read-only "
            "Overpass lookup; no automated "
            "bulk geocoding or tile scraping."
        ),
    }

    REPORT_FILE.write_text(
        json.dumps(
            report,
            indent=2,
            ensure_ascii=False,
            default=str,
        ),
        encoding="utf-8",
    )

    return report


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description=(
            "Enrich BhooPehra infrastructure "
            "assets with verified OSM geometry."
        )
    )

    parser.add_argument(
        "--write",
        action="store_true",
        help=(
            "Write only high-confidence "
            "geometry matches to PostgreSQL."
        ),
    )

    args = parser.parse_args()

    register_models()

    db = SessionLocal()

    try:
        result = run_enrichment(
            db,
            dry_run=not args.write,
        )

        print(
            json.dumps(
                result,
                indent=2,
                ensure_ascii=False,
                default=str,
            )
        )

    finally:
        db.close()