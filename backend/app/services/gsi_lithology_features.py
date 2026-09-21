from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from pyproj import Transformer
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data" / "gsi"

INPUT_FILE = DATA_DIR / "gsi_training_feature_dataset.json"
OUTPUT_FILE = DATA_DIR / "gsi_training_lithology_features.json"
QUALITY_FILE = DATA_DIR / "gsi_lithology_quality.json"


# ============================================================
# SOURCES
# ============================================================

GSI_BHUKOSH_SOURCE = (
    "GSI Bhukosh - Geological Survey of India "
    "(intended authoritative source)"
)

GLIM_FALLBACK_SOURCE = (
    "Global Lithological Map (GLiM) - ArcGIS fallback"
)

GLIM_URL = (
    "https://services8.arcgis.com/4KhTMTZ1x0f76DSg/"
    "ArcGIS/rest/services/GLiM_Niveau_I/FeatureServer/1"
)

GLIM_QUERY_URL = GLIM_URL + "/query"


# ============================================================
# SETTINGS
# ============================================================

REQUEST_TIMEOUT = 60

TRAINING_EPSG = 4326
GLIM_EPSG = 3857

# Northeast India working envelope.
#
# Slightly larger than the actual NE states so that boundary
# polygons are not accidentally excluded.
NE_MIN_LON = 88.0
NE_MIN_LAT = 21.0
NE_MAX_LON = 98.0
NE_MAX_LAT = 30.5

# ArcGIS request page size.
PAGE_SIZE = 1000

HEADERS = {
    "User-Agent": "BhooPehra-GSI-Lithology-Preprocessor/1.0"
}


# ============================================================
# COORDINATE TRANSFORMERS
# ============================================================

WGS84_TO_WEB_MERCATOR = Transformer.from_crs(
    TRAINING_EPSG,
    GLIM_EPSG,
    always_xy=True,
)


# ============================================================
# BASIC HELPERS
# ============================================================

def safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None

        value = float(value)

        if value != value:
            return None

        return value

    except (TypeError, ValueError):
        return None


def clean_text(value: Any) -> str:
    if value is None:
        return ""

    text = str(value).strip()

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    return text


def first_nonempty(*values: Any) -> str:
    for value in values:

        text = clean_text(value)

        if text:
            return text

    return ""


def get_record_id(
    record: dict[str, Any],
) -> str:

    return first_nonempty(
        record.get("record_id"),
        record.get("id"),
        record.get("sample_id"),
        record.get("event_id"),
    )


def get_label(
    record: dict[str, Any],
) -> str:

    return first_nonempty(
        record.get("label"),
        record.get("class"),
        record.get("target"),
    )


def get_coordinates(
    record: dict[str, Any],
) -> tuple[float | None, float | None]:

    latitude = safe_float(
        record.get("latitude")
    )

    longitude = safe_float(
        record.get("longitude")
    )

    if latitude is None:
        latitude = safe_float(
            record.get("lat")
        )

    if longitude is None:
        longitude = safe_float(
            record.get("lon")
        )

    if longitude is None:
        longitude = safe_float(
            record.get("lng")
        )

    return latitude, longitude


# ============================================================
# TRAINING DATA
# ============================================================

def load_training_records() -> list[dict[str, Any]]:

    if not INPUT_FILE.exists():
        raise FileNotFoundError(
            f"Training feature dataset not found: "
            f"{INPUT_FILE}"
        )

    with INPUT_FILE.open(
        "r",
        encoding="utf-8",
    ) as f:

        payload = json.load(f)

    if isinstance(payload, dict):

        records = payload.get(
            "feature_records"
        )

        if records is None:
            records = payload.get(
                "records"
            )

    elif isinstance(payload, list):

        records = payload

    else:

        records = []

    if not isinstance(records, list):

        raise ValueError(
            "Training dataset records must be a list."
        )

    return records


# ============================================================
# SERVICE INFO
# ============================================================

