# HydroSnap 3D: Execution Plan and Context Handoff

> **How to use this file.** Upload it to the new Claude conversation (or put it in the repo as `docs/EXECUTION_PLAN.md` and point Claude Code at it). Paste the "Kick-off message" below as your first message. Then work phase by phase.

---

## 0. Kick-off message (paste this first)

```
You are my senior full-stack/GIS engineer for a Smart India Hackathon project.
Read the attached/linked EXECUTION_PLAN.md fully before doing anything.

Rules:
1. First, inspect the repo and confirm the "Current state" section is accurate.
   List anything that differs. Do not trust the plan blindly.
2. Work on ONE phase at a time, starting with Phase 0. Before coding a phase,
   give me a short plan (files to change, risks, what you will test).
3. After each task run `pnpm typecheck` and `pnpm build`, and tell me the result.
4. Never invent data, sources, accuracy numbers or licences. If something is
   simulated, it must be labelled "demo" in the UI and code.
5. Ask me before: adding a paid service, changing the stack, deleting files,
   or anything that needs credentials.
6. End every phase with: what changed, how to test it, what is still fake,
   and the next recommended step.

Start with Phase 0.
```

---

## 1. Project context (background from earlier work)

**Who/what:** Team *Rouge Minds* (SIH team ID 195299), project **HydroSnap-3D**, for **SIH 2026 Problem Statement SIH26015**: *Application of Geospatial Techniques for visualization and analysis to interpret Geo-Coded Images to enhance Watershed Development Outcomes.*
Sponsor: Ministry of Rural Development, Department of Land Resources (DoLR). Software category. Theme: Agriculture, FoodTech & Rural Development.

**What the official statement asks for** (summarised from the catalogue text):
- a) An integrated geospatial visualization framework combining geo-coded images with satellite data from the **SRISHTI-DRISHTI** platform (30 m data).
- b) Better interpretation of geo-coded images: land use, vegetation status, water resources, watershed interventions, environmental change.
- c) Thematic maps and visualization products: land use, drainage, vegetation, intervention maps, change-detection products.
- d) Better monitoring and assessment of watershed activities.
- e) Scientific support for decision-making (spatially validated, visually interpretable).
- f) A scalable, cost-effective approach that can be replicated.
- g) Stronger use of SRISHTI-DRISHTI.

**Background on SRISHTI-DRISHTI:** NRSC/ISRO built *Srishti* (web GIS on Bhuvan) and *Drishti* (Android field-data app) for monitoring watershed programmes. Field geo-tagged photos are collected, but are mostly used only as documentation. HydroSnap should act as an **analytics and verification layer on top of that**, not a replacement. Access to the official system may need credentials; build an adapter plus file import, and say clearly what is simulated.

**Competition note:** other teams publish similar stacks (React + FastAPI + PostGIS + YOLO + satellite indices). The differentiator must be **working, honest, end-to-end evidence**, not more feature names.

**Assumption:** the idea-submission deadline in the catalogue was 30 Sep 2026. This plan assumes the goal now is to build a strong, honest working prototype for the next stage.

### The app flow the team designed (target behaviour)
1. Field officer takes/uploads a site photo.
2. App checks connectivity; if offline, queue locally in IndexedDB and auto-sync later.
3. Extract EXIF metadata (GPS, time).
4. Content filter checks whether the photo shows a valid watershed asset.
5. If valid, continue; if not, flag for review.
6. Snap the point to the nearest drainage stream (PostGIS nearest-neighbour).
7. Check spatial ID: existing asset vs new project node. New → anchor new point; existing → append to the asset timeline.
8. Trigger satellite raster analysis for the location window.
9. Compute NDVI and NDWI change.
10. Render interactive map and export an audited PDF.

### Target architecture (planned, mostly not built yet)
React PWA + IndexedDB → FastAPI (validation) → Celery + Redis workers → PostgreSQL + PostGIS → satellite analytics (GEE or open STAC) → map dashboard (MapLibre) and PDF reports. Ground data engines: CartoDEM/open DEM for terrain, Sentinel-2 (10 m), Landsat 8/9 (30 m), Sentinel-1 SAR as a water fallback. Area-based assets (farm ponds, plantations) skip stream snapping and use a boundary/slope plausibility check instead.

