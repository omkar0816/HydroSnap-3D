-- Add typed provenance fields while retaining payload for legacy clients.
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS installed_at date,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'officer-entry',
  ADD COLUMN IF NOT EXISTS source_licence text,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false;

ALTER TABLE field_observations
  ADD COLUMN IF NOT EXISTS officer_id text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'Pending review',
  ADD COLUMN IF NOT EXISTS asset_id text,
  ADD COLUMN IF NOT EXISTS asset_type text,
  ADD COLUMN IF NOT EXISTS inspection_date date,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'officer-field-photo',
  ADD COLUMN IF NOT EXISTS source_licence text,
  ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false;

ALTER TABLE streams
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_licence text,
  ADD COLUMN IF NOT EXISTS stream_order int,
  ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT true;

ALTER TABLE watersheds
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_licence text,
  ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT true;

ALTER TABLE interventions
  ADD COLUMN IF NOT EXISTS watershed_id text,
  ADD COLUMN IF NOT EXISTS asset_id text REFERENCES assets(id),
  ADD COLUMN IF NOT EXISTS installed_at date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Planned',
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'officer-entry',
  ADD COLUMN IF NOT EXISTS source_licence text,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS interventions_watershed_idx
  ON interventions (watershed_id);

CREATE TABLE IF NOT EXISTS intervention_status_history (
  id bigserial PRIMARY KEY,
  intervention_id text NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE TABLE IF NOT EXISTS satellite_measurements (
  id text PRIMARY KEY,
  watershed_id text NOT NULL,
  asset_id text,
  aoi_scope text NOT NULL CHECK (aoi_scope IN ('watershed', 'asset_buffer')),
  buffer_m int,
  index_type text NOT NULL CHECK (index_type IN ('NDVI', 'NDWI')),
  window_role text NOT NULL CHECK (window_role IN ('baseline', 'current', 'custom')),
  window_start date NOT NULL,
  window_end date NOT NULL,
  season_label text,
  mean double precision,
  median double precision,
  p10 double precision,
  p90 double precision,
  std double precision,
  valid_pixel_pct double precision,
  scene_count int,
  scene_ids text[] NOT NULL DEFAULT '{}',
  cloud_limit_pct int,
  method text NOT NULL,
  resolution_m int,
  status text NOT NULL CHECK (status IN ('measured', 'insufficient_data', 'failed')),
  job_id text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  source_licence text,
  attribution text,
  demo boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS satmeas_ws_idx
  ON satellite_measurements (watershed_id, index_type, window_start);

CREATE TABLE IF NOT EXISTS land_use (
  id text PRIMARY KEY,
  watershed_id text NOT NULL,
  class_name text NOT NULL,
  area_ha double precision NOT NULL,
  pct double precision NOT NULL,
  reference_year int NOT NULL,
  source text NOT NULL,
  source_licence text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  demo boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS land_use_ws_idx ON land_use (watershed_id);

CREATE TABLE IF NOT EXISTS drainage (
  watershed_id text PRIMARY KEY,
  stream_length_km double precision NOT NULL,
  drainage_density_km_per_km2 double precision NOT NULL,
  max_stream_order int,
  source text NOT NULL,
  source_licence text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  demo boolean NOT NULL DEFAULT false
);
