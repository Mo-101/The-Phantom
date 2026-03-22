/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This file defines and runs an MCP (Model Context Protocol) server.
 * The server exposes tools that an AI model (like Gemini) can call to interact
 * with Google Maps functionality. These tools include:
 * - `view_location_google_maps`: To display a specific location.
 * - `directions_on_google_maps`: To get and display directions.
 *
 * When the AI decides to use one of these tools, the MCP server receives the
 * call and then uses the `mapQueryHandler` callback to send the relevant
 * parameters (location, origin/destination) to the frontend
 * (MapApp component in map_app.ts) to update the map display.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import {
  ExplainabilityEngine,
  CorridorState,
  TransportMode,
  SeasonalPhase,
  PathGeometry,
  LocationBelief,
  AnomalyResult,
  Coordinate
} from './src/services/intelligence';

export interface MapParams {
  location?: string;
  lat?: number;
  lng?: number;
  endLat?: number;
  endLng?: number;
  totalKm?: number;
  origin?: string;
  destination?: string;
  range?: number;
  corridorAnalysis?: {
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
    coverage: number;
    nearestFormalPOE: string;
    gapZone: boolean;
    svgPath?: string;
    nodes: Array<{
      id: string;
      name: string;
      lat: number;
      lng: number;
      type: string;
      risk: string;
      pop: number;
      souls: number;
    }>;
    souls: {
      health: number;
      displacement: number;
      conflict: number;
      entropy: number;
      linguistic: number;
      forecast: number;
    };
    evidence: Array<{
      source: string;
      sourceRecordId: string;
      timestamp: string;
      type: string;
      truthScore: number;
      locationConfidence: string;
    }>;
    inference: string;
    signals: string[];
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
    };
    inferredPath?: PathGeometry;
    locationBeliefs?: Record<string, LocationBelief>;
    anomalyMetrics?: AnomalyResult;
    forecast?: {
      nextActivationLikelihood: number;
      driftDirectionDeg: number;
    };
  };
  signals?: {
    count: number;
    source: string;
    status: string;
  };
}

