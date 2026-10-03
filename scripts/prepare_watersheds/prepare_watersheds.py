#!/usr/bin/env python3
"""
Prepare watershed boundaries for the HydroSnap map (Phase 1).

Input : one polygon file per level (GeoJSON / Shapefile / GeoPackage) that YOU
        downloaded from the original provider after checking its licence
        (see scripts/prepare_watersheds/README.md and docs/DATA_SOURCES.md).
Output: clipped, attribute-trimmed GeoJSON per level + a PMTiles archive with
        source-layers `basins`, `watersheds`, `micro_watersheds`.

Requires: geopandas, shapely (pip), tippecanoe and pmtiles CLIs on PATH.

STATUS: written for the prototype but not yet run against real data
(the build sandbox could not download datasets). Test before relying on it.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

LEVELS = {
    # name in PMTiles : (min zoom, max zoom)
    "basins": (4, 9),
    "watersheds": (7, 12),
    "micro_watersheds": (10, 14),
}
KEEP = ["id", "code", "name", "level", "parent_id", "district", "state", "area_sq_km"]

# Default demo region: Pune district bounding box (approx., WGS84).
PUNE_BBOX = (73.30, 17.85, 75.20, 19.40)


def normalise(gdf, level: str, mapping: dict[str, str]):
    import geopandas as gpd  # noqa: F401

    gdf = gdf.rename(columns={v: k for k, v in mapping.items() if v in gdf.columns})
    gdf = gdf.to_crs(4326)
    gdf["level"] = level.rstrip("s").replace("_", "-")
    if "id" not in gdf.columns:
        gdf["id"] = gdf.get("code", gdf.index.astype(str)).astype(str)
    if "area_sq_km" not in gdf.columns:
        gdf["area_sq_km"] = (gdf.to_crs(32643).area / 1e6).round(2)  # UTM 43N
    for column in KEEP:
        if column not in gdf.columns:
            gdf[column] = None
    return gdf[KEEP + ["geometry"]]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--basins", type=Path)
    parser.add_argument("--watersheds", type=Path)
    parser.add_argument("--micro-watersheds", type=Path)
    parser.add_argument("--bbox", type=float, nargs=4, default=PUNE_BBOX,
                        metavar=("MINX", "MINY", "MAXX", "MAXY"))
    parser.add_argument("--field-map", action="append", default=[],
                        help="target=source column, e.g. code=HYBAS_ID (repeatable)")
    parser.add_argument("--out", type=Path, default=Path("build/watersheds"))
    parser.add_argument("--pmtiles", type=Path, default=Path("public/data/watersheds_pune.pmtiles"))
    args = parser.parse_args()

    import geopandas as gpd
    from shapely.geometry import box

    mapping = dict(item.split("=", 1) for item in args.field_map)
    clip = box(*args.bbox)
    args.out.mkdir(parents=True, exist_ok=True)
    layer_files: list[tuple[str, Path]] = []
    for level, source in (("basins", args.basins), ("watersheds", args.watersheds),
                          ("micro_watersheds", args.micro_watersheds)):
        if not source:
            continue
        gdf = gpd.read_file(source)
        gdf = gdf[gdf.to_crs(4326).intersects(clip)]
        gdf = normalise(gdf, level, mapping).clip(clip)
        target = args.out / f"{level}.geojson"
        gdf.to_file(target, driver="GeoJSON")
        layer_files.append((level, target))
        print(f"{level}: {len(gdf)} features -> {target}")

    if not layer_files:
        print("No input layers given. See README.md.", file=sys.stderr)
        return 1

    if not shutil.which("tippecanoe") or not shutil.which("pmtiles"):
        print("GeoJSON written. Install tippecanoe + pmtiles CLI to build tiles.")
        return 0

    mbtiles = args.out / "watersheds.mbtiles"
    command = ["tippecanoe", "-o", str(mbtiles), "--force",
               "--detect-shared-borders", "--coalesce-densest-as-needed"]
    for level, path in layer_files:
        low, high = LEVELS[level]
        command += ["-L", f'{{"file":"{path}","layer":"{level}","minzoom":{low},"maxzoom":{high}}}']
    command += ["-Z", "4", "-z", "14"]
    subprocess.run(command, check=True)
    args.pmtiles.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["pmtiles", "convert", str(mbtiles), str(args.pmtiles)], check=True)
    print(f"PMTiles -> {args.pmtiles}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
