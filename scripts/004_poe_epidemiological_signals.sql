-- ============================================================
-- Migration 004: POE Epidemiological Signals
-- Multi-disease surveillance ground-truth layer for Phantom POE
-- Diseases: Lassa Fever, Cholera, Meningitis
-- ============================================================

-- poe_signals: Unified disease-agnostic signal table
CREATE TABLE IF NOT EXISTS poe_signals (
    id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    disease           text        NOT NULL,  -- 'LASSA', 'CHOLERA', 'MENINGITIS'
    state             text        NOT NULL,
    lga               text        NOT NULL,
    epi_week          integer     NOT NULL,
    year              integer     NOT NULL,
    
    -- Case data
    confirmed_cases   integer     DEFAULT 0,
    suspected_cases   integer     DEFAULT 0,
    deaths            integer     DEFAULT 0,
    tests_done        integer     DEFAULT 0,
    
    -- Derived metrics
    positivity_rate   numeric(5,4),           -- 0.0 to 1.0
    cfr               numeric(5,4),           -- Case fatality ratio
    ct_value_mean     numeric(4,2),           -- Mean CT value for PCR
    malaria_coinfection_rate numeric(5,4),
    
    -- Metadata
    reporting_delay   integer,                -- Days between event and report
    source            text,                   -- 'DHIS2', 'EWARS', 'AFRO-SENTINEL', 'LAB'
    data_quality_score numeric(3,2) DEFAULT 0.9,
    
    -- Location
    country_code      text        DEFAULT 'NG',
    latitude          double precision,
    longitude         double precision,
    
    created_at        timestamptz DEFAULT NOW(),
    updated_at        timestamptz DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicate signals
    UNIQUE(disease, state, lga, epi_week, year, source)
);

-- poe_corridor_signal: Corridor-week disease signal aggregation
CREATE TABLE IF NOT EXISTS poe_corridor_signal (
    id                        uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    corridor_id               text        NOT NULL REFERENCES corridor_definitions(id) ON DELETE CASCADE,
    disease                   text        NOT NULL,
    epi_week                  integer     NOT NULL,
    year                      integer     NOT NULL,
    
    -- Spatial coverage
    states_touched            text[],
    lgas_touched              text[],
    
    -- Composite scores (0.0 to 1.0)
    case_burden_score         numeric(3,2) DEFAULT 0,
    growth_score              numeric(3,2) DEFAULT 0,
    positivity_score          numeric(3,2) DEFAULT 0,
    severity_score            numeric(3,2) DEFAULT 0,
    spatial_alignment_score   numeric(3,2) DEFAULT 0,
    temporal_alignment_score  numeric(3,2) DEFAULT 0,
    
    -- Fire gate truth score (disease-calibrated)
    fire_truth_score          numeric(3,2) DEFAULT 0,
    fire_gate_active          boolean     DEFAULT false,
    
    -- Decomposition for explainability
    score_weights             jsonb,        -- Disease-specific weights used
    
    computed_at               timestamptz DEFAULT NOW(),
    
    -- Unique constraint per corridor-disease-week
    UNIQUE(corridor_id, disease, epi_week, year)
);

-- Disease-specific Fire truth floors configuration
CREATE TABLE IF NOT EXISTS poe_disease_fire_config (
    disease           text        PRIMARY KEY,
    fire_floor        numeric(3,2) NOT NULL,  -- Activation threshold
    
    -- Scoring weights (must sum to 1.0)
    weight_case_burden    numeric(3,2) DEFAULT 0.25,
    weight_growth         numeric(3,2) DEFAULT 0.25,
    weight_positivity     numeric(3,2) DEFAULT 0.20,
    weight_severity       numeric(3,2) DEFAULT 0.15,
    weight_spatial        numeric(3,2) DEFAULT 0.10,
    weight_temporal       numeric(3,2) DEFAULT 0.05,
    
    -- Disease characteristics
    season_start_week     integer,              -- Epidemiological week season starts
    season_end_week       integer,
    endemic_states        text[],               -- States with historical endemicity
    
    updated_at            timestamptz DEFAULT NOW()
);

-- Insert disease-specific configurations per user specification
INSERT INTO poe_disease_fire_config (disease, fire_floor, weight_case_burden, weight_growth, 
                                     weight_positivity, weight_severity, weight_spatial, weight_temporal,
                                     endemic_states)
