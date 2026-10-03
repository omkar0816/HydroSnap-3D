# Prototype pass — report (3 Oct 2026)

Scope agreed: a rough working prototype, frontend-only, following Phases 0–3
of `EXECUTION_PLAN.md` where they don't need a backend.

## Phase 0 — Stabilise & honesty
**Changes**
- Each demo watershed now has its own polygon (bug 1 fixed).
- Labels: replaced the glyph-dependent symbol layer with HTML markers (bug 2).
  Public glyph servers could not be verified from the build sandbox.
- Map is created once; basemaps are three raster layers toggled by visibility,
  so view, layers and pitch survive switching (bugs 3, 4).
- Live `ScaleControl` replaces the static "500 m" (bug 5).
- Global "Demo data" badge, demo notes on map, docs split Built vs Planned (bug 6).
- Added missing `public/icon.svg` referenced by the manifest.

## Phase 1 — Watershed map (demo data)
All watersheds drawn with hover (feature-state), click → panel, search +
fly-to, "Which watershed am I in?", choropleth + legend, PMTiles support,
point-in-polygon at upload with outside-boundary warning, data prep script.

## Phase 2 (frontend part) — Offline sync
IndexedDB queue v2 (migrates v1 drafts), statuses, exponential backoff,
Idempotency-Key, auto-sync on `online` + every 30 s, "Sync now", topbar
indicator. React Query set to `offlineFirst` / `always` so saves work offline.

## Phase 3 (client preview) — Evidence integrity
SHA-256, EXIF time/camera, rule checks with reasons, stream-distance for
stream-based assets only, audit trail entries for location source, manual
watershed override and the trust result. UI-level role check on Verify.

## How to test
`pnpm check` (typecheck + 16 unit tests + build), then follow `DEMO_SCRIPT.md`.
Smoke-tested in headless Chromium: all pages load without runtime errors;
offline save → "1 queued" → reconnect → "All synced".

## Still fake
Boundaries, streams, assets, NDVI/NDWI, sync target (mock), roles (no auth).

## Next step
Phase 2 backend: FastAPI + PostGIS via docker compose implementing the routes
in `ARCHITECTURE.md`, then flip `VITE_USE_MOCK_API=false`.
