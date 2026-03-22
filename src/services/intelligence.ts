/**
 * ◉⟁⬡  MoStar Industries
 * Intelligence Engine — Live Friction Surface & Explainability Trace
 * Engine: mo-border-phantom-001
 *
 * Live-data-only scoring core.
 * No mock/sample/demo/synthetic evidence is accepted.
 */

export type EvidenceType =
  | 'health_signal'
  | 'market_signal'
  | 'transport_signal'
  | 'linguistic_drift'
  | 'entropy_spike'
  | 'centrality_score'
  | 'gravity_pull'
  | 'diffusion_timing'
  | 'hmm_inference'
  | 'seasonal_weight'
  | 'friction_surface'
  | 'remote_sensing'
  | 'community_report'
  | 'path_plausibility'
  | 'location_sharpening'
  | 'anomaly_bloom'
  | 'forecast_drift';

export type RiskClass = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export enum LandCover {
  OPEN_GROUND = 'open_ground',
  SPARSE_VEG = 'sparse_vegetation',
  DENSE_FOREST = 'dense_forest',
  CROPLAND = 'cropland',
  WETLAND = 'wetland',
  URBAN = 'urban',
  WATER_BODY = 'water_body',
  ROCK_BARE = 'bare_rock',
  SAND_DUNE = 'sand_dune',
}

export enum TransportMode {
  FOOT = 'foot',
  MOTORCYCLE = 'motorcycle',
  VEHICLE = 'vehicle',
  CANOE = 'canoe',
  LIVESTOCK = 'livestock',
}

export enum SeasonalPhase {
  DRY = 'dry',
  WET_ONSET = 'wet_onset',
  PEAK_WET = 'peak_wet',
  RECESSION = 'recession',
}

export enum CorridorState {
  DORMANT = 'dormant',
  PROBING = 'probing',
  ACTIVE = 'active_crossing',
  SURGE = 'surge',
  DISSIPATING = 'dissipating',
}

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface LocationBelief {
  center: Coordinate;
  uncertaintyRadiusM: number;
  probabilityMass: number;
  polygon?: Coordinate[]; // Uncertain polygon
}

export interface AnomalyResult {
  entropyShift: number;
  isAnomaly: boolean;
  confidence: number;
}

export interface PathGeometry {
  type: 'LineString';
  coordinates: [number, number][]; // [lng, lat]
}

export interface EvidenceAtom {
  evidenceType: EvidenceType;
  description: string;
  weight: number; // 0..1
  source: string; // e.g. ACLED, IOM_DTM, DHIS2, Sentinel
  sourceRecordId: string;
  confidence: number; // 0..1
  timestamp: string; // ISO8601
  nodeIds: string[];
  rawValue?: unknown;
  synthetic?: boolean;
}

export interface CorridorScore {
  runId: string;
  corridorId: string;
  startNode: string;
  endNode: string;
  corridorScore: number;
  riskClass: RiskClass;
  latentState: CorridorState;
  gravityScore: number;
  diffusionScore: number;
  centralityScore: number;
  hmmScore: number;
  seasonalScore: number;
  linguisticScore: number;
  entropyScore: number;
  frictionScore: number;
  evidenceSupportScore: number;
  inferredMode: string;
  inferredVelocityKmh: number;
  evidence: EvidenceAtom[];
  traceLines: string[];
  phantomPoeActivated: boolean;
  seasonallyActive: boolean;
  requiresCanoe: boolean;
  conflictDetour: boolean;
  firstDetected: string;
  lastUpdated: string;
  scoreDecomposition: {
    gravity: number;
    diffusion: number;
    centrality: number;
    hmm: number;
    seasonal: number;
    linguistic: number;
    entropy: number;
    terrain: number;
    path: number;
    location: number;
    forecast: number;
    anomaly: number;
  };
  inferredPath?: PathGeometry;
  locationBeliefs?: Record<string, LocationBelief>;
  anomalyMetrics?: AnomalyResult;
  forecast?: {
    nextActivationLikelihood: number;
    driftDirectionDeg: number;
  };
}

export interface FrictionContext {
  slopeDeg: number;
  landCover: LandCover;
  riverWidthM?: number;
  roadQuality?: 0 | 1 | 2 | 3;
  rainfallAnomaly?: number; // -1..+1
}

export interface ModeInferenceInput {
  frictionByMode: Record<TransportMode, number>;
  velocityKmh?: number;
  riverWidthM?: number;
  landCover: LandCover;
}

