import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';

export async function GET(req: NextRequest) {
  const env = serverEnv();
  const { searchParams } = new URL(req.url);

  const lat = parseFloat(searchParams.get('lat') ?? '0');
  const lng = parseFloat(searchParams.get('lng') ?? '0');
  const radius = parseFloat(searchParams.get('radius') ?? '50');

  try {
    const baseUrl = env.AFRO_SENTINEL_API_URL ?? 'https://afro-sentinel.vercel.app/';
    const url = new URL('/api/signals', baseUrl);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lng', String(lng));
    url.searchParams.set('radius', String(radius));

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = env.AFRO_SENTINEL_OIDC_TOKEN;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Sentinel returned ${res.status}`, signals: [] },
        { status: 502 }
      );
    }

    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return NextResponse.json(
        { error: 'Sentinel returned non-JSON', signals: [] },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ signals: data.signals ?? [], count: data.signals?.length ?? 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, signals: [] }, { status: 500 });
  }
}
