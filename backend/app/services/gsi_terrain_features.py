from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
import requests
from rasterio.merge import merge
from rasterio.transform import rowcol


BASE_DIR = Path(__file__).resolve().parents[2]

INPUT_DATASET = (
    BASE_DIR
    / "data"
    / "gsi"
    / "gsi_training_spatial_validated.json"
)

OUTPUT_DATASET = (
    BASE_DIR
    / "data"
    / "gsi"
    / "gsi_training_terrain_dataset.json"
)

QUALITY_REPORT = (
    BASE_DIR
    / "data"
    / "gsi"
    / "gsi_training_terrain_quality.json"
)

DEM_CACHE_DIR = (
    BASE_DIR
    / "data"
    / "gsi"
    / "dem_cache"
)

# Official public Copernicus DEM GLO-90 bucket.
DEM_BASE_URL = (
    "https://copernicus-dem-90m.s3.eu-central-1.amazonaws.com"
)

DEM_RESOLUTION_M = 90.0

MAX_TILES = 30
REQUEST_TIMEOUT_SECONDS = 120

USER_AGENT = (
    "BhooPehra/0.1 "
    "(landslide-research-prototype)"
)


def load_json(path: Path) -> Any:
    with path.open(
        "r",
        encoding="utf-8",
    ) as handle:
        return json.load(handle)


