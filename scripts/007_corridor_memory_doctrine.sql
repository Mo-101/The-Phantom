-- ============================================================
-- Migration 007: Phantom Corridor Memory Doctrine v1
-- 
-- A corridor is not an event.
-- A corridor is a memory-bearing geographic intelligence object.
-- 
-- Signal → Activation → Corridor Memory → Reactivation → Institutional Knowledge
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- LAYER 1 — Extended Corridor States (6-State Memory Model)
-- ═══════════════════════════════════════════════════════════════

-- Add state columns to corridor_definitions
ALTER TABLE corridor_definitions
    DROP COLUMN IF EXISTS mode,
    DROP COLUMN IF EXISTS evidence_class;

ALTER TABLE corridor_definitions
    ADD COLUMN IF NOT EXISTS state text DEFAULT 'HYPOTHESIS',
    ADD COLUMN IF NOT EXISTS previous_state text,
    ADD COLUMN IF NOT EXISTS state_changed_at timestamptz DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS evidence_class text DEFAULT 'MODEL_INFERRED';

-- Constraints for valid states
ALTER TABLE corridor_definitions
    DROP CONSTRAINT IF EXISTS valid_corridor_state;

ALTER TABLE corridor_definitions
    ADD CONSTRAINT valid_corridor_state
    CHECK (state IN ('REFERENCE', 'HYPOTHESIS', 'REALTIME', 'HYBRID', 'FIELD_CONFIRMED', 'ARCHIVED'));

-- Constraints for valid evidence classes
ALTER TABLE corridor_definitions
    DROP CONSTRAINT IF EXISTS valid_evidence_class_v2;

ALTER TABLE corridor_definitions
    ADD CONSTRAINT valid_evidence_class_v2
    CHECK (evidence_class IN ('HISTORICAL_BASELINE', 'LIVE_SIGNAL', 'FIELD_CONFIRMED', 'MODEL_INFERRED', 'HYPOTHESIS'));

-- Add temporal tracking
ALTER TABLE corridor_definitions
    ADD COLUMN IF NOT EXISTS first_observed_at timestamptz DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS last_live_signal_at timestamptz,
    ADD COLUMN IF NOT EXISTS activation_started_at timestamptz,
    ADD COLUMN IF NOT EXISTS expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS archived_at timestamptz,
    ADD COLUMN IF NOT EXISTS live_signal_count integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_historical_signals integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS activation_count integer DEFAULT 0;

-- Add explainability fields
ALTER TABLE corridor_definitions
    ADD COLUMN IF NOT EXISTS activation_drivers text[],
    ADD COLUMN IF NOT EXISTS score_decomposition jsonb,
    ADD COLUMN IF NOT EXISTS review_required boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS sealed_by text,
    ADD COLUMN IF NOT EXISTS sealed_at timestamptz;

