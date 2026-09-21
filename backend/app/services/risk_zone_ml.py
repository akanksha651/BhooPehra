from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from geoalchemy2 import Geography
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.district import District
from app.models.rainfall_observation import RainfallObservation
from app.models.risk_zone import RiskZone
from app.models.road_network import RoadNetwork
from app.services.gsi_model_inference import predict_risk
from app.services.gsi_terrain_features import (
    DEM_CACHE_DIR,
    build_feature_record as build_dem_feature_record,
    load_dem,
    pixel_size_m,
    tile_identifier,
)


BASE_DIR = Path(__file__).resolve().parents[2]

FEATURE_DATASET_FILE = (
    BASE_DIR
    / "data"
    / "gsi"
    / "gsi_training_feature_dataset.json"
)

LULC_FILE = (
    BASE_DIR
    / "data"
    / "gsi"
    / "gsi_training_lulc_features.json"
)

ROAD_FILE = (
    BASE_DIR
    / "data"
    / "gsi"
    / "gsi_training_road_features.json"
)

LITHOLOGY_FILE = (
    BASE_DIR
    / "data"
    / "gsi"
    / "gsi_training_lithology_features.json"
)


def load_json(path: Path) -> Any:
    if not path.exists():
        raise FileNotFoundError(
            f"Required feature file not found: {path}"
        )

    with path.open(
        "r",
        encoding="utf-8",
    ) as handle:
        return json.load(handle)


def extract_records(
    data: Any,
) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [
            item
            for item in data
            if isinstance(item, dict)
        ]

    if not isinstance(data, dict):
        return []

    for key in (
        "feature_records",
        "records",
        "samples",
        "features",
    ):
        value = data.get(key)

        if isinstance(value, list):
            return [
                item
                for item in value
                if isinstance(item, dict)
            ]

    return []


def normalize_key(value: Any) -> str:
    return (
        str(value)
        .strip()
        .lower()
        .replace("-", "_")
        .replace(" ", "_")
    )


def recursive_find(
    obj: Any,
    target_keys: set[str],
    results: list[Any],
) -> None:
    if isinstance(obj, dict):
        for key, value in obj.items():
            if normalize_key(key) in target_keys:
                results.append(value)

            recursive_find(
                value,
                target_keys,
                results,
            )

    elif isinstance(obj, list):
        for item in obj:
            recursive_find(
                item,
                target_keys,
                results,
            )


def find_value(
    record: dict[str, Any],
    *names: str,
) -> Any:
    targets = {
        normalize_key(name)
        for name in names
    }

    values: list[Any] = []

    recursive_find(
        record,
        targets,
        values,
    )

    for value in values:
        if value is None:
            continue

        if isinstance(value, str):
            if value.strip():
                return value
        else:
            return value

    return None


def to_float(
    value: Any,
) -> float | None:
    if value is None:
        return None

    try:
        result = float(value)

        if not math.isfinite(result):
            return None

        return result

    except (
        TypeError,
        ValueError,
    ):
        return None


def record_coordinates(
    record: dict[str, Any],
) -> tuple[float, float] | None:

    latitude = to_float(
        find_value(
            record,
            "latitude",
            "lat",
        )
    )

    longitude = to_float(
        find_value(
            record,
            "longitude",
            "lon",
            "lng",
        )
    )

    if latitude is None or longitude is None:
        return None

    if not (
        -90 <= latitude <= 90
        and -180 <= longitude <= 180
    ):
        return None

    return latitude, longitude


def haversine_km(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:

    radius_km = 6371.0088

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)

    dphi = math.radians(
        lat2 - lat1
    )

    dlambda = math.radians(
        lon2 - lon1
    )

    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1)
        * math.cos(phi2)
        * math.sin(dlambda / 2) ** 2
    )

    return (
        2
        * radius_km
        * math.asin(
            math.sqrt(a)
        )
    )


def load_spatial_profiles() -> list[dict[str, Any]]:
    base_records = extract_records(
        load_json(
            FEATURE_DATASET_FILE
        )
    )

    lulc_records = extract_records(
        load_json(
            LULC_FILE
        )
    )

    road_records = extract_records(
        load_json(
            ROAD_FILE
        )
    )

    lithology_records = extract_records(
        load_json(
            LITHOLOGY_FILE
        )
    )

    def record_id(
        record: dict[str, Any],
    ) -> str | None:

        value = find_value(
            record,
            "record_id",
            "sample_id",
            "id",
        )

        if value is None:
            return None

        return str(value)

    lulc_by_id = {}

    for record in lulc_records:
        rid = record_id(record)

        if rid is not None:
            lulc_by_id[rid] = record

    road_by_id = {}

    for record in road_records:
        rid = record_id(record)

        if rid is not None:
            road_by_id[rid] = record

    lithology_by_id = {}

    for record in lithology_records:
        rid = record_id(record)

        if rid is not None:
            lithology_by_id[rid] = record

    profiles: list[dict[str, Any]] = []

    for base in base_records:
        rid = record_id(base)

        if rid is None:
            continue

        coordinates = record_coordinates(
            base
        )

        if coordinates is None:
            continue

        profiles.append(
            {
                "record_id": rid,
                "latitude": coordinates[0],
                "longitude": coordinates[1],
                "base": base,
                "lulc": lulc_by_id.get(
                    rid,
                    {},
                ),
                "road": road_by_id.get(
                    rid,
                    {},
                ),
                "lithology": lithology_by_id.get(
                    rid,
                    {},
                ),
            }
        )

    return profiles


