/**
 * MoStar Phantom XO — Temporal API
 * Replaces supabase/functions/api-temporal
 */

import { queryNeon } from "../client";
import type { TemporalFlow, CorridorTemporalEvent, RealCrossingPoint } from "../types";

export async function fetchTemporalFlows(opts?: {
  corridorId?: string;
  direction?: string;
}) {
  let query = `SELECT * FROM temporal_flows`;
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (opts?.corridorId) {
    conditions.push(`corridor_id = $${params.length + 1}`);
    params.push(opts.corridorId);
  }
  if (opts?.direction) {
    conditions.push(`flow_direction = $${params.length + 1}`);
    params.push(opts.direction);
  }

  if (conditions.length) query += ` WHERE ${conditions.join(" AND ")}`;
  query += ` ORDER BY period_start ASC`;

  const flows = await queryNeon<TemporalFlow>(query, params);
  const totalFlow = flows.reduce((s, f) => s + (f.flow_count || 0), 0);
  return { count: flows.length, total_flow: totalFlow, flows };
}

export async function fetchTemporalEvents(opts?: {
  corridorId?: string;
  eventType?: string;
}) {
  let query = `SELECT * FROM corridor_temporal_events`;
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (opts?.corridorId) {
    conditions.push(`corridor_id = $${params.length + 1}`);
    params.push(opts.corridorId);
  }
  if (opts?.eventType) {
    conditions.push(`event_type = $${params.length + 1}`);
    params.push(opts.eventType);
  }

  if (conditions.length) query += ` WHERE ${conditions.join(" AND ")}`;
  query += ` ORDER BY event_date ASC`;

  const events = await queryNeon<CorridorTemporalEvent>(query, params);
  return { count: events.length, events };
}

export async function fetchCrossingPoints(opts?: { country?: string }) {
  let query = `SELECT * FROM real_crossing_points`;
  const params: unknown[] = [];

  if (opts?.country) {
    query += ` WHERE country_a = $1 OR country_b = $1`;
    params.push(opts.country);
  }

  query += ` ORDER BY monthly_avg_flow DESC NULLS LAST`;

  const points = await queryNeon<RealCrossingPoint>(query, params);
  return { count: points.length, crossing_points: points };
}
