# DiCRA STAC catalogue

HydroSnap's map-analysis page can discover DiCRA STAC collections and search
their item metadata using the selected watershed's WGS84 boundary extent. The
browser calls the authenticated HydroSnap API; only the Express server calls
DiCRA. STAC item metadata is third-party catalogue data, not a field
observation or verified watershed-impact result.

## Verified upstream behavior

The configured public API root is `https://dicra.nabard.org/api-stac`. Its root,
collections, queryables, and POST `/search` endpoints returned STAC JSON during
integration checks. Collections were returned with a `license` field (current
examples include `proprietary`), and search returned GeoJSON FeatureCollection
items with asset metadata. Requests succeeded without an API key. Therefore
`DICRA_API_KEY` is optional and unused; do not invent or add a key. If DiCRA's
authentication policy changes, confirm its documented scheme before wiring the
secret server-side.

## HydroSnap endpoints

Every route uses the existing Supabase JWT authentication middleware:

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/dicra/status` | Check upstream STAC metadata |
| GET | `/api/v1/dicra/collections` | List cached collection metadata |
| GET | `/api/v1/dicra/collections/:collectionId` | Get collection details |
| GET | `/api/v1/dicra/queryables` | Read advertised queryables |
| POST | `/api/v1/dicra/search` | Search items by collection, WGS84 bbox, date, and limit |

Example requests (the bbox below is only a syntax example, not a real
watershed; use an authenticated HydroSnap officer token):

```sh
curl -H "Authorization: Bearer $HYDROSNAP_ACCESS_TOKEN" \
  http://localhost:8000/api/v1/dicra/collections

curl -X POST \
  -H "Authorization: Bearer $HYDROSNAP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"collections":["lulc"],"bbox":[73.5,18.0,74.0,18.5],"datetime":"2025-01-01T00:00:00Z/2025-12-31T23:59:59Z","limit":25}' \
  http://localhost:8000/api/v1/dicra/search
```

The map derives `[west, south, east, north]` from the selected watershed
geometry, which is WGS84 `[longitude, latitude]`. It never substitutes a
hard-coded example extent. Collection search is a client-side filter over the
catalogue list. Item selection displays item and asset metadata including
roles, descriptions, media types, and acquisition time where provided.

## Environment

These variables are read by the backend only:

| Variable | Default | Required | Description |
|---|---|---|---|
| `DICRA_STAC_BASE_URL` | `https://dicra.nabard.org/api-stac` | No | Absolute HTTPS STAC root without credentials, query, or fragment |
| `DICRA_REQUEST_TIMEOUT_MS` | `20000` | No | Upstream timeout, 1,000–120,000 ms |
| `DICRA_COLLECTIONS_CACHE_TTL_SECONDS` | `300` | No | In-memory collection cache; 0 disables it, max 86,400 |
| `DICRA_MAX_SEARCH_LIMIT` | `100` | No | Maximum requested STAC items, 1–1,000 |
| `DICRA_API_KEY` | empty | No | Currently unused because public read endpoints did not require a key |
| `DICRA_API_KEY_HEADER` | `Authorization` | No | Reserved; currently unused |
| `DICRA_API_KEY_PREFIX` | `Bearer` | No | Reserved; currently unused |

Copy `.env.example` to `.env.local` for local backend configuration. The
repository's `.env`/`.env.local` ignore rules prevent real environment files
from being committed. The supplied local `.env` already contains the DiCRA
settings; its key is blank, matching the verified public access behavior.
Never place a server credential in a `VITE_` variable or frontend bundle.

## Raster rendering and processing

The integration currently performs collection discovery, item search, and
metadata inspection only. The UI explicitly labels results metadata-only.
No TiTiler endpoint is configured, so no raster is registered as a MapLibre
layer. A COG URL is not an XYZ tile URL; do not use it directly as one.

The existing Python worker processes only its configured Sentinel-2 jobs.
There is no DiCRA processing job type, asset-origin allowlist, output storage
contract, or dataset-specific scientific validation. Do not send arbitrary
DiCRA assets through the NDVI/NDWI pipeline. A future raster integration needs
a trusted tile-service configuration and verified asset formats/bands/units,
plus a durable worker job and provenance schema before processing can be
enabled.

## Troubleshooting and deployment

- **401:** sign in; DiCRA routes use HydroSnap's existing JWT enforcement.
- **400:** check the JSON body, collection ID, RFC 3339 datetime, integer limit,
  and bbox ordering/ranges.
- **404:** confirm the collection ID exists in the current DiCRA catalogue.
- **429/502/504:** upstream rate limit, unavailable response, or configured
  timeout. Retry after checking the DiCRA API root.
- **Empty results:** confirm the selected watershed extent intersects the
  collection's coverage and adjust the optional date interval.
- **No map raster:** expected until a real, trusted tile service and a validated
  rendering path are configured.
- **CORS:** browser calls go to HydroSnap, not directly to DiCRA. Configure
  `VITE_API_BASE_URL` to the deployed HydroSnap API and allow only intended
  application origins in `CORS_ORIGINS`.

The deployment must provide the server-side variables above, route `/api/v1`
to the authenticated Express backend, and keep CORS restricted to the
application's origins. Do not deploy long-running raster work in a short-lived
serverless request. Confirm DiCRA dataset license and attribution requirements
for each collection before redistributing or processing its data.
