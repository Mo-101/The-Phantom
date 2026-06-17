/**
 * ◉⟁⬡  MoStar Industries
 * Phantom POE — Backend Server
 * 
 * Boots MoScript layers and serves API endpoints for Vite frontend
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

// Load environment variables from the project root.
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

function getSql() {
  const databaseUrl = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('NEON_DATABASE_URL is not configured');
  return neon(databaseUrl);
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Live disease signals endpoint for the Vite frontend
app.get('/api/signals/live', async (req, res) => {
  try {
    const sql = getSql();
    const lane = String(req.query.lane ?? 'LIVE').toUpperCase();
    const since = String(
      req.query.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    );
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit ?? 500)));

    const lanes = await sql`
      SELECT id::text, lane, label
       FROM data_lanes
       WHERE upper(lane) = upper(${lane})
       ORDER BY is_active DESC, created_at DESC
       LIMIT 1
    ` as unknown as { id: string; lane: string; label: string | null }[];

    const activeLane = lanes[0] ?? null;
    if (!activeLane) {
      res.json({ lane: null, signals: [], count: 0, since, error: `No data lane found for ${lane}` });
      return;
    }

    const rows = await sql`
      SELECT
          id, lane_id, lane, lane_label, source, source_record_id, type, disease,
          country, admin1, admin2, location, latitude, longitude, magnitude,
          truth_score, passed_truth_filter, timestamp, ingested_at,
          corridor_id, fire_gate_active, fire_truth_score
       FROM v_live_poe_signals_geo
       WHERE lane_id = ${activeLane.id}
         AND ingested_at::timestamptz >= ${since}::timestamptz
       ORDER BY ingested_at::timestamptz DESC
       LIMIT ${limit}
    ` as unknown as Record<string, unknown>[];

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

    res.json({ lane: activeLane, signals, count: signals.length, since });
  } catch (error) {
    console.error('[api/signals/live] failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      signals: [],
      count: 0,
    });
  }
});

// MoScript boot endpoint
app.get('/api/boot', async (req, res) => {
  try {
    // Dynamic import of boot module using path alias
    const { bootPhantom } = await import('@/moscripts/boot');
    const result = await bootPhantom();
    res.json(result);
  } catch (error) {
    console.error('Boot error:', error);
    res.status(500).json({ error: 'Boot failed', message: String(error) });
  }
});

// Corridor activation endpoint
app.post('/api/evaluate-activation', async (req, res) => {
  try {
    const { activationEvaluator } = await import('@/moscripts/covenant.activation.integration');
    const result = await activationEvaluator.evaluateActivation(req.body, []);
    res.json(result);
  } catch (error) {
    console.error('Activation evaluation error:', error);
    res.status(500).json({ error: 'Evaluation failed', message: String(error) });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  Phantom POE Backend Server                                 ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
  console.log(`  Server running on http://localhost:${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/health`);
  console.log(`  Boot endpoint: http://localhost:${PORT}/api/boot`);
  console.log(`\n  Ready to serve MoScript layers...\n`);
});
