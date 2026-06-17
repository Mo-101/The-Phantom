/**
 * 🜂🜄🜁🜃  MoStar Industries
 * Epidemiological Signal Types — Multi-Disease Phantom POE
 * 
 * Implements disease-specific Fire truth scoring for:
 * - Lassa Fever (fire_floor: 0.76)
 * - Cholera (fire_floor: 0.66)  
 * - Meningitis (fire_floor: 0.72)
 */

import { z } from 'zod';

// Disease codes supported by epidemiological layer
export const EpiDiseaseCodeSchema = z.enum(['LASSA', 'CHOLERA', 'MENINGITIS']);
export type EpiDiseaseCode = z.infer<typeof EpiDiseaseCodeSchema>;

// Disease-specific Fire truth floors
export const DISEASE_FIRE_FLOORS: Record<EpiDiseaseCode, number> = {
  LASSA: 0.76,      // Higher threshold - requires strong laboratory confirmation
  CHOLERA: 0.66,    // Lower threshold - rapid response needed, act on weaker signals
  MENINGITIS: 0.72, // Medium threshold - seasonality-weighted
} as const;

// Disease-specific scoring weights (must sum to 1.0)
export interface DiseaseScoringWeights {
  caseBurden: number;    // 0.20-0.30
  growth: number;        // 0.15-0.35
  positivity: number;    // 0.10-0.30
  severity: number;      // 0.10-0.20
  spatial: number;       // 0.10-0.20
  temporal: number;      // 0.00-0.10
}

export const DISEASE_SCORING_WEIGHTS: Record<EpiDiseaseCode, DiseaseScoringWeights> = {
  LASSA: {
    caseBurden: 0.25,
    growth: 0.15,
    positivity: 0.30,    // High weight - lab confirmation matters
    severity: 0.20,      // CFR matters
    spatial: 0.10,       // Endemic state alignment
    temporal: 0.00,      // Less seasonality-driven
  },
  CHOLERA: {
    caseBurden: 0.20,
    growth: 0.35,        // High weight - rapid acceleration is key
    positivity: 0.10,
    severity: 0.10,
    spatial: 0.20,       // Clustering and corridor proximity
    temporal: 0.05,
  },
  MENINGITIS: {
    caseBurden: 0.25,
    growth: 0.20,
    positivity: 0.15,
    severity: 0.15,
    spatial: 0.20,       // Geography and incidence concentration
    temporal: 0.05,      // Seasonal alignment
  },
} as const;

// Epidemiological states with endemic Lassa
export const LASSA_ENDEMIC_STATES = [
  'ONDO', 'EDO', 'BAUCHI', 'TARABA', 'EBONYI'
] as const;

// Cholera-prone states (Northern Nigeria, dry season)
export const CHOLERA_PRONE_STATES = [
  'YOBE', 'BORNO', 'ADAMAWA', 'JIGAWA', 'KANO'
] as const;

// Meningitis belt states
export const MENINGITIS_BELT_STATES = [
  'JIGAWA', 'KANO', 'KATSINA', 'ZAMFARA', 'SOKOTO', 'KEBBI'
] as const;

// POE Signal record (mirrors poe_signals table)
export interface POESignal {
  id: string;
  disease: EpiDiseaseCode;
  state: string;
  lga: string;
  epiWeek: number;
  year: number;
  
  // Case data
  confirmedCases: number;
  suspectedCases: number;
  deaths: number;
  testsDone: number;
  
  // Derived metrics
  positivityRate?: number;
  cfr?: number;
  ctValueMean?: number;
  malariaCoinfectionRate?: number;
  
  // Metadata
  reportingDelay?: number;
  source: 'DHIS2' | 'EWARS' | 'AFRO-SENTINEL' | 'LAB' | 'MANUAL';
  dataQualityScore: number;
  
  // Location
  countryCode: string;
  latitude?: number;
  longitude?: number;
  
  createdAt: Date;
  updatedAt: Date;
}

// Corridor-disease-week aggregation (mirrors poe_corridor_signal table)
export interface POECorridorSignal {
  id: string;
  corridorId: string;
  disease: EpiDiseaseCode;
  epiWeek: number;
  year: number;
  
  // Spatial coverage
  statesTouched: string[];
  lgasTouched: string[];
  