def find_nearest_profile(
    latitude: float,
    longitude: float,
    profiles: list[dict[str, Any]],
) -> tuple[
    dict[str, Any],
    float,
] | None:

    best_profile = None
    best_distance = float("inf")

    for profile in profiles:
        distance = haversine_km(
            latitude,
            longitude,
            profile["latitude"],
            profile["longitude"],
        )

        if distance < best_distance:
            best_distance = distance
            best_profile = profile

    if best_profile is None:
        return None

    return (
        best_profile,
        best_distance,
    )


def load_cached_dem_terrain(
    latitude: float,
    longitude: float,
) -> dict[str, Any]:

    tile = tile_identifier(
        latitude,
        longitude,
    )

    tile_path = (
        DEM_CACHE_DIR
        / f"{tile}.tif"
    )

    if not tile_path.exists():
        return {
            "terrain_status": "FALLBACK_PREPARED_PROFILE",
            "terrain_source": None,
            "terrain_tile": tile,
            "terrain_resolution_m": None,
            "terrain_error": (
                "Cached Copernicus DEM tile is unavailable."
            ),
        }

    try:
        dem, transform, profile = load_dem(
            [tile_path]
        )

        pixel_x_m, pixel_y_m = pixel_size_m(
            transform,
        )

        terrain = build_dem_feature_record(
            record={
                "latitude": latitude,
                "longitude": longitude,
            },
            dem=dem,
            transform=transform,
            pixel_x_m=pixel_x_m,
            pixel_y_m=pixel_y_m,
        )

        if terrain.get(
            "terrain_status"
        ) != "REAL_DEM_FEATURES":
            return {
                "terrain_status": (
                    "FALLBACK_PREPARED_PROFILE"
                ),
                "terrain_source": None,
                "terrain_tile": tile,
                "terrain_resolution_m": (
                    resolution_m
                ),
                "terrain_error": (
                    terrain.get("terrain_error")
                    or "DEM terrain extraction failed."
                ),
            }

        return {
            "terrain_status": "REAL_DEM_FEATURES",
            "terrain_source": (
                "Copernicus DEM GLO-90"
            ),
            "terrain_tile": tile,
            "terrain_resolution_m": 90.0,
            "elevation_m": terrain.get(
                "elevation_m"
            ),
            "slope_deg": terrain.get(
                "slope_deg"
            ),
            "aspect_deg": terrain.get(
                "aspect_deg"
            ),
            "curvature": terrain.get(
                "curvature"
            ),
            "northness": terrain.get(
                "northness"
            ),
            "eastness": terrain.get(
                "eastness"
            ),
            "sanity_flags": terrain.get(
                "sanity_flags",
                [],
            ),
        }

    except Exception as exc:
        return {
            "terrain_status": (
                "FALLBACK_PREPARED_PROFILE"
            ),
            "terrain_source": None,
            "terrain_tile": tile,
            "terrain_resolution_m": None,
            "terrain_error": str(exc),
        }


def find_nearest_road_distance_m(
    db: Session,
    latitude: float,
    longitude: float,
) -> dict[str, Any]:

    point = func.ST_SetSRID(
        func.ST_MakePoint(
            longitude,
            latitude,
        ),
        4326,
    ).cast(
        Geography(
            geometry_type="POINT",
            srid=4326,
        )
    )

    road_geometry = RoadNetwork.geometry.cast(
        Geography(
            geometry_type="LINESTRING",
            srid=4326,
        )
    )

    distance_expression = func.ST_Distance(
        road_geometry,
        point,
    )

    statement = (
        select(
            distance_expression.label(
                "distance_m"
            )
        )
        .where(
            RoadNetwork.geometry.is_not(None)
        )
        .order_by(
            RoadNetwork.geometry.op("<->")(
                func.ST_SetSRID(
                    func.ST_MakePoint(
                        longitude,
                        latitude,
                    ),
                    4326,
                )
            )
        )
        .limit(1)
    )

    distance_m = db.execute(
        statement
    ).scalar_one_or_none()

    if distance_m is None:
        return {
            "distance_to_road_m": None,
            "road_distance_status": (
                "NO_MAPPED_ROAD_FOUND"
            ),
            "road_distance_source": (
                "PostGIS road_network.geometry"
            ),
        }

    distance_m_float = to_float(
        distance_m
    )

    if distance_m_float is None:
        return {
            "distance_to_road_m": None,
            "road_distance_status": (
                "INVALID_DISTANCE_RESULT"
            ),
            "road_distance_source": (
                "PostGIS road_network.geometry"
            ),
        }

    return {
        "distance_to_road_m": round(
            distance_m_float,
            3,
        ),
        "road_distance_status": (
            "REAL_POSTGIS_NEAREST_ROAD"
        ),
        "road_distance_source": (
            "PostGIS road_network.geometry"
        ),
    }


