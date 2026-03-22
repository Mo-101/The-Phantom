/**
 * moscript://codex/v1
 * ◉⟁⬡  MoStar Industries
 * Phantom POE Engine — Live Signal Ingestion Pipeline
 *
 * agent:       mo-border-phantom-001
 * version:     2.0.0
 * workspace:   phantom-poe
 * truth-floor: fire:0.75 · water:0.70 · air:0.65 · earth:0.80
 *
 * NO MOCK DATA. NO FALLBACKS. REAL SOURCES ONLY.
 * Missing credentials = hard throw. Frost holds until fire is real.
 */

import crypto from "node:crypto";
import { SignalRepository } from "./signal.repository";
import {
  SignalType,
  Element,
  SIGNAL_ELEMENT_MAP,
  filterForConduit,
  NormalizedSignal,
  parseNormalizedSignal,
} from "./signal.schemas.js";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type RiskClass = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface RawDTMFlow {
  origin:      string;
  destination: string;
  date:        string;
  individuals: number;
  country:     string;
  admin1:      string;
  lat?:        number;
  lng?:        number;
}

interface RawACLEDEvent {
  event_id_cnty: string;
  event_date:    string;
  event_type:    string;
  admin1:        string;
  admin2:        string;
  location:      string;
  latitude:      string;
  longitude:     string;
  fatalities:    string;
  country:       string;
  notes:         string;
}

interface RawDHIS2DataValue {
  dataElement:       string;
  orgUnitName:       string;
  period:            string;
  value:             string;
  orgUnitLatitude?:  string;
  orgUnitLongitude?: string;
}

export interface EntropyResult {
  nodeId:      string;
  runId?:      string;
  H_baseline:  number;
  H_current:   number;
  deltaH:      number;
  threshold:   number;
  spiked:      boolean;
  riskClass:   RiskClass;
}

export interface CorridorCandidate {
  corridorId: string;
  runId?:     string;
  startNode:  string;
  endNode:    string;
  score:      number;
  riskClass:  RiskClass;
  signals:    NormalizedSignal[];
  entropy:    EntropyResult;
  timestamp:  string;
}

export interface IngestResult {
  signalsIngested:    number;
  entropySpikes:      number;
  corridorCandidates: number;
  topCorridor:        CorridorCandidate | null;
  timestamp:          string;
  elementalSummary:   ElementalSummary[];
  runId:              string;
}

interface ElementalSummary {
  element: Element;
  volume:  number;
  truth:   number;
}

// ─────────────────────────────────────────────────────────────
// CONFIG — server env vars only, no VITE_ prefix here
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  dtm: {
    baseUrl:  process.env.IOM_DTM_BASE_URL ?? "https://dtm.iom.int/api/v1",
    endpoints: { flows: "/movements", locations: "/locations" },
    apiKey:   process.env.IOM_DTM_API_KEY ?? "",
    region:   "Sub-Saharan Africa",
    pageSize: 200,
  },
  acled: {
    baseUrl: process.env.ACLED_BASE_URL ?? "https://api.acleddata.com/acled/read",
    apiKey:  process.env.ACLED_API_KEY ?? "",
    email:   process.env.ACLED_EMAIL ?? "",
    region:  "Eastern Africa:Western Africa:Central Africa",
    daysBack: 7,
  },
  dhis2: {
    baseUrl: process.env.DHIS2_BASE_URL ?? "https://dhis.who-afro.org/api",
    user:    process.env.DHIS2_USERNAME ?? "",
    pass:    process.env.DHIS2_PASSWORD ?? "",
    dataSet: "EWARS_SYNDROMIC",
    orgUnit: "AFRO_REGION",
    period:  "THIS_WEEK",
  },
  entropy: {
    threshold:     0.8,
    windowHours:   24,
    baselineWeeks: 4,
  },
};

// ─────────────────────────────────────────────────────────────
// COUNTRY RESOLVER
// ─────────────────────────────────────────────────────────────

