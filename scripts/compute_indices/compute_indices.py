"""Compute demo-fixture Sentinel-2 indices for pipeline validation only."""

from __future__ import annotations

import json
import warnings
from datetime import datetime, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import odc.stac
from pystac_client import Client
from pyproj import CRS, Transformer

CATALOG = "https://earth-search.aws.element84.com/v1"
FIXTURE_ASSET_ID = "ast-001"
FIXTURE_POSITION = (74.461, 18.214)
AOI_HALF_WIDTH_DEGREES = 0.02
NEAR_RADIUS_METERS = 500
CLOUD_COVER_LIMIT = 30
WINDOWS = {
    "before": ("2023-11-01", "2023-12-31"),
    "after": ("2025-11-01", "2025-12-31"),
}
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "public" / "data" / "pilot"
SOURCE = "Copernicus Sentinel-2 L2A via Element84 Earth Search STAC API"
ATTRIBUTION_PREFIX = "Contains modified Copernicus Sentinel data"


def fixture_bbox() -> list[float]:
    longitude, latitude = FIXTURE_POSITION
    return [
        longitude - AOI_HALF_WIDTH_DEGREES,
        latitude - AOI_HALF_WIDTH_DEGREES,
        longitude + AOI_HALF_WIDTH_DEGREES,
        latitude + AOI_HALF_WIDTH_DEGREES,
    ]


def band_transform(item, band_name: str) -> tuple[float, float]:
    """Read and validate STAC scale/offset; use the documented S2 baseline fallback."""
    asset = item.assets.get(band_name)
    if asset is None:
        raise ValueError(f"STAC item {item.id} has no {band_name!r} asset.")
    raster_bands = asset.extra_fields.get("raster:bands", [])
    metadata = raster_bands[0] if raster_bands else {}
    scale = float(metadata.get("scale", 0.0001))
    offset = metadata.get("offset")
    if offset is None:
        baseline = str(item.properties.get("s2:processing_baseline", ""))
        offset = -0.1 if baseline and baseline >= "04.00" else 0.0
    offset = float(offset)
    if not np.isfinite(scale) or scale <= 0 or not np.isfinite(offset):
        raise ValueError(f"Invalid scale/offset metadata for {item.id} {band_name}.")
    return scale, offset


def validate_scene_metadata(items) -> dict[str, tuple[float, float]]:
    if not items:
        raise ValueError("Cannot validate scale/offset without Sentinel-2 scenes.")
    transforms = {}
    for item in items:
        for band in ("green", "red", "nir"):
            transforms.setdefault(band, []).append(band_transform(item, band))
    normalized = {}
    for band, values in transforms.items():
        if any(not np.allclose(value, values[0]) for value in values[1:]):
            raise ValueError(
                f"Scenes use different {band} reflectance scaling; split the "
                "composite by scale/offset before calculating indices."
            )
        normalized[band] = values[0]
    return normalized


def query_scenes(client: Client, bbox: list[float], start: str, end: str):
    search = client.search(
        collections=["sentinel-2-l2a"],
        bbox=bbox,
        datetime=f"{start}/{end}",
        query={"eo:cloud_cover": {"lt": CLOUD_COVER_LIMIT}},
        max_items=100,
    )
    items = list(search.items())
    return sorted(items, key=lambda item: item.datetime or datetime.min.replace(tzinfo=timezone.utc))


