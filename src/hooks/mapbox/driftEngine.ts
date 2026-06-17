/**
 * Predictive Drift Engine — computes how phantom corridors may shift
 * based on evidence pressure (conflict, flows, closures), formal route
 * gravity, and seasonal modulation.
 *
 * Returns a drift field (vector arrows), a projected future corridor,
 * and per-corridor confidence + summary metrics.
 */

import {
  type Vec2,
  add, sub, scale, normalize, perp, len, dist, distKm,
  resample, idw, clamp, vectorVariance, meanBearing, bearing,
} from "./driftMath";
import type { EvidenceSignal } from "@/lib/temporalAdapter";

/* ── Config ── */

const RESAMPLE_DEG = 0.05;         // ~5.5 km spacing along corridor
const INFLUENCE_RADIUS_DEG = 1.5;  // ~167 km evidence influence radius
const FORMAL_ATTRACT_RADIUS = 0.8; // ~89 km formal-route attraction
const DRIFT_SCALE = 0.12;          // magnitude scaling for future corridor
const ARROW_SCALE = 0.04;          // visual arrow length

/** Seasonal multiplier by month (0-indexed Jan=0). Rainy seasons in E.Africa ≈ Mar-May, Oct-Dec. */
const SEASONAL: number[] = [
  0.7,  // Jan — dry
  0.8,  // Feb
  1.2,  // Mar — long rains begin
  1.3,  // Apr — peak long rains
  1.2,  // May
  0.6,  // Jun — dry
  0.5,  // Jul — dry
  0.6,  // Aug
  0.9,  // Sep
  1.1,  // Oct — short rains
  1.2,  // Nov
  1.0,  // Dec
];

/* ── Weights ── */

const W = {
  conflict: -0.35,  // repulsion (negative = push away)
  flow:      0.25,  // attraction toward high-flow
  closure:   0.30,  // lateral deflection
  formal:    0.20,  // attraction toward monitored routes
  risk:      0.15,  // higher risk = more volatile drift
};

/* ── Types ── */

export interface DriftArrow {
  from: Vec2;
  to: Vec2;
  magnitude: number;
}

export interface DriftDriver {
  name: string;
  weight: number;
  signalCount: number;
}

export interface DriftResult {
  corridorId: string;
  driftField: GeoJSON.FeatureCollection;
  futureCorridor: GeoJSON.Feature<GeoJSON.LineString>;
  confidence: number;
  avgMagnitudeKm: number;
  bearingDeg: number;
  drivers: DriftDriver[];
  activationLikelihood: number;
}

/* ── Helpers ── */

function signalIntensity(s: EvidenceSignal): number {
  return clamp(s.score / 100, 0, 1);
}

function isConflict(s: EvidenceSignal): boolean {
  return s.signalType.includes("CONFLICT") || s.signalType === "MASSACRE";
}

function isFlow(s: EvidenceSignal): boolean {
  return s.signalType === "FLOW" || s.signalType === "CROSSING_SURGE";
}

function isClosure(s: EvidenceSignal): boolean {
  return s.signalType === "BORDER_CLOSURE" || s.signalType === "CROSSING_CLOSURE";
}

/** Extract the tangent direction at index i along a resampled path. */
function tangentAt(pts: Vec2[], i: number): Vec2 {
  const prev = pts[Math.max(0, i - 1)];
  const next = pts[Math.min(pts.length - 1, i + 1)];
  return normalize(sub(next, prev));
}

/* ── Engine ── */

