"""Compute Sentinel-2 NDVI/NDWI statistics inside a PostGIS watershed AOI."""

from __future__ import annotations

import json
import os
import argparse
from datetime import date

import numpy as np
import odc.stac
import psycopg
from pyproj import CRS, Transformer
from pystac_client import Client
from rasterio.features import geometry_mask
from shapely.geometry import mapping, shape
from shapely.ops import transform as transform_geometry

from scripts.compute_indices.compute_indices import band_transform, validate_scene_metadata

CATALOG = "https://earth-search.aws.element84.com/v1"
SOURCE = "Copernicus Sentinel-2 L2A via Element84 Earth Search"
ATTRIBUTION = "Contains modified Copernicus Sentinel data"
SOURCE_LICENCE = "Copernicus Sentinel data terms of use"
CLOUD_COVER_LIMIT = int(os.environ.get("CLOUD_COVER_LIMIT", "30"))
CLEAR_SCL_CLASSES = (4, 5, 6)


def clear_scl_mask(scl: np.ndarray) -> np.ndarray:
    return np.isin(scl, CLEAR_SCL_CLASSES)


def ndvi_ndwi(green: np.ndarray, red: np.ndarray, nir: np.ndarray, index: str):
    if index == "NDVI":
        denominator = nir + red
        valid = (red >= 0) & (nir >= 0) & (denominator > 1e-6)
        numerator = nir - red
    elif index == "NDWI":
        denominator = green + nir
        valid = (green >= 0) & (nir >= 0) & (denominator > 1e-6)
        numerator = green - nir
    else:
        raise ValueError("index must be NDVI or NDWI")
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(valid, numerator / denominator, np.nan)


def summarize_aoi(values: np.ndarray, aoi_mask: np.ndarray) -> dict[str, float | int | None]:
    total = int(aoi_mask.sum())
    valid = np.isfinite(values) & aoi_mask
    selected = values[valid]
    valid_pct = 100.0 * selected.size / total if total else 0.0
    if not selected.size:
        return {
            "mean": None,
            "median": None,
            "p10": None,
            "p90": None,
            "std": None,
            "valid_pixel_pct": valid_pct,
        }
    return {
        "mean": float(np.mean(selected)),
        "median": float(np.median(selected)),
        "p10": float(np.percentile(selected, 10)),
        "p90": float(np.percentile(selected, 90)),
        "std": float(np.std(selected)),
        "valid_pixel_pct": valid_pct,
    }


