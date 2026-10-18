# HydroSnap 3D

HydroSnap 3D is a watershed field-evidence and monitoring prototype for SIH 2026 (`SIH26015`) under DoLR, Ministry of Rural Development. It is a frontend-first demo application for geo-coded field photos, watershed boundaries, and satellite indicators, intended to sit above a future SRISHTI-DRISHTI workflow.

## Product reality

- This is a prototype, not a production monitoring system.
- The demo data is illustrative and labelled as `Demo` in the UI.
- No general backend or database is connected yet.
- Photo checks are local metadata/spatial rule checks; they are not AI image-classification decisions.
- Watershed boundaries, seeded assets, stream datasets, and dashboard summary values are demo-only.
- The app may optionally call the Vercel pilot-summary endpoint for generated summaries, but that is not a trusted operational decision layer.

## Core architectural rules

- Keep all data access behind the `src/services/` layer; do not fetch from UI components directly.
- Coordinates are WGS84 `[lon, lat]`.
- Never silently correct or alter a user-confirmed location.
- No secrets or private keys should be shipped to the frontend.
- The app should behave as a demo evidence workflow, not as proof of watershed impact.
- The UI must keep officer confirmation steps explicit before accepting or verifying a photo or asset record.

## Local development

Requirements: Node.js 22 and pnpm 10.34.3 (`mise.toml`).

```sh
pnpm install
cp .env.example .env.local   # optional; defaults to the demo API
pnpm dev                     # http://localhost:8443 (or configured PORT)
```

Validation commands:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

## Project structure

- `src/App.tsx` and `src/main.tsx` — app shell and entry point
- `src/index.css` — global styles and Tailwind v4 import
- `src/pages/` — dashboard, map, upload, and workspace routes
- `src/components/` — shared layout, maps, evidence, and sync UI
- `src/services/` — API client, mock data, offline queue, sync logic
- `src/utils/` — geo, trust, export, and watershed utility code
- `src/types/` — domain and GeoJSON types
- `src/tests/` — geo, trust, sync, and export tests
- `api/` — Vercel serverless routes
- `server/` — shared server-side helpers
- `docs/` — architecture, limitations, evaluation, and planning docs
- `public/` — PWA assets and service worker

## Styling and code quality

- This project uses React + Vite + Tailwind CSS v4.
- Keep styles in JSX using Tailwind utilities and only add global CSS when necessary in `src/index.css`.
- Import order in CSS should keep `@import 'tailwindcss';` first, followed by any custom rules.
- Use double quotes for strings containing apostrophes when needed.
- Ensure JSX is properly closed and balanced.
- Export components as default exports.

## Important domain context

- Map and watershed logic are demo-first, but the app supports real-boundary PMTiles when configured via `VITE_WATERSHED_PMTILES_URL`.
- Upload validation includes EXIF GPS/time/camera checks, confirmed location, watershed containment, duplicate detection, date validation, GPS accuracy, and stream proximity checks.
- Offline queueing and retry logic are handled in IndexedDB with sync backoff and idempotency.
- Role checks are UI-level only and should not be treated as real authorization enforcement.
- Photo verification remains a human officer decision; the app records a pending status rather than asserting a verified asset condition.

Use this repository context when making changes: the goal is to improve the demo prototype workflow without treating demo evidence as production truth.
