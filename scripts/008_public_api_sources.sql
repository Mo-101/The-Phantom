-- ============================================================
-- Migration 008: Public API Sources Integration
-- 
-- Phantom POE — Public APIs as ENRICHMENT sources
-- Rule: Public APIs do not override primary signals (DHIS2, ACLED, DTM, field validation)
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. External API Sources Registry
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS poe_external_api_sources (
    source_id             text        PRIMARY KEY,
    label                 text        NOT NULL,
    role                  text        NOT NULL,  -- 'PRIMARY_SIGNAL', 'ENRICHMENT', 'REFERENCE_BASELINE', 'VALIDATION_AUXILIARY'
    element               text        NOT NULL,  -- 'fire', 'water', 'air', 'earth', 'ether'
    corridor_use          text[],                  -- Array of use cases
    auth                  text        NOT NULL,  -- 'none', 'apiKey', 'basic', 'token'
    cadence               text,
    priority              integer     NOT NULL DEFAULT 3,
    truth_floor           numeric(3,2) NOT NULL,
    phantom_signal_type   text        NOT NULL,
    enabled               boolean     DEFAULT true,
    notes                 jsonb       DEFAULT '[]'::jsonb,
    created_at            timestamptz DEFAULT NOW(),
    updated_at            timestamptz DEFAULT NOW()
);

-- Seed with canonical Phantom public API sources
INSERT INTO poe_external_api_sources (
    source_id, label, role, element, corridor_use, auth, cadence, priority, 
    truth_floor, phantom_signal_type, notes
) VALUES
    ('open_meteo_forecast', 'Open-Meteo Forecast API', 'ENRICHMENT', 'earth',
     ARRAY['rainfall and temperature context', 'seasonal corridor activation', 'road accessibility proxy', 'cholera and meningitis environmental context'],
     'none', 'every 6h per watched corridor centroid', 1, 0.68, 'weather_forecast_enrichment',
     '["Do not activate corridors alone", "Useful for seasonal and friction layers"]'::jsonb),
     
    ('open_meteo_historical', 'Open-Meteo Historical Weather API', 'REFERENCE_BASELINE', 'earth',
     ARRAY['historical rainfall baselines', 'seasonality calibration', 'activation history comparison', 'retrospective corridor validation'],
     'none', 'manual or weekly baseline refresh', 1, 0.72, 'historical_weather_baseline',
     '["Store as baseline evidence, not live signal"]'::jsonb),
     
    ('open_meteo_elevation', 'Open-Meteo Elevation API', 'ENRICHMENT', 'earth',
     ARRAY['terrain friction', 'least-cost path validation', 'altitude-aware corridor plausibility'],
     'none', 'cache forever after first coordinate query', 1, 0.80, 'terrain_elevation_enrichment',
     '["Elevation values should be cached by lat/lng grid cell"]'::jsonb),
     
    ('open_meteo_air_quality', 'Open-Meteo Air Quality API', 'ENRICHMENT', 'earth',
     ARRAY['dust and particulate context', 'meningitis belt dry-season context', 'urban stress proxy'],
     'none', 'daily or every 12h', 3, 0.62, 'air_quality_enrichment',
     '["Auxiliary only; never activates corridor alone"]'::jsonb),
     
    ('open_meteo_flood', 'Open-Meteo Flood / River Discharge API', 'ENRICHMENT', 'earth',
     ARRAY['river crossing disruption', 'cholera water-risk context', 'route blockage and displacement pressure'],
     'none', 'daily during rainy season; weekly otherwise', 2, 0.68, 'flood_river_discharge_enrichment',
     '["Use with hydrological corridor nodes only"]'::jsonb),
     
    ('positionstack_geocoding', 'Positionstack Geocoding API', 'VALIDATION_AUXILIARY', 'earth',
     ARRAY['forward geocode named places', 'reverse geocode raw coordinates', 'normalize source locations into POE_Node anchors'],
     'apiKey', 'on new place name or low-confidence coordinate', 1, 0.70, 'geocoding_validation',
     '["Cache all geocoding results", "Never expose key to client bundle"]'::jsonb),
     
    ('administrative_divisions_db', 'Administrative Divisions DB', 'REFERENCE_BASELINE', 'earth',
     ARRAY['country/state/LGA normalization', 'admin-boundary lookup', 'jurisdiction rollup for reports'],
     'none', 'monthly or release-based sync', 1, 0.82, 'admin_boundary_reference',
     '["Prefer local cached copy for offline-first operation"]'::jsonb),
     
    ('socrata_open_data', 'Socrata Open Data API', 'ENRICHMENT', 'ether',
     ARRAY['government open-data feeds', 'facility, infrastructure, public service datasets', 'market or transport datasets where available'],
     'none', 'dataset-specific; usually daily/weekly', 3, 0.60, 'open_government_dataset_enrichment',
     '["Dataset provenance must be stored because each Socrata portal differs"]'::jsonb),
     
    ('openafrica', 'openAFRICA', 'REFERENCE_BASELINE', 'ether',
     ARRAY['African open datasets', 'admin, infrastructure, demographic and public-interest data discovery', 'baseline enrichment'],
     'none', 'manual curation or weekly dataset watch', 2, 0.64, 'africa_open_data_reference',
     '["Use as dataset discovery and baseline source, not live activation truth"]'::jsonb)