const COUNTRY_MAP: Record<string, string> = {
  "Kenya": "KE",        "KE": "KE",
  "Tanzania": "TZ",     "TZ": "TZ",
  "Uganda": "UG",       "UG": "UG",
  "DRC": "CD",          "Congo": "CD",      "CD": "CD",
  "Mozambique": "MZ",   "MZ": "MZ",
  "Malawi": "MW",       "MW": "MW",
  "Nigeria": "NG",      "NG": "NG",
  "Ethiopia": "ET",     "ET": "ET",
  "Cameroon": "CM",     "CM": "CM",
  "South Sudan": "SS",  "SS": "SS",
  "Zambia": "ZM",       "ZM": "ZM",
  "Zimbabwe": "ZW",     "ZW": "ZW",
  "Angola": "AO",       "AO": "AO",
  "Burundi": "BI",      "BI": "BI",
  "Rwanda": "RW",       "RW": "RW",
  "CAR": "CF",          "CF": "CF",
  "Niger": "NE",        "NE": "NE",
  "Mali": "ML",         "ML": "ML",
  "Chad": "TD",         "TD": "TD",
  "Senegal": "SN",      "SN": "SN",
};

function resolveCountryCode(raw: string): string | null {
  for (const [key, code] of Object.entries(COUNTRY_MAP)) {
    if (raw.includes(key)) return code;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// LAYER 1 — FETCH (real sources, hard throw on missing creds)
// ─────────────────────────────────────────────────────────────

async function fetchDTMFlows(): Promise<RawDTMFlow[]> {
  if (!CONFIG.dtm.apiKey) {
    throw new Error(
      "IOM_DTM_API_KEY missing — live ingestion cannot start. Set the env var."
    );
  }
  const url = new URL(`${CONFIG.dtm.baseUrl}${CONFIG.dtm.endpoints.flows}`);
  url.searchParams.set("region",  CONFIG.dtm.region);
  url.searchParams.set("limit",   String(CONFIG.dtm.pageSize));
  url.searchParams.set("format",  "json");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${CONFIG.dtm.apiKey}`,
      Accept:        "application/json",
    },
  });
  if (!res.ok) throw new Error(`DTM fetch failed: ${res.status} ${res.statusText}`);
  const data = await res.json() as { data?: RawDTMFlow[] };
  return data.data ?? [];
}

async function fetchACLEDEvents(): Promise<RawACLEDEvent[]> {
  if (!CONFIG.acled.apiKey) {
    throw new Error(
      "ACLED_API_KEY missing — live ingestion cannot start. Set the env var."
    );
  }
  const since = new Date(Date.now() - CONFIG.acled.daysBack * 86400000);
  const url   = new URL(CONFIG.acled.baseUrl);
  url.searchParams.set("key",        CONFIG.acled.apiKey);
  url.searchParams.set("email",      CONFIG.acled.email);
  url.searchParams.set("region",     CONFIG.acled.region);
  url.searchParams.set("event_date", since.toISOString().split("T")[0]);
  url.searchParams.set("date_where", "greater_than");
  url.searchParams.set("limit",      "500");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`ACLED fetch failed: ${res.status}`);
  const data = await res.json() as { data?: RawACLEDEvent[] };
  return data.data ?? [];
}

async function fetchDHIS2Signals(): Promise<RawDHIS2DataValue[]> {
  if (!CONFIG.dhis2.user) {
    throw new Error(
      "DHIS2_USERNAME missing — live ingestion cannot start. Set the env var."
    );
  }
  const url   = `${CONFIG.dhis2.baseUrl}/dataValueSets?dataSet=${CONFIG.dhis2.dataSet}&orgUnit=${CONFIG.dhis2.orgUnit}&period=${CONFIG.dhis2.period}&format=json`;
  const creds = btoa(`${CONFIG.dhis2.user}:${CONFIG.dhis2.pass}`); // btoa — no Buffer

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${creds}`,
      Accept:        "application/json",
    },
  });
  if (!res.ok) throw new Error(`DHIS2 fetch failed: ${res.status}`);
  const data = await res.json() as { dataValues?: RawDHIS2DataValue[] };
  return data.dataValues ?? [];
}