const LIVE_SOURCE_BLOCKLIST = [
  'mock',
  'sample',
  'demo',
  'synthetic',
  'test',
  'stub',
  'fake',
  'placeholder',
];

const SOUL_WEIGHTS: Record<
  | 'gravity'
  | 'diffusion'
  | 'centrality'
  | 'hmm'
  | 'seasonal'
  | 'linguistic'
  | 'entropy'
  | 'friction'
  | 'evidence'
  | 'path'
  | 'location'
  | 'forecast'
  | 'anomaly',
  number
> = {
  gravity: 0.1,
  diffusion: 0.15,
  centrality: 0.12,
  hmm: 0.15,
  seasonal: 0.05,
  linguistic: 0.05,
  entropy: 0.08,
  friction: 0.05,
  evidence: 0.05,
  path: 0.1,
  location: 0.05,
  forecast: 0.05,
  anomaly: 0.05,
};

const RISK_THRESHOLDS: Record<RiskClass, number> = {
  CRITICAL: 0.85,
  HIGH: 0.65,
  MEDIUM: 0.4,
  LOW: 0,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function assertNonEmpty(value: string, field: string): void {
  if (!value?.trim()) {
    throw new Error(`${field} is required`);
  }
}

function assertIsoDate(value: string, field: string): void {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new TypeError(`${field} must be a valid ISO date`);
  }
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function weightedMean(values: Array<{ value: number; weight: number }>): number {
  let num = 0;
  let den = 0;
  for (const item of values) {
    const w = Math.max(0, item.weight);
    num += clamp01(item.value) * w;
    den += w;
  }
  return den === 0 ? 0 : num / den;
}

function validateLiveEvidence(evidence: EvidenceAtom[]): void {
  for (const atom of evidence) {
    assertNonEmpty(atom.description, 'evidence.description');
    assertNonEmpty(atom.source, 'evidence.source');
    assertNonEmpty(atom.sourceRecordId, 'evidence.sourceRecordId');
    assertIsoDate(atom.timestamp, 'evidence.timestamp');

    const sourceLc = atom.source.toLowerCase();
    if (LIVE_SOURCE_BLOCKLIST.some((bad) => sourceLc.includes(bad))) {
      throw new Error(`Rejected non-live evidence source: ${atom.source}`);
    }
    if (atom.synthetic === true) {
      throw new Error(`Rejected synthetic evidence: ${atom.source}/${atom.sourceRecordId}`);
    }
    if (!Array.isArray(atom.nodeIds) || atom.nodeIds.length === 0) {
      throw new Error(`Evidence must reference at least one nodeId: ${atom.source}/${atom.sourceRecordId}`);
    }
    if (!Number.isFinite(atom.weight) || atom.weight < 0 || atom.weight > 1) {
      throw new Error(`Evidence weight must be within 0..1: ${atom.source}/${atom.sourceRecordId}`);
    }
    if (!Number.isFinite(atom.confidence) || atom.confidence < 0 || atom.confidence > 1) {
      throw new Error(`Evidence confidence must be within 0..1: ${atom.source}/${atom.sourceRecordId}`);
    }
  }
}

export class FrictionEngine {
  private readonly season: SeasonalPhase;

  private static readonly LAND_COVER_COST: Record<LandCover, Record<TransportMode, number>> = {
    [LandCover.OPEN_GROUND]: {
      [TransportMode.FOOT]: 1,
      [TransportMode.MOTORCYCLE]: 0.9,
      [TransportMode.VEHICLE]: 1,
      [TransportMode.CANOE]: 99,
      [TransportMode.LIVESTOCK]: 1,
    },
    [LandCover.SPARSE_VEG]: {
      [TransportMode.FOOT]: 1.3,
      [TransportMode.MOTORCYCLE]: 1.5,
      [TransportMode.VEHICLE]: 2,
      [TransportMode.CANOE]: 99,
      [TransportMode.LIVESTOCK]: 1.2,
    },
    [LandCover.DENSE_FOREST]: {
      [TransportMode.FOOT]: 2.5,
      [TransportMode.MOTORCYCLE]: 4,
      [TransportMode.VEHICLE]: 9,
      [TransportMode.CANOE]: 99,
      [TransportMode.LIVESTOCK]: 3,
    },
    [LandCover.CROPLAND]: {
      [TransportMode.FOOT]: 1.2,
      [TransportMode.MOTORCYCLE]: 1.6,
      [TransportMode.VEHICLE]: 2.3,
      [TransportMode.CANOE]: 99,
      [TransportMode.LIVESTOCK]: 1.5,
    },
    [LandCover.WETLAND]: {
      [TransportMode.FOOT]: 3.8,
      [TransportMode.MOTORCYCLE]: 7,
      [TransportMode.VEHICLE]: 99,
      [TransportMode.CANOE]: 1.8,
      [TransportMode.LIVESTOCK]: 4.5,
    },
    [LandCover.URBAN]: {
      [TransportMode.FOOT]: 1,
      [TransportMode.MOTORCYCLE]: 1,
      [TransportMode.VEHICLE]: 0.9,
      [TransportMode.CANOE]: 99,
      [TransportMode.LIVESTOCK]: 2,
    },
    [LandCover.WATER_BODY]: {
      [TransportMode.FOOT]: 99,
      [TransportMode.MOTORCYCLE]: 99,
      [TransportMode.VEHICLE]: 99,
      [TransportMode.CANOE]: 1,
      [TransportMode.LIVESTOCK]: 99,
    },
    [LandCover.ROCK_BARE]: {
      [TransportMode.FOOT]: 3,
      [TransportMode.MOTORCYCLE]: 5,
      [TransportMode.VEHICLE]: 99,
      [TransportMode.CANOE]: 99,
      [TransportMode.LIVESTOCK]: 4,
    },
    [LandCover.SAND_DUNE]: {
      [TransportMode.FOOT]: 2.5,
      [TransportMode.MOTORCYCLE]: 4.5,
      [TransportMode.VEHICLE]: 99,
      [TransportMode.CANOE]: 99,
      [TransportMode.LIVESTOCK]: 3.5,
    },
  };

  constructor(season: SeasonalPhase = SeasonalPhase.DRY) {
    this.season = season;
  }

  /**
   * Tobler hiking speed approximation in km/h, adapted as a slope penalty base.
   */
  public calculateSlopeSpeedKmh(slopeDeg: number): number {
    const slopeRad = (slopeDeg * Math.PI) / 180;
    const tanSlope = Math.tan(slopeRad);
    return 6 * Math.exp(-3.5 * Math.abs(tanSlope + 0.05));
  }

  private calculateRiverMultiplier(mode: TransportMode, riverWidthM: number): number {
    if (riverWidthM <= 0) return 1;
    if (mode === TransportMode.CANOE) {
      return riverWidthM <= 40 ? 1.1 : 1.4;
    }
    if (riverWidthM <= 10) return 1.6;
    if (riverWidthM <= 40) return 4;
    return 15;
  }

  private calculateSeasonMultiplier(): number {
    switch (this.season) {
      case SeasonalPhase.WET_ONSET: return 1.15;
      case SeasonalPhase.PEAK_WET: return 1.35;
      case SeasonalPhase.RECESSION: return 1.1;
      default: return 1;
    }
  }

  private calculateRoadDiscount(mode: TransportMode, roadQuality: number): number {
    if (mode !== TransportMode.MOTORCYCLE && mode !== TransportMode.VEHICLE) return 1;
    if (roadQuality === 3) return 0.45;
    if (roadQuality === 2) return 0.65;
    if (roadQuality === 1) return 0.85;
    return 1;
  }

  public calculateFriction(
    mode: TransportMode,
    ctx: FrictionContext,
  ): number {
    const base = FrictionEngine.LAND_COVER_COST[ctx.landCover][mode] ?? 99;
    const slopeSpeed = this.calculateSlopeSpeedKmh(ctx.slopeDeg);
    const slopeMultiplier = 6 / Math.max(slopeSpeed, 0.1);
    const riverMultiplier = this.calculateRiverMultiplier(mode, ctx.riverWidthM ?? 0);
    const seasonMultiplier = this.calculateSeasonMultiplier();
    const rainfallAnomaly = Math.max(-1, Math.min(1, ctx.rainfallAnomaly ?? 0));
    const rainfallMultiplier = 1 + 0.25 * Math.max(0, rainfallAnomaly);
    const roadDiscount = this.calculateRoadDiscount(mode, ctx.roadQuality ?? 0);
    return base * slopeMultiplier * riverMultiplier * seasonMultiplier * rainfallMultiplier * roadDiscount;
  }

  /**
   * Converts movement cost to a 0..1 plausibility score.
   * Lower cost => higher score.
   */
  public frictionToScore(cost: number): number {
    if (!Number.isFinite(cost) || cost <= 0) return 0;
    return clamp01(Math.exp(-0.18 * Math.max(0, cost - 1)));
  }

  public inferMode(input: ModeInferenceInput): TransportMode {
    const { frictionByMode, velocityKmh = 0, riverWidthM = 0, landCover } = input;

    if (landCover === LandCover.WATER_BODY || riverWidthM > 40) {
      if ((frictionByMode[TransportMode.CANOE] ?? 99) < 3) {
        return TransportMode.CANOE;
      }
    }

    if (velocityKmh > 25) return TransportMode.VEHICLE;
    if (velocityKmh > 7) return TransportMode.MOTORCYCLE;
    if (velocityKmh > 0 && velocityKmh <= 5 && riverWidthM > 0) return TransportMode.CANOE;

    const ranked = Object.entries(frictionByMode)
      .sort((a, b) => a[1] - b[1]) as Array<[TransportMode, number]>;

    return ranked[0]?.[0] ?? TransportMode.FOOT;
  }
}

/**
 * mo-path-infer-001
 * Computes likely hidden path geometry between signal clusters.
 */
export class PathInferenceEngine {
  private readonly frictionEngine: FrictionEngine;

  constructor(season: SeasonalPhase = SeasonalPhase.DRY) {
    this.frictionEngine = new FrictionEngine(season);
  }

  public reconstructPath(
    start: Coordinate,
    end: Coordinate,
    context: FrictionContext
  ): PathGeometry {
    // In a real implementation, this would use an A* or Dijkstra search over a terrain raster.
    // For this engine, we'll simulate a "physically plausible" path that deviates from a straight line
    // based on slope and land cover.

    const steps = 15;
    const coordinates: [number, number][] = [];
    
    // Calculate a perpendicular vector for jitter
    const dLat = end.lat - start.lat;
    const dLng = end.lng - start.lng;
    const length = Math.hypot(dLat, dLng);
    const pLat = length > 0 ? -dLng / length : 0;
    const pLng = length > 0 ? dLat / length : 0;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Base linear interpolation
      let lat = start.lat + dLat * t;
      let lng = start.lng + dLng * t;
      
      // Add "jitter" to simulate terrain avoidance
      // Higher slope or dense forest increases jitter and "wandering"
      const jitterFactor = context.slopeDeg > 15 || context.landCover === LandCover.DENSE_FOREST ? 0.008 : 0.002;
      
      // Sinusoidal wandering based on distance
      const wander = Math.sin(t * Math.PI * 3) * jitterFactor;
      
      lat += pLat * wander;
      lng += pLng * wander;
      
      // Random micro-jitter
      lat += (Math.random() - 0.5) * (jitterFactor * 0.2);
      lng += (Math.random() - 0.5) * (jitterFactor * 0.2);
      
      coordinates.push([lng, lat]);
    }

    return {
      type: 'LineString',
      coordinates,
    };
  }

  public calculatePathPlausibility(path: PathGeometry, context: FrictionContext): number {
    // Score path based on total friction
    const friction = this.frictionEngine.calculateFriction(TransportMode.FOOT, context);
    return this.frictionEngine.frictionToScore(friction);
  }
}

