from __future__ import annotations

import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


BASE_DIR = Path(__file__).resolve().parents[2]
OUTPUT_DIR = BASE_DIR / "data" / "gsi"

INPUT_DATASET = OUTPUT_DIR / "gsi_training_feature_dataset.json"

OUTPUT_DATASET = OUTPUT_DIR / "gsi_training_lulc_features.json"

QUALITY_REPORT = OUTPUT_DIR / "bhuvan_lulc_quality.json"


# Official ISRO / NRSC Bhuvan WMS endpoint.
WMS_URL = "https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms"

LULC_SOURCE = "ISRO / NRSC Bhuvan LULC 50K 2015-16"

LULC_VERSION = "2015-16"

REQUEST_TIMEOUT = 60


# State-specific official Bhuvan LULC 50K 2015-16 layers.
NORTHEAST_LULC_LAYERS = {
    "Arunachal Pradesh": "lulc:AR_LULC50K_1516",
    "Assam": "lulc:AS_LULC50K_1516",
    "Manipur": "lulc:MN_LULC50K_1516",
    "Meghalaya": "lulc:ML_LULC50K_1516",
    "Mizoram": "lulc:MZ_LULC50K_1516",
    "Nagaland": "lulc:NL_LULC50K_1516",
    "Sikkim": "lulc:SK_LULC50K_1516",
    "Tripura": "lulc:TR_LULC50K_1516",
}


def save_json(
    path: Path,
    payload: dict[str, Any],
) -> None:
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with path.open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            payload,
            file,
            indent=2,
            ensure_ascii=False,
            default=str,
        )


def load_training_records() -> list[dict[str, Any]]:
    """
    Load the GSI training feature dataset.

    Current gsi_feature_builder output uses:
        feature_records

    Older versions may use:
        records
        samples
        features

    Support all known formats.
    """

    if not INPUT_DATASET.exists():
        raise FileNotFoundError(
            "Training feature dataset not found: "
            f"{INPUT_DATASET}"
        )

    with INPUT_DATASET.open(
        "r",
        encoding="utf-8",
    ) as file:
        payload = json.load(file)

    if isinstance(payload, dict):
        for key in (
            "feature_records",
            "records",
            "samples",
            "features",
        ):
            candidate = payload.get(key)

            if isinstance(candidate, list):
                return candidate

        raise ValueError(
            "Training dataset does not contain a supported "
            "record list. Expected one of: "
            "feature_records, records, samples, features."
        )

    if isinstance(payload, list):
        return payload

    raise ValueError(
        "Unsupported training dataset format."
    )


def is_background_record(
    record: dict[str, Any],
) -> bool:
    """
    Identify background samples.

    Current negative sampler uses:
        NEG-0001
        NEG-0002
        ...

    Earlier versions used:
        GSI_BACKGROUND_...

    Explicit machine-readable labels are also supported.
    """

    record_id = str(
        record.get("id")
        or record.get("record_id")
        or record.get("sample_id")
        or ""
    ).strip().upper()

    if record_id.startswith("NEG-"):
        return True

    if record_id.startswith(
        "GSI_BACKGROUND_"
    ):
        return True

    if record.get("label") == 0:
        return True

    if (
        str(
            record.get("label_name")
            or ""
        )
        .strip()
        .upper()
        == "BACKGROUND_CANDIDATE"
    ):
        return True

    return False


