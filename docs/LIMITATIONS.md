# Limitations (be upfront with judges)

- **Backend is local-development only.** Express + PostgreSQL/PostGIS run via
  Docker Compose, and `VITE_USE_MOCK_API=true` remains the default. The local
  database is seeded with illustrative demo records; mock-mode sync still
  reaches only the in-browser demo API. The backend has no authentication,
  authorization, managed object storage, or production deployment configuration.
- **Demo boundaries.** The three watersheds are hand-drawn shapes, not official
  SLUSI / CWC records. Real boundaries need `scripts/prepare_watersheds` + a
  licence-checked dataset.
- **Dashboard NDVI/NDWI and thematic polygons are simulated** (fixed polygons
  and numbers). A separate Sentinel-2 pipeline test uses real scenes at a demo
  fixture coordinate; its indices are explicitly not a real asset result or
  impact evidence. Even verified satellite indicators are not proof of impact.
- **Trust checks are client-side previews.** They can be bypassed by a modified
  client; server-side evidence validation is planned. Photo verification uses
  metadata/spatial rules only and does not classify image content. The officer
  attestation is not independent verification. The optional pilot summary using
  the configured AI gateway is separate and does not inspect field photos.
- **There is no custom photo classifier yet.** The repository contains no
  trained model or labelled, licence-checked field-photo set. See
  [`AI_EVALUATION.md`](AI_EVALUATION.md) for prerequisites; no image
  classification accuracy is claimed.
- **Server-side upload validation is limited.** The API verifies image bytes,
  their declared hash, and request geometry, but does not run the full client
  trust policy or independently attest to photo contents.
- **Streams are illustrative**, so the stream-distance check is only a demo of
  the logic.
- **Roles are not authenticated.** The verify button is hidden for field
  officers in the UI, and the backend's example current-user/team responses
  are illustrative; there is no authentication or authorization.
- **Database demos are not official data.** Seeded boundaries, streams,
  assets, and satellite values are illustrative. Import only datasets whose
  source, licence, and attribution have been verified.
- **Map tiles are not cached offline**; the upload form works offline, the map
  needs network.
- **Photo storage is local to the API host.** IndexedDB keeps offline images;
  synced images are decoded to files under `storage/uploads/` and the database
  stores only a relative path and hash. Production blob storage and retention
  controls are not included.
- **English application UI.** The pilot summary endpoint can return English,
  Hindi, and Marathi text, but those AI-generated translations are not yet
  human-reviewed and are not a Hindi/Marathi interface.
- **PDF reports are browser-generated prototype documents.** They are not
  digitally signed or server-verified. An included pilot summary is
  AI-generated and marked as not yet human-reviewed. Audit record JSON remains
  available.