---

## 2. Current state of the repository (verified 2026-10-03)

**Stack:** React 19, TypeScript, Vite 8, Tailwind CSS v4, react-router-dom 7,
TanStack Query 5, maplibre-gl + PMTiles, exifr, recharts, zod,
react-hook-form, and lucide-react. Node 22 and pnpm 10.34.3 are specified.
The `@/` alias resolves to `src/`. Cesium and backend packages are not
installed because the current frontend does not use them.

**Structure:** see the root `README.md` and `docs/ARCHITECTURE.md` for the
complete current layout. Application code, tests, and Vite client types live
under `src/`; static PWA files are in `public/`; docs and the watershed data
preparation script are in `docs/` and `scripts/prepare_watersheds/`.
`package.json` and `pnpm-lock.yaml` are the package manager manifest and lock.

**What works today:**
- MapLibre map with OSM, OpenTopoMap, and Esri imagery basemaps; layers,
  watershed selection/search, asset points, measure/locate tools, and 2D/3D
  terrain controls.
- Upload flow with EXIF GPS/time/camera parsing, device location or a manual
  pin, explicit location confirmation, watershed resolution, and trust checks.
- IndexedDB offline queue with retry/backoff and idempotency keys. In demo
  mode, sync is simulated locally; when mock mode is disabled, the REST client
  calls the configured API.
- Mock-or-REST service boundary, CSV/GeoJSON/audit exports, and PWA shell.

**Simulated or unavailable:**
- No FastAPI, PostgreSQL/PostGIS, authentication, Celery/Redis, GEE, or YOLO
  service is present. Mock data and roles are illustrative/UI-only.
- Watershed/stream/asset boundaries and NDVI/NDWI results are demo data.
- Setting `VITE_USE_MOCK_API=false` requires a compatible API at
  `VITE_API_BASE_URL`; it does not create or start a backend.
- Map tiles and elevation tiles use external OSM, OpenTopoMap, Esri, and AWS
  tile endpoints. Fonts are loaded from Google Fonts. Device geolocation
  requires browser permission; PMTiles boundaries are optional and not bundled.
- Map tiles are not cached for offline use.

The earlier prototype pass addressed the suspected map/data bugs described in
the report. See `docs/PROTOTYPE_REPORT.md` for that change record and
`docs/LIMITATIONS.md` for remaining limitations.

---

## 3. Working agreement for Claude

- **Honesty over polish.** Any simulated number, layer or result must carry a visible "Demo" label in the UI and a comment in code. No made-up accuracy, NDVI values presented as real, or "AI-verified" wording without a real model.
- **Small, verifiable steps.** One task at a time; run `pnpm typecheck` and `pnpm build` after each; keep the app runnable at every step.
- **Keep the architecture.** UI components never fetch directly; all I/O goes through `services/`. Coordinates are WGS84 `[lon, lat]`.
- **Never silently correct location.** The existing rule (officer confirms; manual changes are recorded) stays.
- **No secrets in the frontend.** Backend config via env.
- **Ask before:** new paid services, credentials, stack changes, file deletions, or large refactors.
- **Data licences:** before bundling any dataset, check the original provider's licence and record it in `docs/DATA_SOURCES.md` (name, URL, licence, date accessed, attribution text). Aggregator sites list licences, but verify at the source.
- **Report format after each phase:** Changes · How to test · Still fake · Risks · Next step.

---

## 4. Phased execution plan

Each phase leaves a working demo. Do them in order.

### Phase 0: Stabilise and make the prototype honest (1–2 days)

