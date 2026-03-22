-- ============================================================
-- The Phantom — Neon DB Schema Migration
-- Core tables required by the live/route.ts API
-- ============================================================

-- corridor_definitions: static definition of each named corridor
CREATE TABLE IF NOT EXISTS corridor_definitions (
  id                TEXT PRIMARY KEY,
  start_node        TEXT NOT NULL,
  end_node          TEXT NOT NULL,
  start_lat         DOUBLE PRECISION NOT NULL,
  start_lng         DOUBLE PRECISION NOT NULL,
  end_lat           DOUBLE PRECISION NOT NULL,
  end_lng           DOUBLE PRECISION NOT NULL,
  region            TEXT,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- corridor_cameras: Cesium camera position per corridor
CREATE TABLE IF NOT EXISTS corridor_cameras (
  id                TEXT PRIMARY KEY,
  corridor_def_id   TEXT NOT NULL REFERENCES corridor_definitions(id) ON DELETE CASCADE,
  lat               DOUBLE PRECISION NOT NULL,
  lng               DOUBLE PRECISION NOT NULL,
  alt_m             DOUBLE PRECISION NOT NULL,
  tilt_deg          DOUBLE PRECISION DEFAULT 50,
  heading_deg       DOUBLE PRECISION DEFAULT 0,
  label             TEXT
);

-- corridor_nodes: waypoints along a corridor path
CREATE TABLE IF NOT EXISTS corridor_nodes (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  corridor_def_id   TEXT NOT NULL REFERENCES corridor_definitions(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  lat               DOUBLE PRECISION NOT NULL,
  lng               DOUBLE PRECISION NOT NULL,
  alt_m             DOUBLE PRECISION DEFAULT 0,
  type              TEXT DEFAULT 'waypoint',   -- 'phantom', 'border', 'waypoint'
  country_code      TEXT,
  km                DOUBLE PRECISION DEFAULT 0,
  sort_order        INTEGER DEFAULT 0
);

-- corridor_evidence_chains: evidence atoms along the corridor path
CREATE TABLE IF NOT EXISTS corridor_evidence_chains (
  id                TEXT PRIMARY KEY,
  corridor_def_id   TEXT NOT NULL REFERENCES corridor_definitions(id) ON DELETE CASCADE,
  evidence_id       TEXT,
  day_offset        INTEGER DEFAULT 0,
  km_marker         DOUBLE PRECISION DEFAULT 0,
  evidence_type     TEXT,
  tag               TEXT,
  location_name     TEXT,
  country_code      TEXT,
  score             DOUBLE PRECISION DEFAULT 0,
  source            TEXT,
  precision_level   TEXT,
  source_record_id  TEXT,
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  alt_m             DOUBLE PRECISION DEFAULT 0
);

-- corridor_scores: computed risk scores per corridor per engine run
CREATE TABLE IF NOT EXISTS corridor_scores (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  corridor_id       TEXT NOT NULL,
  run_id            TEXT,
  score             DOUBLE PRECISION NOT NULL DEFAULT 0,
  risk_class        TEXT DEFAULT 'MODERATE',
  activated         BOOLEAN DEFAULT false,
  total_km          DOUBLE PRECISION DEFAULT 0,
  velocity_km_day   DOUBLE PRECISION DEFAULT 0,
  days_delta        DOUBLE PRECISION DEFAULT 0,
  signal_count      INTEGER DEFAULT 0,
  first_detected    TIMESTAMPTZ DEFAULT NOW(),
  computed_at       TIMESTAMPTZ DEFAULT NOW()
);

-- corridor_gap_zones: gap analysis zones for official routes
CREATE TABLE IF NOT EXISTS corridor_gap_zones (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  corridor_def_id   TEXT NOT NULL REFERENCES corridor_definitions(id) ON DELETE CASCADE,
  label             TEXT,
  start_km          DOUBLE PRECISION DEFAULT 0,
  end_km            DOUBLE PRECISION DEFAULT 0,
  gap_type          TEXT DEFAULT 'COVERAGE_GAP',
  severity          TEXT DEFAULT 'MODERATE'
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_corridor_cameras_def ON corridor_cameras(corridor_def_id);
CREATE INDEX IF NOT EXISTS idx_corridor_nodes_def ON corridor_nodes(corridor_def_id);
CREATE INDEX IF NOT EXISTS idx_corridor_nodes_sort ON corridor_nodes(corridor_def_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_evidence_chains_def ON corridor_evidence_chains(corridor_def_id);
CREATE INDEX IF NOT EXISTS idx_corridor_scores_corridor ON corridor_scores(corridor_id);
CREATE INDEX IF NOT EXISTS idx_corridor_scores_computed ON corridor_scores(computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_corridor_gap_zones_def ON corridor_gap_zones(corridor_def_id);
