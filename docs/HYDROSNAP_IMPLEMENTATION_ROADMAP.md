# HydroSnap-3D: End-to-End Implementation Roadmap (for GitHub Copilot)

This roadmap turns the four functions into working, server-verified features:

1. Officer data verification
2. Satellite intelligence
3. Watershed knowledge engine
4. AI report generator

It is written against the current repo (`server/api.ts`, `db/migrations/001_init.sql`, `schema.sql`, `scripts/compute_indices/`, `server/reportValidator.ts`, `src/services/reportFacts.ts`, `src/pages/*`).

> **Repo-state note for Copilot.** The audit this roadmap is based on read a newer zip than the text dump. These files exist in the zip but may not be in your working tree: `api/watershed-report.ts`, `scripts/**/analyze_watershed.py`, `src/utils/trust.ts` (the dump has `src/tests/trust.test.ts`). Before each task, search the repo for the file. If it is missing, create it at the path given, reusing logic from the nearest existing file (for example `band_transform` in `compute_indices.py`).

---

## 0. Ground rules (read before every task)

1. **One phase = one branch = one PR.** Run `pnpm check` (typecheck + test + build) before finishing. Do not start the next phase until the current one passes.
2. **The server is the source of truth.** The browser sends IDs and raw inputs only. It never sends facts, trust results or verification status that the server then believes.
3. **No fabricated data.** Every stored fact row has `source`, `source_licence`, `recorded_at` and `demo`. Demo rows are always `demo = true`, and the report must label them as demo.
4. **Never write "impact".** Satellite change is reported as "difference between windows". No causal claims.
5. **Numbers are computed in code, never by the LLM.** The model only words facts that code has already computed.
6. **Migrations are additive and idempotent.** New files `db/migrations/00N_*.sql`. Never edit `001_init.sql`.
7. **Every new endpoint gets**: auth middleware, zod/validation (`server/validation.ts`), and at least one vitest test.
8. **Secrets stay server-side.** No `service_role`, DB URL or LLM key in any `VITE_*` variable.

### Target architecture

```
Browser (React)  ──JWT──▶  Express API (server/)  ──▶  PostGIS (single spatial DB)
                              │   ├─ auth: verifies Supabase JWT
                              │   ├─ verification engine (shared/trustRules.ts)
                              │   ├─ evidence builder → fact builder → LLM → validator
                              │   └─ analysis_jobs queue
                              ▼
                     Python satellite worker (polls analysis_jobs, writes satellite_measurements)

Supabase = identity only (Auth + officers table + RLS). PostGIS = all spatial/evidence data.
```

---

## Phase 0: Foundation (auth, migrations, config, test harness)

**Goal:** one backend, authenticated, with a migration runner and a test database.

### 0.1 Migration runner
- Edit `scripts/db-setup.ts` to apply every file in `db/migrations/` in filename order.
- Create a `schema_migrations(filename text primary key, applied_at timestamptz default now())` table and skip files already applied.
- **Acceptance:** `pnpm db:setup` twice in a row succeeds and the second run applies nothing.

