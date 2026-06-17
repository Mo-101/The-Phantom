-- ============================================================
-- Migration 005: Operational Hardening Layer
-- Institution-grade feedback loops for Phantom POE
-- ============================================================

-- field_validation_outcomes: Ground truth feedback from field teams
CREATE TABLE IF NOT EXISTS field_validation_outcomes (
    id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    validation_id         text        NOT NULL UNIQUE,
    corridor_id           text        NOT NULL REFERENCES corridor_definitions(id),
    field_outcome         text        NOT NULL,  -- 'true_positive', 'false_positive', 'true_negative', 'false_negative', 'uncertain'
    analyst_notes         text,
    ground_truth_date     timestamptz NOT NULL,
    recalibration_required boolean   DEFAULT false,
    
    -- Proposed model adjustments (when recalibration_required=true)
    proposed_weight_deltas  jsonb,
    proposed_floor_delta    numeric(4,3),
    
    -- Resolution tracking
    review_status           text        DEFAULT 'pending',  -- 'pending', 'accepted', 'rejected', 'implemented'
    reviewed_by             text,
    reviewed_at             timestamptz,
    implemented_at          timestamptz,
    
    created_at              timestamptz DEFAULT NOW()
);

-- drift_watch_results: Model drift detection every 30 minutes
CREATE TABLE IF NOT EXISTS drift_watch_results (
    id                      uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    drift_id                text        NOT NULL UNIQUE,
    computed_at             timestamptz NOT NULL,
    
    -- Time windows compared
    baseline_start          timestamptz NOT NULL,
    baseline_end            timestamptz NOT NULL,
    current_start           timestamptz NOT NULL,
    current_end             timestamptz NOT NULL,
    
    -- Drift metrics
    drift_score             numeric(4,3) NOT NULL,  -- 0.0 to 1.0
    threshold               numeric(4,3) DEFAULT 0.25,
    action                  text        NOT NULL,  -- 'recalibrate', 'hold', 'alert'
    
    -- Affected sources and diseases
    affected_sources        text[],
    affected_diseases       text[],
    
    -- Drift dimensions
    mean_shift              numeric(6,4),
    variance_change         numeric(6,4),
    kl_divergence           numeric(6,4),  -- KL divergence for distribution shift
    
    -- Proposed recalibration (when action='recalibrate')
    proposed_new_floors     jsonb,
    
    created_at              timestamptz DEFAULT NOW()
);

-- weight_version_seals: Immutable audit trail for weight mutations
CREATE TABLE IF NOT EXISTS weight_version_seals (
    id                      uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    version_id              text        NOT NULL UNIQUE,
    sealed_at               timestamptz NOT NULL,
    approver                text        NOT NULL,
    approved                boolean     NOT NULL,
    requires_review         boolean     DEFAULT false,
    
    -- Weight changes
    old_weights             jsonb       NOT NULL,
    new_weights             jsonb       NOT NULL,
    weight_deltas           jsonb       NOT NULL,
    
    -- Disease-specific changes (if applicable)
    disease_specific_changes jsonb,
    
    -- Audit
    audit_hash              text        NOT NULL,
    
    -- Review workflow
    review_assigned_to      text,
    review_completed_at     timestamptz,
    review_resolution       text,       -- 'accepted', 'rejected', 'partial'
    
    created_at              timestamptz DEFAULT NOW()
);

-- counterfactual_test_results: Corridor robustness tests
CREATE TABLE IF NOT EXISTS counterfactual_test_results (
    id                      uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    test_id                 text        NOT NULL UNIQUE,
    corridor_id             text        NOT NULL REFERENCES corridor_definitions(id),
    removed_element         text        NOT NULL,  -- 'conflict', 'displacement', 'disease', 'terrain', 'linguistic'
    
    -- Scores
    original_score          numeric(3,2) NOT NULL,
    counterfactual_score    numeric(3,2) NOT NULL,
    activation_threshold    numeric(3,2) NOT NULL,
    still_active            boolean     NOT NULL,
    
    -- Impact analysis
    impact_ratio            numeric(4,3) NOT NULL,  -- counterfactual / original
    element_criticality     text        NOT NULL,  -- 'critical', 'significant', 'minor', 'negligible'
    
    -- Test metadata
    tested_at               timestamptz NOT NULL,
    tested_by               text,
    
    created_at              timestamptz DEFAULT NOW()
);

-- analyst_dissent_ledger: Structured analyst disagreement
CREATE TABLE IF NOT EXISTS analyst_dissent_ledger (
    id                      uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    dissent_id              text        NOT NULL UNIQUE,
    moment_id               text        NOT NULL,
    analyst_id              text        NOT NULL,
    
    -- Dissent details
    reason                  text        NOT NULL,
    severity                integer     NOT NULL CHECK (severity >= 1 AND severity <= 5),
    dissent_type            text        NOT NULL,  -- 'factual_error', 'interpretation', 'omission', 'bias', 'methodology', 'other'
    
    -- Review workflow
    requires_review         boolean     DEFAULT false,
    review_assigned_to      text,
    review_resolution       text,       -- 'accepted', 'rejected', 'partial', 'under_review'
    resolved_at             timestamptz,
    
    -- Training signal integration (for severity >= 4)
    queued_for_training     boolean     DEFAULT false,
    training_signal_id      text,
    model_retrained         boolean     DEFAULT false,
    
    sealed_at               timestamptz NOT NULL,
    created_at              timestamptz DEFAULT NOW()
);

