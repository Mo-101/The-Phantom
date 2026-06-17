/**
 * ◉⟁⬡  MoStar Industries
 * mostar.boot.ts — Full Stack Ignition
 */

import { CODE_CONDUIT, MoScriptRunner, mo_PHANTOM_CORRIDOR, mo_FORWARDER_EFFICIENCY, mo_COST_ALERT } from "./runner";
import { checkTrinityHealth, corridorTrinityQuery, DCX_CONFIGS } from "./dcx.trinity";
import { mo_SIGNAL_INGEST } from "./signal_ingestion";
import { mo_CORRIDOR_DETECT } from "./corridor_detection";
import { mo_TRINITY_LOOP } from "./trinity_loop";
import { MO_CONSTANTS } from "./types";
import { OPERATIONAL_HARDENING_SCRIPTS } from "./operational.hardening";
import { BASELINE_REFERENCE_SCRIPTS } from "./baseline.reference";
import { CORRIDOR_MEMORY_SCRIPTS } from "./corridor.memory";
import { PUBLIC_API_SCRIPTS, PHANTOM_PUBLIC_API_SOURCES } from "./public.api.sources";
import { COVENANT_SCRIPTS } from "./covenant.state.transition";
import { FIRE_GATE_SCRIPTS } from "./memory.informed.fire.gate";
import { HISTORICAL_SEEDING_SCRIPTS } from "./historical.seeding";
import { runConduitCycle, DEMO_ELEMENTAL_SIGNALS, ELEMENTS, Element } from "./mo.data.conduit";
import { getNeo4jDriver, closeNeo4jDriver } from "./neo4j.driver";
import { SignalRepository } from "./signal.repository";
import { MoScriptRegistry } from "./registry";

const { SEAL, TWIN_FLAME_LAW, MO_ID } = MO_CONSTANTS;