ON CONFLICT (source_id) DO UPDATE SET
    label = EXCLUDED.label,
    role = EXCLUDED.role,
    element = EXCLUDED.element,
    truth_floor = EXCLUDED.truth_floor,
    updated_at = NOW();

-- ═══════════════════════════════════════════════════════════════
-- 2. External API Signals Storage
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS poe_external_api_signals (
    signal_id             text        PRIMARY KEY,
    source_id             text        NOT NULL REFERENCES poe_external_api_sources(source_id),
    source_record_id      text        NOT NULL,
    source_url            text,
    source_role           text        NOT NULL,
    element               text        NOT NULL,
    signal_type           text        NOT NULL,
    
    -- Corridor references
    corridor_id           text        REFERENCES corridor_definitions(id),
    baseline_id           text        REFERENCES corridor_baselines(baseline_id),
    
    -- System context
    run_id                text        NOT NULL,
    workspace             text        NOT NULL DEFAULT 'phantom-poe',
    system                text        NOT NULL DEFAULT 'mo-border-phantom-001',
    
    -- Temporal
    observed_at           timestamptz NOT NULL,
    ingested_at           timestamptz DEFAULT NOW(),
    
    -- Geography
    lat                   numeric(10,6),
    lng                   numeric(10,6),
    admin0                text,        -- Country
    admin1                text,        -- State/Province
    admin2                text,        -- LGA/District
    location_precision_class text     NOT NULL,  -- 'exact', 'approximate', 'admin_centroid', 'unknown'
    
    -- Value
    value                 jsonb,
    unit                  text,
    
    -- Truth scoring
    truth_score           numeric(3,2) NOT NULL,
    uncertainty           numeric(3,2) NOT NULL,
    
    -- Payload and metadata
    payload               jsonb       NOT NULL,
    normalization_version text        NOT NULL,
    scoring_algorithm_version text    NOT NULL,
    
    -- Constraints
    UNIQUE(source_id, source_record_id, run_id),
    CHECK (truth_score >= 0 AND truth_score <= 1),
    CHECK (uncertainty >= 0 AND uncertainty <= 1)
);

