# Limitations (be upfront with judges)

- **No backend yet.** `VITE_USE_MOCK_API=true`; data lives in the browser.
  "Synced" records in mock mode reached only the in-browser demo API.
- **Demo boundaries.** The three watersheds are hand-drawn shapes, not official
  SLUSI / CWC records. Real boundaries need `scripts/prepare_watersheds` + a
  licence-checked dataset.
- **Dashboard NDVI/NDWI and thematic polygons are simulated** (fixed polygons
  and numbers). A separate Sentinel-2 pipeline test uses real scenes at a demo
  fixture coordinate; its indices are explicitly not a real asset result or
  impact evidence. Even verified satellite indicators are not proof of impact.
- **Trust checks are rule-based and run in the browser.** They can be bypassed
  by a modified client; server-side checks are planned. No AI model exists;
  the app never rejects a photo automatically.
- **Streams are illustrative**, so the stream-distance check is only a demo of
  the logic.
- **Roles are UI-level only** (the verify button is hidden for field officers);
  there is no authentication.
- **Map tiles are not cached offline**; the upload form works offline, the map
  needs network.
- **Image stored as data URL in IndexedDB**: fine for a demo, heavy for many
  photos. Planned: blob storage + server upload.
- **English only.** Hindi/Marathi planned for the upload flow.
- **PDF reports are browser-generated prototype documents.** They are not
  digitally signed or server-verified. Audit record JSON remains available.