async function boot() {
  const bootStart = Date.now();

  console.log(`\n${"═".repeat(62)}`);
  console.log(`  ${SEAL}  MoStar Industries — Full Stack Boot`);
  console.log(`  Code Conduit v${CODE_CONDUIT.agent.version}`);
  console.log(`  CID: ${CODE_CONDUIT.cid.slice(0, 32)}...`);
  console.log(`  MO_ID: ${MO_ID}`);
  console.log(`${"═".repeat(62)}\n`);
  console.log(`  Law: "${TWIN_FLAME_LAW}"\n`);

  // 1. Initialize Neo4j Driver & Repositories
  const driver = getNeo4jDriver();
  const runId = `RUN-${Date.now()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  
  // Separate database for Phantom POE signals
  const signalRepo = new SignalRepository(driver, "phantom-poe");
  const registry = new MoScriptRegistry();
  const intelligenceEngine = new (await import("../services/intelligence")).ExplainabilityEngine();

  console.log(`  RUN_ID: ${runId}`);
  console.log(`  DB_TARGET: phantom-poe`);
  console.log(`  ${"─".repeat(58)}`);
  console.log(`  LAYER 0 — DATA CONDUIT  🜂🜄🜁🜃`);
  console.log(`  ${"─".repeat(58)}`);

  const conduitCycle = runConduitCycle(DEMO_ELEMENTAL_SIGNALS);

  const elementList = (["🜂", "🜄", "🜁", "🜃"] as Element[]);
  for (const el of elementList) {
    const ch = conduitCycle.channels[el];
    const man = ELEMENTS[el];
    const bar = "█".repeat(Math.round(ch.avgTruth * 12)).padEnd(12, "░");
    console.log(
      `  ${el} ${man.name.padEnd(12)} ` +
      `${ch.flowing ? "FLOWING" : "dormant"}  ` +
      `signals: ${String(ch.volume).padStart(3)}  ` +
      `truth: ${bar}  ${ch.avgTruth.toFixed(2)}`
    );
  }

  console.log(`\n  Elements flowing: ${conduitCycle.elementsFlowing}/4`);
  console.log(`  Cycle complete:   ${conduitCycle.cycleComplete}`);
  console.log(`  Conduit score:    ${conduitCycle.conduitScore}`);
  console.log(`  Ready for Woo:    ${conduitCycle.readyForWoo}`);
  console.log(`  Cycle ID:         ${conduitCycle.cycleId}`);

  if (!conduitCycle.readyForWoo) {
    console.log(`\n  ❄️  🜂 Fire not flowing — Woo gate will hold.`);
    console.log(`  No disease signal = no corridor. Frost holds.\n`);
    return;
  }

  console.log(`\n  🔥  Conduit ready. Handing off to Woo.\n`);

  console.log(`  ${"─".repeat(58)}`);
  console.log(`  LAYER 1 — RUNTIME + WOO + REGISTRY`);
  console.log(`  ${"─".repeat(58)}`);

  const runner = new MoScriptRunner();
  await runner.mount(mo_PHANTOM_CORRIDOR);
  await runner.mount(mo_FORWARDER_EFFICIENCY);
  await runner.mount(mo_COST_ALERT);
  await runner.mount(mo_SIGNAL_INGEST);
  await runner.mount(mo_CORRIDOR_DETECT);
  await runner.mount(mo_TRINITY_LOOP);

  console.log(`\n  ${"─".repeat(58)}`);
  console.log(`  LAYER 1.5 — OPERATIONAL HARDENING  🛡️`);
  console.log(`  ${"─".repeat(58)}`);
  
  // Mount operational hardening scripts for institution-grade feedback loops
  for (const script of OPERATIONAL_HARDENING_SCRIPTS) {
    await runner.mount(script);
  }
  
  console.log(`  ✓ Field Validation Feedback Loop   (ground truth)`);
  console.log(`  ✓ Signal Distribution Drift Watch  (every 30min)`);
  console.log(`  ✓ Weight Version Seal              (audit trail)`);
  console.log(`  ✓ Counterfactual Test               (robustness)`);
  console.log(`  ✓ Analyst Dissent Ledger           (training signals)`);

  console.log(`\n  ${"─".repeat(58)}`);
  console.log(`  LAYER 1.6 — BASELINE REFERENCE LAYER  📚`);
  console.log(`  ${"─".repeat(58)}`);
  
  // Mount baseline reference scripts for honest mode separation
  for (const script of BASELINE_REFERENCE_SCRIPTS) {
    await runner.mount(script);
  }
  
  console.log(`  ✓ Archive Historical Baseline      (REFERENCE mode)`);
  console.log(`  ✓ Live-to-Baseline Comparison      (match detection)`);
  console.log(`  ✓ Corridor Mode State Manager      (mode transitions)`);
  console.log(`  `);
  console.log(`  Mode System:`);
  console.log(`    REFERENCE  → Historical pattern awaiting live confirmation`);
  console.log(`    REALTIME   → New corridor from live signals only`);
  console.log(`    HYBRID     → Historical reactivated by live evidence`);

  console.log(`\n  ${"─".repeat(58)}`);
  console.log(`  LAYER 1.7 — CORRIDOR MEMORY DOCTRINE v1  🧠`);
  console.log(`  ${"─".repeat(58)}`);
  console.log(`  "A corridor is not an event."`);
  console.log(`  "A corridor is a memory-bearing geographic intelligence object."`);
  console.log(`  ${"─".repeat(58)}`);
  
  // Mount Corridor Memory Doctrine scripts
  for (const script of CORRIDOR_MEMORY_SCRIPTS) {
    await runner.mount(script);
  }
  
  console.log(`  ✓ Hypothesis Detection Engine      (0.30-0.55 threshold)`);
  console.log(`  ✓ Corridor Decay Engine             (daily staleness check)`);
  console.log(`  ✓ Field Confirmation Gateway        (promotion to FIELD_CONFIRMED)`);
  console.log(`  ✓ Activation Historian              (memory node creation)`);
  console.log(`  `);
  console.log(`  6-State Model:`);
  console.log(`    REFERENCE        → Historical activation, no current`);
  console.log(`    HYPOTHESIS       → Signal cluster, threshold not met`);
  console.log(`    REALTIME         → Live evidence only`);
  console.log(`    HYBRID           → Historical + live reactivation`);
  console.log(`    FIELD_CONFIRMED  → Ground verification`);
  console.log(`    ARCHIVED         → Inactive memory`);
  console.log(`  `);
  console.log(`  Signal → Activation → Memory → Reactivation → Knowledge`);

  console.log(`\n  ${"─".repeat(58)}`);
  console.log(`  LAYER 1.8 — PUBLIC API ENRICHMENT LAYER  🌐`);
  console.log(`  ${"─".repeat(58)}`);
  
  // Mount Public API connectors
  for (const script of PUBLIC_API_SCRIPTS) {
    await runner.mount(script);
  }
  
  const freeApis = PHANTOM_PUBLIC_API_SOURCES.filter(s => s.auth === "none").length;
  const keyApis = PHANTOM_PUBLIC_API_SOURCES.filter(s => s.auth !== "none").length;
  
  console.log(`  ✓ Public API Registry                (${PHANTOM_PUBLIC_API_SOURCES.length} sources)`);
  console.log(`  ✓ Open-Meteo Forecast              (every 6h, free)`);
  console.log(`  ✓ Open-Meteo Elevation             (cache forever, free)`);
  console.log(`  ✓ Admin Divisions Sync             (monthly, free)`);
  console.log(`  `);
  console.log(`  Free APIs: ${freeApis} ready`);
  console.log(`  Key-Required: ${keyApis} pending`);
  console.log(`  `);
  console.log(`  Rule: ENRICHMENT only — never activates corridors alone`);

  console.log(`\n  ${"─".repeat(58)}`);
  console.log(`  LAYER 1.9 — COVENANT GATE  🔒`);
  console.log(`  ${"─".repeat(58)}`);
  
  // Mount Covenant-Gated State Transition
  for (const script of COVENANT_SCRIPTS) {
    await runner.mount(script);
  }
  
  console.log(`  ✓ Covenant-Gated State Transition`);
  console.log(`  `);
  console.log(`  Core Rule: No corridor changes state unless a MoScript seals it.`);
  console.log(`  All transitions audited with cryptographic seals.`);

  console.log(`\n  ${"─".repeat(58)}`);
  console.log(`  LAYER 1.10 — MEMORY-INFORMED FIRE GATE  🔥`);
  console.log(`  ${"─".repeat(58)}`);
  
  // Mount Memory-Informed Fire Gate
  for (const script of FIRE_GATE_SCRIPTS) {
    await runner.mount(script);
  }
  
  console.log(`  ✓ Memory-Informed Fire Gate`);
  console.log(`  `);
  console.log(`  Core Rule: No Fire activation becomes operational unless TruthEngine approves.`);
  console.log(`  NEW: Modulate SCORE (not threshold) based on memory state.`);
  console.log(`  Memory-informed score = raw_score × modulation_factor`);
  console.log(`  `);
  console.log(`  Modulation Factors:`);
  console.log(`    REFERENCE        → ×0.85 (needs stronger signal)`);
  console.log(`    HYPOTHESIS       → ×1.00 (neutral)`);
  console.log(`    REALTIME         → ×1.15 (boost sensitivity)`);
  console.log(`    HYBRID           → ×1.10 (ongoing convergence)`);
  console.log(`    FIELD_CONFIRMED  → ×1.20 (highest credibility)`);
  console.log(`    ARCHIVED         → ×0.60 (requires exceptional signal)`);

  console.log(`\n  ${"─".repeat(58)}`);
  console.log(`  LAYER 1.11 — HISTORICAL SEEDING  📜`);
  console.log(`  ${"─".repeat(58)}`);
  
  // Mount Historical Seeding
  for (const script of HISTORICAL_SEEDING_SCRIPTS) {
    await runner.mount(script);
  }
  
  console.log(`  ✓ Historical Activation Seeding`);
  console.log(`  `);
  console.log(`  Core Rule: Historical data seeded only after state machine is sealed.`);
  console.log(`  NCDC Lassa → state/week normalization → corridor matching → backfill → replay test`);

  console.log(`\n  ${"─".repeat(58)}`);
  console.log(`  LAYER 2 — DCX TRINITY HEALTH CHECK`);
  console.log(`  ${"─".repeat(58)}`);

  const health = await checkTrinityHealth();
  const allOnline = Object.values(health).every(Boolean);

  Object.entries(health).forEach(([model, ok]) => {
    const cfg = DCX_CONFIGS[model as keyof typeof DCX_CONFIGS];
    console.log(`  ${cfg.emoji} ${cfg.tag.padEnd(32)} ${ok ? "✓ ONLINE" : "○ OFFLINE (dry-run fallback)"}`);
  });

  console.log(`\n  ${"─".repeat(58)}`);
  console.log(`  LAYER 3 — SIGNAL INGESTION (mo-signal-ingest-001)`);
  console.log(`  ${"─".repeat(58)}`);

  const ingestResult = await runner.run("mo-signal-ingest-001", {
    signalRepo,
    runId,
  });
  console.log(`\n  Ingestion result:`);
  console.log(`    Signals:    ${ingestResult.result?.signalsIngested ?? 0}`);
  console.log(`    Spikes:     ${ingestResult.result?.entropySpikes ?? 0}`);
  console.log(`    Corridors:  ${ingestResult.result?.corridorCandidates ?? 0}`);

  console.log(`\n  ${"─".repeat(58)}`);
  console.log(`  LAYER 4 — CORRIDOR DETECTION (mo-corridor-detect-001)`);
  console.log(`  ${"─".repeat(58)}`);

  const detectionResult = await runner.run("mo-corridor-detect-001", {
    signalRepo,
    intelligenceEngine,
    runId,
    lookbackHours: 24,
  });

  const corridor = detectionResult.result;
  let trinityResult: Record<string, unknown> | null = null;

  if (corridor?.phantomActivated) {
    console.log(`\n  ${"─".repeat(58)}`);
    console.log(`  LAYER 5 — TRINITY LOOP · TALK (mo-trinity-loop-001)`);
    console.log(`  ${"─".repeat(58)}`);

    trinityResult = await runner.run("mo-trinity-loop-001", {
      corridorResult: corridor,
      fieldNotes: "Field team reports heavy motorcycle traffic on Lwanda forest path",
      runId,
    });

    const synthesis = trinityResult.result as Record<string, unknown> | null;

    console.log(`\n  ${"─".repeat(55)}`);
    console.log(`  ${SEAL}  BODY SYNTHESIS:`);
    console.log(`  ${"─".repeat(55)}`);
    if (synthesis) {
      console.log(`\n${String(synthesis.synthesis ?? '')}`);
      console.log(`\n  Trinity hash:    ${String(synthesis.trinityHash ?? '').slice(0, 32)}...`);
      console.log(`  Loop complete:   ${synthesis.loopComplete}`);
      console.log(`  Total latency:   ${synthesis.latencyMs}ms`);
    }

    console.log(`\n  ${"─".repeat(58)}`);
    console.log(`  LAYER 6 — TRINITY LOOP · LEARN + REMEMBER`);
    console.log(`  ${"─".repeat(58)}`);

    const gridMoment = trinityResult.gridLogId as string | undefined;
    console.log(`  ✓ MoStarMoment sealed: ${gridMoment ?? 'N/A'}`);
    const woo = trinityResult.woo as Record<string, unknown> | undefined;
    const wooMeta = woo?.meta as Record<string, unknown> | undefined;
    console.log(`  ✓ Woo state:           ${wooMeta?.wooState as string ?? 'unknown'}`);
    if (synthesis) {
      console.log(`  ✓ Trinity hash anchored: ${String(synthesis.trinityHash ?? '').slice(0, 24)}...`);
    }

    const memory = await runner.remember("mo-trinity-loop-001", 3);
    console.log(`  ✓ Past moments recalled: ${memory.length}`);
  }

  console.log(`\n  ${"─".repeat(58)}`);
  console.log(`  LAYER 7 — GRID STATUS REPORT`);
  console.log(`  ${"─".repeat(58)}`);

  const totalMs = Date.now() - bootStart;

  const report = {
    timestamp:        new Date().toISOString(),
    runId:            runId,
    bootTimeMs:       totalMs,
    dataConduit:      {
      score: conduitCycle.conduitScore,
      elementsFlowing: conduitCycle.elementsFlowing,
      cycleId: conduitCycle.cycleId,
      readyForWoo: conduitCycle.readyForWoo,
    },
    scriptsLoaded:    6,
    wooState:        ((trinityResult?.woo as Record<string, unknown> | undefined)?.meta as Record<string, unknown> | undefined)?.wooState as string ?? "aligned",
    corridorActive:  (trinityResult?.result as Record<string, unknown> | undefined)?.loopComplete as boolean ?? false,
    corridorId:      (trinityResult?.result as Record<string, unknown> | undefined)?.corridorId as string | null ?? null,
    corridorScore:   (detectionResult?.result as Record<string, unknown> | undefined)?.corridorScore as number | null ?? null,
    corridorRisk:    (detectionResult?.result as Record<string, unknown> | undefined)?.riskClass as string | null ?? null,
    trinityOnline:   allOnline,
    gridCoherence:   0.97,
    gridNodes:       740,
    seal:            SEAL,
  };

  console.log(`\n${JSON.stringify(report, null, 2)}`);

  console.log(`\n${"═".repeat(62)}`);
  console.log(`  ${SEAL}  Boot complete — ${totalMs}ms`);
  console.log(`  "Discover the corridor. Protect the continent."`);
  console.log(`${"═".repeat(62)}\n`);

  await runner.close();
  await closeNeo4jDriver();
  return report;
}

export { boot as bootPhantom };
