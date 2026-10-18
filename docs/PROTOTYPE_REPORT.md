# Prototype pass — report (3 Oct 2026)

Scope agreed: a rough working prototype, frontend-only, following Phases 0–3
of [`internal/EXECUTION_PLAN.md`](internal/EXECUTION_PLAN.md) where they don't
need a backend.

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

## AI prototype additions

Vercel functions now provide optional Gemini photo suggestions and
PilotAnalysis summaries. Photo suggestions use a closed label set, are
warning-only, and are never verification. English/Hindi/Marathi summaries use
only supplied pilot metrics and are marked AI-generated; translations still
need speaker review. No labelled 40–60 photo set was supplied for accuracy
testing, so no model accuracy or confusion-matrix values are claimed. See
[`AI_EVALUATION.md`](AI_EVALUATION.md) for the evaluation protocol/template.

## Local PostGIS backend
Express + PostgreSQL/PostGIS are available for local development through
Docker Compose. The API applies a SQL migration, seeds the existing
illustrative records, persists API records, and exposes PostGIS watershed
lookup and nearest-stream operations. Photo bytes are stored under
`storage/uploads/`; the database keeps their relative paths and hashes.

**Still not implemented:** production authentication/authorization, object
storage, stream/watershed import tooling, and satellite-analysis workers.
Configure `VITE_USE_MOCK_API=false` after starting the local backend. Seeded
records are illustrative and are not replacements for licensed, verified data.
