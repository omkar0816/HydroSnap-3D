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
- **Trust checks are client-side previews.** They can be bypassed by a modified
  client; server-side evidence validation is planned. Photo verification uses
  metadata/spatial rules only and does not classify image content. The officer
  attestation is not independent verification. The optional Gemini pilot
  summary is separate and does not inspect field photos.
- **There is no custom photo classifier yet.** The repository contains no
  trained model or labelled, licence-checked field-photo set. See
  [`AI_EVALUATION.md`](AI_EVALUATION.md) for prerequisites; no image
  classification accuracy is claimed.
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
