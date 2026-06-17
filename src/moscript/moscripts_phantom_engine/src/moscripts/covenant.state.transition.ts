/**
 * ◉⟁⬡  MoStar Industries
 * Phantom POE — Covenant-Gated State Transition
 * 
 * Core Rule: No corridor changes state unless a MoScript seals it.
 * This is the gatekeeper for all corridor state transitions.
 */

import crypto from "node:crypto";
import { MoScript } from "./types";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type CorridorMemoryState = 
  | "REFERENCE"
  | "HYPOTHESIS"
  | "REALTIME"
  | "HYBRID"
  | "FIELD_CONFIRMED"
  | "ARCHIVED";

export interface StateTransitionCandidate {
  corridorId: string;
  activationId: string;
  fromState: CorridorMemoryState;
  toState: CorridorMemoryState;
  candidateScore: number;
  transitionReason: string;
  transitionMetadata?: Record<string, unknown>;
  adminOverride?: boolean;
  adminOverrideBy?: string;
  adminOverrideReason?: string;
}

export interface TruthEngineVerdict {
  status: "approved" | "denied";
  reasons: string[];
  hash: string;
  confidence: number;
  evaluatedAt: string;
}

export interface SealedTransition {
  transitionId: string;
  corridorId: string;
  activationId: string;
  fromState: CorridorMemoryState;
  toState: CorridorMemoryState;
  covenantSeal: string;
  approvedBy: string;
  approvedAt: string;
  truthEngineVerdict: TruthEngineVerdict;
  adminOverride: boolean;
  transitionReason: string;
  transitionMetadata: Record<string, unknown>;
}

export interface TransitionResult {
  approved: boolean;
  transition?: SealedTransition;
  corridorId: string;
  fromState: CorridorMemoryState;
  toState: CorridorMemoryState;
  reason?: string[];
}

// ═══════════════════════════════════════════════════════════════
// STATE TRANSITION MATRIX
// ═══════════════════════════════════════════════════════════════

const ALLOWED_TRANSITIONS: Record<CorridorMemoryState, CorridorMemoryState[]> = {
  REFERENCE: ["HYPOTHESIS", "REALTIME", "HYBRID"],
  HYPOTHESIS: ["REALTIME", "ARCHIVED"],
  REALTIME: ["HYBRID", "FIELD_CONFIRMED", "ARCHIVED"],
  HYBRID: ["FIELD_CONFIRMED", "ARCHIVED"],
  FIELD_CONFIRMED: ["ARCHIVED"],
  ARCHIVED: ["HYPOTHESIS", "REALTIME", "HYBRID"],
};

const TRANSITION_REQUIREMENTS: Record<string, string> = {
  "REFERENCE→HYPOTHESIS": "Signal cluster detected, threshold not met",
  "REFERENCE→REALTIME": "Live evidence matches historical pattern",
  "REFERENCE→HYBRID": "Historical reactivated by live evidence",
  "HYPOTHESIS→REALTIME": "Threshold met (score >= 0.55)",
  "HYPOTHESIS→ARCHIVED": "Evidence decayed, hypothesis rejected",
  "REALTIME→HYBRID": "Historical match found",
  "REALTIME→FIELD_CONFIRMED": "Ground verification received",
  "REALTIME→ARCHIVED": "Staleness timeout (no signals for 30 days)",
  "HYBRID→FIELD_CONFIRMED": "Ground verification received",
  "HYBRID→ARCHIVED": "Staleness timeout (no signals for 30 days)",
  "FIELD_CONFIRMED→ARCHIVED": "Inactive for extended period (90 days)",
  "ARCHIVED→HYPOTHESIS": "New signals detected",
  "ARCHIVED→REALTIME": "Strong live evidence (score >= 0.70)",
  "ARCHIVED→HYBRID": "Historical pattern re-emerging",
};

// ═══════════════════════════════════════════════════════════════
// TRUTH ENGINE
// ═══════════════════════════════════════════════════════════════

