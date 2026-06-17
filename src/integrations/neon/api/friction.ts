/**
 * MoStar Phantom XO — Friction API
 * Replaces supabase/functions/api-friction
 */

import { queryNeon } from "../client";
import type { FrictionCell } from "../types";

export async function fetchFriction(corridorId: string) {
  return queryNeon<FrictionCell>(
    `SELECT * FROM terrain_friction_surfaces WHERE corridor_id = $1 ORDER BY segment_index ASC`,
    [corridorId]
  );
}