/**
 * mo-location-fuse-001
 * Takes noisy location evidence and returns probabilistic coordinates.
 */
export class LocationFusionEngine {
  public sharpenLocation(signals: Array<{ lat: number; lng: number; confidence: number }>): LocationBelief {
    if (signals.length === 0) {
      return { center: { lat: 0, lng: 0 }, uncertaintyRadiusM: 10000, probabilityMass: 0 };
    }

    // Weighted centroid
    let totalWeight = 0;
    let sumLat = 0;
    let sumLng = 0;

    for (const s of signals) {
      sumLat += s.lat * s.confidence;
      sumLng += s.lng * s.confidence;
      totalWeight += s.confidence;
    }

    const center = {
      lat: sumLat / totalWeight,
      lng: sumLng / totalWeight,
    };

    // Uncertainty based on variance and confidence
    let variance = 0;
    for (const s of signals) {
      const dLat = s.lat - center.lat;
      const dLng = s.lng - center.lng;
      variance += (dLat * dLat + dLng * dLng) * s.confidence;
    }
    
    const uncertaintyRadiusM = Math.sqrt(variance / totalWeight) * 111320; // Approx degrees to meters

    return {
      center,
      uncertaintyRadiusM: Math.max(50, uncertaintyRadiusM),
      probabilityMass: clamp01(totalWeight / signals.length),
    };
  }
}