def normalize_lulc_class(
    raw_class: str | None,
    raw_label: str | None = None,
) -> str | None:
    """
    Normalize Bhuvan LULC descriptions into stable
    BhooPehra feature classes.
    """

    text_value = (
        raw_class
        or raw_label
        or ""
    ).strip().lower()

    if not text_value:
        return None

    if (
        "builtup" in text_value
        or "built-up" in text_value
        or "built up" in text_value
        or "urban" in text_value
        or "rural" in text_value
    ):
        return "BUILT_UP"

    if (
        "forest" in text_value
        or "plantation" in text_value
    ):
        return "FOREST"

    if (
        "agriculture" in text_value
        or "crop" in text_value
        or "cropland" in text_value
    ):
        return "AGRICULTURE"

    if (
        "barren" in text_value
        or "wasteland" in text_value
        or "scrub" in text_value
        or "rock" in text_value
    ):
        return "BARREN_ROCKY"

    if (
        "snow" in text_value
        or "glacier" in text_value
    ):
        return "SNOW_GLACIER"

    if (
        "water" in text_value
        or "wetland" in text_value
        or "river" in text_value
        or "stream" in text_value
        or "canal" in text_value
    ):
        return "WATER"

    if "grass" in text_value:
        return "GRASS_GRAZING"

    return "OTHER"


def extract_lulc_feature_info(
    feature: dict[str, Any],
) -> dict[str, Any]:
    """
    Extract LULC information from a GeoJSON-style
    GetFeature response when available.

    This helper is retained for compatibility with
    older Bhuvan responses.
    """

    properties = feature.get(
        "properties",
        {},
    )

    if not isinstance(
        properties,
        dict,
    ):
        properties = {}

    raw_values: list[str] = []

    preferred_fields = [
        "lulc",
        "LULC",
        "class",
        "CLASS",
        "classname",
        "CLASSNAME",
        "class_name",
        "Class_Name",
        "category",
        "CATEGORY",
        "label",
        "LABEL",
        "name",
        "NAME",
    ]

    for field in preferred_fields:
        value = properties.get(field)

        if value is None:
            continue

        value_string = str(value).strip()

        if (
            value_string
            and value_string not in raw_values
        ):
            raw_values.append(
                value_string
            )

    raw_class = (
        raw_values[0]
        if raw_values
        else None
    )

    normalized = normalize_lulc_class(
        raw_class
    )

    area_value = None

    area_fields = [
        "area_ha",
        "AREA_HA",
        "area",
        "AREA",
        "Shape_Area",
        "shape_area",
    ]

    for field in area_fields:
        if field not in properties:
            continue

        try:
            area_value = float(
                properties[field]
            )
            break
        except (
            TypeError,
            ValueError,
        ):
            continue

    return {
        "raw_class": raw_class,
        "normalized_class": normalized,
        "area_ha": area_value,
        "properties": properties,
    }


def clean_html_text(
    value: str,
) -> str:
    """
    Convert simple HTML content into plain text.
    """

    value = html.unescape(value)

    value = re.sub(
        r"<[^>]+>",
        " ",
        value,
    )

    value = re.sub(
        r"\s+",
        " ",
        value,
    )

    return value.strip()


def parse_bhuvan_getfeatureinfo_html(
    content: str,
) -> list[dict[str, Any]]:
    """
    Parse the HTML returned by Bhuvan WMS GetFeatureInfo.

    Example response:

        <td><b>Feature ID</b></td>
        <td><b>Description</b></td>
        <td><b>Area(ha)</b></td>

        <td>AR_LULC50K_1516.35045</td>
        <td>Forest,Scrub Forest</td>
        <td>0.04003940566</td>

    Returns one dictionary per returned LULC feature.
    """

    content = html.unescape(content)

    rows = re.findall(
        r"<tr[^>]*>(.*?)</tr>",
        content,
        flags=re.IGNORECASE | re.DOTALL,
    )

    parsed_features: list[dict[str, Any]] = []

    for row in rows:
        cells = re.findall(
            r"<t[dh][^>]*>(.*?)</t[dh]>",
            row,
            flags=re.IGNORECASE | re.DOTALL,
        )

        values = [
            clean_html_text(cell)
            for cell in cells
        ]

        values = [
            value
            for value in values
            if value
        ]

        if len(values) < 2:
            continue

        lowered = [
            value.lower()
            for value in values
        ]

        # Skip the table header.
        if (
            "feature id" in lowered
            or "description" in lowered
        ):
            continue

        feature_id = values[0]

        description = values[1]

        area_ha = None

        if len(values) >= 3:
            try:
                area_ha = float(
                    values[2]
                    .replace(",", "")
                )
            except (
                TypeError,
                ValueError,
            ):
                area_ha = None

        parsed_features.append(
            {
                "feature_id": feature_id,
                "raw_class": description,
                "normalized_class": normalize_lulc_class(
                    description
                ),
                "area_ha": area_ha,
            }
        )

    return parsed_features


