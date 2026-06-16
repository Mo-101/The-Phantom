/**
 * ◉⟁⬡  MoStar Industries
 * Pre-Corridor Evidence Families & Scoring Weights
 */

export type SourceFamily =
  | 'DISEASE_SIGNAL'
  | 'CONFLICT_EVENT'
  | 'DISPLACEMENT'
  | 'MARKET'
  | 'SATELLITE'
  | 'FIELD_OBSERVATION';

export const FAMILY_WEIGHTS: Record<SourceFamily, number> = {
  DISEASE_SIGNAL: 0.15,
  CONFLICT_EVENT: 0.20,
  DISPLACEMENT: 0.20,
  MARKET: 0.10,
  SATELLITE: 0.10,
  FIELD_OBSERVATION: 0.25, // Direct human observations have the highest trust weight
};

/**
 * Calculates freshness weight based on exponential half-life decay.
 */
export function calculateFreshnessWeight(
  observedAt: Date,
  decayHalfLifeSeconds: number,
  now: Date = new Date()
): number {
  const ageSeconds = Math.max(0, (now.getTime() - observedAt.getTime()) / 1000);
  const lambda = Math.LN2 / Math.max(1, decayHalfLifeSeconds);
  return Math.exp(-lambda * ageSeconds);
}

/**
 * Calculates contribution: raw_score * freshness_weight * family_weight
 */
export function calculateContribution(
  family: SourceFamily,
  rawScore: number,
  freshnessWeight: number
): number {
  const weight = FAMILY_WEIGHTS[family] ?? 0;
  return rawScore * freshnessWeight * weight;
}
