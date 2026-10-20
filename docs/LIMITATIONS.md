# Limitations (be upfront with judges)

- **Backend is a prototype.** Express + PostgreSQL/PostGIS run via Docker
  Compose, and `VITE_USE_MOCK_API=false` is the example default. Mock mode is
  visibly labeled and syncs only within the browser. Local credentials,
  filesystem uploads, and deployment configuration are not production-ready.
- **Demo boundaries.** The three watersheds are hand-drawn shapes, not official
  SLUSI / CWC records. Real boundaries need `scripts/prepare_watersheds` + a
  licence-checked dataset.
- **Dashboard NDVI/NDWI and thematic polygons are simulated** (fixed polygons
  and numbers). A separate Sentinel-2 pipeline test uses real scenes at a demo
  fixture coordinate; its indices are explicitly not a real asset result or
  impact evidence. Even verified satellite indicators are not proof of impact.
- **Trust checks are recomputed server-side, but do not classify image content.**
  The server parses EXIF, recomputes hashes, and applies metadata/spatial/history
  rules; a clean result remains pending human review. The rules cannot prove
  that the photo depicts the claimed asset. Critical overrides require a
  government reason and are audited.
- **There is no custom photo classifier yet.** The repository contains no
  trained model or labelled, licence-checked field-photo set. See
  [`AI_EVALUATION.md`](AI_EVALUATION.md) for prerequisites; no image
  classification accuracy is claimed.
- **Server trust is limited by available data.** Missing or illustrative
  boundaries and streams reduce the value of spatial checks; no rule attests
  to field truth or image content.
- **Streams are illustrative**, so the stream-distance check is only a demo of
  the logic.
- **Identity requires deployment setup.** API routes verify Supabase JWTs and
  active officer/government rows, but example issuer/key values are placeholders.
  Provision and test the tables and RLS policies before deployment; UI role
  checks alone are not authorization.
- **Database demos are not official data.** Seeded boundaries, streams,
  assets, and satellite values are illustrative. Import only datasets whose
  source, licence, and attribution have been verified.
- **Map tiles are not cached offline**; the upload form works offline, the map
  needs network.
- **Photo storage is local to the API host.** IndexedDB keeps offline images;
  synced images are decoded to files under `storage/uploads/` and the database
  stores only a relative path and hash. Production blob storage and retention
  controls are not included.
- **Satellite runtime depends on external systems.** The worker retrieves
  Sentinel-2 L2A through Element84 Earth Search; clouds and scene availability
  can produce `insufficient_data`. Worker image dependency downloads and STAC/
  COG access require network connectivity. Results have no rainfall
  normalization.
- **Reports are not causal assessments.** Numbers and trends are computed in
  code, and generated claims are validated, but NDVI differences can reflect
  rainfall, season, management or other conditions. They are differences
  between windows, not impact estimates.
- **English application UI.** The pilot summary endpoint can return English,
  Hindi, and Marathi text, but those AI-generated translations are not yet
  human-reviewed and are not a Hindi/Marathi interface.
- **PDF reports are browser-generated prototype documents.** They are not
  digitally signed or server-verified. An included pilot summary is
  AI-generated and marked as not yet human-reviewed. Audit record JSON remains
  available.