// ─────────────────────────────────────────────────────────────
// LAYER 2 — NORMALISE directly into NormalizedSignal
// No intermediate type. No unknown cast.
// ─────────────────────────────────────────────────────────────

function normaliseDTM(flows: RawDTMFlow[], runId: string): NormalizedSignal[] {
  const type: SignalType = "displacement";
  const validated: NormalizedSignal[] = [];

  for (const f of flows) {
    const country = resolveCountryCode(f.country);
    if (!country) {
      console.warn(`  ⚠️  DTM: cannot resolve country "${f.country}" — record skipped`);
      continue;
    }
    if (!f.lat || !f.lng || (f.lat === 0 && f.lng === 0)) {
      console.warn(`  ⚠️  DTM: missing coordinates for ${f.origin} — record skipped`);
      continue;
    }

    const id = `dtm-${crypto.createHash("md5").update(JSON.stringify(f)).digest("hex").slice(0, 8)}`;
    try {
      validated.push(parseNormalizedSignal({
        id,
        runId,
        source:         "IOM-DTM",
        sourceRecordId: id,
        type,
        element:        SIGNAL_ELEMENT_MAP[type],
        location:       f.origin,
        country,
        latitude:       f.lat,
        longitude:      f.lng,
        magnitude:      Math.min(f.individuals / 5000, 1),
        truthScore:     0.85,
        timestamp:      new Date(f.date).toISOString(),
        fetchedAt:      new Date().toISOString(),
        ingestedAt:     new Date().toISOString(),
        workspace:      "phantom-poe",
        system:         "mo-border-phantom-001",
        raw:            f,
        notes:          `Flow: ${f.origin} → ${f.destination}`,
      }));
    } catch (err) {
      console.warn(`  ⚠️  DTM parse rejected ${id}: ${(err as Error).message}`);
    }
  }

  return validated;
}

function normaliseACLED(events: RawACLEDEvent[], runId: string): NormalizedSignal[] {
  const type: SignalType = "conflict";
  const validated: NormalizedSignal[] = [];

  for (const e of events) {
    const lat = Number.parseFloat(e.latitude);
    const lng = Number.parseFloat(e.longitude);
    if (!lat || !lng || (lat === 0 && lng === 0)) {
      console.warn(`  ⚠️  ACLED: missing coords for ${e.location} — record skipped`);
      continue;
    }
    const country = resolveCountryCode(e.country);
    if (!country) {
      console.warn(`  ⚠️  ACLED: cannot resolve country "${e.country}" — record skipped`);
      continue;
    }

    const id = `acled-${e.event_id_cnty}`;
    try {
      validated.push(parseNormalizedSignal({
        id,
        runId,
        source:         "ACLED",
        sourceRecordId: e.event_id_cnty,
        type,
        element:        SIGNAL_ELEMENT_MAP[type],
        location:       e.location,
        country,
        latitude:       lat,
        longitude:      lng,
        magnitude:      Math.min((Number.parseInt(e.fatalities) || 0) / 50, 1),
        truthScore:     0.78,
        timestamp:      new Date(e.event_date).toISOString(),
        fetchedAt:      new Date().toISOString(),
        ingestedAt:     new Date().toISOString(),
        workspace:      "phantom-poe",
        system:         "mo-border-phantom-001",
        raw:            e,
        notes:          e.notes.slice(0, 200),
      }));
    } catch (err) {
      console.warn(`  ⚠️  ACLED parse rejected ${id}: ${(err as Error).message}`);
    }
  }

  return validated;
}