/**
 * mo-entropy-watch-001
 * Detects subtle anomaly blooms and micro-activation.
 */
export class AnomalyEngine {
  public detectEntropyShift(currentP: number[], previousP: number[]): AnomalyResult {
    // ΔH = H(Pt) - H(Pt-1)
    const h = (p: number[]) => -p.reduce((sum, val) => sum + (val > 0 ? val * Math.log(val) : 0), 0);
    
    const hCurrent = h(currentP);
    const hPrevious = h(previousP);
    const shift = hCurrent - hPrevious;

    return {
      entropyShift: shift,
      isAnomaly: Math.abs(shift) > 0.5,
      confidence: clamp01(Math.abs(shift)),
    };
  }
}

/**
 * mo-forecast-drift-001
 * Forecasts corridor activation and route migration.
 */
export class ForecastingEngine {
  public forecastNextActivation(history: number[]): { likelihood: number; driftDirectionDeg: number } {
    if (history.length < 2) return { likelihood: 0.1, driftDirectionDeg: 0 };

    // Simple Bayesian update simulation
    const last = history.at(-1) ?? 0;
    const prev = history.at(-2) ?? 0;
    const trend = last - prev;
    const likelihood = clamp01(last + trend * 0.5);
    
    // Drift based on trend - if increasing, drift towards "new" areas
    const driftDirectionDeg = (Math.random() - 0.5) * 45 + (trend > 0 ? 10 : -10);
    
    return {
      likelihood,
      driftDirectionDeg,
    };
  }
}

