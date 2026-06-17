/**
 * ◉⟁⬡  MoStar Industries
 * Phantom POE — Baseline Reference Layer
 * 
 * Two-Mode System:
 * - REFERENCE: Historical baseline corridors (archived patterns)
 * - REALTIME: Live incoming signals (current detection)
 * - HYBRID: Historical corridor reactivated by live evidence
 */

import { MoScript } from "./types";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type CorridorMode = "REFERENCE" | "REALTIME" | "HYBRID";

export type CorridorEvidenceClass =
  | "HISTORICAL_BASELINE"
  | "LIVE_SIGNAL"
  | "FIELD_CONFIRMED"
  | "MODEL_INFERRED";

export interface BaselineCorridor {
  corridorId: string;
  name: string;
  startNode: string;
  endNode: string;
  startCoord: { lat: number; lng: number };
  endCoord: { lat: number; lng: number };
  
  // Mode classification
  mode: CorridorMode;
  evidenceClass: CorridorEvidenceClass;
  
  // Historical profile
  baselineScore: number;
  historicalRiskClass: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  typicalSeasons: string[];  // ['wet', 'dry', 'harvest']
  lastHistoricalActivity: string;  // ISO date
  
  // Live tracking
  live: boolean;
  liveActivatedAt?: string;
  liveSignalCount: number;
  
  // Metadata
  archivedAt: string;
  description: string;
  historicalDiseasePattern?: string[];  // ['CHOLERA', 'LASSA']
}

export interface LiveToBaselineMatch {
  matchId: string;
  liveSignalId: string;
  baselineCorridorId: string;
  similarity: number;  // 0.0 to 1.0
  distanceKm: number;
  spatialOverlap: number;
  temporalAlignment: number;
  diseaseMatch: boolean;
  
