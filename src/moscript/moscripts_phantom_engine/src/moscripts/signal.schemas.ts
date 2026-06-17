/**
 * 🜂🜄🜁🜃  MoStar Industries
 * Signal Ingestion — Zod Validation Schemas
 */

import { z, ZodError } from 'zod';

export type TrustScore     = number & { __brand: 'TrustScore' };
export type Magnitude      = number & { __brand: 'Magnitude' };
export type CorridorScore  = number & { __brand: 'CorridorScore' };
export type LatDegrees     = number & { __brand: 'LatDegrees' };
export type LonDegrees     = number & { __brand: 'LonDegrees' };

export const asTrustScore    = (v: number): TrustScore    => { if (v < 0 || v > 1) throw new Error(`TrustScore out of range: ${v}`); return v as TrustScore; };
export const asMagnitude     = (v: number): Magnitude     => { if (v < 0 || v > 1) throw new Error(`Magnitude out of range: ${v}`); return v as Magnitude; };
export const asCorridorScore = (v: number): CorridorScore => { if (v < 0 || v > 1) throw new Error(`CorridorScore out of range: ${v}`); return v as CorridorScore; };
export const asLat           = (v: number): LatDegrees    => { if (v < -90 || v > 90) throw new Error(`Latitude out of range: ${v}`); return v as LatDegrees; };
export const asLon           = (v: number): LonDegrees    => { if (v < -180 || v > 180) throw new Error(`Longitude out of range: ${v}`); return v as LonDegrees; };

const ISODateString = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'Must start with YYYY-MM-DD')
  .regex(/(\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?)?$/, 'Must be valid ISO 8601 date')
  .refine(
    (val) => !Number.isNaN(Date.parse(val)),
    'Must be a valid ISO 8601 date string'
  );

const Latitude = z.number().min(-90).max(90);
const Longitude = z.number().min(-180).max(180);
const UnitScore = z.number().min(0).max(1);
const PositiveInt = z.number().int().positive();
const NonEmptyString = z.string().min(1).transform(s => s.trim());
const CountryCode = z.string().length(2).toUpperCase();

export const DTMFlowSchema = z.object({
  id:              z.string().or(z.number()).transform(String),
  location:        NonEmptyString,
  country:         CountryCode,
  admin1:          z.string().optional(),
  admin2:          z.string().optional(),
  latitude:        Latitude,
  longitude:       Longitude,
  displacedCount:  PositiveInt,
  flowType:        z.enum(['internal', 'cross-border', 'return', 'transit']),
  reportDate:      ISODateString,
  source:          z.literal('IOM-DTM'),
  confidence:      z.enum(['high', 'medium', 'low']).default('medium'),
}).strict();

export type DTMFlow = z.infer<typeof DTMFlowSchema>;

export const ACLEDEventTypeSchema = z.enum([
  'Battles',
  'Violence against civilians',
  'Explosions/Remote violence',
  'Protests',
  'Riots',
  'Strategic developments',
]);

export const ACLEDEventSchema = z.object({
  data_id:        z.string().or(z.number()).transform(String),
  event_date:     ISODateString,
  event_type:     ACLEDEventTypeSchema,
  sub_event_type: z.string().optional(),
  country:        NonEmptyString,
  iso:            z.number().int().optional(),
  admin1:         z.string().optional(),
  admin2:         z.string().optional(),
  location:       NonEmptyString,
  latitude:       Latitude,
  longitude:      Longitude,
  fatalities:     z.number().int().nonnegative(),
  notes:          z.string().optional(),
  source:         z.string().optional(),
}).strict();

export type ACLEDEvent = z.infer<typeof ACLEDEventSchema>;

export const DiseaseCodeSchema = z.enum([
  'CHOLERA', 'EBOLA', 'MARBURG', 'LASSA', 'MPOX', 'MEASLES',
  'MENINGITIS', 'PLAGUE', 'RVFEVER', 'YELLOWFEVER', 'COVID19', 'VHF', 'OTHER',
]);

export type DiseaseCode = z.infer<typeof DiseaseCodeSchema>;

export const DHIS2DataValueSchema = z.object({
  dataElement:      NonEmptyString,
  period:           z.string().regex(/^\d{4}(W\d{1,2}|Q[1-4]|\d{2})?$/, 'DHIS2 period format'),
  orgUnit:          NonEmptyString,
  orgUnitName:      NonEmptyString,
  value:            z.string().transform(v => Number.parseFloat(v)),
  disease:          DiseaseCodeSchema,
  country:          CountryCode,
  latitude:         Latitude.optional(),
  longitude:        Longitude.optional(),
  reportedAt:       ISODateString.optional(),
}).strict();

export type DHIS2DataValue = z.infer<typeof DHIS2DataValueSchema>;

export const SignalTypeSchema = z.enum([
  'displacement', 'conflict', 'disease', 'linguistic', 'terrain',
]);

export type SignalType = z.infer<typeof SignalTypeSchema>;
export const ElementSchema = z.enum(['fire', 'water', 'air', 'earth']);
export type Element = z.infer<typeof ElementSchema>;

export const SIGNAL_ELEMENT_MAP: Record<SignalType, Element> = {
  disease:     'fire',
  conflict:    'fire',
  displacement:'water',
  linguistic:  'air',
  terrain:     'earth',
};

