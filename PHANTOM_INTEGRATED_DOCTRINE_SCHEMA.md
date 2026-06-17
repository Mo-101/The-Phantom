# ◉⟁⬡ Phantom POE — Integrated Doctrine Schema

**Version:** v2.0 — Sealed State Machine  
**Date:** May 31, 2026  
**Core Principle:** No corridor changes state unless a MoScript seals it. No Fire activation becomes operational unless the TruthEngine approves it.

---

## 📊 Integrated Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PHANTOM INTEGRATED DOCTRINE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  poe_signals (raw epidemiological data)                                     │
│  ↓                                                                          │
│  poe_corridor_signal (corridor-annotated signals)                            │
│  ↓                                                                          │
│  corridor_activations (memory hierarchy)                                    │
│  ↓                                                                          │
│  corridor_state_transitions (covenant-sealed audit trail)                   │
│  ↓                                                                          │
│  corridor_memory_state (current sealed state)                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Schema Tables

### 1. `poe_signals` (Raw Epidemiological Data)

**Purpose:** Store normalized disease signals from all sources (DHIS2, ACLED, DTM, field reports)

```sql
CREATE TABLE poe_signals (
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
  -- Indexes
  INDEX idx_poe_signals_disease_time (disease_code, reported_at DESC),
  INDEX idx_poe_signals_geo (lat, lng),
  INDEX idx_poe_signals_source (source, truth_score DESC)
);
```

---

### 2. `poe_corridor_signal` (Corridor-Annotated Signals)

**Purpose:** Link raw signals to corridor IDs for spatial-temporal analysis

```sql
CREATE TABLE poe_corridor_signal (
  id                  text        PRIMARY KEY,
  signal_id           text        NOT NULL REFERENCES poe_signals(signal_id),
  corridor_id         text        NOT NULL REFERENCES corridor_definitions(id),
  corridor_km         numeric(10,2),           -- Distance along corridor
  corridor_node_id    text,                   -- Nearest corridor node
  match_confidence    numeric(3,2) NOT NULL,  -- How well signal matches corridor
  temporal_relevance  numeric(3,2) NOT NULL,  -- Time decay factor
  composite_score     numeric(3,2) NOT NULL,  -- match_confidence * temporal_relevance * truth_score
  created_at          timestamptz DEFAULT NOW(),
  UNIQUE(signal_id, corridor_id),
  INDEX idx_poe_corridor_signal_corridor (corridor_id, composite_score DESC),
  INDEX idx_poe_corridor_signal_time (created_at DESC)
);
```

---

### 3. `corridor_activations` (Memory Hierarchy)

**Purpose:** Store corridor activations as memory nodes with parent-child relationships

```sql
CREATE TABLE corridor_activations (
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
  
  INDEX idx_corridor_activations_corridor (corridor_id, activation_date DESC),
  INDEX idx_corridor_activations_parent (parent_activation_id),
  INDEX idx_corridor_activations_state (memory_state, activation_date DESC),
  INDEX idx_corridor_activations_disease (disease_code, activation_date DESC)
);
```

---

### 4. `corridor_state_transitions` (Covenant-Sealed Audit Trail)

**Purpose:** Every state change must be sealed by a MoScript. This is the audit trail.

```sql
CREATE TABLE corridor_state_transitions (
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
  
  INDEX idx_corridor_state_transitions_corridor (corridor_id, created_at DESC),
  INDEX idx_corridor_state_transitions_activation (activation_id),
  INDEX idx_corridor_state_transitions_seal (covenant_seal)
);
```

---

### 5. `corridor_memory_state` (Current Sealed State)

**Purpose:** Single source of truth for current corridor state. Updated only via sealed transitions.

```sql
CREATE TABLE corridor_memory_state (
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
  
  INDEX idx_corridor_memory_state_state (current_state, state_since DESC),
  INDEX idx_corridor_memory_state_fire (effective_fire_floor)
);
```

---

## 🔒 Core Rules

### Rule 1: Covenant-Gated State Transitions

```text
No corridor changes state unless a MoScript seals it.
```

**Implementation:**

- All state changes go through `mo-poe-covenant-state-transition-001`
- The MoScript evaluates the candidate transition
- If approved, it writes to `corridor_state_transitions` with a covenant seal
- Only then does `corridor_memory_state` get updated
- The seal is a cryptographic hash of the approval decision

### Rule 2: Memory-Informed Fire Gate

```text
No Fire activation becomes operational unless the TruthEngine approves it.
```

**Implementation:**

- Fire floor is calculated as:

  ```
  effective_fire_floor = disease_base_floor + state_modifier + season_modifier + uncertainty_penalty
  ```

- State modifiers:

  ```
  REFERENCE        → +0.05  (historical, needs live confirmation)
  HYPOTHESIS       → +0.02  (emerging, needs more evidence)
  REALTIME         → -0.03  (live signals, trusted)
  HYBRID           → -0.02  (historical + live, highly trusted)
  FIELD_CONFIRMED  → -0.05  (ground truth, most trusted)
  ARCHIVED         → +0.08  (inactive, high threshold to reactivate)
  ```

- The TruthEngine evaluates the composite score against the effective fire floor
- Only if score >= effective_fire_floor does activation proceed

### Rule 3: Historical Seeding After Sealing

```text
Historical data is seeded only after the state machine is sealed.
```

**Implementation:**

- NCDC Lassa records are ingested
- Normalized by state/week
- Matched to corridor definitions
- Backfilled as activations with `activation_type = 'FIRST_DETECTION'`
- All historical activations are sealed via the covenant MoScript
- Replay test ensures no illegal transitions occurred

---

## 🔄 State Transition Matrix

| From State | To State | Allowed? | Reason |
|------------|----------|----------|--------|
| REFERENCE | HYPOTHESIS | ✅ | Signal cluster detected |
| REFERENCE | REALTIME | ✅ | Live evidence matches historical pattern |
| REFERENCE | HYBRID | ✅ | Historical reactivated by live evidence |
| HYPOTHESIS | REALTIME | ✅ | Threshold met |
| HYPOTHESIS | ARCHIVED | ✅ | Evidence decayed, hypothesis rejected |
| REALTIME | HYBRID | ✅ | Historical match found |
| REALTIME | FIELD_CONFIRMED | ✅ | Ground verification |
| REALTIME | ARCHIVED | ✅ | Staleness timeout |
| HYBRID | FIELD_CONFIRMED | ✅ | Ground verification |
| HYBRID | ARCHIVED | ✅ | Staleness timeout |
| FIELD_CONFIRMED | ARCHIVED | ✅ | Inactive for extended period |
| ARCHIVED | HYPOTHESIS | ✅ | New signals detected |
| ARCHIVED | REALTIME | ✅ | Strong live evidence |
| ARCHIVED | HYBRID | ✅ | Historical pattern re-emerging |

**Illegal transitions are blocked by the covenant MoScript unless admin override.**

---

## 📝 MoScript Execution Order

```
1. mo-poe-covenant-state-transition-001  (LAYER 1.9 — COVENANT GATE)
   ↓
2. mo-poe-fire-gate-001                (LAYER 1.10 — MEMORY-INFORMED FIRE)
   ↓
3. mo-poe-historical-seeding-001        (LAYER 1.11 — HISTORICAL BACKFILL)
```

---

## 🎯 Implementation Order

1. **Covenant-Gated State Transitions** — Seal the state machine
2. **Memory-Informed Fire Gate** — Adaptive scoring
3. **Historical Activation Seeding** — Backfill memory

This order ensures:

- The state machine is defensible before any data enters
- Scoring is adaptive to memory state
- Historical data is seeded safely through sealed transitions
