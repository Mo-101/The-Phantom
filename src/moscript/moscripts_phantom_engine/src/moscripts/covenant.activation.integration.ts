/**
 * ◉⟁⬡  MoStar Industries
 * Phantom POE — Covenant Activation Integration
 * 
 * Integrates the covenant guard into the activation loop.
 * Ensures no corridor ascends the memory ladder without a sealed covenant.
 */

import { transitionGuard, type CovenantContext, type TransitionGuardResult } from "./covenant.transition.guard";
import { computeMemoryInformedFireScore } from "./memory.informed.fire.gate";
import type { CorridorMemoryState } from "./covenant.state.transition";
import { DISEASE_FLOORS } from "./memory.informed.fire.gate";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ActivationContext {
  corridorId: string;
  disease: string;
  rawSignalScore: number;
  memoryState: CorridorMemoryState;
  year: number;
  epiWeek: number;
  region: string;
  sourceData: string;
}

export interface ActivationResult {
  activationId: string;
  corridorId: string;
  disease: string;
  year: number;
  epiWeek: number;
  rawFireScore: number;
  memoryInformedScore: number;
  memoryState: CorridorMemoryState;
  active: boolean;
  transitionAttempted: boolean;
  transitionSucceeded: boolean;
  transitionFrom?: CorridorMemoryState;
  transitionTo?: CorridorMemoryState;
  covenantSeal?: string;
  covenantLog?: string;
  failureReason?: string;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════
// ACTIVATION EVALUATOR
// ═══════════════════════════════════════════════════════════════

class ActivationEvaluator {
  /**
   * Build covenant context from activation context
   */
  private buildCovenantContext(
    activationContext: ActivationContext,
    memoryInformedScore: number,
    modulationFactor: number
  ): CovenantContext {
    // In production, these scores would come from actual analysis
    // For now, we use reasonable defaults
    return {
      interpretation: `Weekly signal evaluation for ${activationContext.corridorId} week ${activationContext.year}-W${activationContext.epiWeek}`,
      truth_score: memoryInformedScore,
      ethic_score: 0.95,  // Assuming NCDC data is ethically sourced
      ethic_flags: [],
      cultural_score: 0.90,
      cultural_flags: [],
      bias_score: 0.88,
      bias_flags: activationContext.disease === "LASSA" ? ["testing_access_skew"] : [],
      region: activationContext.region,
      evidence: {
        raw_signal_score: activationContext.rawSignalScore,
        memory_state: activationContext.memoryState,
        modulation_factor: modulationFactor,
        source_data: activationContext.sourceData,
      },
    };
  }