  // Component scores
  caseBurdenScore: number;
  growthScore: number;
  positivityScore: number;
  severityScore: number;
  spatialAlignmentScore: number;
  temporalAlignmentScore: number;
  
  // Fire gate
  fireTruthScore: number;
  fireGateActive: boolean;
  
  // Explainability
  scoreWeights: DiseaseScoringWeights;
  
  computedAt: Date;
}

// Fire Truth Score calculation result
export interface FireTruthResult {
  disease: EpiDiseaseCode;
  corridorId: string;
  epiWeek: number;
  year: number;
  
  // Raw component scores
  components: {
    caseBurden: number;
    growth: number;
    positivity: number;
    severity: number;
    spatial: number;
    temporal: number;
  };
  
  // Weighted composite
  fireTruthScore: number;
  fireFloor: number;
  fireGateActive: boolean;
  
  // Explainability trace
  trace: string[];
}

// Multi-threat corridor risk (combines all diseases)
export interface CorridorMultiThreatRisk {
  corridorId: string;
  epiWeek: number;
  year: number;
  
  // Per-disease risks
  lassaRisk?: number;
  choleraRisk?: number;
  meningitisRisk?: number;
  
  // Combined metrics
  activeDiseaseCount: number;
  combinedRisk: number;  // 1 - Product(1 - risk_i)
  
  // Dominant threat
  dominantDisease: EpiDiseaseCode | null;
  dominantRisk: number;
}

// Helper function to calculate Fire Truth Score for a disease
export function calculateFireTruthScore(
  disease: EpiDiseaseCode,
  components: {
    caseBurden: number;
    growth: number;
    positivity: number;
    severity: number;
    spatial: number;
    temporal: number;
  }
): FireTruthResult {
  const weights = DISEASE_SCORING_WEIGHTS[disease];
  const fireFloor = DISEASE_FIRE_FLOORS[disease];
  
  // Calculate weighted score
  const fireTruthScore = 
    components.caseBurden * weights.caseBurden +
    components.growth * weights.growth +
    components.positivity * weights.positivity +
    components.severity * weights.severity +
    components.spatial * weights.spatial +
    components.temporal * weights.temporal;
  
  // Clamp to [0, 1]
  const clampedScore = Math.max(0, Math.min(1, fireTruthScore));
  
  // Generate explainability trace
  const trace: string[] = [
    `Disease: ${disease}`,
    `Fire floor: ${fireFloor}`,
    `Case burden (${weights.caseBurden}): ${components.caseBurden.toFixed(3)}`,
    `Growth (${weights.growth}): ${components.growth.toFixed(3)}`,
    `Positivity (${weights.positivity}): ${components.positivity.toFixed(3)}`,
    `Severity (${weights.severity}): ${components.severity.toFixed(3)}`,
    `Spatial (${weights.spatial}): ${components.spatial.toFixed(3)}`,
    `Temporal (${weights.temporal}): ${components.temporal.toFixed(3)}`,
    `Composite score: ${clampedScore.toFixed(3)}`,
    `Gate active: ${clampedScore >= fireFloor}`,
  ];
  
  return {
    disease,
    corridorId: '', // To be filled by caller
    epiWeek: 0,     // To be filled by caller
    year: 0,        // To be filled by caller
    components,
    fireTruthScore: clampedScore,
    fireFloor,
    fireGateActive: clampedScore >= fireFloor,
    trace,
  };
}

// Helper to calculate multi-threat combined risk
export function calculateCombinedRisk(diseaseRisks: number[]): number {
  // 1 - Product(1 - risk_i)
  const survivalProduct = diseaseRisks.reduce(
    (acc, risk) => acc * (1 - risk), 
    1
  );
  return 1 - survivalProduct;
}

// Check if state is endemic for disease
export function isEndemicState(disease: EpiDiseaseCode, state: string): boolean {
  const stateUpper = state.toUpperCase();
  switch (disease) {
    case 'LASSA':
      return LASSA_ENDEMIC_STATES.includes(stateUpper as typeof LASSA_ENDEMIC_STATES[number]);
    case 'CHOLERA':
      return CHOLERA_PRONE_STATES.includes(stateUpper as typeof CHOLERA_PRONE_STATES[number]);
    case 'MENINGITIS':
      return MENINGITIS_BELT_STATES.includes(stateUpper as typeof MENINGITIS_BELT_STATES[number]);
    default:
      return false;
  }
}