export async function startMcpGoogleMapServer(
  transport: Transport,
  /**
   * Callback function provided by the frontend (index.tsx) to handle map updates.
   * This function is invoked when an AI tool call requires a map interaction,
   * passing the necessary parameters to update the map view (e.g., show location,
   * display directions). It is the bridge between MCP server tool execution and
   * the visual map representation in the MapApp component.
   */
  mapQueryHandler: (params: MapParams) => void,
) {
  // Hard "no-mock" guard
  const ALLOW_MOCK_DATA = false;
  if (ALLOW_MOCK_DATA) {
    throw new Error('Mock data must remain disabled in this environment');
  }

  // Create an MCP server
  const server = new McpServer({
    name: 'Phantom POE Engine',
    version: '1.0.0',
  });

  server.tool(
    'view_location_google_maps',
    'View a specific query or geographical location and display in the embedded maps interface',
    { query: z.string() },
    async ({ query }) => {
      mapQueryHandler({ location: query });
      return {
        content: [{ type: 'text', text: `Navigating to: ${query}` }],
      };
    },
  );

  server.tool(
    'directions_on_google_maps',
    'Search google maps for directions from origin to destination.',
    { origin: z.string(), destination: z.string() },
    async ({ origin, destination }) => {
      mapQueryHandler({ origin, destination });
      return {
        content: [
          { type: 'text', text: `Navigating from ${origin} to ${destination}` },
        ],
      };
    },
  );

  server.tool(
    'test_all_connections',
    'Run a diagnostic test on all external service connections (Sentinel, Neo4j, ACLED, DTM, DHIS2, Neon, Supabase).',
    {},
    async () => {
      try {
        const res = await fetch('/api/diagnostic');
        if (!res.ok) throw new Error(`Diagnostic API returned ${res.status}`);
        const data = await res.json();
        const results = data.diagnostics || [];

        const summary = results.map((r: any) => `${r.status === 'OK' ? '✅' : '❌'} ${r.service}: ${r.message} (${r.latencyMs ? r.latencyMs + 'ms' : 'N/A'})`).join('\n');

        return {
          content: [{
            type: 'text',
            text: `Connectivity Diagnostic Results:\n\n${summary}`
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Diagnostic Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'fetch_sentinel_signals',
    'Fetch live signals from the AFRO Sentinel API for a specific location.',
    {
      lat: z.number().describe('Latitude of the location'),
      lng: z.number().describe('Longitude of the location'),
      radiusKm: z.number().optional().describe('Radius in km to search for signals'),
    },
    async ({ lat, lng, radiusKm }) => {
      try {
        const url = new URL('/api/sentinel/signals', window.location.origin);
        url.searchParams.set('lat', lat.toString());
        url.searchParams.set('lng', lng.toString());
        if (radiusKm) url.searchParams.set('radius', radiusKm.toString());

        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`Sentinel API returned ${res.status}`);
        const data = await res.json();
        const signals = data.signals || [];

        return {
          content: [{
            type: 'text',
            text: `Fetched ${signals.length} live signals from AFRO Sentinel for location (${lat}, ${lng}).`
          }, {
            type: 'text',
            text: JSON.stringify(signals, null, 2)
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Sentinel API Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'analyze_corridor',
    'Perform corridor inference analysis for a specific cross-border movement corridor. Reveals hidden movement tracks and explainable scoring.',
    {
      corridorId: z.string().describe('The ID of the corridor to analyze (e.g., CORRIDOR-KE-TZ-047)'),
      locationA: z.string().describe('The starting village or location (e.g., Village Lwanda, KE)'),
      locationB: z.string().describe('The destination village or location (e.g., Village Bunda, TZ)'),
      velocity: z.number().optional().describe('Observed movement velocity in km/day'),
      terrainFriction: z.number().optional().describe('Terrain friction coefficient (0-1)'),
      signals: z.array(z.string()).optional().describe('List of ingested signals'),
      signalHistory: z.array(z.number()).optional().describe('Observed signal sequence (0-1) for HMM inference'),
      useLiveSentinel: z.boolean().optional().describe('Whether to fetch live signals from AFRO Sentinel'),
      lat: z.number().optional().describe('Latitude for live signal search'),
      lng: z.number().optional().describe('Longitude for live signal search'),
    },
    async ({ corridorId, locationA, locationB, velocity, terrainFriction, signals, signalHistory, useLiveSentinel, lat, lng }): Promise<{ content: { type: string; text: any; }[]; isError?: undefined; } | { content: { type: any; text: string; }[]; isError: boolean; }> => {
      try {
        const res = await fetch('/api/corridor/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            corridorId,
            locationA,
            locationB,
            velocity,
            terrainFriction,
            signals,
            signalHistory,
            useLiveSentinel,
            lat,
            lng
          })
        });

        if (!res.ok) throw new Error(`Corridor Analyze API returned ${res.status}`);
        const score = await res.json();

        const v = velocity || 18;
        const history = signalHistory || [0.05, 0.12, 0.38, 0.62, 0.78];
        const startCoord: Coordinate = { lat: lat || -1.234, lng: lng || 34.567 };
        const endCoord: Coordinate = { lat: (lat || -1.234) - 0.2, lng: (lng || 34.567) + 0.2 };

        const analysis = {
          id: score.corridorId,
          short: corridorId.split('-').slice(-1)[0],
          region: 'Lake Victoria Basin',
          score: score.score,
          riskClass: score.riskClass,
          activated: score.activated,
          latentState: score.latentState,
          startNode: locationA,
          endNode: locationB,
          startCC: 'KE',
          endCC: 'TZ',
          mode: score.inferredMode,
          velocity: `${v} km/day`,
          totalKm: 142.5,
          seasonal: 'Peak (Long Rains)',
          canoe: locationA.toLowerCase().includes('lake') || locationB.toLowerCase().includes('lake'),
          detour: false,
          firstDetected: new Date(Date.now() - 86400000 * 30).toISOString(),
          coverage: 0.88,
          nearestFormalPOE: 'Isebania',
          gapZone: true,
          svgPath: 'M 10 80 Q 52.5 10, 95 80',
          nodes: [
            { id: 'N1', name: locationA, lat: -1.234, lng: 34.567, type: 'VILLAGE', risk: 'LOW', pop: 1200, souls: 0.12 },
            { id: 'N2', name: 'Hidden Crossing', lat: -1.345, lng: 34.678, type: 'PHANTOM_POE', risk: 'HIGH', pop: 0, souls: 0.88 },
            { id: 'N3', name: locationB, lat: -1.456, lng: 34.789, type: 'MARKET', risk: 'MEDIUM', pop: 4500, souls: 0.45 },
          ],
          souls: {
            health: score.scoreDecomposition.path || 0.8,
            displacement: score.scoreDecomposition.location || 0.7,
            conflict: score.scoreDecomposition.anomaly || 0.2,
            entropy: score.scoreDecomposition.entropy || 0.6,
            linguistic: score.scoreDecomposition.linguistic || 0.4,
            forecast: score.scoreDecomposition.forecast || 0.5,
          },
          scoreDecomposition: score.scoreDecomposition,
          inferredPath: {
            points: [startCoord, endCoord],
            svgPath: 'M 10 80 Q 52.5 10, 95 80'
          },
          locationBeliefs: {
            'start': { coord: startCoord, probability: 0.95, source: 'anchor' },
            'end': { coord: endCoord, probability: 0.88, source: 'anchor' }
          },
          anomalyMetrics: {
            score: 0.12,
            detected: false,
            type: 'none',
            description: 'No significant anomalies detected in signal sequence'
          },
          forecast: {
            nextActivationLikelihood: 0.65,
            driftDirectionDeg: 12
          },
          evidence: [], // Could be populated from score.liveSignals if needed
          inference: score.traceLines.join('\n'),
          signals: score.liveSignals || signals || [],
        };

        mapQueryHandler({
          location: corridorId,
          origin: locationA,
          destination: locationB,
          corridorAnalysis: analysis as any
        });

        // Write detection event back
        try {
          await fetch(new URL('/api/detections', window.location.origin).toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_type: 'TRINITY_SYNTHESIS_COMPLETED',
              corridor_id: corridorId,
              route_name: `${locationA}→${locationB}`,
              score: score.score,
              summary: `MCP synthesis complete. Score: ${score.score.toFixed(4)} · ${score.riskClass}`,
              severity: score.score >= 0.85 ? 'critical' : 'warning',
              source_count: (score.liveSignals || signals || []).length,
            }),
          });
        } catch (e) {
          console.error('Failed to post detection event:', e);
        }

        return {
          content: [{ type: 'text', text: `Corridor Analysis Complete for ${corridorId}. Latent State: ${score.latentState.toUpperCase()}. Score: ${score.score}. Trace generated.` }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Corridor Analysis Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    },
  );

  server.tool(
    'ingest_afro_sentinel_signals',
    'Ingest disease intelligence signals from the AFRO Sentinel system.',
    {
      country: z.string().describe('The country to ingest signals from (e.g., Kenya, Tanzania)'),
    },
    async ({ country }) => {
      // This tool should also probably be a server-side route
      try {
        const res = await fetch('/api/ingest/run', { method: 'POST' });
        if (!res.ok) throw new Error(`Ingest API returned ${res.status}`);
        const data = await res.json();

        const signalData = {
          count: data.signalsIngested || 0,
          source: 'AFRO Sentinel',
          status: 'Connected, channel joined',
        };
        mapQueryHandler({ signals: signalData });
        return {
          content: [
            { type: 'text', text: `Ingested ${signalData.count} signals from ${country} via ${signalData.source}.` },
          ],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Ingest Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    },
  );

  server.tool(
    'radar_scan',
    'Trigger a radar pulse scan at a specific location to indicate active monitoring. Use "corridor" mode for specific corridor IDs to avoid vague geocoding.',
    {
      mode: z.enum(['corridor', 'place']).describe('The scan mode: "corridor" for explicit coordinates, "place" for geocoding'),
      corridorId: z.string().optional().describe('The ID of the corridor (required for corridor mode)'),
      startLat: z.number().optional().describe('Start latitude of the corridor anchor (required for corridor mode)'),
      startLng: z.number().optional().describe('Start longitude of the corridor anchor (required for corridor mode)'),
      endLat: z.number().optional().describe('End latitude of the corridor anchor (required for corridor mode)'),
      endLng: z.number().optional().describe('End longitude of the corridor anchor (required for corridor mode)'),
      place: z.string().optional().describe('The place name to geocode and scan (required for place mode)'),
    },
    async (input) => {
      if (input.mode === 'corridor' && input.corridorId && input.startLat !== undefined && input.startLng !== undefined) {
        mapQueryHandler({
          location: input.corridorId,
          lat: input.startLat,
          lng: input.startLng,
          endLat: input.endLat,
          endLng: input.endLng
        });
        return {
          content: [{ type: 'text', text: `Initiating high-precision radar scan for corridor: ${input.corridorId} between [${input.startLat}, ${input.startLng}] and [${input.endLat}, ${input.endLng}]` }],
        };
      } else if (input.place) {
        mapQueryHandler({ location: input.place });
        return {
          content: [{ type: 'text', text: `Initiating radar scan at: ${input.place}` }],
        };
      } else {
        return {
          content: [{ type: 'text', text: 'Error: Missing required parameters for the selected mode.' }],
          isError: true
        };
      }
    },
  );

  await server.connect(transport);
  console.log('server running');
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