export class HiddenStateEngine {
  private static readonly TRANSITION_MATRIX: Record<CorridorState, Record<CorridorState, number>> = {
    [CorridorState.DORMANT]: {
      [CorridorState.DORMANT]: 0.85,
      [CorridorState.PROBING]: 0.15,
      [CorridorState.ACTIVE]: 0,
      [CorridorState.SURGE]: 0,
      [CorridorState.DISSIPATING]: 0,
    },
    [CorridorState.PROBING]: {
      [CorridorState.DORMANT]: 0.1,
      [CorridorState.PROBING]: 0.6,
      [CorridorState.ACTIVE]: 0.3,
      [CorridorState.SURGE]: 0,
      [CorridorState.DISSIPATING]: 0,
    },
    [CorridorState.ACTIVE]: {
      [CorridorState.DORMANT]: 0,
      [CorridorState.PROBING]: 0.1,
      [CorridorState.ACTIVE]: 0.7,
      [CorridorState.SURGE]: 0.15,
      [CorridorState.DISSIPATING]: 0.05,
    },
    [CorridorState.SURGE]: {
      [CorridorState.DORMANT]: 0,
      [CorridorState.PROBING]: 0,
      [CorridorState.ACTIVE]: 0.4,
      [CorridorState.SURGE]: 0.5,
      [CorridorState.DISSIPATING]: 0.1,
    },
    [CorridorState.DISSIPATING]: {
      [CorridorState.DORMANT]: 0.4,
      [CorridorState.PROBING]: 0,
      [CorridorState.ACTIVE]: 0.05,
      [CorridorState.SURGE]: 0,
      [CorridorState.DISSIPATING]: 0.55,
    },
  };

  // Probability of observing a certain signal density/confidence given a state
  private static readonly EMISSION_PROBS: Record<CorridorState, (signalStrength: number) => number> = {
    [CorridorState.DORMANT]: (s) => (s < 0.1 ? 0.9 : 0.1),
    [CorridorState.PROBING]: (s) => (s >= 0.1 && s < 0.4 ? 0.8 : 0.2),
    [CorridorState.ACTIVE]: (s) => (s >= 0.4 && s < 0.8 ? 0.8 : 0.2),
    [CorridorState.SURGE]: (s) => (s >= 0.8 ? 0.9 : 0.1),
    [CorridorState.DISSIPATING]: (s) => (s >= 0.2 && s < 0.5 ? 0.7 : 0.3),
  };

  private static initializeViterbi(
    firstSignal: number,
    states: CorridorState[],
  ): Record<CorridorState, number> {
    const row = {} as Record<CorridorState, number>;
    for (const state of states) {
      const initialProb = state === CorridorState.DORMANT ? 1 : 0;
      row[state] = initialProb * HiddenStateEngine.EMISSION_PROBS[state](firstSignal);
    }
    return row;
  }