def _load_aoi(connection, watershed_id: str, asset_id: str | None, buffer_m: int | None):
    row = connection.execute(
        "SELECT ST_AsGeoJSON(boundary) FROM watersheds WHERE id = %s",
        (watershed_id,),
    ).fetchone()
    if not row:
        raise ValueError(f"Unknown watershed: {watershed_id}")
    boundary_value = json.loads(row[0]) if isinstance(row[0], str) else row[0]
    boundary = shape(boundary_value)
    if asset_id:
        asset = connection.execute(
            "SELECT ST_AsGeoJSON(location) FROM assets WHERE id = %s AND watershed_id = %s",
            (asset_id, watershed_id),
        ).fetchone()
        if not asset:
            raise ValueError("Asset does not belong to the requested watershed.")
        if not buffer_m or buffer_m <= 0:
            raise ValueError("Asset analyses require a positive buffer_m.")
        point_value = json.loads(asset[0]) if isinstance(asset[0], str) else asset[0]
        point = shape(point_value)
        center_lon, center_lat = point.x, point.y
        zone = int((center_lon + 180) // 6) + 1
        epsg = (32600 if center_lat >= 0 else 32700) + zone
        to_meters = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True).transform
        to_wgs84 = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True).transform
        buffered = transform_geometry(to_meters, point).buffer(buffer_m)
        boundary_projected = transform_geometry(to_meters, boundary)
        clipped = buffered.intersection(boundary_projected)
        return transform_geometry(to_wgs84, clipped), CRS.from_epsg(epsg)

    centroid = boundary.centroid
    zone = int((centroid.x + 180) // 6) + 1
    epsg = (32600 if centroid.y >= 0 else 32700) + zone
    return boundary, CRS.from_epsg(epsg)


def analyze_watershed(
    watershed_id: str,
    window_start: str,
    window_end: str,
    index: str,
    asset_id: str | None = None,
    buffer_m: int | None = None,
    database_url: str | None = None,
) -> dict:
    if date.fromisoformat(window_end) < date.fromisoformat(window_start):
        raise ValueError("window end must not precede window start")
    if index not in ("NDVI", "NDWI"):
        raise ValueError("index must be NDVI or NDWI")
    connection_string = database_url or os.environ.get("DATABASE_URL")
    if not connection_string:
        raise ValueError("DATABASE_URL must be set")

    with psycopg.connect(connection_string) as connection:
        aoi_wgs84, crs = _load_aoi(connection, watershed_id, asset_id, buffer_m)
    to_projected = Transformer.from_crs("EPSG:4326", crs, always_xy=True).transform
    to_wgs84 = Transformer.from_crs(crs, "EPSG:4326", always_xy=True).transform
    aoi = transform_geometry(to_projected, aoi_wgs84)
    if aoi.is_empty or not aoi.is_valid:
        raise ValueError("Watershed AOI geometry is empty or invalid")
    bounds = aoi.bounds
    search_aoi = transform_geometry(to_wgs84, aoi)
    client = Client.open(CATALOG)
    items = list(client.search(
        collections=["sentinel-2-l2a"],
        bbox=list(search_aoi.bounds),
        datetime=f"{window_start}/{window_end}",
        query={"eo:cloud_cover": {"lt": CLOUD_COVER_LIMIT}},
        max_items=100,
    ).items())
    if not items:
        return _empty_result(watershed_id, asset_id, buffer_m, index, window_start, window_end)

    transforms = validate_scene_metadata(items)
    dataset = odc.stac.load(
        items,
        bands=["green", "red", "nir", "scl"],
        bbox=list(bounds),
        crs=crs,
        resolution=10,
        groupby="solar_day",
        dtype="float32",
    )
    x_values = dataset.x.values
    y_values = dataset.y.values
    affine = dataset.odc.geobox.transform
    aoi_mask = geometry_mask(
        [mapping(aoi)],
        out_shape=(len(y_values), len(x_values)),
        transform=affine,
        invert=True,
    )
    clear = dataset.scl.isin(CLEAR_SCL_CLASSES)
    scaled: dict[str, object] = {}
    for band in ("green", "red", "nir"):
        scale, offset = transforms[band]
        scaled[band] = dataset[band].where(clear).astype("float32") * scale + offset
    band_green = scaled["green"]
    band_red = scaled["red"]
    band_nir = scaled["nir"]
    if index == "NDVI":
        denominator = band_nir + band_red
        values = ((band_nir - band_red) / denominator).where(
            (band_red >= 0) & (band_nir >= 0) & (denominator > 1e-6)
        )
    else:
        denominator = band_green + band_nir
        values = ((band_green - band_nir) / denominator).where(
            (band_green >= 0) & (band_nir >= 0) & (denominator > 1e-6)
        )
    composite = values.median("time", skipna=True).values
    statistics = summarize_aoi(composite, aoi_mask)
    status = "measured" if statistics["valid_pixel_pct"] >= 60 else "insufficient_data"
    if status != "measured":
        for key in ("mean", "median", "p10", "p90", "std"):
            statistics[key] = None
    return {
        **statistics,
        "status": status,
        "scene_count": len(items),
        "scene_ids": [item.id for item in items],
        "source": SOURCE,
        "source_licence": SOURCE_LICENCE,
        "attribution": ATTRIBUTION,
        "method": "Sentinel-2 L2A median composite; SCL classes 4, 5, 6; per-AOI statistics",
        "resolution_m": 10,
        "aoi_scope": "asset_buffer" if asset_id else "watershed",
        "buffer_m": buffer_m,
        "watershed_id": watershed_id,
        "asset_id": asset_id,
        "index_type": index,
        "window_start": window_start,
        "window_end": window_end,
    }


def _empty_result(watershed_id, asset_id, buffer_m, index, window_start, window_end):
    return {
        "mean": None,
        "median": None,
        "p10": None,
        "p90": None,
        "std": None,
        "valid_pixel_pct": 0.0,
        "status": "insufficient_data",
        "scene_count": 0,
        "scene_ids": [],
        "source": SOURCE,
        "source_licence": SOURCE_LICENCE,
        "attribution": ATTRIBUTION,
        "method": "Sentinel-2 L2A median composite; SCL classes 4, 5, 6; per-AOI statistics",
        "resolution_m": 10,
        "aoi_scope": "asset_buffer" if asset_id else "watershed",
        "buffer_m": buffer_m,
        "watershed_id": watershed_id,
        "asset_id": asset_id,
        "index_type": index,
        "window_start": window_start,
        "window_end": window_end,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--watershed-id", required=True)
    parser.add_argument("--window-start", required=True)
    parser.add_argument("--window-end", required=True)
    parser.add_argument("--index", choices=("NDVI", "NDWI"), required=True)
    parser.add_argument("--asset-id")
    parser.add_argument("--buffer-m", type=int)
    args = parser.parse_args()
    result = analyze_watershed(
        watershed_id=args.watershed_id,
        window_start=args.window_start,
        window_end=args.window_end,
        index=args.index,
        asset_id=args.asset_id,
        buffer_m=args.buffer_m,
    )
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