def get_glim_service_info() -> dict[str, Any]:

    response = requests.get(
        GLIM_URL,
        params={
            "f": "json",
        },
        headers=HEADERS,
        timeout=REQUEST_TIMEOUT,
    )

    response.raise_for_status()

    payload = response.json()

    if "error" in payload:

        raise RuntimeError(
            f"GLiM service error: "
            f"{payload['error']}"
        )

    return payload


# ============================================================
# WEB MERCATOR ENVELOPE
# ============================================================

def get_ne_envelope_3857() -> tuple[
    float,
    float,
    float,
    float,
]:

    min_x, min_y = (
        WGS84_TO_WEB_MERCATOR.transform(
            NE_MIN_LON,
            NE_MIN_LAT,
        )
    )

    max_x, max_y = (
        WGS84_TO_WEB_MERCATOR.transform(
            NE_MAX_LON,
            NE_MAX_LAT,
        )
    )

    return (
        min_x,
        min_y,
        max_x,
        max_y,
    )


# ============================================================
# GLiM FEATURE DOWNLOAD
# ============================================================

def fetch_glim_features() -> list[dict[str, Any]]:
    """
    Retrieve only GLiM polygons intersecting the Northeast
    India working envelope.

    IMPORTANT:
    We intentionally do NOT use:
        returnIdsOnly=true

    because the layer exposes approximately one million
    features.

    We also avoid the point spatial query that was observed
    to time out.

    Instead:
        1. Build NE envelope in EPSG:3857.
        2. Ask ArcGIS for polygons intersecting that envelope.
        3. Download pages of those polygons.
        4. Match training points locally.
    """

    service_info = get_glim_service_info()

    print(
        "GLiM layer:",
        service_info.get(
            "name",
            "unknown",
        ),
    )

    print(
        "GLiM geometry:",
        service_info.get(
            "geometryType",
            "unknown",
        ),
    )

    min_x, min_y, max_x, max_y = (
        get_ne_envelope_3857()
    )

    print(
        "NE envelope EPSG:3857:"
    )

    print(
        f"  xmin={min_x:.2f}"
    )

    print(
        f"  ymin={min_y:.2f}"
    )

    print(
        f"  xmax={max_x:.2f}"
    )

    print(
        f"  ymax={max_y:.2f}"
    )

    envelope = json.dumps(
        {
            "xmin": min_x,
            "ymin": min_y,
            "xmax": max_x,
            "ymax": max_y,
            "spatialReference": {
                "wkid": GLIM_EPSG,
            },
        },
        separators=(
            ",",
            ":",
        ),
    )

    out_fields = (
        "OBJECTID,"
        "IDENTITY_,"
        "Litho,"
        "xx,"
        "yy,"
        "zz,"
        "xx_Description,"
        "yy_Description,"
        "zz_Description"
    )

    all_features: list[
        dict[str, Any]
    ] = []

    offset = 0

    while True:

        params = {
            "f": "json",

            "where": "1=1",

            "geometry": envelope,

            "geometryType":
                "esriGeometryEnvelope",

            "inSR":
                str(GLIM_EPSG),

            "spatialRel":
                "esriSpatialRelIntersects",

            "outFields":
                out_fields,

            "returnGeometry":
                "true",

            "outSR":
                str(GLIM_EPSG),

            "resultOffset":
                offset,

            "resultRecordCount":
                PAGE_SIZE,
        }

        print(
            f"Requesting GLiM page "
            f"offset={offset}..."
        )

        response = requests.get(
            GLIM_QUERY_URL,
            params=params,
            headers=HEADERS,
            timeout=REQUEST_TIMEOUT,
        )

        response.raise_for_status()

        payload = response.json()

        if "error" in payload:

            raise RuntimeError(
                "GLiM envelope query error: "
                f"{payload['error']}"
            )

        features = payload.get(
            "features",
            [],
        )

        if not features:
            break

        all_features.extend(
            features
        )

        print(
            f"  received {len(features)} "
            f"features; total="
            f"{len(all_features)}"
        )

        exceeded = payload.get(
            "exceededTransferLimit",
            False,
        )

        if not exceeded:
            break

        offset += len(features)

        # Safety guard.
        if offset > 100000:
            raise RuntimeError(
                "GLiM Northeast query exceeded "
                "100,000 features. "
                "Aborting to avoid excessive "
                "memory usage."
            )

    print(
        f"GLiM NE features downloaded: "
        f"{len(all_features)}"
    )

    return all_features


