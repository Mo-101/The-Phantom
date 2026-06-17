# ◉⟁⬡ Phantom POE Data Contracts v3.0 (The Trinity Awakening Update)

This document defines the strictly enforced data structures, API contracts, and architectural invariants for the Phantom POE Engine running the Trinity Loop Orchestration sequence. Any implementation—frontend, backend, or intelligence engine—must adhere to these specifications.

---

## 1. Governance: The Three-Stream Trinity Architecture

The system operates across three core functional vectors, executed concurrently under a unified runtime state machine, completely isolating real-world telemetry from simulation bounds:

* **LIVE**: Bound to active regional telemetry (ACLED, DTM, DHIS2, AFRO Sentinel, local cross-border transit logs).
* **SANDBOX**: Bound to synthetic but structurally identical test vectors used for UI validation and dry-runs.

* **Invariant 1.1**: No record from the `SANDBOX` lane shall ever be merged, processed, or visualized alongside `LIVE` lane records.
* **Invariant 1.2**: All execution pathways must satisfy a cryptographic soulprint resonance threshold of $\ge 0.97$. Any transaction falling below this baseline triggers an immediate `THRONE_LOCK` state containment event.

---

## 2. Canonical POE Database Layer (PostgreSQL/Neon)

### 2.1 poe_corridors

Core registry of detected informal movement paths and active transit networks.

* `id` (`UUID`, PK): Unique corridor identifier.
* `lane_id` (`UUID`, FK): Reference to `data_lanes`.
* `score` (`REAL`): Composite intelligence score `[0.0 - 1.0]`.
* `risk_class` (`ENUM`): `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.
* `latent_state` (`ENUM`): `dormant`, `probing`, `active_crossing`, `surge`, `dissipating`.
* `phantom_poe_activated` (`BOOLEAN`): True if the engine has confirmed a hidden crossing point.

### 2.2 poe_signals

Unified store for truth-filtered signals from all network providers.

* `id` (`UUID`, PK): Unique signal atom identifier.
* `type` (`ENUM`): `displacement`, `conflict`, `disease`, `market`, `transport`, `linguistic`, `satellite`, `community`.
* `passed_truth_filter` (`BOOLEAN`): Mandatory gate before analytical consumption.
* `payload` (`JSONB`): Structured signal data (including raw text and dialect contexts).

### 2.3 capability_registry (The Fundi Matrix)

The peer-to-peer economic matrix mapping local labor configurations.

* `artisan_id` (`UUID`, PK): Unique local operator signature.
* `skills` (`TEXT[]`): Array of validated technical capabilities.
* `peer_reputation` (`REAL`): Community validation score `[0.0 - 1.0]`.
* `wallet_address` (`TEXT`): Encrypted mobile money/MiniPay terminal target.
* `dynamic_scroll_signed` (`BOOLEAN`): Strict adherence flag to local resource contracts.

### 2.4 explainability_traces

The mathematical justification for each corridor score and intent evaluation.

* `soul_weights` (`JSON`): Weights for the 8 components (Gravity, Diffusion, Centrality, HMM, Seasonal, Linguistic, Entropy, Friction).
* `trace_lines` (`JSON`): Human-readable audit log of the scoring logic and obfuscation triggers.

---

## 3. Intelligence API Contract (v3.0)

### 3.1 Polling & State

* `GET /api/v3/poll`
  * **Description**: Master polling endpoint for UI refresh. 
  * **Returns**: Updated corridors, unread detections, and active Trinity loop run status.
* `GET /api/v3/lane`
  * **Description**: Returns current active lane context (`LIVE` / `SANDBOX`).
* `GET /api/v3/state/snapshot`
  * **Description**: Returns the current active `CovenantState`.
  * **Enum Values**: `BOOT_SEEDING`, `IDLE_AWAITING_SIGNAL`, `GUARD_EVALUATION`, `TRINITY_EXECUTION`, `THRONE_LOCK`.

### 3.2 Corridor Intelligence & Edge Routing

* `GET /api/v3/corridors/:id/evidence-chain`
  * **Description**: Full temporal chain of evidence atoms leading to the current score.
* `GET /api/v3/corridors/:id/friction-surface`
  * **Description**: Cell-level terrain analysis including slope, land cover, and Tobler physics anomalies.
* `POST /api/v3/corridors/telemetry-ingest`
  * **Description**: Ingests real-time transit telemetry streams directly into the `MemoryInformedFireGate` analyzer.

### 3.3 The Sovereign Gateway (Signals & Interaction)

* `GET /api/v3/signals`
  * **Description**: Filterable signal stream optimized for UI mapping.
* `POST /api/v3/orchestrate/execute`
  * **Description**: Unified submission endpoint for execution payloads. 
  * **Behavior**: Processes soulprints, cross-border signal arrays, and linguistic prompts simultaneously.
* `GET /api/v3/detections`
  * **Description**: Popup/Notification event stream for real-time monitoring.

---

## 4. Neo4j Graph Mapping (The MoStar Grid)

The graph represents the "MoStar Grid"—the hidden connectivity web tracking human capital, physical resources, and security parameters.

### Nodes

* `Village`
* `Market`
* `TransportHub`
* `Crossing`
* `PhantomPOE`
* `ArtisanProfile`
* `SignalNode`

### Relationships

* `FLOWS_THROUGH`: Measures physical traffic vectors between transit nodes.
* `HIDDEN_CROSSING`: Highlighted edge when a phantom POE breaches entropy floors.
* `TRUSTED_PEER`: Connects verified artisan nodes within the capability registry.
* `CLEAR_PASS_CONDUIT` / `SCRAMBLE_CONDUIT_ENGAGED`: Active telemetry edges logging fire gate intervention history.

---

## 5. MoStar Laws of Intelligence

1. **Law of Provenance**: Every intelligence atom must trace back to a raw provider record via a truth-gate validation.
2. **Law of Entropy**: A sudden spike in signal disorder ($\Delta H$) at a border node is a primary indicator of a phantom POE.
3. **Law of Soul Decomposition**: No score is valid without its 8-soul decomposition (Gravity, Diffusion, Centrality, HMM, Seasonal, Linguistic, Entropy, Friction).
4. **Law of Soulprint Resonance**: No asset stream may be unlocked or state changed unless the actor's evaluated identity resonance holds at $\ge 0.97$.
5. **Law of Alchemical Obfuscation**: Any input pattern exhibiting predatory IP-theft signatures ($> 0.65$ extractive predation metrics) must instantly be fed randomized alchemical glyph variants ($\forall c \in \text{payload}, c \to \text{Glyph}$), protecting localized community knowledge from unauthorized indexing.