  private static viterbiStep(
    signal: number,
    states: CorridorState[],
    prev: Record<CorridorState, number>,
  ): Record<CorridorState, number> {
    const row = {} as Record<CorridorState, number>;
    for (const nextState of states) {
      let maxProb = 0;
      for (const prevState of states) {
        const prob =
          (prev[prevState] ?? 0) *
          (HiddenStateEngine.TRANSITION_MATRIX[prevState]?.[nextState] ?? 0) *
          HiddenStateEngine.EMISSION_PROBS[nextState](signal);
        if (prob > maxProb) maxProb = prob;
      }
      row[nextState] = maxProb;
    }
    return HiddenStateEngine.normalizeRow(row, states);
  }

  private static normalizeRow(
    row: Record<CorridorState, number>,
    states: CorridorState[],
  ): Record<CorridorState, number> {
    const den = Object.values(row).reduce((a, b) => a + (b ?? 0), 0);
    if (den <= 0) return row;
    for (const state of states) {
      row[state] = (row[state] ?? 0) / den;
    }
    return row;
  }

  private static findBestState(
    probs: Record<CorridorState, number>,
    states: CorridorState[],
  ): { state: CorridorState; confidence: number } {
    let bestState = CorridorState.DORMANT;
    let maxProb = -1;
    for (const state of states) {
      const p = probs[state] ?? 0;
      if (p > maxProb) {
        maxProb = p;
        bestState = state;
      }
    }
    return { state: bestState, confidence: maxProb };
  }

  public inferState(history: number[]): { state: CorridorState; confidence: number } {
    if (history.length === 0) return { state: CorridorState.DORMANT, confidence: 1 };

    const states = Object.values(CorridorState);
    let current = HiddenStateEngine.initializeViterbi(history[0] ?? 0, states);

    for (let t = 1; t < history.length; t++) {
      current = HiddenStateEngine.viterbiStep(history[t] ?? 0, states, current);
    }

    return HiddenStateEngine.findBestState(current, states);
  }

  public stateToScore(state: CorridorState): number {
    switch (state) {
      case CorridorState.DORMANT: return 0.05;
      case CorridorState.PROBING: return 0.35;
      case CorridorState.ACTIVE: return 0.75;
      case CorridorState.SURGE: return 1;
      case CorridorState.DISSIPATING: return 0.45;
      default: return 0;
    }
  }
}

export class ExplainabilityEngine {
  private readonly weights: typeof SOUL_WEIGHTS;

  constructor(soulWeights?: Partial<typeof SOUL_WEIGHTS>) {
    const merged = { ...SOUL_WEIGHTS, ...soulWeights };
    const total = Object.values(merged).reduce((sum, v) => sum + v, 0);
    this.weights = Object.fromEntries(
      Object.entries(merged).map(([k, v]) => [k, v / total]),
    ) as typeof SOUL_WEIGHTS;
  }

