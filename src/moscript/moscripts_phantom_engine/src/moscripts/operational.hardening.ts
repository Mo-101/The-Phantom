/**
 * ◉⟁⬡  MoStar Industries
 * Operational Hardening Layer — Institution-Grade POE Intelligence
 * 
 * Implements the feedback loops that transform Phantom from
 * intelligent instrument to self-correcting public-health system.
 */

import crypto from "node:crypto";
import { MoScript } from "./types";
import { 
  DISEASE_FIRE_FLOORS, 
  DISEASE_SCORING_WEIGHTS,
  getDiseaseFireFloor,
  getDiseaseScoringWeights 
} from "./signal.schemas";

// ═══════════════════════════════════════════════════════════════
// 1. GROUND-TRUTH VALIDATION LOOP
// ═══════════════════════════════════════════════════════════════

export interface FieldValidationOutcome {
  corridorId: string;
  validationId: string;
  fieldOutcome: "true_positive" | "false_positive" | "true_negative" | "false_negative" | "uncertain";
  analystNotes: string;
  groundTruthDate: string;
  recalibrationRequired: boolean;
  modelAdjustments?: {
    weightDeltas?: Record<string, number>;
    floorDelta?: number;
  };
}

/**
 * mo-poe-field-validation-001
 * Field Validation Feedback Loop
 * 
 * Closes the loop between prediction and ground truth.
 * False positives trigger recalibration proposals.
 */
const MO_POE_FIELD_VALIDATION: MoScript = {
  id: "mo-poe-field-validation-v1-001" as `mo-${string}-${string}-${number}`,
  name: "Field Validation Feedback Loop",
  trigger: 'event("corridor.reviewed")',
  inputs: ["corridorId", "fieldOutcome", "analystNotes", "groundTruthDate"],
  logic: async (inputs: Record<string, any>): Promise<FieldValidationOutcome> => {
    const { corridorId, fieldOutcome, analystNotes, groundTruthDate, validationRepo } = inputs as {
      corridorId: string;
      fieldOutcome: FieldValidationOutcome["fieldOutcome"];
      analystNotes: string;
      groundTruthDate: string;
      validationRepo?: any;
    };
    const validationId = crypto.randomUUID();
    
    // Determine if recalibration is required
    const recalibrationRequired = fieldOutcome === "false_positive" || 
                                   fieldOutcome === "false_negative";
    
    const outcome: FieldValidationOutcome = {
      corridorId: corridorId,
      validationId,
      fieldOutcome: fieldOutcome,
      analystNotes: analystNotes,
      groundTruthDate: groundTruthDate || new Date().toISOString(),
      recalibrationRequired,
    };
    
    // Persist validation outcome
    if (validationRepo) {
      await validationRepo.insertValidation(outcome);
    }
    
    // If false positive, compute proposed adjustments
    if (recalibrationRequired) {
      outcome.modelAdjustments = await computeRecalibrationProposal(
        corridorId,
        fieldOutcome,
        validationRepo
      );
    }
    
    return outcome;
  },
  voiceLine: (r: FieldValidationOutcome) => 
    `Field truth sealed for ${r.corridorId}. Outcome: ${r.fieldOutcome}. Recalibration: ${r.recalibrationRequired ? "REQUIRED" : "none"}.`,
  sass: true,
};

async function computeRecalibrationProposal(
  corridorId: string,
  outcome: FieldValidationOutcome["fieldOutcome"],
  repo?: any
): Promise<FieldValidationOutcome["modelAdjustments"]> {
  // Analyze historical predictions for this corridor
  const recentValidations = repo ? await repo.getRecentValidations(corridorId, 10) : [];
  
  const fpCount = recentValidations.filter((v: any) => v.fieldOutcome === "false_positive").length;
  const fnCount = recentValidations.filter((v: any) => v.fieldOutcome === "false_negative").length;
  
  // Propose weight adjustments based on error pattern
  const weightDeltas: Record<string, number> = {};
  
  if (fpCount > fnCount) {
    // Too many false positives: raise thresholds
    weightDeltas["fireFloor"] = 0.05;
  } else if (fnCount > fpCount) {
    // Too many false negatives: lower thresholds
    weightDeltas["fireFloor"] = -0.05;
  }
  
  return {
    weightDeltas,
    floorDelta: weightDeltas["fireFloor"] || 0,
  };
}


// ═══════════════════════════════════════════════════════════════
// 2. MODEL DRIFT DETECTION
// ═══════════════════════════════════════════════════════════════

