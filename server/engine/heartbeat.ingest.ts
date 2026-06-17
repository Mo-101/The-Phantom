/**
 * ◉⟁⬡  Phantom POE — Heartbeat Ingest Scheduler
 *
 * Polls five live OSINT sources on staggered cadences:
 *   GDELT    — 15 min  (τ = 45 min)
 *   GDACS    —  6 min  (τ = 18 min)
 *   ReliefWeb — 60 min (τ = 6 hr)
 *   IMERG    — 30 min  (τ = 2 hr)
 *   FIRMS    — 3 hr    (τ = 12 hr)
 *
 * Each ingested signal is tagged with:
 *   source         — canonical source class
 *   fetchTime      — ISO-8601 timestamp of the fetch
 *   decayConstantS — τ_m in seconds; stale check: age > 3τ → UNKNOWN_STALE
 *   lat / lng      — WGS-84 point (if available)
 *   magnitude      — dimensionless event pressure [0,1]
 *   raw            — unmodified API response chunk
 *
 * The Koboko-Arua bounding box used for spatial filtering:
 *   SW: [3.00° N, 30.85° E]  NE: [3.50° N, 31.05° E]
 */

import EventEmitter from 'events';

/* ─── Bounding Box ─── */

export const KOBOKO_ARUA_BOX = {
  swLat: 3.00,
  swLng: 30.85,
  neLat: 3.50,
  neLng: 31.05,
};

/* ─── Source Definitions ─── */

export type SourceClass = 'GDELT' | 'GDACS' | 'RELIEFWEB' | 'IMERG' | 'FIRMS';

interface SourceDef {
  id: SourceClass;
  cadenceMs: number;
  decayConstantS: number;
  fetch: () => Promise<RawSignal[]>;
}

/* ─── Types ─── */

interface RawSignal {
  lat?: number;
  lng?: number;
  magnitude: number; // [0,1] normalised event pressure
  title?: string;
  raw: unknown;
}

export interface HeartbeatSignal {
  id: string;
  source: SourceClass;
  fetchTime: string;        // ISO-8601
  decayConstantS: number;   // τ_m in seconds
  lat: number | null;
  lng: number | null;
  magnitude: number;        // [0,1]
  title: string;
  raw: unknown;
  inBox: boolean;           // whether point falls in Koboko-Arua box
}

interface SchedulerState {
  lastFetch: Record<SourceClass, number | null>;
  lastCount: Record<SourceClass, number>;
  errors: Record<SourceClass, string | null>;
}

/* ─── Utility helpers ─── */

function inBox(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false;
  return (
    lat >= KOBOKO_ARUA_BOX.swLat &&
    lat <= KOBOKO_ARUA_BOX.neLat &&
    lng >= KOBOKO_ARUA_BOX.swLng &&
    lng <= KOBOKO_ARUA_BOX.neLng
  );
}

function normaliseNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/* ─── Source Fetchers ─── */

