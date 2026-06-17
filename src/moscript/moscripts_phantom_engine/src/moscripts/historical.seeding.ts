/**
 * ◉⟁⬡  MoStar Industries
 * Phantom POE — Historical Activation Seeding
 * 
 * Core Rule: Historical data is seeded only after the state machine is sealed.
 * NCDC Lassa records → state/week normalization → corridor matching → backfill → replay test
 */

import { MoScript } from "./types";
import type { CorridorMemoryState } from "./covenant.state.transition";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface NCDCRecord {
  recordId: string;
  diseaseCode: string;
  state: string;
  week: number;
  year: number;
  cases: number;
  deaths: number;
  reportedAt: string;
  lat?: number;
  lng?: number;
}

export interface NormalizedSignal {
  signalId: string;
  diseaseCode: string;
  state: string;
  week: number;
  year: number;
  normalizedCases: number;
  lat: number;
  lng: number;
  timestamp: string;
}

export interface CorridorMatch {
  corridorId: string;
  corridorName: string;
  matchScore: number;
  distanceKm: number;
  alignment: "exact" | "near" | "regional";
}

export interface HistoricalActivation {
  activationId: string;
  corridorId: string;
  diseaseCode: string;
  activationDate: string;
  signalCount: number;
  compositeScore: number;
  memoryState: CorridorMemoryState;
  activationType: "FIRST_DETECTION" | "REACTIVATION";
  explanation: string;
}

export interface SeedingResult {
  totalRecords: number;
  normalizedSignals: number;
  corridorMatches: number;
  activationsCreated: number;
  activationsByState: Record<CorridorMemoryState, number>;
  replayTestPassed: boolean;
  replayTestErrors: string[];
  seededAt: string;
}

// ═══════════════════════════════════════════════════════════════
// CORRIDOR DEFINITIONS (STUB)
// ═══════════════════════════════════════════════════════════════

const CORRIDOR_DEFINITIONS: Array<{
  id: string;
  name: string;
  startNode: string;
  endNode: string;
  states: string[];
  centroid: { lat: number; lng: number };
}> = [
  {
    id: "CORRIDOR-KE-TZ-047",
    name: "Lake Victoria Lassa Corridor",
    startNode: "Kisumu",
    endNode: "Mwanza",
    states: ["Kisumu", "Mwanza", "Musoma"],
    centroid: { lat: -0.5, lng: 34.5 },
  },
  {
    id: "CORRIDOR-NG-CM-012",
    name: "Cross-River Lassa Corridor",
    startNode: "Calabar",
    endNode: "Douala",
    states: ["Cross River", "Southwest"],
    centroid: { lat: 5.0, lng: 9.0 },
  },
];

// ═══════════════════════════════════════════════════════════════
// NORMALIZATION ENGINE
// ═══════════════════════════════════════════════════════════════

