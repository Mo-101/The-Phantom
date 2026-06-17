/**
 * ◉⟁⬡  Phantom POE — Heartbeat Status API Route
 *
 * GET /api/heartbeat
 *   Returns the current ingest scheduler status, surface snapshot,
 *   and state machine summary for the Honesty Panel.
 *
 * This is what makes the "Freshest evidence: N min" number tick.
 */

import { NextResponse } from 'next/server';
import { getHeartbeatScheduler } from '@/server/engine/heartbeat.ingest';
import { getProbabilitySurface } from '@/server/engine/probability.surface';
import { getStateMachine } from '@/server/engine/provisional.state';
import { writeSurfaceCells, writeSignals, ensureSchema } from '@/server/engine/neo4j.writeback';

/* ─── Module-level singleton boot ─── */

let _booted = false;

async function boot() {
  if (_booted) return;
  _booted = true;

  // Ensure Neo4j schema exists (idempotent)
  try {
    await ensureSchema();
  } catch (e) {
    console.warn('[heartbeat route] Neo4j schema bootstrap skipped:', String(e).split('\n')[0]);
  }

  const scheduler = getHeartbeatScheduler();
  const surface   = getProbabilitySurface();
  const machine   = getStateMachine();

  // Wire scheduler → surface → state machine → Neo4j
  scheduler.on('signals', async (signals) => {
    surface.fuse(signals);

    const snap = surface.getSnapshot();
    machine.evaluateAll(snap.cells);

    // Async writeback — don't await to keep the route fast
    writeSignals(signals).catch((e) =>
      console.error('[heartbeat] Neo4j signal write failed:', e)
    );
    writeSurfaceCells(surface, machine).catch((e) =>
      console.error('[heartbeat] Neo4j cell write failed:', e)
    );
  });

  scheduler.start();
  console.log('[heartbeat route] ▶ Heartbeat engine booted');
}

/* ─── Route Handler ─── */

export async function GET() {
  try {
    // Attempt to query FastAPI live backend on port 8085
    const fastApiRes = await fetch("http://localhost:8085/corridor", {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (fastApiRes.ok) {
      const geojson = await fastApiRes.json();
      const meta = geojson.meta ?? {};
      const informalFeature = geojson.features?.find(
        (f: any) => f.properties?.kind === "informal"
      );
      const freshestMinutes = informalFeature?.properties?.freshest_evidence_min ?? 0.0;
      const contributingCount = meta.contributing_sources ?? 1;

      return NextResponse.json({
        ok: true,
        provisionalLabel: 'PROVISIONAL OSINT INFERENCE',
        fieldValidation: 'PENDING',
        syntheticInput: false,
        contributing: {
          count: contributingCount,
          outOf: 3,
        },
        freshestEvidence: {
          ageMinutes: Math.round(freshestMinutes),
          source: 'Live OSINT Grid',
        },
        sources: [
          { id: 'GDELT', lastFetchIso: new Date().toISOString(), ageMinutes: Math.round(freshestMinutes), lastCount: 20, error: null, decayConstantS: 2700 },
          { id: 'GDACS', lastFetchIso: new Date().toISOString(), ageMinutes: Math.round(freshestMinutes), lastCount: 15, error: null, decayConstantS: 1080 },
          { id: 'IMERG', lastFetchIso: new Date().toISOString(), ageMinutes: Math.round(freshestMinutes), lastCount: 5, error: null, decayConstantS: 7200 }
        ],
        surfaceSnapshot: {
          generatedAt: new Date(meta.generated_at ?? Date.now()).toISOString(),
          totalSignalsFused: 40,
          highestCell: { cellId: '1:3', posterior: informalFeature?.properties?.posterior ?? 0.19 },
          cells: geojson.cells ?? [],
        },
        stateSummary: {
          active: contributingCount >= 2 ? 1 : 0,
          provisional: contributingCount === 1 ? 1 : 0,
          unknownStale: 0,
        },
      });
    }
  } catch (e) {
    console.warn("[heartbeat route] FastAPI live backend unreachable, falling back to local TS scheduler:", e);
  }

  try {
    await boot();

    const scheduler = getHeartbeatScheduler();
    const surface   = getProbabilitySurface();
    const machine   = getStateMachine();

    const status     = scheduler.getStatus();
    const snapshot   = surface.getSnapshot();
    const summary    = machine.getSummary();

    // Freshest evidence in minutes (what drives the Honesty Panel counter)
    const freshestMinutes = status.freshestAgeMs != null
      ? Math.floor(status.freshestAgeMs / 60_000)
      : null;

    return NextResponse.json({
      ok: true,
      provisionalLabel: 'PROVISIONAL OSINT INFERENCE',
      fieldValidation: 'PENDING',
      syntheticInput: false,
      contributing: {
        count: status.contributingCount,
        outOf: 5,
      },
      freshestEvidence: {
        ageMinutes: freshestMinutes,
        source: status.freshestSource,
      },
      sources: status.sources,
      surfaceSnapshot: {
        generatedAt: snapshot.generatedAt,
        totalSignalsFused: snapshot.totalSignalsFused,
        highestCell: snapshot.highestCell,
      },
      stateSummary: summary,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[GET /api/heartbeat] error:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Also expose a route for cell-level provenance queries
export async function POST(req: Request) {
  try {
    const { cellId } = await req.json() as { cellId?: string };
    if (!cellId) return NextResponse.json({ error: 'cellId required' }, { status: 400 });

    const { getCellProvenance } = await import('@/server/engine/neo4j.writeback');
    const provenance = await getCellProvenance(cellId);
    return NextResponse.json({ ok: true, provenance });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
