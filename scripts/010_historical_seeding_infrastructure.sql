-- ============================================================
-- Migration 010: Historical Seeding Infrastructure
-- 
-- Phantom POE — NCDC Lassa Data Seeding
-- Creates tables and infrastructure for loading historical NCDC data
-- and seeding corridor activations with real epidemiological memory.
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. poe_signals (Raw NCDC Disease Signals)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS poe_signals (
  signal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disease TEXT NOT NULL,                -- 'Lassa', 'Cholera', 'Meningitis', etc.
  state TEXT NOT NULL,
  lga TEXT,                            -- nullable if state-level only
  epi_week INT NOT NULL,
  year INT NOT NULL,
  confirmed_cases INT,
  suspected_cases INT,
  deaths INT,
  tests_done INT,
  positivity_rate NUMERIC(5,4),
  cfr NUMERIC(5,4),                    -- Case Fatality Rate
  ct_value_mean NUMERIC(6,3),          -- Lab metric
  malaria_coinfection_rate NUMERIC(5,4),
  reporting_delay INT,                 -- Days from event to report
  source TEXT DEFAULT 'NCDC',
  data_quality_score NUMERIC(3,2) DEFAULT 0.80,
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(disease, state, lga, epi_week, year),
  CHECK (positivity_rate >= 0 AND positivity_rate <= 1),
  CHECK (cfr >= 0 AND cfr <= 1),
  CHECK (data_quality_score >= 0 AND data_quality_score <= 1)
);

-- Indexes for poe_signals
CREATE INDEX IF NOT EXISTS idx_poe_signals_disease_state 
  ON poe_signals(disease, state, year, epi_week);
CREATE INDEX IF NOT EXISTS idx_poe_signals_time 
  ON poe_signals(year, epi_week);
CREATE INDEX IF NOT EXISTS idx_poe_signals_state_lga 
  ON poe_signals(state, lga) 
  WHERE lga IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 2. corridor_geography (Corridor → State/LGA Mapping)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS corridor_geography (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corridor_id TEXT NOT NULL REFERENCES corridor_definitions(id),
  state TEXT NOT NULL,
  lga TEXT,                            -- nullable if state-wide coverage
  weight REAL DEFAULT 1.0,             -- proportion of corridor in this area
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(corridor_id, state, lga),
  CHECK (weight >= 0 AND weight <= 1)
);

-- Indexes for corridor_geography
CREATE INDEX IF NOT EXISTS idx_corridor_geography_corridor 
  ON corridor_geography(corridor_id);
CREATE INDEX IF NOT EXISTS idx_corridor_geography_state 
  ON corridor_geography(state);
CREATE INDEX IF NOT EXISTS idx_corridor_geography_lga 
  ON corridor_geography(lga) 
  WHERE lga IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 3. corridor_baseline_matches (Seasonal Pattern Matches)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS corridor_baseline_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corridor_id TEXT NOT NULL REFERENCES corridor_definitions(id),
  disease TEXT NOT NULL,
  pattern_type TEXT NOT NULL,          -- e.g., 'Lassa_dry_season_peak', 'Cholera_rainy_season'
  epi_week_start INT NOT NULL,
  epi_week_end INT NOT NULL,
  match_score NUMERIC(5,4) NOT NULL,  -- How well historical data matches pattern
  percentile_threshold NUMERIC(3,2), -- e.g., 75th percentile
  confidence NUMERIC(3,2),
  source TEXT DEFAULT 'historical_analysis',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(corridor_id, disease, pattern_type, epi_week_start, epi_week_end),
  CHECK (match_score >= 0 AND match_score <= 1),
  CHECK (percentile_threshold >= 0 AND percentile_threshold <= 1),
  CHECK (confidence >= 0 AND confidence <= 1)
);

-- Indexes for corridor_baseline_matches
CREATE INDEX IF NOT EXISTS idx_corridor_baseline_matches_corridor 
  ON corridor_baseline_matches(corridor_id);
CREATE INDEX IF NOT EXISTS idx_corridor_baseline_matches_disease 
  ON corridor_baseline_matches(disease, pattern_type);
CREATE INDEX IF NOT EXISTS idx_corridor_baseline_matches_weeks 
  ON corridor_baseline_matches(epi_week_start, epi_week_end);

-- ═══════════════════════════════════════════════════════════════
-- 4. corridor_explainability_cache (Covenant Reports)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS corridor_explainability_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corridor_id TEXT NOT NULL REFERENCES corridor_definitions(id),
  activation_id TEXT REFERENCES corridor_activations(activation_id),
  transition_id TEXT REFERENCES corridor_state_transitions(transition_id),
  covenant_seal TEXT,
  report_markdown TEXT,
  report_json JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,              -- Optional TTL for cache
  UNIQUE(corridor_id, activation_id)
);

-- Indexes for corridor_explainability_cache
CREATE INDEX IF NOT EXISTS idx_explainability_cache_corridor 
  ON corridor_explainability_cache(corridor_id);
CREATE INDEX IF NOT EXISTS idx_explainability_cache_activation 
  ON corridor_explainability_cache(activation_id);
CREATE INDEX IF NOT EXISTS idx_explainability_cache_seal 
  ON corridor_explainability_cache(covenant_seal) 
  WHERE covenant_seal IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_explainability_cache_expires 
  ON corridor_explainability_cache(expires_at) 
  WHERE expires_at IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 5. Views for Historical Analysis