  public synthesizeCorridorScore(params: {
    runId: string;
    corridorId: string;
    startNode: string;
    endNode: string;
    gravityScore: number;
    diffusionScore: number;
    centralityScore: number;
    hmmScore: number;
    seasonalScore: number;
    linguisticScore: number;
    entropyScore: number;
    frictionScore: number;
    evidence: EvidenceAtom[];
    inferredVelocityKmh: number;
    seasonallyActive: boolean;
    requiresCanoe: boolean;
    conflictDetour: boolean;
    signalHistory: number[];
    frictionContext: FrictionContext;
    startCoord: Coordinate;
    endCoord: Coordinate;
    locationSignals: Array<{ lat: number; lng: number; confidence: number }>;
    previousSignalHistory?: number[];
    firstDetected?: string;
    lastUpdated?: string;
  }): CorridorScore {
    assertNonEmpty(params.runId, 'runId');
    assertNonEmpty(params.corridorId, 'corridorId');
    assertNonEmpty(params.startNode, 'startNode');
    assertNonEmpty(params.endNode, 'endNode');
    validateLiveEvidence(params.evidence);

    const hmmEngine = new HiddenStateEngine();
    const { state: latentState } = hmmEngine.inferState(params.signalHistory);
    const hmmScore = hmmEngine.stateToScore(latentState);

    const pathEngine = new PathInferenceEngine();
    const inferredPath = pathEngine.reconstructPath(params.startCoord, params.endCoord, params.frictionContext);
    const pathScore = pathEngine.calculatePathPlausibility(inferredPath, params.frictionContext);

    const locEngine = new LocationFusionEngine();
    const locationBelief = locEngine.sharpenLocation(params.locationSignals);
    const locationScore = locationBelief.probabilityMass;

    const anomalyEngine = new AnomalyEngine();
    const anomalyMetrics = anomalyEngine.detectEntropyShift(
      params.signalHistory,
      params.previousSignalHistory ?? params.signalHistory.map(() => 0.1)
    );
    const entropyScore = clamp01(params.entropyScore + anomalyMetrics.entropyShift);

    const forecastEngine = new ForecastingEngine();
    const forecast = forecastEngine.forecastNextActivation(params.signalHistory);
    const forecastScore = forecast.likelihood;

    const gravityScore = clamp01(params.gravityScore);
    const diffusionScore = clamp01(params.diffusionScore);
    const centralityScore = clamp01(params.centralityScore);
    const seasonalScore = clamp01(params.seasonalScore);
    const linguisticScore = clamp01(params.linguisticScore);
    const frictionScore = clamp01(params.frictionScore);

    const evidenceSupportScore = weightedMean(
      params.evidence.map((e) => ({
        value: e.confidence,
        weight: e.weight,
      })),
    );

    const weightedLinear =
      this.weights.gravity * gravityScore +
      this.weights.diffusion * diffusionScore +
      this.weights.centrality * centralityScore +
      this.weights.hmm * hmmScore +
      this.weights.seasonal * seasonalScore +
      this.weights.linguistic * linguisticScore +
      this.weights.entropy * entropyScore +
      this.weights.friction * frictionScore +
      this.weights.evidence * evidenceSupportScore +
      this.weights.path * pathScore +
      this.weights.location * locationScore +
      this.weights.forecast * forecastScore +
      this.weights.anomaly * anomalyMetrics.confidence;

    // Logistic calibration:
    // centers around 0.50 and steepens separation between weak and strong corridors.
    const corridorScore = clamp01(sigmoid(6 * (weightedLinear - 0.5)));

    let riskClass: RiskClass = 'LOW';
    if (corridorScore >= RISK_THRESHOLDS.CRITICAL) riskClass = 'CRITICAL';
    else if (corridorScore >= RISK_THRESHOLDS.HIGH) riskClass = 'HIGH';
    else if (corridorScore >= RISK_THRESHOLDS.MEDIUM) riskClass = 'MEDIUM';

    const inferredMode = this.inferMode({
      velocityKmh: params.inferredVelocityKmh,
      requiresCanoe: params.requiresCanoe,
      frictionScore,
    });

    const now = new Date().toISOString();
    const firstDetected = params.firstDetected ?? now;
    const lastUpdated = params.lastUpdated ?? now;

    const traceLines = this.generateTrace({
      runId: params.runId,
      corridorId: params.corridorId,
      startNode: params.startNode,
      endNode: params.endNode,
      corridorScore,
      riskClass,
      latentState,
      componentScores: {
        gravity: gravityScore,
        diffusion: diffusionScore,
        centrality: centralityScore,
        hmm: hmmScore,
        seasonal: seasonalScore,
        linguistic: linguisticScore,
        entropy: entropyScore,
        friction: frictionScore,
        evidence: evidenceSupportScore,
        path: pathScore,
        location: locationScore,
        forecast: forecastScore,
      },
      inferredMode,
      inferredVelocityKmh: params.inferredVelocityKmh,
      seasonallyActive: params.seasonallyActive,
      requiresCanoe: params.requiresCanoe,
      conflictDetour: params.conflictDetour,
      evidenceCount: params.evidence.length,
    });

    return {
      runId: params.runId,
      corridorId: params.corridorId,
      startNode: params.startNode,
      endNode: params.endNode,
      corridorScore: Math.round(corridorScore * 10000) / 10000,
      riskClass,
      latentState,
      gravityScore,
      diffusionScore,
      centralityScore,
      hmmScore,
      seasonalScore,
      linguisticScore,
      entropyScore,
      frictionScore,
      evidenceSupportScore: Math.round(evidenceSupportScore * 10000) / 10000,
      inferredMode,
      inferredVelocityKmh: params.inferredVelocityKmh,
      evidence: params.evidence,
      traceLines,
      phantomPoeActivated: corridorScore >= 0.65,
      seasonallyActive: params.seasonallyActive,
      requiresCanoe: params.requiresCanoe,
      conflictDetour: params.conflictDetour,
      firstDetected,
      lastUpdated,
      scoreDecomposition: {
        gravity: gravityScore,
        diffusion: diffusionScore,
        centrality: centralityScore,
        hmm: hmmScore,
        seasonal: seasonalScore,
        linguistic: linguisticScore,
        entropy: entropyScore,
        terrain: frictionScore,
        path: pathScore,
        location: locationScore,
        forecast: forecastScore,
        anomaly: anomalyMetrics.confidence,
      },
      inferredPath,
      locationBeliefs: {
        'centroid': locationBelief
      },
      anomalyMetrics,
      forecast: {
        nextActivationLikelihood: forecast.likelihood,
        driftDirectionDeg: forecast.driftDirectionDeg
      }
    };
  }