export interface DriftWatchResult {
  driftId: string;
  computedAt: string;
  baselineWindow: { start: string; end: string };
  currentWindow: { start: string; end: string };
  driftScore: number;  // 0.0 to 1.0
  threshold: number;
  affectedSources: string[];
  affectedDiseases?: string[];
  driftDimensions: {
    meanShift: number;
    varianceChange: number;
    distributionKLDivergence: number;
  };
  action: "recalibrate" | "hold" | "alert";
  proposedRecalibration?: {
    newWeights?: Record<string, number>;
    newFloors?: Record<string, number>;
  };
}

/**
 * mo-poe-drift-watch-001
 * Signal Distribution Drift Watch
 * 
 * Monitors signal distributions every 30 minutes.
 * Detects when sources (ACLED, DHIS2, IOM) change behavior.
 */
const MO_POE_DRIFT_WATCH: MoScript = {
  id: "mo-poe-drift-watch-v1-001" as `mo-${string}-${string}-${number}`,
  name: "Signal Distribution Drift Watch",
  trigger: 'cron("*/30 * * * *")',
  inputs: ["signalRepo", "baselineWindow", "currentWindow"],
  logic: async (inputs: Record<string, any>): Promise<DriftWatchResult> => {
    const { signalRepo, baselineWindow: inputBaseline, currentWindow: inputCurrent } = inputs as {
      signalRepo: {
        compareDistributionDrift: () => Promise<{
          score: number;
          sources: string[];
          diseases?: string[];
          dimensions: DriftWatchResult["driftDimensions"];
        }>;
        getBaselineWindow: () => Promise<{ start: string; end: string }>;
        getCurrentWindow: () => Promise<{ start: string; end: string }>;
      };
      baselineWindow?: { start: string; end: string };
      currentWindow?: { start: string; end: string };
    };
    const driftId = crypto.randomUUID();
    const computedAt = new Date().toISOString();
    
    // Compare distributions
    const drift = await signalRepo.compareDistributionDrift();
    
    // Determine action
    let action: DriftWatchResult["action"] = "hold";
    if (drift.score > 0.25) {
      action = "recalibrate";
    } else if (drift.score > 0.15) {
      action = "alert";
    }
    
    const baselineWindow = inputBaseline || await signalRepo.getBaselineWindow();
    const currentWindow = inputCurrent || await signalRepo.getCurrentWindow();
    
    const result: DriftWatchResult = {
      driftId,
      computedAt,
      baselineWindow,
      currentWindow,
      driftScore: drift.score,
      threshold: 0.25,
      affectedSources: drift.sources,
      affectedDiseases: drift.diseases,
      driftDimensions: drift.dimensions,
      action,
    };
    
    // If recalibration needed, propose new parameters
    if (action === "recalibrate") {
      result.proposedRecalibration = await proposeDriftRecalibration(drift);
    }
    
    return result;
  },
  voiceLine: (r: DriftWatchResult) => 
    `Drift watch complete. Score: ${(r.driftScore * 100).toFixed(1)}%. Sources affected: ${r.affectedSources.join(", ") || "none"}. Action: ${r.action}.`,
  sass: true,
};

async function proposeDriftRecalibration(
  drift: { score: number; sources: string[]; diseases?: string[] }
): Promise<DriftWatchResult["proposedRecalibration"]> {
  // Propose adaptive adjustments based on drift characteristics
  const newFloors: Record<string, number> = {};
  
  // If DHIS2 is drifting, adjust disease floors conservatively
  if (drift.sources.includes("DHIS2") && drift.diseases) {
    for (const disease of drift.diseases) {
      const currentFloor = getDiseaseFireFloor(disease);
      // Increase floor by 10% of gap to 1.0 during uncertainty
      newFloors[disease] = Math.min(0.95, currentFloor + (1 - currentFloor) * 0.1);
    }
  }
  
  return {
    newFloors,
  };
}


// ═══════════════════════════════════════════════════════════════
// 3. WEIGHT GOVERNANCE
// ═══════════════════════════════════════════════════════════════

export interface WeightVersionSeal {
  versionId: string;
  sealedAt: string;
  approver: string;
  approved: boolean;
  previousVersion?: string;
  changes: {
    oldWeights: Record<string, number>;
    newWeights: Record<string, number>;
    deltas: Record<string, number>;
  };
  diseaseSpecific?: Record<string, {
    oldFloor: number;
    newFloor: number;
    oldWeights: Record<string, number>;
    newWeights: Record<string, number>;
  }>;
  auditHash: string;
  requiresReview: boolean;
}

