// ─────────────────────────────────────────────────────────────
// Phantom POE Engine — Shared Types
// ─────────────────────────────────────────────────────────────

export interface CameraTarget {
  lat: number;
  lng: number;
  alt: number;
  heading: number;
  pitch: number;
}

export interface CorridorTrack {
  id: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  pathCoords?: Array<{ lat: number; lng: number; alt?: number }>;
}

export interface RadarPulse {
  corridorId: string;
  lat: number;
  lng: number;
  endLat?: number;
  endLng?: number;
}

export interface SignalSummary {
  count: number;
  source: string;
  status: string;
}

export interface CorridorNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  risk: string;
}

export interface CorridorEvidence {
  source: string;
  sourceRecordId: string;
  timestamp: string;
  type: string;
  truthScore: number;
  locationConfidence: string;
}

export interface CorridorSouls {
  gravity: number;
  diffusion: number;
  centrality: number;
  hmm: number;
  seasonal: number;
  linguistic: number;
  entropy: number;
  terrain: number;
}

export interface CorridorForecast {
  nextActivationLikelihood: number;
  driftDirectionDeg: number;
}

export interface LocationBelief {
  center: { lat: number; lng: number };
  radiusM: number;
  confidence: number;
}

export interface CorridorAnalysisResult {
  id: string;
  short: string;
  region: string;
  score: number;
  riskClass: string;
  activated: boolean;
  latentState?: string;
  startNode: string;
  endNode: string;
  startCC: string;
  endCC: string;
  mode: string;
  velocity: string;
  totalKm: number;
  seasonal: string;
  canoe: boolean;
  detour: boolean;
  firstDetected: string;
  nearestFormalPOE: string;
  gapZone: boolean;
  nodes: CorridorNode[];
  souls: CorridorSouls;
  scoreDecomposition: Record<string, number>;
  inferredPath?: {
    coordinates: Array<{ lat: number; lng: number }>;
    totalKm: number;
  };
  locationBeliefs?: Record<string, LocationBelief>;
  anomalyMetrics?: {
    isAnomaly: boolean;
    confidence: number;
    entropyShift: number;
  };
  forecast?: CorridorForecast;
  evidence: CorridorEvidence[];
  traceLines: string[];
}

export interface MapParams {
  camera?: CameraTarget;
  corridor?: CorridorTrack;
  corridorAnalysis?: CorridorAnalysisResult;
  signals?: SignalSummary;
  radar?: RadarPulse;
}

export enum ChatState {
  IDLE = "idle",
  GENERATING = "generating",
  THINKING = "thinking",
  EXECUTING = "executing",
}
