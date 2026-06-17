/**
 * MoStar Phantom XO — Drift API
 * Replaces supabase/functions/api-drift
 */

import { queryNeon } from "../client";
import type { CorridorDrift } from "../types";

export async function fetchDrift(opts: {
  corridorId?: string;
  latest?: boolean;
  limit?: number;
}) {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));

  if (opts.corridorId) {
    const query = opts.latest !== false
      ? `SELECT * FROM corridor_drift WHERE corridor_id = $1 ORDER BY computed_at DESC LIMIT $2`
      : `SELECT * FROM corridor_drift WHERE corridor_id = $1 ORDER BY computed_at ASC LIMIT $2`;
    return queryNeon<CorridorDrift>(query, [opts.corridorId, limit]);
  }

  return queryNeon<CorridorDrift>(
    `SELECT * FROM corridor_drift ORDER BY computed_at DESC LIMIT $1`,
    [limit]
  );
}
