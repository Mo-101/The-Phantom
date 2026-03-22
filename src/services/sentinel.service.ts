/**
 * ◉⟁⬡  MoStar Industries
 * SentinelService — Supabase-backed disease signal retrieval & elemental routing
 *
 * Calls the `get_recent_signals` stored procedure to retrieve P1-priority
 * validated signals from the past 7 days, filters by eligible signal types,
 * and routes each signal exclusively to its designated Woo elemental gate.
 *
 * Elemental Gate Routing Law:
 *   FIRE   — disease, outbreak, case_report, alert       (health signals)
 *   WATER  — displacement                                 (population movement)
 *   AIR    — conflict                                     (force signals)
 *   EARTH  — terrain, entropy                             (environmental signals)
 *
 * Cross-contamination between elements is strictly forbidden.
 * Each signal flows to exactly one element. No signal may appear in two gates.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Signal types sourced from the Supabase stored procedure. */
export type RawSignalType =
  | 'disease'
  | 'outbreak'
  | 'case_report'
  | 'alert'
  | 'displacement'
  | 'conflict'
  | 'terrain'
  | 'entropy';

/** Status values — only 'validated' signals are accepted by this service. */
export type SignalStatus = 'validated' | 'pending' | 'rejected' | 'expired';

/** Woo elemental gate identifiers. */
export type WooElement = 'FIRE' | 'WATER' | 'AIR' | 'EARTH';

/** The priority level submitted to the stored procedure. */
export type PriorityLevel = 'P1' | 'P2' | 'P3';

/** Raw row returned by the `get_recent_signals` stored procedure. */
export interface RawSignalRow {
  id: string;
  type: RawSignalType;
  status: SignalStatus;
  source: string;
  description: string;
  confidence: number;
  weight: number;
  lat: number;
  lng: number;
  country_code: string;
  corridor_id: string | null;
  node_id: string | null;
  priority: PriorityLevel;
  detected_at: string;
  validated_at: string | null;
  metadata: Record<string, unknown> | null;
}

/** A validated signal after filtering and enrichment. */
export interface ValidatedSignal extends RawSignalRow {
  element: WooElement;
  routedAt: string;
}

/** Routed output — signals bucketed by their exclusive Woo element. */
export interface ElementalRoutingOutput {
  FIRE: ValidatedSignal[];    // disease, outbreak, case_report, alert
  WATER: ValidatedSignal[];   // displacement
  AIR: ValidatedSignal[];     // conflict
  EARTH: ValidatedSignal[];   // terrain, entropy
  meta: {
    runAt: string;
    windowStart: string;
    windowEnd: string;
    priority: PriorityLevel;
    totalFetched: number;
    totalValidated: number;
    totalRouted: number;
    skippedTypes: string[];
  };
}

// ---------------------------------------------------------------------------
// Elemental routing map — single source of truth, no overlaps allowed
// ---------------------------------------------------------------------------

const ELEMENT_MAP: Record<RawSignalType, WooElement> = {
  // FIRE — health domain
  disease:     'FIRE',
  outbreak:    'FIRE',
  case_report: 'FIRE',
  alert:       'FIRE',
  // WATER — population movement
  displacement: 'WATER',
  // AIR — force / conflict
  conflict:    'AIR',
  // EARTH — environmental / structural
  terrain:     'EARTH',
  entropy:     'EARTH',
} as const;

/** All signal types accepted by this service. Any other type is silently dropped. */
const ACCEPTED_TYPES = new Set<RawSignalType>(Object.keys(ELEMENT_MAP) as RawSignalType[]);

// ---------------------------------------------------------------------------
// SentinelSignalService
// ---------------------------------------------------------------------------

export class SentinelSignalService {
  private readonly client: SupabaseClient;
  private readonly priority: PriorityLevel;

  constructor(priority: PriorityLevel = 'P1') {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error(
        '[SentinelSignalService] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.',
      );
    }

    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.priority = priority;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Retrieve validated P1 signals from the past 7 days and route them to
   * their exclusive Woo elemental gate.
   *
   * The stored procedure signature is:
   *   get_recent_signals(start_date, end_date, priority_level)
   *
   * Only signals with status = 'validated' pass the gate.
   * Each signal is routed to exactly one element — no cross-contamination.
   */
  async fetchAndRoute(): Promise<ElementalRoutingOutput> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const windowEnd = now.toISOString();
    const windowStart = sevenDaysAgo.toISOString();

    // 1. Call stored procedure
    const { data, error } = await this.client.rpc('get_recent_signals', {
      start_date: windowStart,
      end_date: windowEnd,
      priority_level: this.priority,
    });

