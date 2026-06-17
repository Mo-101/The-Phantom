/**
 * ◉⟁⬡  MoStar Industries
 * Phantom POE — Covenant Transition Guard
 * 
 * Enforces covenant-gated state transitions.
 * No corridor can ascend the memory ladder without a sealed covenant check.
 */

import type { CorridorMemoryState } from "./covenant.state.transition";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type GateStatus = "PASS" | "FAIL" | "PASS_WITH_FLAGS";

export interface GateResult {
  gate: string;
  status: GateStatus;
  score: number;
  flags: string[];
  reason: string;
}

export interface CovenantContext {
  interpretation: string;
  truth_score: number;
  ethic_score: number;
  ethic_flags: string[];
  cultural_score: number;
  cultural_flags: string[];
  bias_score: number;
  bias_flags: string[];
  region: string;
  evidence: {
    raw_signal_score: number;
    memory_state: CorridorMemoryState;
    modulation_factor: number;
    source_data: string;
  };
}

export interface CovenantVerdict {
  overall_status: GateStatus;
  covenant_seal: string | null;
  covenant_log: string;
  gate_breakdown: Record<string, GateResult>;
  evaluated_at: string;
}

export interface TransitionGuardResult {
  success: boolean;
  seal?: string;
  log?: string;
  gate_breakdown?: Record<string, unknown>;
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════
// TRANSITION REQUIREMENTS
// ═══════════════════════════════════════════════════════════════

interface TransitionRequirement {
  fromState: CorridorMemoryState;
  toState: CorridorMemoryState;
  covenantRequired: boolean;
  requiredGates: string[];
  rationale: string;
}

const TRANSITION_REQUIREMENTS: TransitionRequirement[] = [
  {
    fromState: "REFERENCE",
    toState: "HYPOTHESIS",
    covenantRequired: true,
    requiredGates: ["truth", "ethics"],
    rationale: "Moving from pure history to active investigation. Needs factual signal and ethical source.",
  },
  {
    fromState: "HYPOTHESIS",
    toState: "REALTIME",
    covenantRequired: true,
    requiredGates: ["truth", "ethics", "culture", "bias"],
    rationale: "Highest risk: corridor goes live, may trigger alerts. Full covenant.",
  },
  {
    fromState: "REALTIME",
    toState: "FIELD_CONFIRMED",
    covenantRequired: true,
    requiredGates: ["truth", "culture", "bias"],
    rationale: "Human-confirmed outbreak; must verify unbiased, culturally appropriate reporting.",
  },
  {
    fromState: "REALTIME",
    toState: "HYPOTHESIS",
    covenantRequired: false,
    requiredGates: [],
    rationale: "Decay is automatic; no ethical check needed.",
  },
  {
    fromState: "HYPOTHESIS",
    toState: "ARCHIVED",
    covenantRequired: false,
    requiredGates: [],
    rationale: "Evidence decayed; archival is housekeeping.",
  },
  {
    fromState: "REALTIME",
    toState: "ARCHIVED",
    covenantRequired: false,
    requiredGates: [],
    rationale: "Staleness timeout; archival is housekeeping.",
  },
  {
    fromState: "HYBRID",
    toState: "ARCHIVED",
    covenantRequired: false,
    requiredGates: [],
    rationale: "Staleness timeout; archival is housekeeping.",
  },
  {
    fromState: "FIELD_CONFIRMED",
    toState: "ARCHIVED",
    covenantRequired: false,
    requiredGates: [],
    rationale: "After action, preservation.",
  },
  {
    fromState: "ARCHIVED",
    toState: "REFERENCE",
    covenantRequired: true,
    requiredGates: ["truth"],
    rationale: "Resurrecting from archive needs factual re-validation.",
  },
  {
    fromState: "ARCHIVED",
    toState: "HYPOTHESIS",
    covenantRequired: true,
    requiredGates: ["truth"],
    rationale: "Reactivating from archive needs factual validation.",
  },
];

// ═══════════════════════════════════════════════════════════════
// COVENANT CHECK ENGINE
// ═══════════════════════════════════════════════════════════════

class CovenantCheckEngine {
  /**
   * Run truth gate check
   */
  private checkTruthGate(context: CovenantContext): GateResult {
    const { truth_score, evidence } = context;
    const flags: string[] = [];

    // Truth gate checks
    if (truth_score < 0.70) {
      flags.push("low_truth_score");
    }
    if (evidence.modulation_factor < 0.8) {
      flags.push("memory_dampening");
    }

    const status = truth_score >= 0.70 && flags.length === 0 ? "PASS" : 
                  truth_score >= 0.60 ? "PASS_WITH_FLAGS" : "FAIL";

    return {
      gate: "truth",
      status,
      score: truth_score,
      flags,
      reason: status === "FAIL" ? "Truth score below threshold" : "Truth validation passed",
    };
  }

