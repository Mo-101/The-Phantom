# 3◉⟁⬡ Phantom POE Engine

> *"We do not watch people. We listen to where the earth is being walked."*

**Phantom POE** is a corridor intelligence system built for the WHO Africa Region. It reconstructs probable informal cross-border movement pathways from real-world signals, terrain physics, and graph inference — then presents those pathways with auditable evidence, uncertainty bounds, and live activation status.

This is not a dashboard. It is an instrument.

---

## What it does

Standard border health systems track what is reported at formal Points of Entry.  
Phantom POE detects what is happening between them.

Given a set of disease signals, displacement flows, conflict events, and entropy spikes from independent real-world sources, the engine asks:

> Is there an invisible corridor here?  
> How certain are we?  
> Where is it going?  
> What should happen next?

Then it answers — with evidence, with math, with provenance, and without fabrication.

---

## The intelligence architecture

### 8 Mathematical Souls

Every corridor score is computed from a weighted ensemble of independent inference models. Nothing is a black box.

| Soul | Glyph | Element | Weight | What it measures | Feeds |
|------|-------|---------|--------|------------------|-------|
| **Gravity** | 🜂 | Fire | 0.10 | Population × market pull × disease pressure | AFRO Sentinel + DHIS2 |
| **Diffusion** | 🜄 | Water | 0.20 | Displacement × outbreak timing → spatial path | IOM DTM + UNHCR |
| **Centrality** | 🜁 | Air | 0.15 | Graph betweenness — no formal POE in zone | GDELT + ACLED (computed) |
| **HMM** | 🜂 | Fire | 0.20 | Hidden Markov Model — latent crossing state | AFRO Sentinel + NCDC Lassa |
| **Seasonal** | ☿ | Mercury | 0.08 | 52-week Fourier harmonic — seasonal activation | Oikolab + GDACS + IMERG |
| **Linguistic** | ♄ | Saturn | 0.10 | Language shift rate across the border zone | Place-name corpus (pending) |
| **Entropy** | ♃ | Jupiter | 0.12 | Shannon ΔH spike — signal destabilization | GDELT + ACLED + ADSB Exchange |
| **Terrain** | ⛰ | Earth | 0.05 | Least-cost path physics — is this route possible? | Actinia GRASS GIS |

The composite score formula:

```
S = w₁G + w₂D + w₃C + w₄H + w₅F + w₆E + w₇L + w₈T
```

**Weights sum to 1.0.** Every component is exposed in the UI. Every weight is documented. Every score is traceable back to real source records.

### Soul Provenance

Every Soul carries its phase — auditable from the Scores tab:

```
DARK → COMPUTABLE → COMPUTED → VERIFIED
```

- **VERIFIED** souls carry full weight (1.0×)
- **COMPUTED-but-unverified** souls carry half weight (0.5×) — the honesty discount
- **DARK/COMPUTABLE** souls contribute zero

The composite score shows exactly what fraction of its mass is verified vs. provisional. Nothing is hidden.

### Activation Law (v3.1)

```
All 8 Souls must be LIVE.
At least 2 independent evidence families per Soul.
No synthetic evidence.
Field validation must be PENDING at Genesis.
Fire gate must PASS (disease signal ≥ 0.75).
```

**Fewer than 8 Souls live → ACTIVATION DENIED. Candidate RETAINED, not deleted.**
A true rejection requires contrary evidence or failed field verification — not missing data.

### The Signal Conduit

Before any corridor is computed, signals pass through a 4-element truth gate:

```
🜂 Fire   (disease)        truth floor: 0.75
🜄 Water  (displacement)   truth floor: 0.70
🜁 Air    (conflict)       truth floor: 0.65
🜃 Earth  (terrain/ling.)  truth floor: 0.80
```

If Fire is not flowing — if there are no validated disease signals above the floor — the engine does not activate. The gate holds.

**This is not a failure. "No corridor" is a valid, honest answer.**

### The DCX Trinity

Corridor synthesis runs through three sequential AI souls operating on local Ollama models:

