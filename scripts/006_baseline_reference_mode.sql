-- ============================================================
-- Migration 006: Baseline Reference Mode
-- Two-Mode System: REFERENCE vs REALTIME vs HYBRID
-- Makes Phantom honest about historical vs live detection
-- ============================================================

-- Add mode and evidence classification to corridor_definitions
ALTER TABLE corridor_definitions
    ADD COLUMN IF NOT EXISTS mode text DEFAULT 'REALTIME',
    ADD COLUMN IF NOT EXISTS evidence_class text DEFAULT 'LIVE_SIGNAL',
    ADD COLUMN IF NOT EXISTS is_baseline boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS archived_at timestamptz,
    ADD COLUMN IF NOT EXISTS live_activated_at timestamptz,
    ADD COLUMN IF NOT EXISTS historical_disease_pattern text[],
    ADD COLUMN IF NOT EXISTS typical_seasons text[],
    ADD COLUMN IF NOT EXISTS last_historical_activity timestamptz;

-- Create constraint for valid modes
ALTER TABLE corridor_definitions
    DROP CONSTRAINT IF EXISTS valid_corridor_mode;

ALTER TABLE corridor_definitions
    ADD CONSTRAINT valid_corridor_mode 
    CHECK (mode IN ('REFERENCE', 'REALTIME', 'HYBRID'));

-- Create constraint for valid evidence classes
ALTER TABLE corridor_definitions
    DROP CONSTRAINT IF NOT EXISTS valid_evidence_class;

ALTER TABLE corridor_definitions
    ADD CONSTRAINT valid_evidence_class
    CHECK (evidence_class IN ('HISTORICAL_BASELINE', 'LIVE_SIGNAL', 'FIELD_CONFIRMED', 'MODEL_INFERRED'));

-- Add columns to corridor_scores for mode tracking
ALTER TABLE corridor_scores
    ADD COLUMN IF NOT EXISTS mode text DEFAULT 'REALTIME',
    ADD COLUMN IF NOT EXISTS evidence_class text DEFAULT 'LIVE_SIGNAL',
    ADD COLUMN IF NOT EXISTS matched_baseline_id text,
    ADD COLUMN IF NOT EXISTS similarity_to_baseline numeric(4,3),
    ADD COLUMN IF NOT EXISTS historical_reactivation boolean DEFAULT false;

-- Create table for historical baseline corridors (separate archive)
CREATE TABLE IF NOT EXISTS corridor_baselines (
    id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    baseline_id           text        NOT NULL UNIQUE,
    corridor_id           text        NOT NULL,
    
    -- Identity
    name                  text        NOT NULL,
    description           text,
    
    -- Geography
    start_node            text        NOT NULL,
    end_node              text        NOT NULL,
    start_coord_lat       numeric(10,6) NOT NULL,
    start_coord_lng       numeric(10,6) NOT NULL,
    end_coord_lat         numeric(10,6) NOT NULL,
    end_coord_lng         numeric(10,6) NOT NULL,
    
    -- Mode (always REFERENCE for this table)
    mode                  text        NOT NULL DEFAULT 'REFERENCE',
    evidence_class        text        NOT NULL DEFAULT 'HISTORICAL_BASELINE',
    
    -- Historical profile
    baseline_score        numeric(3,2),
    historical_risk_class text        NOT NULL,
    typical_seasons       text[],
    last_historical_activity timestamptz,
    historical_disease_pattern text[],
    
    -- Metadata
    archived_at           timestamptz NOT NULL DEFAULT NOW(),
    archived_by           text,
    notes                 text,
    
    created_at            timestamptz DEFAULT NOW(),
    updated_at            timestamptz DEFAULT NOW()
);

-- Create table for live-to-baseline match tracking
CREATE TABLE IF NOT EXISTS corridor_live_baseline_matches (
    id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id              text        NOT NULL UNIQUE,
    
    -- References
    live_signal_id        text        NOT NULL,
    baseline_corridor_id  text        NOT NULL REFERENCES corridor_baselines(baseline_id),
    
    -- Match metrics
    similarity            numeric(4,3) NOT NULL,  -- 0.0 to 1.0
    distance_km           numeric(8,2),
    spatial_overlap       numeric(4,3),
    temporal_alignment  numeric(4,3),
    disease_match         boolean     DEFAULT false,
    
    -- Activation decision
    reactivates_historical boolean    DEFAULT false,
    recommended_mode      text        NOT NULL,
    confidence            numeric(4,3),
    
    -- Status
    processed             boolean     DEFAULT false,
    processed_at          timestamptz,
    
    matched_at            timestamptz DEFAULT NOW(),
    created_at            timestamptz DEFAULT NOW()
);

