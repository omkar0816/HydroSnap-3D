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
- **Most trust checks are client-side previews.** Rule checks and AI warning
  fusion can be bypassed by a modified client; the backend validates request
  shapes and stores spatial data, but does not yet run the complete server
  trust policy. Optional Gemini photo classification and summaries are suggestions,
  not verification; AI reasons are warnings and the app never rejects a photo
  automatically. Photo pixels are sent to Google's Gemini API after downscaling
  and EXIF removal. AI endpoints require a server-side `GEMINI_API_KEY`.
- **AI photo accuracy is not measured.** No labelled, licence-checked 40–60
  image evaluation set is included yet. See
  [`AI_EVALUATION.md`](AI_EVALUATION.md); do not treat the prototype model's
  confidence as measured accuracy.
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
