@AGENTS.md

## Local PostgreSQL/PostGIS backend

- The API is Express + TypeScript under `server/`; use `pnpm api:dev`.
- Start the local PostGIS database with `docker compose up -d db`.
- Apply `db/migrations/001_init.sql` and load illustrative demo data with
  `pnpm db:setup`.
- Set `VITE_USE_MOCK_API=false` in `.env.local` to connect the frontend.
- Spatial API errors are surfaced; only unreachable API requests fall back to
  the client geometry helpers. The officer-confirmed location is never changed
  by stream snapping.
- Synced photos are stored under `storage/uploads/`; do not commit uploaded
  imagery or local credentials.