  /**
   * Run ethics gate check
   */
  private checkEthicsGate(context: CovenantContext): GateResult {
    const { ethic_score, ethic_flags } = context;
    const flags = [...ethic_flags];

    const status = ethic_score >= 0.80 && flags.length === 0 ? "PASS" : 
                  ethic_score >= 0.60 ? "PASS_WITH_FLAGS" : "FAIL";

    return {
      gate: "ethics",
      status,
      score: ethic_score,
      flags,
      reason: status === "FAIL" ? "Ethical concerns detected" : "Ethical validation passed",
    };
  }

  /**
   * Run culture gate check
   */
  private checkCultureGate(context: CovenantContext): GateResult {
    const { cultural_score, cultural_flags } = context;
    const flags = [...cultural_flags];

    const status = cultural_score >= 0.75 && flags.length === 0 ? "PASS" : 
                  cultural_score >= 0.60 ? "PASS_WITH_FLAGS" : "FAIL";

    return {
      gate: "culture",
      status,
      score: cultural_score,
      flags,
      reason: status === "FAIL" ? "Cultural concerns detected" : "Cultural validation passed",
    };
  }

  /**
   * Run bias gate check
   */
  private checkBiasGate(context: CovenantContext): GateResult {
    const { bias_score, bias_flags } = context;
    const flags = [...bias_flags];

    const status = bias_score >= 0.70 && flags.length === 0 ? "PASS" : 
                  bias_score >= 0.55 ? "PASS_WITH_FLAGS" : "FAIL";

    return {
      gate: "bias",
      status,
      score: bias_score,
      flags,
      reason: status === "FAIL" ? "Bias concerns detected" : "Bias validation passed",
    };
  }

  /**
   * Run full covenant check
   */
  runCovenantCheck(context: CovenantContext, requiredGates: string[]): CovenantVerdict {
    const gateBreakdown: Record<string, GateResult> = {
      truth: this.checkTruthGate(context),
      ethics: this.checkEthicsGate(context),
      culture: this.checkCultureGate(context),
      bias: this.checkBiasGate(context),
    };

    // Check only required gates
    const requiredResults = requiredGates.map(gate => gateBreakdown[gate]);
    const anyFail = requiredResults.some((r: GateResult) => r.status === "FAIL");
    const anyFlags = requiredResults.some((r: GateResult) => r.status === "PASS_WITH_FLAGS");

    const overallStatus: GateStatus = anyFail ? "FAIL" : anyFlags ? "PASS_WITH_FLAGS" : "PASS";

    // Generate seal if passed
    const covenant_seal = overallStatus !== "FAIL" ? this.generateSeal(context, gateBreakdown) : null;

    // Generate markdown log
    const covenant_log = this.generateMarkdownLog(context, gateBreakdown, overallStatus);

    return {
      overall_status: overallStatus,
      covenant_seal,
      covenant_log,
      gate_breakdown: gateBreakdown,
      evaluated_at: new Date().toISOString(),
    };
  }

  /**
   * Generate covenant seal
   */
  private generateSeal(context: CovenantContext, gateBreakdown: Record<string, GateResult>): string {
    const input = JSON.stringify({
      truth_score: context.truth_score,
      ethic_score: context.ethic_score,
      cultural_score: context.cultural_score,
      bias_score: context.bias_score,
      timestamp: new Date().toISOString(),
    });
    // Simple hash for simulation (in production, use crypto)
    return `SEAL-${input.length}-${input.slice(0, 8).toUpperCase()}`;
  }