-- ═══════════════════════════════════════════════════════════════

-- View: Weekly signal aggregation by corridor
CREATE OR REPLACE VIEW v_corridor_weekly_signals AS
SELECT 
  cg.corridor_id,
  ps.disease,
  ps.year,
  ps.epi_week,
  COUNT(*) as signal_count,
  SUM(ps.confirmed_cases) as total_confirmed_cases,
  AVG(ps.positivity_rate) as avg_positivity_rate,
  AVG(ps.cfr) as avg_cfr,
  AVG(ps.data_quality_score) as avg_data_quality
FROM corridor_geography cg
JOIN poe_signals ps ON 
  ps.state = cg.state AND 
  (ps.lga = cg.lga OR (cg.lga IS NULL AND ps.lga IS NULL))
GROUP BY cg.corridor_id, ps.disease, ps.year, ps.epi_week
ORDER BY cg.corridor_id, ps.year, ps.epi_week;

-- View: Historical activation timeline
CREATE OR REPLACE VIEW v_historical_activation_timeline AS
SELECT 
  ca.corridor_id,
  cd.canonical_name,
  ca.year,
  ca.epi_week,
  ca.disease,
  ca.raw_fire_score,
  ca.memory_informed_score,
  ca.memory_state,
  ca.active,
  ca.covenant_seal,
  ca.created_at
FROM corridor_activations ca
LEFT JOIN corridor_definitions cd ON ca.corridor_id = cd.id
ORDER BY ca.corridor_id, ca.year, ca.epi_week;

-- View: State transition history
CREATE OR REPLACE VIEW v_state_transition_history AS
SELECT 
  cst.corridor_id,
  cd.canonical_name,
  cst.from_state,
  cst.to_state,
  cst.transition_reason,
  cst.approved_at,
  cst.approved_by,
  cst.truth_engine_verdict->>'status' as verdict_status
FROM corridor_state_transitions cst
LEFT JOIN corridor_definitions cd ON cst.corridor_id = cd.id
ORDER BY cst.approved_at DESC;

-- ═══════════════════════════════════════════════════════════════
-- 6. Functions for Seeding
-- ═══════════════════════════════════════════════════════════════

-- Function: Get corridor signals for a given week
CREATE OR REPLACE FUNCTION get_corridor_weekly_signals(
  p_corridor_id TEXT,
  p_year INT,
  p_epi_week INT
) RETURNS TABLE (
  disease TEXT,
  signal_count INT,
  total_confirmed BIGINT,
  avg_positivity NUMERIC,
  avg_cfr NUMERIC,
  avg_data_quality NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ps.disease,
    COUNT(*) as signal_count,
    SUM(ps.confirmed_cases) as total_confirmed,
    AVG(ps.positivity_rate) as avg_positivity,
    AVG(ps.cfr) as avg_cfr,
    AVG(ps.data_quality_score) as avg_data_quality
  FROM corridor_geography cg
  JOIN poe_signals ps ON 
    ps.state = cg.state AND 
    (ps.lga = cg.lga OR (cg.lga IS NULL AND ps.lga IS NULL))
  WHERE cg.corridor_id = p_corridor_id
    AND ps.year = p_year
    AND ps.epi_week = p_epi_week
  GROUP BY ps.disease;
END;
$$ LANGUAGE plpgsql;

-- Function: Compute Lassa Fire score from signals
CREATE OR REPLACE FUNCTION compute_lassa_fire_score(
  p_positivity NUMERIC,
  p_confirmed_cases INT,
  p_cfr NUMERIC,
  p_data_quality NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  v_positivity_score NUMERIC;
  v_confirmed_score NUMERIC;
  v_cfr_score NUMERIC;
  v_quality_score NUMERIC;
  v_raw_score NUMERIC;
BEGIN
  -- Normalize components (simplified for seeding)
  -- In production, use percentile normalization across dataset
  v_positivity_score := COALESCE(p_positivity, 0);
  v_confirmed_score := LEAST(p_confirmed_cases / 100.0, 1.0); -- Normalize to 0-1
  v_cfr_score := COALESCE(p_cfr, 0);
  v_quality_score := COALESCE(p_data_quality, 0.8);
  
  -- Weighted sum
  v_raw_score := 
    0.30 * v_positivity_score +
    0.25 * v_confirmed_score +
    0.20 * 0.5 + -- endemic_spatial_score (placeholder)
    0.15 * v_cfr_score +
    0.10 * v_quality_score;
  
  RETURN LEAST(v_raw_score, 1.0);
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- 7. Documentation
-- ═══════════════════════════════════════════════════════════════

COMMENT ON TABLE poe_signals IS 
  'Raw disease signals from NCDC and other sources. One row per state/week/disease.';

COMMENT ON TABLE corridor_geography IS 
  'Maps corridors to geographic areas (states/LGAs) with weights for signal aggregation.';

COMMENT ON TABLE corridor_baseline_matches IS 
  'Captures seasonal pattern matches (e.g., Lassa dry-season peak) for corridors.';

COMMENT ON TABLE corridor_explainability_cache IS 
  'Caches covenant reports and explainability markdown for key activations.';

COMMENT ON FUNCTION get_corridor_weekly_signals IS 
  'Aggregates signals for a corridor in a given week, grouped by disease.';

COMMENT ON FUNCTION compute_lassa_fire_score IS 
  'Computes raw Lassa Fire score from signal components using weighted formula.';
