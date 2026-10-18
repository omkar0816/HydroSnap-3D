# Future custom photo-classifier requirements

## Current capability

HydroSnap does not currently contain a photo-content classifier. Photo
verification runs deterministic browser checks for EXIF metadata, coordinate
agreement, watershed containment, capture date, duplicate image hashes, GPS
accuracy, and proximity to mapped streams. An officer must inspect the pixels
and attest that the photo shows the selected asset. These checks do not
establish that a photo depicts a real watershed asset.

No uploaded photo is sent to the configured AI gateway or another image-classification API.
The separate, optional PilotAnalysis text summary still uses the configured AI gateway and does
not receive field photos.

## Before building a custom visual model

1. Collect representative field images for every supported asset class and
   hard negatives (unrelated water, roads, screenshots, blurry/obstructed
   photos). Obtain documented consent and usage rights.
2. Label each image with at least two reviewers. Resolve disagreements and
   preserve an explicit `unclear`/insufficient-evidence label.
3. Separate training, validation, and test data by site or capture session,
   not by near-duplicate image, to avoid location leakage.
4. Select an inference target (for example, an on-device model or a managed
   first-party service) and document model provenance, update, privacy, offline,
   latency, and device requirements before integrating weights or an endpoint.
5. Evaluate on a held-out, consented dataset. Report per-class precision and
   recall, confusion matrix, support, failure rate, and confidence calibration.
   Test false acceptance of negatives in particular. Never call confidence
   “accuracy.”
6. Keep model output advisory. Show uncertainty, evidence, and disagreement
   with officer-selected data; preserve the officer's decision and audit trail.
   A visual prediction cannot establish GPS correctness or official watershed
   membership.

Do not publish accuracy or imply the app has a custom vision model until the
model, dataset provenance, evaluation results, and limitations are documented.
