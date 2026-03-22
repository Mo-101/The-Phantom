/**
 * POST /api/detections
 * 
 * Dual-write endpoint: receives corridor detection events from the Firebase
 * service layer and persists them into Neon (poe_detection_events table)
 * for long-term analytics and truth engine correlation.
 * 
 * GET /api/detections
 * Returns recent detection events for the dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      event_type,
      corridor_id,
      route_name,
      score,
      summary,
      severity,
      source_count,
    } = body;

    if (!corridor_id || !event_type) {
      return NextResponse.json(
        { error: 'corridor_id and event_type are required' },
        { status: 400 }
      );
    }

    const id = randomUUID();

    await sql`
      INSERT INTO poe_detection_events (
        id, corridor_id, event_type, confidence, timestamp, metadata
      ) VALUES (
        ${id},
        ${corridor_id},
        ${event_type},
        ${score ?? 0},
        NOW(),
        ${JSON.stringify({ route_name, summary, severity, source_count })}::jsonb
      )
      ON CONFLICT (id) DO NOTHING
    `;

    return NextResponse.json({ id, status: 'written' });
  } catch (err) {
    console.error('[api/detections] POST failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const corridorId = searchParams.get('corridorId');
    const limitCount = parseInt(searchParams.get('limit') ?? '50', 10);

    let events;
    if (corridorId) {
      events = await sql`
        SELECT id, corridor_id, event_type, confidence, timestamp, metadata
        FROM poe_detection_events
        WHERE corridor_id = ${corridorId}
        ORDER BY timestamp DESC
        LIMIT ${limitCount}
      `;
    } else {
      events = await sql`
        SELECT id, corridor_id, event_type, confidence, timestamp, metadata
        FROM poe_detection_events
        ORDER BY timestamp DESC
        LIMIT ${limitCount}
      `;
    }

    return NextResponse.json({ events });
  } catch (err) {
    console.error('[api/detections] GET failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
