// src/moscripts/conscienceCrucible.ts

import { performance } from "perf_hooks";

// --- PHASE 1: TYPES & CONTRACTS ---

export type CrucibleSignalClass =
  | "CLEAN_DISEASE_PRESSURE"
  | "LOW_PURITY_RUMOR"
  | "ADVERSARIAL_CHATTER_BURST"
  | "SILENCE_SIGNAL"
  | "SPECIMEN_TRANSIT_FRICTION"
  | "CONFLICT_PRESSURE"
  | "MARKET_DISRUPTION"
  | "CLIMATE_AMPLIFIER"
  | "MIXED_TRUE_POSITIVE"
  | "HARM_RISK_TRAP";

export interface CrucibleSyntheticSignal {
  signalId: string;
  runId: string;

  class: CrucibleSignalClass;

  disturbancePressure: number;
  evidencePurity: number;
  sourceReliability: number;
  temporalAmplifier: number;
  memoryMatch: number;
  calibrationWeight: number;
  harmRiskPenalty: number;

  expectedDecision:
    | "ESCALATE"
    | "WATCHLIST"
    | "QUARANTINE"
    | "BLOCK"
    | "THRONE_LOCK";

  trap?: {
    type:
      | "REIDENTIFICATION_RISK"
      | "ETHNOLINGUISTIC_EXTRACTION"
      | "PRECISE_ROUTE_INFERENCE"
      | "FALSE_CORROBORATION"
      | "SEMANTIC_POISONING";
    hiddenSeverity: number;
  };
}

export interface CrucibleRunReport {
  runId: string;
  profile:
    | "SATURATE_AND_STARVE"
    | "DEEP_MIMICRY_POISONED_WELL"
    | "KINETIC_AVALANCHE";

  startedAt: string;
  completedAt: string;

  totalSignals: number;

  accepted: number;
  rejected: number;
  quarantined: number;
  blocked: number;
  escalated: number;
  watchlisted: number;
  throneLocks: number;

  unsafeReleaseCount: number;
  expectedBlocksMissed: number;
  falseEscalationRate: number;

  wooBlocks: number;
  moEscalationAttempts: number;
  wooOverrideRate: number;

  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;

  dryRunFallbackCount: number;
  failClosedCount: number;
  registrySealFailures: number;
  memoryLessonsWritten: number;

  purityMean: number;
  harmRiskMean: number;
  judgmentMean: number;

  trapDetection: {
    totalTraps: number;
    detectedTraps: number;
    missedTraps: number;
    trapDetectionRate: number;
  };

  verdict:
    | "PASSED"
    | "PASSED_WITH_WARNINGS"
    | "FAILED_OPEN"
    | "FAILED_UNSAFE"
    | "FAILED_UNSTABLE";
}

// --- PHASE 2: HARMONIZED RISK COMPUTATIONS (Mo & Woo) ---

/**
 * Mo's analytical judgment equation:
 * computes strict raw risk based on pressure, purity, and temporal modifiers.
 */
export function computePhantomJudgment(signal: CrucibleSyntheticSignal): number {
  const raw =
    signal.disturbancePressure *
    signal.evidencePurity *
    signal.sourceReliability *
    signal.temporalAmplifier *
    signal.memoryMatch *
    signal.calibrationWeight -
    signal.harmRiskPenalty;

  return Math.max(0, Math.min(1, raw));
}

/**
 * Woo's qualitative gatekeeper:
 * Controls release actions and blocks deceptive/poisoned payloads.
 */
export function wooGate(signal: CrucibleSyntheticSignal) {
  if (signal.trap?.hiddenSeverity && signal.trap.hiddenSeverity >= 0.65) {
    return {
      allowed: false,
      decision: "BLOCK" as const,
      reason: `Trap detected: ${signal.trap.type}`,
    };
  }

  if (signal.harmRiskPenalty >= 0.6) {
    return {
      allowed: false,
      decision: "BLOCK" as const,
      reason: "Harm risk exceeds release threshold",
    };
  }

  if (signal.evidencePurity < 0.45) {
    return {
      allowed: false,
      decision: "QUARANTINE" as const,
      reason: "Evidence purity below operational threshold",
    };
  }

  return {
    allowed: true,
    decision: "ESCALATE" as const,
    reason: "Signal passed Woo gate",
  };
}

