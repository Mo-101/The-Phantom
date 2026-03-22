import { NextRequest, NextResponse } from 'next/server';
import { serverEnv, validateMode } from '@/lib/env';

export async function GET(
    _req: NextRequest,
    { params }: { params: { runId: string } }
) {
    try {
        validateMode('graph');
        const env = serverEnv();
        const { runId } = params;

        if (!runId) {
            return NextResponse.json({ ok: false, error: 'runId is required' }, { status: 400 });
        }

        const neo4j = await import('neo4j-driver');
        const driver = neo4j.default.driver(
            env.NEO4J_URI!,
            neo4j.default.auth.basic(env.NEO4J_USER ?? 'neo4j', env.NEO4J_PASSWORD!)
        );

        const session = driver.session({ database: 'neo4j' });

        try {
            // Run metadata
            const runResult = await session.run(
                `MATCH (r:POE_Run {runId: $runId, workspace: 'phantom-poe'})
         RETURN r`,
                { runId }
            );

            if (runResult.records.length === 0) {
                return NextResponse.json({ ok: false, error: `Run ${runId} not found` }, { status: 404 });
            }

            const run = runResult.records[0]!.get('r').properties;

            // Corridors for this run
            const corridorResult = await session.run(
                `MATCH (c:POE_Corridor {runId: $runId, workspace: 'phantom-poe'})
         RETURN c
         ORDER BY c.score DESC`,
                { runId }
            );

            const corridors = corridorResult.records.map(r => r.get('c').properties);

            // Signal count + breakdown by source
            const signalResult = await session.run(
                `MATCH (s:POE_Signal {runId: $runId, workspace: 'phantom-poe'})
         RETURN s.source AS source, count(s) AS count
         ORDER BY count DESC`,
                { runId }
            );

            const signalsBySource = signalResult.records.map(r => ({
                source: r.get('source'),
                count: r.get('count').toNumber(),
            }));

            const totalSignals = signalsBySource.reduce((sum, s) => sum + s.count, 0);

            // Entropy alerts for this run
            const entropyResult = await session.run(
                `MATCH (e:POE_Entropy {runId: $runId, workspace: 'phantom-poe'})
         RETURN e
         ORDER BY e.deltaH DESC`,
                { runId }
            );

            const entropyAlerts = entropyResult.records.map(r => r.get('e').properties);

            // Most recent moment sealed in this run
            const momentResult = await session.run(
                `MATCH (m:POE_Moment {runId: $runId, workspace: 'phantom-poe'})
         RETURN m
         ORDER BY m.sealedAt DESC
         LIMIT 5`,
                { runId }
            );

            const moments = momentResult.records.map(r => r.get('m').properties);

            return NextResponse.json({
                ok: true,
                runId,
                run,
                summary: {
                    corridors: corridors.length,
                    signals: totalSignals,
                    entropyAlerts: entropyAlerts.length,
                    moments: moments.length,
                },
                corridors,
                signalsBySource,
                entropyAlerts,
                moments,
                timestamp: new Date().toISOString(),
            });

        } finally {
            await session.close();
            await driver.close();
        }

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}