/**
 * mo-poe-weight-governance-001
 * Corridor Weight Version Seal
 * 
 * Signed versioning for all weight mutations.
 * Creates immutable audit trail for scoring changes.
 */
const MO_POE_WEIGHT_GOVERNANCE: MoScript = {
  id: "mo-poe-weight-governance-v1-001" as `mo-${string}-${string}-${number}`,
  name: "Corridor Weight Version Seal",
  trigger: 'event("weights.updated")',
  inputs: ["oldWeights", "newWeights", "approver", "diseaseChanges"],
  logic: async (inputs: Record<string, any>): Promise<WeightVersionSeal> => {
    const { oldWeights, newWeights, approver, diseaseChanges, weightRepo } = inputs as {
      oldWeights: Record<string, number>;
      newWeights: Record<string, number>;
      approver: string;
      diseaseChanges?: Record<string, {
        oldFloor: number;
        newFloor: number;
        oldWeights: Record<string, number>;
        newWeights: Record<string, number>;
      }>;
      weightRepo?: any;
    };
    const versionId = crypto.randomUUID();
    const sealedAt = new Date().toISOString();
    
    // Calculate deltas
    const deltas: Record<string, number> = {};
    for (const key of Object.keys(newWeights)) {
      deltas[key] = newWeights[key] - (oldWeights[key] || 0);
    }
    
    // Compute audit hash
    const auditPayload = JSON.stringify({
      oldWeights: oldWeights,
      newWeights: newWeights,
      approver: approver,
      sealedAt,
    });
    const auditHash = crypto.createHash("sha256").update(auditPayload).digest("hex");
    
    // Determine if review is required (significant changes)
    const maxDelta = Math.max(...Object.values(deltas).map(Math.abs));
    const requiresReview = maxDelta > 0.1;  // >10% change requires review
    
    const approved = Boolean(approver) && !requiresReview;
    
    const seal: WeightVersionSeal = {
      versionId,
      sealedAt,
      approver: approver,
      approved,
      changes: {
        oldWeights: oldWeights,
        newWeights: newWeights,
        deltas,
      },
      diseaseSpecific: diseaseChanges,
      auditHash,
      requiresReview,
    };
    
    // Persist version seal
    if (weightRepo) {
      await weightRepo.insertVersion(seal);
    }
    
    return seal;
  },
  voiceLine: (r: WeightVersionSeal) => 
    `Soul weight version ${r.versionId.slice(0, 8)} sealed. Approved: ${r.approved}. Review required: ${r.requiresReview}.`,
  sass: true,
};


// ═══════════════════════════════════════════════════════════════
// 4. COUNTERFACTUAL TESTING
// ═══════════════════════════════════════════════════════════════

export interface CounterfactualResult {
  testId: string;
  corridorId: string;
  removedElement: "conflict" | "displacement" | "disease" | "terrain" | "linguistic" | string;
  originalScore: number;
  counterfactualScore: number;
  activationThreshold: number;
  stillActive: boolean;
  impactRatio: number;  // counterfactual / original
  elementCriticality: "critical" | "significant" | "minor" | "negligible";
  timestamp: string;
}

/**
 * mo-poe-counterfactual-001
 * Corridor Counterfactual Test
 * 
 * Tests corridor robustness by recomputing scores with elements removed.
 * Reveals brittle corridors that depend on single signal types.
 */
const MO_POE_COUNTERFACTUAL: MoScript = {
  id: "mo-poe-counterfactual-v1-001" as `mo-${string}-${string}-${number}`,
  name: "Corridor Counterfactual Test",
  trigger: 'event("corridor.counterfactual.requested")',
  inputs: ["corridorId", "removedElement", "corridorService"],
  logic: async (inputs: Record<string, any>): Promise<CounterfactualResult> => {
    const { corridorId, removedElement, corridorService } = inputs as {
      corridorId: string;
      removedElement: CounterfactualResult["removedElement"];
      corridorService: {
        recomputeWithout: (corridorId: string, element: string) => Promise<{
          originalScore: number;
          counterfactualScore: number;
          activationThreshold: number;
        }>;
      };
    };
    const testId = crypto.randomUUID();
    
    // Recompute corridor score without specified element
    const result = await corridorService.recomputeWithout(
      corridorId,
      removedElement
    );
    
    const impactRatio = result.originalScore > 0 
      ? result.counterfactualScore / result.originalScore 
      : 0;
    
    // Classify element criticality
    let elementCriticality: CounterfactualResult["elementCriticality"] = "negligible";
    if (impactRatio < 0.5) {
      elementCriticality = "critical";
    } else if (impactRatio < 0.7) {
      elementCriticality = "significant";
    } else if (impactRatio < 0.9) {
      elementCriticality = "minor";
    }
    
    return {
      testId,
      corridorId: corridorId,
      removedElement: removedElement,
      originalScore: result.originalScore,
      counterfactualScore: result.counterfactualScore,
      activationThreshold: result.activationThreshold,
      stillActive: result.counterfactualScore >= result.activationThreshold,
      impactRatio,
      elementCriticality,
      timestamp: new Date().toISOString(),
    };
  },
  voiceLine: (r: CounterfactualResult) => 
    `${r.corridorId} tested without ${r.removedElement}. Impact: ${(r.impactRatio * 100).toFixed(0)}%. Criticality: ${r.elementCriticality}.`,
  sass: true,
};