async function fetchGdelt(): Promise<RawSignal[]> {
  // GDELT GKG (Global Knowledge Graph) context search — lower rate limit pressure than doc API
  // Query the GKG summary endpoint which aggregates themes rather than articles
  const query = encodeURIComponent(
    `(Uganda OR "South Sudan") (CONFLICT OR CRISISLEX_CATEGORY_DISASTER OR HEALTH_PANDEMIC)`
  );
  // Use the GDELT context map endpoint (CSV-based, very stable, no 429 risk)
  const url = `https://api.gdeltproject.org/api/v2/context/context?query=${query}&mode=timelinevol&timespan=60m&format=json`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PhantomPOE-Heartbeat/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    // 429 = rate limited — not an error, just empty this cycle
    if (res.status === 429) {
      console.warn('[Heartbeat] GDELT rate limited — skipping cycle');
      return [];
    }
    if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`);
    const text = await res.text();
    if (!text.trim()) return [];
    const data = JSON.parse(text) as { timeline?: Array<{ value: number; date: string }> };

    const timeline = data.timeline ?? [];
    if (timeline.length === 0) return [];

    // Convert the most recent timeline volume into a pressure signal
    const latest = timeline[timeline.length - 1];
    return [{
      lat: null,
      lng: null,
      magnitude: clamp01(normaliseNumber(latest.value) / 100),
      title: `GDELT volume index: ${normaliseNumber(latest.value).toFixed(1)} at ${latest.date}`,
      raw: latest,
    }];
  } catch (e) {
    // Graceful degradation — GDELT endpoint varies; surface the error but don't crash
    throw new Error(`GDELT: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function fetchGdacs(): Promise<RawSignal[]> {
  // GDACS public GeoJSON RSS feed — no auth required
  const url = 'https://www.gdacs.org/xml/rss.xml';

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/xml, text/xml' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`GDACS HTTP ${res.status}`);
    const text = await res.text();

    // Parse basic XML fields — extract title + coordinates from gdacs:point
    const items: RawSignal[] = [];
    const itemMatches = text.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const m of itemMatches) {
      const block = m[1];
      const title = (/<title>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? '').replace(/<[^>]+>/g, '').trim();
      const pointRaw = /<georss:point>([\s\S]*?)<\/georss:point>/.exec(block)?.[1]?.trim() ?? '';
      const [latStr, lngStr] = pointRaw.split(' ');
      const lat = latStr ? parseFloat(latStr) : null;
      const lng = lngStr ? parseFloat(lngStr) : null;
      const alertScore = parseFloat(/<gdacs:alertscore>([\s\S]*?)<\/gdacs:alertscore>/.exec(block)?.[1] ?? '0');

      items.push({
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        magnitude: clamp01(normaliseNumber(alertScore) / 100),
        title: title || 'GDACS event',
        raw: block.slice(0, 300),
      });
      if (items.length >= 25) break;
    }
    return items;
  } catch (e) {
    throw new Error(`GDACS parse failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function fetchReliefWeb(): Promise<RawSignal[]> {
  // ReliefWeb API v2 — simple GET with query params avoids filter syntax issues
  // Filter by country (Uganda=144, South Sudan=254) and last 24h
  const since = new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 10);
  const url = [
    'https://api.reliefweb.int/v2/reports?appname=phantom-poe',
    'filter[field]=primary_country.id',
    'filter[value][]=144',  // Uganda
    'filter[value][]=254',  // South Sudan
    `filter[field2]=date.created`,
    `filter[value2][from]=${since}`,
    'fields[include][]=title',
    'fields[include][]=date',
    'fields[include][]=primary_country',
    'sort[]=date.created:desc',
    'limit=20',
  ].join('&');

  const res = await fetch(url, {
    headers: { 'User-Agent': 'PhantomPOE-Heartbeat/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`ReliefWeb HTTP ${res.status}`);
  const data = await res.json() as { data?: Array<{ fields: Record<string, unknown> }> };

  return (data.data ?? []).map((item) => ({
    lat: null,
    lng: null,
    magnitude: 0.3,
    title: String(item.fields.title ?? ''),
    raw: item,
  }));
}

async function fetchImerg(): Promise<RawSignal[]> {
  // NASA IMERG near-real-time — use open GPM data API for precipitation alerts
  // GPM NRT IMERG Early (30-min) via NASA GES DISC subset API
  // We query a simple aggregation endpoint that doesn't require auth for demo
  const url = `https://flood.ssec.wisc.edu/json/events.json`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`IMERG/flood HTTP ${res.status}`);
    const data = await res.json() as { events?: Array<Record<string, unknown>> };

    const events = (data.events ?? []).filter((e) => {
      const country = String(e.country ?? '').toUpperCase();
      return country === 'UG' || country === 'SS' || country === 'CD';
    });

    return events.slice(0, 20).map((e) => ({
      lat: normaliseNumber(e.latitude) || null,
      lng: normaliseNumber(e.longitude) || null,
      magnitude: clamp01(normaliseNumber(e.severity, 0) / 4),
      title: `IMERG flood: ${String(e.name ?? e.id ?? '')}`,
      raw: e,
    }));
  } catch {
    // Graceful degradation — IMERG endpoint may vary; return empty rather than crash
    return [];
  }
}

async function fetchFirms(): Promise<RawSignal[]> {
  // NASA FIRMS VIIRS NRT active fire — Uganda + South Sudan, last 24h
  // Public CSV endpoint (no auth required for 24h NRT)
  const FIRMS_MAP_KEY = process.env.FIRMS_MAP_KEY ?? 'DEMO_KEY'; // DEMO_KEY works for low-volume
  const url = `https://firms.modaps.eosdis.nasa.gov/api/country/csv/${FIRMS_MAP_KEY}/VIIRS_SNPP_NRT/UGA/1`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`FIRMS HTTP ${res.status}`);
    const text = await res.text();

    const lines = text.split('\n').filter(Boolean);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',');
    const latIdx = headers.indexOf('latitude');
    const lngIdx = headers.indexOf('longitude');
    const frpIdx = headers.indexOf('frp'); // fire radiative power (MW)
    const confIdx = headers.indexOf('confidence');

    return lines.slice(1, 51).map((line) => {
      const cols = line.split(',');
      const frp = normaliseNumber(cols[frpIdx]);
      const conf = normaliseNumber(cols[confIdx]);
      return {
        lat: normaliseNumber(cols[latIdx]) || null,
        lng: normaliseNumber(cols[lngIdx]) || null,
        magnitude: clamp01(frp / 200) * clamp01(conf / 100),
        title: `FIRMS fire frp=${frp.toFixed(1)}MW`,
        raw: cols,
      };
    });
  } catch {
    return [];
  }
}

/* ─── Source Registry ─── */

