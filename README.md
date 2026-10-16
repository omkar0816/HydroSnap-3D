# HydroSnap 3D

**Live prototype:** [hydrosnap-3d.vercel.app](https://hydrosnap-3d.vercel.app/)

Watershed field-evidence and monitoring prototype for **SIH 2026 · SIH26015**
(DoLR, Ministry of Rural Development): geo-coded field photos + watershed
boundaries + satellite indicators, built as an analytics/verification layer
that could sit on top of SRISHTI-DRISHTI.

> **Prototype status: frontend-first, demo data.** No general data backend or
> database is connected yet; optional Vercel functions provide only the
> Gemini-backed AI endpoints. Watershed boundaries, assets and NDVI/NDWI values
> are illustrative and labelled **Demo** in the UI. See
> [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md).

## What's real and what is not

| Real | Simulated | Planned |
|---|---|---|
| Browser-side image handling, EXIF parsing when present, device GPS, explicit location confirmation, and server-side Gemini suggestions when configured | Watershed boundaries, seeded assets and streams, dashboard index values, mock analysis-job lifecycle, and the pipeline fixture location | Production API/database, verified field-asset records, operational satellite monitoring, and authenticated roles |
| IndexedDB local queue and browser map rendering | Mock-mode sync, permissions, and role behavior | Hindi/Marathi interface and server-side trust checks |
| Sentinel-2 scenes, browser-generated inspection PDFs, and optional AI-generated English/Hindi/Marathi pilot summaries | Sentinel-2 indices at the demo fixture are a pipeline test, not a real asset result; no labelled photo-evaluation set is bundled; AI translations have not been linguistically reviewed | Verified real-pilot comparisons, evaluated photo classification, reviewed translations, and a signed/server-verified report |

The live build can change independently of this repository. Do not treat
demo-coordinate analysis or illustrative records as evidence of watershed
impact.

## Screenshots

**Screenshot placeholders:** real captures will be added after the next review.
No screenshots are included yet; see [`docs/screenshots/README.md`](docs/screenshots/README.md).

## What works now (real code, demo data)

| Area | Status |
|---|---|
| Map: 3 basemaps, switch without losing view, live scale bar, 2D/3D terrain, measure | ✅ |
| All watersheds drawn, hover highlight, click → details panel (assets, % verified, last inspection) | ✅ demo boundaries |
| Watershed search + fly-to, "Which watershed am I in?" | ✅ |
| Choropleth (mapped / verified / pending) with legend | ✅ |
| Optional real boundaries via PMTiles (`VITE_WATERSHED_PMTILES_URL`) | ✅ code ready, no data bundled |
| Upload: EXIF GPS/time/camera, device GPS or pin, **officer must confirm** | ✅ |
| Advisory Gemini photo classification, warning-only trust fusion, and officer override reason | ✅ Vercel key required |
| Existing/new asset choice with an officer-confirmed nearby match | ✅ |
| Asset Passport photo timeline, demo-fixture Sentinel-2 comparison, and AI summary in English/Hindi/Marathi | ✅ pipeline test; translations unreviewed |
| Client-generated asset inspection PDF with map snapshot, audit details, and marked AI summary | ✅ prototype, not digitally signed |
| Point-in-polygon → watershed auto-assigned; warning if outside all | ✅ |
| Stream snap preview for check dams / percolation tanks (point never moved silently) | ✅ demo streams |
| Rule + AI-assisted trust status (EXIF, time, GPS accuracy, SHA-256 duplicate, watershed, stream distance, content warnings) with reasons | ✅ client preview |
| Offline queue in IndexedDB, auto-sync on reconnect, backoff, idempotency key, "Sync now" | ✅ syncs to demo API in mock mode |
| Role check: only GIS Analyst / Administrator can verify | ✅ UI-level |
| Exports: assets GeoJSON / CSV, per-observation audit JSON | ✅ |
| General data backend (FastAPI + PostGIS), verified real-asset satellite analysis, signed PDF, Hindi/Marathi UI | ⏳ planned |

## Run locally

Requirements: Node.js 22 and pnpm 10.34.3 (see `mise.toml`).

```sh
pnpm install
cp .env.example .env.local # optional; defaults to the demo API
pnpm dev          # http://localhost:8443 (or the PORT environment variable)
```

Open the URL printed by Vite. Do not use VS Code's **Go Live** / Live Server:
it serves `index.html` as static files and cannot compile the React TypeScript
entrypoint.

Checks:

```sh
pnpm typecheck
pnpm test         # vitest: geo, trust rules, sync backoff, exporters
pnpm build
pnpm check        # all three
```

## Structure

```
src/
  App.tsx, main.tsx, index.css
  config/                       environment configuration
  hooks/                        TanStack Query hooks
  pages/                        Dashboard, map, upload, workspace routes
  components/
    common/DemoBadge.tsx          visible "Demo" marker
    evidence/TrustPanel.tsx       trust status + reasons
    layout/AppLayout.tsx          shell, topbar (demo badge + sync indicator)
    maps/WatershedMap.tsx         MapLibre map (created once; basemaps toggled)
    maps/WatershedPanel.tsx       clicked-watershed details
    sync/SyncIndicator.tsx        queue status, auto-sync, "Sync now"
  services/
    apiClient.ts                REST API client
    hydrosnapService.ts           all data I/O (mock or /api/v1)
    aiService.ts                  Vercel AI calls + photo SHA-256 cache
    offlineStore.ts               IndexedDB queue (v2, migrates v1 drafts)
    syncService.ts                upload with backoff + Idempotency-Key
    mock/mockData.ts              DEMO data (distinct boundaries, streams)
  types/                        domain and GeoJSON types
  tests/                        geo, trust, and sync/export tests
  utils/
    geo.ts                        point-in-polygon, bounds, nearest stream
    trust.ts                      rule-based evidence checks
    photo.ts                      browser image downscaling for AI requests
    exporters.ts                  GeoJSON / CSV / audit JSON
    watershedStats.ts             per-watershed counts
api/                              Vercel serverless AI routes
server/                           shared server-only Gemini/request helpers
  styles/hydrosnap-extensions.css styles for the new components
scripts/prepare_watersheds/       real boundaries → PMTiles (Phase 1)
docs/                             architecture, data sources, limitations, plan
public/                           PWA manifest, icon, service worker
```

Rules kept from the original design: UI never fetches directly (everything via
`services/`); coordinates are WGS84 `[lon, lat]`; location is never corrected
silently; no secrets in the frontend.

## API configuration

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_USE_MOCK_API=true          # false = call FastAPI under /api/v1 (not built yet)
VITE_WATERSHED_PMTILES_URL=     # optional real boundaries
VITE_WATERSHED_ATTRIBUTION=
```

Expected routes are listed in `docs/ARCHITECTURE.md`. Uploads are sent as
`POST /api/v1/uploads` with an `Idempotency-Key` header.

## AI prototype endpoints

Vercel serverless functions provide same-origin `POST /api/photo-analysis` and
`POST /api/pilot-summary`. Configure `GEMINI_API_KEY` in Vercel Project
Settings → Environment Variables; it has **no `VITE_` prefix** and is never
sent to the browser. `GEMINI_MODEL` defaults to `gemini-2.5-flash`.
`PHOTO_AI_ALLOWED_ORIGINS` is an optional comma-separated list of additional
allowed origins. `.env.example` documents the variable names only; never paste
the key into source files or commit it. For local API testing, use
`vercel dev` with the same server-side environment variables; Vite alone does
not serve the Vercel functions.

Photo checks send a browser-downscaled JPEG (longest edge 1024 px) and cache
successful results by the original image SHA-256 in IndexedDB. Unavailable
checks do not block saving; queued photos are retried at sync. This is an
advisory prototype with per-function-instance rate limiting, not an
authenticated production API. See [`docs/AI_EVALUATION.md`](docs/AI_EVALUATION.md)
for the required labelled-photo evaluation; no accuracy is claimed until that
evaluation is run. Photo pixels are sent to Google Gemini for classification;
the downscaled image is generated in a canvas, which removes EXIF metadata.

## Map and PWA

Basemaps: OpenStreetMap, OpenTopoMap, Esri World Imagery (public tile
endpoints; follow their usage terms and keep attribution). Labels are HTML
markers, so no glyph server is needed. The service worker caches the app shell
only after the site has been loaded online once; map tiles are not cached
offline. The upload form can save evidence offline to this device and sync it
when connectivity returns, but the map and its tiles are unavailable offline.
Load the site online before demonstrating offline mode.

The frontend is organized around the service boundary: route components use
`useHydroSnap`, which calls `hydrosnapService`; demo records live separately in
`src/services/mock/mockData.ts`. No backend or credentials are required to run
the prototype. Set `VITE_USE_MOCK_API=false` only when a compatible API is
available at `VITE_API_BASE_URL`.
