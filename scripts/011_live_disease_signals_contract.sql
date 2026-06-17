-- ============================================================
-- Migration 011: Live Disease Signals Contract
--
-- Normalizes disease surveillance records into one geospatial
-- live-signal contract consumed by /api/signals/live and Mapbox.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Data lanes enforce LIVE/SANDBOX isolation.
CREATE TABLE IF NOT EXISTS data_lanes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lane        text NOT NULL UNIQUE,
  label       text,
  badge_color text,
  is_active   boolean NOT NULL DEFAULT false,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_lanes_lane_unique
  ON data_lanes(lane);

ALTER TABLE data_lanes
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN created_at SET DEFAULT now();

INSERT INTO data_lanes (id, lane, label, badge_color, is_active, description, created_at)
VALUES
  (gen_random_uuid(), 'LIVE', 'Live operations', '#22C55E', true, 'Real-world provider ingestion lane', now()),
  (gen_random_uuid(), 'SANDBOX', 'Sandbox', '#94A3B8', false, 'Synthetic or test data lane', now())
ON CONFLICT (lane) DO UPDATE SET
  label = EXCLUDED.label,
  badge_color = EXCLUDED.badge_color,
  description = EXCLUDED.description;

-- Ensure one active default lane if none was already active.
UPDATE data_lanes
SET is_active = true
WHERE lane = 'LIVE'
  AND NOT EXISTS (SELECT 1 FROM data_lanes WHERE is_active = true AND lane <> 'LIVE');