def build_zone_feature_record(
    db: Session,
    zone: RiskZone,
    district: District,
    rainfall: RainfallObservation | None,
    profile: dict[str, Any],
    profile_distance_km: float,
    latitude: float,
    longitude: float,
) -> dict[str, Any]:

    base = profile["base"]
    lulc = profile["lulc"]
    road = profile["road"]
    lithology = profile["lithology"]

    result: dict[str, Any] = {}

    result["record_id"] = (
        f"RISK-ZONE-{zone.id}"
    )

    result["latitude"] = latitude
    result["longitude"] = longitude

    result["state"] = district.state
    result["district"] = district.name

    for feature_name in (
        "elevation_m",
        "slope_deg",
        "aspect_deg",
        "curvature",
        "roughness",
        "tpi",
    ):
        value = find_value(
            base,
            feature_name,
        )

        if value is not None:
            result[feature_name] = value

    for feature_name in (
        "distance_to_road_m",
        "nearest_road_importance",
        "road_length_1km_m",
        "road_length_5km_m",
        "road_count_1km",
        "road_count_5km",
        "road_density_1km_km_per_km2",
        "road_density_5km_km_per_km2",
        "nearest_road_class",
    ):
        value = find_value(
            road,
            feature_name,
        )

        if value is None:
            value = find_value(
                base,
                feature_name,
            )

        if value is not None:
            result[feature_name] = value

    real_road_distance = (
        find_nearest_road_distance_m(
            db=db,
            latitude=latitude,
            longitude=longitude,
        )
    )

    if (
        real_road_distance[
            "distance_to_road_m"
        ]
        is not None
    ):
        result[
            "distance_to_road_m"
        ] = real_road_distance[
            "distance_to_road_m"
        ]

    lulc_value = find_value(
        lulc,
        "lulc_class",
        "normalized_lulc_class",
        "normalized_class",
        "class",
    )

    if lulc_value is None:
        lulc_value = find_value(
            base,
            "lulc_class",
        )

    if lulc_value is not None:
        result["lulc_class"] = lulc_value

    lithology_value = find_value(
        lithology,
        "lithology_class",
        "normalized_lithology",
        "class",
    )

    if lithology_value is None:
        lithology_value = find_value(
            base,
            "lithology_class",
        )

    if lithology_value is not None:
        result["lithology_class"] = (
            lithology_value
        )

    if rainfall is not None:

        if rainfall.rainfall_24h is not None:
            result["rainfall_24h_mm"] = (
                rainfall.rainfall_24h
            )

        if rainfall.rainfall_72h is not None:
            result["rainfall_72h_mm"] = (
                rainfall.rainfall_72h
            )

        if rainfall.antecedent_rainfall is not None:
            result[
                "antecedent_rainfall_mm"
            ] = rainfall.antecedent_rainfall

        if rainfall.soil_moisture is not None:
            result["soil_moisture"] = (
                rainfall.soil_moisture
            )

    else:

        for feature_name in (
            "rainfall_24h_mm",
            "rainfall_72h_mm",
            "rainfall_7d_mm",
            "rainfall_30d_mm",
            "antecedent_rainfall_mm",
            "rainfall_intensity_mm_h",
            "soil_moisture",
            "forecast_rainfall_mm",
        ):
            value = find_value(
                base,
                feature_name,
            )

            if value is not None:
                result[feature_name] = value

    dem_terrain = load_cached_dem_terrain(
        latitude=latitude,
        longitude=longitude,
    )

    for feature_name in (
        "elevation_m",
        "slope_deg",
        "aspect_deg",
        "curvature",
    ):
        value = dem_terrain.get(
            feature_name
        )

        if value is not None:
            result[feature_name] = value

    result["_integration"] = {
        "zone_id": zone.id,
        "district_id": district.id,
        "static_profile_id": profile[
            "record_id"
        ],
        "static_profile_distance_km": round(
            profile_distance_km,
            3,
        ),
        "static_profile_source": (
            "prepared GSI training feature dataset"
        ),
        "dynamic_source": (
            "PostgreSQL latest rainfall observation"
            if rainfall is not None
            else "prepared feature dataset fallback"
        ),
        "terrain": {
            "status": dem_terrain.get(
                "terrain_status"
            ),
            "source": dem_terrain.get(
                "terrain_source"
            ),
            "tile": dem_terrain.get(
                "terrain_tile"
            ),
            "resolution_m": dem_terrain.get(
                "terrain_resolution_m"
            ),
            "sanity_flags": dem_terrain.get(
                "sanity_flags",
                [],
            ),
            "error": dem_terrain.get(
                "terrain_error"
            ),
        },
        "road_distance": {
            "status": real_road_distance.get(
                "road_distance_status"
            ),
            "source": real_road_distance.get(
                "road_distance_source"
            ),
            "distance_m": real_road_distance.get(
                "distance_to_road_m"
            ),
        },
    }

    return result