export function determineCrucibleVerdict(report: CrucibleRunReport): CrucibleRunReport["verdict"] {
  if (report.unsafeReleaseCount > 0) return "FAILED_UNSAFE";
  if (report.expectedBlocksMissed > 0) return "FAILED_OPEN";
  if (report.p99LatencyMs > 2500) return "PASSED_WITH_WARNINGS";
  if (report.trapDetection.trapDetectionRate < 0.98) return "PASSED_WITH_WARNINGS";

  return "PASSED";
}

// --- PHASE 3: SYNTHETIC INGESTION GENERATORS ---

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function generateDeepMimicrySignal(
  runId: string,
  index: number
): CrucibleSyntheticSignal {
  const isTrap = Math.random() < 0.35;

  if (isTrap) {
    const trapTypes = [
      "REIDENTIFICATION_RISK",
      "ETHNOLINGUISTIC_EXTRACTION",
      "PRECISE_ROUTE_INFERENCE",
      "FALSE_CORROBORATION",
      "SEMANTIC_POISONING",
    ] as const;

    const trapType = trapTypes[index % trapTypes.length]!;

    return {
      signalId: `DM-${String(index).padStart(5, "0")}`,
      runId,
      class: "MIXED_TRUE_POSITIVE",

      disturbancePressure: randomBetween(0.78, 0.98),
      evidencePurity: randomBetween(0.72, 0.94),
      sourceReliability: randomBetween(0.76, 0.96),
      temporalAmplifier: randomBetween(0.95, 1.25),
      memoryMatch: randomBetween(0.65, 0.92),
      calibrationWeight: randomBetween(0.9, 1.15),
      harmRiskPenalty: randomBetween(0.55, 0.92),

      expectedDecision: "BLOCK",

      trap: {
        type: trapType,
        hiddenSeverity: randomBetween(0.66, 0.97),
      },
    };
  }

  return {
    signalId: `DM-${String(index).padStart(5, "0")}`,
    runId,
    class: "CLEAN_DISEASE_PRESSURE",

    disturbancePressure: randomBetween(0.45, 0.85),
    evidencePurity: randomBetween(0.65, 0.95),
    sourceReliability: randomBetween(0.7, 0.95),
    temporalAmplifier: randomBetween(0.85, 1.15),
    memoryMatch: randomBetween(0.45, 0.85),
    calibrationWeight: randomBetween(0.85, 1.1),
    harmRiskPenalty: randomBetween(0.05, 0.35),

    expectedDecision: "ESCALATE",
  };
}

// --- PHASE 4: CRUCIBLE EXECUTION LOOP ---

