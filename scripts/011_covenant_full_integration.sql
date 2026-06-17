-- ============================================================
-- Migration 011: Covenant Full Integration
-- 
-- Phantom POE — Covenant-Gated State Transitions
-- Adds covenant seal and log columns to support full covenant chain
-- (Truth, Ethics, Culture, Bias) for state transitions.
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. Add covenant columns to corridor_state_transitions
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE corridor_state_transitions 
ADD COLUMN IF NOT EXISTS covenant_seal TEXT,
ADD COLUMN IF NOT EXISTS covenant_log TEXT,  -- markdown report
ADD COLUMN IF NOT EXISTS covenant_required BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS gate_breakdown JSONB DEFAULT '{}';  -- per-gate scores and flags

-- Add comment
COMMENT ON COLUMN corridor_state_transitions.covenant_seal IS 
  'Cryptographic seal from covenant check. Required for transitions that increase operational trust.';

COMMENT ON COLUMN corridor_state_transitions.covenant_log IS 
  'Full markdown report from covenant chain (Truth, Ethics, Culture, Bias gates).';

COMMENT ON COLUMN corridor_state_transitions.covenant_required IS 
  'Whether this transition required a covenant seal. Some transitions (decay, archival) do not.';

COMMENT ON COLUMN corridor_state_transitions.gate_breakdown IS 
  'JSON object with per-gate scores and flags: { truth: {score, flags}, ethics: {score, flags}, ... }';

-- ═══════════════════════════════════════════════════════════════
-- 2. Add covenant columns to corridor_memory_state
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE corridor_memory_state
ADD COLUMN IF NOT EXISTS last_covenant_seal TEXT,
ADD COLUMN IF NOT EXISTS last_covenant_at TIMESTAMPTZ;

COMMENT ON COLUMN corridor_memory_state.last_covenant_seal IS 
  'Most recent covenant seal that approved a state transition.';

COMMENT ON COLUMN corridor_memory_state.last_covenant_at IS 
  'Timestamp of most recent covenant approval.';

-- ═══════════════════════════════════════════════════════════════
-- 3. Create covenant transition requirements table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS covenant_transition_requirements (
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  covenant_required BOOLEAN NOT NULL DEFAULT true,
  required_gates TEXT[] DEFAULT ARRAY['truth', 'ethics', 'culture', 'bias'],
  rationale TEXT,
  PRIMARY KEY (from_state, to_state),
  CHECK (from_state IN ('REFERENCE', 'HYPOTHESIS', 'REALTIME', 'HYBRID', 'FIELD_CONFIRMED', 'ARCHIVED')),
  CHECK (to_state IN ('REFERENCE', 'HYPOTHESIS', 'REALTIME', 'HYBRID', 'FIELD_CONFIRMED', 'ARCHIVED'))
);

-- Seed transition requirements
INSERT INTO covenant_transition_requirements (from_state, to_state, covenant_required, required_gates, rationale) VALUES
('REFERENCE', 'HYPOTHESIS', true, ARRAY['truth', 'ethics'], 'Moving from pure history to active investigation. Needs factual signal and ethical source.'),
('HYPOTHESIS', 'REALTIME', true, ARRAY['truth', 'ethics', 'culture', 'bias'], 'Highest risk: corridor goes live, may trigger alerts. Full covenant.'),
('REALTIME', 'FIELD_CONFIRMED', true, ARRAY['truth', 'culture', 'bias'], 'Human-confirmed outbreak; must verify unbiased, culturally appropriate reporting.'),
('REALTIME', 'HYPOTHESIS', false, ARRAY[], 'Decay is automatic; no ethical check needed.'),
('HYPOTHESIS', 'ARCHIVED', false, ARRAY[], 'Evidence decayed; archival is housekeeping.'),
('REALTIME', 'ARCHIVED', false, ARRAY[], 'Staleness timeout; archival is housekeeping.'),
('HYBRID', 'ARCHIVED', false, ARRAY[], 'Staleness timeout; archival is housekeeping.'),
('FIELD_CONFIRMED', 'ARCHIVED', false, ARRAY[], 'After action, preservation.'),
('ARCHIVED', 'REFERENCE', true, ARRAY['truth'], 'Resurrecting from archive needs factual re-validation.'),
('ARCHIVED', 'HYPOTHESIS', true, ARRAY['truth'], 'Reactivating from archive needs factual validation.')
ON CONFLICT (from_state, to_state) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 4. Function to check if transition requires covenant
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION requires_covenant(
  p_from_state TEXT,
  p_to_state TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM covenant_transition_requirements
    WHERE from_state = p_from_state
      AND to_state = p_to_state
      AND covenant_required = true
  );
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- 5. Function to get required gates for transition
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_required_gates(
  p_from_state TEXT,
  p_to_state TEXT
) RETURNS TEXT[] AS $$
BEGIN
  RETURN COALESCE(
    (SELECT required_gates FROM covenant_transition_requirements
     WHERE from_state = p_from_state AND to_state = p_to_state),
    ARRAY[]::TEXT[]
  );
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- 6. View: Covenant-protected transitions
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_covenant_protected_transitions AS
SELECT 
  from_state,
  to_state,
  covenant_required,
  required_gates,
  rationale
FROM covenant_transition_requirements
WHERE covenant_required = true
ORDER BY from_state, to_state;

-- ═══════════════════════════════════════════════════════════════
-- 7. Trigger to auto-set covenant_required on insert
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_covenant_required_on_transition()
RETURNS TRIGGER AS $$
BEGIN
  NEW.covenant_required := requires_covenant(NEW.from_state, NEW.to_state);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_covenant_required
  BEFORE INSERT ON corridor_state_transitions
  FOR EACH ROW
  EXECUTE FUNCTION set_covenant_required_on_transition();

-- ═══════════════════════════════════════════════════════════════
-- 8. Documentation
-- ═══════════════════════════════════════════════════════════════

COMMENT ON TABLE covenant_transition_requirements IS 
  'Defines which state transitions require covenant seals and which gates must pass.';

COMMENT ON FUNCTION requires_covenant IS 
  'Check if a state transition requires a covenant seal.';

COMMENT ON FUNCTION get_required_gates IS 
  'Get the list of required gates (truth, ethics, culture, bias) for a transition.';