# ============================================================
# ARC GIS GEOMETRY
# ============================================================

def arcgis_rings_to_geometry(
    geometry: dict[str, Any] | None,
):
    """
    Convert ArcGIS polygon rings to Shapely.

    GLiM service geometry is EPSG:3857.
    """

    if not geometry:
        return None

    rings = geometry.get(
        "rings"
    )

    if not rings:
        return None

    polygons: list[
        Polygon
    ] = []

    for ring in rings:

        if len(ring) < 4:
            continue

        try:

            coordinates = [
                (
                    float(point[0]),
                    float(point[1]),
                )
                for point in ring
            ]

            polygon = Polygon(
                coordinates
            )

            if not polygon.is_empty:
                polygons.append(
                    polygon
                )

        except (
            TypeError,
            ValueError,
            IndexError,
        ):
            continue

    if not polygons:
        return None

    if len(polygons) == 1:

        geometry_result = polygons[0]

    else:

        geometry_result = unary_union(
            polygons
        )

    if not geometry_result.is_valid:

        geometry_result = (
            geometry_result.buffer(0)
        )

    if geometry_result.is_empty:
        return None

    return geometry_result


# ============================================================
# SPATIAL INDEX
# ============================================================

def build_spatial_index(
    features: list[dict[str, Any]],
) -> list[dict[str, Any]]:

    spatial_features: list[
        dict[str, Any]
    ] = []

    for feature in features:

        geometry = (
            arcgis_rings_to_geometry(
                feature.get(
                    "geometry"
                )
            )
        )

        if geometry is None:
            continue

        attributes = feature.get(
            "attributes",
            {},
        )

        spatial_features.append(
            {
                "geometry": geometry,
                "attributes": attributes,
            }
        )

    return spatial_features


# ============================================================
# DESCRIPTION
# ============================================================

def extract_description(
    attributes: dict[str, Any],
) -> str:

    descriptions: list[str] = []

    for field in (
        "xx_Description",
        "yy_Description",
        "zz_Description",
    ):

        value = clean_text(
            attributes.get(
                field
            )
        )

        if value and value not in descriptions:

            descriptions.append(
                value
            )

    return "; ".join(
        descriptions
    )


def extract_code(
    attributes: dict[str, Any],
) -> str:

    return clean_text(
        attributes.get(
            "Litho"
        )
    )


# ============================================================
# NORMALIZATION
# ============================================================