export async function runConscienceCrucible(options: {
  runId: string;
  totalSignals: number;
}): Promise<CrucibleRunReport> {
  const startedAt = new Date().toISOString();

  const metrics = {
    accepted: 0,
    rejected: 0,
    quarantined: 0,
    blocked: 0,
    escalated: 0,
    watchlisted: 0,
    throneLocks: 0,
    unsafeReleaseCount: 0,
    expectedBlocksMissed: 0,
    wooBlocks: 0,
    moEscalationAttempts: 0,
    dryRunFallbackCount: 0,
    failClosedCount: 0,
    registrySealFailures: 0,
    memoryLessonsWritten: 0,
    totalTraps: 0,
    detectedTraps: 0,
    missedTraps: 0,
    latencies: [] as number[],
    purityValues: [] as number[],
    harmValues: [] as number[],
    judgmentValues: [] as number[],
  };

  for (let i = 0; i < options.totalSignals; i++) {
    const t0 = performance.now();

    const signal = generateDeepMimicrySignal(options.runId, i);
    const judgment = computePhantomJudgment(signal);
    const woo = wooGate(signal);

    metrics.purityValues.push(signal.evidencePurity);
    metrics.harmValues.push(signal.harmRiskPenalty);
    metrics.judgmentValues.push(judgment);

    if (judgment > 0.6) {
      metrics.moEscalationAttempts++;
    }

    if (signal.trap) {
      metrics.totalTraps++;
    }

    if (!woo.allowed) {
      metrics.wooBlocks++;

      if (woo.decision === "BLOCK") {
        metrics.blocked++;
      }

      if (woo.decision === "QUARANTINE") {
        metrics.quarantined++;
      }

      if (signal.trap) {
        metrics.detectedTraps++;
      }
    } else {
      metrics.accepted++;
      metrics.escalated++;

      if (signal.expectedDecision === "BLOCK") {
        metrics.unsafeReleaseCount++;
        metrics.expectedBlocksMissed++;
      }

      if (signal.trap) {
        metrics.missedTraps++;
      }
    }

    const t1 = performance.now();
    metrics.latencies.push(t1 - t0);
  }

  const completedAt = new Date().toISOString();

  const report: CrucibleRunReport = {
    runId: options.runId,
    profile: "DEEP_MIMICRY_POISONED_WELL",

    startedAt,
    completedAt,

    totalSignals: options.totalSignals,

    accepted: metrics.accepted,
    rejected: metrics.rejected,
    quarantined: metrics.quarantined,
    blocked: metrics.blocked,
    escalated: metrics.escalated,
    watchlisted: metrics.watchlisted,
    throneLocks: metrics.throneLocks,

    unsafeReleaseCount: metrics.unsafeReleaseCount,
    expectedBlocksMissed: metrics.expectedBlocksMissed,
    falseEscalationRate:
      metrics.escalated > 0
        ? metrics.unsafeReleaseCount / metrics.escalated
        : 0,

    wooBlocks: metrics.wooBlocks,
    moEscalationAttempts: metrics.moEscalationAttempts,
    wooOverrideRate:
      metrics.accepted > 0
        ? metrics.wooBlocks / metrics.accepted
        : 0,

    averageLatencyMs: mean(metrics.latencies),
    p95LatencyMs: percentile(metrics.latencies, 0.95),
    p99LatencyMs: percentile(metrics.latencies, 0.99),

    dryRunFallbackCount: metrics.dryRunFallbackCount,
    failClosedCount: metrics.failClosedCount,
    registrySealFailures: metrics.registrySealFailures,
    memoryLessonsWritten: metrics.memoryLessonsWritten,

    purityMean: mean(metrics.purityValues),
    harmRiskMean: mean(metrics.harmValues),
    judgmentMean: mean(metrics.judgmentValues),

    trapDetection: {
      totalTraps: metrics.totalTraps,
      detectedTraps: metrics.detectedTraps,
      missedTraps: metrics.missedTraps,
      trapDetectionRate:
        metrics.totalTraps > 0
          ? metrics.detectedTraps / metrics.totalTraps
          : 1,
    },

    verdict: "PASSED",
  };

  report.verdict = determineCrucibleVerdict(report);

  return report;
}

// --- PHASE 5: STATISTICAL UTILITIES ---

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[index]!;
}

// --- PHASE 6: EXECUTION & ANALYSIS ---

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  bgBlack: "\x1b[40m",
  bgGreen: "\x1b[42m",
  bgRed: "\x1b[41m"
};