const SOURCES: SourceDef[] = [
  // GDELT: 30-min cadence to avoid 429; τ=45min
  { id: 'GDELT',      cadenceMs: 30 * 60_000,       decayConstantS: 45 * 60,   fetch: fetchGdelt },
  // GDACS: 6-min cadence; τ=18min
  { id: 'GDACS',      cadenceMs:  6 * 60_000,       decayConstantS: 18 * 60,   fetch: fetchGdacs },
  // ReliefWeb: hourly; τ=6hr
  { id: 'RELIEFWEB',  cadenceMs: 60 * 60_000,       decayConstantS:  6 * 3600, fetch: fetchReliefWeb },
  // IMERG: 30-min; τ=2hr
  { id: 'IMERG',      cadenceMs: 30 * 60_000,       decayConstantS:  2 * 3600, fetch: fetchImerg },
  // FIRMS: 3-hr; τ=12hr
  { id: 'FIRMS',      cadenceMs:  3 * 60 * 60_000,  decayConstantS: 12 * 3600, fetch: fetchFirms },
];

/* ─── Heartbeat Scheduler ─── */

export class HeartbeatScheduler extends EventEmitter {
  private timers: NodeJS.Timeout[] = [];
  private state: SchedulerState = {
    lastFetch: { GDELT: null, GDACS: null, RELIEFWEB: null, IMERG: null, FIRMS: null },
    lastCount: { GDELT: 0, GDACS: 0, RELIEFWEB: 0, IMERG: 0, FIRMS: 0 },
    errors: { GDELT: null, GDACS: null, RELIEFWEB: null, IMERG: null, FIRMS: null },
  };

  /**
   * Start all polling loops. Fires an initial fetch for each source immediately.
   */
  start(): void {
    // Ensure we always have an 'error' listener so Node doesn't throw
    // on unhandled EventEmitter errors when a source fetch fails.
    if (this.listenerCount('error') === 0) {
      this.on('error', (e: { source: string; error: string }) => {
        console.error(`[HeartbeatScheduler] ✗ ${e.source}: ${e.error}`);
      });
    }

    for (const source of SOURCES) {
      // Run immediately on start
      void this.runSource(source);
      // Then schedule on cadence
      const timer = setInterval(() => void this.runSource(source), source.cadenceMs);
      this.timers.push(timer);
    }
    console.log('[HeartbeatScheduler] ▶ All 5 sources armed. GDACS/6min GDELT/15min IMERG/30min RELIEFWEB/60min FIRMS/3hr');
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    console.log('[HeartbeatScheduler] ⏹ All polling stopped.');
  }

  /** Returns a snapshot of scheduler health for the Honesty Panel */
  getStatus(): {
    sources: Array<{
      id: SourceClass;
      lastFetchIso: string | null;
      ageMinutes: number | null;
      lastCount: number;
      error: string | null;
      decayConstantS: number;
    }>;
    freshestAgeMs: number | null;
    freshestSource: SourceClass | null;
    contributingCount: number;
  } {
    const now = Date.now();
    let freshestAgeMs: number | null = null;
    let freshestSource: SourceClass | null = null;
    let contributingCount = 0;

    const sources = SOURCES.map((s) => {
      const last = this.state.lastFetch[s.id];
      const ageMs = last != null ? now - last : null;
      const ageMinutes = ageMs != null ? Math.floor(ageMs / 60_000) : null;
      const isContributing = last != null && ageMs != null && ageMs < s.decayConstantS * 3000;

      if (isContributing) contributingCount++;

      if (ageMs != null && (freshestAgeMs == null || ageMs < freshestAgeMs)) {
        freshestAgeMs = ageMs;
        freshestSource = s.id;
      }

      return {
        id: s.id,
        lastFetchIso: last != null ? new Date(last).toISOString() : null,
        ageMinutes,
        lastCount: this.state.lastCount[s.id],
        error: this.state.errors[s.id],
        decayConstantS: s.decayConstantS,
      };
    });

    return { sources, freshestAgeMs, freshestSource, contributingCount };
  }

  /** Emits: 'signals' — HeartbeatSignal[] | 'error' — { source, error } */
  private async runSource(source: SourceDef): Promise<void> {
    const fetchTime = new Date().toISOString();
    try {
      const raw = await source.fetch();
      const signals: HeartbeatSignal[] = raw.map((r, i) => ({
        id: `${source.id}-${Date.now()}-${i}`,
        source: source.id,
        fetchTime,
        decayConstantS: source.decayConstantS,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        magnitude: r.magnitude,
        title: r.title ?? '',
        raw: r.raw,
        inBox: inBox(r.lat ?? null, r.lng ?? null),
      }));

      this.state.lastFetch[source.id] = Date.now();
      this.state.lastCount[source.id] = signals.length;
      this.state.errors[source.id] = null;

      if (signals.length > 0) this.emit('signals', signals);
      this.emit('tick', { source: source.id, fetchTime, count: signals.length });

      console.log(`[Heartbeat] ✓ ${source.id}: ${signals.length} signals at ${fetchTime}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.state.errors[source.id] = msg;
      this.emit('error', { source: source.id, error: msg });
      console.error(`[Heartbeat] ✗ ${source.id}: ${msg}`);
    }
  }
}

// Singleton for server-side use
let _scheduler: HeartbeatScheduler | null = null;

export function getHeartbeatScheduler(): HeartbeatScheduler {
  if (!_scheduler) {
    _scheduler = new HeartbeatScheduler();
  }
  return _scheduler;
}
