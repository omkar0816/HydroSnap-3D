# HydroSnap 3D

**Live prototype:** [hydrosnap-3d.vercel.app](https://hydrosnap-3d.vercel.app/)

Watershed field-evidence and monitoring prototype for **SIH 2026 · SIH26015**
(DoLR, Ministry of Rural Development): geo-coded field photos + watershed
boundaries + satellite indicators, built as an analytics/verification layer
that could sit on top of SRISHTI-DRISHTI.

> **Prototype status: frontend-first, demo data.** An optional local
> PostgreSQL/PostGIS API is available for development; the default remains
> mock mode. The optional Vercel function generates pilot-analysis summaries;
> photo checks use local metadata and spatial rules, not image classification.
> Watershed boundaries, assets and NDVI/NDWI values are illustrative and
> labelled **Demo** in the UI. See
> [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md).

## What's real and what is not

| Real | Simulated | Planned |
|---|---|---|
| Browser-side image handling, EXIF parsing when present, device GPS, explicit location confirmation, local metadata/spatial checks, and optional local Express/PostGIS API | Watershed boundaries, seeded assets and streams, dashboard index values, mock analysis-job lifecycle, and the pipeline fixture location | Custom image-classification model, production API/database, verified field-asset records, operational satellite monitoring, and server-enforced roles for the local API |
| IndexedDB local queue and browser map rendering | Mock-mode sync, permissions, and role behavior | Hindi/Marathi interface and server-side trust checks |
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
| Optional Supabase email/password officer login and RLS policies | ✅ when configured; new officers require approval |
| Exports: assets GeoJSON / CSV, per-observation audit JSON | ✅ |
| Express + PostgreSQL/PostGIS data API with spatial watershed lookup, stream snap, spatial asset/evidence storage, and idempotent uploads | ✅ local backend; no official data or authentication is bundled |
| Verified real-asset satellite analysis, signed PDF, Hindi/Marathi UI | ⏳ planned |

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

In `.env.local`, set `VITE_USE_MOCK_API=false`. Apply the SQL migration and
load the existing illustrative watersheds, streams, assets, layers, and demo
results:

```sh
pnpm db:setup
```

Run the API and Vite in separate terminals:

```sh
pnpm api:dev
pnpm dev
```

The API listens at `http://localhost:8000`. The database setup migration
enables PostGIS and creates spatial indexes; `pnpm db:setup` applies it once
and seeds demo data, which is still illustrative rather than official. Spatial
lookup uses `ST_Covers` (boundary points count as inside) and picks the
smallest overlapping watershed. Stream snapping uses PostGIS geography
distances in metres and returns a separate snapped point; it never moves the
officer-confirmed point. Uploaded photos are verified against their SHA-256,
written under `storage/uploads/`, and referenced by URL in API responses.

See [`docs/BACKEND.md`](docs/BACKEND.md) for routes, environment variables,
storage behavior, and limitations. The Compose credentials in
`.env.example` are development defaults only. This backend does not implement
authentication/authorization or satellite-job workers; do not expose it to an
untrusted network.

## Optional Supabase officer login

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` using
the Supabase project URL and public publishable/anon key, then restart Vite.
Run [`supabase/schema.sql`](supabase/schema.sql) once in the Supabase SQL
Editor. The login page supports email/password sign-in and officer
registration. New registrations stay pending until an administrator approves
the profile, for example in the SQL Editor:

```sql
update public.officers
set status = 'active'
where email = 'officer@example.gov.in';
```

Allow `http://localhost:8443/login` and your deployed `/login` URL in the
Supabase Auth redirect URL configuration for email confirmation links.

When Supabase is not configured, the existing illustrative demo remains
accessible without sign-in, and `/login` displays setup instructions. Supabase
RLS protects the tables created by its schema. The separate Express/PostGIS
API does not validate Supabase sessions, so this login does not secure that
API; keep it on a trusted local network only.

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
VITE_USE_MOCK_API=true          # false = call the local Express API under /api/v1
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
`src/services/mock/mockData.ts`. No backend or credentials are required to run
the prototype in mock mode. Set `VITE_USE_MOCK_API=false` only when the local
Express API is running at `VITE_API_BASE_URL`.
