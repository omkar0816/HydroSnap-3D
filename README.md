# HydroSnap 3D

Watershed field-evidence and monitoring prototype for **SIH 2026 · SIH26015**
(DoLR, Ministry of Rural Development): geo-coded field photos + watershed
boundaries + satellite indicators, built as an analytics/verification layer
that could sit on top of SRISHTI-DRISHTI.

> **Prototype status: frontend-only, demo data.** No backend or database is
> connected yet. Watershed boundaries, assets and NDVI/NDWI values are
> illustrative and labelled **Demo** in the UI. See
> [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md).

## What works now (real code, demo data)

| Area | Status |
|---|---|
| Map: 3 basemaps, switch without losing view, live scale bar, 2D/3D terrain, measure | ✅ |
| All watersheds drawn, hover highlight, click → details panel (assets, % verified, last inspection) | ✅ demo boundaries |
| Watershed search + fly-to, "Which watershed am I in?" | ✅ |
| Choropleth (mapped / verified / pending) with legend | ✅ |
| Optional real boundaries via PMTiles (`VITE_WATERSHED_PMTILES_URL`) | ✅ code ready, no data bundled |
| Upload: EXIF GPS/time/camera, device GPS or pin, **officer must confirm** | ✅ |
| Point-in-polygon → watershed auto-assigned; warning if outside all | ✅ |
| Stream snap preview for check dams / percolation tanks (point never moved silently) | ✅ demo streams |
| Rule-based trust status (EXIF, time, GPS accuracy, SHA-256 duplicate, watershed, stream distance) with reasons | ✅ client preview |
| Offline queue in IndexedDB, auto-sync on reconnect, backoff, idempotency key, "Sync now" | ✅ syncs to demo API in mock mode |
| Role check: only GIS Analyst / Administrator can verify | ✅ UI-level |
| Exports: assets GeoJSON / CSV, per-observation audit JSON | ✅ |
| Backend (FastAPI + PostGIS), real satellite analytics, PDF, Hindi/Marathi | ⏳ planned |

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
    offlineStore.ts               IndexedDB queue (v2, migrates v1 drafts)
    syncService.ts                upload with backoff + Idempotency-Key
    mock/mockData.ts              DEMO data (distinct boundaries, streams)
  types/                        domain and GeoJSON types
  tests/                        geo, trust, and sync/export tests
  utils/
    geo.ts                        point-in-polygon, bounds, nearest stream
    trust.ts                      rule-based evidence checks
    exporters.ts                  GeoJSON / CSV / audit JSON
    watershedStats.ts             per-watershed counts
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

## Map and PWA

Basemaps: OpenStreetMap, OpenTopoMap, Esri World Imagery (public tile
endpoints; follow their usage terms and keep attribution). Labels are HTML
markers, so no glyph server is needed. The service worker caches the app shell
only; map tiles are not cached offline.

The frontend is organized around the service boundary: route components use
`useHydroSnap`, which calls `hydrosnapService`; demo records live separately in
`src/services/mock/mockData.ts`. No backend or credentials are required to run
the prototype. Set `VITE_USE_MOCK_API=false` only when a compatible API is
available at `VITE_API_BASE_URL`.