-- Normalize poe_signals across historical migration variants.
CREATE TABLE IF NOT EXISTS poe_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE poe_signals
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS lane_id text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS admin1 text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS admin2 text,
  ADD COLUMN IF NOT EXISTS lga text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS magnitude double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS truth_score numeric(5,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS passed_truth_filter boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS ingested_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS disease text,
  ADD COLUMN IF NOT EXISTS epi_week integer,
  ADD COLUMN IF NOT EXISTS year integer,
  ADD COLUMN IF NOT EXISTS raw_source_id text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS element text,
  ADD COLUMN IF NOT EXISTS confirmed_cases integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspected_cases integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deaths integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_quality_score numeric(5,4) DEFAULT 0.9,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE poe_signals
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN ingested_at SET DEFAULT now();

UPDATE poe_signals
SET lane_id = (SELECT id FROM data_lanes WHERE lane = 'LIVE')
WHERE lane_id IS NULL;

UPDATE poe_signals
SET timestamp = COALESCE(timestamp::timestamptz, created_at::timestamptz, ingested_at::timestamptz, now())
WHERE timestamp IS NULL;

UPDATE poe_signals
SET ingested_at = COALESCE(ingested_at::timestamptz, created_at::timestamptz, timestamp::timestamptz, now())
WHERE ingested_at IS NULL;

UPDATE poe_signals
SET
  type = COALESCE(type, 'disease'),
  element = COALESCE(element, 'fire'),
  source = COALESCE(source, 'UNKNOWN'),
  disease = upper(COALESCE(disease, 'UNKNOWN')),
  country = COALESCE(country, country_code),
  country_code = COALESCE(country_code, country),
  admin1 = COALESCE(admin1, state),
  state = COALESCE(state, admin1),
  admin2 = COALESCE(admin2, lga),
  lga = COALESCE(lga, admin2),
  location = COALESCE(location, lga, admin2, state, admin1, country, country_code),
  magnitude = COALESCE(
    magnitude,
    confirmed_cases + suspected_cases + deaths,
    confirmed_cases,
    suspected_cases,
    deaths,
    0
  ),
  truth_score = COALESCE(truth_score, data_quality_score, 0),
  passed_truth_filter = COALESCE(passed_truth_filter, true);

CREATE INDEX IF NOT EXISTS idx_poe_signals_lane_ingested
  ON poe_signals(lane_id, ingested_at DESC);

CREATE INDEX IF NOT EXISTS idx_poe_signals_live_geo
  ON poe_signals(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_poe_signals_disease_time
  ON poe_signals(disease, timestamp DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_poe_signals_source_record_unique
  ON poe_signals(source, source_record_id)
  WHERE source_record_id IS NOT NULL;

-- Corridor-disease aggregation table may already exist from migration 004.
CREATE TABLE IF NOT EXISTS poe_corridor_signal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corridor_id text NOT NULL,
  disease text NOT NULL,
  epi_week integer NOT NULL,
  year integer NOT NULL,
  fire_truth_score numeric(5,4) DEFAULT 0,
  fire_gate_active boolean DEFAULT false,
  computed_at timestamptz DEFAULT now(),
  UNIQUE(corridor_id, disease, epi_week, year)
);

ALTER TABLE poe_corridor_signal
  ADD COLUMN IF NOT EXISTS lane_id text,
  ADD COLUMN IF NOT EXISTS states_touched text[],
  ADD COLUMN IF NOT EXISTS lgas_touched text[],
  ADD COLUMN IF NOT EXISTS computed_at timestamptz DEFAULT now();

UPDATE poe_corridor_signal
SET lane_id = (SELECT id FROM data_lanes WHERE lane = 'LIVE')
WHERE lane_id IS NULL;

CREATE OR REPLACE VIEW v_live_poe_signals_geo AS
SELECT
  ps.id::text AS id,
  ps.lane_id::text AS lane_id,
  dl.lane,
  dl.label AS lane_label,
  COALESCE(ps.source, 'UNKNOWN') AS source,
  COALESCE(ps.source_record_id, ps.raw_source_id, ps.id::text) AS source_record_id,
  COALESCE(ps.type, 'disease') AS type,
  upper(COALESCE(ps.disease, 'UNKNOWN')) AS disease,
  COALESCE(ps.country, ps.country_code) AS country,
  COALESCE(ps.admin1, ps.state) AS admin1,
  COALESCE(ps.admin2, ps.lga) AS admin2,
  COALESCE(ps.location, ps.lga, ps.state, ps.country_code) AS location,
  ps.latitude,
  ps.longitude,
  COALESCE(ps.magnitude, ps.confirmed_cases + ps.suspected_cases + ps.deaths, 0) AS magnitude,
  COALESCE(ps.truth_score, ps.data_quality_score, 0)::double precision AS truth_score,
  COALESCE(ps.passed_truth_filter, true) AS passed_truth_filter,
  COALESCE(ps.timestamp::timestamptz, ps.ingested_at::timestamptz, now())::text AS timestamp,
  COALESCE(ps.ingested_at::timestamptz, ps.timestamp::timestamptz, now())::text AS ingested_at,
  pcs.corridor_id,
  COALESCE(pcs.fire_gate_active, false) AS fire_gate_active,
  pcs.fire_truth_score::double precision AS fire_truth_score
FROM poe_signals ps
JOIN data_lanes dl ON dl.id = ps.lane_id
LEFT JOIN poe_corridor_signal pcs
  ON pcs.lane_id = ps.lane_id
 AND upper(pcs.disease) = upper(ps.disease)
 AND pcs.year = COALESCE(ps.year, EXTRACT(YEAR FROM COALESCE(ps.timestamp::timestamptz, ps.ingested_at::timestamptz))::integer)
 AND pcs.epi_week = COALESCE(ps.epi_week, EXTRACT(WEEK FROM COALESCE(ps.timestamp::timestamptz, ps.ingested_at::timestamptz))::integer)
WHERE ps.latitude IS NOT NULL
  AND ps.longitude IS NOT NULL
  AND COALESCE(ps.passed_truth_filter, true) = true;

CREATE OR REPLACE VIEW v_live_corridor_disease_pressure AS
SELECT
  dl.id::text AS lane_id,
  dl.lane,
  pcs.corridor_id,
  upper(pcs.disease) AS disease,
  pcs.year,
  pcs.epi_week,
  pcs.fire_gate_active,
  pcs.fire_truth_score::double precision AS fire_truth_score,
  pcs.states_touched,
  pcs.lgas_touched,
  pcs.computed_at::text AS computed_at,
  count(ps.id) AS signal_count,
  sum(COALESCE(ps.magnitude, ps.confirmed_cases + ps.suspected_cases + ps.deaths, 0)) AS total_magnitude
FROM poe_corridor_signal pcs
JOIN data_lanes dl ON dl.id = pcs.lane_id
LEFT JOIN poe_signals ps
  ON ps.lane_id = pcs.lane_id
 AND upper(ps.disease) = upper(pcs.disease)
 AND ps.year = pcs.year
 AND ps.epi_week = pcs.epi_week
GROUP BY
  dl.id,
  dl.lane,
  pcs.corridor_id,
  pcs.disease,
  pcs.year,
  pcs.epi_week,
  pcs.fire_gate_active,
  pcs.fire_truth_score,
  pcs.states_touched,
  pcs.lgas_touched,
  pcs.computed_at;

CREATE TABLE IF NOT EXISTS live_signal_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid,
  lane_id text,
  action text NOT NULL,
  actor text NOT NULL DEFAULT 'system',
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed NCDC-style Lassa test data for smoke testing.
INSERT INTO poe_signals (
  lane_id,
  source,
  source_record_id,
  type,
  disease,
  country,
  country_code,
  admin1,
  state,
  admin2,
  lga,
  location,
  latitude,
  longitude,
  magnitude,
  truth_score,
  passed_truth_filter,
  timestamp,
  ingested_at,
  confirmed_cases,
  suspected_cases,
  deaths,
  data_quality_score
)
VALUES (
  (SELECT id FROM data_lanes WHERE lane = 'LIVE'),
  'NCDC',
  'NCDC-LASSA-EBONYI-2019-W07',
  'disease',
  'LASSA',
  'NG',
  'NG',
  'EBONYI',
  'EBONYI',
  'IZZI',
  'IZZI',
  'Izzi, Ebonyi',
  6.3231,
  8.1137,
  0.88,
  0.88,
  true,
  '2019-02-15T12:00:00Z',
  now(),
  8,
  10,
  1,
  0.9
)
ON CONFLICT DO NOTHING;