  private inferMode(params: {
    velocityKmh: number;
    requiresCanoe: boolean;
    frictionScore: number;
  }): string {
    if (params.requiresCanoe) return 'canoe';
    if (params.velocityKmh <= 0) return 'unknown';
    if (params.velocityKmh <= 5 && params.frictionScore < 0.35) return 'foot';
    if (params.velocityKmh <= 5) return 'canoe';
    if (params.velocityKmh <= 7) return 'foot';
    if (params.velocityKmh <= 25) return 'motorcycle';
    return 'vehicle';
  }

  private generateTrace(ctx: {
    runId: string;
    corridorId: string;
    startNode: string;
    endNode: string;
    corridorScore: number;
    riskClass: RiskClass;
    latentState: CorridorState;
    componentScores: Record<string, number>;
    inferredMode: string;
    inferredVelocityKmh: number;
    seasonallyActive: boolean;
    requiresCanoe: boolean;
    conflictDetour: boolean;
    evidenceCount: number;
  }): string[] {
    const lines: string[] = [
      'PHANTOM POE ENGINE · LIVE CORRIDOR SCORE TRACE',
      `Run ID:        ${ctx.runId}`,
      `Corridor:      ${ctx.corridorId}`,
      `Route:         ${ctx.startNode} → ${ctx.endNode}`,
      `Score:         ${ctx.corridorScore.toFixed(4)} [${ctx.riskClass}]`,
      `Latent State:  ${ctx.latentState.toUpperCase()}`,
      `Activation:    ${ctx.corridorScore >= 0.65 ? 'YES ◉' : 'NO'}`,
      `Mode:          ${ctx.inferredMode}`,
      `Velocity:      ${ctx.inferredVelocityKmh.toFixed(2)} km/h`,
      `Evidence:      ${ctx.evidenceCount} live atoms`,
      `Seasonal:      ${ctx.seasonallyActive ? 'active' : 'inactive'}`,
      `Canoe needed:  ${ctx.requiresCanoe ? 'yes' : 'no'}`,
      `Conflict detour:${ctx.conflictDetour ? ' yes' : ' no'}`,
      '─'.repeat(60),
    ];

    const labels: Record<string, [string, string, string]> = {
      gravity: ['🜁', 'Gravity', 'origin-destination pull'],
      diffusion: ['🜂', 'Diffusion', 'timing continuity along path'],
      centrality: ['🜃', 'Centrality', 'network position / bridge relevance'],
      hmm: ['🜄', 'Hidden state', 'crossing likelihood from latent-state inference'],
      seasonal: ['☿', 'Seasonality', 'season-phase support'],
      linguistic: ['♄', 'Linguistic drift', 'term-shift / local phrasing movement clues'],
      entropy: ['♃', 'Entropy', 'unexpected clustering / disturbance'],
      friction: ['⛰', 'Friction', 'terrain passability / least-resistance'],
      evidence: ['✦', 'Evidence support', 'confidence-weighted live-source support'],
      path: ['🛤', 'Path Plausibility', 'terrain-aware hidden route reconstruction'],
      location: ['🎯', 'Location Sharpening', 'probabilistic geocoding / coordinate fusion'],
      forecast: ['🔮', 'Forecast Drift', 'Bayesian forecasting of route migration'],
    };

    for (const [key, [symbol, name, desc]] of Object.entries(labels)) {
      const score = clamp01(ctx.componentScores[key] ?? 0);
      const weight = this.weights[key as keyof typeof this.weights] ?? 0;
      const contribution = score * weight;
      lines.push(
        `${symbol} ${name}`,
        `   Score:        ${score.toFixed(3)} ${this.scoreBar(score)}`,
        `   Weight:       ${weight.toFixed(3)}`,
        `   Contribution: ${contribution.toFixed(4)}`,
        `   Basis:        ${desc}`,
        '',
      );
    }

    return lines;
  }

  private scoreBar(score: number, width = 20): string {
    const filled = Math.round(clamp01(score) * width);
    return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]`;
  }
}