  // Activation decision
  reactivatesHistorical: boolean;
  recommendedMode: CorridorMode;
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════
// MoScript: Archive Historical Baseline
// ═══════════════════════════════════════════════════════════════

const mo_ARCHIVE_HISTORICAL_BASELINE: MoScript = {
  id: "mo-poe-archive-historical-baseline-v1-001" as `mo-${string}-${string}-${number}`,
  name: "Archive Historical Corridor Baseline",
  trigger: 'manual("baseline.archive")',
  inputs: ["historicalCorridors", "corridorRepo"],
  logic: async (inputs: Record<string, any>) => {
    const { historicalCorridors, corridorRepo } = inputs as {
      historicalCorridors: Array<{
        corridorId: string;
        name: string;
        startNode: string;
        endNode: string;
        startCoord: { lat: number; lng: number };
        endCoord: { lat: number; lng: number };
        baselineScore: number;
        historicalRiskClass: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
        typicalSeasons?: string[];
        lastHistoricalActivity?: string;
        description?: string;
        historicalDiseasePattern?: string[];
      }>;
      corridorRepo: {
        upsertBaselineCorridors: (corridors: BaselineCorridor[]) => Promise<BaselineCorridor[]>;
      };
    };
    
    const archivedAt = new Date().toISOString();
    
    const archived = historicalCorridors.map((c) => ({
      ...c,
      mode: "REFERENCE" as CorridorMode,
      evidenceClass: "HISTORICAL_BASELINE" as CorridorEvidenceClass,
      live: false,
      liveSignalCount: 0,
      archivedAt,
      typicalSeasons: c.typicalSeasons || [],
      lastHistoricalActivity: c.lastHistoricalActivity || archivedAt,
      description: c.description || `Historical baseline corridor ${c.corridorId}`,
    }));

    const saved = await corridorRepo.upsertBaselineCorridors(archived);

    return {
      archived: saved.length,
      mode: "REFERENCE",
      archivedAt,
      corridors: saved.map(c => c.corridorId),
    };
  },
  voiceLine: (r: { archived: number; mode: string }) =>
    `Historical baseline sealed. ${r.archived} reference corridors archived.`,
  sass: true,
};

// ═══════════════════════════════════════════════════════════════
// MoScript: Compare Live to Baseline
// ═══════════════════════════════════════════════════════════════

const mo_COMPARE_LIVE_TO_BASELINE: MoScript = {
  id: "mo-poe-live-baseline-compare-v1-001" as `mo-${string}-${string}-${number}`,
  name: "Live Signal to Baseline Corridor Comparison",
  trigger: 'event("signals.ingested")',
  inputs: ["liveSignals", "baselineRepo", "corridorEngine"],
  logic: async (inputs: Record<string, any>) => {
    const { liveSignals, baselineRepo, corridorEngine } = inputs as {
      liveSignals: Array<{
        signalId: string;
        lat: number;
        lng: number;
        timestamp: string;
        disease?: string;
        magnitude: number;
        confidence: number;
      }>;
      baselineRepo: {
        getActiveReferenceCorridors: () => Promise<BaselineCorridor[]>;
      };
      corridorEngine: {
        compareLiveSignalsToBaselines: (params: {
          liveSignals: typeof liveSignals;
          baselines: BaselineCorridor[];
        }) => Promise<LiveToBaselineMatch[]>;
      };
    };
    
    const baselines = await baselineRepo.getActiveReferenceCorridors();
    
    if (baselines.length === 0) {
      return {
        matchedHistoricalPatterns: 0,
        matches: [],
        newCorridorCandidates: liveSignals.length > 1 ? [{
          type: "NO_BASELINE",
          message: "No historical baseline available. All signals are new corridor candidates.",
          candidateCount: liveSignals.length,
        }] : [],
        comparisonRunAt: new Date().toISOString(),
      };
    }

    const matches = await corridorEngine.compareLiveSignalsToBaselines({
      liveSignals,
      baselines,
    });
    
    // Separate reactivations from new patterns
    const reactivations = matches.filter((m) => m.reactivatesHistorical);
    const newPatterns = matches.filter((m) => !m.reactivatesHistorical && m.similarity < 0.55);

    return {
      matchedHistoricalPatterns: matches.length,
      historicalReactivations: reactivations.length,
      matches,
      newCorridorCandidates: newPatterns,
      baselinesChecked: baselines.length,
      comparisonRunAt: new Date().toISOString(),
    };
  },
  voiceLine: (r: { matchedHistoricalPatterns: number; historicalReactivations?: number }) =>
    `${r.matchedHistoricalPatterns} live-to-baseline comparisons sealed. ` +
    `${r.historicalReactivations || 0} historical reactivations detected.`,
  sass: true,
};

// ═══════════════════════════════════════════════════════════════
// MoScript: Corridor Mode State Manager
// ═══════════════════════════════════════════════════════════════

const mo_CORRIDOR_MODE_MANAGER: MoScript = {
  id: "mo-poe-corridor-mode-manager-v1-001" as `mo-${string}-${string}-${number}`,
  name: "Corridor Mode State Manager",
  trigger: 'event("corridor.match.evaluated")',
  inputs: ["corridorId", "matchResult", "corridorRepo"],
  logic: async (inputs: Record<string, any>) => {
    const { corridorId, matchResult, corridorRepo } = inputs as {
      corridorId: string;
      matchResult: {
        recommendedMode: CorridorMode;
        confidence: number;
        similarity: number;
        liveSignalCount: number;
      };
      corridorRepo: {
        getCorridor: (id: string) => Promise<BaselineCorridor | null>;
        updateCorridorMode: (id: string, mode: CorridorMode, updates: Partial<BaselineCorridor>) => Promise<BaselineCorridor>;
      };
    };
    
    const existing = await corridorRepo.getCorridor(corridorId);
    
    if (!existing) {
      throw new Error(`Corridor ${corridorId} not found`);
    }
    
    const oldMode = existing.mode;
    const newMode = matchResult.recommendedMode;
    
    // Mode transition logic
    const updates: Partial<BaselineCorridor> = {
      mode: newMode,
    };
    
    if (newMode === "HYBRID" && oldMode === "REFERENCE") {
      // Historical corridor being reactivated
      updates.live = true;
      updates.liveActivatedAt = new Date().toISOString();
      updates.evidenceClass = "FIELD_CONFIRMED";
      updates.liveSignalCount = matchResult.liveSignalCount;
    } else if (newMode === "REALTIME") {
      // Pure new corridor
      updates.live = true;
      updates.evidenceClass = "LIVE_SIGNAL";
      updates.liveSignalCount = matchResult.liveSignalCount;
    }
    
    const updated = await corridorRepo.updateCorridorMode(corridorId, newMode, updates);
    
    return {
      corridorId,
      previousMode: oldMode,
      newMode,
      modeChanged: oldMode !== newMode,
      confidence: matchResult.confidence,
      similarity: matchResult.similarity,
      updatedAt: new Date().toISOString(),
    };
  },
  voiceLine: (r: { corridorId: string; newMode: string; modeChanged: boolean }) =>
    r.modeChanged
      ? `Corridor ${r.corridorId.slice(0, 12)}... transitioned to ${r.newMode}.`
      : `Corridor ${r.corridorId.slice(0, 12)}... mode unchanged (${r.newMode}).`,
  sass: true,
};

// ═══════════════════════════════════════════════════════════════
// Helper: Spatial Similarity Calculation
// ═══════════════════════════════════════════════════════════════

export function calculateSpatialSimilarity(
  liveSignal: { lat: number; lng: number },
  baseline: { startCoord: { lat: number; lng: number }; endCoord: { lat: number; lng: number } }
): number {
  // Distance from signal to corridor centerline
  const corridorCenter = {
    lat: (baseline.startCoord.lat + baseline.endCoord.lat) / 2,
    lng: (baseline.startCoord.lng + baseline.endCoord.lng) / 2,
  };
  
  const distanceKm = haversineDistance(
    liveSignal.lat, liveSignal.lng,
    corridorCenter.lat, corridorCenter.lng
  );
  
  // Similarity decays with distance: 1.0 at 0km, 0.0 at 100km
  const similarity = Math.max(0, 1 - distanceKm / 100);
  
  return similarity;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ═══════════════════════════════════════════════════════════════
// Helper: Disease Pattern Match
// ═══════════════════════════════════════════════════════════════

export function calculateDiseaseMatch(
  liveDisease: string | undefined,
  historicalPattern: string[] | undefined
): boolean {
  if (!liveDisease || !historicalPattern || historicalPattern.length === 0) {
    return false;
  }
  
  return historicalPattern.some(d => 
    d.toLowerCase() === liveDisease.toLowerCase()
  );
}

// ═══════════════════════════════════════════════════════════════
// Helper: Determine Corridor Mode from Match
// ═══════════════════════════════════════════════════════════════

export function determineCorridorMode(
  match: {
    similarity: number;
    spatialOverlap: number;
    temporalAlignment: number;
    diseaseMatch: boolean;
  },
  thresholds: {
    hybrid: number;    // Default: 0.70 (strong match = reactivation)
    realtime: number;  // Default: 0.55 (weak match = new corridor)
  } = { hybrid: 0.70, realtime: 0.55 }
): { mode: CorridorMode; confidence: number } {
  const compositeScore = 
    match.similarity * 0.4 +
    match.spatialOverlap * 0.3 +
    match.temporalAlignment * 0.2 +
    (match.diseaseMatch ? 0.1 : 0);
  
  if (compositeScore >= thresholds.hybrid) {
    return { mode: "HYBRID", confidence: compositeScore };
  } else if (compositeScore >= thresholds.realtime) {
    return { mode: "REALTIME", confidence: compositeScore };
  } else {
    return { mode: "REALTIME", confidence: compositeScore };  // New pattern
  }
}

// ═══════════════════════════════════════════════════════════════
// Export All Baseline Scripts
// ═══════════════════════════════════════════════════════════════

// Export the scripts array for bulk mounting
// Individual scripts can be accessed via: BASELINE_REFERENCE_SCRIPTS[0], [1], [2]
export const BASELINE_REFERENCE_SCRIPTS = [
  mo_ARCHIVE_HISTORICAL_BASELINE,
  mo_COMPARE_LIVE_TO_BASELINE,
  mo_CORRIDOR_MODE_MANAGER,
] as const;
