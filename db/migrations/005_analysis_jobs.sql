ALTER TABLE analysis_jobs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed')),
  ADD COLUMN IF NOT EXISTS watershed_id text,
  ADD COLUMN IF NOT EXISTS asset_id text,
  ADD COLUMN IF NOT EXISTS params jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

UPDATE analysis_jobs
SET status = CASE lower(COALESCE(payload->>'status', 'queued'))
      WHEN 'queued' THEN 'queued'
      WHEN 'running' THEN 'running'
      WHEN 'processing' THEN 'running'
      WHEN 'done' THEN 'done'
      WHEN 'completed' THEN 'done'
      WHEN 'failed' THEN 'failed'
      ELSE 'queued'
    END,
    watershed_id = COALESCE(watershed_id, payload->>'watershedId'),
    asset_id = COALESCE(asset_id, payload->>'assetId'),
    created_at = COALESCE(
      CASE WHEN payload->>'createdAt' ~ '^\\d{4}-\\d{2}-\\d{2}'
           THEN (payload->>'createdAt')::timestamptz END,
      created_at
    )
WHERE watershed_id IS NULL OR asset_id IS NULL OR payload ? 'status'
   OR payload ? 'createdAt';

CREATE INDEX IF NOT EXISTS analysis_jobs_queue_idx
  ON analysis_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS analysis_jobs_watershed_idx
  ON analysis_jobs (watershed_id, created_at DESC);
