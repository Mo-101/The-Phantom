/**
 * POST /api/firebase/user
 * 
 * Syncs an authenticated Firebase user into the Neon firebase_user_sessions
 * table so that corridor intelligence queries can be scoped to authenticated
 * users and audit trails can be maintained.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { uid, email, displayName, provider, metadata } = body;

    if (!uid || !email) {
      return NextResponse.json(
        { error: 'uid and email are required' },
        { status: 400 }
      );
    }

    // Upsert into firebase_user_sessions — use uid as the id
    await sql`
      INSERT INTO firebase_user_sessions (
        id, user_id, email, display_name, provider, created_at, last_active_at, metadata
      ) VALUES (
        ${uid},
        ${uid},
        ${email},
        ${displayName ?? null},
        ${provider ?? 'google.com'},
        NOW(),
        NOW(),
        ${JSON.stringify(metadata ?? {})}::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET
        last_active_at = NOW(),
        display_name = EXCLUDED.display_name,
        metadata = EXCLUDED.metadata
    `;

    return NextResponse.json({ synced: true, uid });
  } catch (err) {
    console.error('[api/firebase/user] POST failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid');

    if (!uid) {
      return NextResponse.json({ error: 'uid required' }, { status: 400 });
    }

    const rows = await sql`
      SELECT id, user_id, email, display_name, provider, created_at, last_active_at, metadata
      FROM firebase_user_sessions
      WHERE user_id = ${uid}
      LIMIT 1
    `;

    return NextResponse.json({ user: rows[0] ?? null });
  } catch (err) {
    console.error('[api/firebase/user] GET failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
