/**
 * ◉⟁⬡  MoStar Industries
 * Phantom Corridor Memory Doctrine v1
 * 
 * A corridor is not an event.
 * A corridor is a memory-bearing geographic intelligence object.
 * 
 * Signal → Activation → Corridor Memory → Reactivation → Institutional Knowledge
 */

import { MoScript } from "./types";

// ═══════════════════════════════════════════════════════════════
// LAYER 1 — Corridor States (6-State Memory Model)
// ═══════════════════════════════════════════════════════════════

export type CorridorMemoryState =
  | "REFERENCE"      // Historical activation exists, no current activation
  | "HYPOTHESIS"     // Signal cluster detected, activation threshold not met
  | "REALTIME"       // Live evidence only, no baseline required
  | "HYBRID"         // Historical corridor reactivated (reference + live)
  | "FIELD_CONFIRMED"// Ground verification (analyst/partner/field team)
  | "ARCHIVED";      // Inactive memory, retained for learning

export type CorridorDecision =
  | "HYBRID_REACTIVATION"
  | "NEW_REALTIME_CORRIDOR"
  | "POSSIBLE_BASELINE_CORRELATION"
  | "INSUFFICIENT_EVIDENCE"
  | "HYPOTHESIS_UPGRADE"
  | "FIELD_CONFIRMATION_REQUIRED";

export interface CorridorMemory {
  corridorId: string;
  canonicalName: string;
  geography: {
    startNode: string;
    endNode: string;
    startCoord: { lat: number; lng: number };
    endCoord: { lat: number; lng: number };
    pathGeometry?: string; // GeoJSON LineString
  };
  
  // Current state
  state: CorridorMemoryState;
  previousState?: CorridorMemoryState;
  stateChangedAt: string;
  
  // Memory hierarchy
  activations: CorridorActivation[];
  activationCount: number;
  
  // Evidence classification
  evidenceClass: "HISTORICAL_BASELINE" | "LIVE_SIGNAL" | "FIELD_CONFIRMED" | "MODEL_INFERRED" | "HYPOTHESIS";
  
  // Temporal tracking
  firstObservedAt: string;
  lastLiveSignalAt?: string;
  activationStartedAt?: string;
  expiresAt?: string;
  archivedAt?: string;
  
  // Signal metrics
  liveSignalCount: number;
  totalHistoricalSignals: number;
  
  // Match intelligence
  baselineMatch?: BaselineMatchMetadata;
  
  // Explainability
  activationDrivers: string[];
  scoreDecomposition?: Record<string, number>;
  
  // Governance
  sealedBy?: string;
  sealedAt?: string;
  reviewRequired?: boolean;
}

export interface CorridorActivation {
  activationId: string;
  corridorId: string;
  sequence: number; // 1st, 2nd, 3rd activation of this corridor
  
  // Temporal bounds
  startedAt: string;
  endedAt?: string;
  duration?: number; // hours
  
  // State at activation
  state: CorridorMemoryState;
  previousState?: CorridorMemoryState;
  
  // Evidence snapshot
  signalCount: number;
  evidenceClass: CorridorMemory["evidenceClass"];
  
  // Scores at activation
  corridorScore: number;
  riskClass: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  scoreDecomposition: Record<string, number>;
  
  // Drivers
  activationDrivers: string[];
  
  // Baseline match (if applicable)
  matchedBaselineId?: string;
  similarityToBaseline?: number;
  
  // Decay
  decayedAt?: string;
  decayReason?: "STALE" | "MANUAL" | "SUPERSEDED";
  
  sealedAt: string;
}

// ═══════════════════════════════════════════════════════════════
// LAYER 3 — Extended Match Intelligence
// ═══════════════════════════════════════════════════════════════

export interface BaselineMatchMetadata {
  baselineId: string;
  
  // Similarity dimensions
  similarity: number;              // Composite 0-1
  spatialSimilarity: number;     // Geographic overlap
  diseaseSimilarity: number;       // Pathogen pattern match
  temporalSimilarity: number;      // Seasonal alignment
  activationHistorySimilarity: number; // Frequency pattern match
  
  // Algorithm versioning
  scoringAlgorithmVersion: string; // e.g., "v1.2.0-20250630"
  computedAt: string;
  
  // Decision
  decision: CorridorDecision;
  confidence: number;
  
  // Historical context
  baselineActivationCount: number;
  baselineLastActivation: string;
  baselineTypicalSeasons: string[];
  
