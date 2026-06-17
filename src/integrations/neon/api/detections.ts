/**
 * MoStar Phantom XO — Detections API
 * Replaces supabase/functions/api-detections
 */

import { queryNeon, execNeon, getActiveLaneId } from "../client";
import type { PoeDetectionEvent } from "../types";

export async function fetchDetections(opts?: { since?: string }) {
  const laneId = await getActiveLaneId();
  if (!laneId) return [];

  const since = opts?.since || new Date(Date.now() - 86400000).toISOString();
  return queryNeon<PoeDetectionEvent>(
    `SELECT * FROM poe_detection_events WHERE lane_id = $1 AND created_at >= $2 ORDER BY created_at DESC LIMIT 50`,
    [laneId, since]
  );
}

export async function acknowledgeDetection(detectionId: string) {
  return execNeon(
    `UPDATE poe_detection_events SET acknowledged = true WHERE id = $1`,
    [detectionId]
  );
}
