from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import requests


BASE_DIR = Path(__file__).resolve().parents[2]

INPUT_DATASET = (
    BASE_DIR
    / "data"
    / "gsi"
    / "gsi_training_lithology_features.json"
)

OUTPUT_FILE = (
    BASE_DIR
    / "data"
    / "gsi"
    / "bhuvan_lulc_probe.json"
)

WMS_URL = (
    "https://bhuvan-vec2.nrsc.gov.in/"
    "bhuvan/wms"
)

USER_AGENT = (
    "BhooPehra/0.1 "
    "(landslide-research-prototype)"
)

STATE_LAYERS = {
    "Arunachal Pradesh": "AR_LULC50K_1516",
    "Assam": "AS_LULC50K_1516",
    "Meghalaya": "ML_LULC50K_1516",
    "Manipur": "MN_LULC50K_1516",
    "Mizoram": "MZ_LULC50K_1516",
    "Nagaland": "NL_LULC50K_1516",
    "Sikkim": "SK_LULC50K_1516",
    "Tripura": "TR_LULC50K_1516",
}

# Approximate half-size of the GetFeatureInfo
# probe window in degrees.
PROBE_HALF_SIZE = 0.02


def load_records() -> list[dict[str, Any]]:
    if not INPUT_DATASET.exists():
        raise FileNotFoundError(
            f"Input dataset not found: "
            f"{INPUT_DATASET}"
        )

    with INPUT_DATASET.open(
        "r",
        encoding="utf-8",
    ) as handle:
        payload = json.load(handle)

    records = payload.get(
        "records"
    )

    if not isinstance(
        records,
        list,
    ):
        raise ValueError(
            "Input dataset does not contain "
            "a valid records list."
        )

    return records


def write_json(
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
    ) as handle:
        json.dump(
            payload,
            handle,
            indent=2,
            ensure_ascii=False,
        )


def test_wms_capabilities(
    session: requests.Session,
) -> dict[str, Any]:

    params = {
        "service": "WMS",
        "request": "GetCapabilities",
        "version": "1.1.1",
    }

    result = {
        "success": False,
        "status_code": None,
        "content_type": None,
        "url": None,
        "error": None,
    }

    try:
        response = session.get(
            WMS_URL,
            params=params,
            timeout=30,
        )

        result[
            "status_code"
        ] = response.status_code

        result[
            "content_type"
        ] = response.headers.get(
            "Content-Type"
        )

        result[
            "url"
        ] = response.url

        result[
            "success"
        ] = (
            response.status_code == 200
            and len(response.content) > 0
        )

        if result["success"]:

            text = response.text

            result[
                "response_size"
            ] = len(
                response.content
            )

            result[
                "contains_lulc"
            ] = (
                "LULC50K"
                in text
            )

        return result

    except Exception as exc:

        result[
            "error"
        ] = str(exc)

        return result


def build_bbox(
    longitude: float,
    latitude: float,
) -> str:

    return ",".join(
        [
            f"{longitude - PROBE_HALF_SIZE:.8f}",
            f"{latitude - PROBE_HALF_SIZE:.8f}",
            f"{longitude + PROBE_HALF_SIZE:.8f}",
            f"{latitude + PROBE_HALF_SIZE:.8f}",
        ]
    )


def query_lulc(
    session: requests.Session,
    layer: str,
    latitude: float,
    longitude: float,
) -> dict[str, Any]:

    bbox = build_bbox(
        longitude,
        latitude,
    )

    params = {
        "service": "WMS",
        "version": "1.1.1",
        "request": "GetFeatureInfo",
        "layers": (
            f"lulc:{layer}"
        ),
        "query_layers": (
            f"lulc:{layer}"
        ),
        "styles": "",
        "bbox": bbox,
        "width": "101",
        "height": "101",
        "srs": "EPSG:4326",
        "x": "50",
        "y": "50",
        "info_format": "text/html",
        "feature_count": "10",
    }

    response = session.get(
        WMS_URL,
        params=params,
        timeout=30,
    )

    result = {
        "layer": layer,
        "status_code": response.status_code,
        "content_type": response.headers.get(
            "Content-Type"
        ),
        "response_size": len(
            response.content
        ),
        "url": response.url,
        "success": False,
        "response_preview": "",
        "error": None,
    }

    if response.status_code != 200:
        result[
            "response_preview"
        ] = response.text[:2000]

        return result

    text = response.text

    result[
        "response_preview"
    ] = text[:5000]

    result[
        "success"
    ] = (
        len(
            response.content
        )
        > 0
    )

    return result