function normaliseDHIS2(values: RawDHIS2DataValue[], runId: string): NormalizedSignal[] {
  const type: SignalType = "disease";
  const validated: NormalizedSignal[] = [];

  for (const v of values) {
    const lat = Number.parseFloat(v.orgUnitLatitude  ?? "0");
    const lng = Number.parseFloat(v.orgUnitLongitude ?? "0");
    if (!lat || !lng || (lat === 0 && lng === 0)) {
      console.warn(`  ⚠️  DHIS2: missing coords for ${v.orgUnitName} — record skipped`);
      continue;
    }
    const country = resolveCountryCode(v.orgUnitName);
    if (!country) {
      console.warn(`  ⚠️  DHIS2: cannot resolve country for orgUnit "${v.orgUnitName}" — record skipped`);
      continue;
    }

    const id = `dhis2-${crypto.createHash("md5").update(JSON.stringify(v)).digest("hex").slice(0, 8)}`;
    try {
      validated.push(parseNormalizedSignal({
        id,
        runId,
        source:         "DHIS2",
        sourceRecordId: id,
        type,
        element:        SIGNAL_ELEMENT_MAP[type],
        location:       v.orgUnitName,
        country,
        latitude:       lat,
        longitude:      lng,
        magnitude:      Math.min(Number.parseInt(v.value) / 500, 1),
        truthScore:     0.91,
        timestamp:      new Date().toISOString(),
        fetchedAt:      new Date().toISOString(),
        ingestedAt:     new Date().toISOString(),
        workspace:      "phantom-poe",
        system:         "mo-border-phantom-001",
        disease:        v.dataElement,
        raw:            v,
      }));
    } catch (err) {
      console.warn(`  ⚠️  DHIS2 parse rejected ${id}: ${(err as Error).message}`);
    }
  }

  return validated;
}

// ─────────────────────────────────────────────────────────────
// LAYER 3 — ENTROPY (real baselines from Neo4j)
// ─────────────────────────────────────────────────────────────

function shannonEntropy(signals: NormalizedSignal[]): number {
  if (signals.length === 0) return 0;
  const total = signals.reduce((s, sig) => s + sig.magnitude, 0);
  if (total === 0) return 0;
  return -signals.reduce((h, sig) => {
    const p = sig.magnitude / total;
    return p > 0 ? h + p * Math.log2(p) : h;
  }, 0);
}

function computeEntropy(
  nodeId:          string,
  currentSignals:  NormalizedSignal[],
  baselineSignals: NormalizedSignal[],
  runId?:          string
): EntropyResult {
  const H_current  = shannonEntropy(currentSignals);
  const H_baseline = shannonEntropy(baselineSignals);
  const deltaH     = H_current - H_baseline;
  const threshold  = CONFIG.entropy.threshold;

  let riskClass: RiskClass = "LOW";
  if      (Math.abs(deltaH) >= threshold * 2) riskClass = "CRITICAL";
  else if (Math.abs(deltaH) >= threshold * 1.5) riskClass = "HIGH";
  else if (Math.abs(deltaH) >= threshold)       riskClass = "MEDIUM";

  return {
    nodeId,
    runId,
    H_baseline,
    H_current,
    deltaH,
    threshold,
    spiked:    Math.abs(deltaH) >= threshold,
    riskClass,
  };
}

// ─────────────────────────────────────────────────────────────
// LAYER 4 — GRAPH WRITE (real persistence, not logging)
// ─────────────────────────────────────────────────────────────

