-- Rendered NDVI/NDWI composites (PNG, WGS84 bounds) produced by the Earth Engine
-- worker so the map can draw the selected index as a raster overlay.
CREATE TABLE IF NOT EXISTS satellite_rasters (
  id text PRIMARY KEY,
  measurement_id text NOT NULL REFERENCES satellite_measurements(id) ON DELETE CASCADE,
  watershed_id text NOT NULL,
  asset_id text,
  job_id text,
  index_type text NOT NULL CHECK (index_type IN ('NDVI', 'NDWI')),
  window_role text NOT NULL CHECK (window_role IN ('baseline', 'current', 'custom')),
  window_start date NOT NULL,
  window_end date NOT NULL,
  west double precision NOT NULL,
  south double precision NOT NULL,
  east double precision NOT NULL,
  north double precision NOT NULL,
  vmin double precision NOT NULL,
  vmax double precision NOT NULL,
  png bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS satrast_ws_idx
  ON satellite_rasters (watershed_id, index_type, window_role, created_at DESC);
CREATE INDEX IF NOT EXISTS satrast_measurement_idx
  ON satellite_rasters (measurement_id);
