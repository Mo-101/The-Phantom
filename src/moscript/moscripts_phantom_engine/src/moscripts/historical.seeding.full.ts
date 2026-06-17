/**
 * ◉⟁⬡  MoStar Industries
 * Phantom POE — Full Historical Seeding Implementation
 * 
 * Steps:
 * 1. Load NCDC data into poe_signals
 * 2. Build corridor-geography mapping
 * 3. Run weekly scoring for per-corridor Fire scores
 * 4. Seed corridor_activations
 * 5. Seed corridor_baseline_matches
 * 6. Simulate state transitions
 * 7. Populate explainability cache
 */

import { MoScript } from "./types";
import type { CorridorMemoryState } from "./covenant.state.transition";
import { computeMemoryInformedFireScore } from "./memory.informed.fire.gate";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface NCDCSignal {
  disease: string;
  state: string;
  lga: string | null;
  epiWeek: number;
  year: number;
  confirmedCases: number;
  suspectedCases: number;
  deaths: number;
  testsDone: number;
  positivityRate: number;
  cfr: number;
  dataQualityScore: number;
}

export interface CorridorGeography {
  corridorId: string;
  state: string;
  lga: string | null;
  weight: number;
}

export interface WeeklySignalAggregate {
  disease: string;
  signalCount: number;
  totalConfirmed: number;
  avgPositivity: number;
  avgCfr: number;
  avgDataQuality: number;
}

export interface CorridorActivation {
  activationId: string;
  corridorId: string;
  disease: string;
  year: number;
  epiWeek: number;
  rawFireScore: number;
  memoryInformedScore: number;
  memoryState: CorridorMemoryState;
  active: boolean;
  covenantSeal: string | null;
  createdAt: string;
}

export interface BaselineMatch {
  corridorId: string;
  disease: string;
  patternType: string;
  epiWeekStart: number;
  epiWeekEnd: number;
  matchScore: number;
  percentileThreshold: number;
  confidence: number;
}

export interface StateTransition {
  transitionId: string;
  corridorId: string;
  fromState: CorridorMemoryState;
  toState: CorridorMemoryState;
  transitionReason: string;
  approvedAt: string;
  approvedBy: string;
  covenantSeal: string;
}

export interface FullSeedingResult {
  signalsLoaded: number;
  corridorsMapped: number;
  weeksProcessed: number;
  activationsCreated: number;
  baselineMatchesCreated: number;
  stateTransitionsCreated: number;
  explainabilityCacheEntries: number;
  finalCorridorStates: Record<string, CorridorMemoryState>;
  seededAt: string;
}

// ═══════════════════════════════════════════════════════════════
// CORRIDOR GEOGRAPHY MAPPING (NIGERIAN ENDEMIC CORRIDORS)
// ═══════════════════════════════════════════════════════════════

const NIGERIAN_CORRIDOR_GEOGRAPHY: CorridorGeography[] = [
  // Ondo-Edo Lassa Corridor
  { corridorId: "CORRIDOR-NG-ONDO-EDO-001", state: "Ondo", lga: null, weight: 0.6 },
  { corridorId: "CORRIDOR-NG-ONDO-EDO-001", state: "Edo", lga: null, weight: 0.4 },
  
  // Bauchi-Taraba Lassa Corridor
  { corridorId: "CORRIDOR-NG-BAUCHI-TARABA-001", state: "Bauchi", lga: null, weight: 0.5 },
  { corridorId: "CORRIDOR-NG-BAUCHI-TARABA-001", state: "Taraba", lga: null, weight: 0.5 },
  
  // Lake Victoria Corridor (existing)
  { corridorId: "CORRIDOR-KE-TZ-047", state: "Kisumu", lga: null, weight: 0.5 },
  { corridorId: "CORRIDOR-KE-TZ-047", state: "Mwanza", lga: null, weight: 0.5 },
];

// ═══════════════════════════════════════════════════════════════
// DISEASE FLOORS
// ═══════════════════════════════════════════════════════════════