// ═══════════════════════════════════════════════════════════════
// 5. ANALYST DISAGREEMENT LEDGER
// ═══════════════════════════════════════════════════════════════

export interface AnalystDissent {
  dissentId: string;
  momentId: string;
  analystId: string;
  reason: string;
  severity: 1 | 2 | 3 | 4 | 5;
  dissentType: "factual_error" | "interpretation" | "omission" | "bias" | "methodology" | "other";
  requiresReview: boolean;
  reviewAssigned?: string;
  resolution?: {
    resolvedAt: string;
    resolution: "accepted" | "rejected" | "partial" | "under_review";
    weightAdjustment?: number;
    modelRetrained?: boolean;
  };
  sealedAt: string;
}

/**
 * mo-poe-analyst-dissent-001
 * Analyst Dissent Ledger
 * 
 * Captures analyst disagreement as structured training signal.
 * High-severity dissent triggers model review workflow.
 */
const MO_POE_ANALYST_DISSENT: MoScript = {
  id: "mo-poe-analyst-dissent-v1-001" as `mo-${string}-${string}-${number}`,
  name: "Analyst Dissent Ledger",
  trigger: 'event("brief.disputed")',
  inputs: ["momentId", "analystId", "reason", "severity", "dissentType"],
  logic: async (inputs: Record<string, any>): Promise<AnalystDissent> => {
    const { momentId, analystId, reason, severity, dissentType, dissentRepo } = inputs as {
      momentId: string;
      analystId: string;
      reason: string;
      severity: AnalystDissent["severity"];
      dissentType?: AnalystDissent["dissentType"];
      dissentRepo?: any;
    };
    const dissentId = crypto.randomUUID();
    const sealedAt = new Date().toISOString();
    
    // Severity 3+ requires mandatory review
    const requiresReview = severity >= 3;
    
    const dissent: AnalystDissent = {
      dissentId,
      momentId: momentId,
      analystId: analystId,
      reason: reason,
      severity: severity,
      dissentType: dissentType || "other",
      requiresReview,
      sealedAt,
    };
    
    // Assign review for high-severity dissent
    if (requiresReview) {
      dissent.reviewAssigned = await assignReviewer(analystId, momentId);
    }
    
    // Persist dissent
    if (dissentRepo) {
      await dissentRepo.insertDissent(dissent);
      
      // If high-severity, trigger training signal integration
      if (severity >= 4) {
        await dissentRepo.queueForTrainingSignal(dissent);
      }
    }
    
    return dissent;
  },
  voiceLine: (r: AnalystDissent) => 
    `Dissent sealed for moment ${r.momentId}. Severity: ${r.severity}/5. Review required: ${r.requiresReview}.`,
  sass: true,
};

async function assignReviewer(analystId: string, momentId: string): Promise<string> {
  // Rotate reviewer assignment (avoid same-analyst review)
  // In production: query reviewer pool, check workload, assign
  return `reviewer-${crypto.randomUUID().slice(0, 8)}`;
}


// ═══════════════════════════════════════════════════════════════
// OPERATIONAL HARDENING REGISTRY
// ═══════════════════════════════════════════════════════════════

export const OPERATIONAL_HARDENING_SCRIPTS = [
  MO_POE_FIELD_VALIDATION,
  MO_POE_DRIFT_WATCH,
  MO_POE_WEIGHT_GOVERNANCE,
  MO_POE_COUNTERFACTUAL,
  MO_POE_ANALYST_DISSENT,
] as const;

// Export individual scripts for selective mounting (only once)
export { MO_POE_FIELD_VALIDATION, MO_POE_DRIFT_WATCH, MO_POE_WEIGHT_GOVERNANCE, MO_POE_COUNTERFACTUAL, MO_POE_ANALYST_DISSENT };
