/**
 * Drift Engine — Pure vector math utilities.
 * All positions are [lng, lat] (GeoJSON order).
 */

export type Vec2 = [number, number];

const DEG_TO_M = 111_320; // approx metres per degree at equator

export function add(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

export function scale(v: Vec2, s: number): Vec2 {
  return [v[0] * s, v[1] * s];
}

export function len(v: Vec2): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
}

export function normalize(v: Vec2): Vec2 {
  const l = len(v);
  return l === 0 ? [0, 0] : [v[0] / l, v[1] / l];
}

/** Perpendicular (rotated 90° CCW). */
export function perp(v: Vec2): Vec2 {
  return [-v[1], v[0]];
}

/** Distance in degrees between two positions. */
export function dist(a: Vec2, b: Vec2): number {
  return len(sub(b, a));
}

/** Distance in approximate km. */
export function distKm(a: Vec2, b: Vec2): number {
  const d = sub(b, a);
  const latAvg = (a[1] + b[1]) / 2;
  const mx = d[0] * DEG_TO_M * Math.cos((latAvg * Math.PI) / 180);
  const my = d[1] * DEG_TO_M;
  return Math.sqrt(mx * mx + my * my) / 1000;
}

/** Bearing from a to b in degrees (0 = north, clockwise). */
export function bearing(a: Vec2, b: Vec2): number {
  const d = sub(b, a);
  const rad = Math.atan2(d[0], d[1]);
  return ((rad * 180) / Math.PI + 360) % 360;
}

/** Resample a LineString to roughly `stepDeg` spacing (in degrees). */
export function resample(coords: Vec2[], stepDeg: number): Vec2[] {
  if (coords.length < 2) return [...coords];
  const out: Vec2[] = [coords[0]];
  let carry = 0;

  for (let i = 1; i < coords.length; i++) {
    const seg = sub(coords[i], coords[i - 1]);
    const segLen = len(seg);
    if (segLen === 0) continue;
    const dir = normalize(seg);
    let pos = carry;

    while (pos + stepDeg <= segLen + 1e-12) {
      pos += stepDeg;
      out.push(add(coords[i - 1], scale(dir, pos)));
    }
    carry = pos - segLen;
  }

  // always include the last point
  const last = coords[coords.length - 1];
  if (dist(out[out.length - 1], last) > stepDeg * 0.1) {
    out.push(last);
  }
  return out;
}

/** Inverse-distance weight: strong near, zero far. */
export function idw(d: number, radius: number): number {
  if (d >= radius) return 0;
  const ratio = 1 - d / radius;
  return ratio * ratio; // squared falloff
}

/** Clamp a number to [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Variance of vector magnitudes — low variance = high confidence. */
export function vectorVariance(vecs: Vec2[]): number {
  if (vecs.length === 0) return 0;
  const mags = vecs.map(len);
  const mean = mags.reduce((s, m) => s + m, 0) / mags.length;
  const sumSq = mags.reduce((s, m) => s + (m - mean) ** 2, 0);
  return sumSq / mags.length;
}

/** Mean bearing of a set of vectors (circular mean). */
export function meanBearing(vecs: Vec2[]): number {
  let sx = 0, sy = 0;
  for (const v of vecs) { sx += v[0]; sy += v[1]; }
  return ((Math.atan2(sx, sy) * 180) / Math.PI + 360) % 360;
}