**Tasks**
1. Reproduce and fix the suspected bugs in Section 2.
   - Give each mock watershed its own distinct polygon (or load from a GeoJSON file).
   - Add a `glyphs` URL to the style (verify a public glyph server and font name that actually exist, or switch to HTML markers) so labels render.
   - Stop rebuilding the map on basemap change: use `map.setStyle` while re-adding sources/layers, or put all basemaps as hidden raster layers and toggle visibility. Preserve center/zoom/pitch.
   - Tie the scale bar to the map (use MapLibre `ScaleControl`).
2. Add a persistent "Demo data" indicator wherever mock data is shown.
3. Add `docs/DATA_SOURCES.md` and `docs/ARCHITECTURE.md` that separate **Built** vs **Planned**.
4. Update README to match reality.
5. Add basic lint/format scripts to CI later (just make sure `pnpm typecheck` and `pnpm build` are clean).

**Acceptance criteria**
- Each watershed has a different shape.
- Labels render; basemap switching keeps the view.
- `pnpm typecheck` and `pnpm build` pass with no errors.
- README says what is real and what is demo.

---

### Phase 1: Real watershed map (3–5 days). **Main requested feature**

Goal: the user can open the map, **see where real watersheds are**, click one and read its details, and every uploaded photo is linked to its watershed.

**Data**
- Candidates (verify licence and coverage at the original source before use):
  - SLUSI micro-watersheds (finest level; ~321,763 polygons nationally).
  - CWC WRIS watersheds (one tier below sub-basin) and sub-basins/basins.
  - HydroBASINS (global fallback; free for commercial use under the HydroSHEDS licence).
  - Do **not** use layers whose terms forbid export/offline use.
- For the demo, clip to one region (Pune district / Maharashtra) to keep tiles small.

**Tasks**
1. Data prep script (`scripts/prepare_watersheds/`): download → clip to the demo region → keep only needed attributes (code, name, area, district) → build vector tiles with **tippecanoe** into **PMTiles**. Keep the script reproducible and documented.
2. Host the `.pmtiles` file statically (e.g. in `public/` for the demo or a static bucket) and register the **pmtiles** protocol in MapLibre (`pmtiles` npm package).
3. Zoomed levels: basins at low zoom, watersheds mid zoom, micro-watersheds at high zoom, via `minzoom`/`maxzoom` per layer.
4. UI:
   - Hover highlight (feature-state) and click → side panel: name, code, area, district, number of assets, % verified, last inspection.
   - Search box (name/code/district) with fly-to.
   - "Which watershed am I in?" using the existing locate-me.
   - Layer panel entries for the new levels (reuse the existing layer toggle pattern).
5. **Choropleth:** colour watersheds by a metric (e.g. verified assets, pending reviews, project status) with a legend.
6. **Point-in-polygon at upload:** in `ImageUploadPage.tsx`, after the officer confirms the location, resolve the containing watershed (turf `booleanPointInPolygon` over the loaded features, or later PostGIS `ST_Contains` on the server) and store `watershedId` on the observation. If the point is outside all known watersheds, show a clear warning instead of failing.
7. Update types (`Watershed` gets real code/level/parent fields), mock service, and tests for the geo utilities.

**Acceptance criteria**
- Real boundaries render for the demo region at multiple zoom levels.
- Clicking a watershed shows real attributes and asset counts.
- A newly confirmed upload is automatically attached to the correct watershed, and appears on the map.
- Map stays smooth (no multi-MB GeoJSON loaded at once).
- `docs/DATA_SOURCES.md` lists every dataset with licence and attribution; the map shows attribution.

---

### Phase 2: Backend MVP (about 1.5 weeks)

**Tasks**
1. Create `backend/` with **FastAPI + PostgreSQL/PostGIS**, run via `docker compose` (db, api; Redis later). Use SQLAlchemy/GeoAlchemy2 + Alembic migrations.
2. Implement the endpoints the frontend already expects under `/api/v1/` with the same JSON shapes as `src/types/domain.ts`:
   `GET /watersheds`, `GET /layers`, `GET/POST /assets`, `GET/POST /uploads`, `PATCH /uploads/{id}/verify`, `GET/POST /analytics`, `GET /analytics/jobs`, `GET /analytics/results`, `GET /interventions`, `GET/POST /reports`, `GET /users/me`, `GET /users/team`.
