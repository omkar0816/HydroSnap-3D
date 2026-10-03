# Data sources

Rule: before bundling any dataset, verify the licence **on the original
provider's site** and record it here. If it is unclear, do not ship it.

## In use

| Data | Provider / URL | Licence | Accessed | Attribution shown |
|---|---|---|---|---|
| Street basemap tiles | OpenStreetMap — tile.openstreetmap.org | ODbL data; tile usage policy applies (light use only) | — | © OpenStreetMap contributors |
| Topographic tiles | OpenTopoMap — tile.opentopomap.org | CC-BY-SA (verify) | — | © OpenStreetMap contributors, SRTM, OpenTopoMap |
| Satellite imagery tiles | Esri World Imagery — server.arcgisonline.com | Esri terms of use (verify for this use) | — | Tiles © Esri |
| 3D terrain tiles | Mapzen Terrarium on AWS Open Data — s3.amazonaws.com/elevation-tiles-prod | Mixed source attributions (verify) | — | Terrain: Mapzen Terrarium tiles |
| Watersheds, streams, assets, NDVI/NDWI | `src/services/mock/mockData.ts` | Invented demo data | — | "Demo" labels in UI |

## Candidates (not yet used — verify before use)

| Data | Provider | To check |
|---|---|---|
| Micro-watersheds | SLUSI (Soil and Land Use Survey of India) | access route, export/offline terms |
| Basins / watersheds | CWC India-WRIS | export terms, attribution |
| Global fallback | HydroBASINS (HydroSHEDS) | licence text and attribution on hydrosheds.org |
| DEM | CartoDEM (NRSC Bhuvan), Copernicus GLO-30, SRTM | registration, redistribution |
| Satellite | Landsat 8/9 (USGS), Sentinel-2 (Copernicus) via STAC or GEE | provider/platform terms |

Template row:

`| Name | URL | Licence (exact name + link) | YYYY-MM-DD | Attribution text |`
