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
  let trinityResult: any = null;

  if (corridor?.phantomActivated) {
    console.log(`\n  ${"─".repeat(58)}`);
    console.log(`  LAYER 5 — TRINITY LOOP · TALK (mo-trinity-loop-001)`);
    console.log(`  ${"─".repeat(58)}`);

    trinityResult = await runner.run("mo-trinity-loop-001", {
      corridorResult: corridor,
      fieldNotes: "Field team reports heavy motorcycle traffic on Lwanda forest path",
      runId,
    });

    const synthesis = trinityResult.result;

    console.log(`\n  ${"─".repeat(55)}`);
    console.log(`  ${SEAL}  BODY SYNTHESIS:`);
    console.log(`  ${"─".repeat(55)}`);
    console.log(`\n${synthesis.synthesis}`);
    console.log(`\n  Trinity hash:    ${synthesis.trinityHash.slice(0, 32)}...`);
    console.log(`  Loop complete:   ${synthesis.loopComplete}`);
    console.log(`  Total latency:   ${synthesis.latencyMs}ms`);

    console.log(`\n  ${"─".repeat(58)}`);
    console.log(`  LAYER 6 — TRINITY LOOP · LEARN + REMEMBER`);
    console.log(`  ${"─".repeat(58)}`);

    const gridMoment = trinityResult.gridLogId;
    console.log(`  ✓ MoStarMoment sealed: ${gridMoment}`);
    console.log(`  ✓ Woo state:           ${trinityResult.woo.meta.wooState}`);
    console.log(`  ✓ Trinity hash anchored: ${synthesis.trinityHash.slice(0, 24)}...`);

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
    wooState:        trinityResult?.woo?.meta?.wooState ?? "aligned",
    corridorActive:  trinityResult?.result?.loopComplete ?? false,
    corridorId:      trinityResult?.result?.corridorId ?? null,
    corridorScore:   detectionResult?.result?.corridorScore ?? null,
    corridorRisk:    detectionResult?.result?.riskClass ?? null,
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

export { boot };