def predict_zone_ml_risk(
    db: Session,
    zone_id: int,
) -> dict[str, Any]:

    zone = db.get(
        RiskZone,
        zone_id,
    )

    if zone is None:
        raise ValueError(
            f"Risk zone {zone_id} was not found."
        )

    district = db.get(
        District,
        zone.district_id,
    )

    if district is None:
        raise ValueError(
            f"District {zone.district_id} was not found."
        )

    geometry_json = db.execute(
        select(
            func.ST_AsGeoJSON(
                RiskZone.geometry
            )
        ).where(
            RiskZone.id == zone_id
        )
    ).scalar_one_or_none()

    if not geometry_json:
        raise ValueError(
            f"Risk zone {zone_id} has no geometry."
        )

    geometry = json.loads(
        geometry_json
    )

    if geometry.get("type") == "Point":

        longitude, latitude = (
            geometry["coordinates"]
        )

    else:

        centroid_json = db.execute(
            select(
                func.ST_AsGeoJSON(
                    func.ST_Centroid(
                        RiskZone.geometry
                    )
                )
            ).where(
                RiskZone.id == zone_id
            )
        ).scalar_one_or_none()

        if not centroid_json:
            raise ValueError(
                f"Unable to calculate centroid for "
                f"risk zone {zone_id}."
            )

        centroid = json.loads(
            centroid_json
        )

        longitude, latitude = (
            centroid["coordinates"]
        )

    rainfall_statement = (
        select(
            RainfallObservation
        )
        .where(
            RainfallObservation.district_id
            == district.id
        )
        .order_by(
            RainfallObservation.observed_at.desc(),
            RainfallObservation.id.desc(),
        )
        .limit(1)
    )

    rainfall = db.scalars(
        rainfall_statement
    ).first()

    profiles = load_spatial_profiles()

    if not profiles:
        raise ValueError(
            "No prepared spatial feature profiles "
            "are available for ML inference."
        )

    nearest = find_nearest_profile(
        latitude=latitude,
        longitude=longitude,
        profiles=profiles,
    )

    if nearest is None:
        raise ValueError(
            "Unable to find a spatial feature profile."
        )

    profile, distance_km = nearest

    feature_record = build_zone_feature_record(
        db=db,
        zone=zone,
        district=district,
        rainfall=rainfall,
        profile=profile,
        profile_distance_km=distance_km,
        latitude=latitude,
        longitude=longitude,
    )

    prediction = predict_risk(
        feature_record
    )

    prediction["zone"] = {
        "id": zone.id,
        "name": zone.name,
        "district": district.name,
        "state": district.state,
        "latitude": latitude,
        "longitude": longitude,
    }

    integration = feature_record.get(
        "_integration",
        {},
    )

    prediction["feature_source"] = {
        "static_profile": (
            profile["record_id"]
        ),
        "static_profile_distance_km": round(
            distance_km,
            3,
        ),
        "static_features": (
            "prepared_training_feature_dataset"
        ),
        "dynamic_features": (
            "latest_postgresql_rainfall_observation"
            if rainfall is not None
            else "prepared_training_feature_dataset"
        ),
        "terrain": integration.get(
            "terrain",
            {},
        ),
        "road_distance": integration.get(
            "road_distance",
            {},
        ),
        "warning": (
            "Static road-class, road-density, "
            "road-count, LULC and lithology features "
            "are taken from the nearest prepared "
            "spatial profile. Nearest mapped road "
            "distance is calculated directly from "
            "the PostGIS road_network geometry. "
            "Terrain elevation, slope, aspect and "
            "curvature use cached Copernicus DEM "
            "where available."
        ),
    }

    prediction["database_write"] = False

    return prediction

