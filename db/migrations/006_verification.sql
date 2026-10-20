CREATE TABLE IF NOT EXISTS verification_results (
  id bigserial PRIMARY KEY,
  observation_id text NOT NULL REFERENCES field_observations(id) ON DELETE CASCADE,
  engine text NOT NULL CHECK (engine IN ('server', 'client')),
  status text NOT NULL,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  rules_version text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_results_observation_idx
  ON verification_results (observation_id, computed_at DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS field_obs_sha_uidx
  ON field_observations (image_sha256) WHERE image_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS field_obs_officer_time_idx
  ON field_observations (officer_id, created_at);

CREATE TABLE IF NOT EXISTS audit_history (
  id bigserial PRIMARY KEY,
  observation_id text NOT NULL REFERENCES field_observations(id) ON DELETE CASCADE,
  actor text NOT NULL,
  action text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  reason text
);
CREATE INDEX IF NOT EXISTS audit_history_observation_idx
  ON audit_history (observation_id, at DESC, id DESC);
