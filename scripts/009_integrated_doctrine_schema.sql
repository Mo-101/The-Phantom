-- ============================================================
-- Migration 009: Integrated Doctrine Schema
-- 
-- Phantom POE — Sealed State Machine v2.0
-- Core Rule: No corridor changes state unless a MoScript seals it.
-- No Fire activation becomes operational unless the TruthEngine approves it.
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. poe_signals (Raw Epidemiological Data)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS poe_signals (
  signal_id           text        PRIMARY KEY,
  source              text        NOT NULL,  -- 'DHIS2', 'ACLED', 'DTM', 'FIELD', 'PUBLIC_API'
  disease_code        text        NOT NULL,  -- 'CHOLERA', 'LASSA', 'MENINGITIS', etc.
  element             text        NOT NULL,  -- 'fire', 'water', 'air', 'earth'
  admin0              text        NOT NULL,  -- Country code
  admin1              text,                   -- State/Province
  admin2              text,                   -- LGA/District
  lat                 numeric(10,6),
  lng                 numeric(10,6),
  magnitude           numeric(10,4) NOT NULL,
  truth_score         numeric(3,2) NOT NULL,
  uncertainty         numeric(3,2) NOT NULL,
  reported_at         timestamptz NOT NULL,
  ingested_at         timestamptz DEFAULT NOW(),
  run_id              text        NOT NULL,
  raw_payload         jsonb       NOT NULL,
  created_at          timestamptz DEFAULT NOW(),
  CHECK (truth_score >= 0 AND truth_score <= 1),
  CHECK (uncertainty >= 0 AND uncertainty <= 1)
);

