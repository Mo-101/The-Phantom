# ◉⟁⬡ Phantom POE Data Contracts v2.1

This document defines the strictly enforced data structures, API contracts, and architectural invariants for the Phantom POE Engine. Any implementation—frontend, backend, or intelligence engine—must adhere to these specifications.

## 1. Governance: The Two-Lane Architecture

The system operates in two strictly isolated data lanes:
- **LIVE**: Bound to real-world provider ingestion (ACLED, DTM, DHIS2, AFRO Sentinel). Used for operational intelligence.
- **SANDBOX**: Bound to synthetic but structurally identical test data. Used for UI testing, regressions, and simulations.

**Invariant 1.1**: No record from the SANDBOX lane shall ever be merged or visualized alongside LIVE lane records.

## 2. Canonical POE Database Layer (PostgreSQL/Neon)

The following tables form the high-level intelligence store.

### 2.1 poe_corridors
Core registry of detected informal movement paths.
- `id` (UUID, PK): Unique corridor identifier.
- `lane_id` (UUID, FK): Reference to `data_lanes`.
- `score` (REAL): Composite intelligence score [0.0 - 1.0].
- `risk_class` (ENUM): `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.
- `latent_state` (ENUM): `dormant`, `probing`, `active_crossing`, `surge`, `dissipating`.
- `phantom_poe_activated` (BOOLEAN): True if the engine has confirmed a hidden crossing point.

### 2.2 poe_signals
Unified store for truth-filtered signals from all providers.
- `type` (ENUM): `displacement`, `conflict`, `disease`, `market`, `transport`, `linguistic`, `satellite`, `community`.
- `passed_truth_filter` (BOOLEAN): Mandatory gate before analytical consumption.

### 2.3 explainability_traces
The mathematical justification for each corridor score.
- `soul_weights` (JSON): Weights for the 8 components (Gravity, Diffusion, etc.).
- `trace_lines` (JSON): Human-readable audit log of the scoring logic.

## 3. Intelligence API Contract (v2.1)

### 3.1 Polling & State
- `GET /api/poll`: Master polling endpoint for UI refresh. Returns updated corridors, unread detections, and latest run status.
- `GET /api/lane`: Returns current active lane (LIVE/SANDBOX).

### 3.2 Corridor Intelligence
- `GET /api/corridors/:id/evidence-chain`: Full temporal chain of evidence atoms leading to the current score.
- `GET /api/corridors/:id/friction-surface`: Cell-level terrain analysis including slope, land cover, and Tobler physics.

### 3.3 Signals & Alerts
- `GET /api/signals`: Filterable signal stream.
- `GET /api/detections`: Popup/Notification event stream for real-time monitoring.

## 4. Neo4j Graph Mapping

The graph represents the "MoStar Grid"—the hidden connectivity web.
- **Nodes**: `Village`, `Market`, `TransportHub`, `Crossing`, `PhantomPOE`.
- **Relationships**: `FLOWS_THROUGH`, `HIDDEN_CROSSING`, `ENTROPY_SPIKE`, `PRODUCED`.

## 5. MoStar Laws of Intelligence

1. **Law of Provenance**: Every intelligence atom must trace back to a raw provider record via a truth-gate validation.
2. **Law of Entropy**: A sudden spike in signal disorder (ΔH) at a border node is a primary indicator of a phantom POE.
3. **Law of Soul Decomposition**: No score is valid without its 8-soul decomposition (Gravity, Diffusion, Centrality, HMM, Seasonal, Linguistic, Entropy, Friction).
