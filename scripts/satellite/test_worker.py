from __future__ import annotations

import os
import uuid
from pathlib import Path

import psycopg
import pytest
from psycopg.conninfo import make_conninfo
from psycopg.types.json import Jsonb
from psycopg.rows import dict_row

from scripts.satellite.worker import claim_job, fail_job, write_measurements

ROOT = Path(__file__).resolve().parents[2]
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://hydrosnap:hydrosnap@localhost:5432/hydrosnap",
)


@pytest.fixture
def postgis_connection():
    schema = f"worker_test_{uuid.uuid4().hex}"
    try:
        admin = psycopg.connect(DATABASE_URL, autocommit=True)
    except psycopg.Error as error:
        pytest.skip(f"PostGIS integration database is unavailable: {error}")
    admin.execute(f'CREATE SCHEMA "{schema}"')
    options = f"-c search_path={schema},public"
    test_url = make_conninfo(DATABASE_URL, options=options)
    connection = psycopg.connect(test_url, row_factory=dict_row)
    try:
        for migration in sorted((ROOT / "db" / "migrations").glob("*.sql")):
            connection.execute(migration.read_text(encoding="utf-8"))
        yield connection
    finally:
        connection.close()
        admin.execute(f'DROP SCHEMA "{schema}" CASCADE')
        admin.close()


def insert_job(connection, job_id: str) -> None:
    params = {
        "indexType": "NDVI",
        "bufferM": None,
        "windows": {
            "baseline": {"start": "2024-11-01", "end": "2024-12-31"},
            "current": {"start": "2025-11-01", "end": "2025-12-31"},
        },
    }
    connection.execute(
        """INSERT INTO analysis_jobs
           (id, payload, status, watershed_id, params, created_by)
           VALUES (%s, %s, 'queued', 'worker-ws', %s, 'worker-test')""",
        (job_id, Jsonb({"id": job_id, "status": "Queued"}), Jsonb(params)),
    )


def test_claim_recovers_expired_lease_and_writes_insufficient_data_as_null(postgis_connection):
    connection = postgis_connection
    connection.execute(
        """INSERT INTO watersheds (id, payload, boundary)
           VALUES ('worker-ws', '{\"name\":\"Worker test\"}',
             ST_GeomFromText('POLYGON((0 0,1 0,1 1,0 1,0 0))', 4326))"""
    )
    insert_job(connection, "lease-job")

    first_claim = claim_job(connection)
    assert first_claim["attempts"] == 1
    connection.execute(
        "UPDATE analysis_jobs SET locked_at = now() - interval '25 minutes' WHERE id = 'lease-job'"
    )
    reclaimed = claim_job(connection)
    assert reclaimed["id"] == "lease-job"
    assert reclaimed["attempts"] == 2

    empty_result = {
        "aoi_scope": "watershed",
        "buffer_m": None,
        "index_type": "NDVI",
        "mean": None,
        "median": None,
        "p10": None,
        "p90": None,
        "std": None,
        "valid_pixel_pct": 0.0,
        "scene_count": 0,
        "scene_ids": [],
        "method": "Synthetic insufficient-data test",
        "resolution_m": 10,
        "status": "insufficient_data",
        "source": "test source",
        "source_licence": "test licence",
        "attribution": "test attribution",
    }
    write_measurements(
        connection,
        reclaimed,
        {"baseline": empty_result, "current": empty_result},
    )
    rows = connection.execute(
        "SELECT status, mean, valid_pixel_pct FROM satellite_measurements WHERE job_id = 'lease-job' ORDER BY window_role"
    ).fetchall()
    assert len(rows) == 2
    assert all(row["status"] == "insufficient_data" for row in rows)
    assert all(row["mean"] is None for row in rows)
    assert all(row["valid_pixel_pct"] == 0 for row in rows)
    job = connection.execute(
        "SELECT status, locked_at FROM analysis_jobs WHERE id = 'lease-job'"
    ).fetchone()
    assert job["status"] == "done"
    assert job["locked_at"] is None


def test_worker_stops_after_three_failed_attempts(postgis_connection):
    connection = postgis_connection
    insert_job(connection, "failure-job")
    for attempt in range(1, 4):
        job = claim_job(connection)
        assert job["attempts"] == attempt
        fail_job(connection, job, RuntimeError("synthetic worker failure"))
    row = connection.execute(
        "SELECT status, attempts, error FROM analysis_jobs WHERE id = 'failure-job'"
    ).fetchone()
    assert row["status"] == "failed"
    assert row["attempts"] == 3
    assert row["error"] == "synthetic worker failure"