  /**
   * Generate markdown log
   */
  private generateMarkdownLog(context: CovenantContext, gateBreakdown: Record<string, GateResult>, overallStatus: GateStatus): string {
    const lines: string[] = [
      "## Covenant Check – Truth Validation Report",
      "",
      `Overall Status: ${overallStatus}`,
      "",
      "### Truth Gate",
      `- Status: ${gateBreakdown.truth.status}`,
      `- Score: ${gateBreakdown.truth.score.toFixed(2)}`,
      gateBreakdown.truth.flags.length > 0 ? `- Flags: ${gateBreakdown.truth.flags.join(", ")}` : "",
      "",
      "### Ethics Gate",
      `- Status: ${gateBreakdown.ethics.status}`,
      `- Score: ${gateBreakdown.ethics.score.toFixed(2)}`,
      gateBreakdown.ethics.flags.length > 0 ? `- Flags: ${gateBreakdown.ethics.flags.join(", ")}` : "",
      "",
      "### Culture Gate",
      `- Status: ${gateBreakdown.culture.status}`,
      `- Score: ${gateBreakdown.culture.score.toFixed(2)}`,
      gateBreakdown.culture.flags.length > 0 ? `- Flags: ${gateBreakdown.culture.flags.join(", ")}` : "",
      "",
      "### Bias Gate",
      `- Status: ${gateBreakdown.bias.status}`,
      `- Score: ${gateBreakdown.bias.score.toFixed(2)}`,
      gateBreakdown.bias.flags.length > 0 ? `- Flags: ${gateBreakdown.bias.flags.join(", ")}` : "",
      "",
      "### Evidence",
      `- Raw Signal Score: ${context.evidence.raw_signal_score.toFixed(3)}`,
      `- Memory State: ${context.evidence.memory_state}`,
      `- Modulation Factor: ×${context.evidence.modulation_factor.toFixed(2)}`,
      `- Source Data: ${context.evidence.source_data}`,
    ];

    return lines.filter(line => line !== "").join("\n");
  }
}

// ═══════════════════════════════════════════════════════════════
// TRANSITION GUARD
// ═══════════════════════════════════════════════════════════════

class TransitionGuard {
  private covenantEngine: CovenantCheckEngine;

  constructor() {
    this.covenantEngine = new CovenantCheckEngine();
  }

  /**
   * Get transition requirement
   */
  private getRequirement(fromState: CorridorMemoryState, toState: CorridorMemoryState): TransitionRequirement | null {
    return TRANSITION_REQUIREMENTS.find(
      r => r.fromState === fromState && r.toState === toState
    ) ?? null;
  }

  /**
   * Attempt state transition with covenant guard
   */
  async attemptTransition(
    corridorId: string,
    fromState: CorridorMemoryState,
    toState: CorridorMemoryState,
    context: CovenantContext
  ): Promise<TransitionGuardResult> {
    const requirement = this.getRequirement(fromState, toState);

    if (!requirement) {
      return {
        success: false,
        reason: "Unknown transition",
      };
    }

    // If no covenant required, allow transition
    if (!requirement.covenantRequired) {
      return {
        success: true,
        reason: requirement.rationale,
      };
    }

    // Run covenant check
    const verdict = this.covenantEngine.runCovenantCheck(context, requirement.requiredGates);

    if (verdict.covenant_seal && verdict.overall_status !== "FAIL") {
      return {
        success: true,
        seal: verdict.covenant_seal,
        log: verdict.covenant_log,
        gate_breakdown: verdict.gate_breakdown,
        reason: requirement.rationale,
      };
    } else {
      return {
        success: false,
        reason: `Covenant check failed: ${verdict.overall_status}`,
        log: verdict.covenant_log,
        gate_breakdown: verdict.gate_breakdown,
      };
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export const transitionGuard = new TransitionGuard();
export { CovenantCheckEngine, TransitionGuard };
