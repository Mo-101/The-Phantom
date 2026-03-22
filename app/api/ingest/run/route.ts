import { NextResponse } from 'next/server';
import { serverEnv, validateMode } from '@/lib/env';

export async function POST() {
  try {
    validateMode('ingest');
    const env = serverEnv();

    // Dynamic import so pg never touches client bundle
    const { IngestQueue } = await import('@/server/engine/ingest.queue');

    const queue = new IngestQueue({
      supabaseUrl: env.SUPABASE_URL!,
      supabaseKey: env.AFRO_SENTINEL_API_URL!,
      databaseUrl: env.NEON_DATABASE_URL!,
      acledKey: env.ACLED_API_KEY,
      acledEmail: env.ACLED_EMAIL,
      acledBaseUrl: env.ACLED_BASE_URL,
      dtmBaseUrl: env.IOM_DTM_BASE_URL,
      dtmApiKey: env.IOM_DTM_API_KEY,
      dhis2BaseUrl: env.DHIS2_BASE_URL,
      dhis2Username: env.DHIS2_USERNAME,
      dhis2Password: env.DHIS2_PASSWORD,
    });

    const result = await queue.runOnce();

    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