export const NormalizedSignalSchema = z.object({
  id:          NonEmptyString,
  runId:       z.string().optional(),
  source:      z.enum(['IOM-DTM', 'ACLED', 'DHIS2', 'EWARS', 'MANUAL', 'MOCK', 'AFRO-SENTINEL']),
  type:        SignalTypeSchema,
  element:     ElementSchema,
  location:    NonEmptyString,
  country:     CountryCode,
  latitude:    Latitude.optional(),
  longitude:   Longitude.optional(),
  magnitude:   UnitScore,
  truthScore:  UnitScore,
  rawValue:    z.number().optional(),
  disease:     DiseaseCodeSchema.optional(),
  timestamp:   ISODateString,
  period:      z.string().optional(),
  raw:         z.record(z.unknown()).default({}),
}).strict();

export type NormalizedSignal = z.infer<typeof NormalizedSignalSchema>;

export const TRUTH_FLOORS = {
  fire:  0.75,
  water: 0.7,
  air:   0.65,
  earth: 0.8,
} as const;

// Disease-specific Fire truth floors for epidemiological signals
// These override the generic fire floor (0.75) for disease surveillance
export const DISEASE_FIRE_FLOORS: Record<string, number> = {
  LASSA: 0.76,      // Laboratory confirmation weighted
  CHOLERA: 0.66,    // Rapid response - lower threshold
  MENINGITIS: 0.72, // Seasonality-weighted
  EBOLA: 0.85,      // High threshold for high-consequence pathogen
  MARBURG: 0.85,
  MPOX: 0.70,
  COVID19: 0.65,
} as const;

// Disease-specific scoring weights for Fire truth calculation
export const DISEASE_SCORING_WEIGHTS: Record<string, Record<string, number>> = {
  LASSA: {
    caseBurden: 0.25,
    growth: 0.15,
    positivity: 0.30,
    severity: 0.20,
    spatial: 0.10,
    temporal: 0.00,
  },
  CHOLERA: {
    caseBurden: 0.20,
    growth: 0.35,
    positivity: 0.10,
    severity: 0.10,
    spatial: 0.20,
    temporal: 0.05,
  },
  MENINGITIS: {
    caseBurden: 0.25,
    growth: 0.20,
    positivity: 0.15,
    severity: 0.15,
    spatial: 0.20,
    temporal: 0.05,
  },
} as const;

/**
 * filterForConduit
 * Centralized logic for filtering signals based on elemental truth floors.
 */
export function filterForConduit(signals: NormalizedSignal[]): NormalizedSignal[] {
  return signals.filter(s => {
    const floor = TRUTH_FLOORS[s.element] || 0.7;
    return s.truthScore >= floor;
  });
}

/**
 * getDiseaseFireFloor
 * Returns disease-specific Fire truth floor, or default fire floor if not found.
 */
export function getDiseaseFireFloor(disease: DiseaseCode | string | undefined): number {
  if (!disease) return TRUTH_FLOORS.fire;
  return DISEASE_FIRE_FLOORS[disease] ?? TRUTH_FLOORS.fire;
}

/**
 * getDiseaseScoringWeights
 * Returns disease-specific scoring weights for Fire truth calculation.
 */
export function getDiseaseScoringWeights(disease: DiseaseCode | string | undefined): Record<string, number> {
  if (!disease) return DISEASE_SCORING_WEIGHTS.LASSA;
  return DISEASE_SCORING_WEIGHTS[disease] ?? DISEASE_SCORING_WEIGHTS.LASSA;
}

/**
 * calculateDiseaseFireTruthScore
 * Calculates pathogen-aware Fire truth score with disease-specific weights.
 */
export function calculateDiseaseFireTruthScore(
  disease: DiseaseCode | string,
  components: {
    caseBurden: number;
    growth: number;
    positivity: number;
    severity: number;
    spatial: number;
    temporal: number;
  }
): { score: number; floor: number; active: boolean; weights: Record<string, number> } {
  const weights = getDiseaseScoringWeights(disease);
  const floor = getDiseaseFireFloor(disease);
  
  const score = Math.max(0, Math.min(1,
    components.caseBurden * (weights.caseBurden ?? 0.25) +
    components.growth * (weights.growth ?? 0.25) +
    components.positivity * (weights.positivity ?? 0.20) +
    components.severity * (weights.severity ?? 0.15) +
    components.spatial * (weights.spatial ?? 0.10) +
    components.temporal * (weights.temporal ?? 0.05)
  ));
  
  return {
    score,
    floor,
    active: score >= floor,
    weights,
  };
}

/**
 * filterDiseaseSignalsForConduit
 * Filters disease signals using pathogen-specific truth floors.
 * Cholera (0.66) activates earlier than Lassa (0.76).
 */
export function filterDiseaseSignalsForConduit(signals: NormalizedSignal[]): NormalizedSignal[] {
  return signals.filter(s => {
    // Only apply disease-specific logic to disease signals
    if (s.element !== 'fire' || !s.disease) {
      const floor = TRUTH_FLOORS[s.element] || 0.7;
      return s.truthScore >= floor;
    }
    
    // Use disease-specific floor
    const floor = getDiseaseFireFloor(s.disease);
    return s.truthScore >= floor;
  });
}

export function parseNormalizedSignal(raw: unknown): NormalizedSignal {
  const result = NormalizedSignalSchema.safeParse(raw);
  if (!result.success) {
    throw new SignalValidationError('NormalizedSignal', result.error);
  }
  return result.data;
}

export class SignalValidationError extends Error {
  public readonly fields: Record<string, string[]>;
  constructor(source: string, zodError: ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of zodError.issues) {
      const path = issue.path.join('.') || 'root';
      fields[path] = fields[path] ?? [];
      fields[path].push(issue.message);
    }
    super(`[Signal Validation] ${source} payload invalid:\n${JSON.stringify(fields, null, 2)}`);
    this.name = 'SignalValidationError';
    this.fields = fields;
  }
}