class NormalizationEngine {
  /**
   * Normalize NCDC records by state/week
   */
  normalizeByStateWeek(records: NCDCRecord[]): NormalizedSignal[] {
    const signals: NormalizedSignal[] = [];

    // Group by state and week
    const grouped = new Map<string, NCDCRecord[]>();
    for (const record of records) {
      const key = `${record.state}-${record.year}-W${record.week}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(record);
    }

    // Calculate normalization factor (cases per 100k population)
    // For now, use simple max normalization
    for (const [key, group] of grouped) {
      const maxCases = Math.max(...group.map(r => r.cases));
      for (const record of group) {
        const normalizedCases = record.cases / (maxCases || 1);
        signals.push({
          signalId: `SIG-${record.recordId}`,
          diseaseCode: record.diseaseCode,
          state: record.state,
          week: record.week,
          year: record.year,
          normalizedCases,
          lat: record.lat ?? 0,
          lng: record.lng ?? 0,
          timestamp: record.reportedAt,
        });
      }
    }

    console.log(`  [NORMALIZATION] Normalized ${records.length} records into ${signals.length} signals`);
    return signals;
  }
}

// ═══════════════════════════════════════════════════════════════
// CORRIDOR MATCHING ENGINE
// ═══════════════════════════════════════════════════════════════

class CorridorMatchingEngine {
  /**
   * Match normalized signals to corridor definitions
   */
  matchToCorridors(signals: NormalizedSignal[]): Map<string, CorridorMatch[]> {
    const matches = new Map<string, CorridorMatch[]>();

    for (const signal of signals) {
      const signalMatches: CorridorMatch[] = [];

      for (const corridor of CORRIDOR_DEFINITIONS) {
        // Check if signal state is in corridor's state list
        if (corridor.states.includes(signal.state)) {
          const distance = this.calculateDistance(
            signal.lat,
            signal.lng,
            corridor.centroid.lat,
            corridor.centroid.lng
          );

          let alignment: "exact" | "near" | "regional";
          if (distance < 50) {
            alignment = "exact";
          } else if (distance < 150) {
            alignment = "near";
          } else {
            alignment = "regional";
          }

          const matchScore = this.calculateMatchScore(distance, alignment, signal.normalizedCases);

          signalMatches.push({
            corridorId: corridor.id,
            corridorName: corridor.name,
            matchScore,
            distanceKm: distance,
            alignment,
          });
        }
      }

      // Sort by match score and keep top 3
      signalMatches.sort((a, b) => b.matchScore - a.matchScore);
      matches.set(signal.signalId, signalMatches.slice(0, 3));
    }

    const totalMatches = Array.from(matches.values()).reduce((sum, m) => sum + m.length, 0);
    console.log(`  [MATCHING] Matched ${signals.length} signals to ${totalMatches} corridor candidates`);
    return matches;
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private calculateMatchScore(distance: number, alignment: string, normalizedCases: number): number {
    const distanceScore = Math.max(0, 1 - distance / 200);
    const alignmentScore = alignment === "exact" ? 1.0 : alignment === "near" ? 0.7 : 0.4;
    const caseScore = Math.min(1, normalizedCases * 2);
    return (distanceScore * 0.4 + alignmentScore * 0.4 + caseScore * 0.2);
  }
}

// ═══════════════════════════════════════════════════════════════
// ACTIVATION BACKFILL ENGINE
// ═══════════════════════════════════════════════════════════════

class ActivationBackfillEngine {
  /**
   * Backfill historical activations from matched signals
   */
  backfillActivations(
    signals: NormalizedSignal[],
    matches: Map<string, CorridorMatch[]>
  ): HistoricalActivation[] {
    const activations: HistoricalActivation[] = [];
    const corridorSignalMap = new Map<string, NormalizedSignal[]>();

    // Group signals by corridor
    for (const signal of signals) {
      const corridorMatches = matches.get(signal.signalId) ?? [];
      for (const match of corridorMatches) {
        if (!corridorSignalMap.has(match.corridorId)) {
          corridorSignalMap.set(match.corridorId, []);
        }
        corridorSignalMap.get(match.corridorId)!.push(signal);
      }
    }

    // Create activations for each corridor
    for (const [corridorId, corridorSignals] of corridorSignalMap) {
      // Group by year/week to identify activation periods
      const timeGroups = new Map<string, NormalizedSignal[]>();
      for (const signal of corridorSignals) {
        const key = `${signal.year}-W${signal.week}`;
        if (!timeGroups.has(key)) {
          timeGroups.set(key, []);
        }
        timeGroups.get(key)!.push(signal);
      }

      // Create activation for each time group with sufficient signals
      for (const [timeKey, groupSignals] of timeGroups) {
        if (groupSignals.length >= 3) {
          const avgScore = groupSignals.reduce((sum, s) => sum + s.normalizedCases, 0) / groupSignals.length;
          const activationId = `ACT-HIST-${corridorId}-${timeKey}`;
          const corridorDef = CORRIDOR_DEFINITIONS.find(c => c.id === corridorId);

          // Determine memory state based on score
          let memoryState: CorridorMemoryState;
          if (avgScore >= 0.7) {
            memoryState = "REFERENCE";
          } else if (avgScore >= 0.55) {
            memoryState = "REALTIME";
          } else {
            memoryState = "HYPOTHESIS";
          }

          activations.push({
            activationId,
            corridorId,
            diseaseCode: "LASSA",
            activationDate: groupSignals[0].timestamp,
            signalCount: groupSignals.length,
            compositeScore: avgScore,
            memoryState,
            activationType: "FIRST_DETECTION",
            explanation: `Historical backfill: ${groupSignals.length} signals in ${timeKey} with avg score ${avgScore.toFixed(2)}`,
          });
        }
      }
    }

    console.log(`  [BACKFILL] Created ${activations.length} historical activations`);
    return activations;
  }
}

// ═══════════════════════════════════════════════════════════════
// REPLAY TEST ENGINE
// ═══════════════════════════════════════════════════════════════

class ReplayTestEngine {
  /**
   * Run replay test to ensure no illegal transitions occurred
   */
  runReplayTest(activations: HistoricalActivation[]): { passed: boolean; errors: string[] } {
    const errors: string[] = [];

    // Sort activations by date
    const sorted = [...activations].sort((a, b) => new Date(a.activationDate).getTime() - new Date(b.activationDate).getTime());

    // Check for illegal transitions
    const corridorStates = new Map<string, CorridorMemoryState>();

    for (const activation of sorted) {
      const currentState = corridorStates.get(activation.corridorId) ?? "ARCHIVED";
      const newState = activation.memoryState;

      // Validate transition
      const allowedTransitions: Record<CorridorMemoryState, CorridorMemoryState[]> = {
        ARCHIVED: ["HYPOTHESIS", "REALTIME", "REFERENCE"],
        HYPOTHESIS: ["REALTIME", "ARCHIVED"],
        REALTIME: ["HYBRID", "REFERENCE", "ARCHIVED"],
        HYBRID: ["REFERENCE", "ARCHIVED"],
        REFERENCE: ["HYPOTHESIS", "REALTIME", "HYBRID", "ARCHIVED"],
        FIELD_CONFIRMED: ["ARCHIVED"],
      };

      const allowed = allowedTransitions[currentState]?.includes(newState);
      if (!allowed) {
        errors.push(
          `Illegal transition: ${activation.corridorId} ${currentState} → ${newState} at ${activation.activationDate}`
        );
      }

      corridorStates.set(activation.corridorId, newState);
    }

    const passed = errors.length === 0;
    console.log(`  [REPLAY TEST] ${passed ? "PASSED" : "FAILED"} - ${errors.length} errors detected`);
    for (const error of errors) {
      console.log(`  [REPLAY TEST] ERROR: ${error}`);
    }

    return { passed, errors };
  }
}

// ═══════════════════════════════════════════════════════════════
// MO-SCRIPT: HISTORICAL ACTIVATION SEEDING
// ═══════════════════════════════════════════════════════════════

export const mo_HISTORICAL_SEEDING: MoScript = {
  id: "mo-poe-historical-seeding-001" as `mo-${string}-${string}-${number}`,
  name: "Historical Activation Seeding",
  trigger: 'manual("historical.seed")',
  inputs: ["ncdcRecords"],
  logic: async (inputs: Record<string, unknown>): Promise<SeedingResult> => {
    const { ncdcRecords } = inputs as { ncdcRecords: NCDCRecord[] };

    const normalizationEngine = new NormalizationEngine();
    const matchingEngine = new CorridorMatchingEngine();
    const backfillEngine = new ActivationBackfillEngine();
    const replayTestEngine = new ReplayTestEngine();

    // Step 1: Normalize by state/week
    const normalizedSignals = normalizationEngine.normalizeByStateWeek(ncdcRecords);

    // Step 2: Match to corridors
    const matches = matchingEngine.matchToCorridors(normalizedSignals);

    // Step 3: Backfill activations
    const activations = backfillEngine.backfillActivations(normalizedSignals, matches);

    // Step 4: Replay test
    const replayResult = replayTestEngine.runReplayTest(activations);

    // Count activations by state
    const activationsByState: Record<CorridorMemoryState, number> = {
      REFERENCE: 0,
      HYPOTHESIS: 0,
      REALTIME: 0,
      HYBRID: 0,
      FIELD_CONFIRMED: 0,
      ARCHIVED: 0,
    };
    for (const activation of activations) {
      activationsByState[activation.memoryState]++;
    }

    return {
      totalRecords: ncdcRecords.length,
      normalizedSignals: normalizedSignals.length,
      corridorMatches: Array.from(matches.values()).reduce((sum, m) => sum + m.length, 0),
      activationsCreated: activations.length,
      activationsByState,
      replayTestPassed: replayResult.passed,
      replayTestErrors: replayResult.errors,
      seededAt: new Date().toISOString(),
    };
  },
  voiceLine: (result: SeedingResult) =>
    `Historical seeding complete. ${result.activationsCreated} activations backfilled. Replay test ${result.replayTestPassed ? "PASSED" : "FAILED"}.`,
};

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export const HISTORICAL_SEEDING_SCRIPTS = [mo_HISTORICAL_SEEDING];