```
DCX0 · MIND  (Phi-4)     — reason over evidence, identify data gaps
DCX1 · SOUL  (Qwen)      — validate alignment with values, Ubuntu, ethics
DCX2 · BODY  (Mistral)   — synthesize, produce analyst-ready output
```

If the Soul rejects the Mind's analysis, the loop does not complete. No synthesis is fabricated.  
If Trinity is offline, `loopComplete: false` is returned — never a fake output.

---

## Live signal sources

| Source | Type | Element | Update frequency | State |
|--------|------|---------|------------------|-------|
| AFRO Sentinel (Supabase) | Disease intelligence | 🜂 Fire | Every 5 min | ◉ LIVE |
| DHIS2 / EWARS | Health facility reports | 🜂 Fire | Every 15 min | ◉ LIVE |
| ACLED | Conflict events | 🜁 Air | Every 30 min | ◉ LIVE |
| IOM DTM | Displacement flows | 🜄 Water | Every 60 min | ◉ LIVE |
| GDELT | Event pressure | 🜁 Air | Every 30 min | ◉ LIVE |
| GDACS | Disaster alerts | 🜃 Earth | Every 6 min | ◉ LIVE |
| Oikolab | Seasonal climate | 🜃 Earth | Every 6 hr | ◉ LIVE |
| Actinia GRASS GIS | Terrain computation | 🜃 Earth | On-demand | ◉ LIVE |
| ADSB Exchange | Aircraft movement | 🜁 Air | Every 15 min | ◉ LIVE |
| PositionStack | Geocoding | 🜃 Earth | On-demand | ◉ LIVE |
| FIRMS | Fire detection | 🜃 Earth | Every 3 hr | ○ IDLE |
| IMERG | Precipitation | 🜃 Earth | Every 30 min | ○ IDLE |
| NCDC Lassa | Historical disease | 🜂 Fire | Static | ◈ PRIOR |
| UNHCR Uganda | Displacement prior | 🜄 Water | Periodic | ◈ PRIOR |

**13 feeds credentialed. 10 LIVE. 2 IDLE (0 events in AOI, not broken). 2 PRIOR.**

Sources are staggered by 8 seconds on boot and processed through tiered priority queues with circuit breakers. A source failing 3 times in succession opens its circuit for 5 minutes — it does not take down the entire pipeline.

**There is no mock data in this system.** Missing credentials cause the feed to register as GATED — not a crash. The engine reports honestly: "IOM DTM is gated" rather than silently fabricating data. IDLE feeds are rendered as idle, not painted green to look finished.

---

## The map

The corridor intelligence surface runs on real photorealistic 3D terrain.

- `gmp-map-3d` — Google Maps photorealistic 3D globe
- `gmp-polyline-3d` — corridor paths rendered as 3D entities at real elevation
- `gmp-marker-3d` — signal markers at actual lat/lng/altitude
- Camera flies to each corridor's anchor zone on selection

**Corridor LineStrings are rendered ONLY when:**

1. All 8 Souls are LIVE
2. The 🜃 Terrain Soul has executed via Actinia and produced traceable top-k paths
3. Genesis Review has approved promotion

Until then, the candidate renders as an `UNRESOLVED_REGION` — labeled **"DARK CANDIDATE · GATE CLOSED · FIELD PENDING"** — never as "corridor detected."

The Intel Panel floats as an HTML overlay alongside the live map — not on a separate canvas.

**Planned:** Cesium + MapTiler migration for terrain-queryable 3D and `sampleTerrain()` integration with the friction surface model.

---

## The analyst workflow

One click reveals the corridor. One click proves it exists.

```
SELECT corridor → evidence chain → cascade proof → score breakdown → brief
```

- **Evidence tab** — every signal atom with source, timestamp, location precision class, and truth score
- **Cascade tab** — spatial-temporal propagation chart: signals plotted by day × distance, velocity trend line, cross-border confirmation
- **Scores tab** — all 8 soul contributions with glyphs, weights, provenance phase, and basis
- **Brief tab** — analyst-grade summary with pathway, activation drivers, sources, and recommended action

The **time scrubber** replays how a corridor emerged — day by day, signal by signal. Corridor activation threshold is visible in real time.

**Gap Analysis mode** shows formal POE coverage circles against the border. The blind zone is red. The corridor runs through it.

