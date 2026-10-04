# Data sources

Rule: before bundling any dataset, verify the licence **on the original
provider's site** and record it here. If it is unclear, do not ship it.

## In use

| Data | Provider / URL | Licence | Accessed | Attribution shown |
|---|---|---|---|---|
| Street basemap tiles | OpenStreetMap — tile.openstreetmap.org | ODbL data; tile usage policy applies (light use only) | — | © OpenStreetMap contributors |
| Topographic tiles | OpenTopoMap — tile.opentopomap.org | CC-BY-SA (verify) | — | © OpenStreetMap contributors, SRTM, OpenTopoMap |
| Satellite imagery tiles | [Esri World Imagery service](https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer) | Esri Online Services terms and applicable World Imagery service terms; not a standalone open-data licence. This app streams tiles and does not bundle or redistribute them. | 2026-10-04 | Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community |
| 3D terrain tiles | Mapzen Terrarium on AWS Open Data — s3.amazonaws.com/elevation-tiles-prod | Mixed source attributions (verify) | — | Terrain: Mapzen Terrarium tiles |
| Watersheds, streams, assets, NDVI/NDWI | `src/services/mock/mockData.ts` | Invented demo data | — | "Demo" labels in UI |
| Sentinel-2 L2A pilot pipeline test | [Copernicus Data Space terms](https://dataspace.copernicus.eu/terms-and-conditions), discovered through [Element84 Earth Search](https://earth-search.aws.element84.com/v1) | Sentinel data is supplied on a free, full and open basis under the [Sentinel Data Legal Notice](https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice). Earth Search is the STAC access catalogue, not the data owner. | 2026-10-04 | `Contains modified Copernicus Sentinel data [year]`; the generated demo-fixture output names each source year. |

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