-- ═══════════════════════════════════════════════════════════════
-- 3. Indexes for Query Performance
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_poe_external_api_signals_source_time
    ON poe_external_api_signals(source_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_poe_external_api_signals_corridor_time
    ON poe_external_api_signals(corridor_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_poe_external_api_signals_run
    ON poe_external_api_signals(run_id, source_id);

CREATE INDEX IF NOT EXISTS idx_poe_external_api_signals_geo
    ON poe_external_api_signals(lat, lng) 
    WHERE lat IS NOT NULL AND lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_poe_external_api_signals_role
    ON poe_external_api_signals(source_role, truth_score DESC);

-- ═══════════════════════════════════════════════════════════════
-- 4. Views for Operational Monitoring
-- ═══════════════════════════════════════════════════════════════

-- Public API signal summary by source
CREATE OR REPLACE VIEW v_public_api_signal_summary AS
SELECT 
    s.source_id,
    src.label,
    src.role,
    src.element,
    COUNT(*) as total_signals,
    COUNT(DISTINCT s.corridor_id) as corridors_enriched,
    MIN(s.observed_at) as oldest_signal,
    MAX(s.observed_at) as newest_signal,
    ROUND(AVG(s.truth_score), 2) as avg_truth_score,
    ROUND(AVG(s.uncertainty), 2) as avg_uncertainty,
    src.enabled
FROM poe_external_api_signals s
JOIN poe_external_api_sources src ON s.source_id = src.source_id
GROUP BY s.source_id, src.label, src.role, src.element, src.enabled
ORDER BY 
    CASE src.role 
        WHEN 'ENRICHMENT' THEN 1 
        WHEN 'REFERENCE_BASELINE' THEN 2 
        WHEN 'VALIDATION_AUXILIARY' THEN 3 
        ELSE 4 
    END,
    total_signals DESC;

-- Enrichment signals by corridor (for explainability)
CREATE OR REPLACE VIEW v_corridor_enrichment_signals AS
SELECT 
    s.corridor_id,
    cd.canonical_name,
    s.source_id,
    src.label as source_label,
    src.role,
    s.signal_type,
    s.observed_at,
    s.truth_score,
    s.uncertainty,
    s.lat,
    s.lng,
    s.value,
    s.payload
FROM poe_external_api_signals s
JOIN poe_external_api_sources src ON s.source_id = src.source_id
LEFT JOIN corridor_definitions cd ON s.corridor_id = cd.id
WHERE src.role = 'ENRICHMENT'
ORDER BY s.corridor_id, s.observed_at DESC;

-- Free vs Key-required API usage
CREATE OR REPLACE VIEW v_public_api_auth_status AS
SELECT 
    source_id,
    label,
    auth,
    CASE auth WHEN 'none' THEN 'FREE' ELSE 'KEY_REQUIRED' END as auth_status,
    enabled,
    priority,
    truth_floor,
    cadence
FROM poe_external_api_sources
ORDER BY 
    CASE auth WHEN 'none' THEN 0 ELSE 1 END,
    priority;

-- Recent Open-Meteo enrichments (dashboard view)
CREATE OR REPLACE VIEW v_recent_open_meteo_enrichments AS
SELECT 
    s.signal_id,
    s.corridor_id,
    cd.canonical_name,
    s.observed_at,
    s.truth_score,
    s.lat,
    s.lng,
    s.payload->>'hourly' as has_hourly_data,
    s.payload->>'daily' as has_daily_data,
    s.run_id
FROM poe_external_api_signals s
LEFT JOIN corridor_definitions cd ON s.corridor_id = cd.id
WHERE s.source_id = 'open_meteo_forecast'
    AND s.observed_at > NOW() - INTERVAL '24 hours'
ORDER BY s.observed_at DESC;

-- ═══════════════════════════════════════════════════════════════
-- 5. Functions for Enrichment Score Calculation
-- ═══════════════════════════════════════════════════════════════

-- Calculate weighted enrichment score for a corridor
CREATE OR REPLACE FUNCTION calculate_corridor_enrichment_score(p_corridor_id text)
RETURNS TABLE (
    source_id text,
    source_label text,
    element text,
    signal_count bigint,
    avg_truth numeric,
    enrichment_weight numeric,
    weighted_contribution numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.source_id,
        src.label,
        src.element,
        COUNT(*)::bigint as signal_count,
        ROUND(AVG(s.truth_score), 3) as avg_truth,
        -- Weight by source priority (1=highest, 5=lowest)
        (6 - src.priority)::numeric / 15.0 as enrichment_weight,
        ROUND(AVG(s.truth_score) * ((6 - src.priority)::numeric / 15.0), 3) as weighted_contribution
    FROM poe_external_api_signals s
    JOIN poe_external_api_sources src ON s.source_id = src.source_id
    WHERE s.corridor_id = p_corridor_id
        AND s.source_role = 'ENRICHMENT'
        AND s.observed_at > NOW() - INTERVAL '7 days'
    GROUP BY s.source_id, src.label, src.element, src.priority
    ORDER BY weighted_contribution DESC;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- 6. Trigger: Auto-update corridor enrichment cache
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_corridor_enrichment_cache()
RETURNS TRIGGER AS $$
BEGIN
    -- Update corridor's enrichment signal count
    UPDATE corridor_definitions
    SET live_signal_count = (
        SELECT COUNT(DISTINCT signal_id) 
        FROM poe_external_api_signals 
        WHERE corridor_id = NEW.corridor_id
            AND source_role = 'ENRICHMENT'
            AND observed_at > NOW() - INTERVAL '7 days'
    )
    WHERE id = NEW.corridor_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_enrichment_cache
    AFTER INSERT ON poe_external_api_signals
    FOR EACH ROW
    WHEN (NEW.source_role = 'ENRICHMENT')
    EXECUTE FUNCTION update_corridor_enrichment_cache();

-- ═══════════════════════════════════════════════════════════════
-- 7. Documentation
-- ═══════════════════════════════════════════════════════════════

COMMENT ON TABLE poe_external_api_sources IS 
    'Registry of public API sources with role classification (ENRICHMENT, REFERENCE_BASELINE, VALIDATION_AUXILIARY)';

COMMENT ON TABLE poe_external_api_signals IS 
    'Normalized signals from public APIs. Rule: ENRICHMENT sources never activate corridors alone.';

COMMENT ON COLUMN poe_external_api_signals.truth_score IS 
    'Public API truth floor (0.58-0.82). Never exceeds primary signal sources (DHIS2, ACLED=0.80+)';

COMMENT ON COLUMN poe_external_api_signals.source_role IS 
    'ENRICHMENT: auxiliary only. REFERENCE_BASELINE: historical context. VALIDATION_AUXILIARY: geocoding/GIS.';