class TruthEngine {
  /**
   * Evaluate a state transition candidate
   */
  async evaluate(candidate: StateTransitionCandidate): Promise<TruthEngineVerdict> {
    const reasons: string[] = [];
    let approved = true;

    // Check 1: Is transition allowed in matrix?
    const allowed = ALLOWED_TRANSITIONS[candidate.fromState]?.includes(candidate.toState);
    if (!allowed && !candidate.adminOverride) {
      approved = false;
      reasons.push(`Transition ${candidate.fromState}→${candidate.toState} not allowed in state matrix`);
    }

    // Check 2: Does transition reason match requirement?
    const transitionKey = `${candidate.fromState}→${candidate.toState}`;
    const expectedReason = TRANSITION_REQUIREMENTS[transitionKey];
    if (expectedReason && !candidate.transitionReason.includes(expectedReason.split(" ")[0]) && !candidate.adminOverride) {
      approved = false;
      reasons.push(`Transition reason does not match requirement: ${expectedReason}`);
    }

    // Check 3: Score threshold validation
    if (candidate.toState === "REALTIME" && candidate.candidateScore < 0.55 && !candidate.adminOverride) {
      approved = false;
      reasons.push(`Score ${candidate.candidateScore.toFixed(2)} below REALTIME threshold (0.55)`);
    }

    if (candidate.toState === "HYBRID" && candidate.candidateScore < 0.65 && !candidate.adminOverride) {
      approved = false;
      reasons.push(`Score ${candidate.candidateScore.toFixed(2)} below HYBRID threshold (0.65)`);
    }

    if (candidate.toState === "FIELD_CONFIRMED" && candidate.candidateScore < 0.75 && !candidate.adminOverride) {
      approved = false;
      reasons.push(`Score ${candidate.candidateScore.toFixed(2)} below FIELD_CONFIRMED threshold (0.75)`);
    }

    // Check 4: Admin override validation
    if (candidate.adminOverride) {
      if (!candidate.adminOverrideBy || !candidate.adminOverrideReason) {
        approved = false;
        reasons.push("Admin override requires adminOverrideBy and adminOverrideReason");
      } else {
        reasons.push(`Admin override by ${candidate.adminOverrideBy}: ${candidate.adminOverrideReason}`);
      }
    }

    // Generate seal hash
    const hashInput = JSON.stringify({
      corridorId: candidate.corridorId,
      fromState: candidate.fromState,
      toState: candidate.toState,
      score: candidate.candidateScore,
      reason: candidate.transitionReason,
      timestamp: new Date().toISOString(),
    });
    const hash = crypto.createHash("sha256").update(hashInput).digest("hex");

    return {
      status: approved ? "approved" : "denied",
      reasons,
      hash,
      confidence: approved ? 0.95 : 0.0,
      evaluatedAt: new Date().toISOString(),
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// CORRIDOR REPOSITORY (STUB)
// ═══════════════════════════════════════════════════════════════

class CorridorRepository {
  /**
   * Execute a sealed state transition
   */
  async transitionState(params: {
    corridorId: string;
    fromState: CorridorMemoryState;
    toState: CorridorMemoryState;
    activationId: string;
    covenantSeal: string;
    transitionReason: string;
    transitionMetadata?: Record<string, unknown>;
    truthEngineVerdict: TruthEngineVerdict;
    adminOverride?: boolean;
    adminOverrideBy?: string;
    adminOverrideReason?: string;
  }): Promise<SealedTransition> {
    const transitionId = `TRANS-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

    // In production, this would write to:
    // 1. corridor_state_transitions (audit trail)
    // 2. corridor_memory_state (current state)
    // 3. corridor_activations (if creating new activation)

    const transition: SealedTransition = {
      transitionId,
      corridorId: params.corridorId,
      activationId: params.activationId,
      fromState: params.fromState,
      toState: params.toState,
      covenantSeal: params.covenantSeal,
      approvedBy: "mo-poe-covenant-state-transition-001",
      approvedAt: new Date().toISOString(),
      truthEngineVerdict: params.truthEngineVerdict,
      adminOverride: params.adminOverride ?? false,
      transitionReason: params.transitionReason,
      transitionMetadata: params.transitionMetadata ?? {},
    };

    console.log(`  [COVENANT] Sealed transition: ${params.corridorId} ${params.fromState} → ${params.toState}`);
    console.log(`  [COVENANT] Seal: ${params.covenantSeal.slice(0, 16)}...`);
    console.log(`  [COVENANT] Transition ID: ${transitionId}`);

    return transition;
  }

  /**
   * Get current state of a corridor
   */
  async getCurrentState(corridorId: string): Promise<CorridorMemoryState | null> {
    // In production, query corridor_memory_state
    return null; // Stub
  }
}

// ═══════════════════════════════════════════════════════════════
// MO-SCRIPT: COVENANT-GATED STATE TRANSITION
// ═══════════════════════════════════════════════════════════════

export const mo_COVENANT_STATE_TRANSITION: MoScript = {
  id: "mo-poe-covenant-state-transition-001" as `mo-${string}-${string}-${number}`,
  name: "Covenant-Gated Corridor State Transition",
  trigger: 'event("corridor.activation.candidate")',
  inputs: ["candidate", "truthEngine", "corridorRepo"],
  logic: async (inputs: Record<string, unknown>): Promise<TransitionResult> => {
    const { candidate, truthEngine, corridorRepo } = inputs as {
      candidate: StateTransitionCandidate;
      truthEngine?: TruthEngine;
      corridorRepo?: CorridorRepository;
    };

    const engine = truthEngine ?? new TruthEngine();
    const repo = corridorRepo ?? new CorridorRepository();

    // Evaluate the candidate
    const verdict = await engine.evaluate(candidate);

    if (verdict.status !== "approved") {
      return {
        approved: false,
        corridorId: candidate.corridorId,
        fromState: candidate.fromState,
        toState: candidate.toState,
        reason: verdict.reasons,
      };
    }

    // Execute the sealed transition
    const transition = await repo.transitionState({
      corridorId: candidate.corridorId,
      fromState: candidate.fromState,
      toState: candidate.toState,
      activationId: candidate.activationId,
      covenantSeal: verdict.hash,
      transitionReason: candidate.transitionReason,
      transitionMetadata: candidate.transitionMetadata,
      truthEngineVerdict: verdict,
      adminOverride: candidate.adminOverride,
      adminOverrideBy: candidate.adminOverrideBy,
      adminOverrideReason: candidate.adminOverrideReason,
    });

    return {
      approved: true,
      transition,
      corridorId: candidate.corridorId,
      fromState: candidate.fromState,
      toState: candidate.toState,
    };
  },
  voiceLine: (result: TransitionResult) =>
    result.approved
      ? `Corridor state sealed. ${result.fromState} to ${result.toState}.`
      : `Corridor transition denied. Covenant gate held.`,
};

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export const COVENANT_SCRIPTS = [mo_COVENANT_STATE_TRANSITION];