async function writeToGrid(
  entropy:     EntropyResult,
  corridor?:   CorridorCandidate,
  signalRepo?: SignalRepository,
  runId?:      string
): Promise<void> {
  if (!signalRepo) {
    console.warn("  ⚠️  writeToGrid: no SignalRepository — skipping Neo4j persistence");
    return;
  }

  if (entropy.spiked) {
    signalRepo.upsertEntropyAlert({ ...entropy, runId });
    console.log(
      `  ◉ ENTROPY persisted: ${entropy.nodeId} ΔH=${entropy.deltaH.toFixed(4)} [${entropy.riskClass}]`
    );
  }

  if (corridor) {
    signalRepo.upsertCorridor({
      corridorId: corridor.corridorId,
      runId: corridor.runId ?? runId,
      startNode: corridor.startNode,
      endNode: corridor.endNode,
      score: corridor.score,
      riskClass: corridor.riskClass,
      activated: corridor.score >= 0.4,
      velocity: 0, // computed in corridor_detection — not available here
      totalKm: 0,
      timestamp: corridor.timestamp,
    });
    console.log(`  ◉ CORRIDOR persisted: ${corridor.corridorId} score=${corridor.score}`);

    // Write POE_Corridor -[:POE_CONTAINS_SIGNAL]-> POE_Signal relationships
    const driver   = (signalRepo as any).driver;
    const database = (signalRepo as any).database;
    for (const sig of corridor.signals.slice(0, 20)) {
      const session = driver.session({ database });
      try {
        await session.run(
          `MATCH (c:POE_Corridor {corridorId: $cId, workspace: 'phantom-poe'})
           MATCH (s:POE_Signal   {signalId:   $sId, workspace: 'phantom-poe'})
           MERGE (c)-[:POE_CONTAINS_SIGNAL]->(s)`,
          { cId: corridor.corridorId, sId: sig.id }
        );
      } finally {
        await session.close();
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// LAYER 5 — CORRIDOR CANDIDATE (real entropy, real velocity)
// ─────────────────────────────────────────────────────────────

function detectCorridorCandidate(
  signals:  NormalizedSignal[],
  entropy:  EntropyResult,
  runId?:   string
): CorridorCandidate | null {
  if (!entropy.spiked) return null;

  const diseaseSignals = signals
    .filter(s => s.type === "disease")
    .filter(s => s.latitude && s.longitude && !(s.latitude === 0 && s.longitude === 0))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (diseaseSignals.length < 2) return null;

  const first = diseaseSignals[0];
  const last  = diseaseSignals.at(-1);

  if (!last) return null;

  // Ensure latitude and longitude are defined
  if (
    typeof first.latitude !== "number" || typeof first.longitude !== "number" ||
    typeof last.latitude !== "number"  || typeof last.longitude !== "number"
  ) {
    console.warn("  ⚠️  Corridor rejected: missing latitude/longitude on first or last signal");
    return null;
  }

  const daysDelta = (
    new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()
  ) / 86400000;

  if (daysDelta <= 0) return null;

  // Real haversine distance
  const R    = 6371;
  const dLat = (last.latitude - first.latitude) * Math.PI / 180;
  const dLng = (last.longitude - first.longitude) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2
             + Math.cos(first.latitude * Math.PI/180)
             * Math.cos(last.latitude  * Math.PI/180)
             * Math.sin(dLng/2)**2;
  const distanceKm    = R * 2 * Math.asin(Math.sqrt(a));
  const velocityKmDay = distanceKm / daysDelta;

  const isVelocityPlausible = velocityKmDay >= 2 && velocityKmDay <= 200;
  if (!isVelocityPlausible) {
    console.warn(
      `  ⚠️  Corridor rejected: implausible velocity ${velocityKmDay.toFixed(1)}km/day`
    );
    return null;
  }

  const velocityScore  = Math.min(velocityKmDay / 100, 1);
  const entropyScore   = Math.min(Math.abs(entropy.deltaH) / entropy.threshold, 1);
  const signalScore    = Math.min(diseaseSignals.length / 5, 1);
  const avgTruth       = diseaseSignals.reduce((s, sig) => s + sig.truthScore, 0) / diseaseSignals.length;

  const compositeScore = (0.4 * entropyScore + 0.35 * signalScore + 0.25 * velocityScore) * avgTruth;

  if (compositeScore < 0.35) return null;

  let riskClass: RiskClass = "LOW";
  if      (compositeScore >= 0.8) riskClass = "CRITICAL";
  else if (compositeScore >= 0.6) riskClass = "HIGH";
  else if (compositeScore >= 0.4) riskClass = "MEDIUM";

  // Deterministic ID — anchor pair + date bucket + workspace
  const dateBucket = new Date().toISOString().slice(0, 10).replaceAll('-', "");
  const startCC    = (first.country ?? "XX").slice(0, 2).toUpperCase();
  const endCC      = (last.country  ?? "XX").slice(0, 2).toUpperCase();
  const anchorHash = crypto
    .createHash("md5")
    .update(`${first.location}-${last.location}-phantom-poe`)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  const corridorId = `CORRIDOR-${startCC}-${endCC}-${dateBucket}-${anchorHash}`;

  return {
    corridorId,
    runId,
    startNode:  first.location,
    endNode:    last.location,
    score:      Number.parseFloat(compositeScore.toFixed(4)),
    riskClass,
    signals:    diseaseSignals,
    entropy,
    timestamp:  new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// ELEMENTAL SUMMARY — for Layer 0 conduit readiness
// ─────────────────────────────────────────────────────────────

function buildElementalSummary(signals: NormalizedSignal[]): ElementalSummary[] {
  const elementGroups = new Map<Element, NormalizedSignal[]>();

  for (const sig of signals) {
    const existing = elementGroups.get(sig.element) ?? [];
    existing.push(sig);
    elementGroups.set(sig.element, existing);
  }

  const allElements: Element[] = ["🜂", "🜄", "🜁", "🜃"];
  return allElements.map(el => {
    const group = elementGroups.get(el) ?? [];
    const truth  = group.length > 0
      ? group.reduce((s, sig) => s + sig.truthScore, 0) / group.length
      : 0;
    return { element: el, volume: group.length, truth: Number.parseFloat(truth.toFixed(4)) };
  });
}

// ─────────────────────────────────────────────────────────────
// MOSCRIPT — mo-signal-ingest-001
// ─────────────────────────────────────────────────────────────

export const mo_SIGNAL_INGEST = {
  id:      "mo-signal-ingest-001" as const,
  name:    "Live Signal Ingestion Pipeline",
  trigger: 'cron("0 * * * *")',
  inputs:  ["signalRepo", "runId"],

  logic: async (inputs: Record<string, any>): Promise<IngestResult> => {
    const signalRepo = inputs.signalRepo as SignalRepository | undefined;
    const runId      = inputs.runId as string;

    if (!runId || runId.startsWith("manual")) {
      throw new Error(
        `Invalid runId "${runId}" — production runId required. Boot must generate RUN-* id.`
      );
    }

    // ── FETCH ─────────────────────────────────────────────────
    console.log(`  ◉⟁⬡  Ingestion start [Run: ${runId}]`);
    const [dtmRaw, acledRaw, dhis2Raw] = await Promise.all([
      fetchDTMFlows(),
      fetchACLEDEvents(),
      fetchDHIS2Signals(),
    ]);
    console.log(`  ✓  Fetched: DTM=${dtmRaw.length} ACLED=${acledRaw.length} DHIS2=${dhis2Raw.length}`);

    // ── NORMALISE directly into NormalizedSignal ──────────────
    const rawNormalized: NormalizedSignal[] = [
      ...normaliseDTM(dtmRaw,    runId),
      ...normaliseACLED(acledRaw, runId),
      ...normaliseDHIS2(dhis2Raw, runId),
    ];
    console.log(`  ✓  Normalised: ${rawNormalized.length} records`);

    // ── FILTER through truth floor ────────────────────────────
    const signals = filterForConduit(rawNormalized);
    console.log(`  ✓  Truth-filtered: ${signals.length} signals cleared conduit`);

    // ── BATCH PERSIST ─────────────────────────────────────────
    if (signalRepo && signals.length > 0) {
      await signalRepo.upsertSignals(signals);
      console.log(`  ✓  Persisted ${signals.length} signals to Neo4j [POE_Signal]`);
    }

    // ── ENTROPY DETECTION with real Neo4j baselines ───────────
    const nodeGroups = new Map<string, NormalizedSignal[]>();
    for (const sig of signals) {
      const existing = nodeGroups.get(sig.location) ?? [];
      existing.push(sig);
      nodeGroups.set(sig.location, existing);
    }

    const entropyResults: EntropyResult[] = [];
    for (const [nodeId, nodeSigs] of nodeGroups) {
      let baselineSigs: NormalizedSignal[] = [];
      let baselineAvailable = false;

      if (signalRepo) {
        try {
          const raw = signalRepo.getBaselineSignals(nodeId, CONFIG.entropy.baselineWeeks);
          if (raw.length > 0) {
            baselineSigs = raw.map(r => ({
              id:         r.signalId as string,
              runId:      r.runId    as string,
              source:     (r.source  as string) ?? "UNKNOWN",
              type:       r.type     as SignalType,
              element:    r.element  as Element,
              location:   r.nodeId   as string,
              country:    r.country  as string,
              latitude:   Number(r.lat ?? 0),
              longitude:  Number(r.lng ?? 0),
              magnitude:  Number(r.magnitude  ?? 0),
              truthScore: Number(r.truthScore ?? 0),
              timestamp:  r.timestamp as string,
              fetchedAt:  r.timestamp as string,
              ingestedAt: r.timestamp as string,
              workspace:  "phantom-poe",
              system:     "mo-border-phantom-001",
            } as NormalizedSignal));
            baselineAvailable = true;
          }
        } catch (err) {
          console.warn(`  ⚠️  Baseline fetch failed for ${nodeId}: ${(err as Error).message}`);
        }
      }

      if (!baselineAvailable) {
        console.warn(
          `  ⚠️  No baseline for node "${nodeId}" — entropy detection skipped (${nodeSigs.length} current signals held)`
        );
        continue;
      }

      const result = computeEntropy(nodeId, nodeSigs, baselineSigs, runId);
      if (result.spiked) {
        entropyResults.push(result);
        console.log(
          `  🔥  Entropy spike: ${nodeId} ΔH=${result.deltaH.toFixed(4)} [${result.riskClass}]`
        );
      }
    }

    // ── CORRIDOR CANDIDATES ───────────────────────────────────
    const corridors: CorridorCandidate[] = [];
    for (const entropy of entropyResults) {
      const candidate = detectCorridorCandidate(signals, entropy, runId);
      if (candidate) corridors.push(candidate);
    }

    // ── WRITE ENTROPY + CORRIDORS TO NEO4J ───────────────────
    for (const entropy of entropyResults) {
      const corridor = corridors.find(c => c.entropy.nodeId === entropy.nodeId);
      await writeToGrid(entropy, corridor, signalRepo, runId);
    }

    // ── ELEMENTAL SUMMARY for Layer 0 conduit readiness ───────
    const elementalSummary = buildElementalSummary(signals);

    const result: IngestResult = {
      signalsIngested:    signals.length,
      entropySpikes:      entropyResults.length,
      corridorCandidates: corridors.length,
      topCorridor:        corridors[0] ?? null,
      timestamp:          new Date().toISOString(),
      elementalSummary,
      runId,
    };

    return result;
  },

  voiceLine: (result: IngestResult) =>
    `Pipeline sealed [${result.runId}]. ` +
    `${result.signalsIngested} signals ingested. ` +
    `${result.entropySpikes} entropy spike(s). ` +
    `${result.corridorCandidates > 0
      ? `◉ PHANTOM POE ACTIVATED — ${result.corridorCandidates} corridor(s) written to Grid.`
      : "Grid listening. Frost holds."}`,

  sass: true,
};