def build_getfeatureinfo_params(
    layer: str,
    latitude: float,
    longitude: float,
) -> dict[str, Any]:
    """
    Build an official Bhuvan WMS GetFeatureInfo request.

    A small bbox is used around the training point.
    The center pixel is queried.
    """

    delta = 0.002

    min_lon = longitude - delta
    min_lat = latitude - delta
    max_lon = longitude + delta
    max_lat = latitude + delta

    width = 256
    height = 256

    return {
        "service": "WMS",
        "version": "1.1.1",
        "request": "GetFeatureInfo",
        "layers": layer,
        "query_layers": layer,
        "styles": "",
        "srs": "EPSG:4326",
        "bbox": (
            f"{min_lon},"
            f"{min_lat},"
            f"{max_lon},"
            f"{max_lat}"
        ),
        "width": width,
        "height": height,
        "x": width // 2,
        "y": height // 2,
        "info_format": "text/html",
        "feature_count": 10,
    }


def extract_lulc_for_record(
    record: dict[str, Any],
) -> dict[str, Any]:
    """
    Query official Bhuvan LULC through WMS GetFeatureInfo.

    Important:
    Bhuvan's tested endpoint is WMS. It does not use
    WFS GetFeature for this extraction workflow.
    """

    latitude = record.get("latitude")
    longitude = record.get("longitude")

    state = str(
        record.get("state")
        or ""
    ).strip()

    if latitude is None or longitude is None:
        return {
            "lulc_available": False,
            "lulc_match_status": "MISSING_COORDINATES",
            "state_resolution_status": (
                "STATE_UNRESOLVED"
                if not state
                else "SOURCE_RECORD_STATE"
            ),
            "lulc_class": None,
            "lulc_raw_classes": [],
            "lulc_features": [],
            "lulc_layer": None,
        }

    if not state:
        return {
            "lulc_available": False,
            "lulc_match_status": "STATE_UNRESOLVED",
            "state_resolution_status": (
                "STATE_UNRESOLVED"
            ),
            "lulc_class": None,
            "lulc_raw_classes": [],
            "lulc_features": [],
            "lulc_layer": None,
        }

    layer = NORTHEAST_LULC_LAYERS.get(
        state
    )

    if not layer:
        return {
            "lulc_available": False,
            "lulc_match_status": "STATE_UNSUPPORTED",
            "state_resolution_status": (
                "SOURCE_RECORD_STATE"
            ),
            "lulc_class": None,
            "lulc_raw_classes": [],
            "lulc_features": [],
            "lulc_layer": None,
        }

    try:
        latitude_value = float(
            latitude
        )

        longitude_value = float(
            longitude
        )
    except (
        TypeError,
        ValueError,
    ):
        return {
            "lulc_available": False,
            "lulc_match_status": "INVALID_COORDINATES",
            "state_resolution_status": (
                "SOURCE_RECORD_STATE"
            ),
            "lulc_class": None,
            "lulc_raw_classes": [],
            "lulc_features": [],
            "lulc_layer": layer,
        }

    if not (
        -90 <= latitude_value <= 90
        and -180 <= longitude_value <= 180
    ):
        return {
            "lulc_available": False,
            "lulc_match_status": "INVALID_COORDINATES",
            "state_resolution_status": (
                "SOURCE_RECORD_STATE"
            ),
            "lulc_class": None,
            "lulc_raw_classes": [],
            "lulc_features": [],
            "lulc_layer": layer,
        }

    params = build_getfeatureinfo_params(
        layer=layer,
        latitude=latitude_value,
        longitude=longitude_value,
    )

    try:
        response = requests.get(
            WMS_URL,
            params=params,
            timeout=REQUEST_TIMEOUT,
            headers={
                "User-Agent": (
                    "BhooPehra/0.1 "
                    "(LULC feature extraction)"
                ),
                "Accept": (
                    "text/html,"
                    "application/xhtml+xml,"
                    "application/xml;q=0.9,"
                    "*/*;q=0.8"
                ),
            },
        )

        response.raise_for_status()

    except Exception as exc:
        return {
            "lulc_available": False,
            "lulc_match_status": "REQUEST_ERROR",
            "state_resolution_status": (
                "SOURCE_RECORD_STATE"
            ),
            "lulc_class": None,
            "lulc_raw_classes": [],
            "lulc_features": [],
            "lulc_layer": layer,
            "error": str(exc),
        }

    content_type = (
        response.headers.get(
            "Content-Type",
            "",
        )
        .lower()
    )

    response_text = response.text

    if not response_text.strip():
        return {
            "lulc_available": False,
            "lulc_match_status": "EMPTY_RESPONSE",
            "state_resolution_status": (
                "SOURCE_RECORD_STATE"
            ),
            "lulc_class": None,
            "lulc_raw_classes": [],
            "lulc_features": [],
            "lulc_layer": layer,
            "content_type": content_type,
        }

    # Bhuvan currently returns HTML for the tested
    # GetFeatureInfo request.
    extracted_features = (
        parse_bhuvan_getfeatureinfo_html(
            response_text
        )
    )

    # Compatibility fallback:
    # Some GeoServer configurations can return JSON
    # if the info_format is changed in the future.
    if not extracted_features:
        try:
            payload = response.json()

            if isinstance(payload, dict):
                features = payload.get(
                    "features",
                    [],
                )

                if isinstance(
                    features,
                    list,
                ):
                    for feature in features:
                        if not isinstance(
                            feature,
                            dict,
                        ):
                            continue

                        info = (
                            extract_lulc_feature_info(
                                feature
                            )
                        )

                        extracted_features.append(
                            {
                                "feature_id": feature.get(
                                    "id"
                                ),
                                "raw_class": info.get(
                                    "raw_class"
                                ),
                                "normalized_class": info.get(
                                    "normalized_class"
                                ),
                                "area_ha": info.get(
                                    "area_ha"
                                ),
                            }
                        )
        except Exception:
            pass

    if not extracted_features:
        # If GeoServer explicitly returned a valid
        # GetFeatureInfo page but no feature was found,
        # classify it as NO_FEATURE rather than a
        # generic request error.
        return {
            "lulc_available": False,
            "lulc_match_status": "NO_FEATURE",
            "state_resolution_status": (
                "SOURCE_RECORD_STATE"
            ),
            "lulc_class": None,
            "lulc_raw_classes": [],
            "lulc_features": [],
            "lulc_layer": layer,
            "content_type": content_type,
        }

    normalized_classes = [
        item.get(
            "normalized_class"
        )
        for item in extracted_features
        if item.get(
            "normalized_class"
        )
    ]

    raw_classes = [
        item.get(
            "raw_class"
        )
        for item in extracted_features
        if item.get(
            "raw_class"
        )
    ]

    # Prefer the class with the largest reported
    # area when multiple features are returned.
    selected_class = None

    area_features = [
        item
        for item in extracted_features
        if item.get("area_ha") is not None
        and item.get(
            "normalized_class"
        )
    ]

    if area_features:
        area_features.sort(
            key=lambda item: (
                item.get(
                    "area_ha"
                )
                or 0.0
            ),
            reverse=True,
        )

        selected_class = (
            area_features[0].get(
                "normalized_class"
            )
        )

    elif normalized_classes:
        selected_class = (
            normalized_classes[0]
        )

    return {
        "lulc_available": bool(
            selected_class
            or raw_classes
        ),
        "lulc_match_status": (
            "SUCCESS"
            if (
                selected_class
                or raw_classes
            )
            else "NO_CLASS"
        ),
        "state_resolution_status": (
            "SOURCE_RECORD_STATE"
        ),
        "lulc_class": selected_class,
        "lulc_raw_classes": raw_classes,
        "lulc_features": extracted_features,
        "lulc_layer": layer,
        "content_type": content_type,
    }


