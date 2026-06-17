/**
 * MoStar Phantom XO — MCP Tool Handler
 * Replaces supabase/functions/phantom-mcp
 */

import { queryNeon } from "../client";
import type { CorridorScore, EvidenceAtom, SentinelSignal } from "../types";

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const MCP_TOOLS = [
  { name: "view_location", description: "Fly the camera to an explicit lat/lng location." },
  { name: "fly_to_corridor", description: "Fly camera to a corridor's midpoint." },
  { name: "radar_scan", description: "Active monitoring pulse on a corridor." },
  { name: "analyze_corridor", description: "Full intelligence scoring for a corridor." },
  { name: "fetch_sentinel_signals", description: "Fetch live signals near a location." },
  { name: "fetch_historical_disease_signals", description: "Fetch sanitized historical disease aggregates near a location or by admin area." },
  { name: "test_connections", description: "Run diagnostic check on all service connections." },
];

export async function handleMcpTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ text?: string; mapParams?: Record<string, unknown>; isError?: boolean }> {
  switch (name) {
    case "view_location": {
      const { lat, lng, alt = 200000, heading = 0, pitch = -45, label } = args as any;
      return {
        mapParams: { camera: { lat, lng, alt, heading, pitch } },
        text: `Camera flying to ${label ?? `${lat}, ${lng}`} at ${alt}m`,
      };
    }

    case "fly_to_corridor": {
      const { startLat, startLng, endLat, endLng, alt = 180000 } = args as any;
      const midLat = (startLat + endLat) / 2;
      const midLng = (startLng + endLng) / 2;
      return {
        mapParams: { camera: { lat: midLat, lng: midLng, alt, heading: 0, pitch: -45 } },
        text: `Flying to corridor midpoint (${midLat.toFixed(2)}, ${midLng.toFixed(2)})`,
      };
    }

    case "fetch_sentinel_signals": {
      const { lat, lng, radiusKm = 50 } = args as any;
      const signals = await queryNeon<SentinelSignal>(
        `SELECT * FROM sentinel_signals ORDER BY ingested_at DESC LIMIT 100`
      );
      const nearby = signals.filter(s => haversineKm(lat, lng, s.lat, s.lng) <= radiusKm);
      return {
        text: `Found ${nearby.length} signals within ${radiusKm}km of (${lat}, ${lng})`,
      };
    }

    case "fetch_historical_disease_signals": {
      const { lat, lng, radiusKm = 100, state, lga, limit = 25 } = args as any;
      const rows = await queryNeon<any>(
        `SELECT id, disease, state, lga, epi_week, year, confirmed_cases, suspected_cases, deaths,
                latitude, longitude, truth_score, source_record_id, timestamp
         FROM poe_signals
         WHERE source = 'SORMAS_HISTORICAL'
           AND ($1::text IS NULL OR lower(state) = lower($1::text))
           AND ($2::text IS NULL OR lower(lga) = lower($2::text))
         ORDER BY year DESC, epi_week DESC
         LIMIT $3`,
        [state ?? null, lga ?? null, Math.min(Number(limit) || 25, 100)]
      );
      const nearby = lat != null && lng != null
        ? rows.filter((s) => haversineKm(Number(lat), Number(lng), Number(s.latitude), Number(s.longitude)) <= Number(radiusKm))
        : rows;
      const totalConfirmed = nearby.reduce((sum, row) => sum + Number(row.confirmed_cases ?? 0), 0);
      const totalSuspected = nearby.reduce((sum, row) => sum + Number(row.suspected_cases ?? 0), 0);
      const totalDeaths = nearby.reduce((sum, row) => sum + Number(row.deaths ?? 0), 0);
      return {
        text: [
          `Historical disease aggregates: ${nearby.length}`,
          `Confirmed: ${totalConfirmed}; suspected: ${totalSuspected}; deaths: ${totalDeaths}`,
          ...nearby.slice(0, 10).map((row) =>
            `- ${row.disease} ${row.state}${row.lga ? `/${row.lga}` : ""} week ${row.epi_week} ${row.year}: confirmed=${row.confirmed_cases ?? 0}, suspected=${row.suspected_cases ?? 0}, deaths=${row.deaths ?? 0}`
          ),
        ].join("\n"),
      };
    }

    case "analyze_corridor": {
      const { corridorId } = args as any;
      const scores = await queryNeon<CorridorScore>(
        `SELECT * FROM corridor_scores WHERE corridor_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [corridorId]
      );
      const score = scores[0];
      if (!score) return { text: `No scoring data for corridor ${corridorId}` };

      const atoms = await queryNeon<EvidenceAtom>(
        `SELECT * FROM evidence_atoms WHERE corridor_score_id = $1 LIMIT 10`,
        [score.id]
      );

      return {
        text: [
          `\u25c9 Corridor ${corridorId} \u2014 Score: ${score.corridor_score.toFixed(2)} (${score.risk_class})`,
          `  Mode: ${score.inferred_mode ?? "unknown"}`,
          `  Evidence atoms: ${atoms.length}`,
          ...(atoms.length > 0 ? atoms.map(a => `    \u2022 ${a.source}: ${a.description} (w=${a.weight})`) : []),
        ].join("\n"),
      };
    }

    case "test_connections": {
      try {
        const rows = await queryNeon<{ now: string }>(`SELECT NOW()::text as now`);
        return { text: `\u25c9 Neon: Connected (${rows[0]?.now})` };
      } catch {
        return { text: "\u25c9 Neon: Connection failed", isError: true };
      }
    }

    case "radar_scan": {
      const { corridorId } = args as any;
      return {
        text: `\u25c9 Radar pulse sent for corridor ${corridorId}. Monitoring active.`,
      };
    }

    default:
      return { text: `Unknown tool: ${name}`, isError: true };
  }
}
