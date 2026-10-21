# HydroSnap 3D

**Live prototype:** [hydrosnap-3d.vercel.app](https://hydrosnap-3d.vercel.app/)

Watershed field-evidence and monitoring prototype for **SIH 2026 · SIH26015**
(DoLR, Ministry of Rural Development): geo-coded field photos + watershed
boundaries + satellite indicators, built as an analytics/verification layer
that could sit on top of SRISHTI-DRISHTI.

> **Prototype status: demo data with a local authenticated backend.** The
> example environment uses the Express/PostgreSQL API; mock mode is opt-in and
> visibly labeled. Photo checks use server-recomputed metadata and spatial
> rules, not image classification. Watershed boundaries, assets and seeded
> measurements remain illustrative and labelled **Demo**. See
> [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md).

## What's real and what is not

| Real | Simulated | Planned |
|---|---|---|
| Browser-side image handling, explicit location confirmation, Supabase JWT enforcement, PostGIS verification/evidence, validated reports, and a queued Sentinel-2 worker | Watershed boundaries, seeded assets/streams/satellite rows, and dashboard summary values | Verified field-data coverage, production hosting/storage, and operational role provisioning |
| IndexedDB local queue and browser map rendering | Mock-mode sync and illustrative role data | Hindi/Marathi application interface |
| Sentinel-2 scenes, browser-generated inspection PDFs, and optional AI-generated English/Hindi/Marathi pilot summaries | Sentinel-2 indices at the demo fixture are a pipeline test, not a real asset result; no trained photo model or labelled photo-evaluation set is bundled; AI translations have not been linguistically reviewed | Verified real-pilot comparisons, a trained and evaluated photo classifier, reviewed translations, and a signed/server-verified report |

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
| Local checks for photo GPS vs confirmed point, watershed containment, duplicates, capture date, GPS accuracy, and stream proximity; officer must attest to photo content | ✅ no image sent to an AI API |
| Existing/new asset choice with an officer-confirmed nearby match | ✅ |
| Asset Passport photo timeline, demo-fixture Sentinel-2 comparison, and AI summary in English/Hindi/Marathi | ✅ pipeline test; translations unreviewed |
| Client-generated asset inspection PDF with map snapshot, audit details, and marked AI summary | ✅ prototype, not digitally signed |
| Point-in-polygon → watershed auto-assigned; warning if outside all | ✅ |
| Stream snap preview for check dams / percolation tanks (point never moved silently) | ✅ demo streams |
| Rule-based data-check status with passed checks and attention items; photo content remains an officer decision | ✅ client preview |
| Offline queue in IndexedDB, auto-sync on reconnect, backoff, idempotency key, "Sync now" | ✅ syncs to demo API in mock mode |
| Role check: only GIS Analyst / Administrator can verify | ✅ UI-level |
| Exports: assets GeoJSON / CSV, per-observation audit JSON | ✅ |
| Authenticated Express + PostgreSQL/PostGIS API with watershed evidence, upload verification, saved reports, and typed analysis jobs | ✅ local prototype; seed records are demo |
| Sentinel-2 worker with seasonal windows and data-quality gating | ✅ implemented; requires worker dependencies/network and real watershed inputs |
| Production deployment, managed storage, official data, signed PDF, Hindi/Marathi UI | ⏳ not included |

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

## Run the PostgreSQL/PostGIS backend

The optional local backend is Express + TypeScript + `pg` with PostgreSQL
16/PostGIS 3.6. Start the database and configure the local environment:

```sh
pnpm install
docker compose up -d db
cp .env.example .env.local
```

Apply ordered migrations. To also load illustrative fixtures, add `--seed`;
demo seeding is refused when `NODE_ENV=production`:

```sh
pnpm db:setup
pnpm db:setup --seed
```

Run the API and Vite in separate terminals:

```sh
pnpm api:dev
pnpm dev
```

The API listens at `http://localhost:8000`. `pnpm db:setup` applies ordered
idempotent migrations; `pnpm db:setup --seed` separately loads demo data, which
remains illustrative rather than official. Spatial
lookup uses `ST_Covers` (boundary points count as inside) and picks the
smallest overlapping watershed. Stream snapping uses PostGIS geography
distances in metres and returns a separate snapped point; it never moves the
officer-confirmed point. Uploaded photos are verified against their SHA-256,
written under `storage/uploads/`, and referenced by URL in API responses.

See [`docs/BACKEND.md`](docs/BACKEND.md) for routes, environment variables,
storage behavior, and limitations. The Compose credentials in
`.env.example` are development placeholders only. Do not expose the local
backend to an untrusted network.

The map-analysis page also includes authenticated DiCRA STAC collection and
item discovery. This currently displays catalogue metadata only; raster
rendering and DiCRA-specific worker processing are not configured. See
[`docs/DICRA_INTEGRATION.md`](docs/DICRA_INTEGRATION.md).

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
    hydrosnapService.ts           domain data I/O (mock or /api/v1)
    spatialService.ts             PostGIS spatial API with offline geo.ts fallback
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
    exporters.ts                GeoJSON / CSV / audit JSON
    watershedStats.ts           per-watershed counts
api/                              Vercel serverless AI routes
server/                           Express API and server-only Gemini helpers
db/migrations/                    PostgreSQL/PostGIS schema
src/styles/                       global styles and map timeline styles
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
VITE_USE_MOCK_API=false         # true = visibly labeled illustrative mock mode
VITE_WATERSHED_PMTILES_URL=     # optional real boundaries
VITE_WATERSHED_ATTRIBUTION=
```

Expected routes are listed in `docs/ARCHITECTURE.md`. Uploads are sent as
`POST /api/v1/uploads` with an `Idempotency-Key` header.

## Optional pilot-summary endpoint

Only the optional `POST /api/pilot-summary` endpoint uses the configured AI gateway. Configure
`OMNIROUTE_API_KEY` in Vercel Project Settings → Environment Variables; it has no
`VITE_` prefix and is never sent to the browser. Photo verification does not
call that endpoint and does not require an AI gateway key. The Vite development
server routes the pilot-summary request to the same server-side handler.

The photo workflow checks image metadata and compares the confirmed point with
the loaded watershed and stream data. It does not classify image pixels or
decide that a photo actually depicts a watershed asset. An officer must attest
to the content; the saved record remains pending independent verification.
See [`docs/AI_EVALUATION.md`](docs/AI_EVALUATION.md) for what is required before
adding a custom visual classifier.

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
`src/services/mock/mockData.ts`. Mock mode does not require the backend. The
example environment uses the local Express API at `VITE_API_BASE_URL`, with
Supabase JWTs required for protected routes.