VALUES 
    -- Lassa: Emphasizes positivity, confirmed cases, endemic spatial alignment, CFR
    ('LASSA', 0.76, 0.25, 0.15, 0.30, 0.20, 0.10, 0.00, 
     ARRAY['ONDO', 'EDO', 'BAUCHI', 'TARABA', 'EBONYI']),
    
    -- Cholera: Emphasizes rapid growth, spatial clustering, corridor proximity
    ('CHOLERA', 0.66, 0.20, 0.35, 0.10, 0.10, 0.20, 0.05, 
     ARRAY['YOBE', 'BORNO', 'ADAMAWA', 'JIGAWA', 'KANO']),
    
    -- Meningitis: Emphasizes seasonality, incidence concentration
    ('MENINGITIS', 0.72, 0.25, 0.20, 0.15, 0.15, 0.20, 0.05, 
     ARRAY['JIGAWA', 'KANO', 'KATSINA', 'ZAMFARA', 'SOKOTO', 'KEBBI'])
ON CONFLICT (disease) DO UPDATE SET
    fire_floor = EXCLUDED.fire_floor,
    weight_case_burden = EXCLUDED.weight_case_burden,
    weight_growth = EXCLUDED.weight_growth,
    weight_positivity = EXCLUDED.weight_positivity,
    weight_severity = EXCLUDED.weight_severity,
    weight_spatial = EXCLUDED.weight_spatial,
    weight_temporal = EXCLUDED.weight_temporal,
    endemic_states = EXCLUDED.endemic_states,
    updated_at = NOW();

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_poe_signals_disease_week 
    ON poe_signals(disease, epi_week, year);
CREATE INDEX IF NOT EXISTS idx_poe_signals_state_lga 
    ON poe_signals(state, lga);
CREATE INDEX IF NOT EXISTS idx_poe_signals_location 
    ON poe_signals(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_poe_signals_created 
    ON poe_signals(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_poe_corridor_signal_lookup 
    ON poe_corridor_signal(corridor_id, disease, epi_week, year);
CREATE INDEX IF NOT EXISTS idx_poe_corridor_signal_fire 
    ON poe_corridor_signal(fire_gate_active, fire_truth_score DESC);
CREATE INDEX IF NOT EXISTS idx_poe_corridor_signal_computed 
    ON poe_corridor_signal(computed_at DESC);

-- ============================================================
-- Views for common queries
-- ============================================================

-- Active corridor-disease activations for current week
CREATE OR REPLACE VIEW v_active_corridor_diseases AS
SELECT 
    corridor_id,
    disease,
    epi_week,
    year,
    fire_truth_score,
    fire_gate_active,
    states_touched,
    computed_at
FROM poe_corridor_signal
WHERE fire_gate_active = true
ORDER BY fire_truth_score DESC;

-- Corridor multi-threat risk (combines all active disease signals)
CREATE OR REPLACE VIEW v_corridor_multi_threat_risk AS
SELECT 
    corridor_id,
    epi_week,
    year,
    COUNT(DISTINCT CASE WHEN fire_gate_active THEN disease END) as active_disease_count,
    MAX(CASE WHEN disease = 'LASSA' THEN fire_truth_score END) as lassa_risk,
    MAX(CASE WHEN disease = 'CHOLERA' THEN fire_truth_score END) as cholera_risk,
    MAX(CASE WHEN disease = 'MENINGITIS' THEN fire_truth_score END) as meningitis_risk,
    -- Multi-threat amplification: 1 - Product(1 - risk_i)
    1 - (
        (1 - COALESCE(MAX(CASE WHEN disease = 'LASSA' THEN fire_truth_score END), 0)) *
        (1 - COALESCE(MAX(CASE WHEN disease = 'CHOLERA' THEN fire_truth_score END), 0)) *
        (1 - COALESCE(MAX(CASE WHEN disease = 'MENINGITIS' THEN fire_truth_score END), 0))
    ) as combined_risk
FROM poe_corridor_signal
GROUP BY corridor_id, epi_week, year;

-- ============================================================
-- Trigger for updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_poe_signals_updated_at 
    BEFORE UPDATE ON poe_signals 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_poe_disease_fire_config_updated_at 
    BEFORE UPDATE ON poe_disease_fire_config 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
