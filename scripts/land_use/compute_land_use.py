#!/usr/bin/env python3
"""Import pre-clipped land-use statistics with required source provenance.

Earth Search currently does not list an ESA WorldCover collection. Prepare a
watershed-clipped CSV using the documented schema in README.md and run this
loader; rows imported through this path are real only when the input is real.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import os
import sys
from pathlib import Path

import psycopg


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("watershed_id")
    parser.add_argument("--csv", required=True, type=Path)
    return parser.parse_args()


def load_rows(csv_path: Path, watershed_id: str) -> list[tuple]:
    required = {
        "class_name",
        "area_ha",
        "pct",
        "reference_year",
        "source",
        "source_licence",
    }
    rows = []
    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError(f"CSV headers must include: {', '.join(sorted(required))}")
        for line, row in enumerate(reader, start=2):
            class_name = (row.get("class_name") or "").strip()
            source = (row.get("source") or "").strip()
            licence = (row.get("source_licence") or "").strip()
            if not class_name or not source or not licence:
                raise ValueError(f"Line {line} must include class, source, and licence.")
            try:
                area = float(row["area_ha"])
                pct = float(row["pct"])
                year = int(row["reference_year"])
            except (TypeError, ValueError) as error:
                raise ValueError(f"Line {line} contains invalid numeric values.") from error
            if area < 0 or not 0 <= pct <= 100 or not 1900 <= year <= 2200:
                raise ValueError(f"Line {line} contains values outside valid ranges.")
            identity = f"{watershed_id}\0{year}\0{class_name}"
            record_id = hashlib.sha256(identity.encode()).hexdigest()[:32]
            rows.append((record_id, watershed_id, class_name, area, pct, year, source, licence))
    if not rows:
        raise ValueError("CSV contains no land-use records.")
    return rows


def main() -> int:
    args = parse_args()
    database_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://hydrosnap:hydrosnap@localhost:5432/hydrosnap",
    )
    try:
        rows = load_rows(args.csv, args.watershed_id)
        with psycopg.connect(database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 FROM watersheds WHERE id = %s", (args.watershed_id,))
                if cursor.fetchone() is None:
                    raise ValueError(f"Unknown watershed: {args.watershed_id}")
                cursor.executemany(
                    """INSERT INTO land_use
                       (id, watershed_id, class_name, area_ha, pct, reference_year,
                        source, source_licence, demo)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, false)
                       ON CONFLICT (id) DO UPDATE SET
                         area_ha = EXCLUDED.area_ha,
                         pct = EXCLUDED.pct,
                         source = EXCLUDED.source,
                         source_licence = EXCLUDED.source_licence,
                         recorded_at = now(),
                         demo = false""",
                    rows,
                )
        print(f"Imported {len(rows)} land-use class record(s) for {args.watershed_id}.")
        return 0
    except (OSError, ValueError, psycopg.Error) as error:
        print(f"Land-use import failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