3. Auth with three roles (Field Officer, GIS Analyst, Administrator) and role checks (JWT is fine for the prototype).
4. Store uploaded photos (local volume now, object storage later); keep EXIF metadata, a SHA-256 hash and an audit trail table.
5. Load watershed boundaries into PostGIS; expose a spatial endpoint to resolve a point to a watershed.
6. **Real offline sync:** a queue in IndexedDB with status (pending/syncing/synced/failed), retry with backoff, idempotency keys, and a visible sync indicator. Use background sync only if supported; always keep a manual "Sync now".
7. Turn off the mock flag by default in a `.env.local` demo profile; keep mock mode available for UI work.

**Acceptance criteria**
- `docker compose up` starts the stack; `VITE_USE_MOCK_API=false` works end to end.
- A photo taken offline syncs when the connection returns and shows up on the map without duplicates.
- Role restrictions work (e.g. only analyst/admin can verify).

---

### Phase 3: Evidence integrity and review pipeline (about 1 week)

**Tasks**
1. Server-side checks per upload: EXIF present/consistent, timestamp plausibility, GPS accuracy threshold, SHA-256 duplicate detection, "inside the declared watershed?" check.
2. Snap to nearest stream **only for stream-based assets** (check dams, weirs) using a stream layer in PostGIS (`ST_ClosestPoint`/KNN); area-based assets (farm ponds, plantations) use watershed containment and plausibility instead.
3. New-vs-existing asset resolution: match by proximity + type within a configurable radius; if ambiguous, send to human review.
4. **Content filter, honestly:** start with a small labelled dataset and either a pretrained classifier or a fine-tuned YOLOv8 model. Output a **suggestion with a confidence value**, never an automatic rejection. Anything doubtful goes to a "Needs review" queue. Record model version and confidence in the audit trail.
5. Trust status per observation (e.g. Consistent / Needs review / Flagged) with the reasons listed.

**Acceptance criteria**
- Each upload shows a trust status with explainable reasons.
- Duplicates and out-of-watershed points are caught.
- No photo is auto-rejected by the model alone.

---

### Phase 4: Real satellite analytics (1–2 weeks)

**Tasks**
1. Choose a provider and confirm terms: Google Earth Engine (check usage terms for this kind of use) **or** open STAC catalogues (e.g. Sentinel-2/Landsat on public archives) with rasterio. Document the choice. Credentials never go in the frontend.
2. Celery + Redis jobs: for an asset/watershed, fetch cloud-masked scenes in a window, compute **NDVI** and **NDWI**, store results and metadata (scene IDs, dates, resolution, cloud fraction) in `analysis_results`.
3. Use **Landsat (30 m)** to match the problem statement resolution; use Sentinel-2 (10 m) as an optional higher-resolution view.
4. Before/after analysis around an intervention date. Compare the **same season** across years so normal vegetation cycles are not mistaken for impact. Show the result as an **indicator with uncertainty notes**, not proof of impact.
5. Job status (Queued/Processing/Completed/Failed) with progress in the UI (the types already exist); handle "no clear scene" with a clear message.
6. Replace simulated overlays with real raster tiles or clipped GeoJSON/PNG layers; keep the "Demo" label only where something is still simulated.

**Acceptance criteria**
- At least one real watershed shows real NDVI/NDWI time series and a before/after comparison with scene metadata visible.
- Failures and cloud-covered periods are handled and explained.

---

### Phase 5: Terrain and drainage (about 1 week)

**Tasks**
1. Use an open DEM (verify the source and licence; CartoDEM is NRSC, others are SRTM/Copernicus). Compute slope and flow direction/accumulation (e.g. WhiteboxTools or pysheds); extract a stream network and watershed delineation for the demo area.
2. Use computed streams for the Phase 3 snap and for a "drainage map" layer.
3. Slope plausibility check for area-based assets.
4. Optionally show a terrain 3D view using the existing MapLibre terrain mode.