def enrich_record(
    record: dict[str, Any],
    extraction: dict[str, Any],
) -> dict[str, Any]:
    """
    Merge LULC extraction fields into the original
    training record.
    """

    enriched = dict(record)

    enriched.update(
        {
            "lulc_available": extraction.get(
                "lulc_available",
                False,
            ),
            "lulc_match_status": extraction.get(
                "lulc_match_status"
            ),
            "state_resolution_status": extraction.get(
                "state_resolution_status"
            ),
            "lulc_class": extraction.get(
                "lulc_class"
            ),
            "lulc_raw_classes": extraction.get(
                "lulc_raw_classes",
                [],
            ),
            "lulc_features": extraction.get(
                "lulc_features",
                [],
            ),
            "lulc_layer": extraction.get(
                "lulc_layer"
            ),
            "lulc_source": LULC_SOURCE,
            "lulc_version": LULC_VERSION,
        }
    )

    if extraction.get(
        "content_type"
    ):
        enriched["lulc_content_type"] = (
            extraction.get(
                "content_type"
            )
        )

    if extraction.get("error"):
        enriched["lulc_error"] = (
            extraction["error"]
        )

    return enriched


def build_quality_report(
    records: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Build a reproducible quality report.
    """

    total = len(records)

    positives = [
        record
        for record in records
        if not is_background_record(
            record
        )
    ]

    backgrounds = [
        record
        for record in records
        if is_background_record(
            record
        )
    ]

    available = sum(
        1
        for record in records
        if record.get(
            "lulc_available"
        )
    )

    positive_available = sum(
        1
        for record in positives
        if record.get(
            "lulc_available"
        )
    )

    background_available = sum(
        1
        for record in backgrounds
        if record.get(
            "lulc_available"
        )
    )

    unresolved_background_states = sum(
        1
        for record in backgrounds
        if record.get(
            "state_resolution_status"
        )
        == "STATE_UNRESOLVED"
    )

    no_feature = sum(
        1
        for record in records
        if record.get(
            "lulc_match_status"
        )
        == "NO_FEATURE"
    )

    request_errors = sum(
        1
        for record in records
        if record.get(
            "lulc_match_status"
        )
        == "REQUEST_ERROR"
    )

    missing_coordinates = sum(
        1
        for record in records
        if record.get(
            "lulc_match_status"
        )
        == "MISSING_COORDINATES"
    )

    invalid_coordinates = sum(
        1
        for record in records
        if record.get(
            "lulc_match_status"
        )
        == "INVALID_COORDINATES"
    )

    classes: dict[str, int] = {}

    for record in records:
        lulc_class = record.get(
            "lulc_class"
        )

        if lulc_class:
            classes[lulc_class] = (
                classes.get(
                    lulc_class,
                    0,
                )
                + 1
            )

    coverage_percent = (
        round(
            available / total * 100,
            2,
        )
        if total
        else 0.0
    )

    if total and available == total:
        overall_status = "PASS"

    elif available:
        overall_status = (
            "PARTIAL_COVERAGE_REVIEW"
        )

    else:
        overall_status = "FAIL"

    return {
        "status": "success",
        "overall_status": overall_status,
        "source": LULC_SOURCE,
        "service": WMS_URL,
        "dataset": (
            "Bhuvan LULC 50K 2015-16"
        ),
        "total_records": total,
        "positive_records": len(
            positives
        ),
        "background_records": len(
            backgrounds
        ),
        "lulc_available": available,
        "lulc_missing": (
            total - available
        ),
        "coverage_percent": coverage_percent,
        "positive_lulc_available": (
            positive_available
        ),
        "background_lulc_available": (
            background_available
        ),
        "background_states_unresolved": (
            unresolved_background_states
        ),
        "no_feature": no_feature,
        "request_errors": request_errors,
        "missing_coordinates": (
            missing_coordinates
        ),
        "invalid_coordinates": (
            invalid_coordinates
        ),
        "normalized_class_counts": dict(
            sorted(
                classes.items()
            )
        ),
        "provenance_note": (
            "LULC observations are retrieved "
            "from ISRO/NRSC Bhuvan LULC 50K "
            "2015-16 state-specific layers "
            "through WMS GetFeatureInfo. "
            "Background samples use the state "
            "already attached by the BhooPehra "
            "negative sampler. No state is guessed "
            "from a bounding box."
        ),
        "background_label_definition": (
            "Records beginning with NEG- or "
            "GSI_BACKGROUND_, or explicitly "
            "labelled label=0 / "
            "BACKGROUND_CANDIDATE, are treated "
            "as background records."
        ),
        "database_modified": False,
    }


def run_lulc_extraction() -> dict[str, Any]:
    """
    Main LULC extraction pipeline.

    This process is read-only with respect to
    PostgreSQL/PostGIS.
    """

    print()
    print("=" * 72)
    print(
        "BhooPehra - Bhuvan LULC Feature Extraction"
    )
    print("=" * 72)

    print()
    print("Official source:")
    print(LULC_SOURCE)
    print(WMS_URL)

    print()
    print("Extraction method:")
    print(
        "WMS GetFeatureInfo / HTML response"
    )

    print()
    print("State resolution:")
    print(
        "Source-record state / "
        "negative-sampler state only."
    )

    print(
        "No remote NIC boundary API."
    )

    print()
    print(
        "Database modification: NO"
    )

    records = load_training_records()

    print()
    print(
        f"Training records: {len(records)}"
    )

    positives_count = sum(
        1
        for record in records
        if not is_background_record(
            record
        )
    )

    backgrounds_count = sum(
        1
        for record in records
        if is_background_record(
            record
        )
    )

    print(
        f"Positive records detected: "
        f"{positives_count}"
    )

    print(
        f"Background records detected: "
        f"{backgrounds_count}"
    )

    if len(records) != (
        positives_count
        + backgrounds_count
    ):
        raise RuntimeError(
            "Record classification count mismatch."
        )

    enriched_records: list[
        dict[str, Any]
    ] = []

    for index, record in enumerate(
        records,
        start=1,
    ):
        record_id = str(
            record.get("id")
            or record.get("record_id")
            or record.get("sample_id")
            or f"RECORD-{index}"
        )

        record_type = (
            "BACKGROUND"
            if is_background_record(
                record
            )
            else "POSITIVE"
        )

        print(
            f"[{index}/{len(records)}] "
            f"{record_id} "
            f"({record_type})"
        )

        state = str(
            record.get("state")
            or ""
        ).strip()

        if state:
            print(
                f"  State: {state}"
            )
        else:
            print(
                "  State: UNRESOLVED"
            )

        latitude = record.get(
            "latitude"
        )

        longitude = record.get(
            "longitude"
        )

        if (
            latitude is not None
            and longitude is not None
        ):
            print(
                "  Coordinates: "
                f"{latitude}, {longitude}"
            )

        extraction = (
            extract_lulc_for_record(
                record
            )
        )

        enriched = enrich_record(
            record,
            extraction,
        )

        enriched_records.append(
            enriched
        )

        if extraction.get(
            "lulc_match_status"
        ) == "SUCCESS":
            print(
                "  Layer: "
                f"{extraction.get('lulc_layer')}"
            )

            print(
                "  LULC status: SUCCESS"
            )

            for item in extraction.get(
                "lulc_features",
                [],
            ):
                raw_class = item.get(
                    "raw_class"
                )

                area = item.get(
                    "area_ha"
                )

                feature_id = item.get(
                    "feature_id"
                )

                if area is not None:
                    print(
                        "  LULC: "
                        f"{raw_class} "
                        f"| area={area} ha "
                        f"| feature={feature_id}"
                    )
                else:
                    print(
                        "  LULC: "
                        f"{raw_class} "
                        f"| feature={feature_id}"
                    )

            print(
                "  Normalized class: "
                f"{extraction.get('lulc_class')}"
            )

        else:
            print(
                "  LULC status: "
                f"{extraction.get('lulc_match_status')}"
            )

            if extraction.get(
                "error"
            ):
                print(
                    "  Error: "
                    f"{extraction.get('error')}"
                )

        print()

    quality_report = (
        build_quality_report(
            enriched_records
        )
    )

    dataset_payload = {
        "dataset": (
            "BhooPehra Training LULC Features"
        ),
        "version": "0.4",
        "generated_at_utc": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),
        "source": LULC_SOURCE,
        "service": WMS_URL,
        "extraction_method": (
            "WMS GetFeatureInfo"
        ),
        "database_modified": False,
        "input_record_key": (
            "feature_records"
        ),
        "records": enriched_records,
    }

    save_json(
        OUTPUT_DATASET,
        dataset_payload,
    )

    save_json(
        QUALITY_REPORT,
        quality_report,
    )

    print()
    print("=" * 72)
    print(
        "BhooPehra - LULC Feature Report"
    )
    print("=" * 72)

    print(
        f"Total records: "
        f"{quality_report['total_records']}"
    )

    print(
        f"Positive records: "
        f"{quality_report['positive_records']}"
    )

    print(
        f"Background records: "
        f"{quality_report['background_records']}"
    )

    print(
        f"LULC available: "
        f"{quality_report['lulc_available']}"
    )

    print(
        f"LULC missing: "
        f"{quality_report['lulc_missing']}"
    )

    print(
        f"Coverage: "
        f"{quality_report['coverage_percent']}%"
    )

    print(
        f"Positive LULC available: "
        f"{quality_report['positive_lulc_available']}"
    )

    print(
        f"Background LULC available: "
        f"{quality_report['background_lulc_available']}"
    )

    print(
        f"Background states unresolved: "
        f"{quality_report['background_states_unresolved']}"
    )

    print(
        f"No feature: "
        f"{quality_report['no_feature']}"
    )

    print(
        f"Request errors: "
        f"{quality_report['request_errors']}"
    )

    print(
        f"Missing coordinates: "
        f"{quality_report['missing_coordinates']}"
    )

    print(
        f"Invalid coordinates: "
        f"{quality_report['invalid_coordinates']}"
    )

    print()
    print(
        "Normalized LULC classes:"
    )

    for (
        lulc_class,
        count,
    ) in quality_report[
        "normalized_class_counts"
    ].items():
        print(
            f"  {lulc_class}: {count}"
        )

    print()
    print(
        "Overall quality status: "
        f"{quality_report['overall_status']}"
    )

    print()
    print(
        "LULC dataset:"
    )

    print(
        OUTPUT_DATASET
    )

    print()
    print(
        "Quality report:"
    )

    print(
        QUALITY_REPORT
    )

    print()
    print(
        "IMPORTANT:"
    )

    print(
        "Bhuvan is queried through "
        "WMS GetFeatureInfo."
    )

    print(
        "No WFS GetFeature request is used."
    )

    print(
        "No remote state-boundary service is called."
    )

    print(
        "No state is guessed from a bounding box."
    )

    print(
        "Records without a source state are explicitly "
        "marked STATE_UNRESOLVED."
    )

    print(
        "PostgreSQL/PostGIS was not modified."
    )

    print("=" * 72)
    print()

    return {
        "status": "success",
        "dataset_file": str(
            OUTPUT_DATASET
        ),
        "quality_report_file": str(
            QUALITY_REPORT
        ),
        "quality_report": quality_report,
    }


if __name__ == "__main__":
    run_lulc_extraction()