def normalize_lithology(
    description: str,
) -> str:

    text = clean_text(
        description
    ).lower()

    if not text:
        return "OTHER"

    # Unconsolidated material
    if any(
        keyword in text
        for keyword in [
            "unconsolidated",
            "alluvium",
            "alluvial",
            "colluvium",
            "colluvial",
            "loose sediment",
            "regolith",
            "soil",
            "gravel",
            "sand",
            "clay",
            "silt",
            "glacial deposit",
            "glaciofluvial",
            "till",
        ]
    ):
        return "UNCONSOLIDATED"

    # Volcanic
    if any(
        keyword in text
        for keyword in [
            "volcanic",
            "volcanics",
            "basalt",
            "andesite",
            "rhyolite",
            "dacite",
            "pyroclastic",
            "ignimbrite",
            "tuff",
        ]
    ):
        return "VOLCANIC"

    # Plutonic
    if any(
        keyword in text
        for keyword in [
            "plutonic",
            "intrusive",
            "granite",
            "granitoid",
            "granodiorite",
            "diorite",
            "gabbro",
            "tonalite",
            "syenite",
            "acid plutonic",
            "basic plutonic",
            "ultrabasic",
            "ultramafic",
        ]
    ):

        if any(
            keyword in text
            for keyword in [
                "acid plutonic",
                "granite",
                "granitoid",
                "granodiorite",
                "tonalite",
                "syenite",
            ]
        ):
            return "ACID_PLUTONIC"

        return "PLUTONIC"

    # Metamorphic
    if any(
        keyword in text
        for keyword in [
            "metamorphic",
            "metamorphics",
            "gneiss",
            "schist",
            "phyllite",
            "slate",
            "quartzite",
            "marble",
            "migmatite",
            "amphibolite",
            "granulite",
            "charnockite",
        ]
    ):
        return "METAMORPHIC"

    # Siliciclastic sedimentary
    if any(
        keyword in text
        for keyword in [
            "siliciclastic",
            "clastic sedimentary",
            "sandstone",
            "shale",
            "mudstone",
            "siltstone",
            "conglomerate",
            "breccia",
            "arenite",
            "greywacke",
            "graywacke",
        ]
    ):
        return "SILICICLASTIC_SEDIMENTARY"

    # Mixed sedimentary
    if any(
        keyword in text
        for keyword in [
            "mixed sedimentary",
            "mixed sediment",
            "carbonate-siliciclastic",
            "carbonate siliciclastic",
        ]
    ):
        return "MIXED_SEDIMENTARY"

    # Generic sedimentary
    if any(
        keyword in text
        for keyword in [
            "sedimentary",
            "limestone",
            "dolomite",
            "carbonate",
            "chalk",
            "marl",
            "evaporite",
        ]
    ):
        return "SEDIMENTARY"

    # Water
    if any(
        keyword in text
        for keyword in [
            "water",
            "lake",
            "river",
            "marine",
        ]
    ):
        return "WATER"

    # Snow / glacier
    if any(
        keyword in text
        for keyword in [
            "snow",
            "glacier",
            "ice",
        ]
    ):
        return "SNOW_GLACIER"

    return "OTHER"


# ============================================================
# LOCAL MATCH
# ============================================================

def find_local_match(
    latitude: float,
    longitude: float,
    spatial_features: list[
        dict[str, Any]
    ],
) -> dict[str, Any] | None:

    x, y = (
        WGS84_TO_WEB_MERCATOR.transform(
            longitude,
            latitude,
        )
    )

    point = Point(
        x,
        y,
    )

    for feature in spatial_features:

        geometry = feature[
            "geometry"
        ]

        if geometry.covers(
            point
        ):

            return feature

    return None


# ============================================================
# PROCESS ONE RECORD
# ============================================================

