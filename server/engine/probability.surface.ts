/**
 * ◉⟁⬡  Phantom POE — Probability Surface Engine
 *
 * Defines an 8 km grid over the Koboko-Arua bounding box and fuses
 * arriving HeartbeatSignal records into per-cell posterior probabilities
 * via the `phantomPosterior` Bayesian update:
 *
 *   p' = p + (1 - p) × influence × weight_m
 *
 * When evidence for a cell is older than 3τ_m it decays toward q_m
 * (the baseline probability for that source) rather than going negative:
 *
 *   p_decayed = q_m + (p - q_m) × exp(-Δt / τ_m)
 *
 * Grid dimensions:
 *   Koboko-Arua box: SW=[3.00, 30.85] NE=[3.50, 31.05]
 *   Cell size ≈ 8 km → 0.072° of latitude
 *   Grid: ~7 columns × ~3 rows = ~21 cells
 */

import type { HeartbeatSignal, SourceClass } from './heartbeat.ingest';
import { KOBOKO_ARUA_BOX } from './heartbeat.ingest';

/* ─── Constants ─── */

const CELL_DEG = 0.072; // ≈ 8 km at this latitude

/** Baseline prior probability q_m per source class */
const Q_M: Record<SourceClass, number> = {
  GDELT:     0.08, // media conflict signals
  GDACS:     0.05, // disaster alerts
  RELIEFWEB: 0.10, // humanitarian reports
  IMERG:     0.06, // precipitation / flood
  FIRMS:     0.04, // active fire
};

/** Source weight — how much each source nudges the posterior */
const SOURCE_WEIGHT: Record<SourceClass, number> = {
  GDELT:     0.25,
  GDACS:     0.40, // higher — official disaster agency
  RELIEFWEB: 0.20,
  IMERG:     0.30,
  FIRMS:     0.35,
};

/** Spatial influence radius in degrees (~40 km) */
const INFLUENCE_RADIUS_DEG = 0.36;

/* ─── Types ─── */

export interface GridCell {
  cellId: string;      // "col:row"
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
  latCenter: number;
  lngCenter: number;
  posterior: number;   // current fused P [0,1]
  qBaseline: number;   // running q_m composite
  contributingSourcesMask: Set<SourceClass>;
  lastEvidenceAt: number | null; // Date.now() ms
  evidenceCount: number;
}

export interface SurfaceSnapshot {
  cells: GridCell[];
  generatedAt: string;
  totalSignalsFused: number;
  highestCell: { cellId: string; posterior: number } | null;
}

/* ─── Grid Construction ─── */

function buildGrid(): GridCell[] {
  const cells: GridCell[] = [];

  const latSteps = Math.ceil((KOBOKO_ARUA_BOX.neLat - KOBOKO_ARUA_BOX.swLat) / CELL_DEG);
  const lngSteps = Math.ceil((KOBOKO_ARUA_BOX.neLng - KOBOKO_ARUA_BOX.swLng) / CELL_DEG);

  for (let row = 0; row < latSteps; row++) {
    for (let col = 0; col < lngSteps; col++) {
      const latMin = KOBOKO_ARUA_BOX.swLat + row * CELL_DEG;
      const lngMin = KOBOKO_ARUA_BOX.swLng + col * CELL_DEG;
      cells.push({
        cellId: `${col}:${row}`,
        latMin,
        latMax: latMin + CELL_DEG,
        lngMin,
        lngMax: lngMin + CELL_DEG,
        latCenter: latMin + CELL_DEG / 2,
        lngCenter: lngMin + CELL_DEG / 2,
        posterior: 0.10,         // uninformed prior
        qBaseline: 0.10,
        contributingSourcesMask: new Set(),
        lastEvidenceAt: null,
        evidenceCount: 0,
      });
    }
  }

  return cells;
}

/* ─── Probability Surface ─── */

export class ProbabilitySurface {
  private cells: GridCell[];
  private totalFused = 0;

  constructor() {
    this.cells = buildGrid();
    console.log(`[ProbSurface] Grid built: ${this.cells.length} cells (8km) over Koboko-Arua`);
  }

