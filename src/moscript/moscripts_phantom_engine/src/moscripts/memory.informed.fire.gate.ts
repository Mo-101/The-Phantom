/**
 * ◉⟁⬡  MoStar Industries
 * Phantom POE — Memory-Predictive Fire Gate
 * 
 * Core Rule: No Fire activation becomes operational unless the TruthEngine approves it.
 * 
 * NEW APPROACH: Modulate the SCORE (not the threshold) based on memory state.
 * The corridor's memory state modulates the raw disease signal into a memory-informed truth score,
 * which then feeds the covenant's TruthGate.
 */

import { MoScript } from "./types";
import type { CorridorMemoryState } from "./covenant.state.transition";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface FireGateRequest {
  corridorId: string;
  diseaseCode: string;
  memoryState: CorridorMemoryState;
  rawSignalScore: number;  // Raw disease-specific Fire score (0..1)
  uncertainty: number;
  season: "wet" | "dry" | "recession" | "peak";
  signalCount: number;
  signalSources: string[];
}

export interface FireGateResult {
  approved: boolean;
  rawSignalScore: number;
  memoryInformedScore: number;
  modulationFactor: number;
  diseaseFloor: number;
  reason: string[];
  evaluatedAt: string;
  // Evidence for explainability
  evidence: {
    corridorState: CorridorMemoryState;
    modulationFactor: number;
    rawScore: number;
    modulatedScore: number;
    diseaseFloor: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// DISEASE-SPECIFIC FIRE FLOORS (FIXED THRESHOLDS)
// ═══════════════════════════════════════════════════════════════

const DISEASE_FLOORS: Record<string, number> = {
  CHOLERA: 0.66,
  LASSA: 0.76,
  MENINGITIS: 0.72,
  EBOLA: 0.85,
  MARBURG: 0.85,
  MPOX: 0.80,
  MEASLES: 0.70,
  PLAGUE: 0.82,
  RVFEVER: 0.76,
  YELLOWFEVER: 0.77,
  COVID19: 0.68,
  VHF: 0.80,
  OTHER: 0.70,
};

// Export for use in other modules
export { DISEASE_FLOORS };

// ═══════════════════════════════════════════════════════════════
// STATE MODULATION FACTORS (MULTIPLICATIVE)
// ═══════════════════════════════════════════════════════════════
// Grounded in the Memory Doctrine's lifecycle
// Tuneable per disease in future iterations

const STATE_MODULATION: Record<CorridorMemoryState, number> = {
  REFERENCE: 0.85,        // Needs stronger signal to cross threshold; avoid false positives from historical noise
  HYPOTHESIS: 1.00,       // Neutral – current evidence speaks for itself
  REALTIME: 1.15,         // Already in active monitoring; boost sensitivity so weak signals maintain activation
  HYBRID: 1.10,           // Mix of baseline + live; slightly boosted because of ongoing convergence
  FIELD_CONFIRMED: 1.20,  // Highest credibility; even marginal signals should keep corridor lit
  ARCHIVED: 0.60,         // Deep history only; requires exceptional signal to revive
};

// ═══════════════════════════════════════════════════════════════
// MEMORY-INFORMED FIRE SCORE CALCULATION
// ═══════════════════════════════════════════════════════════════

/**
 * Computes the memory‑informed truth score for a corridor.
 * 
 * @param rawSignalScore - Disease‑specific Fire score (0..1) from the multi‑disease scoring engine.
 * @param corridorState  - Current memory state of the corridor.
 * @returns Final truth score (0..1) after memory modulation.
 */
export function computeMemoryInformedFireScore(
  rawSignalScore: number,
  corridorState: CorridorMemoryState
): number {
  const factor = STATE_MODULATION[corridorState];
  // Clamp the result to [0, 1]
  return Math.min(1, Math.max(0, rawSignalScore * factor));
}

// ═══════════════════════════════════════════════════════════════
// MEMORY-PREDICTIVE FIRE GATE
// ═══════════════════════════════════════════════════════════════

class MemoryPredictiveFireGate {
  /**
   * Evaluate fire gate with memory-predictive score modulation
   */
  evaluateFireGate(request: FireGateRequest): FireGateResult {
    const reasons: string[] = [];

    // 1. Get disease floor (fixed threshold)
    const diseaseFloor = DISEASE_FLOORS[request.diseaseCode] ?? DISEASE_FLOORS.OTHER;
    reasons.push(`Disease floor for ${request.diseaseCode}: ${diseaseFloor.toFixed(2)}`);

    // 2. Get modulation factor based on memory state
    const modulationFactor = STATE_MODULATION[request.memoryState];
    reasons.push(`Modulation factor (${request.memoryState}): ×${modulationFactor.toFixed(2)}`);

    // 3. Compute memory-informed score
    const memoryInformedScore = computeMemoryInformedFireScore(request.rawSignalScore, request.memoryState);
    reasons.push(`Raw score ${request.rawSignalScore.toFixed(3)} → Memory-informed ${memoryInformedScore.toFixed(3)}`);

    // 4. Compare to disease floor
    const approved = memoryInformedScore >= diseaseFloor;
    reasons.push(
      approved
        ? `Memory-informed score ${memoryInformedScore.toFixed(3)} >= floor ${diseaseFloor.toFixed(2)}: APPROVED`
        : `Memory-informed score ${memoryInformedScore.toFixed(3)} < floor ${diseaseFloor.toFixed(2)}: DENIED`
    );

    return {
      approved,
      rawSignalScore: request.rawSignalScore,
      memoryInformedScore,
      modulationFactor,
      diseaseFloor,
      reason: reasons,
      evaluatedAt: new Date().toISOString(),
      evidence: {
        corridorState: request.memoryState,
        modulationFactor,
        rawScore: request.rawSignalScore,
        modulatedScore: memoryInformedScore,
        diseaseFloor,
      },
    };
  }

  /**
   * Update corridor memory state with modulation info
   */
  async updateCorridorModulation(corridorId: string, result: FireGateResult): Promise<void> {
    // In production, update corridor_memory_state with modulation context
    console.log(`  [FIRE GATE] Updated modulation for ${corridorId}: ×${result.modulationFactor.toFixed(2)} (score ${result.memoryInformedScore.toFixed(3)})`);
  }
}

// ═══════════════════════════════════════════════════════════════
// MO-SCRIPT: MEMORY-INFORMED FIRE GATE
// ═══════════════════════════════════════════════════════════════

export const mo_MEMORY_INFORMED_FIRE_GATE: MoScript = {
  id: "mo-poe-fire-gate-001" as `mo-${string}-${string}-${number}`,
  name: "Memory-Informed Fire Gate",
  trigger: 'event("corridor.fire.candidate")',
  inputs: ["request", "fireGate"],
  logic: async (inputs: Record<string, unknown>): Promise<FireGateResult> => {
    const { request, fireGate } = inputs as {
      request: FireGateRequest;
      fireGate?: MemoryPredictiveFireGate;
    };

    const gate = fireGate ?? new MemoryPredictiveFireGate();
    const result = gate.evaluateFireGate(request);

    // Update corridor memory state if approved
    if (result.approved) {
      await gate.updateCorridorModulation(request.corridorId, result);
    }

    return result;
  },
  voiceLine: (result: FireGateResult) =>
    result.approved
      ? `Fire gate open. Memory-informed score ${result.memoryInformedScore.toFixed(3)} >= floor ${result.diseaseFloor.toFixed(2)}.`
      : `Fire gate held. Memory-informed score ${result.memoryInformedScore.toFixed(3)} < floor ${result.diseaseFloor.toFixed(2)}.`,
};

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export const FIRE_GATE_SCRIPTS = [mo_MEMORY_INFORMED_FIRE_GATE];
