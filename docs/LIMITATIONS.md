# Limitations (be upfront with judges)

- **No general data backend yet.** `VITE_USE_MOCK_API=true`; observations and
  records still live in the browser. "Synced" records in mock mode reached
  only the in-browser demo API. Vercel functions provide only the optional AI
  endpoints.
- **Demo boundaries.** The three watersheds are hand-drawn shapes, not official
  SLUSI / CWC records. Real boundaries need `scripts/prepare_watersheds` + a
  licence-checked dataset.
- **Dashboard NDVI/NDWI and thematic polygons are simulated** (fixed polygons
  and numbers). A separate Sentinel-2 pipeline test uses real scenes at a demo
  fixture coordinate; its indices are explicitly not a real asset result or
  impact evidence. Even verified satellite indicators are not proof of impact.
- **Trust checks are client-side previews.** Rule checks and AI warning fusion
  can be bypassed by a modified client; server-side evidence validation is
  planned. Optional Gemini photo classification and summaries are suggestions,
  not verification; AI reasons are warnings and the app never rejects a photo
  automatically. Photo pixels are sent to Google's Gemini API after downscaling
  and EXIF removal. AI endpoints require a server-side `GEMINI_API_KEY`.
- **AI photo accuracy is not measured.** No labelled, licence-checked 40–60
  image evaluation set is included yet. See
  [`AI_EVALUATION.md`](AI_EVALUATION.md); do not treat the prototype model's
  confidence as measured accuracy.
- **Streams are illustrative**, so the stream-distance check is only a demo of
  the logic.
- **Roles are UI-level only** (the verify button is hidden for field officers);
  there is no authentication.
- **Map tiles are not cached offline**; the upload form works offline, the map
  needs network.
- **Image stored as data URL in IndexedDB**: fine for a demo, heavy for many
  photos. Planned: blob storage + server upload.
- **English application UI.** The pilot summary endpoint can return English,
  Hindi, and Marathi text, but those AI-generated translations are not yet
  human-reviewed and are not a Hindi/Marathi interface.
- **PDF reports are browser-generated prototype documents.** They are not
  digitally signed or server-verified. An included pilot summary is
  AI-generated and marked as not yet human-reviewed. Audit record JSON remains
  available.