  // Thresholds applied
  hybridThreshold: number;           // Default: 0.70
  realtimeThreshold: number;       // Default: 0.55
  hypothesisThreshold: number;     // Default: 0.30
}

// ═══════════════════════════════════════════════════════════════
// LAYER 5 — Corridor Explainability
// ═══════════════════════════════════════════════════════════════

export interface CorridorExplainability {
  // Why?
  activationDrivers: string[]; // ['cholera_cluster', 'population_displacement', 'historical_reactivation']
  driverWeights: Record<string, number>;
  
  // How? (8-Soul Scoring)
  soulScores: {
    gravity: number;
    diffusion: number;
    centrality: number;
    hmm: number;
    seasonal: number;
    linguistic: number;
    entropy: number;
    friction: number;
  };
  
  // Compared To What?
  baselineComparison?: {
    baselineId: string;
    baselineName: string;
    similarity: number;
    comparedAt: string;
  };
  
  // Signal provenance
  signalBreakdown: {
    acled: number;
    dtm: number;
    dhis2: number;
    sentinel: number;
    manual: number;
  };
  
  // Uncertainty quantification
  confidenceIntervals: {
    scoreLower: number;
    scoreUpper: number;
    predictionHorizon: number; // hours
  };
}

// ═══════════════════════════════════════════════════════════════
// MoScript: Hypothesis Detection Engine
// ═══════════════════════════════════════════════════════════════

const mo_HYPOTHESIS_DETECTION: MoScript = {
  id: "mo-poe-hypothesis-detect-v1-001" as `mo-${string}-${string}-${number}`,
  name: "Corridor Hypothesis Detection",
  trigger: 'event("signals.clustered")',
  inputs: ["signalCluster", "corridorRepo", "intelligenceEngine"],
  logic: async (inputs: Record<string, any>) => {
    const { signalCluster, corridorRepo, intelligenceEngine } = inputs as {
      signalCluster: {
        clusterId: string;
        signals: Array<{
          signalId: string;
          lat: number;
          lng: number;
          timestamp: string;
          disease?: string;
          magnitude: number;
        }>;
        centroid: { lat: number; lng: number };
        radiusKm: number;
        signalCount: number;
      };
      corridorRepo: {
        findNearbyCorridors: (lat: number, lng: number, radiusKm: number) => Promise<CorridorMemory[]>;
        createHypothesis: (hypothesis: Partial<CorridorMemory>) => Promise<CorridorMemory>;
      };
      intelligenceEngine: {
        computeHypothesisScore: (signals: any[]) => Promise<{ score: number; drivers: string[] }>;
      };
    };
    
    const { score, drivers } = await intelligenceEngine.computeHypothesisScore(signalCluster.signals);
    
    // HYPOTHESIS threshold: 0.30-0.55
    // Below 0.30: INSUFFICIENT_EVIDENCE
    // Above 0.55: Promote to REALTIME or HYBRID (via mo_LIVE_BASELINE_COMPARE)
    if (score < 0.30) {
      return {
        clusterId: signalCluster.clusterId,
        decision: "INSUFFICIENT_EVIDENCE" as CorridorDecision,
        score,
        threshold: 0.30,
        message: "Signal cluster below hypothesis threshold. Discarded.",
      };
    }
    
    if (score >= 0.55) {
      // Pass to live-baseline comparison for mode assignment
      return {
        clusterId: signalCluster.clusterId,
        decision: "HYPOTHESIS_UPGRADE" as CorridorDecision,
        score,
        message: "Cluster exceeds hypothesis threshold. Routing to live-baseline comparison.",
        routeTo: "mo_COMPARE_LIVE_TO_BASELINE",
      };
    }
    
    // Create HYPOTHESIS corridor
    const nearby = await corridorRepo.findNearbyCorridors(
      signalCluster.centroid.lat,
      signalCluster.centroid.lng,
      signalCluster.radiusKm * 2
    );
    
    const hypothesis = await corridorRepo.createHypothesis({
      canonicalName: `HYPOTHESIS-${signalCluster.clusterId}`,
      geography: {
        startNode: "unknown",
        endNode: "unknown",
        startCoord: signalCluster.centroid,
        endCoord: signalCluster.centroid,
      },
      state: "HYPOTHESIS",
      evidenceClass: "HYPOTHESIS",
      activationDrivers: drivers,
      liveSignalCount: signalCluster.signalCount,
    });
    
    return {
      clusterId: signalCluster.clusterId,
      decision: "HYPOTHESIS_UPGRADE" as CorridorDecision,
      hypothesisId: hypothesis.corridorId,
      score,
      nearbyCorridors: nearby.length,
      message: `Hypothesis ${hypothesis.corridorId} created. ${nearby.length} nearby corridors for comparison.`,
    };
  },
  voiceLine: (r: { decision: string; hypothesisId?: string; score?: number }) =>
    r.decision === "INSUFFICIENT_EVIDENCE"
      ? `Cluster below threshold. Discarded.`
      : `Hypothesis ${r.hypothesisId?.slice(0, 12)}... sealed. Score: ${r.score?.toFixed(2)}.`,
  sass: true,
};

