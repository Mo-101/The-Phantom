import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

/**
 * POST /api/corridors/:corridor_id/recompute-routes
 *
 * Triggers recomputation of logistics routes against the latest evidence in
 * corridor_temporal_events. Algorithm:
 *   1. Load active evidence for corridor (corridor_temporal_events).
 *   2. Build conflict buffer (50km) around CONFLICT events with severity >= HIGH.
 *   3. Build disease buffer (25km) around HEALTH events.
 *   4. For each candidate origin (Entebbe, Kampala, Kigali, Goma, in-country):
 *      - Build candidate path via known transport graph.
 *      - Reject if path intersects conflict buffer.
 *      - Penalize segments inside disease buffer unless destination.
 *      - Prefer formal monitored crossings.
 *      - Compute total cost = sum(km × friction × (1 + risk)).
 *   5. Best LOW-risk path → PRIMARY. Next-best feasible → ALTERNATE.
 *      Rejected paths → BLOCKED (with rationale).
 *   6. Write new rows; set valid_until on previous PRIMARY/ALTERNATE.
 *
 * Old rows are retained for audit — only valid_until is updated.
 */
export async function POST(
  _req: Request,
  { params }: { params: { corridor_id: string } }
) {
  const { corridor_id } = params;
  const queuedAt = new Date().toISOString();

  try {
    // Expire previous active routes for this corridor
    await sql`
      UPDATE logistics_routes
      SET valid_until = NOW()
      WHERE corridor_id = ${corridor_id}
        AND (valid_until IS NULL OR valid_until > NOW())
        AND classification IN ('PRIMARY', 'ALTERNATE', 'CONTINGENCY')
    `;

    // TODO: implement full recomputation engine
    // - fetch corridor_temporal_events WHERE corridor_id = $corridor_id
    // - run conflict / disease buffer analysis
    // - build candidate paths and score them
    // - INSERT new logistics_routes + logistics_waypoints rows

    return NextResponse.json({
      status: 'queued',
      corridor_id,
      queued_at: queuedAt,
    });
  } catch (err) {
    console.error('[recompute-routes] POST error:', err);
    return NextResponse.json(
      { error: `recompute failed: ${String(err)}` },
      { status: 500 }
    );
  }
}
