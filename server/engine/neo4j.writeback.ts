/**
 * ◉⟁⬡  Phantom POE — Neo4j Writeback
 *
 * Writes each cell's posterior and its q_m provenance to Neo4j so that
 * Isaias / South Sudan reviewers can replay "why 0.68".
 *
 * Graph schema:
 *
 *   (:GridCell { cellId, lat, lng, posterior, qBaseline, state })
 *     -[:EVIDENCE_FROM]->
 *   (:OSINTSignal { id, source, fetchTime, decayConstantS, magnitude })
 *
 * Cell nodes are MERGED (upserted) on each write cycle.
 * Signal nodes are MERGED on signal id.
 * EVIDENCE_FROM edges carry the magnitude and influence contribution.
 */

import neo4j, { type Driver, type Session } from 'neo4j-driver';
import type { ProbabilitySurface } from './probability.surface';
import type { ProvisionalStateMachine } from './provisional.state';
import type { HeartbeatSignal } from './heartbeat.ingest';

/* ─── Config ─── */

function getDriver(): Driver {
  const uri      = process.env.NEO4J_URI       ?? 'bolt://localhost:7687';
  const user     = process.env.NEO4J_USER      ?? 'neo4j';
  const password = process.env.NEO4J_PASSWORD  ?? 'mostar123';
  return neo4j.driver(uri, neo4j.auth.basic(user, password));
}

let _driver: Driver | null = null;

function driver(): Driver {
  if (!_driver) _driver = getDriver();
  return _driver;
}

/* ─── Schema Bootstrap ─── */

export async function ensureSchema(): Promise<void> {
  const session = driver().session();
  try {
    await session.run(`
      CREATE CONSTRAINT gridcell_id IF NOT EXISTS
      FOR (c:GridCell) REQUIRE c.cellId IS UNIQUE
    `);
    await session.run(`
      CREATE CONSTRAINT osint_id IF NOT EXISTS
      FOR (s:OSINTSignal) REQUIRE s.id IS UNIQUE
    `);
    await session.run(`
      CREATE INDEX gridcell_posterior IF NOT EXISTS
      FOR (c:GridCell) ON (c.posterior)
    `);
    console.log('[Neo4j] Schema constraints and indexes ensured');
  } catch (err) {
    // Constraints may already exist in older Neo4j versions — ignore
    console.warn('[Neo4j] Schema bootstrap warning:', String(err).split('\n')[0]);
  } finally {
    await session.close();
  }
}

/* ─── Cell Writeback ─── */

/**
 * Write the full probability surface to Neo4j.
 * Each cell is upserted; state is set from the state machine result.
 */
export async function writeSurfaceCells(
  surface: ProbabilitySurface,
  machine: ProvisionalStateMachine,
): Promise<{ cellsWritten: number; durationMs: number }> {
  const start = Date.now();
  const rows = surface.toJSON();
  const states = machine.getAllStates();
  const stateMap = new Map(states.map((s) => [s.cellId, s.state]));

  const session: Session = driver().session();
  let cellsWritten = 0;

  try {
    // Batch in chunks of 25 to avoid overloading Neo4j
    const CHUNK = 25;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);

      await session.run(
        `UNWIND $cells AS c
         MERGE (n:GridCell { cellId: c.cellId })
         SET   n.latCenter          = c.latCenter,
               n.lngCenter          = c.lngCenter,
               n.posterior          = c.posterior,
               n.qBaseline          = c.qBaseline,
               n.state              = c.state,
               n.evidenceCount      = c.evidenceCount,
               n.contributingSources = c.contributingSources,
               n.lastEvidenceAt     = c.lastEvidenceAt,
               n.updatedAt          = datetime()`,
        {
          cells: chunk.map((c) => ({
            ...c,
            state: stateMap.get(c.cellId) ?? 'DORMANT',
          })),
        }
      );
      cellsWritten += chunk.length;
    }
  } finally {
    await session.close();
  }

  const durationMs = Date.now() - start;
  console.log(`[Neo4j] Cells written: ${cellsWritten} in ${durationMs}ms`);
  return { cellsWritten, durationMs };
}

