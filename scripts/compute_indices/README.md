# Sentinel-2 index pipeline

Install the script-only dependencies into an isolated environment:

```sh
python -m pip install -r scripts/compute_indices/requirements.txt
python scripts/compute_indices/compute_indices.py
```

The default site is `ast-001` from the mock data, at the demo coordinates in
`src/services/mock/mockData.ts`. Its imagery is real Sentinel-2 data, but the
asset identity and location are illustrative. The output is always labeled
**Pipeline test, not a real result** and must not be presented as field
evidence or impact.

The script uses same-season November–December windows, Sentinel-2 L2A surface
reflectance, scene cloud-cover filtering, and SCL pixel masking. It reports the
mean within 500 m of the fixture coordinate and the remaining pixels in the
AOI as the control area, plus the difference-in-differences. Those numbers are
descriptive only; spatial autocorrelation and the demo asset location prevent
causal or operational interpretation.

Outputs are written to `public/data/pilot/`. No screenshots or field photos
are generated. A real field pilot requires replacing the fixture only after a
field visit and reviewing the resulting scenes and metadata.
