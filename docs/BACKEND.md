# Local PostgreSQL/PostGIS backend

The API is Express + TypeScript, backed by PostgreSQL 16 with PostGIS 3.6.
It runs separately from Vite. The example environment defaults to the local
API (`VITE_USE_MOCK_API=false`); opting into mock mode shows a persistent demo
banner.

## Start it

Requirements: Node.js 22, pnpm 10.34.3, and Docker Compose.

```sh
pnpm install
docker compose up -d db
cp .env.example .env.local
```

Apply ordered migrations and seed illustrative demo records:

```sh
pnpm db:setup
```

Run the API and frontend in separate terminals:

```sh
pnpm api:dev
pnpm dev
```

The API listens on `http://localhost:8000`; `GET /health` checks database
connectivity. Stop the database with `docker compose down`. Its named volume
is retained. The development-only database credentials are in
`.env.example`; do not use them in a shared deployment.

In API mode, the frontend can show explicitly demo-marked bundled fixtures
when watershed, asset, layer, analytics, or intervention collections are
empty. Set `VITE_DEMO_EMPTY_FALLBACK=false` to disable this behavior. Network
and API errors are still surfaced and never trigger the fixture fallback.

Satellite analysis jobs are queued by the API and processed separately by the
Python worker. Start it with:

```sh
docker compose up -d satellite-worker
docker compose logs -f satellite-worker
```

The worker reads Sentinel-2 L2A from the public Element84 Earth Search STAC
catalogue; it does not use Google Earth Engine credentials or require a
catalogue API key. It needs network access to the catalogue and cloud-hosted
COGs, plus database access to the same PostGIS instance as the API. In a
deployment, run it as a persistent worker service with the production
`DATABASE_URL`; Vercel request functions do not run this polling worker.

For a same-project Vercel deployment, API requests under `/api/v1` and
`/api/health` are rewritten to the Express function in `api/index.ts`;
`/api/pilot-summary` remains a separate function. Set
`VITE_API_BASE_URL=/` and `VITE_USE_MOCK_API=false` in Vercel when you want the
frontend to call that API. If `VITE_API_BASE_URL` is omitted, production uses
same-origin requests while local development defaults to `http://localhost:8000`.
The Express API still requires its server-side database and authentication
environment variables; this routing does not supply or replace them.

`pnpm db:setup` applies all migration files by filename, tracks them in
`schema_migrations`, and seeds demo rows; repeated runs are safe. `pnpm
db:backfill` copies legacy JSON payload values into typed columns, `pnpm
db:seed:dev` seeds explicitly demo-marked knowledge-engine rows, and
`pnpm db:compute-drainage` derives drainage summaries from PostGIS streams.
Demo values are not official or field-verified.

## API

All data routes are under `/api/v1`:

| Method | Route | Purpose |
|---|---|---|
| GET | `/users/me`, `/users/team` | Demo user and team |
| GET, POST | `/watersheds` | List or import a watershed GeoJSON feature |
| GET | `/watersheds/:id/evidence` | Provenance-bearing evidence scoped to one watershed in SQL |
| GET | `/watersheds/:id/satellite` | Typed satellite measurements; empty list when absent |
| POST | `/watersheds/:id/report` | Generate and save a validated server-fact report |
| GET | `/watersheds/:id/reports`, `/reports/:reportId` | List/retrieve saved report with exact fact set |
| GET | `/layers`, `/satellite/timeline` | Map layers and demo timeline values |
| GET, POST | `/streams` | List or import stream line geometry |
| GET, POST | `/assets` | List or create spatial assets |
| GET, POST | `/uploads` | List or create field observations |
| PATCH | `/uploads/:id/verify` | Mark an observation verified |
| GET | `/uploads/:id/photo` | Serve a locally stored photo |
| GET | `/spatial/resolve-watershed?longitude=…&latitude=…` | Resolve a point |
| GET | `/spatial/snap-to-stream?longitude=…&latitude=…&watershedId=…` | Find nearest stream point |
| GET | `/analytics/jobs`, `/analytics/results` | List analysis records |
| POST | `/analytics` | Queue an analysis record |
| GET, POST | `/interventions` | List or create interventions |
| PATCH | `/interventions/:id` | Change status and append status history |
| GET | `/reports` | List saved watershed reports |

