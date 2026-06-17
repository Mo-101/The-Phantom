import { readFileSync } from "node:fs";
import { ExplainabilityEngine } from "../../../../src/services/intelligence";

type BridgePayload = {
  corridor_id: string;
  replay_date: string;
  visible_signals: Array<Record<string, unknown>>;
  corridor?: Record<string, unknown>;
};

function readStdin(): BridgePayload {
  const raw = readFileSync(0, "utf8").trim();
  if (!raw) throw new Error("empty bridge payload");
  return JSON.parse(raw) as BridgePayload;
}

function num(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function evidenceType(signal: Record<string, unknown>) {
  const raw = String(signal.type ?? signal.signal_type ?? signal.source ?? "").toLowerCase();
  if (raw.includes("health") || raw.includes("disease")) return "health_signal";
  if (raw.includes("transport") || raw.includes("movement")) return "transport_signal";
  if (raw.includes("linguistic")) return "linguistic_drift";
  if (raw.includes("entropy")) return "entropy_spike";
  if (raw.includes("remote") || raw.includes("sentinel")) return "remote_sensing";
  if (raw.includes("community")) return "community_report";
  return "market_signal";
}

function signalText(signal: Record<string, unknown>): string {
  return String(
    signal.title ??
    signal.summary ??
    signal.description ??
    signal.notes ??
    signal.text ??
    signal.signal_id ??
    "manifest signal"
  );
}

function signalConfidence(signal: Record<string, unknown>): number {
  return Math.max(0.05, Math.min(1, num(signal.confidence ?? signal.weight ?? signal.score, 0.55)));
}

function main() {
  const payload = readStdin();
  const corridor = payload.corridor ?? {};
  const center = Array.isArray(corridor.center) ? corridor.center : [36.175, 12.96335];
  const lng = num(center[0], 36.175);
  const lat = num(center[1], 12.96335);
  const visibleSignals = payload.visible_signals ?? [];
  const signalConfidenceValues = visibleSignals.map(signalConfidence);
  const meanSignal = signalConfidenceValues.length
    ? signalConfidenceValues.reduce((sum, value) => sum + value, 0) / signalConfidenceValues.length
    : 0.1;

  const evidence = visibleSignals.map((signal) => ({
    evidenceType: evidenceType(signal) as never,
    description: signalText(signal),
    weight: signalConfidence(signal),
    source: String(signal.source ?? "manifest"),
    sourceRecordId: String(signal.signal_id ?? signal.sourceRecordId ?? "unknown"),
    confidence: signalConfidence(signal),
    timestamp: String(signal.event_date ?? payload.replay_date),
    nodeIds: [String(corridor.name ?? payload.corridor_id)],
  }));

  const riskSeed = String(corridor.risk ?? "").toUpperCase();
  const riskBase = riskSeed === "CRITICAL" ? 0.78 : riskSeed === "HIGH" ? 0.62 : riskSeed === "MEDIUM" ? 0.42 : 0.25;

  const engine = new ExplainabilityEngine();
  const score = engine.synthesizeCorridorScore({
    runId: `validation-${payload.replay_date}`,
    corridorId: payload.corridor_id,
    startNode: String(corridor.name ?? payload.corridor_id).split("→")[0]?.trim() || payload.corridor_id,
    endNode: String(corridor.name ?? payload.corridor_id).split("→")[1]?.trim() || payload.corridor_id,
    gravityScore: num(corridor.gravityScore, riskBase),
    diffusionScore: num(corridor.diffusionScore, Math.max(riskBase - 0.05, 0.1)),
    centralityScore: num(corridor.centralityScore, 0.55),
    hmmScore: Math.max(meanSignal, num(corridor.hmmScore, riskBase)),
    seasonalScore: num(corridor.seasonalScore, 0.5),
    linguisticScore: num(corridor.linguisticScore, 0.45),
    entropyScore: Math.max(meanSignal, num(corridor.entropyScore, riskBase)),
    frictionScore: num(corridor.frictionScore, 0.55),
    evidence,
    inferredVelocityKmh: num(corridor.velocity, 4),
    seasonallyActive: bool(corridor.seasonal, false),
    requiresCanoe: bool(corridor.canoe, false),
    conflictDetour: bool(corridor.detour, false),
    signalHistory: [0.1, 0.2, meanSignal, Math.max(meanSignal, riskBase), Math.max(meanSignal, riskBase)],
    previousSignalHistory: [0.1, 0.15, 0.2, 0.25, 0.3],
    frictionContext: { slopeDeg: 2, landCover: "sparse_vegetation" as never },
    startCoord: { lat, lng },
    endCoord: { lat: lat + 0.05, lng: lng + 0.05 },
    locationSignals: [{ lat, lng, confidence: 0.65 }],
  });

  const result = {
    state: score.state,
    risk: score.corridorScore,
    confidence: Math.max(0, Math.min(1, score.corridorScore)),
    trigger_signal_ids: visibleSignals.map((signal) => String(signal.signal_id ?? signal.sourceRecordId ?? "")).filter(Boolean),
    rationale: score.traceLines?.join("\n") ?? "Phantom score produced by ExplainabilityEngine.synthesizeCorridorScore",
    raw: score,
  };

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
}