-- Create table for mode transition history (audit trail)
CREATE TABLE IF NOT EXISTS corridor_mode_history (
    id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    transition_id         text        NOT NULL UNIQUE,
    corridor_id           text        NOT NULL,
    
    -- Transition details
    previous_mode         text        NOT NULL,
    new_mode              text        NOT NULL,
    triggered_by          text        NOT NULL,  -- 'live_match', 'field_confirmation', 'manual', 'system'
    
    -- Match reference (if applicable)
    match_id              text        REFERENCES corridor_live_baseline_matches(match_id),
    
    -- Metrics at transition
    similarity_at_transition numeric(4,3),
    confidence_at_transition numeric(4,3),
    live_signal_count     integer,
    
    -- Metadata
    transitioned_at       timestamptz NOT NULL DEFAULT NOW(),
    transitioned_by       text,
    notes                 text,
    
    created_at            timestamptz DEFAULT NOW()
);

-- ============================================================
-- Indexes for performance
-- ============================================================

-- Baseline corridor lookups
CREATE INDEX IF NOT EXISTS idx_baselines_mode 
    ON corridor_baselines(mode) 
    WHERE mode = 'REFERENCE';

CREATE INDEX IF NOT EXISTS idx_baselines_disease 
    ON corridor_baselines USING GIN(historical_disease_pattern);

CREATE INDEX IF NOT EXISTS idx_baselines_season 
    ON corridor_baselines USING GIN(typical_seasons);

-- Live-to-baseline match queries
CREATE INDEX IF NOT EXISTS idx_matches_baseline 
    ON corridor_live_baseline_matches(baseline_corridor_id, processed);

CREATE INDEX IF NOT EXISTS idx_matches_similarity 
    ON corridor_live_baseline_matches(similarity DESC) 
    WHERE reactivates_historical = true;

CREATE INDEX IF NOT EXISTS idx_matches_unprocessed 
    ON corridor_live_baseline_matches(processed, created_at) 
    WHERE processed = false;

-- Mode history audit queries
CREATE INDEX IF NOT EXISTS idx_mode_history_corridor 
    ON corridor_mode_history(corridor_id, transitioned_at DESC);

-- ============================================================
-- Views for operational dashboards
-- ============================================================

-- Active reference corridors (historical baseline)
CREATE OR REPLACE VIEW v_reference_corridors AS
SELECT 
    cb.*,
    cb.baseline_score as reference_score,
    'Historical baseline corridor - awaiting live confirmation' as ui_status
FROM corridor_baselines cb
WHERE cb.mode = 'REFERENCE'
ORDER BY cb.baseline_score DESC;

-- Hybrid corridors (reactivated historical)
CREATE OR REPLACE VIEW v_hybrid_corridors AS
SELECT 
    cd.*,
    cb.baseline_id as original_baseline_id,
    cb.baseline_score as historical_score,
    cd.score as live_score,
    'Historical corridor reactivated by live evidence' as ui_status
FROM corridor_definitions cd
LEFT JOIN corridor_baselines cb ON cd.matched_baseline_id = cb.baseline_id
WHERE cd.mode = 'HYBRID'
ORDER BY cd.live_activated_at DESC;

-- New realtime corridors (no historical match)
CREATE OR REPLACE VIEW v_realtime_corridors AS
SELECT 
    cd.*,
    'New corridor detected from live signals' as ui_status
FROM corridor_definitions cd
WHERE cd.mode = 'REALTIME' 
    AND cd.is_baseline = false
ORDER BY cd.created_at DESC;

-- Corridor mode summary dashboard
CREATE OR REPLACE VIEW v_corridor_mode_summary AS
SELECT 
    mode,
    evidence_class,
    COUNT(*) as count,
    ROUND(AVG(score), 2) as avg_score,
    MIN(created_at) as oldest,
    MAX(created_at) as newest
FROM corridor_definitions
GROUP BY mode, evidence_class;

-- Pending reactivations (reference corridors with recent live matches)
CREATE OR REPLACE VIEW v_pending_reactivations AS
SELECT 
    cb.baseline_id,
    cb.name as corridor_name,
    cb.baseline_score,
    cb.historical_risk_class,
    COUNT(clbm.match_id) as recent_matches,
    MAX(clbm.similarity) as best_similarity,
    MAX(clbm.matched_at) as last_match_at,
    'Strong historical pattern with recent live signals - candidate for HYBRID' as recommendation
