/**
 * MoStar Phantom XO — Entropy API
 * Replaces supabase/functions/api-entropy
 */

import { queryNeon, getActiveLaneId } from "../client";
import type { PoeEntropy } from "../types";

export async function fetchEntropy(opts?: { spikedOnly?: boolean }) {
  const laneId = await getActiveLaneId();
  if (!laneId) return [];

  let query = `SELECT * FROM poe_entropy WHERE lane_id = $1`;
  if (opts?.spikedOnly) query += ` AND spiked = true`;
  query += ` ORDER BY delta_h DESC`;

  return queryNeon<PoeEntropy>(query, [laneId]);
}