// ═══════════════════════════════════════════════════════════════
// MoScript: Corridor Decay Engine
// ═══════════════════════════════════════════════════════════════

const mo_CORRIDOR_DECAY: MoScript = {
  id: "mo-poe-corridor-decay-v1-001" as `mo-${string}-${string}-${number}`,
  name: "Corridor Decay Engine",
  trigger: 'cron("0 0 * * *")', // Daily at midnight
  inputs: ["corridorRepo", "decayConfig"],
  logic: async (inputs: Record<string, any>) => {
    const { corridorRepo, decayConfig } = inputs as {
      corridorRepo: {
        getActiveCorridors: () => Promise<CorridorMemory[]>;
        archiveCorridor: (id: string, reason: string) => Promise<CorridorMemory>;
        updateExpiresAt: (id: string, expiresAt: string) => Promise<void>;
      };
      decayConfig?: {
        realtimeTimeoutHours?: number;
        hybridTimeoutHours?: number;
        hypothesisTimeoutHours?: number;
      };
    };
    
    const config = {
      realtimeTimeoutHours: decayConfig?.realtimeTimeoutHours || 168,    // 7 days
      hybridTimeoutHours: decayConfig?.hybridTimeoutHours || 336,        // 14 days
      hypothesisTimeoutHours: decayConfig?.hypothesisTimeoutHours || 72, // 3 days
    };
    
    const active = await corridorRepo.getActiveCorridors();
    const now = new Date();
    const archived: string[] = [];
    const extended: string[] = [];
    
    for (const corridor of active) {
      const lastSignal = corridor.lastLiveSignalAt 
        ? new Date(corridor.lastLiveSignalAt) 
        : null;
      
      if (!lastSignal) continue;
      
      const hoursSinceSignal = (now.getTime() - lastSignal.getTime()) / (1000 * 60 * 60);
      
      let shouldArchive = false;
      let timeoutHours = 0;
      
      switch (corridor.state) {
        case "REALTIME":
          timeoutHours = config.realtimeTimeoutHours;
          shouldArchive = hoursSinceSignal > timeoutHours;
          break;
        case "HYBRID":
          timeoutHours = config.hybridTimeoutHours;
          shouldArchive = hoursSinceSignal > timeoutHours;
          break;
        case "HYPOTHESIS":
          timeoutHours = config.hypothesisTimeoutHours;
          shouldArchive = hoursSinceSignal > timeoutHours;
          break;
        default:
          // FIELD_CONFIRMED, REFERENCE, ARCHIVED don't auto-decay
          continue;
      }
      
      if (shouldArchive) {
        await corridorRepo.archiveCorridor(corridor.corridorId, "STALE");
        archived.push(corridor.corridorId);
      } else {
        // Extend expiration
        const expiresAt = new Date(lastSignal.getTime() + timeoutHours * 60 * 60 * 1000);
        await corridorRepo.updateExpiresAt(corridor.corridorId, expiresAt.toISOString());
        extended.push(corridor.corridorId);
      }
    }
    
    return {
      checked: active.length,
      archived: archived.length,
      extended: extended.length,
      archivedIds: archived,
      runAt: now.toISOString(),
    };
  },
  voiceLine: (r: { checked: number; archived: number }) =>
    `Decay check sealed. ${r.checked} corridors evaluated. ${r.archived} archived.`,
  sass: true,
};

// ═══════════════════════════════════════════════════════════════
// MoScript: Field Confirmation Gateway
// ═══════════════════════════════════════════════════════════════