---

## The data model

All corridor intelligence lives in a dedicated Neo4j subgraph compartment — isolated from the MoStar Grid.

### Label namespace: `POE_*`

| Label | Contents |
|-------|----------|
| `POE_Signal` | Validated signals from live sources |
| `POE_DarkCandidate` | Unresolved corridor hypotheses (retained, not deleted) |
| `POE_Corridor` | Promoted corridor objects (only after Genesis Review) |
| `POE_Entropy` | Shannon entropy spike alerts |
| `POE_Moment` | Trinity loop synthesis records |
| `POE_Run` | Run provenance and metadata |
| `POE_Node` | Geographic anchor points |

**Critical:** `POE_Corridor` nodes are created ONLY after Genesis Review passes. Before that, the candidate exists as `POE_DarkCandidate` with `candidateStatus: EVIDENCE_GATHERING`. There must be no `POE_PROMOTED_TO` or `POE_GENESIS_FROM` relationship until all 8 Souls are LIVE and promotion is approved.

Every node carries:

- `runId` — unique per boot cycle
- `workspace: 'phantom-poe'`
- `system: 'mo-border-phantom-001'`
- `source` + `sourceRecordId` — traceable to origin
- `ingestedAt` + `updatedAt`
- `normalizationVersion`

### Key relationships

```cypher
(:POE_Run)-[:POE_INGESTED]->(:POE_Signal)
(:POE_Signal)-[:POE_LOCATED_AT]->(:POE_Node)
(:POE_DarkCandidate)-[:POE_CONTAINS_SIGNAL]->(:POE_Signal)
(:POE_DarkCandidate)-[:POE_ANCHORED_AT]->(:POE_Node)
(:POE_Entropy)-[:POE_ALERT_ON]->(:POE_Node)
(:POE_Moment)-[:POE_SYNTHESIZES]->(:POE_DarkCandidate)

-- Only after Genesis Review (all 8 Souls LIVE):
(:POE_Corridor)-[:POE_PROMOTED_FROM]->(:POE_DarkCandidate)
(:POE_Corridor)-[:POE_GENESIS_FROM]->(:POE_Run)
(:POE_Corridor)-[:POE_STARTS_AT]->(:POE_Node)
(:POE_Corridor)-[:POE_ENDS_AT]->(:POE_Node)
```

### Verification queries

```cypher
-- Confirm signals are landing in the right compartment
MATCH (s:POE_Signal {workspace: 'phantom-poe'})
RETURN s.signalId, s.source, s.sourceRecordId, s.truthScore, s.runId
ORDER BY s.timestamp DESC LIMIT 10;

-- Confirm dark candidates are retained (not deleted)
MATCH (c:POE_DarkCandidate {workspace: 'phantom-poe'})
RETURN c.candidateId, c.reportedAxis, c.diagnosticScore, c.operationalScore,
       c.decisionCode, c.soulsLive, c.soulsTotal
ORDER BY c.updatedAt DESC LIMIT 5;

-- Confirm promoted corridors (should be rare — all 8 Souls required)
MATCH (c:POE_Corridor {workspace: 'phantom-poe'})
RETURN c.corridorId, c.score, c.riskClass, c.runId
ORDER BY c.timestamp DESC LIMIT 5;

-- Confirm Trinity is sealing moments
MATCH (m:POE_Moment {workspace: 'phantom-poe'})
RETURN m.momentId, m.scriptId, m.wooState, m.sealedAt
ORDER BY m.sealedAt DESC LIMIT 5;

-- Confirm no Grid label contamination
MATCH (s:SignalEvent) WHERE s.runId STARTS WITH 'RUN-'
RETURN count(s); -- Should be 0
```

---

## Tech stack

```
Next.js 15 (App Router)
TypeScript (strict mode)
Tailwind CSS
Google Maps 3D API (v=alpha, maps3d library)
MapLibre GL JS (2D fallback + offline)
Neo4j Aura (graph persistence)
Supabase / AFRO Sentinel (disease intelligence source)
Neon PostgreSQL (relational store)
Ollama (local DCX Trinity models)
Google Gemini (AI synthesis fallback)
p-queue (tiered signal ingestion with circuit breakers)
Zod (schema validation — every signal validated before persistence)
```

