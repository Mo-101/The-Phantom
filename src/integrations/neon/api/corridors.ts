/**
 * MoStar Phantom XO — Corridor API
 * Replaces supabase/functions/api-corridors
 */

import { queryNeon, getActiveLaneId } from "../client";
import type { PoeCorridorRow, PoeTerrain, PoeDivergence, PoeEvidence } from "../types";

export async function fetchCorridors(opts?: {
  risk?: string;
  country?: string;
  activated?: string;
}) {
  const laneId = await getActiveLaneId();
  if (!laneId) return [];

  let query = `SELECT * FROM poe_corridors WHERE lane_id = $1`;
  const params: unknown[] = [laneId];
  let idx = 2;

  if (opts?.risk) {
    query += ` AND risk_class = $${idx++}`;
    params.push(opts.risk);
  }
  if (opts?.country) {
    query += ` AND (start_country = $${idx} OR end_country = $${idx})`;
    idx++;
    params.push(opts.country);
  }
  if (opts?.activated !== undefined) {
    query += ` AND activated = $${idx++}`;
    params.push(opts.activated === "true");
  }

  query += ` ORDER BY score DESC LIMIT 100`;
  return queryNeon<PoeCorridorRow>(query, params);
}

export async function fetchCorridor(corridorId: string) {
  const laneId = await getActiveLaneId();
  if (!laneId) return null;

  const [corridors, terrains, divergences, evidence] = await Promise.all([
    queryNeon<PoeCorridorRow>(
      `SELECT * FROM poe_corridors WHERE id = $1 AND lane_id = $2 LIMIT 1`,
      [corridorId, laneId]
    ),
    queryNeon<PoeTerrain>(
      `SELECT * FROM poe_terrain WHERE corridor_id = $1 AND lane_id = $2 LIMIT 1`,
      [corridorId, laneId]
    ),
    queryNeon<PoeDivergence>(
      `SELECT * FROM poe_divergence WHERE corridor_id = $1 AND lane_id = $2 ORDER BY computed_at DESC LIMIT 1`,
      [corridorId, laneId]
    ),
    queryNeon<PoeEvidence>(
      `SELECT * FROM poe_evidence WHERE corridor_id = $1 AND lane_id = $2 ORDER BY timestamp DESC LIMIT 50`,
      [corridorId, laneId]
    ),
  ]);

  const corridor = corridors[0];
  if (!corridor) return null;

  return {
    ...corridor,
    terrain: terrains[0] ?? null,
    divergence: divergences[0] ?? null,
    evidence: evidence ?? [],
  };
}
