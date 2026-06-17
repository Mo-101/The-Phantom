/**
 * MoStar Phantom XO — Evidence Chain API
 * Replaces supabase/functions/api-evidence-chain
 */

import { queryNeon, getActiveLaneId } from "../client";
import type { PoeEvidence, PoeCorridorRow } from "../types";

export async function fetchEvidenceChain(corridorId: string) {
  const laneId = await getActiveLaneId();
  if (!laneId) return null;

  const [corridors, evidence] = await Promise.all([
    queryNeon<PoeCorridorRow>(
      `SELECT id, start_node, end_node, score, risk_class, start_country, end_country FROM poe_corridors WHERE id = $1 AND lane_id = $2 LIMIT 1`,
      [corridorId, laneId]
    ),
    queryNeon<PoeEvidence>(
      `SELECT * FROM poe_evidence WHERE corridor_id = $1 AND lane_id = $2 ORDER BY timestamp ASC`,
      [corridorId, laneId]
    ),
  ]);

  const corridor = corridors[0];
  if (!corridor) return null;

  const bySource = new Map<string, PoeEvidence[]>();
  for (const e of evidence) {
    const bucket = bySource.get(e.source) ?? [];
    bucket.push(e);
    bySource.set(e.source, bucket);
  }

  return {
    corridor,
    evidence,
    bySource: Object.fromEntries(bySource),
    totalWeight: evidence.reduce((s, e) => s + e.weight, 0),
    avgConfidence: evidence.length > 0
      ? evidence.reduce((s, e) => s + e.confidence, 0) / evidence.length
      : 0,
  };
}