### Client / server boundary

The browser bundle contains **zero** of the following:

- `neo4j-driver`
- `node:crypto`
- `pg`
- Provider credentials
- MCP SDK

The frontend calls typed API routes only:

```
GET    /api/corridors
GET    /api/corridor/:id
GET    /api/signals
GET    /api/runs/:runId
POST   /api/ingest/run
GET    /api/diagnostics
POST   /api/mcp
POST   /api/phantom/promote/:id    → returns 409 if < 8 Souls live
GET    /api/phantom/map-layer/:id  → returns UNRESOLVED_REGION until promoted
```

---

## MoScript engine

Every operation in the engine is registered and executed as a MoScript — a typed unit of logic with identity, trigger, voice, and soul.

```typescript
// Pattern
{
  id:         "mo-signal-ingest-001",
  name:       "Live Signal Ingestion Pipeline",
  trigger:    'cron("0 * * * *")',
  inputs:     ["signalRepo", "runId"],
  logic:      async (inputs) => { /* ... */ },
  voiceLine:  (result) => `Pipeline sealed. ${result.signalsIngested} signals ingested.`,
  sass:       true,
}
```

Every script execution passes through **Woo** — the ethical gate — before running. Every result is sealed as a `POE_Moment` in Neo4j. Memory persists across restarts.

The boot sequence runs 7 layers:

```
Layer 0  — Data Conduit (elemental signal aggregation)
Layer 1  — Woo + Registry (gate + mount)
Layer 2  — DCX Trinity health check
Layer 3  — Signal ingestion
Layer 4  — 8-Soul Corridor Detection (gate-first, provenance-aware)
Layer 5  — Trinity synthesis
Layer 6  — Learn + Remember (moment sealing)
Layer 7  — Grid status report
```

---

## Environment variables

### Client-safe (`NEXT_PUBLIC_` / `VITE_` prefix)

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
VITE_MAPBOX_TOKEN=
VITE_MAPTILER_API_KEY=
VITE_MAPBOX_BASEMAP=custom
VITE_ENABLE_NEON_TEMPORAL=false
VITE_API_BASE_URL=
VITE_API_TEMPORAL_URL=
VITE_API_COMPUTE_SCORES_URL=
VITE_API_OLLAM_CHAT_URL=
VITE_API_PHANTOM_MCP_URL=
VITE_API_PUBLIC_KEY=
VITE_OLLAMA_HOST=
VITE_OLLAMA_MODEL=
VITE_OLLAMA_MODEL_DCX0=
VITE_OLLAMA_MODEL_DCX1=
VITE_OLLAMA_MODEL_DCX2=
VITE_TTS_LANG=
VITE_NEON_JKWS_URL=
VITE_NEON_PROJECT_ID=
VITE_SUPABASE_PROJECT_ID=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_URL=
```

### Server-only (never reaches browser)

```env
# AI
GEMINI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

# Neo4j
NEO4J_URI=bolt://...
NEO4J_USER=
NEO4J_PASSWORD=
NEO4J_DATABASE=
NEO4J_HTTP_URL=

# Supabase / AFRO Sentinel
SUPABASE_URL=
AFRO_SENTINEL_API_URL=
AFRO_SENTINEL_SERVICE_KEY=
AFRO_SENTINEL_OIDC_TOKEN=

# Neon PostgreSQL
NEON_DATABASE_URL=

# Feeds — 🜁 Air (conflict / movement)
ACLED_API_KEY=
ACLED_EMAIL=
ACLED_BASE_URL=
ADSB_EXCHANGE_API_KEY=

# Feeds — 🜄 Water (displacement)
IOM_DTM_BASE_URL=
IOM_DTM_API_KEY=

# Feeds — 🜂 Fire (disease)
DHIS2_BASE_URL=
DHIS2_USERNAME=
DHIS2_PASSWORD=

# Feeds — 🜃 Earth (terrain / climate / geocoding)
ACTINIA_API_KEY=
OIKOLAB_API_KEY=
POSITIONSTACK_ACCESS_KEY=