### 0.2 Auth middleware (Express)
- Add dependency `jose`.
- New file `server/auth.ts`:
  - `requireAuth`: reads `Authorization: Bearer <jwt>`, verifies it against Supabase JWKS (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`), and rejects expired or bad-audience tokens with 401.
  - `requireOfficer`: after `requireAuth`, calls Supabase REST `GET /rest/v1/officers?id=eq.<sub>&select=id,officer_code,name,status` using the user's own JWT and the anon key (RLS lets an officer read their own row). Require `status = 'active'`, otherwise 403. Cache the result for 60 seconds per `sub`.
  - `requireGovernment`: same idea against `government_admins`.
  - Attach `request.user = { id, officerCode, name, role }`.
- Add env vars in `server/env.ts` and `.env.example`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- Edit the CORS block in `server/api.ts`: add `"Authorization"` to `allowedHeaders`. This is currently missing and will break every authenticated call.
- Apply middleware:
  - `GET /health` stays public.
  - All `POST`/`PATCH` routes → `requireOfficer`.
  - `GET` routes → `requireAuth` (officer or government).
  - Replace the hard-coded user in `GET /api/v1/users/me` with `request.user`.
- **Acceptance (tests):** no token → 401, suspended officer → 403, valid officer → 200. Mock the JWKS fetch in the tests.

### 0.3 Test harness
- Add `server/__tests__/` with a helper that starts the app against a throwaway PostGIS schema (use `docker-compose` service `postgis`, or `pg-mem` only for non-spatial tests; spatial tests need real PostGIS).
- Add `pnpm test:server` and include it in `pnpm check`.

### 0.4 Turn off the mock default
- `.env.example`: set `VITE_USE_MOCK_API=false`.
- `src/config/env.ts`: if mock is on, show a persistent `DemoBadge` banner across the app layout.
- **Acceptance:** a fresh run with the example env talks to the real API, and a mock run is visibly labelled.

### 0.5 Frontend token passing
- `src/services/apiClient.ts`: attach the Supabase session `access_token` as `Authorization: Bearer`. On 401, refresh the session once, then redirect to login.

---

## Phase 1: Knowledge engine (Function 3)

**Goal:** one endpoint returns everything known about a watershed, with provenance on every row.

### 1.1 Migration `db/migrations/002_knowledge_engine.sql`

Use typed columns with `payload jsonb` kept only for legacy compatibility.

```sql
-- Provenance columns for existing tables
ALTER TABLE assets              ADD COLUMN IF NOT EXISTS installed_at date,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'officer-entry',
  ADD COLUMN IF NOT EXISTS source_licence text,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false;
ALTER TABLE field_observations  ADD COLUMN IF NOT EXISTS officer_id text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'Pending review',
  ADD COLUMN IF NOT EXISTS asset_id text,
  ADD COLUMN IF NOT EXISTS asset_type text,
  ADD COLUMN IF NOT EXISTS inspection_date date,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'officer-field-photo',
  ADD COLUMN IF NOT EXISTS source_licence text,
  ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false;
ALTER TABLE streams             ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_licence text,
  ADD COLUMN IF NOT EXISTS stream_order int,
  ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT true;
ALTER TABLE watersheds          ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_licence text,
  ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT true;

-- Interventions become real rows linked to assets
ALTER TABLE interventions
  ADD COLUMN IF NOT EXISTS watershed_id text,
  ADD COLUMN IF NOT EXISTS asset_id text REFERENCES assets(id),
  ADD COLUMN IF NOT EXISTS installed_at date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Planned',
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'officer-entry',
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS interventions_watershed_idx ON interventions (watershed_id);
CREATE TABLE IF NOT EXISTS intervention_status_history (
  id bigserial PRIMARY KEY,
  intervention_id text NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  from_status text, to_status text NOT NULL,
  changed_by text NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(), note text
);

-- Satellite measurements (written by the worker)
CREATE TABLE IF NOT EXISTS satellite_measurements (
  id text PRIMARY KEY,
  watershed_id text NOT NULL,
  asset_id text,                       -- null = whole watershed
  aoi_scope text NOT NULL CHECK (aoi_scope IN ('watershed','asset_buffer')),
  buffer_m int,
  index_type text NOT NULL CHECK (index_type IN ('NDVI','NDWI')),
  window_role text NOT NULL CHECK (window_role IN ('baseline','current','custom')),
  window_start date NOT NULL, window_end date NOT NULL,
  season_label text,                   -- e.g. 'Nov-Dec'
  mean double precision, median double precision,
  p10 double precision, p90 double precision, std double precision,
  valid_pixel_pct double precision,
  scene_count int, scene_ids text[] NOT NULL DEFAULT '{}',
  cloud_limit_pct int, method text NOT NULL, resolution_m int,
  status text NOT NULL CHECK (status IN ('measured','insufficient_data','failed')),
  job_id text, computed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL, source_licence text, attribution text,
  demo boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS satmeas_ws_idx ON satellite_measurements (watershed_id, index_type, window_start);

-- Land use
CREATE TABLE IF NOT EXISTS land_use (
  id text PRIMARY KEY,
  watershed_id text NOT NULL,
  class_name text NOT NULL, area_ha double precision NOT NULL, pct double precision NOT NULL,
  reference_year int NOT NULL,
  source text NOT NULL, source_licence text,
  recorded_at timestamptz NOT NULL DEFAULT now(), demo boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS land_use_ws_idx ON land_use (watershed_id);

-- Drainage summary (computed from streams by PostGIS, or imported)
CREATE TABLE IF NOT EXISTS drainage (
  watershed_id text PRIMARY KEY,
  stream_length_km double precision NOT NULL,
  drainage_density_km_per_km2 double precision NOT NULL,
  max_stream_order int,
  source text NOT NULL, source_licence text,
  recorded_at timestamptz NOT NULL DEFAULT now(), demo boolean NOT NULL DEFAULT false
);
```

### 1.2 Backfill and seed
- `scripts/backfill_001_payloads.ts`: copy typed values out of existing `payload` jsonb into the new columns (`asset_type`, `inspection_date`, `officer_id`, `asset_id`, `verification_status`).
- `scripts/seed-dev.ts`: inserts one demo watershed, assets, observations, interventions, two satellite windows, land use and drainage, **all with `demo = true`**. This is what a local end-to-end run uses.
- `scripts/compute_drainage.ts`: computes `drainage` from `streams` using
  `ST_Length(geometry::geography)/1000` and `ST_Area(boundary::geography)/1e6`. Set `demo` from the streams' `demo` flag.

### 1.3 Real data loaders (so non-demo data can exist)
- `scripts/import_streams.ts <file.geojson> --source "<name>" --licence "<licence>"`: loads real stream lines into `streams` with `demo = false`.
- `scripts/land_use/compute_land_use.py <watershed_id>`: clips a land-cover raster to the watershed and writes `land_use` rows. Preferred source is ESA WorldCover 10 m (CC BY 4.0). Check that the STAC collection is available on Earth Search. If it is not, accept a CSV import and keep the source/licence columns filled.

### 1.4 Evidence endpoint
- New file `server/evidence.ts`, exporting `loadEvidence(watershedId)`.
- Route: `GET /api/v1/watersheds/:id/evidence` (`requireAuth`).
- Response shape:

```ts
type Evidence = {
  watershed: { id, name, areaKm2, boundaryGeojson, source, sourceLicence, demo }
  assets: Array<{ id, type, name, lat, lng, installedAt, status, source, demo }>
  observations: Array<{ id, assetId, assetType, inspectionDate, verificationStatus,
                        trustFlags: Flag[], recordedAt, officerId, demo }>
  interventions: Array<{ id, assetId, type, status, installedAt, progress, recordedAt, demo }>
  satellite: Array<SatelliteMeasurementRow>
  landUse: Array<{ class, areaHa, pct, referenceYear, source, demo }>
  drainage: { streamLengthKm, densityKmPerKm2, maxOrder, source, demo } | null
  generatedAt: string
}
```
- Query using `ST_Covers`/`watershed_id` filters in SQL. Never load all watersheds and filter in JS.
- Add `POST /api/v1/interventions` and `PATCH /api/v1/interventions/:id` (status change writes `intervention_status_history`, and `installed_at` is required when status becomes `Completed`).
- Add `GET /api/v1/watersheds/:id/satellite` for the timeline panel.

### 1.5 Frontend
- New hook `src/hooks/useWatershedEvidence.ts` (react-query).
- `WorkspacePage` / `MapAnalysisPage`: replace "load everything then filter in browser" with the evidence call. The intervention form in the UI posts to the new endpoint.

**Acceptance for Phase 1**
- `GET /api/v1/watersheds/<id>/evidence` returns every section, each row with `source` and `demo`.
- A watershed with no satellite rows returns `satellite: []`, not an error.
- Test: evidence for watershed A never contains rows for watershed B.

---

## Phase 2: Server-side AI report generator (Function 4)

**Goal:** `POST` a watershed ID and get a sourced, validated, saved report with a code-computed data-gaps section.

### 2.1 Shared fact and report schemas
- Move `src/services/reportFacts.ts` to `shared/reportFacts.ts` (browser and server both import it). Extend the fact:

```ts
{ id, label, value, unit?, source, observedAt?, status: "measured"|"no-data"|"demo",
  recordIds: string[],            // real row ids this fact came from
  kind: "count"|"measurement"|"trend"|"coverage" }
```

### 2.2 Fact builder `server/report/facts.ts`
- `buildFacts(evidence): ReportFact[]`: pure and deterministic.
- **Stable namespaced IDs.** Never positional, never conditional on other facts. Examples:
  `obs.count.total`, `obs.count.verified`, `obs.count.flagged`, `asset.count.byType.check_dam`,
  `intv.count.completed`, `sat.ndvi.current.mean`, `sat.ndvi.baseline.mean`, `land.cropland.pct`, `drain.density`.
- Missing data produces a fact with `status: "no-data"` and `value: null` (the ID still exists), so IDs do not shift.
- Demo-sourced rows produce `status: "demo"`.
- `recordIds` holds the real row IDs (observation IDs, measurement IDs, and so on).

### 2.3 Trend facts `server/report/trends.ts`
Computed in code only:
- **Year-over-year (same season):** `sat.ndvi.delta.yoy` = current mean − baseline mean. The baseline must be the same months of an earlier year. If the window months differ, emit `no-data`.
- **Before/after intervention:** for each intervention with `installed_at`, find a measurement window ending before `installed_at` and one starting after it (same season). Emit `sat.ndvi.delta.intv.<interventionId>`.
- **Observation trend:** count of verified observations per quarter.
- Every trend fact carries `kind: "trend"`, both window dates in its label, and the standing caveat in its `unit`/label text: "difference between windows, not an impact estimate".
- Minimum quality gate: skip the trend (emit `no-data`) when either window has `valid_pixel_pct < 60` or `status != 'measured'`.

### 2.4 Data gaps `server/report/gaps.ts`
`computeGaps(evidence, facts): Gap[]` returns code-generated sentences such as:
- No satellite measurement in the last 12 months
- No baseline window (cannot compute change)
- Interventions with no installation date
- Boundary/streams/land use are demo data
- N observations are unverified or flagged
- No rainfall normalisation (**always included**: NDVI differences can reflect rainfall, not interventions)
- Satellite windows with low valid-pixel coverage

Each gap has `{ code, severity, text }`. The report's "Data gaps" section is rendered from this list, **not** from model output.

### 2.5 Endpoint
- `POST /api/v1/watersheds/:id/report` (`requireOfficer`; body is empty or `{ language?: "en"|"hi"|"mr" }`).
- Pipeline: `loadEvidence → buildFacts → computeTrends → computeGaps → llm (server/llm.ts) → reportValidator → save → return`.
- Keep `api/watershed-report.ts` only as a thin forwarder that no longer accepts facts from the body. Delete the old facts-in-body path.
- LLM prompt rules: output `{ claims: [{ text, factIds[] }] }` only; every number in `text` must exist in the cited facts; no causal words (`caused`, `due to`, `impact of`).
- **Validator (`server/reportValidator.ts`)** stays as the final gate. Add checks:
  - Every `factId` exists in the fact set.
  - No claim cites only `no-data` facts as if they were measured.
  - Any claim that cites a `demo` fact contains the word "demo" or "illustrative".
  - Banned causal phrases.
  - If validation fails, retry once with the error list, then return 422 with the errors. Never return an unvalidated report.

### 2.6 Persistence
- Migration `003_watershed_reports.sql`:

```sql
CREATE TABLE IF NOT EXISTS watershed_reports (
  id text PRIMARY KEY, watershed_id text NOT NULL, created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  fact_set jsonb NOT NULL, fact_set_sha256 text NOT NULL,
  claims jsonb NOT NULL, gaps jsonb NOT NULL, rendered_markdown text NOT NULL,
  model text, validator_version text NOT NULL, language text NOT NULL DEFAULT 'en'
);
CREATE INDEX IF NOT EXISTS wr_ws_idx ON watershed_reports (watershed_id, created_at DESC);
```
- `GET /api/v1/watersheds/:id/reports` and `GET /api/v1/reports/:reportId` (returns the exact stored fact set, so a report can be audited later).

### 2.7 Frontend
- New `src/pages/WatershedReportPage.tsx` (or a panel in `WorkspacePage`): pick watershed → "Generate report" → show claims with citation chips. Clicking a chip opens the underlying record IDs from `recordIds`. The Data Gaps list is shown prominently, and demo/no-data facts carry a badge.
- Keep `jspdf` export, fed from the saved report.
- Delete the browser-side fact building.

**Acceptance for Phase 2**
- Two runs on unchanged data produce identical fact IDs and `fact_set_sha256`.
- A tampered LLM response (invented number) is rejected by the validator (test with a stubbed LLM).
- A watershed with no satellite data produces a report whose gaps list says so, with no invented NDVI.
- The client cannot supply facts (the request body is ignored or rejected).

---

## Phase 3: Satellite intelligence engine (Function 2)

**Goal:** a worker computes seasonal NDVI/NDWI per watershed and per asset, stores them, and the UI/report read them.

### 3.1 Job queue
- Migration `004_analysis_jobs.sql`: convert `analysis_jobs` to typed columns while keeping `payload`:
  `status` (`queued|running|done|failed`), `watershed_id`, `asset_id`, `params jsonb`, `attempts int default 0`, `locked_at`, `locked_by`, `error text`, `created_by`, `created_at`, `finished_at`.
- `POST /api/v1/analytics` (existing): validate `type` (`NDVI|NDWI|Change detection`), accept optional `{ assetId, baselineWindow, currentWindow, bufferM }`, insert a `queued` row. Default windows are computed server-side (below), never trusted from the client without validation.
- `GET /api/v1/analytics/jobs/:id` returns status and error.

### 3.2 Window logic `server/satellite/windows.ts`
- **Season-matched windows:** pick the current window as the most recent complete season (default Nov 1–Dec 31, configurable). The baseline is the same months in a previous year.
- **Intervention mode:** if `assetId` has an `installed_at`, the baseline is the same season in the last year that ends before `installed_at`, and the current is the first matching season at least 12 months after it.
- Unit-test the edge cases: season spanning a year boundary, installation inside a season, no valid prior year.

### 3.3 Python worker
- Directory `scripts/satellite/`:
  - `analyze_watershed.py` (refactor of the existing script): arguments `--watershed-id`, `--window-start`, `--window-end`, `--index NDVI|NDWI`, `--asset-id`, `--buffer-m`. It **reads the boundary from PostGIS** (`ST_AsGeoJSON(boundary)`) instead of a file path.
  - `worker.py`: loop `SELECT ... FROM analysis_jobs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`, mark `running`, compute baseline and current windows, and write `satellite_measurements` rows. On failure set `failed` + `error`, with up to 3 attempts.
  - `requirements.txt`: add `psycopg[binary]`, `shapely`.
- **Method (store it in `method` and `scene_ids`):**
  - Sentinel-2 L2A via Element84 STAC (as in `compute_indices.py`, reusing `band_transform`).
  - Cloud mask from the SCL band; scene cloud-cover limit from `CLOUD_COVER_LIMIT`.
  - Per-window median composite, then stats inside the AOI.
  - `valid_pixel_pct` = valid pixels ÷ AOI pixels. If below 60%, write `status = 'insufficient_data'`.
  - Always write `source = 'Copernicus Sentinel-2 L2A via Element84 Earth Search'`, `attribution = 'Contains modified Copernicus Sentinel data'`, `demo = false`.
- Delete or clearly mark the hard-coded `compute_indices.py` demo as `demo = true` output only. Nothing from it may be written with `demo = false`.
- `docker-compose.yml`: add a `satellite-worker` service (Python image, same `DATABASE_URL`).
- **Scheduler:** `scripts/satellite/enqueue_refresh.ts`, a cron-style script that enqueues a job for each watershed whose latest measurement is older than 90 days.

### 3.4 Frontend
- Satellite panel on the watershed page: a "Run analysis" button (calls `POST /analytics`), job status polling, and a baseline-vs-current chart (`recharts`) reading `GET /watersheds/:id/satellite`.
- Label change values as "difference between windows" and show `valid_pixel_pct`, scene count and the attribution text.
- Show `insufficient_data` as an explicit state, never as zero.

**Acceptance for Phase 3**
- Enqueue a job → worker picks it up → rows appear in `satellite_measurements` → `/evidence` includes them → report contains `sat.ndvi.*` facts.
- Killing the worker mid-job leaves the job requeueable (use `locked_at` timeout).
- No code path writes a value with `demo = false` unless it came from a real scene.

---

## Phase 4: Server-side verification engine (Function 1)

**Goal:** the server independently re-derives trust, so a modified client can't fake it.

### 4.1 One shared rule set
- Move the pure rule logic from `src/utils/trust.ts` into `shared/trustRules.ts` (functions take plain inputs and return `Flag[]`). The browser still imports it for instant UI feedback. The server imports it for the authoritative result. Keep `src/tests/trust.test.ts` working against the shared module.

```ts
type Flag = { code: string; severity: "info"|"warn"|"critical"; message: string; evidence?: Record<string, unknown> }
```

### 4.2 Server pipeline in `POST /api/v1/uploads`
Run in this order; **never trust client-supplied `trust`, `exif`, `verificationStatus`, or `officerId`.**
1. Authenticate (`requireOfficer`). Set `officerId`/`officerName` from `request.user`.
2. Decode image, check signature and recompute SHA-256 (already present).
3. **Read EXIF from the uploaded bytes** with `exifr` (GPS, `DateTimeOriginal`, device make/model). Ignore any client EXIF.
4. Geometry via PostGIS: `ST_Covers(boundary, point)`, nearest-stream distance (`ST_Distance(geography)`), nearest-asset candidates (ambiguous match if 2 or more within the threshold).
5. Run the rules and persist the result.
6. Insert inside a transaction. `ON CONFLICT` on the unique hash index returns a structured 409 `duplicate_image`.

### 4.3 Rules (code, severity)
| Code | Check | Severity |
|---|---|---|
| `image_missing` | No image bytes | critical |
| `hash_mismatch` | Client hash ≠ computed | critical |
| `duplicate_image` | Same SHA-256 already stored | critical |
| `exif_gps_missing` | No GPS in EXIF | warn |
| `exif_gps_far` | EXIF GPS vs claimed location distance over threshold | critical if far, else warn |
| `gps_accuracy_poor` | Reported accuracy over threshold | warn |
| `photo_date_mismatch` | EXIF date vs inspection date over N days | warn / critical |
| `future_date` | Inspection date in the future | critical |
| `manual_pin_shift` | Location was manually moved far from device/EXIF | warn |
| `outside_watershed` | `ST_Covers` false | critical |
| `far_from_stream` | Over threshold for asset types that need a stream | warn |
| `ambiguous_asset_match` | Multiple candidate assets | warn |
| `asset_type_history_conflict` | Same asset previously reported with a different type | critical |
| `impossible_travel` | Same officer, two submissions too far apart in too little time (for example over 120 km/h implied) | critical |

Reuse the existing numeric thresholds from `trust.ts`. Put all thresholds in one exported `TRUST_THRESHOLDS` object, and record `rulesVersion` with each result.

### 4.4 Persistence
- Migration `005_verification.sql`:

```sql
CREATE TABLE IF NOT EXISTS verification_results (
  id bigserial PRIMARY KEY,
  observation_id text NOT NULL REFERENCES field_observations(id) ON DELETE CASCADE,
  engine text NOT NULL CHECK (engine IN ('server','client')),
  status text NOT NULL, flags jsonb NOT NULL DEFAULT '[]',
  rules_version text NOT NULL, computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS field_obs_sha_uidx
  ON field_observations (image_sha256) WHERE image_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS field_obs_officer_time_idx ON field_observations (officer_id, created_at);
```
- Status mapping: any `critical` → `Flagged`; any `warn` → `Pending review`; none → `Pending review` until an explicit verify action (a clean result never auto-verifies).

### 4.5 `PATCH /api/v1/uploads/:id/verify`
- `requireOfficer` or `requireGovernment`. The actor comes from the JWT, replacing the hard-coded user.
- Refuse (409) when the latest server result has any `critical` flag, unless the actor is government and supplies an `overrideReason` (stored in `audit_history`).
- Append an audit entry `{ actor, action, at, reason }`.

### 4.6 Frontend
- `TrustPanel.tsx`: show the **server** result flags (with severity and message) once the upload returns. The browser result is a preview labelled "preliminary".
- `offlineStore` / `syncService`: after sync, replace the local trust result with the server's. On a 409 duplicate, surface a clear message and mark the local record as rejected.

**Acceptance for Phase 4**
- Tests: upload with a tampered client `trust` object → the server result ignores it; same image uploaded twice → 409; point outside the polygon → `outside_watershed` critical; `/verify` on a critical record → 409.
- Impossible-travel test with two submissions 300 km apart, 10 minutes apart.

---

## Phase 5: End-to-end integration and hardening

### 5.1 End-to-end scenario (automate as a test or a script)
1. `pnpm db:setup && tsx scripts/seed-dev.ts`
2. Officer logs in → uploads a field photo → server returns flags.
3. Officer creates an intervention with an installation date.
4. `POST /analytics` → worker produces measurements for baseline and current windows.
5. `POST /watersheds/:id/report` → report with sourced claims, trend facts and a gaps section.
6. Open the saved report; each citation resolves to a record ID.

### 5.2 Security checks
- Rate-limit `POST /uploads` and `POST /report` (`express-rate-limit`).
- Cap the JSON body size sensibly. 28 MB is accepted today for image data URLs, so consider moving to multipart upload later.
- Confirm that Supabase RLS in `schema.sql` is not bypassed by any server path using a service key.

### 5.3 CI
- GitHub Actions: `pnpm install`, `pnpm check`, a PostGIS service container for server tests, and `pytest` for the Python worker (unit-test window logic and the SCL mask with a synthetic array).

### 5.4 Documentation
Update `docs/ARCHITECTURE.md`, `docs/BACKEND.md`, `docs/DATA_SOURCES.md` and `docs/LIMITATIONS.md` to describe:
- the single backend and auth flow,
- provenance columns,
- the satellite method and its limits (clouds, no rainfall normalisation, 10 m resolution),
- how the report is validated.

---

## Suggested order and sizing

| Order | Phase | Why this order | Rough size |
|---|---|---|---|
| 1 | Phase 0 | Everything else needs auth and migrations | 1 to 2 days |
| 2 | Phase 1 | Evidence is the input to everything | 2 to 3 days |
| 3 | Phase 2 | Gives a real report from stored data soonest | 3 to 4 days |
| 4 | Phase 3 | Needs the storage from Phase 1 | 3 to 5 days |
| 5 | Phase 4 | Reuses existing trust rules | 3 to 4 days |
| 6 | Phase 5 | Integration, CI, docs | 2 days |

---

## Definition of done (whole project)

- [ ] Default run uses the real API; mock mode is labelled.
- [ ] Every API route except `/health` requires a valid Supabase JWT.
- [ ] Verification result in the database always comes from the server (`engine = 'server'`).
- [ ] `/evidence` returns per-watershed data with `source` and `demo` on each row.
- [ ] A worker fills `satellite_measurements`; nothing is hard-coded or demo-labelled as real.
- [ ] Reports are built from server-side facts with stable IDs and `recordIds`, validated, and saved with their fact set.
- [ ] The data-gaps section is code-generated and always lists "no rainfall normalisation".
- [ ] `pnpm check` and the Python tests pass in CI.

---

## Copy-paste prompt for each Copilot session

> You are working in the HydroSnap-3D repo. Implement **Phase N** of `HYDROSNAP_IMPLEMENTATION_ROADMAP.md` only. Follow section 0 ground rules. Before editing, search for each file named in the phase and confirm whether it exists. Make additive, idempotent migrations. Add tests for every new endpoint and rule. Do not fabricate data; mark any seed data `demo = true`. When done, run `pnpm check` and list what you changed and anything you could not complete.
