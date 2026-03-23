-- ============================================================
-- 004: Phantom POE — crossing points, temporal events, temporal flows
-- Source: IOM DTM published reports 2023-2025
-- ============================================================

-- ── Table: phantom_poe_crossing_points ───────────────────────
CREATE TABLE IF NOT EXISTS phantom_poe_crossing_points (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  alt_names         TEXT,
  lat               NUMERIC(9,6) NOT NULL,
  lng               NUMERIC(9,6) NOT NULL,
  country_a         CHAR(2) NOT NULL,
  country_b         CHAR(2) NOT NULL,
  crossing_type     TEXT NOT NULL,  -- formal_land | informal_land | sea_route
  iom_fmp_active    BOOLEAN NOT NULL DEFAULT FALSE,
  monthly_avg_flow  INTEGER,
  peak_daily_flow   INTEGER,
  status            TEXT NOT NULL DEFAULT 'active',  -- active | partially_restricted | closed
  closure_periods   TEXT,
  source            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Table: phantom_poe_temporal_events ───────────────────────
CREATE TABLE IF NOT EXISTS phantom_poe_temporal_events (
  id                TEXT PRIMARY KEY,
  corridor_id       TEXT,
  crossing_point_id TEXT REFERENCES phantom_poe_crossing_points(id) ON DELETE SET NULL,
  event_date        DATE NOT NULL,
  event_type        TEXT NOT NULL,  -- DISPLACEMENT_WAVE | CONFLICT_ONSET | CROSSING_SURGE | etc.
  description       TEXT,
  flow_impact       TEXT,           -- RING_ACTIVATION | MASSIVE_SURGE | PEAK | BLOCKED | etc.
  source            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Table: phantom_poe_temporal_flows ────────────────────────
CREATE TABLE IF NOT EXISTS phantom_poe_temporal_flows (
  id              BIGSERIAL PRIMARY KEY,
  corridor_id     TEXT NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  flow_count      INTEGER NOT NULL,
  flow_direction  TEXT NOT NULL,
  source_report   TEXT,
  notes           TEXT,
  provenance      TEXT NOT NULL DEFAULT 'IOM-DTM-PUBLISHED',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast corridor + date queries
CREATE INDEX IF NOT EXISTS idx_poe_events_corridor   ON phantom_poe_temporal_events(corridor_id);
CREATE INDEX IF NOT EXISTS idx_poe_events_date       ON phantom_poe_temporal_events(event_date);
CREATE INDEX IF NOT EXISTS idx_poe_flows_corridor    ON phantom_poe_temporal_flows(corridor_id);
CREATE INDEX IF NOT EXISTS idx_poe_flows_period      ON phantom_poe_temporal_flows(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_poe_crossing_countries ON phantom_poe_crossing_points(country_a, country_b);
