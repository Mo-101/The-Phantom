/**
 * MoStar Phantom XO — Lane API
 * Replaces supabase/functions/api-lane
 */

import { queryNeon, execNeon, clearLaneCache } from "../client";
import type { DataLane } from "../types";

export async function fetchLanes() {
  return queryNeon<DataLane>(`SELECT * FROM data_lanes ORDER BY created_at ASC`);
}

export async function fetchActiveLane() {
  const rows = await queryNeon<DataLane>(
    `SELECT * FROM data_lanes WHERE is_active = true LIMIT 1`
  );
  return rows[0] ?? null;
}

export async function switchLane(laneId: string) {
  await execNeon(`UPDATE data_lanes SET is_active = false WHERE is_active = true`);
  await execNeon(`UPDATE data_lanes SET is_active = true WHERE id = $1`, [laneId]);
  clearLaneCache();
  return fetchActiveLane();
}