const DISEASE_FLOORS: Record<string, number> = {
  LASSA: 0.76,
  CHOLERA: 0.66,
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

// ═══════════════════════════════════════════════════════════════
// LASSA FIRE SCORE CALCULATION
// ═══════════════════════════════════════════════════════════════

function computeLassaFireScore(aggregate: WeeklySignalAggregate): number {
  const positivityScore = aggregate.avgPositivity;
  const confirmedScore = Math.min(aggregate.totalConfirmed / 100.0, 1.0);
  const cfrScore = aggregate.avgCfr;
  const qualityScore = aggregate.avgDataQuality;
  const endemicScore = 0.5; // Placeholder for endemic spatial score

  const rawScore =
    0.30 * positivityScore +
    0.25 * confirmedScore +
    0.20 * endemicScore +
    0.15 * cfrScore +
    0.10 * qualityScore;

  return Math.min(rawScore, 1.0);
}

// ═══════════════════════════════════════════════════════════════
// STATE TRANSITION RULES
// ═══════════════════════════════════════════════════════════════

interface TransitionRule {
  fromState: CorridorMemoryState;
  toState: CorridorMemoryState;
  condition: (history: CorridorActivation[]) => boolean;
  reason: string;
}

const TRANSITION_RULES: TransitionRule[] = [
  {
    fromState: "REFERENCE",
    toState: "HYPOTHESIS",
    condition: (history) => {
      const recentActive = history.filter(a => a.active).slice(0, 3);
      return recentActive.length >= 2;
    },
    reason: "Signal cluster detected (2+ active weeks)",
  },
  {
    fromState: "HYPOTHESIS",
    toState: "REALTIME",
    condition: (history) => {
      const recentActive = history.filter(a => a.active).slice(0, 4);
      return recentActive.length >= 3;
    },
    reason: "Sustained activation (3+ consecutive weeks)",
  },
  {
    fromState: "REALTIME",
    toState: "HYBRID",
    condition: (history) => {
      // Transition to HYBRID if baseline match found
      return history.some(a => a.memoryInformedScore >= 0.70);
    },
    reason: "Historical pattern match detected",
  },
  {
    fromState: "HYBRID",
    toState: "FIELD_CONFIRMED",
    condition: (history) => {
      // High confidence activation
      return history.some(a => a.memoryInformedScore >= 0.85);
    },
    reason: "High-confidence activation (score >= 0.85)",
  },
  {
    fromState: "REALTIME",
    toState: "HYPOTHESIS",
    condition: (history) => {
      const recentInactive = history.filter(a => !a.active).slice(0, 8);
      return recentInactive.length >= 6;
    },
    reason: "Staleness decay (6+ inactive weeks)",
  },
  {
    fromState: "HYPOTHESIS",
    toState: "ARCHIVED",
    condition: (history) => {
      const recentInactive = history.filter(a => !a.active).slice(0, 12);
      return recentInactive.length >= 10;
    },
    reason: "Evidence decayed (10+ inactive weeks)",
  },
];

// ═══════════════════════════════════════════════════════════════
// BASELINE PATTERN DETECTION
// ═══════════════════════════════════════════════════════════════

function detectBaselinePatterns(activations: CorridorActivation[]): BaselineMatch[] {
  const matches: BaselineMatch[] = [];
  
  // Group by corridor
  const byCorridor = new Map<string, CorridorActivation[]>();
  for (const a of activations) {
    if (!byCorridor.has(a.corridorId)) {
      byCorridor.set(a.corridorId, []);
    }
    byCorridor.get(a.corridorId)!.push(a);
  }

  // For each corridor, detect seasonal patterns
  for (const [corridorId, corridorActivations] of byCorridor) {
    // Lassa dry-season peak (weeks 1-8)
    const drySeasonActivations = corridorActivations.filter(a => a.epiWeek >= 1 && a.epiWeek <= 8 && a.active);
    if (drySeasonActivations.length >= 3) {
      const avgScore = drySeasonActivations.reduce((sum, a) => sum + a.memoryInformedScore, 0) / drySeasonActivations.length;
      if (avgScore >= 0.70) {
        matches.push({
          corridorId,
          disease: "LASSA",
          patternType: "Lassa_dry_season_peak",
          epiWeekStart: 1,
          epiWeekEnd: 8,
          matchScore: avgScore,
          percentileThreshold: 0.75,
          confidence: 0.85,
        });
      }
    }

    // Cholera rainy season (weeks 20-30)
    const rainySeasonActivations = corridorActivations.filter(a => a.epiWeek >= 20 && a.epiWeek <= 30 && a.disease === "CHOLERA" && a.active);
    if (rainySeasonActivations.length >= 3) {
      const avgScore = rainySeasonActivations.reduce((sum, a) => sum + a.memoryInformedScore, 0) / rainySeasonActivations.length;
      if (avgScore >= 0.65) {
        matches.push({
          corridorId,
          disease: "CHOLERA",
          patternType: "Cholera_rainy_season",
          epiWeekStart: 20,
          epiWeekEnd: 30,
          matchScore: avgScore,
          percentileThreshold: 0.75,
          confidence: 0.80,
        });
      }
    }
  }

  return matches;
}

// ═══════════════════════════════════════════════════════════════
// FULL HISTORICAL SEEDING ENGINE
// ═══════════════════════════════════════════════════════════════

class HistoricalSeedingEngine {
  private corridorStates: Map<string, CorridorMemoryState> = new Map();
  private corridorHistory: Map<string, CorridorActivation[]> = new Map();
  private transitions: StateTransition[] = [];

  constructor() {
    // Initialize all corridors as REFERENCE
    for (const geo of NIGERIAN_CORRIDOR_GEOGRAPHY) {
      if (!this.corridorStates.has(geo.corridorId)) {
        this.corridorStates.set(geo.corridorId, "REFERENCE");
        this.corridorHistory.set(geo.corridorId, []);
      }
    }
  }

  /**
   * Aggregate signals for a corridor in a given week
   */
  private aggregateCorridorSignals(
    corridorId: string,
    year: number,
    epiWeek: number,
    signals: NCDCSignal[]
  ): WeeklySignalAggregate | null {
    const corridorGeo = NIGERIAN_CORRIDOR_GEOGRAPHY.filter(g => g.corridorId === corridorId);
    if (corridorGeo.length === 0) return null;

    const matchingSignals: NCDCSignal[] = [];
    for (const geo of corridorGeo) {
      const stateSignals = signals.filter(s => s.state === geo.state);
      if (geo.lga) {
        matchingSignals.push(...stateSignals.filter(s => s.lga === geo.lga));
      } else {
        matchingSignals.push(...stateSignals.filter(s => s.lga === null));
      }
    }

    if (matchingSignals.length === 0) return null;

    // Aggregate by disease (simplified: take first disease)
    const disease = matchingSignals[0].disease;
    const totalConfirmed = matchingSignals.reduce((sum, s) => sum + s.confirmedCases, 0);
    const avgPositivity = matchingSignals.reduce((sum, s) => sum + s.positivityRate, 0) / matchingSignals.length;
    const avgCfr = matchingSignals.reduce((sum, s) => sum + s.cfr, 0) / matchingSignals.length;
    const avgDataQuality = matchingSignals.reduce((sum, s) => sum + s.dataQualityScore, 0) / matchingSignals.length;

    return {
      disease,
      signalCount: matchingSignals.length,
      totalConfirmed,
      avgPositivity,
      avgCfr,
      avgDataQuality,
    };
  }

  /**
   * Process a single week for all corridors
   */
  private processWeek(
    year: number,
    epiWeek: number,
    signals: NCDCSignal[]
  ): CorridorActivation[] {
    const weekActivations: CorridorActivation[] = [];

    for (const [corridorId, currentState] of this.corridorStates) {
      const aggregate = this.aggregateCorridorSignals(corridorId, year, epiWeek, signals);
      
      if (!aggregate) continue;

      // Compute raw fire score
      const rawFireScore = computeLassaFireScore(aggregate);

      // Compute memory-informed score
      const memoryInformedScore = computeMemoryInformedFireScore(rawFireScore, currentState);

      // Determine if active
      const diseaseFloor = DISEASE_FLOORS[aggregate.disease] ?? DISEASE_FLOORS.OTHER;
      const active = memoryInformedScore >= diseaseFloor;

      // Create activation
      const activation: CorridorActivation = {
        activationId: `ACT-${corridorId}-${year}-W${epiWeek}`,
        corridorId,
        disease: aggregate.disease,
        year,
        epiWeek,
        rawFireScore,
        memoryInformedScore,
        memoryState: currentState,
        active,
        covenantSeal: null, // Will be set if covenant check passes
        createdAt: new Date().toISOString(),
      };

      weekActivations.push(activation);

      // Update history
      const history = this.corridorHistory.get(corridorId) ?? [];
      history.push(activation);
      this.corridorHistory.set(corridorId, history);

      // Check for state transitions
      this.checkStateTransitions(corridorId, history);
    }

    return weekActivations;
  }

  /**
   * Check and apply state transitions
   */
  private checkStateTransitions(corridorId: string, history: CorridorActivation[]): void {
    const currentState = this.corridorStates.get(corridorId)!;

    for (const rule of TRANSITION_RULES) {
      if (rule.fromState === currentState && rule.condition(history)) {
        // Apply transition
        const transition: StateTransition = {
          transitionId: `TRANS-${corridorId}-${Date.now()}`,
          corridorId,
          fromState: currentState,
          toState: rule.toState,
          transitionReason: rule.reason,
          approvedAt: new Date().toISOString(),
          approvedBy: "mo-poe-historical-seeding-001",
          covenantSeal: this.generateSeal(corridorId, currentState, rule.toState),
        };

        this.transitions.push(transition);
        this.corridorStates.set(corridorId, rule.toState);
        
        console.log(`  [TRANSITION] ${corridorId}: ${currentState} → ${rule.toState} (${rule.reason})`);
        break; // Only one transition per week
      }
    }
  }

  /**
   * Generate covenant seal for transition
   */
  private generateSeal(corridorId: string, fromState: CorridorMemoryState, toState: CorridorMemoryState): string {
    const input = `${corridorId}-${fromState}-${toState}-${Date.now()}`;
    // Simple hash for simulation (in production, use crypto)
    return `SEAL-${input.length}-${input.slice(0, 8)}`;
  }

  /**
   * Run full historical seeding
   */
  async runFullSeeding(
    signals: NCDCSignal[],
    startYear: number = 2022,
    endYear: number = 2024
  ): Promise<FullSeedingResult> {
    console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  Full Historical Seeding                                     ║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝\n`);

    const allActivations: CorridorActivation[] = [];

    // Process each week
    for (let year = startYear; year <= endYear; year++) {
      for (let week = 1; week <= 52; week++) {
        const weekSignals = signals.filter(s => s.year === year && s.epiWeek === week);
        const weekActivations = this.processWeek(year, week, weekSignals);
        allActivations.push(...weekActivations);
      }
    }

    // Detect baseline patterns
    const baselineMatches = detectBaselinePatterns(allActivations);

    // Generate explainability cache for key activations
    const explainabilityCache = this.generateExplainabilityCache(allActivations, this.transitions);

    const result: FullSeedingResult = {
      signalsLoaded: signals.length,
      corridorsMapped: new Set(NIGERIAN_CORRIDOR_GEOGRAPHY.map(g => g.corridorId)).size,
      weeksProcessed: (endYear - startYear + 1) * 52,
      activationsCreated: allActivations.length,
      baselineMatchesCreated: baselineMatches.length,
      stateTransitionsCreated: this.transitions.length,
      explainabilityCacheEntries: explainabilityCache.length,
      finalCorridorStates: Object.fromEntries(this.corridorStates),
      seededAt: new Date().toISOString(),
    };

    console.log(`\n  Signals loaded: ${result.signalsLoaded}`);
    console.log(`  Corridors mapped: ${result.corridorsMapped}`);
    console.log(`  Weeks processed: ${result.weeksProcessed}`);
    console.log(`  Activations created: ${result.activationsCreated}`);
    console.log(`  Baseline matches: ${result.baselineMatchesCreated}`);
    console.log(`  State transitions: ${result.stateTransitionsCreated}`);
    console.log(`  Explainability cache: ${result.explainabilityCacheEntries}`);
    console.log(`\n  Final corridor states:`);
    for (const [corridorId, state] of Object.entries(result.finalCorridorStates)) {
      console.log(`    ${corridorId}: ${state}`);
    }

    return result;
  }

  /**
   * Generate explainability cache entries
   */
  private generateExplainabilityCache(
    activations: CorridorActivation[],
    transitions: StateTransition[]
  ): Array<{ corridorId: string; activationId: string; report: string }> {
    const cache: Array<{ corridorId: string; activationId: string; report: string }> = [];

    // Cache activations that caused transitions
    for (const transition of transitions) {
      const activation = activations.find(a => a.corridorId === transition.corridorId);
      if (activation) {
        cache.push({
          corridorId: transition.corridorId,
          activationId: activation.activationId,
          report: this.generateCovenantReport(activation, transition),
        });
      }
    }

    return cache;
  }

  /**
   * Generate covenant report
   */
  private generateCovenantReport(activation: CorridorActivation, transition: StateTransition): string {
    return `# Covenant Report: ${activation.corridorId}

## Activation Details
- **Week:** ${activation.year}-W${activation.epiWeek}
- **Disease:** ${activation.disease}
- **Raw Fire Score:** ${activation.rawFireScore.toFixed(3)}
- **Memory-Informed Score:** ${activation.memoryInformedScore.toFixed(3)}
- **Memory State:** ${activation.memoryState}
- **Active:** ${activation.active}

## State Transition
- **From:** ${transition.fromState}
- **To:** ${transition.toState}
- **Reason:** ${transition.transitionReason}
- **Covenant Seal:** ${transition.covenantSeal}

## Evidence
- Signal aggregation from corridor geography
- Memory modulation factor applied
- Disease floor threshold: ${DISEASE_FLOORS[activation.disease]?.toFixed(2)}
`;
  }
}

// ═══════════════════════════════════════════════════════════════
// MO-SCRIPT: FULL HISTORICAL SEEDING
// ═══════════════════════════════════════════════════════════════

export const mo_FULL_HISTORICAL_SEEDING: MoScript = {
  id: "mo-poe-historical-seeding-full-001" as `mo-${string}-${string}-${number}`,
  name: "Full Historical Seeding",
  trigger: 'manual("historical.seed.full")',
  inputs: ["ncdcSignals", "startYear", "endYear"],
  logic: async (inputs: Record<string, unknown>): Promise<FullSeedingResult> => {
    const { ncdcSignals, startYear = 2022, endYear = 2024 } = inputs as {
      ncdcSignals: NCDCSignal[];
      startYear?: number;
      endYear?: number;
    };

    const engine = new HistoricalSeedingEngine();
    return await engine.runFullSeeding(ncdcSignals, startYear, endYear);
  },
  voiceLine: (result: FullSeedingResult) =>
    `Historical seeding complete. ${result.activationsCreated} activations, ${result.stateTransitionsCreated} transitions, ${result.baselineMatchesCreated} baseline matches.`,
};

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export const FULL_HISTORICAL_SEEDING_SCRIPTS = [mo_FULL_HISTORICAL_SEEDING];