    if (error) {
      throw new Error(
        `[SentinelSignalService] get_recent_signals RPC failed: ${error.message}`,
      );
    }

    const rows: RawSignalRow[] = (data ?? []) as RawSignalRow[];

    // 2. Filter — status must be 'validated' AND type must be in ACCEPTED_TYPES
    const skippedTypeSet = new Set<string>();
    const validated: RawSignalRow[] = [];

    for (const row of rows) {
      if (row.status !== 'validated') continue;

      if (!ACCEPTED_TYPES.has(row.type)) {
        skippedTypeSet.add(row.type);
        continue;
      }

      validated.push(row);
    }

    // 3. Route — each signal goes to exactly one element, never two
    const output: ElementalRoutingOutput = {
      FIRE:  [],
      WATER: [],
      AIR:   [],
      EARTH: [],
      meta: {
        runAt: now.toISOString(),
        windowStart,
        windowEnd,
        priority: this.priority,
        totalFetched: rows.length,
        totalValidated: validated.length,
        totalRouted: 0,
        skippedTypes: [...skippedTypeSet],
      },
    };

    const routedAt = now.toISOString();

    for (const signal of validated) {
      const element = ELEMENT_MAP[signal.type];
      const routed: ValidatedSignal = { ...signal, element, routedAt };
      output[element].push(routed);
    }

    output.meta.totalRouted =
      output.FIRE.length +
      output.WATER.length +
      output.AIR.length +
      output.EARTH.length;

    return output;
  }

  /**
   * Fetch raw signals only — no routing applied.
   * Useful for diagnostics or feeding into a custom routing pipeline.
   */
  async fetchValidated(): Promise<RawSignalRow[]> {
    const { FIRE, WATER, AIR, EARTH } = await this.fetchAndRoute();
    return [...FIRE, ...WATER, ...AIR, ...EARTH].map(({ element: _e, routedAt: _r, ...s }) => s);
  }

  /**
   * Retrieve only the FIRE-routed signals (disease domain).
   * Used exclusively by the Woo Fire gate — no other elements may consume this.
   */
  async getFireSignals(): Promise<ValidatedSignal[]> {
    const { FIRE } = await this.fetchAndRoute();
    return FIRE;
  }

  /**
   * Retrieve only the WATER-routed signals (displacement domain).
   */
  async getWaterSignals(): Promise<ValidatedSignal[]> {
    const { WATER } = await this.fetchAndRoute();
    return WATER;
  }

  /**
   * Retrieve only the AIR-routed signals (conflict domain).
   */
  async getAirSignals(): Promise<ValidatedSignal[]> {
    const { AIR } = await this.fetchAndRoute();
    return AIR;
  }

  /**
   * Retrieve only the EARTH-routed signals (terrain/entropy domain).
   */
  async getEarthSignals(): Promise<ValidatedSignal[]> {
    const { EARTH } = await this.fetchAndRoute();
    return EARTH;
  }
}

// ---------------------------------------------------------------------------
// Helpers — exported for use in Woo gate validators and tests
// ---------------------------------------------------------------------------

/**
 * Resolve which Woo element a signal type belongs to.
 * Returns null for unrecognised types — callers must handle this explicitly.
 */
export function resolveElement(type: string): WooElement | null {
  return ELEMENT_MAP[type as RawSignalType] ?? null;
}

/**
 * Assert that a set of signals contains no cross-element contamination.
 * Throws if any signal's type maps to a different element than `expected`.
 * Called by the Woo gate before processing a bucket.
 */
export function assertElementPurity(signals: ValidatedSignal[], expected: WooElement): void {
  for (const signal of signals) {
    if (signal.element !== expected) {
      throw new Error(
        `[WooGatePurityViolation] Signal ${signal.id} (type="${signal.type}") ` +
        `is routed to ${signal.element} but was presented to the ${expected} gate. ` +
        `Cross-contamination is forbidden.`,
      );
    }
  }
}

/**
 * Summarise a routing output for logging / audit.
 */
export function summariseRouting(output: ElementalRoutingOutput): string {
  const { meta } = output;
  return (
    `[SentinelSignalService] Run: ${meta.runAt} | ` +
    `Window: ${meta.windowStart} → ${meta.windowEnd} | ` +
    `Priority: ${meta.priority} | ` +
    `Fetched: ${meta.totalFetched} | ` +
    `Validated: ${meta.totalValidated} | ` +
    `Routed: ${meta.totalRouted} ` +
    `(FIRE=${output.FIRE.length} WATER=${output.WATER.length} ` +
    `AIR=${output.AIR.length} EARTH=${output.EARTH.length}) | ` +
    `Skipped types: [${meta.skippedTypes.join(', ') || 'none'}]`
  );
}