const mo_FIELD_CONFIRMATION: MoScript = {
  id: "mo-poe-field-confirm-v1-001" as `mo-${string}-${string}-${number}`,
  name: "Field Confirmation Gateway",
  trigger: 'event("field.report.submitted")',
  inputs: ["corridorId", "fieldReport", "corridorRepo"],
  logic: async (inputs: Record<string, any>) => {
    const { corridorId, fieldReport, corridorRepo } = inputs as {
      corridorId: string;
      fieldReport: {
        reporterId: string;
        reporterOrg: string;
        verificationLevel: "VISUAL" | "SAMPLED" | "LAB_CONFIRMED";
        observedDisease?: string;
        observedCases?: number;
        observedDeaths?: number;
        photos?: string[];
        coordinates: { lat: number; lng: number };
        timestamp: string;
        notes: string;
      };
      corridorRepo: {
        getCorridor: (id: string) => Promise<CorridorMemory | null>;
        promoteToFieldConfirmed: (id: string, report: any) => Promise<CorridorMemory>;
        recordActivation: (corridorId: string, activation: Partial<CorridorActivation>) => Promise<void>;
      };
    };
    
    const corridor = await corridorRepo.getCorridor(corridorId);
    
    if (!corridor) {
      throw new Error(`Corridor ${corridorId} not found`);
    }
    
    // Only REALTIME or HYBRID can be field-confirmed
    if (!["REALTIME", "HYBRID", "HYPOTHESIS"].includes(corridor.state)) {
      return {
        corridorId,
        confirmed: false,
        reason: `Corridor in state ${corridor.state} cannot be field-confirmed. Must be REALTIME, HYBRID, or HYPOTHESIS.`,
      };
    }
    
    const previousState = corridor.state;
    
    // Promote to FIELD_CONFIRMED
    const confirmed = await corridorRepo.promoteToFieldConfirmed(corridorId, fieldReport);
    
    // Record as new activation
    const activation: Partial<CorridorActivation> = {
      activationId: `ACT-${corridorId}-${Date.now()}`,
      sequence: corridor.activationCount + 1,
      startedAt: fieldReport.timestamp,
      state: "FIELD_CONFIRMED",
      previousState,
      signalCount: corridor.liveSignalCount,
      evidenceClass: "FIELD_CONFIRMED",
      corridorScore: confirmed.baselineMatch?.similarity || 0.85,
      riskClass: "HIGH",
      activationDrivers: ["field_verification", ...confirmed.activationDrivers],
      matchedBaselineId: confirmed.baselineMatch?.baselineId,
      similarityToBaseline: confirmed.baselineMatch?.similarity,
      sealedAt: new Date().toISOString(),
    };
    
    await corridorRepo.recordActivation(corridorId, activation);
    
    return {
      corridorId,
      confirmed: true,
      previousState,
      newState: "FIELD_CONFIRMED",
      activationId: activation.activationId,
      reporter: fieldReport.reporterOrg,
      verificationLevel: fieldReport.verificationLevel,
      sealedAt: activation.sealedAt,
    };
  },
  voiceLine: (r: { confirmed: boolean; corridorId: string; newState?: string }) =>
    r.confirmed
      ? `Field confirmation sealed for ${r.corridorId.slice(0, 12)}... State: ${r.newState}.`
      : `Field confirmation rejected for ${r.corridorId.slice(0, 12)}...`,
  sass: true,
};

// ═══════════════════════════════════════════════════════════════
// MoScript: Activation Historian
// ═══════════════════════════════════════════════════════════════

