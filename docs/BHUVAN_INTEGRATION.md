# Bhuvan layers and cloud-free imagery

This document covers two changes to the Map analysis page:

1. **Bhuvan (NRSC/ISRO) thematic layers** shown as toggleable overlays, with
   opacity, legend and click-to-identify (as in the Bhuvan IWMP citizen app).
2. **Cloud-free satellite imagery** — the white clouds came from the NASA VIIRS
   *daily* tiles used by the timeline; they were replaced.

## 1. Why there were white clouds

`WatershedMap.tsx` switched to NASA GIBS `VIIRS_SNPP_CorrectedReflectance_TrueColor`
whenever the timeline pointed at a past period. That product is a single day's
scene at ~250–500 m/px, so it contains that day's clouds (heavy over
Maharashtra in the monsoon).

| Situation | Source now | Notes |
|---|---|---|
| Satellite, timeline "Now" or disabled | Esri World Imagery | Curated, cloud-free composite (unchanged). |
| Satellite, historical timeline step | EOX Sentinel-2 cloudless annual mosaic | 10 m/px, clearest pixels of a whole year. |

Mosaics are **annual**: a step uses the latest *complete* year before it
(`cloudlessYearFor` in `src/utils/imagery.ts`), e.g. H1 2025 → 2024 mosaic,
H2 2025 → 2025 mosaic. A chip on the map names the mosaic being shown.
Available years: 2018–2025 (`CLOUDLESS_LATEST_YEAR`; bump it when EOX publishes
2026).

## 2. Bhuvan WMS

* Endpoint: `https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms` (WMS 1.1.1).
* **No API key is needed** to display layers.
* The app calls the same-origin path `/bhuvan-wms/wms`, which is forwarded to
  Bhuvan by `vite.config.ts` (dev) and the rewrite in `vercel.json` (prod). This
  sidesteps browser CORS restrictions and lets Vercel cache tiles for a day.
* Catalogue: `src/utils/bhuvanLayers.ts` (`buildBhuvanCatalog`). Layer names are
  built from `VITE_BHUVAN_STATE_CODE` (default `MH`) and `VITE_BHUVAN_DISTRICT`
  (default `PUNE`).

| Layer | WMS name (MH) | Name confirmed? |
|---|---|---|
| LULC 50K 2015-16 / 2011-12 / 2005-06 | `lulc:MH_LULC50K_1516` / `_1112` / `_0506` | Pattern seen in Bhuvan capabilities for other states |
| Watershed boundaries | `watershed:MH_WS` | Pattern seen (`watershed:AR_WS`) |
| IWMP drainage (district) | `iwmp:MH_PUNE_drn` | Pattern seen (`iwmp:AP_CHITTOOR_drn`) — **unconfirmed** |
| Geomorphology, lineaments, wasteland | `vector:MH_GM50K_0506`, `vector:MH_LN50K_0506`, `vector:MH_WL50K_DOP` | Older server's names — **unconfirmed** |

Unconfirmed layers show an "Unconfirmed layer name" tag in the UI, and a yellow
notice appears if Bhuvan returns no tiles for a visible layer.

### Verify the layer names (do this first)

```bash
pnpm bhuvan:verify            # checks every catalogue layer exists and renders
pnpm bhuvan:verify -- --list  # also lists all layers for your state
```

If a layer fails, the script prints similar names; correct them in
`buildBhuvanCatalog`.

### Adding another Bhuvan layer

1. Find the name with `pnpm bhuvan:verify -- --list` or Bhuvan's thematic portal.
2. Add an entry to `buildBhuvanCatalog` (id, label, group, `wmsName`, bounds).
3. Nothing else: sources, visibility, opacity, legend and identify are generic.

## 3. API keys — what you do and don't need

| Service | Key? | Notes |
|---|---|---|
| Bhuvan WMS layers (this integration) | **None** | |
| EOX Sentinel-2 cloudless tiles | **None** | Attribution required; see licence below. |
| Esri World Imagery tiles | **None** (already used) | Esri online-services terms. |
| Bhuvan REST API (geocoding, LULC statistics, routing) | **Personal token** | Create a Bhuvan account, log in at <https://bhuvan-app1.nrsc.gov.in/api>, use "Access Token". The token **expires daily**, so it cannot be a permanent app secret. Not used by the map. If you add these later, call them from `server/` with `BHUVAN_API_TOKEN`, never from the browser. |

Nobody can issue you a Bhuvan token on your behalf; it is tied to your login.

## 4. Licences and limits (verify before production)

* **EOX Sentinel-2 cloudless:** 2018–2025 mosaics are CC BY-NC-SA 4.0
  (**non-commercial**); 2016 is CC BY 4.0. Required attribution is in
  `CLOUDLESS_ATTRIBUTION`. For commercial use see <https://cloudless.eox.at>.
* **Bhuvan:** confirm the terms of use / NDSAP conditions on the Bhuvan site for
  your use case. Data is streamed through the proxy, not stored or redistributed.
  Boundaries are indicative and not legal records.
* **Esri World Imagery:** streamed only; see `docs/DATA_SOURCES.md`.

## 5. Troubleshooting

* *Bhuvan layer is blank:* check the yellow notice; run `pnpm bhuvan:verify`.
  LULC layers only draw at regional zoom levels and only inside the state.
* *Dev proxy returns 502/certificate errors:* set `BHUVAN_PROXY_TARGET` or retry;
  the dev proxy already tolerates incomplete TLS chains (`secure: false`).
* *Production tiles fail but dev works:* the Vercel external rewrite could not
  reach Bhuvan (e.g. TLS or geo-restriction). Replace the rewrite with a small
  `api/` function that fetches Bhuvan and streams the response.
* *Tiles look identical for H1 and H2 of the same year:* expected (annual
  mosaics).

## 6. Further datasets worth adding next

* **Real NDVI/NDWI** instead of the simulated overlays: extend
  `scripts/compute_indices` with cloud-masked Sentinel-2 L2A (SCL band) and use
  the existing `PilotAnalysis` image-overlay path.
* **Official watershed polygons** via `scripts/prepare_watersheds` → PMTiles
  (SLUSI / India-WRIS; verify each licence).
* **Bhuvan "Clip & Ship"** downloads of LULC 50K shapefiles (Bhuvan login +
  request approval) if you need attributes offline rather than via WMS.
