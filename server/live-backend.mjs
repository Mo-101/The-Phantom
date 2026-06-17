import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";

loadEnv(".env.local");
loadEnv(".env");

const PORT = Number(process.env.PORT || 3002);

function loadEnv(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type, accept",
  });
  res.end(payload);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function getSql() {
  const databaseUrl = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("NEON_DATABASE_URL is not configured");
  const { neon } = await import("@neondatabase/serverless");
  return neon(databaseUrl);
}

async function handleLiveSignals(req, res, url) {
  try {
    const sql = await getSql();
    const lane = String(url.searchParams.get("lane") ?? "LIVE").toUpperCase();
    const since =
      url.searchParams.get("since") ??
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") ?? 500)));

    const lanes = await sql.query(
      `SELECT id::text, lane, label
       FROM data_lanes
       WHERE upper(lane) = upper($1)
       ORDER BY is_active DESC, created_at DESC
       LIMIT 1`,
      [lane]
    );

    const activeLane = lanes[0] ?? null;
    if (!activeLane) {
      json(res, 200, { lane: null, signals: [], count: 0, since, error: `No data lane found for ${lane}` });
      return;
    }

    const rows = await sql.query(
      `SELECT
          id, lane_id, lane, lane_label, source, source_record_id, type, disease,
          country, admin1, admin2, location, latitude, longitude, magnitude,
          truth_score, passed_truth_filter, timestamp, ingested_at,
          corridor_id, fire_gate_active, fire_truth_score
       FROM v_live_poe_signals_geo
       WHERE lane_id = $1
         AND ingested_at::timestamptz >= $2::timestamptz
       ORDER BY ingested_at::timestamptz DESC
       LIMIT $3`,
      [activeLane.id, since, limit]
    );

    const signals = rows.map((row) => ({
      id: String(row.id),
      laneId: String(row.lane_id),
      lane: String(row.lane),
      source: String(row.source),
      sourceRecordId: row.source_record_id ?? null,
      type: String(row.type),
      disease: String(row.disease),
      country: row.country ?? null,
      admin1: row.admin1 ?? null,
      admin2: row.admin2 ?? null,
      location: row.location ?? null,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      magnitude: toNumber(row.magnitude),
      truthScore: toNumber(row.truth_score),
      passedTruthFilter: Boolean(row.passed_truth_filter),
      timestamp: String(row.timestamp),
      ingestedAt: String(row.ingested_at),
      corridorId: row.corridor_id ?? null,
      fireGateActive: Boolean(row.fire_gate_active),
      fireTruthScore: row.fire_truth_score == null ? null : toNumber(row.fire_truth_score),
    }));

    json(res, 200, { lane: activeLane, signals, count: signals.length, since });
  } catch (error) {
    console.error("[api/signals/live] failed:", error);
    json(res, 500, {
      error: error instanceof Error ? error.message : "Unknown error",
      signals: [],
      count: 0,
    });
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `localhost:${PORT}`}`);

  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, { status: "ok", timestamp: new Date().toISOString() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/signals/live") {
    void handleLiveSignals(req, res, url);
    return;
  }

  json(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Phantom live backend listening on http://localhost:${PORT}`);
});