const mo_ACTIVATION_HISTORIAN: MoScript = {
  id: "mo-poe-activation-historian-v1-001" as `mo-${string}-${string}-${number}`,
  name: "Corridor Activation Historian",
  trigger: 'event("corridor.state.changed")',
  inputs: ["corridorId", "previousState", "newState", "activationRepo"],
  logic: async (inputs: Record<string, any>) => {
    const { corridorId, previousState, newState, activationRepo } = inputs as {
      corridorId: string;
      previousState: CorridorMemoryState;
      newState: CorridorMemoryState;
      activationRepo: {
        recordStateTransition: (transition: {
          transitionId: string;
          corridorId: string;
          previousState: CorridorMemoryState;
          newState: CorridorMemoryState;
          transitionedAt: string;
          triggeredBy: string;
        }) => Promise<void>;
        getActivationCount: (corridorId: string) => Promise<number>;
      };
    };
    
    const transitionId = `TRANS-${corridorId}-${Date.now()}`;
    const transitionedAt = new Date().toISOString();
    
    // Record the transition
    await activationRepo.recordStateTransition({
      transitionId,
      corridorId,
      previousState,
      newState,
      transitionedAt,
      triggeredBy: determineTriggerSource(previousState, newState),
    });
    
    // If activating from non-active to active, record new activation
    const activatingTransitions = [
      ["REFERENCE", "HYBRID"],
      ["HYPOTHESIS", "REALTIME"],
      ["HYPOTHESIS", "HYBRID"],
      ["REALTIME", "HYBRID"],
      ["HYBRID", "FIELD_CONFIRMED"],
      ["REALTIME", "FIELD_CONFIRMED"],
    ];
    
    const isActivating = activatingTransitions.some(
      ([from, to]) => from === previousState && to === newState
    );
    
    if (isActivating) {
      const sequence = await activationRepo.getActivationCount(corridorId);
      
      return {
        corridorId,
        transitionId,
        previousState,
        newState,
        isActivating: true,
        newActivationSequence: sequence + 1,
        message: `New activation recorded. Corridor ${corridorId} activation #${sequence + 1}.`,
        transitionedAt,
      };
    }
    
    return {
      corridorId,
      transitionId,
      previousState,
      newState,
      isActivating: false,
      transitionedAt,
    };
  },
  voiceLine: (r: { corridorId: string; newState: string; isActivating: boolean; newActivationSequence?: number }) =>
    r.isActivating
      ? `Activation ${r.newActivationSequence} sealed for ${r.corridorId.slice(0, 12)}...`
      : `State transition sealed: ${r.newState}.`,
  sass: true,
};

// ═══════════════════════════════════════════════════════════════
// Helper: Determine Trigger Source
// ═══════════════════════════════════════════════════════════════

function determineTriggerSource(
  previousState: CorridorMemoryState,
  newState: CorridorMemoryState
): string {
  if (previousState === "REFERENCE" && newState === "HYBRID") {
    return "live_match";
  }
  if (previousState === "HYPOTHESIS" && newState === "REALTIME") {
    return "threshold_crossed";
  }
  if (newState === "FIELD_CONFIRMED") {
    return "field_report";
  }
  if (newState === "ARCHIVED") {
    return "decay";
  }
  return "system";
}

// ═══════════════════════════════════════════════════════════════
// LAYER 7 — Mode Governance (Legal Transitions)
// ═══════════════════════════════════════════════════════════════

export const LEGAL_STATE_TRANSITIONS: Record<CorridorMemoryState, CorridorMemoryState[]> = {
  REFERENCE: ["HYPOTHESIS", "HYBRID"],
  HYPOTHESIS: ["REALTIME", "HYBRID", "ARCHIVED"],
  REALTIME: ["HYBRID", "FIELD_CONFIRMED", "ARCHIVED"],
  HYBRID: ["FIELD_CONFIRMED", "ARCHIVED"],
  FIELD_CONFIRMED: ["ARCHIVED"], // Requires admin to go back
  ARCHIVED: [], // Terminal state (unless admin override)
};

export function isLegalTransition(
  from: CorridorMemoryState,
  to: CorridorMemoryState
): boolean {
  return LEGAL_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ═══════════════════════════════════════════════════════════════
// LAYER 8 — Staleness Configuration
// ═══════════════════════════════════════════════════════════════

export const STALENESS_CONFIG = {
  REALTIME: { timeoutHours: 168, warningHours: 120 },      // 7 days, warn at 5 days
  HYBRID: { timeoutHours: 336, warningHours: 264 },      // 14 days, warn at 11 days
  HYPOTHESIS: { timeoutHours: 72, warningHours: 48 },     // 3 days, warn at 2 days
  FIELD_CONFIRMED: { timeoutHours: 720, warningHours: 600 }, // 30 days for confirmed
} as const;

// ═══════════════════════════════════════════════════════════════
// Export All Memory Doctrine Scripts
// ═══════════════════════════════════════════════════════════════

export const CORRIDOR_MEMORY_SCRIPTS = [
  mo_HYPOTHESIS_DETECTION,
  mo_CORRIDOR_DECAY,
  mo_FIELD_CONFIRMATION,
  mo_ACTIVATION_HISTORIAN,
] as const;

// Individual scripts are accessible via CORRIDOR_MEMORY_SCRIPTS array index
// Or destructure: const { mo_HYPOTHESIS_DETECTION } = require('./corridor.memory')