def process_record(
    record: dict[str, Any],
    spatial_features: list[
        dict[str, Any]
    ],
) -> dict[str, Any]:

    record_id = get_record_id(
        record
    )

    label = get_label(
        record
    )

    latitude, longitude = (
        get_coordinates(
            record
        )
    )

    result = {
        "record_id": record_id,
        "label": label,

        "latitude": latitude,
        "longitude": longitude,

        "lithology_source": None,
        "lithology_source_role": None,

        "glim_litho_code": None,

        "glim_description": None,

        "glim_xx_description": None,
        "glim_yy_description": None,
        "glim_zz_description": None,

        "lithology_class": None,

        "match_type": None,

        "matched_features": 0,

        "query_error": None,
    }

    # --------------------------------------------------------
    # Coordinates
    # --------------------------------------------------------

    if (
        latitude is None
        or longitude is None
    ):

        result[
            "match_type"
        ] = "MISSING_COORDINATES"

        result[
            "query_error"
        ] = (
            "Missing latitude/longitude"
        )

        return result

    if not (
        -90 <= latitude <= 90
    ):

        result[
            "match_type"
        ] = "INVALID_COORDINATES"

        result[
            "query_error"
        ] = (
            f"Invalid latitude: "
            f"{latitude}"
        )

        return result

    if not (
        -180 <= longitude <= 180
    ):

        result[
            "match_type"
        ] = "INVALID_COORDINATES"

        result[
            "query_error"
        ] = (
            f"Invalid longitude: "
            f"{longitude}"
        )

        return result

    # --------------------------------------------------------
    # Local spatial match
    # --------------------------------------------------------

    try:

        matched = find_local_match(
            latitude=latitude,
            longitude=longitude,
            spatial_features=spatial_features,
        )

    except Exception as exc:

        result[
            "lithology_source"
        ] = GLIM_FALLBACK_SOURCE

        result[
            "lithology_source_role"
        ] = "fallback"

        result[
            "match_type"
        ] = "ERROR"

        result[
            "query_error"
        ] = str(exc)

        return result

    # --------------------------------------------------------
    # No match
    # --------------------------------------------------------

    if matched is None:

        result[
            "lithology_source"
        ] = GLIM_FALLBACK_SOURCE

        result[
            "lithology_source_role"
        ] = "fallback"

        result[
            "match_type"
        ] = "NO_MATCH"

        return result

    # --------------------------------------------------------
    # Attributes
    # --------------------------------------------------------

    attributes = matched[
        "attributes"
    ]

    code = extract_code(
        attributes
    )

    description = extract_description(
        attributes
    )

    lithology_class = (
        normalize_lithology(
            description
        )
    )

    # --------------------------------------------------------
    # Populate
    # --------------------------------------------------------

    result[
        "lithology_source"
    ] = GLIM_FALLBACK_SOURCE

    result[
        "lithology_source_role"
    ] = "fallback"

    result[
        "glim_litho_code"
    ] = (
        code or None
    )

    result[
        "glim_description"
    ] = (
        description or None
    )

    result[
        "glim_xx_description"
    ] = (
        clean_text(
            attributes.get(
                "xx_Description"
            )
        )
        or None
    )

    result[
        "glim_yy_description"
    ] = (
        clean_text(
            attributes.get(
                "yy_Description"
            )
        )
        or None
    )

    result[
        "glim_zz_description"
    ] = (
        clean_text(
            attributes.get(
                "zz_Description"
            )
        )
        or None
    )

    result[
        "lithology_class"
    ] = lithology_class

    result[
        "match_type"
    ] = "EXACT"

    result[
        "matched_features"
    ] = 1

    return result


# ============================================================
# QUALITY REPORT
# ============================================================

