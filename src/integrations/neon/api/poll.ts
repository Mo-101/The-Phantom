/**
 * MoStar Phantom XO — Poll API
 * Replaces supabase/functions/api-poll
 */

import { queryNeon, getActiveLaneId } from "../client";
import type { PoeCorridorRow, PoeDetectionEvent, PoeSignal, PoeEntropy, DataLane } from "../types";

export interface PollResult {
  lane: DataLane | null;
  corridors: PoeCorridorRow[];
  detections: PoeDetectionEvent[];
  signals: PoeSignal[];
  entropy: PoeEntropy[];
}

export async function poll(opts?: { since?: string }): Promise<PollResult> {
  const laneId = await getActiveLaneId();
  if (!laneId) return { lane: null, corridors: [], detections: [], signals: [], entropy: [] };

  const since = opts?.since || new Date(Date.now() - 60000).toISOString();

  const [lanes, corridors, detections, signals, entropy] = await Promise.all([
    queryNeon<DataLane>(`SELECT * FROM data_lanes WHERE id = $1`, [laneId]),
    queryNeon<PoeCorridorRow>(
      `SELECT id, start_node, end_node, score, risk_class, activated, phantom_poe_activated, last_updated FROM poe_corridors WHERE lane_id = $1 ORDER BY score DESC LIMIT 50`,
      [laneId]
    ),
    queryNeon<PoeDetectionEvent>(
      `SELECT * FROM poe_detection_events WHERE lane_id = $1 AND created_at >= $2 ORDER BY created_at DESC LIMIT 20`,
      [laneId, since]
    ),
    queryNeon<PoeSignal>(
      `SELECT id, source, type, latitude, longitude, magnitude, truth_score, timestamp FROM poe_signals WHERE lane_id = $1 AND ingested_at >= $2 ORDER BY ingested_at DESC LIMIT 50`,
      [laneId, since]
    ),
    queryNeon<PoeEntropy>(
      `SELECT * FROM poe_entropy WHERE lane_id = $1 AND spiked = true ORDER BY delta_h DESC LIMIT 10`,
      [laneId]
    ),
  ]);

  return {
    lane: lanes[0] ?? null,
    corridors,
    detections,
    signals,
    entropy,
  };
}
