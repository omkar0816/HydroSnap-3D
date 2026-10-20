CREATE TABLE IF NOT EXISTS watershed_reports (
  id text PRIMARY KEY,
  watershed_id text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  fact_set jsonb NOT NULL,
  fact_set_sha256 text NOT NULL,
  claims jsonb NOT NULL,
  gaps jsonb NOT NULL,
  rendered_markdown text NOT NULL,
  model text,
  validator_version text NOT NULL,
  language text NOT NULL DEFAULT 'en'
);
CREATE INDEX IF NOT EXISTS wr_ws_idx
  ON watershed_reports (watershed_id, created_at DESC);
