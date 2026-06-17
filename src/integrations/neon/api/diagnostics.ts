/**
 * MoStar Phantom XO — Diagnostics API
 * Replaces supabase/functions/api-diagnostics
 */

import { queryNeon, getActiveLaneId, isNeonConnected } from "../client";

export interface DiagnosticResult {
  connected: boolean;
  laneId: string | null;
  tables: Record<string, number>;
  latestRun: Record<string, unknown> | null;
}

export async function fetchDiagnostics(): Promise<DiagnosticResult> {
  if (!isNeonConnected()) {
    return { connected: false, laneId: null, tables: {}, latestRun: null };
  }

  const laneId = await getActiveLaneId();

  const tableCounts = await Promise.all([
    queryNeon<{ count: string }>(`SELECT COUNT(*)::text AS count FROM poe_corridors`),
    queryNeon<{ count: string }>(`SELECT COUNT(*)::text AS count FROM poe_signals`),
    queryNeon<{ count: string }>(`SELECT COUNT(*)::text AS count FROM poe_detection_events`),
    queryNeon<{ count: string }>(`SELECT COUNT(*)::text AS count FROM poe_evidence`),
    queryNeon<{ count: string }>(`SELECT COUNT(*)::text AS count FROM normalized_signals`),
  ]);

  const tables: Record<string, number> = {
    poe_corridors: parseInt(tableCounts[0][0]?.count ?? "0"),
    poe_signals: parseInt(tableCounts[1][0]?.count ?? "0"),
    poe_detection_events: parseInt(tableCounts[2][0]?.count ?? "0"),
    poe_evidence: parseInt(tableCounts[3][0]?.count ?? "0"),
    normalized_signals: parseInt(tableCounts[4][0]?.count ?? "0"),
  };

  const runs = await queryNeon<Record<string, unknown>>(
    `SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 1`
  );

  return { connected: true, laneId, tables, latestRun: runs[0] ?? null };
}