-- ═══════════════════════════════════════════════════════════════
-- LAYER 2 — Corridor Activation Hierarchy
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS corridor_activations (
    id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    activation_id         text        NOT NULL UNIQUE,
    corridor_id           text        NOT NULL REFERENCES corridor_definitions(id),
    sequence              integer     NOT NULL, -- 1st, 2nd, 3rd activation
    
    -- Temporal bounds
    started_at            timestamptz NOT NULL,
    ended_at              timestamptz,
    duration_hours        numeric(8,1),
    
    -- State at activation
    state                 text        NOT NULL,
    previous_state        text,
    
    -- Evidence snapshot
    signal_count          integer     DEFAULT 0,
    evidence_class        text        NOT NULL,
    
    -- Scores at activation
    corridor_score        numeric(4,3) NOT NULL,
    risk_class            text        NOT NULL,
    score_decomposition   jsonb,
    
    -- Drivers
    activation_drivers    text[],
    
    -- Baseline match (if applicable)
    matched_baseline_id   text,
    similarity_to_baseline numeric(4,3),
    
    -- Decay
    decayed_at            timestamptz,
    decay_reason          text,     -- 'STALE', 'MANUAL', 'SUPERSEDED'
    
    -- Governance
    sealed_at             timestamptz NOT NULL DEFAULT NOW(),
    sealed_by             text,
    
    created_at            timestamptz DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- LAYER 3 — Extended Match Intelligence
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS corridor_baseline_matches (
    id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id              text        NOT NULL UNIQUE,
    
    -- References
    corridor_id           text        NOT NULL REFERENCES corridor_definitions(id),
    baseline_id           text        NOT NULL REFERENCES corridor_baselines(baseline_id),
    
    -- Similarity dimensions
    similarity            numeric(4,3) NOT NULL,
    spatial_similarity    numeric(4,3),
    disease_similarity    numeric(4,3),
    temporal_similarity   numeric(4,3),
    activation_history_similarity numeric(4,3),
    
    -- Algorithm versioning
    scoring_algorithm_version text,
    computed_at           timestamptz NOT NULL,
    
    -- Decision
    decision              text        NOT NULL,
    confidence            numeric(4,3),
    
    -- Historical context
    baseline_activation_count integer,
    baseline_last_activation timestamptz,
    baseline_typical_seasons text[],
    
    -- Thresholds applied
    hybrid_threshold      numeric(4,3) DEFAULT 0.70,
    realtime_threshold  numeric(4,3) DEFAULT 0.55,
    hypothesis_threshold  numeric(4,3) DEFAULT 0.30,
    
    -- Processing
    processed             boolean     DEFAULT false,
    processed_at          timestamptz,
    applied_to_corridor   boolean     DEFAULT false,
    
    created_at            timestamptz DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- LAYER 7 — State Transition Governance
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS corridor_state_transitions (
    id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    transition_id         text        NOT NULL UNIQUE,
    corridor_id           text        NOT NULL REFERENCES corridor_definitions(id),
    
    -- Transition details
    previous_state        text        NOT NULL,
    new_state             text        NOT NULL,
    transitioned_at       timestamptz NOT NULL DEFAULT NOW(),
    
    -- Trigger source
    triggered_by          text        NOT NULL, -- 'live_match', 'threshold_crossed', 'field_report', 'decay', 'system'
    
    -- MoScript that triggered
    triggered_by_script   text,
    
    -- Validation
    is_legal_transition   boolean     DEFAULT true,
    required_admin_override boolean DEFAULT false,
    
    -- Context
    match_id              text        REFERENCES corridor_baseline_matches(match_id),
    field_report_id       text,
    
    -- Notes
    notes                 text,
    
    created_at            timestamptz DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- LAYER 5 — Explainability Cache
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS corridor_explainability_cache (
    id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    corridor_id           text        NOT NULL REFERENCES corridor_definitions(id),
    computed_at           timestamptz NOT NULL DEFAULT NOW(),
    
    -- Why?
    activation_drivers    text[],
    driver_weights        jsonb,
    
    -- How? (8-Soul Scoring)
    soul_scores           jsonb,      -- {gravity, diffusion, centrality, hmm, seasonal, linguistic, entropy, friction}
    
    -- Compared To What?
    baseline_comparison   jsonb,      -- {baselineId, baselineName, similarity, comparedAt}
    
    -- Signal provenance
    signal_breakdown      jsonb,      -- {acled, dtm, dhis2, sentinel, manual}
    
    -- Uncertainty
    confidence_intervals  jsonb,      -- {scoreLower, scoreUpper, predictionHorizon}
    
    -- Cache invalidation
    valid_until           timestamptz,
    invalidated_at        timestamptz,
    
    created_at            timestamptz DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- Indexes for Performance
-- ═══════════════════════════════════════════════════════════════

-- State-based queries
CREATE INDEX IF NOT EXISTS idx_corridors_state 
    ON corridor_definitions(state, state_changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_corridors_expires 
    ON corridor_definitions(expires_at) 
    WHERE state IN ('REALTIME', 'HYBRID', 'HYPOTHESIS');

-- Activation hierarchy
CREATE INDEX IF NOT EXISTS idx_activations_corridor 
    ON corridor_activations(corridor_id, sequence DESC);

CREATE INDEX IF NOT EXISTS idx_activations_state 
    ON corridor_activations(state, started_at DESC);

-- Match intelligence
CREATE INDEX IF NOT EXISTS idx_matches_corridor_baseline 
    ON corridor_baseline_matches(corridor_id, baseline_id);

CREATE INDEX IF NOT EXISTS idx_matches_decision 
    ON corridor_baseline_matches(decision, confidence DESC);

CREATE INDEX IF NOT EXISTS idx_matches_unprocessed 
    ON corridor_baseline_matches(processed, computed_at) 
    WHERE processed = false;

-- State transitions (audit)
CREATE INDEX IF NOT EXISTS idx_transitions_corridor 
    ON corridor_state_transitions(corridor_id, transitioned_at DESC);

CREATE INDEX IF NOT EXISTS idx_transitions_legal 
    ON corridor_state_transitions(is_legal_transition, triggered_by) 
    WHERE is_legal_transition = false;

-- Explainability
CREATE INDEX IF NOT EXISTS idx_explainability_corridor 
    ON corridor_explainability_cache(corridor_id, computed_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- Views for Operational Dashboards
-- ═══════════════════════════════════════════════════════════════

-- Corridor Memory Overview (6-State Model)
CREATE OR REPLACE VIEW v_corridor_memory_overview AS
SELECT 
    state,
    COUNT(*) as count,
    ROUND(AVG(corridor_score), 2) as avg_score,
    SUM(live_signal_count) as total_live_signals,
    SUM(activation_count) as total_activations,
    MIN(first_observed_at) as oldest_corridor,
    MAX(last_live_signal_at) as most_recent_activity
FROM corridor_definitions
GROUP BY state
ORDER BY 
    CASE state
        WHEN 'FIELD_CONFIRMED' THEN 1
        WHEN 'HYBRID' THEN 2
        WHEN 'REALTIME' THEN 3
        WHEN 'HYPOTHESIS' THEN 4
        WHEN 'REFERENCE' THEN 5
        WHEN 'ARCHIVED' THEN 6
    END;

-- Active corridors with expiration warnings
CREATE OR REPLACE VIEW v_corridor_staleness_dashboard AS
SELECT 
    cd.id,
    cd.canonical_name,
    cd.state,
    cd.last_live_signal_at,
    cd.expires_at,
    EXTRACT(EPOCH FROM (cd.expires_at - NOW())) / 3600 as hours_until_expiry,
    CASE
        WHEN cd.expires_at < NOW() THEN 'EXPIRED'
        WHEN cd.expires_at < NOW() + INTERVAL '24 hours' THEN 'CRITICAL'
        WHEN cd.expires_at < NOW() + INTERVAL '48 hours' THEN 'WARNING'
        ELSE 'HEALTHY'
    END as staleness_status,
    cd.live_signal_count,
    cd.activation_count
FROM corridor_definitions cd
WHERE cd.state IN ('REALTIME', 'HYBRID', 'HYPOTHESIS')
ORDER BY cd.expires_at;

-- Corridor activation timeline
CREATE OR REPLACE VIEW v_corridor_activation_timeline AS
SELECT 
    ca.corridor_id,
    cd.canonical_name,
    ca.sequence as activation_number,
    ca.state as activation_state,
    ca.started_at,
    ca.ended_at,
    ca.duration_hours,
    ca.corridor_score,
    ca.risk_class,
    ca.matched_baseline_id,
    ca.similarity_to_baseline,
    ca.activation_drivers,
    ca.decayed_at IS NOT NULL as was_decayed
FROM corridor_activations ca
JOIN corridor_definitions cd ON ca.corridor_id = cd.id
ORDER BY ca.corridor_id, ca.sequence DESC;

-- Illegal state transitions (for audit)
CREATE OR REPLACE VIEW v_illegal_state_transitions AS
SELECT 
    cst.*,
    cd.canonical_name,
    cd.state as current_state
FROM corridor_state_transitions cst
JOIN corridor_definitions cd ON cst.corridor_id = cd.id
WHERE cst.is_legal_transition = false
ORDER BY cst.transitioned_at DESC;

-- Pending hypothesis upgrades
CREATE OR REPLACE VIEW v_pending_hypothesis_upgrades AS
SELECT 
    cd.id,
    cd.canonical_name,
    cd.state,
    cd.live_signal_count,
    cd.score_decomposition->>'composite' as composite_score,
    cmbm.decision,
    cmbm.confidence,
    cmbm.baseline_id as potential_match
FROM corridor_definitions cd
LEFT JOIN corridor_baseline_matches cmbm ON cd.id = cmbm.corridor_id
WHERE cd.state = 'HYPOTHESIS'
    AND cmbm.processed = false
    AND cmbm.decision IN ('HYBRID_REACTIVATION', 'NEW_REALTIME_CORRIDOR')
ORDER BY cmbm.confidence DESC;

-- ═══════════════════════════════════════════════════════════════
-- Triggers for State Governance
-- ═══════════════════════════════════════════════════════════════

-- Validate legal state transitions
CREATE OR REPLACE FUNCTION validate_state_transition()
RETURNS TRIGGER AS $$
DECLARE
    legal_transitions text[];
BEGIN
    -- Define legal transitions
    legal_transitions := CASE OLD.state
        WHEN 'REFERENCE' THEN ARRAY['HYPOTHESIS', 'HYBRID']
        WHEN 'HYPOTHESIS' THEN ARRAY['REALTIME', 'HYBRID', 'ARCHIVED']
        WHEN 'REALTIME' THEN ARRAY['HYBRID', 'FIELD_CONFIRMED', 'ARCHIVED']
        WHEN 'HYBRID' THEN ARRAY['FIELD_CONFIRMED', 'ARCHIVED']
        WHEN 'FIELD_CONFIRMED' THEN ARRAY['ARCHIVED']
        WHEN 'ARCHIVED' THEN ARRAY[]::text[]
        ELSE ARRAY[]::text[]
    END;
    
    -- Check if transition is legal
    IF NOT NEW.state = ANY(legal_transitions) AND OLD.state IS DISTINCT FROM NEW.state THEN
        -- Log illegal transition attempt
        INSERT INTO corridor_state_transitions (
            transition_id, corridor_id, previous_state, new_state,
            triggered_by, is_legal_transition, notes
        ) VALUES (
            gen_random_uuid()::text,
            NEW.id,
            OLD.state,
            NEW.state,
            COALESCE(TG_ARGV[0], 'unknown'),
            false,
            'ILLEGAL TRANSITION ATTEMPTED - Requires admin override'
        );
        
        -- Block the transition unless admin override flag is set
        IF NOT (NEW.review_required = true AND NEW.sealed_by LIKE 'admin:%') THEN
            RAISE EXCEPTION 'Illegal state transition: % → %. Legal: %', 
                OLD.state, NEW.state, array_to_string(legal_transitions, ', ');
        END IF;
    END IF;
    
    -- Record legal transition
    IF OLD.state IS DISTINCT FROM NEW.state THEN
        INSERT INTO corridor_state_transitions (
            transition_id, corridor_id, previous_state, new_state,
            triggered_by, is_legal_transition
        ) VALUES (
            gen_random_uuid()::text,
            NEW.id,
            OLD.state,
            NEW.state,
            COALESCE(TG_ARGV[0], 'system'),
            true
        );
        
        -- Update previous_state and timestamp
        NEW.previous_state := OLD.state;
        NEW.state_changed_at := NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_state_transition
    BEFORE UPDATE ON corridor_definitions
    FOR EACH ROW
    EXECUTE FUNCTION validate_state_transition();

-- Auto-create activation record on state change to active state
CREATE OR REPLACE FUNCTION create_activation_on_state_change()
RETURNS TRIGGER AS $$
DECLARE
    activating_states text[] := ARRAY['REALTIME', 'HYBRID', 'FIELD_CONFIRMED'];
    new_sequence integer;
BEGIN
    -- Check if transitioning TO an activating state
    IF NEW.state = ANY(activating_states) AND 
       (OLD.state IS NULL OR NOT OLD.state = ANY(activating_states)) THEN
        
        -- Get next sequence number
        SELECT COALESCE(MAX(sequence), 0) + 1 
        INTO new_sequence 
        FROM corridor_activations 
        WHERE corridor_id = NEW.id;
        
        -- Create activation record
        INSERT INTO corridor_activations (
            activation_id, corridor_id, sequence, started_at,
            state, previous_state, signal_count, evidence_class,
            corridor_score, risk_class, activation_drivers, sealed_by
        ) VALUES (
            'ACT-' || NEW.id || '-' || new_sequence,
            NEW.id,
            new_sequence,
            NOW(),
            NEW.state,
            OLD.state,
            NEW.live_signal_count,
            NEW.evidence_class,
            NEW.corridor_score,
            NEW.risk_class,
            NEW.activation_drivers,
            NEW.sealed_by
        );
        
        -- Update activation count on corridor
        NEW.activation_count := new_sequence;
        NEW.activation_started_at := NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_activation
    BEFORE UPDATE ON corridor_definitions
    FOR EACH ROW
    EXECUTE FUNCTION create_activation_on_state_change();

-- ═══════════════════════════════════════════════════════════════
-- Seed Data: Reference the Historical Baseline
-- ═══════════════════════════════════════════════════════════════

-- Update the Lake Victoria corridor to proper REFERENCE state
UPDATE corridor_definitions SET
    state = 'REFERENCE',
    evidence_class = 'HISTORICAL_BASELINE',
    previous_state = NULL,
    state_changed_at = NOW(),
    first_observed_at = '2018-01-01T00:00:00Z',
    last_live_signal_at = '2024-04-15T00:00:00Z',
    activation_count = 4,  -- 2018, 2019, 2021, 2024
    total_historical_signals = 47,
    live_signal_count = 0,
    activation_drivers = ARRAY['cholera_cluster', 'population_displacement', 'historical_reactivation'],
    score_decomposition = '{"gravity": 0.82, "diffusion": 0.71, "hmm": 0.77, "entropy": 0.61}'::jsonb,
    review_required = false,
    sealed_by = 'system:doctrine-v1',
    sealed_at = NOW()
WHERE id = 'CORRIDOR-KE-TZ-047';

-- Insert activation history for Lake Victoria corridor
INSERT INTO corridor_activations (
    activation_id, corridor_id, sequence, started_at, ended_at, duration_hours,
    state, previous_state, signal_count, evidence_class, corridor_score, risk_class,
    activation_drivers, matched_baseline_id, similarity_to_baseline, sealed_by
) VALUES
    ('ACT-CORRIDOR-KE-TZ-047-1', 'CORRIDOR-KE-TZ-047', 1, '2018-03-15T00:00:00Z', '2018-05-20T00:00:00Z', 1536, 'REALTIME', 'HYPOTHESIS', 12, 'LIVE_SIGNAL', 0.78, 'HIGH', ARRAY['cholera_cluster'], NULL, NULL, 'system:historical'),
    ('ACT-CORRIDOR-KE-TZ-047-2', 'CORRIDOR-KE-TZ-047', 2, '2019-04-10T00:00:00Z', '2019-06-15T00:00:00Z', 1536, 'HYBRID', 'REFERENCE', 15, 'LIVE_SIGNAL', 0.81, 'HIGH', ARRAY['cholera_cluster', 'historical_reactivation'], 'BASELINE-KE-TZ-001', 0.85, 'system:historical'),
    ('ACT-CORRIDOR-KE-TZ-047-3', 'CORRIDOR-KE-TZ-047', 3, '2021-02-20T00:00:00Z', '2021-04-30T00:00:00Z', 1632, 'HYBRID', 'REFERENCE', 18, 'LIVE_SIGNAL', 0.83, 'HIGH', ARRAY['cholera_cluster', 'historical_reactivation'], 'BASELINE-KE-TZ-001', 0.87, 'system:historical'),
    ('ACT-CORRIDOR-KE-TZ-047-4', 'CORRIDOR-KE-TZ-047', 4, '2024-03-01T00:00:00Z', '2024-05-15T00:00:00Z', 1752, 'FIELD_CONFIRMED', 'HYBRID', 22, 'FIELD_CONFIRMED', 0.85, 'HIGH', ARRAY['cholera_cluster', 'population_displacement', 'historical_reactivation'], 'BASELINE-KE-TZ-001', 0.89, 'system:historical')
ON CONFLICT (activation_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- Documentation
-- ═══════════════════════════════════════════════════════════════

COMMENT ON TABLE corridor_activations IS 
    'Memory nodes: Each activation of a corridor is a persistent record in the activation hierarchy';

COMMENT ON TABLE corridor_state_transitions IS 
    'Audit trail of all state changes with governance validation (Layer 7)';

COMMENT ON TABLE corridor_baseline_matches IS 
    'Extended match intelligence including activation history similarity (Layer 3)';

COMMENT ON TABLE corridor_explainability_cache IS 
    'Cached explainability data: Why, How, Compared To What (Layer 5)';

COMMENT ON COLUMN corridor_definitions.state IS 
    '6-State Memory Model: REFERENCE, HYPOTHESIS, REALTIME, HYBRID, FIELD_CONFIRMED, ARCHIVED';

COMMENT ON COLUMN corridor_definitions.activation_count IS 
    'Number of times this corridor has been activated (for activation history similarity)';
