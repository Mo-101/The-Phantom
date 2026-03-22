# ◉⟁⬡ Phantom POE Engine

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

### 7 Mathematical Souls

Every corridor score is computed from a weighted ensemble of independent inference models. Nothing is a black box.

| Soul | Symbol | Weight | What it measures |
|------|--------|--------|-----------------|
| **Gravity** | 🜁 | 0.10 | Population × market pull — why movement would happen |
| **Diffusion** | 🜂 | 0.20 | Outbreak timing converted to spatial path inference |
| **Centrality** | 🜃 | 0.15 | Graph betweenness — no formal POE present in this zone |
| **HMM** | 🜄 | 0.20 | Hidden Markov Model — latent crossing state inference |
| **Seasonal** | ☿ | 0.08 | 52-week Fourier harmonic — seasonal activation signature |
| **Linguistic** | ♄ | 0.10 | Language shift rate across the border zone |
| **Entropy** | ♃ | 0.12 | Shannon ΔH spike — signal destabilization detection |
| **Terrain** | ⛰ | 0.05 | Least-cost path physics — is this route physically possible? |

The composite score formula:

```
S = w₁G + w₂D + w₃C + w₄H + w₅F + w₆E + w₇L + w₈T
```

Every component is exposed in the UI. Every weight is documented. Every score is traceable back to real source records.

### The Signal Conduit

Before any corridor is computed, signals pass through a 4-element truth gate:

```
🜂 Fire   (disease)        truth floor: 0.75
🜄 Water  (displacement)   truth floor: 0.70
🜁 Air    (conflict)       truth floor: 0.65
🜃 Earth  (terrain/ling.)  truth floor: 0.80
```

If Fire is not flowing — if there are no validated disease signals above the floor — the engine does not activate. The gate holds.

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

| Source | Type | Element | Update frequency |
|--------|------|---------|-----------------|
| AFRO Sentinel (Supabase) | Disease intelligence | 🜂 Fire | Every 5 min |
| DHIS2 / EWARS | Health facility reports | 🜂 Fire | Every 15 min |
| ACLED | Conflict events | 🜁 Air | Every 30 min |
| IOM DTM | Displacement flows | 🜄 Water | Every 60 min |

Sources are staggered by 8 seconds on boot and processed through tiered priority queues with circuit breakers. A source failing 3 times in succession opens its circuit for 5 minutes — it does not take down the entire pipeline.

**There is no mock data in this system. Missing credentials cause hard throws, not silent fallbacks.**

---

## The map

The corridor intelligence surface runs on real photorealistic 3D terrain.

- `gmp-map-3d` — Google Maps photorealistic 3D globe
- `gmp-polyline-3d` — corridor paths rendered as 3D entities at real elevation
- `gmp-marker-3d` — signal markers at actual lat/lng/altitude
- Camera flies to each corridor's anchor zone on selection

The Intel Panel floats as an HTML overlay alongside the live map — not on a separate canvas.

**Planned:** Cesium + MapTiler migration for terrain-queryable 3D and `sampleTerrain()` integration with the friction surface model.

---

## The analyst workflow

One click reveals the corridor. One click proves it exists.

```
SELECT corridor → evidence chain → cascade proof → score breakdown → brief
```

**Evidence tab** — every signal atom with source, timestamp, location precision class, and truth score  
**Cascade tab** — spatial-temporal propagation chart: signals plotted by day × distance, velocity trend line, cross-border confirmation  
**Scores tab** — all 7 soul contributions with weights and basis  
**Brief tab** — analyst-grade summary with pathway, activation drivers, sources, and recommended action

The **time scrubber** replays how a corridor emerged — day by day, signal by signal. Corridor activation threshold is visible in real time.

**Gap Analysis mode** shows formal POE coverage circles against the border. The blind zone is red. The corridor runs through it.

---

## The data model

All corridor intelligence lives in a dedicated Neo4j subgraph compartment — isolated from the MoStar Grid.

### Label namespace: `POE_*`

| Label | Contents |
|-------|----------|
| `POE_Signal` | Validated signals from live sources |
| `POE_Corridor` | Detected corridor objects with scores |
| `POE_Entropy` | Shannon entropy spike alerts |
| `POE_Moment` | Trinity loop synthesis records |
| `POE_Run` | Run provenance and metadata |
| `POE_Node` | Geographic anchor points |

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
(:POE_Corridor)-[:POE_CONTAINS_SIGNAL]->(:POE_Signal)
(:POE_Corridor)-[:POE_STARTS_AT]->(:POE_Node)
(:POE_Corridor)-[:POE_ENDS_AT]->(:POE_Node)
(:POE_Entropy)-[:POE_ALERT_ON]->(:POE_Node)
(:POE_Moment)-[:POE_SYNTHESIZES]->(:POE_Corridor)
```

### Verification queries

```cypher
-- Confirm signals are landing in the right compartment
MATCH (s:POE_Signal {workspace: 'phantom-poe'})
RETURN s.signalId, s.source, s.sourceRecordId, s.truthScore, s.runId
ORDER BY s.timestamp DESC LIMIT 10;

-- Confirm corridors are activating
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
GET  /api/corridors
GET  /api/corridor/:id
GET  /api/signals
GET  /api/runs/:runId
POST /api/ingest/run
GET  /api/diagnostics
POST /api/mcp
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
Layer 4  — Corridor detection
Layer 5  — Trinity synthesis
Layer 6  — Learn + Remember (moment sealing)
Layer 7  — Grid status report
```

---

## Environment variables

### Client-safe (`NEXT_PUBLIC_` prefix)

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
```

### Server-only (never reaches browser)

```env
GOOGLE_AI_API_KEY=
NEO4J_URI=bolt://...
NEO4J_USER=
NEO4J_PASSWORD=
SUPABASE_URL=
AFRO_SENTINEL_SERVICE_KEY=
NEON_DATABASE_URL=
OLLAMA_BASE_URL=http://localhost:11434
ACLED_API_KEY=
ACLED_EMAIL=
IOM_DTM_BASE_URL=
IOM_DTM_API_KEY=
DHIS2_BASE_URL=
DHIS2_USERNAME=
DHIS2_PASSWORD=
```

Missing required credentials cause hard throws on startup. The engine does not silently degrade.

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

The uncertainty is real. The evidence is real. The corridor is inferred — and that is stated clearly.

---

## Current active corridors (as of last run)

| Corridor | Zone | Score | Status |
|----------|------|-------|--------|
| `CORRIDOR-KE-TZ-047` | Lwanda → Bunda (KE/TZ border) | 0.7887 | ◉ ACTIVE · HIGH |
| `CORRIDOR-UG-CD-018` | Ishasha → Rutshuru (UG/CD border) | 0.5834 | ◉ ACTIVE · MEDIUM |
| `CORRIDOR-TZ-MZ-031` | Songea → Lichinga (TZ/MZ border) | 0.2341 | ○ DORMANT · LOW |

---

## Built by

**MoStar Industries** · African Flame Initiative  
Lead: Akanimo Idon (Flame) · WHO AFRO OSL Technical Specialist  
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
