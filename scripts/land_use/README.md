# Land-use import

Earth Search's STAC collection catalog was checked for ESA WorldCover / land-cover collections; none is currently listed. This loader therefore uses the roadmap's CSV fallback. Prepare class-area statistics clipped to the watershed boundary, then run:

```sh
python scripts/land_use/compute_land_use.py <watershed_id> --csv classes.csv
```

CSV columns are `class_name,area_ha,pct,reference_year,source,source_licence`. Source and licence are required on every row. Rows are written with `demo=false`; use this path only for verified source data. Demo fixtures must instead be seeded with `demo=true` by `scripts/seed-dev.ts`.
