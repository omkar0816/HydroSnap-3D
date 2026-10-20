"""Claim and process queued satellite analysis jobs from PostGIS."""

from __future__ import annotations

import os
import socket
import time
import traceback
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row

from scripts.satellite.analyze_watershed import analyze_watershed

POLL_SECONDS = float(os.environ.get("WORKER_POLL_SECONDS", "5"))
LOCK_TIMEOUT_MINUTES = int(os.environ.get("WORKER_LOCK_TIMEOUT_MINUTES", "20"))
MAX_ATTEMPTS = 3
WORKER_ID = os.environ.get("WORKER_ID", f"{socket.gethostname()}-{os.getpid()}")


def claim_job(connection):
    with connection.transaction():
        connection.execute(
            """UPDATE analysis_jobs
               SET status = CASE WHEN attempts >= %s THEN 'failed' ELSE 'queued' END,
                   locked_at = NULL, locked_by = NULL,
                   error = CASE WHEN attempts >= %s THEN COALESCE(error, 'Worker lease expired') ELSE error END
               WHERE status = 'running'
                 AND locked_at < now() - make_interval(mins => %s)""",
            (MAX_ATTEMPTS, MAX_ATTEMPTS, LOCK_TIMEOUT_MINUTES),
        )
        row = connection.execute(
            """SELECT id, watershed_id, asset_id, params, attempts
               FROM analysis_jobs
               WHERE status = 'queued'
               ORDER BY created_at, id
               FOR UPDATE SKIP LOCKED
               LIMIT 1"""
        ).fetchone()
        if not row:
            return None
        attempt = row["attempts"] + 1
        connection.execute(
            """UPDATE analysis_jobs
               SET status = 'running', attempts = %s, locked_at = now(),
                   locked_by = %s, error = NULL
               WHERE id = %s""",
            (attempt, WORKER_ID, row["id"]),
        )
        return {**row, "attempts": attempt}


def write_measurements(connection, job, results):
    params = job["params"]
    windows = params["windows"]
    with connection.transaction():
        for role in ("baseline", "current"):
            window = windows[role]
            result = results[role]
            connection.execute(
                """INSERT INTO satellite_measurements
                   (id, watershed_id, asset_id, aoi_scope, buffer_m, index_type,
                    window_role, window_start, window_end, season_label, mean, median,
                    p10, p90, std, valid_pixel_pct, scene_count, scene_ids,
                    cloud_limit_pct, method, resolution_m, status, job_id, source,
                    source_licence, attribution, demo)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                           %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                           %s, %s, false)""",
                (
                    str(uuid4()),
                    job["watershed_id"],
                    job["asset_id"],
                    result["aoi_scope"],
                    result["buffer_m"],
                    result["index_type"],
                    role,
                    window["start"],
                    window["end"],
                    params.get("seasonLabel"),
                    result["mean"],
                    result["median"],
                    result["p10"],
                    result["p90"],
                    result["std"],
                    result["valid_pixel_pct"],
                    result["scene_count"],
                    result["scene_ids"],
                    int(os.environ.get("CLOUD_COVER_LIMIT", "30")),
                    result["method"],
                    result["resolution_m"],
                    result["status"],
                    job["id"],
                    result["source"],
                    result["source_licence"],
                    result["attribution"],
                ),
            )
        connection.execute(
            """UPDATE analysis_jobs
               SET status = 'done', finished_at = now(), locked_at = NULL,
                   locked_by = NULL, error = NULL,
                   payload = jsonb_set(payload, '{status}', '"Completed"'::jsonb, true)
               WHERE id = %s""",
            (job["id"],),
        )


def fail_job(connection, job, error):
    concise = str(error).strip()[:4000] or error.__class__.__name__
    final_status = "failed" if job["attempts"] >= MAX_ATTEMPTS else "queued"
    with connection.transaction():
        connection.execute(
            """UPDATE analysis_jobs
               SET status = %s, error = %s, locked_at = NULL, locked_by = NULL,
                   finished_at = CASE WHEN %s = 'failed' THEN now() ELSE NULL END,
                   payload = jsonb_set(payload, '{status}', to_jsonb(%s::text), true)
               WHERE id = %s""",
            (final_status, concise, final_status, "Failed" if final_status == "failed" else "Queued", job["id"]),
        )


def process_job(connection, job):
    params = job["params"]
    windows = params["windows"]
    index = params.get("indexType", "NDVI")
    results = {}
    for role in ("baseline", "current"):
        window = windows[role]
        results[role] = analyze_watershed(
            watershed_id=job["watershed_id"],
            window_start=window["start"],
            window_end=window["end"],
            index=index,
            asset_id=job["asset_id"],
            buffer_m=params.get("bufferM"),
            database_url=os.environ["DATABASE_URL"],
        )
    write_measurements(connection, job, results)


def main():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL must be set for the satellite worker")
    print(f"Satellite worker {WORKER_ID} started")
    while True:
        try:
            with psycopg.connect(database_url, row_factory=dict_row) as connection:
                job = claim_job(connection)
                if not job:
                    time.sleep(POLL_SECONDS)
                    continue
                print(f"Processing analysis job {job['id']} (attempt {job['attempts']})")
                try:
                    process_job(connection, job)
                    print(f"Analysis job {job['id']} completed")
                except Exception as error:  # keep the worker alive for later jobs
                    traceback.print_exc()
                    fail_job(connection, job, error)
        except Exception:
            traceback.print_exc()
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