-- Indexes for poe_signals
CREATE INDEX IF NOT EXISTS idx_poe_signals_disease_time 
  ON poe_signals(disease_code, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_poe_signals_geo 
  ON poe_signals(lat, lng) 
  WHERE lat IS NOT NULL AND lng IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_poe_signals_source 
  ON poe_signals(source, truth_score DESC);
CREATE INDEX IF NOT EXISTS idx_poe_signals_element 
  ON poe_signals(element, truth_score DESC);

-- ═══════════════════════════════════════════════════════════════
-- 2. poe_corridor_signal (Corridor-Annotated Signals)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS poe_corridor_signal (
  id                  text        PRIMARY KEY,
  signal_id           text        NOT NULL REFERENCES poe_signals(signal_id) ON DELETE CASCADE,
  corridor_id         text        NOT NULL REFERENCES corridor_definitions(id),
  corridor_km         numeric(10,2),           -- Distance along corridor
  corridor_node_id    text,                   -- Nearest corridor node
  match_confidence    numeric(3,2) NOT NULL,  -- How well signal matches corridor
  temporal_relevance  numeric(3,2) NOT NULL,  -- Time decay factor
  composite_score     numeric(3,2) NOT NULL,  -- match_confidence * temporal_relevance * truth_score
  created_at          timestamptz DEFAULT NOW(),
  UNIQUE(signal_id, corridor_id),
  CHECK (match_confidence >= 0 AND match_confidence <= 1),
  CHECK (temporal_relevance >= 0 AND temporal_relevance <= 1),
  CHECK (composite_score >= 0 AND composite_score <= 1)
);

-- Indexes for poe_corridor_signal
CREATE INDEX IF NOT EXISTS idx_poe_corridor_signal_corridor 
  ON poe_corridor_signal(corridor_id, composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_poe_corridor_signal_time 
  ON poe_corridor_signal(created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- 3. corridor_activations (Memory Hierarchy)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS corridor_activations (
  activation_id       text        PRIMARY KEY,
  corridor_id         text        NOT NULL REFERENCES corridor_definitions(id),
  parent_activation_id text      REFERENCES corridor_activations(activation_id),
  
  -- Activation metadata
  activation_type     text        NOT NULL,  -- 'FIRST_DETECTION', 'REACTIVATION', 'HYPOTHESIS', 'FIELD_CONFIRMED'
  activation_date     timestamptz NOT NULL,
  closure_date        timestamptz,            -- When activation ended (if archived)
  
  -- Disease context
  disease_code        text        NOT NULL,
  disease_confidence  numeric(3,2) NOT NULL,
  
  -- Signal evidence
  signal_count        integer     NOT NULL,
  signal_sources      text[]      NOT NULL,  -- Array of source names
  composite_score     numeric(3,2) NOT NULL,
  
  -- Memory state
  memory_state        text        NOT NULL,  -- 'REFERENCE', 'HYPOTHESIS', 'REALTIME', 'HYBRID', 'FIELD_CONFIRMED', 'ARCHIVED'
  memory_notes        text,
  
  -- Covenant seal
  covenant_seal       text,                   -- Hash of the approval MoScript that sealed this activation
  approved_by         text,                   -- MoScript ID that approved
  approved_at         timestamptz,
  
  -- Explainability
  explanation_json    jsonb       DEFAULT '{}',
  
  created_at          timestamptz DEFAULT NOW(),
  updated_at          timestamptz DEFAULT NOW(),
  
  CHECK (disease_confidence >= 0 AND disease_confidence <= 1),
  CHECK (composite_score >= 0 AND composite_score <= 1),
  CHECK (memory_state IN ('REFERENCE', 'HYPOTHESIS', 'REALTIME', 'HYBRID', 'FIELD_CONFIRMED', 'ARCHIVED'))
);

-- Indexes for corridor_activations
CREATE INDEX IF NOT EXISTS idx_corridor_activations_corridor 
  ON corridor_activations(corridor_id, activation_date DESC);
CREATE INDEX IF NOT EXISTS idx_corridor_activations_parent 
  ON corridor_activations(parent_activation_id);
CREATE INDEX IF NOT EXISTS idx_corridor_activations_state 
  ON corridor_activations(memory_state, activation_date DESC);
CREATE INDEX IF NOT EXISTS idx_corridor_activations_disease 
  ON corridor_activations(disease_code, activation_date DESC);
CREATE INDEX IF NOT EXISTS idx_corridor_activations_covenant 
  ON corridor_activations(covenant_seal) 
  WHERE covenant_seal IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 4. corridor_state_transitions (Covenant-Sealed Audit Trail)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS corridor_state_transitions (
  transition_id       text        PRIMARY KEY,
  corridor_id         text        NOT NULL REFERENCES corridor_definitions(id),
  activation_id       text        NOT NULL REFERENCES corridor_activations(activation_id),
  
  -- State change
  from_state          text        NOT NULL,
  to_state            text        NOT NULL,
  
  -- Covenant seal
  covenant_seal       text        NOT NULL,  -- Hash of the approval MoScript
  approved_by         text        NOT NULL,  -- MoScript ID: 'mo-poe-covenant-state-transition-001'
  approved_at         timestamptz NOT NULL,
  
  -- Approval context
  candidate_score     numeric(3,2),
  truth_engine_verdict jsonb      NOT NULL,  -- { status: 'approved'|'denied', reasons: [], hash: '' }
  admin_override      boolean     DEFAULT false,
  admin_override_by   text,
  admin_override_reason text,
  
  -- Transition metadata
  transition_reason   text        NOT NULL,
  transition_metadata jsonb       DEFAULT '{}',
  
  created_at          timestamptz DEFAULT NOW(),
  
  -- Constraint: No duplicate transitions for same activation
  UNIQUE(activation_id, from_state, to_state),
  
  CHECK (from_state IN ('REFERENCE', 'HYPOTHESIS', 'REALTIME', 'HYBRID', 'FIELD_CONFIRMED', 'ARCHIVED')),
  CHECK (to_state IN ('REFERENCE', 'HYPOTHESIS', 'REALTIME', 'HYBRID', 'FIELD_CONFIRMED', 'ARCHIVED'))
);

-- Indexes for corridor_state_transitions
CREATE INDEX IF NOT EXISTS idx_corridor_state_transitions_corridor 
  ON corridor_state_transitions(corridor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_corridor_state_transitions_activation 
  ON corridor_state_transitions(activation_id);
CREATE INDEX IF NOT EXISTS idx_corridor_state_transitions_seal 
  ON corridor_state_transitions(covenant_seal);
CREATE INDEX IF NOT EXISTS idx_corridor_state_transitions_states 
  ON corridor_state_transitions(from_state, to_state);

-- ═══════════════════════════════════════════════════════════════
-- 5. corridor_memory_state (Current Sealed State)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS corridor_memory_state (
  corridor_id         text        PRIMARY KEY REFERENCES corridor_definitions(id),
  
  -- Current sealed state
  current_state       text        NOT NULL,
  current_activation_id text      REFERENCES corridor_activations(activation_id),
  
  -- State metadata
  state_since         timestamptz NOT NULL,
  last_transition_id  text        NOT NULL REFERENCES corridor_state_transitions(transition_id),
  
  -- Fire gate modifiers
  fire_floor_modifier numeric(4,3) NOT NULL DEFAULT 0.000,  -- State-specific modifier
  base_fire_floor     numeric(3,2) NOT NULL,  -- Disease-specific base floor
  effective_fire_floor numeric(3,2) NOT NULL,  -- base + modifier
  
  -- Memory statistics
  total_activations   integer     NOT NULL DEFAULT 0,
  reactivation_count  integer     NOT NULL DEFAULT 0,
  hypothesis_count    integer     NOT NULL DEFAULT 0,
  field_confirmations integer     NOT NULL DEFAULT 0,
  
  -- Last activity
  last_signal_at      timestamptz,
  last_transition_at  timestamptz NOT NULL,
  
  -- Covenant seal
  sealed_by           text        NOT NULL,  -- MoScript ID that last sealed this state
  sealed_at           timestamptz NOT NULL,
  
  updated_at          timestamptz DEFAULT NOW(),
  
  CHECK (current_state IN ('REFERENCE', 'HYPOTHESIS', 'REALTIME', 'HYBRID', 'FIELD_CONFIRMED', 'ARCHIVED')),
  CHECK (base_fire_floor >= 0 AND base_fire_floor <= 1),
  CHECK (effective_fire_floor >= 0 AND effective_fire_floor <= 1)
);

-- Indexes for corridor_memory_state
CREATE INDEX IF NOT EXISTS idx_corridor_memory_state_state 
  ON corridor_memory_state(current_state, state_since DESC);
CREATE INDEX IF NOT EXISTS idx_corridor_memory_state_fire 
  ON corridor_memory_state(effective_fire_floor);

-- ═══════════════════════════════════════════════════════════════
-- 6. Views for Operational Monitoring
-- ═══════════════════════════════════════════════════════════════

-- View: Current corridor states with fire floors
CREATE OR REPLACE VIEW v_corridor_memory_states AS
SELECT 
  cms.corridor_id,
  cd.canonical_name,
  cms.current_state,
  cms.state_since,
  cms.current_activation_id,
  cms.fire_floor_modifier,
  cms.base_fire_floor,
  cms.effective_fire_floor,
  cms.total_activations,
  cms.reactivation_count,
  cms.hypothesis_count,
  cms.field_confirmations,
  cms.last_signal_at,
  cms.last_transition_at,
  cms.sealed_by,
  cms.sealed_at
FROM corridor_memory_state cms
LEFT JOIN corridor_definitions cd ON cms.corridor_id = cd.id
ORDER BY cms.effective_fire_floor DESC;

-- View: Recent state transitions
CREATE OR REPLACE VIEW v_recent_state_transitions AS
SELECT 
  cst.transition_id,
  cst.corridor_id,
  cd.canonical_name,
  cst.from_state,
  cst.to_state,
  cst.candidate_score,
  cst.truth_engine_verdict->>'status' as verdict_status,
  cst.admin_override,
  cst.transition_reason,
  cst.approved_at,
  cst.approved_by
FROM corridor_state_transitions cst
LEFT JOIN corridor_definitions cd ON cst.corridor_id = cd.id
ORDER BY cst.approved_at DESC
LIMIT 100;

-- View: Activation history by corridor
CREATE OR REPLACE VIEW v_corridor_activation_history AS
SELECT 
  ca.activation_id,
  ca.corridor_id,
  cd.canonical_name,
  ca.activation_type,
  ca.activation_date,
  ca.closure_date,
  ca.disease_code,
  ca.composite_score,
  ca.memory_state,
  ca.signal_count,
  ca.signal_sources,
  ca.covenant_seal
FROM corridor_activations ca
LEFT JOIN corridor_definitions cd ON ca.corridor_id = cd.id
ORDER BY ca.corridor_id, ca.activation_date DESC;

-- ═══════════════════════════════════════════════════════════════
-- 7. Triggers for State Governance
-- ═══════════════════════════════════════════════════════════════

-- Trigger: Update corridor_memory_state on approved transition
CREATE OR REPLACE FUNCTION update_corridor_memory_state_on_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if transition was approved
  IF (NEW.truth_engine_verdict->>'status') = 'approved' THEN
    INSERT INTO corridor_memory_state (
      corridor_id,
      current_state,
      current_activation_id,
      state_since,
      last_transition_id,
      fire_floor_modifier,
      base_fire_floor,
      effective_fire_floor,
      total_activations,
      reactivation_count,
      hypothesis_count,
      field_confirmations,
      last_signal_at,
      last_transition_at,
      sealed_by,
      sealed_at
    ) VALUES (
      NEW.corridor_id,
      NEW.to_state,
      NEW.activation_id,
      NEW.approved_at,
      NEW.transition_id,
      CASE NEW.to_state
        WHEN 'REFERENCE' THEN 0.05
        WHEN 'HYPOTHESIS' THEN 0.02
        WHEN 'REALTIME' THEN -0.03
        WHEN 'HYBRID' THEN -0.02
        WHEN 'FIELD_CONFIRMED' THEN -0.05
        WHEN 'ARCHIVED' THEN 0.08
      END,
      0.75,  -- Default base floor, should be disease-specific
      0.75 + CASE NEW.to_state
        WHEN 'REFERENCE' THEN 0.05
        WHEN 'HYPOTHESIS' THEN 0.02
        WHEN 'REALTIME' THEN -0.03
        WHEN 'HYBRID' THEN -0.02
        WHEN 'FIELD_CONFIRMED' THEN -0.05
        WHEN 'ARCHIVED' THEN 0.08
      END,
      COALESCE(
        (SELECT total_activations FROM corridor_memory_state WHERE corridor_id = NEW.corridor_id),
        0
      ) + 1,
      COALESCE(
        (SELECT reactivation_count FROM corridor_memory_state WHERE corridor_id = NEW.corridor_id),
        0
      ) + CASE WHEN NEW.to_state = 'HYBRID' THEN 1 ELSE 0 END,
      COALESCE(
        (SELECT hypothesis_count FROM corridor_memory_state WHERE corridor_id = NEW.corridor_id),
        0
      ) + CASE WHEN NEW.to_state = 'HYPOTHESIS' THEN 1 ELSE 0 END,
      COALESCE(
        (SELECT field_confirmations FROM corridor_memory_state WHERE corridor_id = NEW.corridor_id),
        0
      ) + CASE WHEN NEW.to_state = 'FIELD_CONFIRMED' THEN 1 ELSE 0 END,
      NOW(),
      NEW.approved_at,
      NEW.approved_by,
      NEW.approved_at
    )
    ON CONFLICT (corridor_id) DO UPDATE SET
      current_state = EXCLUDED.to_state,
      current_activation_id = EXCLUDED.activation_id,
      state_since = EXCLUDED.state_since,
      last_transition_id = EXCLUDED.last_transition_id,
      fire_floor_modifier = EXCLUDED.fire_floor_modifier,
      base_fire_floor = EXCLUDED.base_fire_floor,
      effective_fire_floor = EXCLUDED.effective_fire_floor,
      total_activations = EXCLUDED.total_activations,
      reactivation_count = EXCLUDED.reactivation_count,
      hypothesis_count = EXCLUDED.hypothesis_count,
      field_confirmations = EXCLUDED.field_confirmations,
      last_signal_at = EXCLUDED.last_signal_at,
      last_transition_at = EXCLUDED.last_transition_at,
      sealed_by = EXCLUDED.sealed_by,
      sealed_at = EXCLUDED.sealed_at,
      updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_memory_state_on_transition
  AFTER INSERT ON corridor_state_transitions
  FOR EACH ROW
  EXECUTE FUNCTION update_corridor_memory_state_on_transition();

-- ═══════════════════════════════════════════════════════════════
-- 8. Documentation
-- ═══════════════════════════════════════════════════════════════

COMMENT ON TABLE poe_signals IS 
  'Raw epidemiological signals from all sources (DHIS2, ACLED, DTM, field reports, public APIs)';

COMMENT ON TABLE poe_corridor_signal IS 
  'Corridor-annotated signals linking raw signals to corridor IDs for spatial-temporal analysis';

COMMENT ON TABLE corridor_activations IS 
  'Corridor activations as memory nodes with parent-child relationships and covenant seals';

COMMENT ON TABLE corridor_state_transitions IS 
  'Covenant-sealed audit trail of all corridor state changes. No state change without a MoScript seal.';

COMMENT ON TABLE corridor_memory_state IS 
  'Single source of truth for current corridor state. Updated only via sealed transitions.';

COMMENT ON COLUMN corridor_state_transitions.covenant_seal IS 
  'Cryptographic hash of the approval decision. Ensures state transitions are auditable and tamper-evident.';

COMMENT ON COLUMN corridor_memory_state.effective_fire_floor IS 
  'Adaptive fire floor = base_floor + state_modifier + season_modifier + uncertainty_penalty';
