# prepare_watersheds

Turns real watershed boundary files into a small PMTiles archive the map can
stream (Phase 1). **Status: written, not yet run on real data.**

## 1. Get the data (check the licence first)

| Level | Preferred source | Fallback |
|---|---|---|
| Basins / sub-basins | CWC India-WRIS basin layers | HydroBASINS level 6 |
| Watersheds | CWC India-WRIS watersheds | HydroBASINS level 8 |
| Micro-watersheds | SLUSI micro-watershed atlas | HydroBASINS level 10–12 |

For every file you download, add a row to `../../docs/DATA_SOURCES.md` (name, URL,
licence, date accessed, attribution text) **before** committing tiles. Do not
use layers whose terms forbid export or offline use. If the licence is not
clear on the provider's own site, do not ship it.

## 2. Install tools

```sh
pip install geopandas shapely
# tippecanoe: https://github.com/felt/tippecanoe (build or brew install tippecanoe)
# pmtiles CLI: https://github.com/protomaps/go-pmtiles/releases
```

## 3. Run

```sh
python scripts/prepare_watersheds/prepare_watersheds.py \
  --basins raw/hybas_as_lev06_v1c.shp \
  --watersheds raw/hybas_as_lev08_v1c.shp \
  --micro-watersheds raw/hybas_as_lev10_v1c.shp \
  --field-map code=HYBAS_ID --field-map parent_id=NEXT_DOWN
```

Default clip is the Pune district bounding box; change it with `--bbox`.
Output: `public/data/watersheds_pune.pmtiles`.

## 4. Point the app at it

```env
VITE_WATERSHED_PMTILES_URL=/data/watersheds_pune.pmtiles
VITE_WATERSHED_ATTRIBUTION=<attribution text required by the licence>
```

The map then draws `basins` (zoom 0–8), `watersheds` (8–11) and
`micro_watersheds` (11+) under the demo layers. To make clicking/upload
resolution use real polygons too, also load the GeoJSON into the backend
(Phase 2, `ST_Contains`) or into `getWatersheds()`.
