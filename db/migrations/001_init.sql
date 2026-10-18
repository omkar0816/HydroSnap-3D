CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (
  id text PRIMARY KEY,
  payload jsonb NOT NULL
);

CREATE TABLE watersheds (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  boundary geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX watersheds_boundary_gix ON watersheds USING gist (boundary);

CREATE TABLE streams (
  id text PRIMARY KEY,
  watershed_id text,
  payload jsonb NOT NULL,
  geometry geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX streams_watershed_id_idx ON streams (watershed_id);
CREATE INDEX streams_geometry_gix ON streams USING gist (geometry);
CREATE INDEX streams_geography_gix ON streams USING gist ((geometry::geography));

CREATE TABLE assets (
  id text PRIMARY KEY,
  watershed_id text NOT NULL,
  payload jsonb NOT NULL,
  location geometry(Point, 4326) NOT NULL
);
CREATE INDEX assets_watershed_id_idx ON assets (watershed_id);
CREATE INDEX assets_location_gix ON assets USING gist (location);

CREATE TABLE field_observations (
  id text PRIMARY KEY,
  watershed_id text NOT NULL,
  idempotency_key text UNIQUE,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL,
  image_path text,
  image_sha256 text,
  location geometry(Point, 4326) NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX field_observations_watershed_id_idx ON field_observations (watershed_id);
CREATE INDEX field_observations_location_gix ON field_observations USING gist (location);
CREATE INDEX field_observations_created_at_idx ON field_observations (created_at DESC);

CREATE TABLE satellite_timeline (
  id text PRIMARY KEY,
  payload jsonb NOT NULL
);

CREATE TABLE map_layers (
  id text PRIMARY KEY,
  payload jsonb NOT NULL
);

CREATE TABLE interventions (
  id text PRIMARY KEY,
  payload jsonb NOT NULL
);

CREATE TABLE analysis_jobs (
  id text PRIMARY KEY,
  payload jsonb NOT NULL
);

CREATE TABLE analysis_results (
  id text PRIMARY KEY,
  payload jsonb NOT NULL
);

CREATE TABLE reports (
  id text PRIMARY KEY,
  payload jsonb NOT NULL
);
