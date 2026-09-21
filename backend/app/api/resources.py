from fastapi import APIRouter

router = APIRouter(
    prefix="/api/resources",
    tags=["Resources"],
)


RESOURCE_CATALOG = [
    {
        "id": "gsi-nlfc",
        "name": "GSI National Landslide Forecasting Centre",
        "organization": "Geological Survey of India",
        "category": "Landslide Monitoring",
        "type": "Official Portal",
        "status": "AVAILABLE",
        "description": (
            "Official GSI landslide monitoring and forecasting platform. "
            "BhooPehra uses GSI as an authoritative reference source for "
            "landslide intelligence and historical evidence."
        ),
        "url": "https://bhusanket.gsi.gov.in/",
        "data_types": [
            "Landslide incidence",
            "Landslide forecasting",
            "Landslide susceptibility",
            "Historical landslide evidence",
        ],
        "integration": "REFERENCE_SOURCE",
        "official": True,
    },
    {
        "id": "isro-landslide-atlas",
        "name": "ISRO Landslide Atlas of India",
        "organization": "Indian Space Research Organisation",
        "category": "Satellite & Historical Data",
        "type": "Official Dataset / Atlas",
        "status": "REFERENCE",
        "description": (
            "National-scale landslide inventory and historical landslide "
            "information derived from satellite and remote-sensing based "
            "observations."
        ),
        "url": "https://www.isro.gov.in/",
        "data_types": [
            "Historical landslides",
            "Landslide inventory",
            "Remote sensing evidence",
            "Spatial hazard information",
        ],
        "integration": "REFERENCE_SOURCE",
        "official": True,
    },
    {
        "id": "nasa-smap",
        "name": "NASA SMAP",
        "organization": "NASA",
        "category": "Soil Moisture",
        "type": "Satellite Data",
        "status": "REFERENCE",
        "description": (
            "NASA Soil Moisture Active Passive mission providing global "
            "soil-moisture observations useful for antecedent wetness and "
            "landslide trigger analysis."
        ),
        "url": "https://smap.jpl.nasa.gov/",
        "data_types": [
            "Soil moisture",
            "Surface wetness",
            "Antecedent moisture",
        ],
        "integration": "PLANNED_DATA_SOURCE",
        "official": True,
    },
    {
        "id": "nasa-gpm",
        "name": "NASA GPM / IMERG",
        "organization": "NASA",
        "category": "Rainfall",
        "type": "Satellite Precipitation",
        "status": "REFERENCE",
        "description": (
            "NASA precipitation observations that can support rainfall "
            "estimation, accumulation windows and trigger analysis."
        ),
        "url": "https://gpm.nasa.gov/data-access/downloads/gpm",
        "data_types": [
            "Precipitation",
            "Rainfall accumulation",
            "Hourly rainfall",
            "Multi-day rainfall",
        ],
        "integration": "PLANNED_DATA_SOURCE",
        "official": True,
    },
    {
        "id": "imd",
        "name": "India Meteorological Department",
        "organization": "India Meteorological Department",
        "category": "Weather",
        "type": "Official Weather Source",
        "status": "REFERENCE",
        "description": (
            "Authoritative Indian meteorological source for rainfall, "
            "weather observations, warnings and forecasts."
        ),
        "url": "https://mausam.imd.gov.in/",
        "data_types": [
            "Rainfall",
            "Weather observations",
            "Forecasts",
            "Weather warnings",
        ],
        "integration": "REFERENCE_SOURCE",
        "official": True,
    },
    {
        "id": "open-meteo",
        "name": "Open-Meteo",
        "organization": "Open-Meteo",
        "category": "Weather",
        "type": "Weather API",
        "status": "ACTIVE",
        "description": (
            "Current BhooPehra weather ingestion source used for rainfall "
            "observations and dynamic rainfall-trigger calculation."
        ),
        "url": "https://open-meteo.com/",
        "data_types": [
            "Rainfall",
            "Temperature",
            "Weather variables",
            "Forecast data",
        ],
        "integration": "ACTIVE_BACKEND_SOURCE",
        "official": True,
    },
    {
        "id": "chirps",
        "name": "CHIRPS",
        "organization": "Climate Hazards Center / UC Santa Barbara",
        "category": "Rainfall",
        "type": "Rainfall Dataset",
        "status": "REFERENCE",
        "description": (
            "Long-term gridded rainfall dataset useful for historical "
            "precipitation analysis and climate-aware landslide modelling."
        ),
        "url": "https://www.chc.ucsb.edu/data/chirps",
        "data_types": [
            "Historical rainfall",
            "Daily precipitation",
            "Rainfall climatology",
        ],
        "integration": "PLANNED_DATA_SOURCE",
        "official": True,
    },
    {
        "id": "osm-geofabrik",
        "name": "OpenStreetMap / Geofabrik",
        "organization": "OpenStreetMap / Geofabrik",
        "category": "Infrastructure",
        "type": "Open Geospatial Data",
        "status": "ACTIVE",
        "description": (
            "Open road and infrastructure data used by BhooPehra for "
            "road-network features, proximity analysis and infrastructure "
            "context."
        ),
        "url": "https://download.geofabrik.de/asia/india/northeast.html",
        "data_types": [
            "Road network",
            "Highways",
            "Bridges",
            "Infrastructure features",
        ],
        "integration": "ACTIVE_BACKEND_DATA",
        "official": True,
    },
    {
        "id": "gsi-bhukosh",
        "name": "GSI Bhukosh",
        "organization": "Geological Survey of India",
        "category": "Geology",
        "type": "Geospatial Portal",
        "status": "REFERENCE",
        "description": (
            "GSI geospatial information portal intended as the preferred "
            "authoritative source for geological and lithological context."
        ),
        "url": "https://bhukosh.gsi.gov.in/",
        "data_types": [
            "Geology",
            "Lithology",
            "Geospatial layers",
        ],
        "integration": "REFERENCE_SOURCE",
        "official": True,
    },
    {
        "id": "bhuvan",
        "name": "ISRO Bhuvan",
        "organization": "Indian Space Research Organisation",
        "category": "Remote Sensing / GIS",
        "type": "Geospatial Platform",
        "status": "ACTIVE_DATA",
        "description": (
            "Indian geospatial platform providing remote-sensing and "
            "land-use/land-cover information used as supporting spatial "
            "evidence."
        ),
        "url": "https://bhuvan.nrsc.gov.in/",
        "data_types": [
            "Land use / land cover",
            "Remote sensing",
            "Satellite-derived layers",
            "GIS information",
        ],
        "integration": "ACTIVE_BACKEND_DATA",
        "official": True,
    },
]


@router.get("")
def get_resources():
    return {
        "status": "success",
        "count": len(RESOURCE_CATALOG),
        "data": RESOURCE_CATALOG,
    }


@router.get("/summary")
def get_resource_summary():
    total = len(RESOURCE_CATALOG)

    active = sum(
        1
        for resource in RESOURCE_CATALOG
        if resource["status"] in {
            "ACTIVE",
            "ACTIVE_DATA",
        }
    )

    official = sum(
        1
        for resource in RESOURCE_CATALOG
        if resource["official"]
    )

    categories = sorted(
        {
            resource["category"]
            for resource in RESOURCE_CATALOG
        }
    )

    return {
        "status": "success",
        "total_sources": total,
        "active_sources": active,
        "official_sources": official,
        "categories": categories,
    }


@router.get("/{resource_id}")
def get_resource(resource_id: str):
    for resource in RESOURCE_CATALOG:
        if resource["id"] == resource_id:
            return {
                "status": "success",
                "data": resource,
            }

    return {
        "status": "not_found",
        "data": None,
        "resource_id": resource_id,
    }