**Acceptance criteria**
- A drainage layer and slope layer render for the demo area.
- Check-dam placement can be tested against computed streams and slope.

---

### Phase 6: Reports, dashboards, accessibility (about 1 week)

**Tasks**
1. Audited PDF per asset and per watershed: map snapshot, photo(s) with hash and EXIF, trust status, audit trail, NDVI/NDWI before/after with scene metadata and data-source attributions.
2. Dashboards: coverage (watersheds with recent evidence), verification backlog, intervention status, simple trend charts (recharts already installed).
3. Exports: GeoJSON and CSV.
4. Languages: English plus Hindi and Marathi for the field upload flow (i18n library); keep the UI simple for low-bandwidth use.
5. **DRISHTI/SRISHTI interoperability:** import/export adapter using the field format as known/available; if no official API access, support file import and state this in the docs.

**Acceptance criteria**
- An officer can generate a PDF audit report for one watershed that is traceable to real photos and real scenes.
- Basic Hindi/Marathi UI works in the upload flow.

---

### Phase 7: Hardening and demo readiness (about 1 week)

**Tasks**
1. Tests: unit tests for geo utilities and trust rules; API tests; one Playwright test for upload → sync → map.
2. CI (GitHub Actions): typecheck, build, tests.
3. Synthetic load test (many photos) and map performance check on a mid-range phone.
4. Offline test: airplane mode, reload, upload, reconnect.
5. Seed a realistic demo dataset (clearly marked) and write a **5-minute demo script**.
6. Final docs: `ARCHITECTURE.md`, `DATA_SOURCES.md`, `LIMITATIONS.md`, deployment guide.

**Acceptance criteria**
- A new machine can run the full stack from the README in under 30 minutes.
- The demo script runs without surprises; every limitation is documented.

---

## 5. Suggested demo story (for judges)

1. Open the map, zoom from basin to micro-watershed, click one: see real attributes.
2. Field officer, offline, captures a photo of a check dam; it queues locally.
3. Reconnect: it syncs, gets a watershed, snaps to a stream, gets a trust status.
4. Open the asset: before/after NDVI/NDWI with scene dates and notes on uncertainty.
5. Export the audited PDF.
6. Show the coverage dashboard and the honest limitations page.

---

## 6. Corrections to the original flowchart (use these when updating the diagram)

- Add the officer **location-confirmation** step.
- Replace "Reject / log fraud" with "**Needs review**" and record the reason.
- Show **stream-based vs area-based** asset branches separately.
- Add a **fallback when no clear satellite scene** exists.
- Add an **async job status** step (queued/processing/done/failed).
- Add **SRISHTI-DRISHTI import/export**.

---

## 7. Risks and how to handle them

| Risk | Handling |
|---|---|
| Watershed data licence or coverage unclear | Verify at source, record in `DATA_SOURCES.md`; fall back to HydroBASINS |
| Huge boundary files slow the map | PMTiles / vector tiles, clip to demo region |
| No labelled images for the content filter | Small labelled set, suggestion-only model, human review |
| Cloud cover breaks time series | Cloud mask, same-season comparison, "no clear scene" state |
| GEE terms or access limits | Document terms; keep an open STAC/rasterio fallback |
| No official SRISHTI-DRISHTI access | File import adapter; be explicit about it |
| Scope creep | Do phases in order; each ends in a working demo |
| Overclaiming | "Demo" labels, indicators not proof, limitations page |

---

## 8. Out of scope (do not build unless asked)

- CesiumJS (MapLibre terrain is enough).
- Blockchain or "cryptographic" claims beyond simple hashing.
- Automatic fraud accusations from a model.
- Any claim of verified environmental impact from NDVI/NDWI alone.
- Paid map or AI services without approval.

---

## 9. Definition of done (whole project)

- Real watershed boundaries on the map, linked to real uploaded evidence.
- Working offline-to-online sync.
- A real backend with roles and an audit trail.
- At least one watershed with real satellite indicators and metadata.
- An audited PDF export.
- Clear documentation of what is real, what is simulated and what is planned.
