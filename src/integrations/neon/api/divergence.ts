/**
 * MoStar Phantom XO — Divergence API
 * Replaces supabase/functions/api-divergence
 */

import { queryNeon, getActiveLaneId } from "../client";
import type { PoeDivergence, PoeCorridorRow } from "../types";

export async function fetchDivergences(opts?: { trend?: string }) {
  const laneId = await getActiveLaneId();
  if (!laneId) return { divergences: [] as PoeDivergence[], corridors: new Map<string, PoeCorridorRow>() };

  let query = `SELECT * FROM poe_divergence WHERE lane_id = $1`;
  const params: unknown[] = [laneId];

  if (opts?.trend) {
    query += ` AND trend = $2`;
    params.push(opts.trend);
  }
  query += ` ORDER BY divergence_ratio DESC`;

  const divergences = await queryNeon<PoeDivergence>(query, params);

  const corridorIds = [...new Set(divergences.map(d => d.corridor_id))];
  const corridors = corridorIds.length > 0
    ? await queryNeon<PoeCorridorRow>(
        `SELECT id, start_node, end_node, start_country, end_country, score, risk_class FROM poe_corridors WHERE lane_id = $1 AND id = ANY($2::text[])`,
        [laneId, corridorIds]
      )
    : [];

  return {
    divergences,
    corridors: new Map(corridors.map(c => [c.id, c])),
  };
}