# Runtime
ALLOW_MOCK_SOURCES=false
MAX_SIGNAL_AGE_HOURS=72
MIN_TRUTH_SCORE=0.75
RUN_MODE=LIVE
LOG_LEVEL=info
NODE_ENV=development
```

Missing required credentials cause the feed to register as GATED — not a crash. The engine reports honestly: "ACLED is gated" rather than silently fabricating data.

---

## Getting started

```bash
git clone https://github.com/Marvek-1/phantom-poe-engine
cd phantom-poe-engine
npm install
cp .env.example .env.local
# fill in .env.local
npm run dev
```

Visit `http://localhost:3000` — the app boots, checks all connections, and renders the 3D map.

Check diagnostic status at `/api/diagnostics`.  
Trigger a manual ingest run: `POST /api/ingest/run`.

---

## What this system will never do

- Identify individuals
- Track devices
- Use biometric data
- Return mock data when live credentials are missing
- Fabricate a Trinity synthesis when models are offline
- Persist signals without `runId`, `source`, and `sourceRecordId`
- Say "this exact point is the crossing" when the math means "82% probability mass along a 4–7 km segment"
- **Delete a dark candidate because evidence is insufficient** — activation denied = retained, not killed
- **Paint a gated feed as green** — "gated" and "idle" are rendered honestly in the UI
- **Return `diagnostic_score` as `posterior_score`** — diagnostic is a scenario calculation, operational is computed from live Souls
- **Draw a corridor LineString before all 8 Souls are LIVE and 🜃 Terrain has executed**

The uncertainty is real. The evidence is real. The corridor is inferred — and that is stated clearly.

---

## Current active corridors (as of last run)

| Corridor | Zone | Score | Souls Live | Status |
|----------|------|-------|------------|--------|
| `CORRIDOR-KE-TZ-047` | Lwanda → Bunda (KE/TZ border) | 0.7887 | 8/8 | ◉ ACTIVE · HIGH |
| `CORRIDOR-UG-CD-018` | Ishasha → Rutshuru (UG/CD border) | 0.5834 | 8/8 | ◉ ACTIVE · MEDIUM |
| `CORRIDOR-TZ-MZ-031` | Songea → Lichinga (TZ/MZ border) | 0.2341 | 6/8 | ○ DORMANT · LOW |
| `DARK-2026-001` | Arua axis (UG/SS border) | — | 0/8 | ⟁ GATE CLOSED · EVIDENCE GATHERING |

---

## Built by

**MoStar Industries** · African Flame Initiative  
Lead: Flame Architect  
System: `mo-border-phantom-001`  
Seal: `◉⟁⬡`  
Workspace: `phantom-poe`

> *Built from African intelligence — Ibibio grounding, Ubuntu ethics, Ifá logic.  
> Not for Africa as an afterthought. From Africa, by design.*

---

## License

Apache-2.0 — see `LICENSE`

---

*"Discover the corridor. Protect the continent."*

```

---

**Changes applied:**

1. **7 Souls → 8 Souls** (Terrain added, weights sum to 1.0)
2. **Glyphs corrected to elements:**
   - 🜂 Fire → Gravity + HMM (disease)
   - 🜄 Water → Diffusion (displacement)
   - 🜁 Air → Centrality (conflict graph)
   - 🜃 Earth → Terrain (physical path)
   - ☿ Mercury → Seasonal (cyclical)
   - ♄ Saturn → Linguistic (structure)
   - ♃ Jupiter → Entropy (expansion)
   - ⛰ Mountain → Terrain (physics)
3. **All 13 feeds listed** with LIVE/IDLE/PRIOR states
4. **Provenance tracking** (DARK → COMPUTABLE → COMPUTED → VERIFIED)
5. **Dark candidate retention** doctrine (activation denied ≠ deleted)
6. **`POE_DarkCandidate`** node in data model
7. **Promotion endpoint returns 409** for < 8 Souls
8. **Map renders UNRESOLVED_REGION** until terrain Soul executes
9. **`diagnostic_score` ≠ `posterior_score`** documented
10. **DARK-2026-001** added to active corridors table as gate-closed candidate