def write_json(
    path: Path,
    payload: Any,
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


def load_training_records(
    path: Path,
) -> list[dict[str, Any]]:
    """
    Load the spatially validated training dataset.

    Expected structure:

        {
            "positive_candidates": [...],
            "background_candidates": [...]
        }

    Both groups are combined for terrain extraction.
    """

    payload = load_json(path)

    if not isinstance(
        payload,
        dict,
    ):
        raise ValueError(
            "Expected spatially validated "
            "dataset to be a JSON object."
        )

    positive_candidates = payload.get(
        "positive_candidates",
        [],
    )

    background_candidates = payload.get(
        "background_candidates",
        [],
    )

    if not isinstance(
        positive_candidates,
        list,
    ):
        raise ValueError(
            "'positive_candidates' must be a list."
        )

    if not isinstance(
        background_candidates,
        list,
    ):
        raise ValueError(
            "'background_candidates' must be a list."
        )

    records: list[dict[str, Any]] = []

    for record in positive_candidates:
        if isinstance(
            record,
            dict,
        ):
            records.append(record)

    for record in background_candidates:
        if isinstance(
            record,
            dict,
        ):
            records.append(record)

    return records


def tile_components(
    latitude: float,
    longitude: float,
) -> tuple[str, str]:
    """
    Generate Copernicus DEM one-degree tile components.

    Example:

        27.13, 93.74
        -> N27_00, E093_00
    """

    lat_floor = math.floor(
        latitude
    )

    lon_floor = math.floor(
        longitude
    )

    if lat_floor >= 0:
        northing = (
            f"N{lat_floor:02d}_00"
        )
    else:
        northing = (
            f"S{abs(lat_floor):02d}_00"
        )

    if lon_floor >= 0:
        easting = (
            f"E{lon_floor:03d}_00"
        )
    else:
        easting = (
            f"W{abs(lon_floor):03d}_00"
        )

    return (
        northing,
        easting,
    )


def tile_identifier(
    latitude: float,
    longitude: float,
) -> str:

    northing, easting = (
        tile_components(
            latitude,
            longitude,
        )
    )

    return (
        "Copernicus_DSM_COG_30_"
        f"{northing}_{easting}_DEM"
    )


def dem_url(
    latitude: float,
    longitude: float,
) -> str:
    """
    Build the documented Copernicus DEM object URL.
    """

    tile = tile_identifier(
        latitude,
        longitude,
    )

    return (
        f"{DEM_BASE_URL}/"
        f"{tile}/"
        f"{tile}.tif"
    )


def required_tiles(
    records: list[dict[str, Any]],
) -> dict[str, tuple[float, float]]:
    """
    Return unique DEM tiles and a representative
    coordinate for each tile.
    """

    tiles: dict[
        str,
        tuple[float, float],
    ] = {}

    for record in records:

        latitude = record.get(
            "latitude"
        )

        longitude = record.get(
            "longitude"
        )

        if (
            latitude is None
            or longitude is None
        ):
            continue

        latitude = float(
            latitude
        )

        longitude = float(
            longitude
        )

        tile = tile_identifier(
            latitude,
            longitude,
        )

        if tile not in tiles:
            tiles[tile] = (
                latitude,
                longitude,
            )

    return dict(
        sorted(
            tiles.items()
        )
    )


def download_tile(
    tile: str,
    latitude: float,
    longitude: float,
) -> Path:
    """
    Download one Copernicus DEM tile.

    Uses a normal requests response rather than
    stream=True because the individual GLO-90 tiles
    are only a few MB for this workflow.

    Existing valid cached tiles are reused.
    """

    DEM_CACHE_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_path = (
        DEM_CACHE_DIR
        / f"{tile}.tif"
    )

    # Reuse existing valid cache.
    if (
        output_path.exists()
        and output_path.stat().st_size
        > 10_000
    ):

        print(
            f"Using cached DEM tile: {tile}"
        )

        return output_path

    url = dem_url(
        latitude,
        longitude,
    )

    print(
        f"Downloading DEM tile: {tile}"
    )

    print(
        f"URL: {url}"
    )

    headers = {
        "User-Agent": USER_AGENT,
    }

    response = requests.get(
        url,
        headers=headers,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )

    response.raise_for_status()

    content = response.content

    if len(content) < 10_000:
        raise RuntimeError(
            f"DEM tile {tile} returned only "
            f"{len(content)} bytes. "
            "Expected a valid GeoTIFF."
        )

    temporary_path = (
        output_path.with_suffix(
            ".tmp"
        )
    )

    try:

        with temporary_path.open(
            "wb"
        ) as handle:

            handle.write(
                content
            )

        temporary_path.replace(
            output_path
        )

    except Exception:

        if temporary_path.exists():
            temporary_path.unlink()

        raise

    print(
        "Downloaded: "
        f"{len(content) / (1024 * 1024):.2f} MB"
    )

    return output_path


def validate_dem_file(
    path: Path,
) -> None:
    """
    Make sure the cached file is actually readable
    as a raster before using it.
    """

    try:

        with rasterio.open(
            path
        ) as dataset:

            if dataset.count < 1:
                raise RuntimeError(
                    "DEM file has no raster bands."
                )

            if dataset.width <= 0:
                raise RuntimeError(
                    "DEM file has invalid width."
                )

            if dataset.height <= 0:
                raise RuntimeError(
                    "DEM file has invalid height."
                )

    except Exception:

        # Delete corrupted cache so the next run
        # can download a clean copy.
        if path.exists():
            path.unlink()

        raise


def load_dem(
    tile_paths: list[Path],
):
    if not tile_paths:
        raise RuntimeError(
            "No DEM tiles available."
        )

    for path in tile_paths:
        validate_dem_file(
            path
        )

    datasets = [
        rasterio.open(
            path
        )
        for path in tile_paths
    ]

    try:

        mosaic, transform = merge(
            datasets
        )

        profile = (
            datasets[0]
            .profile
            .copy()
        )

        profile.update(
            {
                "height": mosaic.shape[1],
                "width": mosaic.shape[2],
                "transform": transform,
                "count": 1,
            }
        )

        dem = (
            mosaic[0]
            .astype(
                np.float64
            )
        )

        return (
            dem,
            transform,
            profile,
        )

    finally:

        for dataset in datasets:
            dataset.close()


def lonlat_to_pixel(
    transform,
    longitude: float,
    latitude: float,
) -> tuple[int, int]:

    row, column = rowcol(
        transform,
        longitude,
        latitude,
    )

    return (
        int(row),
        int(column),
    )


def valid_pixel(
    array: np.ndarray,
    row: int,
    column: int,
    radius: int = 2,
) -> bool:

    height, width = (
        array.shape
    )

    return (
        row - radius >= 0
        and row + radius < height
        and column - radius >= 0
        and column + radius < width
    )


def pixel_size_m(
    transform,
) -> tuple[float, float]:
    """
    Approximate conversion of geographic raster
    resolution into metres for local terrain derivatives.
    """

    latitude_scale = 111_320.0

    x_resolution_deg = abs(
        transform.a
    )

    y_resolution_deg = abs(
        transform.e
    )

    mean_latitude = 26.0

    longitude_scale = (
        latitude_scale
        * math.cos(
            math.radians(
                mean_latitude
            )
        )
    )

    pixel_x_m = (
        x_resolution_deg
        * longitude_scale
    )

    pixel_y_m = (
        y_resolution_deg
        * latitude_scale
    )

    return (
        pixel_x_m,
        pixel_y_m,
    )


def terrain_from_window(
    dem: np.ndarray,
    row: int,
    column: int,
    pixel_x_m: float,
    pixel_y_m: float,
) -> dict[str, float | None]:
    """
    Derive terrain variables from the DEM.

    Features:

        elevation
        slope
        aspect
        northness
        eastness
        profile curvature
    """

    if not valid_pixel(
        dem,
        row,
        column,
        radius=2,
    ):

        return {
            "elevation_dem_m": None,
            "slope_deg": None,
            "aspect_deg": None,
            "northness": None,
            "eastness": None,
            "profile_curvature": None,
        }

    window = dem[
        row - 2 : row + 3,
        column - 2 : column + 3,
    ]

    if not np.isfinite(
        window
    ).all():

        return {
            "elevation_dem_m": None,
            "slope_deg": None,
            "aspect_deg": None,
            "northness": None,
            "eastness": None,
            "profile_curvature": None,
        }

    elevation = float(
        dem[
            row,
            column,
        ]
    )

    # ---------------------------------------------
    # First derivatives.
    # ---------------------------------------------

    dz_dx = (
        dem[
            row,
            column + 1,
        ]
        - dem[
            row,
            column - 1,
        ]
    ) / (
        2.0
        * pixel_x_m
    )

    dz_dy = (
        dem[
            row + 1,
            column,
        ]
        - dem[
            row - 1,
            column,
        ]
    ) / (
        2.0
        * pixel_y_m
    )

    gradient = math.sqrt(
        dz_dx * dz_dx
        + dz_dy * dz_dy
    )

    slope_rad = math.atan(
        gradient
    )

    slope_deg = math.degrees(
        slope_rad
    )

    # ---------------------------------------------
    # Aspect.
    #
    # 0°   = North
    # 90°  = East
    # 180° = South
    # 270° = West
    # ---------------------------------------------

    aspect_rad = math.atan2(
        dz_dx,
        -dz_dy,
    )

    aspect_deg = (
        math.degrees(
            aspect_rad
        )
        + 360.0
    ) % 360.0

    aspect_rad_normalized = (
        math.radians(
            aspect_deg
        )
    )

    # Circular aspect encodings.
    northness = math.cos(
        aspect_rad_normalized
    )

    eastness = math.sin(
        aspect_rad_normalized
    )

    # ---------------------------------------------
    # Local profile curvature.
    # ---------------------------------------------

    d2z_dy2 = (
        dem[
            row + 1,
            column,
        ]
        - 2.0
        * dem[
            row,
            column,
        ]
        + dem[
            row - 1,
            column,
        ]
    ) / (
        pixel_y_m
        * pixel_y_m
    )

    profile_curvature = float(
        d2z_dy2
    )

    return {
        "elevation_dem_m": round(
            elevation,
            3,
        ),
        "slope_deg": round(
            slope_deg,
            4,
        ),
        "aspect_deg": round(
            aspect_deg,
            4,
        ),
        "northness": round(
            northness,
            6,
        ),
        "eastness": round(
            eastness,
            6,
        ),
        "profile_curvature": round(
            profile_curvature,
            8,
        ),
    }


def sanity_flags(
    terrain: dict[str, float | None],
) -> list[str]:

    flags: list[str] = []

    elevation = terrain.get(
        "elevation_dem_m"
    )

    slope = terrain.get(
        "slope_deg"
    )

    aspect = terrain.get(
        "aspect_deg"
    )

    curvature = terrain.get(
        "profile_curvature"
    )

    if elevation is None:

        flags.append(
            "MISSING_ELEVATION"
        )

    elif elevation < -100:

        flags.append(
            "VERY_LOW_ELEVATION"
        )

    elif elevation > 9000:

        flags.append(
            "UNREALISTIC_ELEVATION"
        )

    if slope is None:

        flags.append(
            "MISSING_SLOPE"
        )

    elif slope < 0 or slope > 90:

        flags.append(
            "INVALID_SLOPE"
        )

    elif slope > 60:

        flags.append(
            "VERY_STEEP_SLOPE_REVIEW"
        )

    if aspect is None:

        flags.append(
            "MISSING_ASPECT"
        )

    elif (
        aspect < 0
        or aspect >= 360
    ):

        flags.append(
            "INVALID_ASPECT"
        )

    if curvature is None:

        flags.append(
            "MISSING_CURVATURE"
        )

    return flags


def build_feature_record(
    record: dict[str, Any],
    dem: np.ndarray,
    transform,
    pixel_x_m: float,
    pixel_y_m: float,
) -> dict[str, Any]:

    latitude = record.get(
        "latitude"
    )

    longitude = record.get(
        "longitude"
    )

    output = dict(
        record
    )

    if (
        latitude is None
        or longitude is None
    ):

        terrain = {
            "elevation_dem_m": None,
            "slope_deg": None,
            "aspect_deg": None,
            "northness": None,
            "eastness": None,
            "profile_curvature": None,
        }

        output[
            "terrain_status"
        ] = "MISSING_COORDINATES"

    else:

        row, column = (
            lonlat_to_pixel(
                transform,
                float(longitude),
                float(latitude),
            )
        )

        terrain = (
            terrain_from_window(
                dem,
                row,
                column,
                pixel_x_m,
                pixel_y_m,
            )
        )

        if (
            terrain[
                "elevation_dem_m"
            ]
            is None
        ):

            output[
                "terrain_status"
            ] = "INVALID_OR_EDGE_PIXEL"

        else:

            output[
                "terrain_status"
            ] = "REAL_DEM_FEATURES"

    output.update(
        terrain
    )

    output[
        "terrain_source"
    ] = "Copernicus DEM GLO-90"

    output[
        "terrain_resolution_m"
    ] = DEM_RESOLUTION_M

    output[
        "terrain_sanity_flags"
    ] = sanity_flags(
        terrain
    )

    return output


def run() -> dict[str, Any]:

    if not INPUT_DATASET.exists():

        raise FileNotFoundError(
            "Input dataset not found: "
            f"{INPUT_DATASET}"
        )

    records = (
        load_training_records(
            INPUT_DATASET
        )
    )

    positive_count = sum(
        1
        for record in records
        if record.get(
            "label"
        ) == 1
    )

    background_count = sum(
        1
        for record in records
        if record.get(
            "label"
        ) == 0
    )

    print(
        "\nBhooPehra - DEM Terrain "
        "Feature Extraction"
    )

    print(
        f"Input records: "
        f"{len(records)}"
    )

    print(
        f"Positive records: "
        f"{positive_count}"
    )

    print(
        f"Background records: "
        f"{background_count}"
    )

    # ---------------------------------------------
    # Required DEM tiles.
    # ---------------------------------------------

    tiles = required_tiles(
        records
    )

    print(
        f"Required DEM tiles: "
        f"{len(tiles)}"
    )

    if not tiles:

        raise RuntimeError(
            "No DEM tiles required. "
            "No valid coordinates were found."
        )

    if len(tiles) > MAX_TILES:

        raise RuntimeError(
            f"Required DEM tiles "
            f"({len(tiles)}) exceed safety "
            f"limit ({MAX_TILES})."
        )

    # ---------------------------------------------
    # Download/cache DEM tiles.
    # ---------------------------------------------

    tile_paths: list[Path] = []

    for (
        tile,
        coordinates,
    ) in tiles.items():

        latitude, longitude = (
            coordinates
        )

        try:

            tile_path = (
                download_tile(
                    tile,
                    latitude,
                    longitude,
                )
            )

            tile_paths.append(
                tile_path
            )

        except requests.HTTPError as exc:

            print(
                f"ERROR downloading tile "
                f"{tile}: {exc}"
            )

            raise

        except requests.RequestException as exc:

            print(
                f"ERROR downloading tile "
                f"{tile}: {exc}"
            )

            raise

    if not tile_paths:

        raise RuntimeError(
            "No DEM tiles were "
            "successfully downloaded."
        )

    # ---------------------------------------------
    # Build DEM mosaic.
    # ---------------------------------------------

    print(
        "\nBuilding DEM mosaic..."
    )

    (
        dem,
        transform,
        profile,
    ) = load_dem(
        tile_paths
    )

    pixel_x_m, pixel_y_m = (
        pixel_size_m(
            transform
        )
    )

    print(
        "Approx DEM pixel size: "
        f"{pixel_x_m:.2f}m x "
        f"{pixel_y_m:.2f}m"
    )

    # ---------------------------------------------
    # Extract terrain features.
    # ---------------------------------------------

    feature_records: list[
        dict[str, Any]
    ] = []

    counters = {
        "total": len(records),
        "terrain_available": 0,
        "terrain_missing": 0,
        "edge_or_invalid": 0,
        "very_steep": 0,
        "elevation_review": 0,
        "invalid_slope": 0,
        "invalid_aspect": 0,
    }

    for index, record in enumerate(
        records,
        start=1,
    ):

        identifier = (
            record.get(
                "sample_id"
            )
            or record.get(
                "id"
            )
            or record.get(
                "record_id"
            )
            or f"RECORD_{index:04d}"
        )

        print(
            f"[{index}/{len(records)}] "
            f"{identifier}"
        )

        enriched = (
            build_feature_record(
                record,
                dem,
                transform,
                pixel_x_m,
                pixel_y_m,
            )
        )

        flags = enriched.get(
            "terrain_sanity_flags",
            [],
        )

        if (
            enriched[
                "terrain_status"
            ]
            == "REAL_DEM_FEATURES"
        ):

            counters[
                "terrain_available"
            ] += 1

        elif (
            enriched[
                "terrain_status"
            ]
            == "MISSING_COORDINATES"
        ):

            counters[
                "terrain_missing"
            ] += 1

        else:

            counters[
                "edge_or_invalid"
            ] += 1

        if (
            "VERY_STEEP_SLOPE_REVIEW"
            in flags
        ):

            counters[
                "very_steep"
            ] += 1

        if (
            "UNREALISTIC_ELEVATION"
            in flags
        ):

            counters[
                "elevation_review"
            ] += 1

        if (
            "INVALID_SLOPE"
            in flags
        ):

            counters[
                "invalid_slope"
            ] += 1

        if (
            "INVALID_ASPECT"
            in flags
        ):

            counters[
                "invalid_aspect"
            ] += 1

        print(
            "  "
            f"elevation="
            f"{enriched['elevation_dem_m']}m | "
            f"slope="
            f"{enriched['slope_deg']}° | "
            f"aspect="
            f"{enriched['aspect_deg']}°"
        )

        if flags:

            print(
                "  sanity flags: "
                + ", ".join(
                    flags
                )
            )

        feature_records.append(
            enriched
        )

    # ---------------------------------------------
    # Final dataset.
    # ---------------------------------------------

    result = {
        "dataset": (
            "BhooPehra GSI Terrain "
            "Feature Dataset"
        ),
        "version": "0.1",
        "generated_from": str(
            INPUT_DATASET
        ),
        "dataset_status": (
            "REAL_DEM_TERRAIN_FEATURES"
        ),
        "terrain_source": (
            "Copernicus DEM GLO-90"
        ),
        "terrain_resolution_m": (
            DEM_RESOLUTION_M
        ),
        "features": [
            "elevation_dem_m",
            "slope_deg",
            "aspect_deg",
            "northness",
            "eastness",
            "profile_curvature",
        ],
        "records": feature_records,
    }

    quality = {
        "status": "success",
        "input_dataset": str(
            INPUT_DATASET
        ),
        "output_dataset": str(
            OUTPUT_DATASET
        ),
        "terrain_source": (
            "Copernicus DEM GLO-90"
        ),
        "dem_resolution_m": (
            DEM_RESOLUTION_M
        ),
        "tiles": list(
            tiles.keys()
        ),
        "pixel_size_m": {
            "x": pixel_x_m,
            "y": pixel_y_m,
        },
        "counters": counters,
        "positive_records": (
            positive_count
        ),
        "background_records": (
            background_count
        ),
        "sanity_checks": {
            "slope_range": (
                "0-90 degrees"
            ),
            "aspect_range": (
                "0-360 degrees"
            ),
            "elevation_review_threshold_m": 9000,
            "very_steep_review_threshold_deg": 60,
        },
        "scientific_note": (
            "Slope and aspect are derived "
            "from real DEM raster data using "
            "local finite differences. They "
            "are not approximated from a "
            "single point elevation."
        ),
        "limitations": [
            (
                "GLO-90 has approximately 90 m "
                "horizontal resolution."
            ),
            (
                "The current terrain dataset "
                "still requires geology, land "
                "cover, road proximity and "
                "other predictors."
            ),
            (
                "Spatial validation currently "
                "uses the provisional Northeast "
                "geographic envelope."
            ),
        ],
    }

    write_json(
        OUTPUT_DATASET,
        result,
    )

    write_json(
        QUALITY_REPORT,
        quality,
    )

    print(
        "\nBhooPehra - Terrain "
        "Feature Report"
    )

    print(
        f"Total records: "
        f"{counters['total']}"
    )

    print(
        f"Positive records: "
        f"{positive_count}"
    )

    print(
        f"Background records: "
        f"{background_count}"
    )

    print(
        f"Terrain available: "
        f"{counters['terrain_available']}"
    )

    print(
        f"Terrain missing: "
        f"{counters['terrain_missing']}"
    )

    print(
        f"Edge/invalid pixels: "
        f"{counters['edge_or_invalid']}"
    )

    print(
        f"Very steep slope reviews: "
        f"{counters['very_steep']}"
    )

    print(
        f"Elevation reviews: "
        f"{counters['elevation_review']}"
    )

    print(
        f"Invalid slopes: "
        f"{counters['invalid_slope']}"
    )

    print(
        f"Invalid aspects: "
        f"{counters['invalid_aspect']}"
    )

    print(
        "\nTerrain dataset:"
    )

    print(
        OUTPUT_DATASET
    )

    print(
        "\nQuality report:"
    )

    print(
        QUALITY_REPORT
    )

    print(
        "\nIMPORTANT:"
    )

    print(
        "Terrain features were derived "
        "from real Copernicus DEM GLO-90 "
        "raster data."
    )

    print(
        "PostgreSQL/PostGIS data was "
        "not modified."
    )

    return quality


if __name__ == "__main__":
    run()