  /**
   * Evaluate activation with covenant guard
   */
  async evaluateActivation(
    context: ActivationContext,
    activationHistory: ActivationResult[]
  ): Promise<ActivationResult> {
    const activationId = `ACT-${context.corridorId}-${context.year}-W${context.epiWeek}`;
    const currentState = context.memoryState;

    // Compute memory-informed score
    const modulationFactor = this.getModulationFactor(currentState);
    const memoryInformedScore = computeMemoryInformedFireScore(context.rawSignalScore, currentState);

    // Determine if active
    const diseaseFloor = DISEASE_FLOORS[context.disease] ?? DISEASE_FLOORS.OTHER;
    const active = memoryInformedScore >= diseaseFloor;

    // Evaluate state transition
    const transitionResult = await this.evaluateStateTransition(
      context,
      currentState,
      activationHistory,
      memoryInformedScore,
      modulationFactor,
      active
    );

    return {
      activationId,
      corridorId: context.corridorId,
      disease: context.disease,
      year: context.year,
      epiWeek: context.epiWeek,
      rawFireScore: context.rawSignalScore,
      memoryInformedScore,
      memoryState: currentState,
      active,
      transitionAttempted: transitionResult.attempted,
      transitionSucceeded: transitionResult.succeeded,
      transitionFrom: transitionResult.fromState,
      transitionTo: transitionResult.toState,
      covenantSeal: transitionResult.seal,
      covenantLog: transitionResult.log,
      failureReason: transitionResult.failureReason,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Get modulation factor for memory state
   */
  private getModulationFactor(state: CorridorMemoryState): number {
    const factors: Record<CorridorMemoryState, number> = {
      REFERENCE: 0.85,
      HYPOTHESIS: 1.00,
      REALTIME: 1.15,
      HYBRID: 1.10,
      FIELD_CONFIRMED: 1.20,
      ARCHIVED: 0.60,
    };
    return factors[state];
  }

  /**
   * Evaluate state transition with covenant guard
   */
  private async evaluateStateTransition(
    context: ActivationContext,
    currentState: CorridorMemoryState,
    activationHistory: ActivationResult[],
    memoryInformedScore: number,
    modulationFactor: number,
    currentlyActive: boolean
  ): Promise<{
    attempted: boolean;
    succeeded: boolean;
    fromState?: CorridorMemoryState;
    toState?: CorridorMemoryState;
    seal?: string;
    log?: string;
    failureReason?: string;
  }> {
    // Determine target state based on activation history
    const targetState = this.determineTargetState(currentState, activationHistory, currentlyActive);

    if (!targetState || targetState === currentState) {
      return { attempted: false, succeeded: false };
    }

    // Build covenant context
    const covenantContext = this.buildCovenantContext(context, memoryInformedScore, modulationFactor);

    // Attempt transition with covenant guard
    const guardResult = await transitionGuard.attemptTransition(
      context.corridorId,
      currentState,
      targetState,
      covenantContext
    );

    if (guardResult.success) {
      console.log(`  [COVENANT] Transition approved: ${currentState} → ${targetState} (seal: ${guardResult.seal?.slice(0, 16)}...)`);
      return {
        attempted: true,
        succeeded: true,
        fromState: currentState,
        toState: targetState,
        seal: guardResult.seal,
        log: guardResult.log,
      };
    } else {
      console.log(`  [COVENANT] Transition denied: ${currentState} → ${targetState} (${guardResult.reason})`);
      return {
        attempted: true,
        succeeded: false,
        fromState: currentState,
        toState: targetState,
        failureReason: guardResult.reason,
        log: guardResult.log,
      };
    }
  }

  /**
   * Determine target state based on activation history
   */
  private determineTargetState(
    currentState: CorridorMemoryState,
    activationHistory: ActivationResult[],
    currentlyActive: boolean
  ): CorridorMemoryState | null {
    const recentActive = activationHistory.filter(a => a.active).slice(0, 4);
    const recentInactive = activationHistory.filter(a => !a.active).slice(0, 8);

    // Transition rules
    switch (currentState) {
      case "REFERENCE":
        if (recentActive.length >= 2) return "HYPOTHESIS";
        break;

      case "HYPOTHESIS":
        if (recentActive.length >= 3) return "REALTIME";
        if (recentInactive.length >= 10) return "ARCHIVED";
        break;

      case "REALTIME":
        if (recentInactive.length >= 6) return "HYPOTHESIS";
        if (recentInactive.length >= 12) return "ARCHIVED";
        if (recentActive.some(a => a.memoryInformedScore >= 0.70)) return "HYBRID";
        break;

      case "HYBRID":
        if (recentInactive.length >= 8) return "ARCHIVED";
        if (recentActive.some(a => a.memoryInformedScore >= 0.85)) return "FIELD_CONFIRMED";
        break;

      case "FIELD_CONFIRMED":
        if (recentInactive.length >= 12) return "ARCHIVED";
        break;

      case "ARCHIVED":
        if (recentActive.length >= 2) return "HYPOTHESIS";
        if (recentActive.length >= 3) return "REALTIME";
        break;
    }

    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export const activationEvaluator = new ActivationEvaluator();