FROM corridor_baselines cb
JOIN corridor_live_baseline_matches clbm 
    ON cb.baseline_id = clbm.baseline_corridor_id
WHERE cb.mode = 'REFERENCE'
    AND clbm.processed = false
    AND clbm.similarity > 0.70
GROUP BY cb.baseline_id, cb.name, cb.baseline_score, cb.historical_risk_class
HAVING COUNT(clbm.match_id) >= 2
ORDER BY best_similarity DESC, recent_matches DESC;

-- ============================================================
-- Triggers for mode transition audit
-- ============================================================

-- Auto-log mode transitions on corridor_definitions update
CREATE OR REPLACE FUNCTION log_corridor_mode_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if mode actually changed
    IF OLD.mode IS DISTINCT FROM NEW.mode THEN
        INSERT INTO corridor_mode_history (
            transition_id,
            corridor_id,
            previous_mode,
            new_mode,
            triggered_by,
            similarity_at_transition,
            confidence_at_transition,
            live_signal_count,
            notes
        ) VALUES (
            gen_random_uuid()::text,
            NEW.id,
            COALESCE(OLD.mode, 'UNKNOWN'),
            NEW.mode,
            CASE 
                WHEN NEW.mode = 'HYBRID' AND OLD.mode = 'REFERENCE' THEN 'live_match'
                WHEN NEW.mode = 'REALTIME' THEN 'new_detection'
                ELSE 'system'
            END,
            NEW.similarity_to_baseline,
            NEW.score,
            NEW.signal_count,
            CASE
                WHEN NEW.mode = 'HYBRID' THEN 'Historical corridor reactivated by live evidence'
                WHEN NEW.mode = 'REALTIME' AND OLD.mode = 'REFERENCE' THEN 'Live signals do not match historical pattern - treating as new corridor'
                ELSE 'Mode transition logged'
            END
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_mode_transition
    AFTER UPDATE ON corridor_definitions
    FOR EACH ROW
    WHEN (OLD.mode IS DISTINCT FROM NEW.mode)
    EXECUTE FUNCTION log_corridor_mode_transition();

-- ============================================================
-- Seed historical baseline: Lake Victoria Cholera Pattern
-- ============================================================

INSERT INTO corridor_baselines (
    baseline_id,
    corridor_id,
    name,
    description,
    start_node,
    end_node,
    start_coord_lat,
    start_coord_lng,
    end_coord_lat,
    end_coord_lng,
    mode,
    evidence_class,
    baseline_score,
    historical_risk_class,
    typical_seasons,
    last_historical_activity,
    historical_disease_pattern,
    archived_by,
    notes
) VALUES (
    'BASELINE-KE-TZ-001',
    'CORRIDOR-KE-TZ-047',
    'Lake Victoria Basin / Lwanda → Bunda',
    'Historical cholera transmission corridor between Kenya and Tanzania lake shore communities',
    'Lwanda',
    'Bunda',
    -0.1000,
    34.7500,
    -1.8500,
    33.8000,
    'REFERENCE',
    'HISTORICAL_BASELINE',
    0.85,
    'HIGH',
    ARRAY['wet', 'recession'],
    '2024-04-15T00:00:00Z',
    ARRAY['CHOLERA'],
    'system',
    'Archived historical pattern. Re-activates during wet seasons when sanitation infrastructure is compromised.'
) ON CONFLICT (baseline_id) DO NOTHING;

-- ============================================================
-- Documentation
-- ============================================================

COMMENT ON TABLE corridor_baselines IS 
    'Historical corridor patterns in REFERENCE mode - used for comparison and reactivation detection';

COMMENT ON TABLE corridor_live_baseline_matches IS 
    'Tracks matches between live signals and historical baseline corridors';

COMMENT ON TABLE corridor_mode_history IS 
    'Audit trail of all corridor mode transitions (REFERENCE → HYBRID → REALTIME)';

COMMENT ON COLUMN corridor_definitions.mode IS 
    'Corridor classification: REFERENCE (historical only), REALTIME (live only), HYBRID (reactivated historical)';

COMMENT ON COLUMN corridor_definitions.evidence_class IS 
    'Source of evidence: HISTORICAL_BASELINE, LIVE_SIGNAL, FIELD_CONFIRMED, MODEL_INFERRED';