def build_quality_report(
    results: list[
        dict[str, Any]
    ],
) -> dict[str, Any]:

    total = len(
        results
    )

    positive_labels = {
        "1",
        "POSITIVE",
        "LANDSLIDE",
        "EVENT",
        "TRUE",
    }

    positive_results = [
        result
        for result in results
        if str(
            result.get(
                "label",
                "",
            )
        ).upper()
        in positive_labels
    ]

    background_results = [
        result
        for result in results
        if result not in positive_results
    ]

    exact = sum(
        result.get(
            "match_type"
        ) == "EXACT"
        for result in results
    )

    no_match = sum(
        result.get(
            "match_type"
        ) == "NO_MATCH"
        for result in results
    )

    missing = sum(
        result.get(
            "match_type"
        ) == "MISSING_COORDINATES"
        for result in results
    )

    invalid = sum(
        result.get(
            "match_type"
        ) == "INVALID_COORDINATES"
        for result in results
    )

    errors = sum(
        result.get(
            "match_type"
        ) == "ERROR"
        for result in results
    )

    multiple = sum(
        result.get(
            "match_type"
        )
        == "MULTIPLE_POLYGON_MATCH"
        for result in results
    )

    available = sum(
        bool(
            result.get(
                "lithology_class"
            )
            and result.get(
                "lithology_class"
            ) != "OTHER"
        )
        for result in results
    )

    other = sum(
        result.get(
            "lithology_class"
        ) == "OTHER"
        for result in results
    )

    positive_available = sum(
        bool(
            result.get(
                "lithology_class"
            )
            and result.get(
                "lithology_class"
            ) != "OTHER"
        )
        for result in positive_results
    )

    background_available = sum(
        bool(
            result.get(
                "lithology_class"
            )
            and result.get(
                "lithology_class"
            ) != "OTHER"
        )
        for result in background_results
    )

    class_counts: dict[
        str,
        int,
    ] = {}

    for result in results:

        class_name = result.get(
            "lithology_class"
        )

        if not class_name:
            continue

        class_counts[
            class_name
        ] = (
            class_counts.get(
                class_name,
                0,
            )
            + 1
        )

    coverage = (
        round(
            available
            / total
            * 100,
            2,
        )
        if total
        else 0.0
    )

    positive_coverage = (
        round(
            positive_available
            / len(
                positive_results
            )
            * 100,
            2,
        )
        if positive_results
        else 0.0
    )

    background_coverage = (
        round(
            background_available
            / len(
                background_results
            )
            * 100,
            2,
        )
        if background_results
        else 0.0
    )

    quality_pass = (
        total > 0
        and errors == 0
        and missing == 0
        and invalid == 0
        and no_match == 0
        and available == total
    )

    return {
        "version": "0.7",

        "generated_at_utc": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),

        "source": {
            "authoritative_intended_source":
                GSI_BHUKOSH_SOURCE,

            "fallback_source":
                GLIM_FALLBACK_SOURCE,

            "fallback_status":
                "USED_FOR_PREPROCESSING",

            "note": (
                "GLiM is used only as a fallback "
                "because the GSI Bhukosh lithology "
                "service is not reliably available "
                "from the preprocessing environment. "
                "GLiM is not represented as a GSI dataset."
            ),
        },

        "counts": {
            "total_records":
                total,

            "positive_records":
                len(
                    positive_results
                ),

            "background_records":
                len(
                    background_results
                ),

            "exact_matches":
                exact,

            "multiple_polygon_matches":
                multiple,

            "no_match":
                no_match,

            "missing_coordinates":
                missing,

            "invalid_coordinates":
                invalid,

            "request_errors":
                errors,

            "lithology_available":
                available,

            "other_class":
                other,
        },

        "coverage": {
            "overall_percent":
                coverage,

            "positive_percent":
                positive_coverage,

            "background_percent":
                background_coverage,
        },

        "lithology_classes":
            dict(
                sorted(
                    class_counts.items()
                )
            ),

        "quality": {
            "status": (
                "PASS"
                if quality_pass
                else "REVIEW"
            ),

            "requirements": {
                "no_request_errors":
                    errors == 0,

                "no_missing_coordinates":
                    missing == 0,

                "no_invalid_coordinates":
                    invalid == 0,

                "complete_polygon_coverage":
                    no_match == 0,

                "lithology_available_for_all":
                    available == total,
            },
        },

        "database_modified":
            False,
    }


# ============================================================
# RUNNER
# ============================================================