/* ─── Signal Writeback ─── */

/**
 * Write ingested signals and create EVIDENCE_FROM edges to any cells
 * they contributed to (within the Koboko-Arua box).
 */
export async function writeSignals(signals: HeartbeatSignal[]): Promise<{ signalsWritten: number }> {
  if (signals.length === 0) return { signalsWritten: 0 };

  const session: Session = driver().session();

  try {
    // 1. Upsert signal nodes
    await session.run(
      `UNWIND $signals AS s
       MERGE (n:OSINTSignal { id: s.id })
       SET   n.source         = s.source,
             n.fetchTime      = s.fetchTime,
             n.decayConstantS = s.decayConstantS,
             n.magnitude      = s.magnitude,
             n.title          = s.title,
             n.lat            = s.lat,
             n.lng            = s.lng,
             n.inBox          = s.inBox`,
      {
        signals: signals.map((s) => ({
          id: s.id,
          source: s.source,
          fetchTime: s.fetchTime,
          decayConstantS: s.decayConstantS,
          magnitude: s.magnitude,
          title: s.title.slice(0, 200), // truncate long titles
          lat: s.lat ?? 0,
          lng: s.lng ?? 0,
          inBox: s.inBox,
        })),
      }
    );

    // 2. For in-box signals with coordinates, create EVIDENCE_FROM edges
    //    to nearby cells (rough proximity match using Neo4j)
    const inBoxSignals = signals.filter((s) => s.inBox && s.lat != null && s.lng != null);
    if (inBoxSignals.length > 0) {
      await session.run(
        `UNWIND $signals AS s
         MATCH (sig:OSINTSignal { id: s.id })
         MATCH (cell:GridCell)
         WHERE abs(cell.latCenter - s.lat) < 0.36
           AND abs(cell.lngCenter - s.lng) < 0.36
         MERGE (sig)-[r:EVIDENCE_FROM]->(cell)
         SET   r.magnitude   = s.magnitude,
               r.recordedAt  = datetime()`,
        {
          signals: inBoxSignals.map((s) => ({
            id: s.id,
            lat: s.lat,
            lng: s.lng,
            magnitude: s.magnitude,
          })),
        }
      );
    }
  } finally {
    await session.close();
  }

  console.log(`[Neo4j] Signals written: ${signals.length}`);
  return { signalsWritten: signals.length };
}

/* ─── Provenance Query ─── */

/**
 * Given a cellId, return the signals that contributed to its current posterior.
 * This is the "why 0.68" replay path.
 */
export async function getCellProvenance(cellId: string): Promise<{
  cell: Record<string, unknown> | null;
  signals: Array<{
    id: string;
    source: string;
    fetchTime: string;
    magnitude: number;
    title: string;
    influence: number;
  }>;
}> {
  const session: Session = driver().session();
  try {
    const cellResult = await session.run(
      `MATCH (c:GridCell { cellId: $cellId }) RETURN c`,
      { cellId }
    );
    const cell = cellResult.records[0]?.get('c')?.properties ?? null;

    const signalResult = await session.run(
      `MATCH (s:OSINTSignal)-[r:EVIDENCE_FROM]->(c:GridCell { cellId: $cellId })
       RETURN s.id AS id, s.source AS source, s.fetchTime AS fetchTime,
              s.magnitude AS magnitude, s.title AS title,
              r.magnitude AS influence
       ORDER BY r.magnitude DESC
       LIMIT 20`,
      { cellId }
    );

    const signals = signalResult.records.map((r) => ({
      id: String(r.get('id')),
      source: String(r.get('source')),
      fetchTime: String(r.get('fetchTime')),
      magnitude: Number(r.get('magnitude')),
      title: String(r.get('title')),
      influence: Number(r.get('influence')),
    }));

    return { cell, signals };
  } finally {
    await session.close();
  }
}

/* ─── Close ─── */

export async function closeNeo4j(): Promise<void> {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}