Watershed resolution uses `ST_Covers`, so a point on a boundary counts as
inside. Where boundaries overlap, the smallest area measured as PostGIS
geography wins. The stream endpoint ranks candidates by geography distance,
uses `ST_DWithin` (metres) and `ST_ClosestPoint`, and returns the distance and
snapped point separately. The original, officer-confirmed point is never
silently changed. Geometry imports are checked for valid WGS84 geometry.

## Photo storage

Uploads may include image data and a client hash, but the server recomputes
SHA-256, parses EXIF from uploaded bytes, and derives spatial, asset-history,
and travel checks from PostGIS. Client `trust`, `exif`, `verificationStatus`,
`officerId`, and audit data are ignored. Results are stored in
`verification_results` with engine, rule version, and flags. Decoded photos are
written to `storage/uploads/`; remote object storage and retention are not
included.

`POST /uploads` accepts an `Idempotency-Key` header. Reusing the same key and
payload returns the original observation; reusing it for different content
returns HTTP 409. Duplicate image bytes return a structured `duplicate_image`
409; the offline queue marks these records rejected rather than retrying them.

## Authentication and reports

Every route except `GET /health` requires a valid Supabase JWT. JWTs are
verified against Supabase JWKS; the caller JWT and anon key resolve active
officer or government-admin rows. No service-role key is used. Mutations
require an active officer; verification requires a government reason to
override critical server flags. Upload and report generation are rate-limited
per IP. JSON bodies are capped at 28 MB; encoded images are capped at 20 MB.

Watershed reports are built from server-loaded evidence and deterministic
shared facts. Code computes trends and data gaps before the LLM words claims;
the validator rejects unknown facts, unsupported numbers, unlabelled demo
claims, and causal/impact wording. The exact fact set and SHA-256 hash are
stored with claims and code-generated gaps for audit.

## Environment

The API loads `.env.local` first, then `.env`; Compose reads `.env` and the
defaults below are suitable only for local development.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://hydrosnap:hydrosnap@localhost:5432/hydrosnap` | PostgreSQL connection |
| `API_PORT` | `8000` | Express listen port |
| `API_PUBLIC_URL` | derived from request | Public base used to form photo URLs |
| `CORS_ORIGINS` | `http://localhost:8443,http://localhost:5173` | Allowed browser origins |
| `UPLOAD_DIRECTORY` | `storage/uploads` | Local photo directory |
| `VITE_API_BASE_URL` | `http://localhost:8000` locally; same-origin in production | Frontend API origin |
| `VITE_USE_MOCK_API` | `false` | Set `true` for visibly labeled mock mode |
| `VITE_DEMO_EMPTY_FALLBACK` | `true` | Show illustrative fixtures only when API collections are empty; set `false` for API-only reads |
| `SUPABASE_URL` | `https://example.supabase.co` | Supabase Auth issuer/JWKS URL |
| `SUPABASE_ANON_KEY` | development placeholder | Public anon key for caller-JWT lookups |
| `CLOUD_COVER_LIMIT` | `30` | Satellite worker scene cloud-cover threshold |

The app's spatial service uses the local `geo.ts` implementation in mock mode
and falls back to it only when the API cannot be reached. API validation and
server errors are surfaced rather than treated as offline fallback.

## Scope and limitations

This remains a prototype. Local Compose credentials, filesystem photo storage,
and example Supabase values must not be used for shared deployment. Configure
and review Supabase officer/admin tables and RLS policies before deployment.
Satellite results have no rainfall normalization and are not causal evidence;
image metadata rules cannot confirm image content.