  /**
   * Fuse a batch of HeartbeatSignals into the grid.
   * Signals without lat/lng are not spatially placed but update qBaseline.
   */
  fuse(signals: HeartbeatSignal[]): void {
    const now = Date.now();

    for (const sig of signals) {
      this.totalFused++;

      // 1. Decay all cells first
      this.decayAll(now);

      // 2. Spatial update — only for signals with coordinates
      if (sig.lat != null && sig.lng != null) {
        for (const cell of this.cells) {
          const dist = this.haversineDistDeg(
            sig.lat, sig.lng,
            cell.latCenter, cell.lngCenter
          );

          if (dist > INFLUENCE_RADIUS_DEG) continue;

          // Gaussian-shaped influence that falls to ~0 at boundary
          const influence = sig.magnitude * Math.exp(-0.5 * (dist / (INFLUENCE_RADIUS_DEG / 3)) ** 2);
          const weight = SOURCE_WEIGHT[sig.source];

          // phantomPosterior update
          cell.posterior = this.phantomPosterior(cell.posterior, influence, weight);
          cell.contributingSourcesMask.add(sig.source);
          cell.lastEvidenceAt = now;
          cell.evidenceCount++;
        }
      }

      // 3. Update baseline q_m for all cells regardless of coords
      const q = Q_M[sig.source];
      const w = SOURCE_WEIGHT[sig.source];
      for (const cell of this.cells) {
        cell.qBaseline = cell.qBaseline * (1 - 0.05 * w) + q * 0.05 * w;
      }
    }
  }

  /**
   * phantomPosterior Bayesian nudge
   * p' = p + (1-p) × influence × weight
   */
  private phantomPosterior(p: number, influence: number, weight: number): number {
    const updated = p + (1 - p) * influence * weight;
    return Math.max(0, Math.min(1, updated));
  }

  /**
   * Decay all cells toward their q_m baseline.
   * Only decays cells with evidence older than τ_m.
   */
  private decayAll(now: number): void {
    for (const cell of this.cells) {
      if (cell.lastEvidenceAt == null) continue;

      const ageS = (now - cell.lastEvidenceAt) / 1000;
      // Use the shortest τ among contributing sources as the decay rate
      let minTau = 12 * 3600;
      for (const src of cell.contributingSourcesMask) {
        const tau = {
          GDELT:     45 * 60,
          GDACS:     18 * 60,
          RELIEFWEB:  6 * 3600,
          IMERG:      2 * 3600,
          FIRMS:     12 * 3600,
        }[src];
        if (tau < minTau) minTau = tau;
      }

      // p_decayed = q + (p - q) × exp(-Δt / τ)
      const q = cell.qBaseline;
      const decayFactor = Math.exp(-ageS / minTau);
      cell.posterior = q + (cell.posterior - q) * decayFactor;
      // Clamp to baseline — never goes negative
      if (cell.posterior < q) cell.posterior = q;
    }
  }

  /** Get snapshot of the full surface */
  getSnapshot(): SurfaceSnapshot {
    let highest: { cellId: string; posterior: number } | null = null;
    for (const c of this.cells) {
      if (!highest || c.posterior > highest.posterior) {
        highest = { cellId: c.cellId, posterior: c.posterior };
      }
    }
    return {
      cells: this.cells.map((c) => ({ ...c, contributingSourcesMask: new Set(c.contributingSourcesMask) })),
      generatedAt: new Date().toISOString(),
      totalSignalsFused: this.totalFused,
      highestCell: highest,
    };
  }

  /** Get a single cell by id */
  getCell(cellId: string): GridCell | undefined {
    return this.cells.find((c) => c.cellId === cellId);
  }

  /** Serialise the surface for Neo4j / API response */
  toJSON(): Array<{
    cellId: string;
    latCenter: number;
    lngCenter: number;
    posterior: number;
    qBaseline: number;
    contributingSources: string[];
    lastEvidenceAt: string | null;
    evidenceCount: number;
  }> {
    return this.cells.map((c) => ({
      cellId: c.cellId,
      latCenter: c.latCenter,
      lngCenter: c.lngCenter,
      posterior: Math.round(c.posterior * 1000) / 1000,
      qBaseline: Math.round(c.qBaseline * 1000) / 1000,
      contributingSources: [...c.contributingSourcesMask],
      lastEvidenceAt: c.lastEvidenceAt ? new Date(c.lastEvidenceAt).toISOString() : null,
      evidenceCount: c.evidenceCount,
    }));
  }

  /* ─── Spatial helpers ─── */

  /**
   * Approximate great-circle distance in degrees (suitable for small AOI)
   */
  private haversineDistDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const dLat = Math.abs(lat1 - lat2);
    const dLng = Math.abs(lng1 - lng2);
    // Use simple Euclidean in degree-space for this small box (<1° span)
    return Math.sqrt(dLat * dLat + dLng * dLng);
  }
}

// Singleton surface instance
let _surface: ProbabilitySurface | null = null;

export function getProbabilitySurface(): ProbabilitySurface {
  if (!_surface) {
    _surface = new ProbabilitySurface();
  }
  return _surface;
}
