from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.database import get_db


router = APIRouter(
    prefix="/api/districts",
    tags=["districts"],
)

NORTHEAST_STATES = (
    "Arunachal Pradesh",
    "Assam",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Sikkim",
    "Tripura",
)

_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _quote_identifier(value: str) -> str:
    if not _IDENTIFIER_RE.fullmatch(value):
        raise RuntimeError(
            f"Unsafe database identifier discovered: {value!r}"
        )

    return f'"{value}"'


def _find_geometry_column(db: Session) -> str:
    row = db.execute(
        text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'districts'
              AND udt_name = 'geometry'
            ORDER BY ordinal_position
            LIMIT 1
            """
        )
    ).mappings().first()

    if row is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "District boundary geometry is not available "
                "in the PostGIS districts table."
            ),
        )

    return str(row["column_name"])


@router.get("/boundaries")
def get_district_boundaries(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Return real Northeast district boundaries from PostGIS.

    No coordinates are generated here. Only districts with actual
    non-null geometry are returned.
    """
    geometry_column = _find_geometry_column(db)
    quoted_geometry = _quote_identifier(geometry_column)

    rows = db.execute(
        text(
            f"""
            SELECT
                id,
                name,
                state,
                code,
                ST_SRID({quoted_geometry}) AS srid,
                ST_AsGeoJSON(
                    CASE
                        WHEN ST_SRID({quoted_geometry}) = 4326
                            THEN {quoted_geometry}
                        ELSE ST_Transform(
                            {quoted_geometry},
                            4326
                        )
                    END
                ) AS geometry
            FROM districts
            WHERE state = ANY(:states)
              AND {quoted_geometry} IS NOT NULL
            ORDER BY state, name
            """
        ),
        {"states": list(NORTHEAST_STATES)},
    ).mappings().all()

    data: list[dict[str, Any]] = []

    for row in rows:
        geometry = None

        if row["geometry"]:
            try:
                geometry = json.loads(row["geometry"])
            except (TypeError, json.JSONDecodeError):
                geometry = None

        data.append(
            {
                "id": int(row["id"]),
                "name": row["name"],
                "state": row["state"],
                "code": row["code"],
                "srid": (
                    int(row["srid"])
                    if row["srid"] is not None
                    else None
                ),
                "geometry": geometry,
            }
        )

    states = sorted(
        {
            item["state"]
            for item in data
            if item["state"]
        }
    )

    return {
        "status": "success",
        "count": len(data),
        "states": states,
        "geometry_source": "PostGIS districts table",
        "synthetic_geometry_created": False,
        "data": data,
    }