-- recalibration_proposals: Queue for model adjustment proposals
CREATE TABLE IF NOT EXISTS recalibration_proposals (
    id                      uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    proposal_id             text        NOT NULL UNIQUE,
    proposal_type           text        NOT NULL,  -- 'field_validation', 'drift_watch', 'manual'
    source_id               text        NOT NULL,  -- References validation_id, drift_id, etc.
    
    -- Proposed changes
    proposed_changes        jsonb       NOT NULL,
    affected_corridors      text[],
    affected_diseases       text[],
    
    -- Review workflow
    status                  text        DEFAULT 'pending',  -- 'pending', 'under_review', 'approved', 'rejected', 'implemented'
    proposed_by             text,
    proposed_at             timestamptz DEFAULT NOW(),
    reviewed_by             text,
    reviewed_at             timestamptz,
    implemented_by          text,
    implemented_at          timestamptz,
    
    created_at              timestamptz DEFAULT NOW()
);

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_field_validation_corridor 
    ON field_validation_outcomes(corridor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_validation_outcome 
    ON field_validation_outcomes(field_outcome, recalibration_required) 
    WHERE recalibration_required = true;

CREATE INDEX IF NOT EXISTS idx_drift_watch_computed 
    ON drift_watch_results(computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_drift_watch_action 
    ON drift_watch_results(action, drift_score DESC) 
    WHERE action = 'recalibrate';

CREATE INDEX IF NOT EXISTS idx_weight_version_sealed 
    ON weight_version_seals(sealed_at DESC);
CREATE INDEX IF NOT EXISTS idx_weight_version_approval 
    ON weight_version_seals(approved, requires_review);

CREATE INDEX IF NOT EXISTS idx_counterfactual_corridor 
    ON counterfactual_test_results(corridor_id, tested_at DESC);
CREATE INDEX IF NOT EXISTS idx_counterfactual_criticality 
    ON counterfactual_test_results(element_criticality, impact_ratio DESC);

CREATE INDEX IF NOT EXISTS idx_dissent_moment 
    ON analyst_dissent_ledger(moment_id, severity DESC);
CREATE INDEX IF NOT EXISTS idx_dissent_training 
    ON analyst_dissent_ledger(queued_for_training, severity DESC) 
    WHERE queued_for_training = true;

-- ============================================================
-- Views for operational dashboards
-- ============================================================

-- Corridor validation summary (accuracy metrics)
CREATE OR REPLACE VIEW v_corridor_validation_summary AS
SELECT 
    corridor_id,
    COUNT(*) as total_validations,
    COUNT(*) FILTER (WHERE field_outcome = 'true_positive') as true_positives,
    COUNT(*) FILTER (WHERE field_outcome = 'false_positive') as false_positives,
    COUNT(*) FILTER (WHERE field_outcome = 'true_negative') as true_negatives,
    COUNT(*) FILTER (WHERE field_outcome = 'false_negative') as false_negatives,
    ROUND(
        COUNT(*) FILTER (WHERE field_outcome IN ('true_positive', 'true_negative')) * 100.0 / NULLIF(COUNT(*), 0),
        1
    ) as accuracy_pct,
    ROUND(
        COUNT(*) FILTER (WHERE field_outcome = 'false_positive') * 100.0 / NULLIF(COUNT(*), 0),
        1
    ) as false_positive_rate_pct
FROM field_validation_outcomes
GROUP BY corridor_id;

-- Model health dashboard (drift detection)
CREATE OR REPLACE VIEW v_model_health_dashboard AS
SELECT 
    date_trunc('hour', computed_at) as hour_bucket,
    COUNT(*) as drift_checks,
    COUNT(*) FILTER (WHERE action = 'recalibrate') as recalibrate_triggers,
    COUNT(*) FILTER (WHERE action = 'alert') as alert_triggers,
    AVG(drift_score) as avg_drift_score,
    MAX(drift_score) as max_drift_score,
    array_agg(DISTINCT unnested_source) FILTER (WHERE action = 'recalibrate') as sources_triggering_recal
FROM drift_watch_results,
LATERAL unnest(affected_sources) as unnested_source
GROUP BY date_trunc('hour', computed_at)
ORDER BY hour_bucket DESC;

-- Pending recalibration queue
CREATE OR REPLACE VIEW v_pending_recalibrations AS
SELECT 
    rp.*,
    fvo.corridor_id as validation_corridor,
    fvo.field_outcome,
    dwr.affected_sources as drift_sources
FROM recalibration_proposals rp
LEFT JOIN field_validation_outcomes fvo ON rp.source_id = fvo.validation_id
LEFT JOIN drift_watch_results dwr ON rp.source_id = dwr.drift_id
WHERE rp.status IN ('pending', 'under_review')
ORDER BY rp.proposed_at;

-- ============================================================
-- Triggers for workflow automation
-- ============================================================

-- Auto-create recalibration proposal from field validation
CREATE OR REPLACE FUNCTION create_recalibration_from_validation()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.recalibration_required AND NEW.review_status = 'pending' THEN
        INSERT INTO recalibration_proposals (
            proposal_id, proposal_type, source_id, proposed_changes, 
            affected_corridors, proposed_by, proposed_at
        ) VALUES (
            gen_random_uuid()::text,
            'field_validation',
            NEW.validation_id,
            jsonb_build_object(
                'weight_deltas', NEW.proposed_weight_deltas,
                'floor_delta', NEW.proposed_floor_delta
            ),
            ARRAY[NEW.corridor_id],
            'system_auto',
            NOW()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_recalibration_proposal
    AFTER INSERT ON field_validation_outcomes
    FOR EACH ROW
    EXECUTE FUNCTION create_recalibration_from_validation();

-- Auto-queue high-severity dissent for training
CREATE OR REPLACE FUNCTION queue_high_severity_dissent()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.severity >= 4 THEN
        NEW.queued_for_training := true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_queue_training
    BEFORE INSERT ON analyst_dissent_ledger
    FOR EACH ROW
    EXECUTE FUNCTION queue_high_severity_dissent();
