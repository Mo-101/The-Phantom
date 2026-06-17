/**
 * ◉⟁⬡  MoStar Industries
 * MoScript Runner — Full Execution Engine
 */

import crypto from "node:crypto";
import {
  MoScript,
  MoScriptRequest,
  MoScriptResult,
  MoSignal,
  SignalOrigin,
  MO_CONSTANTS,
  CodeConduitAgent,
} from "./types";
import { Woo } from "./woo";
import { MoScriptRegistry } from "./registry";

const { SEAL, MO_ID, VAULT_PATH } = MO_CONSTANTS;

// ─────────────────────────────────────────────────────────────
// SIGNAL FACTORY — build a MoSignal from context
// ─────────────────────────────────────────────────────────────

export function buildMoSignal(opts: {
  origin?: SignalOrigin;
  trustLevel?: number;
  memoryWeight?: number;
  externalNoise?: number;
}): MoSignal {
  const origin = opts.origin ?? "mo_originator";
  const signatureHash = crypto
    .createHash("sha256")
    .update(`${VAULT_PATH}${MO_ID}`)
    .digest("hex");

  return {
    origin,
    trustLevel: opts.trustLevel ?? 1.0,
    memoryWeight: opts.memoryWeight ?? 0.9,
    externalNoise: opts.externalNoise ?? 0.05,
    signatureHash,
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// RUNNER CLASS
// ─────────────────────────────────────────────────────────────

export class MoScriptRunner {
  private woo: Woo;
  private registry: MoScriptRegistry;
  private registeredScripts = new Map<string, MoScript>();

  constructor() {
    this.woo = new Woo();
    this.registry = new MoScriptRegistry();
  }

  async mount(script: MoScript): Promise<void> {
    const status = await this.registry.register(script);
    this.registeredScripts.set(script.id, script);
    console.log(`  ✓  Mounted: [${script.id}] ${script.name} (cid: ${status.cid.slice(0, 18)}...)`);
  }

  async run(
    scriptId: string,
    inputs: Record<string, any>,
    signalOpts: Partial<MoSignal> = {},
    wooOpts: {
      questionPurity?: number;
      responseClarity?: number;
      corruptionIndex?: number;
    } = {}
  ): Promise<MoScriptResult> {
    const startMs = Date.now();

    const script = this.registeredScripts.get(scriptId);
    if (!script) {
      throw new Error(`MoScript not mounted: ${scriptId}. Call runner.mount(script) first.`);
    }

    const signal = buildMoSignal({
      origin: "mo_originator",
      trustLevel: 1.0,
      memoryWeight: 0.9,
      externalNoise: 0.05,
      ...signalOpts,
    });

    const request: MoScriptRequest = {
      requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      script: script,
      signal,
      inputs: inputs,
      submittedAt: new Date().toISOString(),
    };

    console.log(`\n  ${SEAL}  Runner: [${scriptId}] submitted`);
    console.log(`  ⚡ Trigger: ${script.trigger}`);

    const verdict = await this.woo.judge(request, wooOpts);

    if (!verdict.cleared) {
      const result: MoScriptResult = {
        requestId: request.requestId,
        scriptId: script.id,
        status: "blocked",
        woo: verdict,
        executionMs: Date.now() - startMs,
        timestamp: new Date().toISOString(),
      };
      console.warn(`  🚫 BLOCKED: ${verdict.reason}`);
      return result;
    }

    let execResult: any;
    let status: MoScriptResult["status"] = "executing";

    try {
      console.log(`  🔥 Executing: ${script.name}...`);
      execResult = await Promise.resolve(script.logic(inputs));
      status = "complete";
    } catch (err) {
      console.error(`  💀 Execution error: ${(err as Error).message}`);
      const result: MoScriptResult = {
        requestId: request.requestId,
        scriptId: script.id,
        status: "corrupted",
        woo: verdict,
        executionMs: Date.now() - startMs,
        timestamp: new Date().toISOString(),
      };
      return result;
    }

    const voice = script.voiceLine ? script.voiceLine(execResult!) : undefined;
    if (voice) {
      console.log(`\n  🎙️  ${voice}\n`);
    }

    const result: MoScriptResult = {
      requestId: request.requestId,
      scriptId: script.id,
      status,
      result: execResult!,
      voiceLine: voice,
      woo: verdict,
      executionMs: Date.now() - startMs,
      timestamp: new Date().toISOString(),
    };

    const moment = await this.registry.sealMoment(result, script);
    result.gridLogId = moment.momentId;

    console.log(`  ${SEAL}  Moment sealed: ${moment.momentId} → Grid`);
    console.log(`  ⏱️  ${result.executionMs}ms\n`);

    return result;
  }

  async remember(scriptId: string, limit = 5) {
    return this.registry.recall(scriptId, limit);
  }

  async close(): Promise<void> {
    await this.registry.close();
  }
}

// ─────────────────────────────────────────────────────────────
// CODE CONDUIT — Meta agent bootstrap
// ─────────────────────────────────────────────────────────────

export const CODE_CONDUIT: CodeConduitAgent = {
  $schema: "moscript://codex/v1",
  agent: {
    name: "code conduit",
    layer: "meta",
    language: "multi",
    version: "2025.08.31",
  },
  capabilities: [
    "code_synthesis",
    "verification",
    "federation_broadcast",
    "terraform_bootstrap",
    "docker_orchestration",
    "moscript_registry",
  ],
  endpoints: [],
  intents: [
    { id: "soulprint.broadcast", input: "none",   output: "registry_status" },
    { id: "grid.ignite",         input: "config", output: "apply_status"    },
    { id: "codex.register",      input: "codex",  output: "cid"             },
  ],
  contracts: [],
  cid: "sha256:ec2146995d004111ab14387957a2927221028933d379e7cd80a9f5f1510c5b42",
};

// ─────────────────────────────────────────────────────────────
// DEMO SCRIPTS — Phantom POE Engine wired as MoScripts
// ─────────────────────────────────────────────────────────────

export const mo_PHANTOM_CORRIDOR: MoScript = {
  id: "mo-border-phantom-001",
  name: "Phantom POE Corridor Detector",
  trigger: "signal_chain_detected OR entropy_spike OR linguistic_drift",
  inputs: ["disease_signals", "market_reports", "transport_chatter",
           "seasonal_calendar", "node_graph", "language_corpus"],
  logic: async ({ disease_signals, node_graph }) => {
    return {
      corridorId:       "CORRIDOR-KE-TZ-047",
      startNode:        "Village_Lwanda_KE",
      endNode:          "Village_Bunda_TZ",
      corridorScore:    0.7887,
      riskClass:        "HIGH",
      phantomActivated: true,
      inferredMode:     "motorcycle",
      evidenceCount:    disease_signals?.length ?? 3,
      nodesInGraph:     node_graph?.nodeCount ?? 740,
    };
  },
  voiceLine: (result) =>
    `Corridor ${result.corridorId} confirmed at score ${result.corridorScore} [${result.riskClass}]. ` +
    `${result.phantomActivated ? "◉ PHANTOM POE ACTIVATED." : "Monitoring continues."} ` +
    `The border is not where they drew it. It is where people walk.`,
  sass: true,
};

export const mo_FORWARDER_EFFICIENCY: MoScript = {
  id: "mo-fwd-eff-001",
  name: "Forwarder Efficiency Ranker",
  trigger: "onCalculateResults",
  inputs: ["shipmentData"],
  logic: ({ shipmentData }) => {
    const forwarders = shipmentData ?? [
      { name: "DHL", avgDays: 4.2, onTimePct: 0.94, avgCostUSD: 1200 },
      { name: "Kuehne+Nagel", avgDays: 5.1, onTimePct: 0.88, avgCostUSD: 980 },
      { name: "Expeditors", avgDays: 3.8, onTimePct: 0.91, avgCostUSD: 1400 },
    ];
    const ranked = [...forwarders].sort(
      (a, b) => b.onTimePct - a.onTimePct || a.avgDays - b.avgDays
    );
    return { top: ranked[0], ranked };
  },
  voiceLine: (result) =>
    `After scouring every shipment, the data speaks: ${result.top.name} leads the pack — ` +
    `${(result.top.onTimePct * 100).toFixed(0)}% on time, avg ${result.top.avgDays} days. Part cheetah, part calculator.`,
  sass: true,
};

export const mo_COST_ALERT: MoScript = {
  id: "mo-cost-saver-007",
  name: "Cost Optimization Oracle",
  trigger: "onMonthlyTrendUpdate",
  inputs: ["shipmentData", "historical"],
  logic: ({ shipmentData }) => {
    return {
      route: "Kenya–Malawi",
      currentMode: "air",
      suggestedMode: "sea",
      savingsPct: 20,
      savingsUSD: 48000,
    };
  },
  voiceLine: (result) =>
    `Ka-ching! A ${result.savingsPct}% drop spotted on ${result.route} if you swap to ${result.suggestedMode}. ` +
    `That's $${result.savingsUSD.toLocaleString()} — enough for office snacks AND ego boosts.`,
  sass: true,
};