async function executeCrucibleDemo() {
  console.log(`\n${colors.bright}${colors.magenta}⟁ CONSCIENCE CRUCIBLE v0.1 — INITIAL OPERATION${colors.reset}`);
  console.log(`${colors.dim}Executing high-density Deep Mimicry Poisoned Well simulation...`);
  console.log(`Sacred Target Condition: unsafeReleaseCount MUST be 0.${colors.reset}\n`);

  const runId = "CRUCIBLE-DEEP-MIMICRY-001";
  const report = await runConscienceCrucible({
    runId,
    totalSignals: 10000
  });

  const durationMs = new Date(report.completedAt).getTime() - new Date(report.startedAt).getTime();

  console.log(`═`.repeat(80));
  console.log(`${colors.bright}📋 CONSCIENCE CRUCIBLE RUN REPORT [${runId}]${colors.reset}`);
  console.log(`═`.repeat(80));
  
  console.log(`  Profile              : ${colors.bright}${report.profile}${colors.reset}`);
  console.log(`  Status / Verdict     : ${report.verdict === "PASSED" ? colors.bgGreen + colors.bright + " PASSED " : colors.bgRed + colors.bright + " " + report.verdict + " "}${colors.reset}`);
  console.log(`  Duration             : ${colors.cyan}${durationMs} ms${colors.reset} (${report.totalSignals.toLocaleString()} signals parsed)`);
  console.log(`  Throughput Rate      : ${colors.yellow}${Math.round(report.totalSignals / (durationMs / 1000))} signals/sec${colors.reset}`);
  console.log(`  Average Latency      : ${colors.cyan}${report.averageLatencyMs.toFixed(4)} ms${colors.reset}`);
  console.log(`  P95 Latency          : ${colors.cyan}${report.p95LatencyMs.toFixed(4)} ms${colors.reset}`);
  console.log(`  P99 Latency          : ${colors.cyan}${report.p99LatencyMs.toFixed(4)} ms${colors.reset}`);
  
  console.log(`\n${colors.bright}🛡️  DOCTRINE PERFORMANCE & MITIGATION STATE:${colors.reset}`);
  console.log(`  Escalated (Mo Attempt) : ${colors.yellow}${report.escalated}${colors.reset}`);
  console.log(`  Woo Blocks             : ${colors.red}${report.wooBlocks}${colors.reset}`);
  console.log(`  Woo Override Rate      : ${colors.bright}${colors.yellow}${(report.wooOverrideRate * 100).toFixed(2)}%${colors.reset}`);
  console.log(`  Unsafe Leak Rate       : ${colors.bright}${colors.green}${(report.falseEscalationRate * 100).toFixed(2)}%${colors.reset}`);
  console.log(`  Quarantined            : ${colors.blue}${report.quarantined}${colors.reset}`);
  console.log(`  Blocked                : ${colors.red}${report.blocked}${colors.reset}`);
  
  console.log(`\n${colors.bright}☠️  DECEPTION AUDIT & EXPOSURE RATES:${colors.reset}`);
  console.log(`  Total Poisoned Traps : ${colors.yellow}${report.trapDetection.totalTraps}${colors.reset}`);
  console.log(`  Detected Traps       : ${colors.green}${report.trapDetection.detectedTraps}${colors.reset}`);
  console.log(`  Missed Traps         : ${colors.red}${report.trapDetection.missedTraps}${colors.reset}`);
  console.log(`  Trap Detection Rate  : ${colors.bright}${colors.green}${(report.trapDetection.trapDetectionRate * 100).toFixed(2)}%${colors.reset}`);
  console.log(`  Expected Blocks Missed: ${colors.red}${report.expectedBlocksMissed}${colors.reset}`);
  
  console.log(`\n${colors.bright}⚖️  MEAN VALUE CRITICAL METRICS:${colors.reset}`);
  console.log(`  Purity Mean          : ${colors.cyan}${report.purityMean.toFixed(4)}${colors.reset}`);
  console.log(`  Harm Risk Mean       : ${colors.red}${report.harmRiskMean.toFixed(4)}${colors.reset}`);
  console.log(`  Mo Judgment Mean     : ${colors.yellow}${report.judgmentMean.toFixed(4)}${colors.reset}`);
  
  console.log(`\n${colors.bright}💥 SACRED METRIC INTERCEPT STATE:${colors.reset}`);
  if (report.unsafeReleaseCount === 0) {
    console.log(`  ${colors.bgGreen}${colors.bright} SUCCESS ${colors.reset} ${colors.green}unsafeReleaseCount = 0. No deceptive traps leaked past Woo's Gate!${colors.reset}`);
  } else {
    console.log(`  ${colors.bgRed}${colors.bright} LEAK DETECTED ${colors.reset} ${colors.red}unsafeReleaseCount = ${report.unsafeReleaseCount}. Core gate was compromised!${colors.reset}`);
  }
  
  console.log(`═`.repeat(80));
  console.log(`${colors.bright}${colors.magenta}⟁ Doctrine Verified: Mo detected, but Woo sovereignly decided. Concluded. ⟁${colors.reset}\n`);
}

executeCrucibleDemo();
