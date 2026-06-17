/**
 * MoStar Phantom XO â€” Neon Integration Client
 * moscript://codex/v1
 * sass: "One database. One truth. No middlemen."
 *
 * Canonical Neon connection â€” all database access flows through here.
 * Replaces the former Supabase client entirely.
 */

import { neon } from "@neondatabase/serverless";

// â”€â”€ Connection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DATABASE_URL =
  typeof window === "undefined" && typeof process !== "undefined"
    ? process.env.NEON_DATABASE_URL
    : undefined;

if (!DATABASE_URL) {
  console.warn("[neon] Server-side NEON_DATABASE_URL not set; direct database features disabled");
}

const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

// â”€â”€ Generic Query Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function queryNeon<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  if (!sql) {
    console.warn("[neon] No database connection");
    return [];
  }
  try {
    const result = await sql.query(query, params);
    return result as T[];
  } catch (err) {
    console.error("[neon] Query error:", err);
    return [];
  }
}

// â”€â”€ Execute (for mutations â€” INSERT/UPDATE/DELETE) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function execNeon(
  query: string,
  params: unknown[] = []
): Promise<{ rowCount: number; error: string | null }> {
  if (!sql) {
    return { rowCount: 0, error: "No database connection" };
  }
  try {
    const result = await sql.query(query, params);
    return { rowCount: Array.isArray(result) ? result.length : 0, error: null };
  } catch (err) {
    console.error("[neon] Exec error:", err);
    return { rowCount: 0, error: (err as Error).message };
  }
}

// â”€â”€ Connection status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function isNeonConnected(): boolean {
  return sql !== null;
}

// â”€â”€ Active data lane helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let _activeLaneCache: { id: string; ts: number } | null = null;
const LANE_CACHE_TTL = 30_000; // 30s

export async function getActiveLaneId(): Promise<string | null> {
  if (_activeLaneCache && Date.now() - _activeLaneCache.ts < LANE_CACHE_TTL) {
    return _activeLaneCache.id;
  }
  const rows = await queryNeon<{ id: string }>(
    `SELECT id FROM data_lanes WHERE is_active = true LIMIT 1`
  );
  const id = rows[0]?.id ?? null;
  if (id) _activeLaneCache = { id, ts: Date.now() };
  return id;
}

export function clearLaneCache() {
  _activeLaneCache = null;
}

export { sql };

