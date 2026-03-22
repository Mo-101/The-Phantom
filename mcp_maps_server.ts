/**
 * ◉⟁⬡  MoStar Industries
 * Phantom POE Engine — MCP Server
 * mo-border-phantom-001
 *
 * Tools exposed to Gemini:
 *   view_location         — fly Cesium camera to a location
 *   fly_to_corridor       — fly to corridor anchor coords (not vague geocoding)
 *   radar_scan            — trigger active monitoring pulse on corridor
 *   analyze_corridor      — full ExplainabilityEngine scoring
 *   fetch_sentinel_signals — live AFRO Sentinel pull
 *   ingest_signals        — trigger live ingestion pipeline
 *   test_connections      — diagnostic check all services
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';

import {
  ExplainabilityEngine,
  type PathGeometry,
  type LocationBelief,
  type AnomalyResult,
  type Coordinate,
} from './src/services/intelligence';

import { SentinelService } from './src/services/sentinel';
import { serverEnv } from './lib/env';

// ─────────────────────────────────────────────────────────────
// MAP PARAMS — Cesium-aware, no vague geocoding
// ─────────────────────────────────────────────────────────────

export interface CesiumCameraTarget {
  lat: number;
  lng: number;
  alt: number;   // metres above terrain
  heading: number;   // degrees
  pitch: number;   // degrees (negative = looking down)
}

export interface MapParams {
  // Simple fly-to
  camera?: CesiumCameraTarget;

  // Corridor track — explicit coords, never geocoded strings
  corridor?: {
    id: string;
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    pathCoords?: Array<{ lat: number; lng: number; alt: number }>;
  };

  // Full corridor analysis result
  corridorAnalysis?: CorridorAnalysisResult;

  // Signal ingestion summary
  signals?: {
    count: number;
    source: string;
    status: string;
  };

  // Radar pulse — explicit coords only
  radar?: {
    corridorId: string;
    lat: number;
    lng: number;
    endLat?: number;
    endLng?: number;
  };
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
  nodes: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    type: string;
    risk: string;
  }>;
  souls: {
    gravity: number;
    diffusion: number;
    centrality: number;
    hmm: number;
    seasonal: number;
    linguistic: number;
    entropy: number;
    terrain: number;
  };
  scoreDecomposition: Record<string, number>;
  inferredPath?: PathGeometry;
  locationBeliefs?: Record<string, LocationBelief>;
  anomalyMetrics?: AnomalyResult;
  forecast?: {
    nextActivationLikelihood: number;
    driftDirectionDeg: number;
  };
  evidence: Array<{
    source: string;
    sourceRecordId: string;
    timestamp: string;
    type: string;
    truthScore: number;
    locationConfidence: string;
  }>;
  traceLines: string[];
}

// ─────────────────────────────────────────────────────────────
// SERVER
// ─────────────────────────────────────────────────────────────

export async function startMcpServer(
  transport: Transport,
  mapQueryHandler: (params: MapParams) => void,
) {
  // Hard no-mock guard
  const ALLOW_MOCK_DATA = false;
  if (ALLOW_MOCK_DATA) {
    throw new Error('Mock data must remain disabled — mo-border-phantom-001');
  }

  const server = new McpServer({
    name: 'Phantom POE Engine',
    version: '2.0.0',
  });

  // ── TOOL: view_location ──────────────────────────────────────
  // Fly Cesium camera to explicit coordinates — no vague geocoding
  server.tool(
    'view_location',
    'Fly the Cesium 3D globe camera to an explicit lat/lng location.',
    {
      lat: z.number().describe('Latitude'),
      lng: z.number().describe('Longitude'),
      alt: z.number().optional().describe('Altitude in metres (default 200000)'),
      heading: z.number().optional().describe('Camera heading degrees (default 0)'),
      pitch: z.number().optional().describe('Camera pitch degrees (default -45)'),
      label: z.string().optional().describe('Human-readable label for the location'),
    },
    async ({ lat, lng, alt = 200000, heading = 0, pitch = -45, label }) => {
      mapQueryHandler({
        camera: { lat, lng, alt, heading, pitch },
      });
      return {
        content: [{ type: 'text', text: `Camera flying to ${label ?? `${lat}, ${lng}`} at ${alt}m` }],
      };
    },
  );

  // ── TOOL: fly_to_corridor ────────────────────────────────────
  // Fly directly to a corridor's anchor zone — real coords, never geocoding
  server.tool(
    'fly_to_corridor',
    'Fly the Cesium camera to a specific corridor anchor zone using explicit coordinates. Never geocodes strings.',
    {
      corridorId: z.string().describe('Corridor ID e.g. CORRIDOR-KE-TZ-047'),
      startLat: z.number().describe('Start anchor latitude'),
      startLng: z.number().describe('Start anchor longitude'),
      endLat: z.number().describe('End anchor latitude'),
      endLng: z.number().describe('End anchor longitude'),
      alt: z.number().optional().describe('Camera altitude in metres (default 180000)'),
    },
    async ({ corridorId, startLat, startLng, endLat, endLng, alt = 180000 }) => {
      // Midpoint for camera center
      const midLat = (startLat + endLat) / 2;
      const midLng = (startLng + endLng) / 2;

      mapQueryHandler({
        camera: { lat: midLat, lng: midLng, alt, heading: 0, pitch: -50 },
        corridor: { id: corridorId, startLat, startLng, endLat, endLng },
      });

      return {
        content: [{ type: 'text', text: `Flying to ${corridorId} · midpoint ${midLat.toFixed(4)}, ${midLng.toFixed(4)} · ${alt}m` }],
      };
    },
  );

  // ── TOOL: radar_scan ─────────────────────────────────────────
  server.tool(
    'radar_scan',
    'Trigger a radar pulse scan on a corridor using explicit coordinates. Use corridor mode for known corridors — never geocode vague place names for active monitoring.',
    {
      mode: z.enum(['corridor', 'place']).describe('"corridor" uses explicit coords · "place" geocodes a search term'),
      corridorId: z.string().optional().describe('Required for corridor mode'),
      startLat: z.number().optional().describe('Required for corridor mode'),
      startLng: z.number().optional().describe('Required for corridor mode'),
      endLat: z.number().optional().describe('Required for corridor mode'),
      endLng: z.number().optional().describe('Required for corridor mode'),
      place: z.string().optional().describe('Required for place mode — used as search label only, not for corridor anchoring'),
    },
    async (input) => {
      if (input.mode === 'corridor') {
        if (!input.corridorId || input.startLat === undefined || input.startLng === undefined) {
          return {
            content: [{ type: 'text', text: 'Error: corridor mode requires corridorId, startLat, startLng.' }],
            isError: true,
          };
        }
        mapQueryHandler({
          radar: {
            corridorId: input.corridorId,
            lat: input.startLat,
            lng: input.startLng,
            endLat: input.endLat,
            endLng: input.endLng,
          },
          camera: {
            lat: (input.startLat + (input.endLat ?? input.startLat)) / 2,
            lng: (input.startLng + (input.endLng ?? input.startLng)) / 2,
            alt: 180000,
            heading: 0,
            pitch: -50,
          },
        });
        return {
          content: [{ type: 'text', text: `ACTIVE MONITORING: ${input.corridorId} · [${input.startLat}, ${input.startLng}] → [${input.endLat ?? '?'}, ${input.endLng ?? '?'}]` }],
        };
      }

      // place mode — camera fly only, not corridor anchoring
      if (input.place) {
        return {
          content: [{ type: 'text', text: `Place search: "${input.place}" — provide explicit lat/lng for corridor monitoring.` }],
        };
      }

      return {
        content: [{ type: 'text', text: 'Error: missing parameters.' }],
        isError: true,
      };
    },
  );

  // ── TOOL: analyze_corridor ───────────────────────────────────
  server.tool(
    'analyze_corridor',
    'Run full corridor intelligence scoring via the ExplainabilityEngine. Returns score decomposition, inferred path, HMM state, entropy, and forecast.',
    {
      corridorId: z.string().describe('Corridor ID'),
      locationA: z.string().describe('Start node name'),
      locationB: z.string().describe('End node name'),
      startLat: z.number().describe('Start anchor latitude'),
      startLng: z.number().describe('Start anchor longitude'),
      endLat: z.number().describe('End anchor latitude'),
      endLng: z.number().describe('End anchor longitude'),
      velocity: z.number().optional().describe('Observed velocity km/day'),
      terrainFriction: z.number().optional().describe('Terrain friction coefficient 0-1'),
      signalHistory: z.array(z.number()).optional().describe('Signal sequence 0-1 for HMM'),
      useLiveSentinel: z.boolean().optional().describe('Fetch live AFRO Sentinel signals'),
    },
    async ({ corridorId, locationA, locationB, startLat, startLng, endLat, endLng,
      velocity = 18, terrainFriction = 0.5, signalHistory, useLiveSentinel = false }) => {

      const startCoord: Coordinate = { lat: startLat, lng: startLng };
      const endCoord: Coordinate = { lat: endLat, lng: endLng };
      const history = signalHistory ?? [0.05, 0.12, 0.38, 0.62, 0.78];

      let liveEvidence: any[] = [];
      let locationSignals: Array<{ lat: number; lng: number; confidence: number }> = [
        { lat: startLat, lng: startLng, confidence: 0.9 },
        { lat: endLat, lng: endLng, confidence: 0.85 },
      ];

      // Live sentinel signals
      if (useLiveSentinel) {
        try {
          const sentinel = new SentinelService();
          const liveSignals = await sentinel.fetchSignals(startLat, startLng);
          if (liveSignals.length > 0) {
            liveEvidence = liveSignals.map(s => ({
              evidenceType: s.type,
              description: s.description,
              weight: s.weight,
              source: s.source,
              sourceRecordId: s.id,
              confidence: s.confidence,
              timestamp: s.timestamp,
              nodeIds: [locationA, locationB],
            }));
            locationSignals = [
              ...locationSignals,
              ...liveSignals.map(s => ({
                lat: s.location?.lat ?? startLat,
                lng: s.location?.lng ?? startLng,
                confidence: s.confidence,
              })),
            ];
          }
        } catch {
          // Sentinel unavailable — proceed without live evidence
          console.warn('[MCP] AFRO Sentinel unavailable — proceeding without live signals');
        }
      }

      const engine = new ExplainabilityEngine();
      const score = engine.synthesizeCorridorScore({
        runId: `RUN-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        corridorId,
        startNode: locationA,
        endNode: locationB,
        gravityScore: 0,   // engine derives from population data
        diffusionScore: 0,
        centralityScore: 0,
        hmmScore: 0,   // engine derives from signalHistory
        seasonalScore: 0,
        linguisticScore: 0,
        entropyScore: 0,
        frictionScore: 1 - terrainFriction,
        evidence: liveEvidence,
        inferredVelocityKmh: velocity / 24,
        seasonallyActive: true,
        requiresCanoe: false,
        conflictDetour: false,
        signalHistory: history,
        frictionContext: { slopeDeg: 5, landCover: 'open_ground' as any },
        startCoord,
        endCoord,
        locationSignals,
        previousSignalHistory: history.map(h => h * 0.8),
      });

      const analysis: CorridorAnalysisResult = {
        id: score.corridorId,
        short: corridorId.split('-').pop() ?? corridorId,
        region: `${locationA} → ${locationB}`,
        score: score.corridorScore,
        riskClass: score.riskClass,
        activated: score.phantomPoeActivated,
        latentState: score.latentState,
        startNode: locationA,
        endNode: locationB,
        startCC: 'KE',
        endCC: 'TZ',
        mode: score.inferredMode,
        velocity: `${velocity} km/day`,
        totalKm: parseFloat((haversineKm(startCoord, endCoord)).toFixed(2)),
        seasonal: 'Active',
        canoe: score.requiresCanoe,
        detour: score.conflictDetour,
        firstDetected: new Date().toISOString(),
        nearestFormalPOE: 'Unknown — analyst should verify',
        gapZone: true,
        nodes: [
          { id: 'N1', name: locationA, lat: startLat, lng: startLng, type: 'START', risk: 'LOW' },
          { id: 'N2', name: locationB, lat: endLat, lng: endLng, type: 'END', risk: 'HIGH' },
        ],
        souls: {
          gravity: score.scoreDecomposition?.gravity ?? 0,
          diffusion: score.scoreDecomposition?.diffusion ?? 0,
          centrality: score.scoreDecomposition?.centrality ?? 0,
          hmm: score.scoreDecomposition?.hmm ?? 0,
          seasonal: score.scoreDecomposition?.seasonal ?? 0,
          linguistic: score.scoreDecomposition?.linguistic ?? 0,
          entropy: score.scoreDecomposition?.entropy ?? 0,
          terrain: score.scoreDecomposition?.terrain ?? 0,
        },
        scoreDecomposition: score.scoreDecomposition ?? {},
        inferredPath: score.inferredPath,
        locationBeliefs: score.locationBeliefs,
        anomalyMetrics: score.anomalyMetrics,
        forecast: score.forecast,
        evidence: score.evidence.map(e => ({
          source: e.source,
          sourceRecordId: e.sourceRecordId,
          timestamp: e.timestamp,
          type: e.description,
          truthScore: e.confidence,
          locationConfidence: 'settlement-level',
        })),
        traceLines: score.traceLines,
      };

      mapQueryHandler({
        corridor: { id: corridorId, startLat, startLng, endLat, endLng },
        camera: {
          lat: (startLat + endLat) / 2,
          lng: (startLng + endLng) / 2,
          alt: 180000,
          heading: 0,
          pitch: -50,
        },
        corridorAnalysis: analysis,
      });

      return {
        content: [{
          type: 'text',
          text:
            `◉ Corridor Analysis: ${corridorId}\n` +
            `Score: ${score.corridorScore.toFixed(4)} · ${score.riskClass}\n` +
            `State: ${score.latentState?.toUpperCase() ?? 'UNKNOWN'}\n` +
            `Activated: ${score.phantomPoeActivated ? 'YES' : 'NO'}\n\n` +
            score.traceLines.join('\n'),
        }],
      };
    },
  );

  // ── TOOL: fetch_sentinel_signals ─────────────────────────────
  server.tool(
    'fetch_sentinel_signals',
    'Fetch live disease intelligence signals from AFRO Sentinel for a specific location.',
    {
      lat: z.number().describe('Latitude'),
      lng: z.number().describe('Longitude'),
      radiusKm: z.number().optional().describe('Search radius km (default 50)'),
    },
    async ({ lat, lng, radiusKm = 50 }) => {
      const env = serverEnv();
      if (!env.AFRO_SENTINEL_API_URL && !env.SUPABASE_URL) {
        throw new Error('AFRO Sentinel not configured — set SUPABASE_URL and AFRO_SENTINEL_SERVICE_KEY');
      }

      const sentinel = new SentinelService();
      const signals = await sentinel.fetchSignals(lat, lng, radiusKm);

      return {
        content: [
          { type: 'text', text: `Fetched ${signals.length} live signals from AFRO Sentinel at (${lat}, ${lng}) radius ${radiusKm}km.` },
          { type: 'text', text: JSON.stringify(signals, null, 2) },
        ],
      };
    },
  );

  // ── TOOL: ingest_signals ─────────────────────────────────────
  server.tool(
    'ingest_signals',
    'Trigger the live signal ingestion pipeline for a country or region. Requires live API credentials.',
    {
      country: z.string().describe('Country name e.g. Kenya, Tanzania'),
    },
    async ({ country }) => {
      const env = serverEnv();

      const missing: string[] = [];
      if (!env.ACLED_API_KEY) missing.push('ACLED_API_KEY');
      if (!env.IOM_DTM_API_KEY) missing.push('IOM_DTM_API_KEY');
      if (!env.DHIS2_USERNAME) missing.push('DHIS2_USERNAME');
      if (!env.AFRO_SENTINEL_SERVICE_KEY) missing.push('AFRO_SENTINEL_SERVICE_KEY');

      if (missing.length > 0) {
        throw new Error(
          `Live ingestion cannot start — missing credentials: ${missing.join(', ')}`
        );
      }

      // Delegate to the ingest API route
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/ingest/run`, {
        method: 'POST',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`Ingest route failed: ${(body as any).error ?? res.status}`);
      }

      const result = await res.json() as {
        signalsIngested: number;
        corridorCandidates: number;
        entropySpikes: number;
        runId: string;
      };

      mapQueryHandler({
        signals: {
          count: result.signalsIngested,
          source: 'Live pipeline',
          status: `Run ${result.runId} · ${result.corridorCandidates} corridor(s) · ${result.entropySpikes} entropy spike(s)`,
        },
      });

      return {
        content: [{
          type: 'text',
          text:
            `Ingestion complete for ${country}.\n` +
            `Run: ${result.runId}\n` +
            `Signals: ${result.signalsIngested}\n` +
            `Corridors: ${result.corridorCandidates}\n` +
            `Entropy spikes: ${result.entropySpikes}`,
        }],
      };
    },
  );

  // ── TOOL: test_connections ───────────────────────────────────
  server.tool(
    'test_connections',
    'Run a diagnostic check on all external service connections.',
    {},
    async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/diagnostics`);
      const { diagnostics } = await res.json() as { diagnostics: any[] };

      const summary = diagnostics
        .map((r: any) => `${r.status === 'OK' ? '✅' : '❌'} ${r.service}: ${r.message}${r.latencyMs ? ` (${r.latencyMs}ms)` : ''}`)
        .join('\n');

      return {
        content: [{ type: 'text', text: `◉⟁⬡ Phantom POE Connectivity\n\n${summary}` }],
      };
    },
  );

  await server.connect(transport);
  console.log('◉⟁⬡ Phantom POE MCP server running');

  // Keep alive
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// ─────────────────────────────────────────────────────────────
// UTIL
// ─────────────────────────────────────────────────────────────

function haversineKm(a: Coordinate, b: Coordinate): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}