import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

let pool: Pool | null = null;

function getPool() {
  if (pool) return pool;
  const databaseUrl = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("NEON_DATABASE_URL/DATABASE_URL is not configured");
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false, // matches DEV/local environment requirements
    },
    connectionTimeoutMillis: 5000,
  });
  return pool;
}

interface LiveSignalRow {
  id: string;
  lane_id: string;
  lane: string;
  lane_label: string | null;
  source: string;
  source_record_id: string | null;
  type: string;
  disease: string;
  country: string | null;
  admin1: string | null;
  admin2: string | null;
  location: string | null;
  latitude: number;
  longitude: number;
  magnitude: number;
  truth_score: number;
  passed_truth_filter: boolean;
  timestamp: Date;
  ingested_at: Date;
  corridor_id: string | null;
  fire_gate_active: boolean | null;
  fire_truth_score: number | null;
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: NextRequest) {
  try {
    const dbPool = getPool();
    const { searchParams } = new URL(req.url);
    const lane = (searchParams.get("lane") || "LIVE").toUpperCase();
    const since =
      searchParams.get("since") ||
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const limit = Math.min(1000, Math.max(1, Number(searchParams.get("limit") ?? 500)));

    const laneRes = await dbPool.query(
      `SELECT id::text, lane, label
       FROM data_lanes
       WHERE upper(lane) = upper($1)
       ORDER BY is_active DESC, created_at DESC
       LIMIT 1`,
      [lane]
    );

    const activeLane = laneRes.rows[0] ?? null;

    if (!activeLane) {
      return NextResponse.json({
        lane: null,
        signals: [],
        count: 0,
        since,
        error: `No data lane found for ${lane}`,
      });
    }

    const signalsRes = await dbPool.query(
      `SELECT
          id::text,
          lane_id::text,
          lane,
          lane_label,
          source,
          source_record_id,
          type,
          disease,
          country,
          admin1,
          admin2,
          location,
          latitude,
          longitude,
          magnitude,
          truth_score,
          passed_truth_filter,
          timestamp,
          ingested_at,
          corridor_id,
          fire_gate_active,
          fire_truth_score
       FROM v_live_poe_signals_geo
       WHERE lane_id = $1
         AND ingested_at::timestamptz >= $2::timestamptz
       ORDER BY ingested_at::timestamptz DESC
       LIMIT $3`,
      [activeLane.id, since, limit]
    );

    const signals = signalsRes.rows.map((row: LiveSignalRow) => ({
      id: String(row.id),
      laneId: String(row.lane_id),
      lane: row.lane,
      source: row.source,
      sourceRecordId: row.source_record_id,
      type: row.type,
      disease: row.disease,
      country: row.country,
      admin1: row.admin1,
      admin2: row.admin2,
      location: row.location,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      magnitude: toNumber(row.magnitude),
      truthScore: toNumber(row.truth_score),
      passedTruthFilter: Boolean(row.passed_truth_filter),
      timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
      ingestedAt: row.ingested_at instanceof Date ? row.ingested_at.toISOString() : String(row.ingested_at),
      corridorId: row.corridor_id,
      fireGateActive: Boolean(row.fire_gate_active),
      fireTruthScore: row.fire_truth_score == null ? null : toNumber(row.fire_truth_score),
    }));

    return NextResponse.json({
      lane: activeLane,
      signals,
      count: signals.length,
      since,
    });
  } catch (error) {
    console.error("[api/signals/live] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error", signals: [], count: 0 },
      { status: 500 }
    );
  }
}