def run_lithology_features() -> dict[str, Any]:

    print("=" * 72)

    print(
        "BhooPehra - GSI Lithology Feature Builder"
    )

    print("=" * 72)

    print()

    print(
        f"Input:  {INPUT_FILE}"
    )

    print(
        f"Output: {OUTPUT_FILE}"
    )

    print(
        f"Quality: {QUALITY_FILE}"
    )

    print()

    records = (
        load_training_records()
    )

    print(
        f"Training records: "
        f"{len(records)}"
    )

    # --------------------------------------------------------
    # Fetch only Northeast GLiM polygons.
    # --------------------------------------------------------

    print()

    print(
        "Loading Northeast GLiM polygons..."
    )

    glim_features = (
        fetch_glim_features()
    )

    print()

    print(
        "Building local spatial index..."
    )

    spatial_features = (
        build_spatial_index(
            glim_features
        )
    )

    print(
        f"Usable GLiM geometries: "
        f"{len(spatial_features)}"
    )

    print()

    # --------------------------------------------------------
    # Process records.
    # --------------------------------------------------------

    results: list[
        dict[str, Any]
    ] = []

    for index, record in enumerate(
        records,
        start=1,
    ):

        result = process_record(
            record,
            spatial_features,
        )

        results.append(
            result
        )

        print(
            f"[{index:02d}/{len(records):02d}] "
            f"{result.get('record_id', 'UNKNOWN')} | "
            f"match={result.get('match_type')} | "
            f"code={result.get('glim_litho_code')} | "
            f"description={result.get('glim_description')} | "
            f"class={result.get('lithology_class')}"
        )

    # --------------------------------------------------------
    # Quality.
    # --------------------------------------------------------

    quality = (
        build_quality_report(
            results
        )
    )

    output_payload = {
        "version": "0.7",

        "generated_at_utc": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),

        "source": {
            "authoritative_intended_source":
                GSI_BHUKOSH_SOURCE,

            "fallback_source":
                GLIM_FALLBACK_SOURCE,

            "fallback_status":
                "USED_FOR_PREPROCESSING",

            "database_modified":
                False,
        },

        "feature_records":
            results,
    }

    DATA_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    with OUTPUT_FILE.open(
        "w",
        encoding="utf-8",
    ) as f:

        json.dump(
            output_payload,
            f,
            indent=2,
            ensure_ascii=False,
        )

    with QUALITY_FILE.open(
        "w",
        encoding="utf-8",
    ) as f:

        json.dump(
            quality,
            f,
            indent=2,
            ensure_ascii=False,
        )

    # --------------------------------------------------------
    # Report.
    # --------------------------------------------------------

    print()

    print("=" * 72)

    print(
        "LITHOLOGY QUALITY REPORT"
    )

    print("=" * 72)

    print(
        f"Total records: "
        f"{quality['counts']['total_records']}"
    )

    print(
        f"Positive: "
        f"{quality['counts']['positive_records']}"
    )

    print(
        f"Background: "
        f"{quality['counts']['background_records']}"
    )

    print(
        f"Exact matches: "
        f"{quality['counts']['exact_matches']}"
    )

    print(
        f"Multiple polygon matches: "
        f"{quality['counts']['multiple_polygon_matches']}"
    )

    print(
        f"No match: "
        f"{quality['counts']['no_match']}"
    )

    print(
        f"Missing coordinates: "
        f"{quality['counts']['missing_coordinates']}"
    )

    print(
        f"Invalid coordinates: "
        f"{quality['counts']['invalid_coordinates']}"
    )

    print(
        f"Request errors: "
        f"{quality['counts']['request_errors']}"
    )

    print(
        f"Lithology available: "
        f"{quality['counts']['lithology_available']}/"
        f"{quality['counts']['total_records']}"
    )

    print(
        f"Coverage: "
        f"{quality['coverage']['overall_percent']}%"
    )

    print()

    print(
        "LITHOLOGY CLASSES:"
    )

    for class_name, count in (
        quality[
            "lithology_classes"
        ].items()
    ):

        print(
            f"  {class_name}: {count}"
        )

    print()

    print(
        f"Overall quality: "
        f"{quality['quality']['status']}"
    )

    print(
        "Database modified: False"
    )

    print()

    print(
        "Authoritative intended source:"
    )

    print(
        f"  {GSI_BHUKOSH_SOURCE}"
    )

    print()

    print(
        "Fallback actually used:"
    )

    print(
        f"  {GLIM_FALLBACK_SOURCE}"
    )

    print()

    print("=" * 72)

    return output_payload


# ============================================================
# COMPATIBILITY
# ============================================================

def run_gsi_lithology_features():
    return run_lithology_features()


def print_lithology_report(
    payload: dict[str, Any],
) -> None:

    if not QUALITY_FILE.exists():

        print(
            f"Quality report not found: "
            f"{QUALITY_FILE}"
        )

        return

    with QUALITY_FILE.open(
        "r",
        encoding="utf-8",
    ) as f:

        quality = json.load(
            f
        )

    print(
        json.dumps(
            quality,
            indent=2,
            ensure_ascii=False,
        )
    )


# ============================================================
# CLI
# ============================================================

if __name__ == "__main__":
    run_lithology_features()