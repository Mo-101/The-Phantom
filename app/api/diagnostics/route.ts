// ─── diagnostic.ts ───────────────────────────────────────────
import { NextResponse } from 'next/server';
import { serverEnv, validateMode } from '@/lib/env';

export interface DiagnosticResult {
    service: string;
    status: 'OK' | 'ERROR';
    message: string;
    latencyMs?: number;
}

async function testSentinel(env: ReturnType<typeof serverEnv>): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
        const baseUrl = env.AFRO_SENTINEL_API_URL ?? 'https://afro-sentinel.vercel.app/';
        const url = new URL('/api/signals', baseUrl);
        url.searchParams.set('lat', '0');
        url.searchParams.set('lng', '0');
        url.searchParams.set('radius', '1');

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const token = env.AFRO_SENTINEL_OIDC_TOKEN;
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { service: 'AFRO Sentinel', status: 'OK', message: 'API reachable', latencyMs: Date.now() - start };
    } catch (error) {
        return { service: 'AFRO Sentinel', status: 'ERROR', message: error instanceof Error ? error.message : String(error) };
    }
}

async function testNeo4j(env: ReturnType<typeof serverEnv>): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
        const { uri, user, password } = { uri: env.NEO4J_URI, user: env.NEO4J_USER, password: env.NEO4J_PASSWORD };
        if (!uri || !password) throw new Error('Neo4j credentials not set');

        const neo4j = await import('neo4j-driver');
        const driver = neo4j.default.driver(uri, neo4j.default.auth.basic(user ?? 'neo4j', password));
        const session = driver.session();
        try {
            await session.run('RETURN 1');
            return { service: 'Neo4j', status: 'OK', message: `Connected to ${uri}`, latencyMs: Date.now() - start };
        } finally {
            await session.close();
            await driver.close();
        }
    } catch (error) {
        return { service: 'Neo4j', status: 'ERROR', message: error instanceof Error ? error.message : String(error) };
    }
}

async function testNeon(env: ReturnType<typeof serverEnv>): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
        // FIX: env key is NEON_DATABASE_URL, not DATABASE_URL
        const url = env.NEON_DATABASE_URL;
        if (!url) throw new Error('NEON_DATABASE_URL missing');

        const pg = await import('pg');
        const client = new pg.default.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
        await client.connect();
        try {
            await client.query('SELECT 1');
            return { service: 'Neon PostgreSQL', status: 'OK', message: 'Connected', latencyMs: Date.now() - start };
        } finally {
            await client.end();
        }
    } catch (error) {
        return { service: 'Neon PostgreSQL', status: 'ERROR', message: error instanceof Error ? error.message : String(error) };
    }
}

async function testACLED(env: ReturnType<typeof serverEnv>): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
        const apiKey = env.ACLED_API_KEY;
        const email = env.ACLED_EMAIL;
        if (!apiKey || !email) throw new Error('ACLED credentials missing');

        const url = new URL(env.ACLED_BASE_URL ?? 'https://api.acleddata.com/acled/read');
        url.searchParams.set('key', apiKey);
        url.searchParams.set('email', email);
        url.searchParams.set('limit', '1');

        const res = await fetch(url.toString(), {
            headers: { 'User-Agent': 'MoStarDiagnostic/1.0' },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`ACLED returned ${res.status}`);
        return { service: 'ACLED', status: 'OK', message: 'API reachable', latencyMs: Date.now() - start };
    } catch (error) {
        return { service: 'ACLED', status: 'ERROR', message: error instanceof Error ? error.message : String(error) };
    }
}

// FIX: testDTM was called but never defined
async function testDTM(env: ReturnType<typeof serverEnv>): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
        const apiKey = env.IOM_DTM_API_KEY;
        const baseUrl = env.IOM_DTM_BASE_URL ?? 'https://dtm.iom.int/api/v1';
        if (!apiKey) throw new Error('IOM_DTM_API_KEY missing');

        const url = new URL(`${baseUrl}/movements`);
        url.searchParams.set('limit', '1');
        url.searchParams.set('format', 'json');

        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`DTM returned ${res.status}`);
        return { service: 'IOM DTM', status: 'OK', message: 'API reachable', latencyMs: Date.now() - start };
    } catch (error) {
        return { service: 'IOM DTM', status: 'ERROR', message: error instanceof Error ? error.message : String(error) };
    }
}

async function testDHIS2(env: ReturnType<typeof serverEnv>): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
        const user = env.DHIS2_USERNAME;
        const pass = env.DHIS2_PASSWORD;
        if (!user || !pass) throw new Error('DHIS2 credentials missing');

        const baseUrl = env.DHIS2_BASE_URL ?? 'https://academy.demos.dhis2.org/web-apps-2-38-1';
        // FIX: Buffer.from() is Node-only — use btoa() which is available in Next.js edge/server
        const creds = btoa(`${user}:${pass}`);

        const res = await fetch(`${baseUrl}/api/system/info`, {
            headers: { Authorization: `Basic ${creds}`, 'User-Agent': 'MoStarDiagnostic/1.0' },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`DHIS2 returned ${res.status}`);
        return { service: 'DHIS2', status: 'OK', message: 'Connected', latencyMs: Date.now() - start };
    } catch (error) {
        return { service: 'DHIS2', status: 'ERROR', message: error instanceof Error ? error.message : String(error) };
    }
}

async function testSupabase(env: ReturnType<typeof serverEnv>): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
        const url = env.SUPABASE_URL;
        const key = env.AFRO_SENTINEL_SERVICE_KEY; // FIX: correct key name from env schema
        if (!url || !key) throw new Error('Supabase credentials missing');

        const res = await fetch(`${url}/rest/v1/`, {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok && res.status !== 404) throw new Error(`Supabase returned ${res.status}`);
        return { service: 'Supabase / AFRO Sentinel', status: 'OK', message: 'API reachable', latencyMs: Date.now() - start };
    } catch (error) {
        return { service: 'Supabase / AFRO Sentinel', status: 'ERROR', message: error instanceof Error ? error.message : String(error) };
    }
}

export async function GET() {
    const env = serverEnv();

    const results = await Promise.allSettled([
        testSentinel(env),
        testNeo4j(env),
        testNeon(env),
        testACLED(env),
        testDTM(env),      // now defined
        testDHIS2(env),
        testSupabase(env),
    ]);

    const diagnostics: DiagnosticResult[] = results.map(r =>
        r.status === 'fulfilled'
            ? r.value
            : { service: 'Unknown', status: 'ERROR' as const, message: String(r.reason) }
    );

    return NextResponse.json({ diagnostics, timestamp: new Date().toISOString() });
}


// ─── app/api/ingest/run/route.ts ──────────────────────────────

export async function POST() {
    try {
        validateMode('ingest');
        const env = serverEnv();

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