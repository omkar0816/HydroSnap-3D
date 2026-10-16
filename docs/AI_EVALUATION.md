# AI photo evaluation protocol

## Current status

The 40–60-photo evaluation has **not been run** because no labelled, licensed
photo set was supplied. The template does not contain photographs or measured
results. Do not quote accuracy, precision, recall, or a confusion matrix until
the run below is complete.

## Build a small evaluation set

1. Collect 40–60 representative photos, preferably balanced across the six
   endpoint labels: Check dam, Farm pond, Plantation, Percolation tank,
   not-a-watershed-asset, and unclear. Include challenging negatives such as
   roads, selfies, screenshots, and unrelated water scenes.
2. Record provenance and licence/consent for every image. Use original photos
   only when the photographer has consented to this evaluation. Do not submit
   identifiable people or sensitive locations without permission.
3. Have two reviewers label the visible class independently, then resolve
   disagreements before calling the endpoint. Keep the ground-truth label
   independent from the model result.
4. Record the endpoint model name, date, and each prediction in
   `AI_PHOTO_EVALUATION_TEMPLATE.csv`. Do not treat model confidence as
   calibrated probability or accuracy.
5. Build a confusion matrix with **ground truth as rows** and **prediction as
   columns**, including all six closed labels. Calculate accuracy as correct
   predictions / all labelled photos; report per-class support and recall as
   well as the confusion matrix. Preserve the full counts, not just a rounded
   percentage.
6. Publish the dataset size, class counts, labelling method, endpoint model,
   date, exclusions, and all results together. A small prototype set is not
   evidence of general performance and must not be presented as one.

The endpoint strips location metadata from the image it sends by drawing a
downscaled JPEG in the browser. Do not upload the original photo to a public
third-party dataset without its owner's permission.

## Empty result table

Fill this only after the labelled endpoint run. Leave all cells blank rather
than estimating values.

| Ground truth \ Prediction | Check dam | Farm pond | Plantation | Percolation tank | Not an asset | Unclear | Support |
|---|---:|---:|---:|---:|---:|---:|---:|
| Check dam |  |  |  |  |  |  |  |
| Farm pond |  |  |  |  |  |  |  |
| Plantation |  |  |  |  |  |  |  |
| Percolation tank |  |  |  |  |  |  |  |
| Not an asset |  |  |  |  |  |  |  |
| Unclear |  |  |  |  |  |  |  |

**Evaluation status:** Not run — labelled and licence-checked photo set not
provided.