export function computeDrift(
  corridorId: string,
  corridorCoords: Vec2[],
  evidence: EvidenceSignal[],
  formalCoords: Vec2[][],         // array of formal route coord arrays
  riskClass: string,
): DriftResult {
  const month = new Date().getMonth();
  const seasonal = SEASONAL[month];

  // Risk volatility factor
  const riskFactor: Record<string, number> = {
    CRITICAL: 1.0, HIGH: 0.8, ELEVATED: 0.6, MODERATE: 0.4, LOW: 0.2,
  };
  const rv = riskFactor[riskClass] ?? 0.5;

  // Resample corridor
  const pts = resample(corridorCoords, RESAMPLE_DEG);
  if (pts.length < 2) {
    return emptyResult(corridorId);
  }

  // Filter evidence to signals near the corridor (broad box)
  const corridorRelevant = evidence.filter((s) => {
    const sp: Vec2 = [s.lng, s.lat];
    return pts.some((p) => dist(p, sp) < INFLUENCE_RADIUS_DEG);
  });

  // Precompute flat formal points for nearest-point queries
  const flatFormal: Vec2[] = formalCoords.flat();

  // Driver counters
  let conflictCount = 0;
  let flowCount = 0;
  let closureCount = 0;

  const driftVectors: Vec2[] = [];
  const arrows: DriftArrow[] = [];

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const tangent = tangentAt(pts, i);
    const lateral = perp(tangent);
    let v: Vec2 = [0, 0];

    // 1. Conflict repulsion
    for (const s of corridorRelevant) {
      if (!isConflict(s)) continue;
      const sp: Vec2 = [s.lng, s.lat];
      const d = dist(p, sp);
      const w = idw(d, INFLUENCE_RADIUS_DEG);
      if (w > 0) {
        // Push AWAY from conflict
        const dir = normalize(sub(p, sp));
        v = add(v, scale(dir, w * signalIntensity(s) * W.conflict * -1));
        if (i === 0) conflictCount++;
      }
    }

    // 2. Flow attraction
    for (const s of corridorRelevant) {
      if (!isFlow(s)) continue;
      const sp: Vec2 = [s.lng, s.lat];
      const d = dist(p, sp);
      const w = idw(d, INFLUENCE_RADIUS_DEG);
      if (w > 0) {
        // Pull TOWARD flow
        const dir = normalize(sub(sp, p));
        v = add(v, scale(dir, w * signalIntensity(s) * W.flow));
        if (i === 0) flowCount++;
      }
    }

    // 3. Closure deflection (lateral push)
    for (const s of corridorRelevant) {
      if (!isClosure(s)) continue;
      const sp: Vec2 = [s.lng, s.lat];
      const d = dist(p, sp);
      const w = idw(d, INFLUENCE_RADIUS_DEG);
      if (w > 0) {
        // Push laterally
        v = add(v, scale(lateral, w * signalIntensity(s) * W.closure));
        if (i === 0) closureCount++;
      }
    }

    // 4. Formal route attraction
    if (flatFormal.length > 0) {
      let minD = Infinity;
      let nearest: Vec2 = flatFormal[0];
      for (const fp of flatFormal) {
        const d = dist(p, fp);
        if (d < minD) { minD = d; nearest = fp; }
      }
      const w = idw(minD, FORMAL_ATTRACT_RADIUS);
      if (w > 0) {
        const dir = normalize(sub(nearest, p));
        v = add(v, scale(dir, w * W.formal));
      }
    }

    // 5. Risk volatility amplification
    v = scale(v, 1 + rv * W.risk);

    // 6. Seasonal modulation
    v = scale(v, seasonal);

    driftVectors.push(v);

    const mag = len(v);
    const arrowEnd = add(p, scale(v, ARROW_SCALE / Math.max(mag, 0.001)));
    arrows.push({ from: p, to: arrowEnd, magnitude: mag });
  }

  // Compute summary metrics
  const variance = vectorVariance(driftVectors);
  const confidence = clamp(1 - Math.sqrt(variance) * 10, 0.05, 0.99);
  const avgMag = driftVectors.reduce((s, v) => s + len(v), 0) / driftVectors.length;
  const avgMagKm = avgMag * 111.32; // rough deg-to-km
  const bearingDeg = meanBearing(driftVectors);

  // Activation likelihood: based on conflict density + flow intensity + risk
  const signalDensity = corridorRelevant.length / Math.max(pts.length, 1);
  const activationLikelihood = clamp(
    0.2 + signalDensity * 0.3 + rv * 0.25 + (1 - confidence) * 0.15,
    0.05,
    0.95,
  );

  // Build drift field GeoJSON
  const driftField: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: arrows.map((a) => ({
      type: "Feature" as const,
      properties: { magnitude: a.magnitude },
      geometry: {
        type: "LineString" as const,
        coordinates: [a.from, a.to],
      },
    })),
  };

  // Build future corridor
  const futureCoords = pts.map((p, i) =>
    add(p, scale(driftVectors[i], DRIFT_SCALE)),
  );

  const futureCorridor: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    properties: { corridor_id: corridorId, confidence },
    geometry: { type: "LineString", coordinates: futureCoords },
  };

  // Drivers summary
  const drivers: DriftDriver[] = [
    { name: "Conflict pressure", weight: Math.abs(W.conflict), signalCount: conflictCount },
    { name: "Flow attraction", weight: W.flow, signalCount: flowCount },
    { name: "Closure deflection", weight: W.closure, signalCount: closureCount },
    { name: "Formal route gravity", weight: W.formal, signalCount: flatFormal.length > 0 ? 1 : 0 },
    { name: "Seasonal factor", weight: seasonal, signalCount: 0 },
    { name: "Risk volatility", weight: rv, signalCount: 0 },
  ].sort((a, b) => b.weight - a.weight);

  return {
    corridorId,
    driftField,
    futureCorridor,
    confidence,
    avgMagnitudeKm: avgMagKm,
    bearingDeg,
    drivers,
    activationLikelihood,
  };
}

function emptyResult(corridorId: string): DriftResult {
  return {
    corridorId,
    driftField: { type: "FeatureCollection", features: [] },
    futureCorridor: {
      type: "Feature",
      properties: { corridor_id: corridorId, confidence: 0 },
      geometry: { type: "LineString", coordinates: [] },
    },
    confidence: 0,
    avgMagnitudeKm: 0,
    bearingDeg: 0,
    drivers: [],
    activationLikelihood: 0,
  };
}