def main() -> None:

    print(
        "\nBhooPehra - Bhuvan LULC "
        "Source Probe"
    )

    print(
        "\nOfficial source:"
    )

    print(
        "ISRO / NRSC Bhuvan "
        "LULC 50K 2015-16"
    )

    print(
        WMS_URL
    )

    records = load_records()

    print(
        f"\nTraining records available: "
        f"{len(records)}"
    )

    session = requests.Session()

    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
        }
    )

    # ---------------------------------------------
    # 1. Test GetCapabilities
    # ---------------------------------------------

    print(
        "\nTesting WMS GetCapabilities..."
    )

    capabilities = (
        test_wms_capabilities(
            session
        )
    )

    print(
        f"Status: "
        f"{capabilities['status_code']}"
    )

    print(
        f"Content-Type: "
        f"{capabilities['content_type']}"
    )

    print(
        f"Success: "
        f"{capabilities['success']}"
    )

    if capabilities.get(
        "error"
    ):
        print(
            f"Error: "
            f"{capabilities['error']}"
        )

    # ---------------------------------------------
    # 2. Pick one sample per available state.
    # ---------------------------------------------

    state_samples: dict[
        str,
        dict[str, Any],
    ] = {}

    for record in records:

        state = record.get(
            "state"
        )

        if (
            state in STATE_LAYERS
            and state
            not in state_samples
        ):
            state_samples[
                state
            ] = record

    print(
        "\nState samples selected:"
    )

    for state in sorted(
        state_samples
    ):

        record = state_samples[
            state
        ]

        print(
            f"  {state}: "
            f"{record.get('sample_id')}"
        )

    # ---------------------------------------------
    # 3. Query one LULC layer per state.
    # ---------------------------------------------

    probe_results = []

    for state in sorted(
        state_samples
    ):

        record = state_samples[
            state
        ]

        layer = STATE_LAYERS[
            state
        ]

        latitude = record.get(
            "latitude"
        )

        longitude = record.get(
            "longitude"
        )

        print(
            f"\nTesting {state}"
        )

        print(
            f"  Layer: "
            f"lulc:{layer}"
        )

        print(
            f"  Point: "
            f"{latitude}, "
            f"{longitude}"
        )

        if (
            latitude is None
            or longitude is None
        ):

            print(
                "  Missing coordinates."
            )

            probe_results.append(
                {
                    "state": state,
                    "layer": layer,
                    "success": False,
                    "error": (
                        "Missing coordinates"
                    ),
                }
            )

            continue

        try:

            result = query_lulc(
                session,
                layer,
                float(latitude),
                float(longitude),
            )

            result[
                "state"
            ] = state

            result[
                "sample_id"
            ] = (
                record.get(
                    "sample_id"
                )
            )

            probe_results.append(
                result
            )

            print(
                f"  HTTP: "
                f"{result['status_code']}"
            )

            print(
                f"  Type: "
                f"{result['content_type']}"
            )

            print(
                f"  Bytes: "
                f"{result['response_size']}"
            )

            print(
                f"  Success: "
                f"{result['success']}"
            )

            preview = result.get(
                "response_preview",
                "",
            )

            if preview:
                print(
                    "\n  Response preview:"
                )

                compact = (
                    preview
                    .replace(
                        "\n",
                        " ",
                    )
                    .replace(
                        "\r",
                        " ",
                    )
                )

                print(
                    compact[:1000]
                )

        except Exception as exc:

            print(
                f"  ERROR: {exc}"
            )

            probe_results.append(
                {
                    "state": state,
                    "layer": layer,
                    "success": False,
                    "error": str(exc),
                }
            )

    successful = sum(
        1
        for result in probe_results
        if result.get(
            "success"
        )
    )

    result = {
        "status": (
            "PASS"
            if successful > 0
            else "FAILED"
        ),
        "source": (
            "ISRO / NRSC Bhuvan "
            "LULC 50K"
        ),
        "dataset_cycle": (
            "2015-16"
        ),
        "wms_url": WMS_URL,
        "state_layers": STATE_LAYERS,
        "capabilities_test": capabilities,
        "state_probe_results": (
            probe_results
        ),
        "successful_state_probes": (
            successful
        ),
        "total_state_probes": (
            len(probe_results)
        ),
        "notes": [
            (
                "This probe does not modify "
                "the PostgreSQL database."
            ),
            (
                "No LULC values are invented."
            ),
            (
                "The next extraction step will "
                "only proceed if the Bhuvan WMS "
                "returns usable point information."
            ),
        ],
    }

    write_json(
        OUTPUT_FILE,
        result,
    )

    print(
        "\nProbe report:"
    )

    print(
        OUTPUT_FILE
    )

    print(
        "\nDatabase was not modified."
    )


if __name__ == "__main__":
    main()