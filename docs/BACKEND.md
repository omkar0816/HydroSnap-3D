# Local PostgreSQL/PostGIS backend

The development API is Express + TypeScript, backed by PostgreSQL 16 with
PostGIS 3.6. It runs separately from Vite and is optional; mock mode remains
the default for the frontend.

## Start it

Requirements: Node.js 22, pnpm 10.34.3, and Docker Compose.

```sh
pnpm install
docker compose up -d db
cp .env.example .env.local
```

Set `VITE_USE_MOCK_API=false` in `.env.local`, then apply the schema and seed
illustrative demo records:

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

`pnpm db:setup` applies `db/migrations/001_init.sql` once and inserts demo
users, watersheds, streams, assets, map layers, timeline values, jobs,
results, interventions, and reports. The records are explicitly illustrative,
not official or field-verified. Do not infer production coverage or watershed
impact from them.

## API

All data routes are under `/api/v1`:

| Method | Route | Purpose |
|---|---|---|
| GET | `/users/me`, `/users/team` | Demo user and team |
| GET, POST | `/watersheds` | List or import a watershed GeoJSON feature |
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
| GET | `/interventions` | List interventions |
| GET, POST | `/reports` | List or create reports |

Watershed resolution uses `ST_Covers`, so a point on a boundary counts as
inside. Where boundaries overlap, the smallest area measured as PostGIS
geography wins. The stream endpoint ranks candidates by geography distance,
uses `ST_DWithin` (metres) and `ST_ClosestPoint`, and returns the distance and
snapped point separately. The original, officer-confirmed point is never
silently changed. Geometry imports are checked for valid WGS84 geometry.

## Photo storage

Upload requests may include a base64 image data URL in `imageDataUrl` and the
browser-computed `imageSha256`. The API validates the encoding, MIME signature,
20 MB size limit, and SHA-256 before writing decoded bytes to
`storage/uploads/`. PostgreSQL stores only the observation JSON (without image
bytes), relative photo path, SHA-256, and spatial point. API responses include
the photo route URL in `imageDataUrl`, so existing UI image rendering remains
compatible. Keep `storage/uploads/` backed up with the database; production
object storage and upload-retention policy are not included.

`POST /uploads` accepts an `Idempotency-Key` header. Reusing the same key and
payload returns the original observation; reusing it for different content
returns HTTP 409. A mismatched image hash is rejected with HTTP 422.

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
| `VITE_API_BASE_URL` | `http://localhost:8000` | Frontend API origin |
| `VITE_USE_MOCK_API` | `true` | Set `false` to use the API |

The app's spatial service uses the local `geo.ts` implementation in mock mode
and falls back to it only when the API cannot be reached. API validation and
server errors are surfaced rather than treated as offline fallback.

## Scope and limitations

This is a local-development backend. It has no authentication, authorization,
production hardening, satellite-processing workers, or remote object storage.
The UI's role restrictions are not server authorization. Do not expose the
service to an untrusted network.
