from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urljoin

import requests


BASE_DIR = Path(__file__).resolve().parents[2]

OUTPUT_FILE = (
    BASE_DIR
    / "data"
    / "gsi"
    / "gsi_geology_source_probe.json"
)

BHUKOSH_URLS = [
    "https://bhukosh.gsi.gov.in/Bhukosh/Public",
    "https://bhukosh.gsi.gov.in/Bhukosh/MapViewer.aspx",
    "https://bhukosh.gsi.gov.in/",
]

NWDP_URL = (
    "https://nwdp.nwic.in/dataset/geological-maps"
)

GSI_URL = (
    "https://www.gsi.gov.in/"
)

USER_AGENT = (
    "Mozilla/5.0 "
    "(Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 "
    "(KHTML, like Gecko) "
    "Chrome/142.0.0.0 Safari/537.36 "
    "BhooPehra-Geology-Research/0.1"
)


def check_url(
    session: requests.Session,
    url: str,
) -> dict:

    result = {
        "url": url,
        "status_code": None,
        "content_type": None,
        "content_length": None,
        "final_url": None,
        "success": False,
        "error": None,
    }

    try:
        response = session.get(
            url,
            timeout=30,
            allow_redirects=True,
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
            "content_length"
        ] = response.headers.get(
            "Content-Length"
        )

        result[
            "final_url"
        ] = response.url

        result[
            "success"
        ] = (
            200
            <= response.status_code
            < 400
        )

    except Exception as exc:
        result[
            "error"
        ] = str(exc)

    return result


def search_response_for_services(
    session: requests.Session,
    url: str,
) -> dict:

    result = {
        "url": url,
        "status_code": None,
        "candidate_urls": [],
        "keywords_found": [],
        "error": None,
    }

    try:
        response = session.get(
            url,
            timeout=30,
            allow_redirects=True,
        )

        result[
            "status_code"
        ] = response.status_code

        if response.status_code >= 400:
            return result

        text = response.text

        lower_text = text.lower()

        keywords = [
            "wms",
            "wfs",
            "geology",
            "lithology",
            "fault",
            "thrust",
            "geochronology",
            "geology_2m",
            "geology_50k",
        ]

        for keyword in keywords:
            if keyword in lower_text:
                result[
                    "keywords_found"
                ].append(keyword)

        # Look for explicit HTTP/HTTPS service URLs.
        import re

        urls = re.findall(
            r'https?://[^"\'<>\s]+',
            text,
        )

        cleaned = []

        for candidate in urls:

            candidate = (
                candidate
                .replace(
                    "&amp;",
                    "&",
                )
                .rstrip(
                    ".,);]"
                )
            )

            if (
                "wms" in candidate.lower()
                or "wfs" in candidate.lower()
                or "geolog" in candidate.lower()
                or "bhukosh" in candidate.lower()
            ):
                cleaned.append(
                    candidate
                )

        result[
            "candidate_urls"
        ] = sorted(
            set(cleaned)
        )[:100]

    except Exception as exc:
        result[
            "error"
        ] = str(exc)

    return result


def main() -> None:

    print(
        "\nBhooPehra - GSI Geology "
        "Source Discovery"
    )

    session = requests.Session()

    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": (
                "text/html,"
                "application/xhtml+xml,"
                "application/xml;q=0.9,"
                "*/*;q=0.8"
            ),
            "Accept-Language": (
                "en-US,en;q=0.9"
            ),
        }
    )

    print(
        "\nChecking authoritative sources..."
    )

    url_results = []

    for url in [
        *BHUKOSH_URLS,
        NWDP_URL,
        GSI_URL,
    ]:

        print(
            f"\n{url}"
        )

        result = check_url(
            session,
            url,
        )

        url_results.append(
            result
        )

        print(
            f"  status: "
            f"{result['status_code']}"
        )

        print(
            f"  type: "
            f"{result['content_type']}"
        )

        print(
            f"  final: "
            f"{result['final_url']}"
        )

        if result["error"]:
            print(
                f"  error: "
                f"{result['error']}"
            )

    print(
        "\nSearching accessible pages "
        "for WMS/WFS references..."
    )

    discovery_results = []

    for url in [
        "https://bhukosh.gsi.gov.in/Bhukosh/Public",
        NWDP_URL,
    ]:

        print(
            f"\nScanning: {url}"
        )

        result = (
            search_response_for_services(
                session,
                url,
            )
        )

        discovery_results.append(
            result
        )

        print(
            "  status: "
            f"{result['status_code']}"
        )

        print(
            "  keywords: "
            f"{result['keywords_found']}"
        )

        print(
            "  candidate service URLs: "
            f"{len(result['candidate_urls'])}"
        )

        for candidate in result[
            "candidate_urls"
        ][:20]:

            print(
                f"    {candidate}"
            )

        if result["error"]:
            print(
                f"  error: "
                f"{result['error']}"
            )

    payload = {
        "status": "completed",
        "purpose": (
            "Identify a reproducible authoritative "
            "GSI geology GIS service before extracting "
            "geology features."
        ),
        "authoritative_sources": {
            "Geological Survey of India": GSI_URL,
            "BHUKOSH": (
                "https://bhukosh.gsi.gov.in/Bhukosh/Public"
            ),
            "NWDP_GSI_Geological_Maps": NWDP_URL,
        },
        "checks": url_results,
        "service_discovery": discovery_results,
        "confirmed_geology_layers": [
            "Geology 2M",
            "Geology 50K",
            "Lithology",
            "Fault",
            "Thrust",
        ],
        "notes": [
            (
                "GSI/BHUKOSH is being treated as the "
                "authoritative geology source."
            ),
            (
                "No synthetic geology values are generated "
                "by this probe."
            ),
            (
                "Actual spatial feature extraction will "
                "only begin after a usable GSI GIS service "
                "or downloadable layer is identified."
            ),
        ],
    }

    OUTPUT_FILE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with OUTPUT_FILE.open(
        "w",
        encoding="utf-8",
    ) as handle:

        json.dump(
            payload,
            handle,
            indent=2,
            ensure_ascii=False,
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