// ═══════════════════════════════════════════════════════════════
// PHANTOM POE ORCHESTRATOR — Production Run
// Calls all providers, normalizes, scores, detects corridors
// ═══════════════════════════════════════════════════════════════

import { ingestACLED } from './ingest_acled';
import { ingestDTM } from './ingest_dtm';
import { ingestDHIS2 } from './ingest_dhis2';
import { v4 as uuid } from 'uuid';

export async function runPhantomPOE(params: {
  acledKey: string;
  acledEmail: string;
  dtmApiKey: string;
  dhis2BaseUrl: string;
  dhis2Username: string;
  dhis2Password: string;
  db: any; // your Neon/Postgres connection
}) {
  const runId = uuid();
  const now = new Date().toISOString();

  // Create run record
  await params.db.query(
    `INSERT INTO ingestion_runs (run_id, started_at, status) VALUES ($1, $2, 'running')`,
    [runId, now]
  );

  let totalSignals = 0;
  let totalPassed = 0;

  // ── ACLED ──────────────────────────────
  try {
    const acled = await ingestACLED({ apiKey: params.acledKey, email: params.acledEmail, runId });
    // Persist raw
    for (const e of acled.raw) {
      await params.db.query(
        `INSERT INTO raw_acled_events (id, run_id, event_id, event_date, event_type, sub_event_type,
         actor1, actor2, country, admin1, admin2, admin3, location, latitude, longitude,
         fatalities, notes, source, source_scale, timestamp, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [e.data_id, runId, e.event_id_cnty, e.event_date, e.event_type, e.sub_event_type,
         e.actor1, e.actor2, e.country, e.admin1, e.admin2, e.admin3, e.location,
         e.latitude, e.longitude, e.fatalities, e.notes, e.source, e.source_scale,
         e.timestamp, now]
      );
    }
    // Persist normalized signals
    for (const s of acled.signals) {
      await params.db.query(
        `INSERT INTO normalized_signals (id, run_id, source, type, element, location, country,
         admin1, admin2, latitude, longitude, magnitude, truth_score, raw_value, disease,
         timestamp, passed_truth_filter, ingested_at, raw_source_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [s.id, s.run_id, s.source, s.type, s.element, s.location, s.country,
         s.admin1, s.admin2, s.latitude, s.longitude, s.magnitude, s.truth_score,
         s.raw_value, s.disease, s.timestamp, s.passed_truth_filter, s.ingested_at,
         s.raw_source_id, s.notes]
      );
    }
    totalSignals += acled.signals.length;
    totalPassed += acled.signals.filter(s => s.passed_truth_filter).length;
    await params.db.query(`UPDATE ingestion_runs SET acled_fetched=$1 WHERE run_id=$2`, [acled.raw.length, runId]);
  } catch (err) {
    console.error('ACLED ingestion failed:', err);
  }

  // ── IOM-DTM ────────────────────────────
  try {
    const dtm = await ingestDTM({ apiKey: params.dtmApiKey, runId });
    for (const s of dtm.signals) {
      await params.db.query(
        `INSERT INTO normalized_signals (id, run_id, source, type, element, location, country,
         admin1, admin2, latitude, longitude, magnitude, truth_score, raw_value, disease,
         timestamp, passed_truth_filter, ingested_at, raw_source_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [s.id, s.run_id, s.source, s.type, s.element, s.location, s.country,
         s.admin1, s.admin2, s.latitude, s.longitude, s.magnitude, s.truth_score,
         s.raw_value, s.disease, s.timestamp, s.passed_truth_filter, s.ingested_at,
         s.raw_source_id, s.notes]
      );
    }
    totalSignals += dtm.signals.length;
    totalPassed += dtm.signals.filter(s => s.passed_truth_filter).length;
    await params.db.query(`UPDATE ingestion_runs SET dtm_fetched=$1 WHERE run_id=$2`, [dtm.raw.length, runId]);
  } catch (err) {
    console.error('DTM ingestion failed:', err);
  }

  // ── DHIS2 ──────────────────────────────
  try {
    const dhis2 = await ingestDHIS2({
      baseUrl: params.dhis2BaseUrl,
      username: params.dhis2Username,
      password: params.dhis2Password,
      runId,
    });
    for (const s of dhis2.signals) {
      await params.db.query(
        `INSERT INTO normalized_signals (id, run_id, source, type, element, location, country,
         admin1, admin2, latitude, longitude, magnitude, truth_score, raw_value, disease,
         timestamp, passed_truth_filter, ingested_at, raw_source_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [s.id, s.run_id, s.source, s.type, s.element, s.location, s.country,
         s.admin1, s.admin2, s.latitude, s.longitude, s.magnitude, s.truth_score,
         s.raw_value, s.disease, s.timestamp, s.passed_truth_filter, s.ingested_at,
         s.raw_source_id, s.notes]
      );
    }
    totalSignals += dhis2.signals.length;
    totalPassed += dhis2.signals.filter(s => s.passed_truth_filter).length;
    await params.db.query(`UPDATE ingestion_runs SET dhis2_fetched=$1 WHERE run_id=$2`, [dhis2.raw.length, runId]);
  } catch (err) {
    console.error('DHIS2 ingestion failed:', err);
  }

  // ── Finalize ───────────────────────────
  await params.db.query(
    `UPDATE ingestion_runs SET status='completed', completed_at=$1,
     signals_normalized=$2, signals_after_truth_filter=$3 WHERE run_id=$4`,
    [new Date().toISOString(), totalSignals, totalPassed, runId]
  );

  return { runId, totalSignals, totalPassed };
}