def load_composite(items, bbox: list[float], crs: CRS):
    if not items:
        return None
    transforms = validate_scene_metadata(items)
    dataset = odc.stac.load(
        items,
        bands=["green", "red", "nir", "scl"],
        bbox=bbox,
        crs=crs,
        resolution=10,
        groupby="solar_day",
        dtype="float32",
    )
    clear = dataset.scl.isin([4, 5, 6])

    def reflectance(band: str):
        values = dataset[band].where(clear).astype("float32")
        band_scale, band_offset = transforms[band]
        return values * band_scale + band_offset

    green = reflectance("green")
    red = reflectance("red")
    nir = reflectance("nir")
    ndvi_denominator = nir + red
    ndwi_denominator = green + nir
    ndvi = ((nir - red) / ndvi_denominator).where(
        (red >= 0) & (nir >= 0) & (ndvi_denominator > 1e-6)
    )
    ndwi = ((green - nir) / ndwi_denominator).where(
        (green >= 0) & (nir >= 0) & (ndwi_denominator > 1e-6)
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return {
            "ndvi": ndvi.median("time", skipna=True).values,
            "ndwi": ndwi.median("time", skipna=True).values,
            "x": dataset.x.values,
            "y": dataset.y.values,
        }


def scene_summary(items) -> list[dict[str, object]]:
    return [
        {
            "id": item.id,
            "date": item.datetime.date().isoformat() if item.datetime else "",
            "cloudCover": (
                float(item.properties["eo:cloud_cover"])
                if item.properties.get("eo:cloud_cover") is not None
                else None
            ),
        }
        for item in items
    ]


def index_summary(
    values: np.ndarray,
    near_mask: np.ndarray,
    control_mask: np.ndarray,
    window: str,
    items,
) -> dict[str, object]:
    valid = np.isfinite(values)
    near_values = values[valid & near_mask]
    control_values = values[valid & control_mask]
    return {
        "window": window,
        "scenes": scene_summary(items),
        "nearMean": float(near_values.mean()) if near_values.size else None,
        "controlMean": (
            float(control_values.mean()) if control_values.size else None
        ),
        "validNearPixels": int(near_values.size),
        "validControlPixels": int(control_values.size),
    }


def metric_result(
    name: str,
    definition: str,
    before: dict[str, object],
    after: dict[str, object],
) -> dict[str, object]:
    near_change = (
        float(after["nearMean"]) - float(before["nearMean"])
        if before["nearMean"] is not None and after["nearMean"] is not None
        else None
    )
    control_change = (
        float(after["controlMean"]) - float(before["controlMean"])
        if before["controlMean"] is not None
        and after["controlMean"] is not None
        else None
    )
    adjusted = (
        near_change - control_change
        if near_change is not None and control_change is not None
        else None
    )
    return {
        "name": name,
        "definition": definition,
        "before": before,
        "after": after,
        "nearChange": near_change,
        "controlChange": control_change,
        "differenceInDifferences": adjusted,
    }


def masks_for_grid(
    x: np.ndarray,
    y: np.ndarray,
    asset_xy: tuple[float, float],
) -> tuple[np.ndarray, np.ndarray]:
    grid_x, grid_y = np.meshgrid(x, y)
    near = (
        (grid_x - asset_xy[0]) ** 2 + (grid_y - asset_xy[1]) ** 2
    ) <= NEAR_RADIUS_METERS**2
    control = ~near
    return near, control


def save_index_image(values: np.ndarray, path: Path, cmap: str, limits):
    image = np.ma.masked_invalid(values)
    plt.imsave(path, image, cmap=cmap, vmin=limits[0], vmax=limits[1])


def empty_window(label: str) -> dict[str, object]:
    return {
        "window": label,
        "scenes": [],
        "nearMean": None,
        "controlMean": None,
        "validNearPixels": 0,
        "validControlPixels": 0,
    }


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    bbox = fixture_bbox()
    center_lon, center_lat = FIXTURE_POSITION
    zone = int((center_lon + 180) // 6) + 1
    crs = CRS.from_epsg(32600 + zone)
    transformer = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    asset_xy = transformer.transform(center_lon, center_lat)
    client = Client.open(CATALOG)
    scenes = {
        key: query_scenes(client, bbox, start, end)
        for key, (start, end) in WINDOWS.items()
    }
    composites = {
        key: load_composite(items, bbox, crs)
        for key, items in scenes.items()
    }
    usable = all(composites.values())
    bounds = [bbox[0], bbox[1], bbox[2], bbox[3]]
    image_paths: dict[str, str] = {}
    indices: dict[str, object] = {}

    if usable:
        before_grid = composites["before"]
        after_grid = composites["after"]
        if not (
            np.allclose(before_grid["x"], after_grid["x"])
            and np.allclose(before_grid["y"], after_grid["y"])
        ):
            raise ValueError("Before/after Sentinel-2 grids do not align.")
        near_mask, control_mask = masks_for_grid(
            before_grid["x"], before_grid["y"], asset_xy
        )
        for metric, definition, cmap, limits in (
            ("ndvi", "NDVI = (NIR - red) / (NIR + red)", "RdYlGn", (-0.2, 1)),
            (
                "ndwi",
                "NDWI, McFeeters = (green - NIR) / (green + NIR)",
                "BrBG",
                (-1, 1),
            ),
        ):
            for period, composite in (
                ("before", before_grid),
                ("after", after_grid),
            ):
                valid_values = composite[metric][np.isfinite(composite[metric])]
                if valid_values.size and (
                    float(valid_values.min()) < -1.0001
                    or float(valid_values.max()) > 1.0001
                ):
                    raise ValueError(
                        f"{metric.upper()} {period} values are outside [-1, 1]; "
                        "check scene scaling and invalid-pixel masks."
                    )
            before_summary = index_summary(
                before_grid[metric],
                near_mask,
                control_mask,
                "/".join(WINDOWS["before"]),
                scenes["before"],
            )
            after_summary = index_summary(
                after_grid[metric],
                near_mask,
                control_mask,
                "/".join(WINDOWS["after"]),
                scenes["after"],
            )
            indices[metric] = metric_result(
                metric.upper(), definition, before_summary, after_summary
            )
            for period, composite in (
                ("before", before_grid),
                ("after", after_grid),
            ):
                filename = f"{metric}_{period}.png"
                save_index_image(
                    composite[metric], OUTPUT_DIR / filename, cmap, limits
                )
                image_paths[f"{metric}{period.title()}"] = (
                    f"/data/pilot/{filename}"
                )
    else:
        for metric, definition in (
            ("ndvi", "NDVI = (NIR - red) / (NIR + red)"),
            ("ndwi", "NDWI, McFeeters = (green - NIR) / (green + NIR)"),
        ):
            indices[metric] = metric_result(
                metric.upper(),
                definition,
                empty_window("/".join(WINDOWS["before"])),
                empty_window("/".join(WINDOWS["after"])),
            )

    years = sorted(
        {
            scene["date"][:4]
            for period_scenes in scenes.values()
            for scene in scene_summary(period_scenes)
            if scene["date"]
        }
    )
    attribution = (
        f"{ATTRIBUTION_PREFIX} {', '.join(years)}"
        if years
        else ATTRIBUTION_PREFIX
    )
    summary = {
        "status": "pipeline-test" if usable else "no-data",
        "label": "Pipeline test, not a real result",
        "fixtureAssetId": FIXTURE_ASSET_ID,
        "source": SOURCE,
        "attribution": attribution,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "bounds": bounds,
        "images": image_paths,
        "indices": indices,
        "interpretation": (
            "No real-asset signal can be assessed: these coordinates identify "
            "a demo fixture, not a verified field asset. Do not treat the "
            "near/control difference-in-differences as evidence of impact."
        ),
    }
    output_file = OUTPUT_DIR / "summary.json"
    output_file.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output_file}")
    print(
        f"Fixture {FIXTURE_ASSET_ID}: "
        f"{len(scenes['before'])} before scenes, "
        f"{len(scenes['after'])} after scenes; status={summary['status']}"
    )


if __name__ == "__main__":
    main()
