import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// ── Inline vector math (ported from phantom-xo driftMath.ts) ──────────────────
type Vec2 = [number, number];

function add(a: Vec2, b: Vec2): Vec2 { return [a[0] + b[0], a[1] + b[1]]; }
function sub(a: Vec2, b: Vec2): Vec2 { return [a[0] - b[0], a[1] - b[1]]; }
function scale(v: Vec2, s: number): Vec2 { return [v[0] * s, v[1] * s]; }
function len(v: Vec2): number { return Math.sqrt(v[0] * v[0] + v[1] * v[1]); }
function normalize(v: Vec2): Vec2 { const l = len(v); return l === 0 ? [0, 0] : [v[0] / l, v[1] / l]; }
function perp(v: Vec2): Vec2 { return [-v[1], v[0]]; }
function dist(a: Vec2, b: Vec2): number { return len(sub(b, a)); }
function idw(d: number, radius: number): number { if (d >= radius) return 0; const r = 1 - d / radius; return r * r; }
function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)); }

function resample(coords: Vec2[], stepDeg: number): Vec2[] {
    if (coords.length < 2) return [...coords];
    const out: Vec2[] = [coords[0]!];
    let carry = 0;
    for (let i = 1; i < coords.length; i++) {
        const seg = sub(coords[i]!, coords[i - 1]!);
        const segLen = len(seg);
        if (segLen === 0) continue;
        const dir = normalize(seg);
        let pos = carry;
        while (pos + stepDeg <= segLen + 1e-12) { pos += stepDeg; out.push(add(coords[i - 1]!, scale(dir, pos))); }
        carry = pos - segLen;
    }
    const last = coords[coords.length - 1]!;
    if (dist(out[out.length - 1]!, last) > stepDeg * 0.1) out.push(last);
    return out;
}

function vectorVariance(vecs: Vec2[]): number {
    if (vecs.length === 0) return 0;
    const mags = vecs.map(len);
    const mean = mags.reduce((s, m) => s + m, 0) / mags.length;
    return mags.reduce((s, m) => s + (m - mean) ** 2, 0) / mags.length;
}

function meanBearing(vecs: Vec2[]): number {
    let sx = 0, sy = 0;
    for (const v of vecs) { sx += v[0]; sy += v[1]; }
    return ((Math.atan2(sx, sy) * 180) / Math.PI + 360) % 360;
}

function tangentAt(pts: Vec2[], i: number): Vec2 {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(pts.length - 1, i + 1)]!;
    return normalize(sub(next, prev));
}

// ── Config ─────────────────────────────────────────────────────────────────────
const RESAMPLE_DEG = 0.05;
const INFLUENCE_RADIUS_DEG = 1.5;
const FORMAL_ATTRACT_RADIUS = 0.8;
const SEASONAL = [0.7, 0.8, 1.2, 1.3, 1.2, 0.6, 0.5, 0.6, 0.9, 1.1, 1.2, 1.0];
const W = { conflict: 0.35, flow: 0.25, closure: 0.30, formal: 0.20, risk: 0.15 };
const RISK_FACTOR: Record<string, number> = { CRITICAL: 1.0, HIGH: 0.8, ELEVATED: 0.6, MODERATE: 0.4, LOW: 0.2 };

// ── Types ──────────────────────────────────────────────────────────────────────
interface EvidenceInput { lat: number; lng: number; score: number; signalType: string; }
interface DriftDriver { name: string; weight: number; signalCount: number; }
interface DriftStep {
    days: number;
    futureCorridor: { type: 'Feature'; properties: Record<string, number | string>; geometry: { type: 'LineString'; coordinates: number[][] } };
    confidence: number;
    activationLikelihood: number;
    avgMagnitudeKm: number;
    bearingDeg: number;
    drivers: DriftDriver[];
}

// ── Core drift computation (one time step) ─────────────────────────────────────
function computeStep(
    corridorId: string,
    corridorCoords: Vec2[],
    evidence: EvidenceInput[],
    formalCoords: Vec2[][],
    riskClass: string,
    driftScale: number,
): DriftStep['futureCorridor'] & { confidence: number; activationLikelihood: number; avgMagnitudeKm: number; bearingDeg: number; drivers: DriftDriver[] } {
    const seasonal = SEASONAL[new Date().getMonth()] ?? 1.0;
    const rv = RISK_FACTOR[riskClass] ?? 0.5;
    const pts = resample(corridorCoords, RESAMPLE_DEG);

    if (pts.length < 2) return {
        type: 'Feature', properties: { corridor_id: corridorId, confidence: 0 },
        geometry: { type: 'LineString', coordinates: [] },
        confidence: 0, activationLikelihood: 0, avgMagnitudeKm: 0, bearingDeg: 0, drivers: [],
    };

    const relevant = evidence.filter(s => pts.some(p => dist(p, [s.lng, s.lat]) < INFLUENCE_RADIUS_DEG));
    const flatFormal: Vec2[] = formalCoords.flat();
    let conflictCt = 0, flowCt = 0, closureCt = 0;
    const driftVectors: Vec2[] = [];

    for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const lateral = perp(tangentAt(pts, i));
        let v: Vec2 = [0, 0];

        for (const s of relevant) {
            const sp: Vec2 = [s.lng, s.lat];
            const w = idw(dist(p, sp), INFLUENCE_RADIUS_DEG);
            if (w <= 0) continue;
            const intensity = clamp(s.score / 100, 0, 1);
            const sig = s.signalType;

            if (sig === 'CONFLICT' || sig === 'MASSACRE') {
                v = add(v, scale(normalize(sub(p, sp)), w * intensity * W.conflict));
                if (i === 0) conflictCt++;
            } else if (sig === 'FLOW' || sig === 'CROSSING_SURGE' || sig === 'DISPLACEMENT') {
                v = add(v, scale(normalize(sub(sp, p)), w * intensity * W.flow));
                if (i === 0) flowCt++;
            } else if (sig === 'BORDER_CLOSURE' || sig === 'CROSSING_CLOSURE') {
                v = add(v, scale(lateral, w * intensity * W.closure));
                if (i === 0) closureCt++;
            }
        }

        if (flatFormal.length > 0) {
            let minD = Infinity, nearest = flatFormal[0]!;
            for (const fp of flatFormal) { const d = dist(p, fp); if (d < minD) { minD = d; nearest = fp; } }
            const w = idw(minD, FORMAL_ATTRACT_RADIUS);
            if (w > 0) v = add(v, scale(normalize(sub(nearest, p)), w * W.formal));
        }

        v = scale(v, (1 + rv * W.risk) * seasonal);
        driftVectors.push(v);
    }

    const confidence = clamp(1 - Math.sqrt(vectorVariance(driftVectors)) * 10, 0.05, 0.99);
    const avgMag = driftVectors.reduce((s, v) => s + len(v), 0) / driftVectors.length;
    const signalDensity = relevant.length / Math.max(pts.length, 1);
    const activationLikelihood = clamp(0.2 + signalDensity * 0.3 + rv * 0.25 + (1 - confidence) * 0.15, 0.05, 0.95);

    const futureCoords = pts.map((p, i) => add(p, scale(driftVectors[i]!, driftScale)));

    return {
        type: 'Feature',
        properties: { corridor_id: corridorId, confidence },
        geometry: { type: 'LineString', coordinates: futureCoords },
        confidence,
        activationLikelihood,
        avgMagnitudeKm: avgMag * 111.32,
        bearingDeg: meanBearing(driftVectors),
        drivers: [
            { name: 'Conflict pressure',    weight: W.conflict,  signalCount: conflictCt },
            { name: 'Flow attraction',       weight: W.flow,      signalCount: flowCt },
            { name: 'Closure deflection',    weight: W.closure,   signalCount: closureCt },
            { name: 'Formal route gravity',  weight: W.formal,    signalCount: flatFormal.length > 0 ? 1 : 0 },
            { name: 'Seasonal factor',       weight: seasonal,    signalCount: 0 },
            { name: 'Risk volatility',       weight: rv,          signalCount: 0 },
        ].sort((a, b) => b.weight - a.weight),
    };
}

// ── Static corridor definitions (mirrors live/route.ts geometry) ───────────────
// Evidence signalTypes mapped: HEALTH→health_signal, DISPLACEMENT→DISPLACEMENT,
// ENTROPY→CROSSING_SURGE (track scar = mobility evidence)
const STATIC: Record<string, { riskClass: string; pathCoords: { lat: number; lng: number }[]; evidence: EvidenceInput[] }> = {
    'CORRIDOR-CD-RW-001': {
        riskClass: 'HIGH',
        pathCoords: [{ lat: -1.66, lng: 29.21 }, { lat: -1.67, lng: 29.22 }, { lat: -1.68, lng: 29.24 }, { lat: -1.70, lng: 29.26 }],
        evidence: [
            { lat: -1.66, lng: 29.21, score: 95, signalType: 'DISPLACEMENT' },
            { lat: -1.67, lng: 29.22, score: 88, signalType: 'HEALTH_SIGNAL' },
            { lat: -1.70, lng: 29.26, score: 81, signalType: 'HEALTH_SIGNAL' },
        ],
    },
    'CORRIDOR-KE-TZ-047': {
        riskClass: 'HIGH',
        pathCoords: [{ lat: -1.234, lng: 34.567 }, { lat: -1.28, lng: 34.60 }, { lat: -1.345, lng: 34.678 }, { lat: -1.40, lng: 34.73 }, { lat: -1.456, lng: 34.789 }],
        evidence: [
            { lat: -1.234, lng: 34.567, score: 92, signalType: 'HEALTH_SIGNAL' },
            { lat: -1.345, lng: 34.678, score: 85, signalType: 'CROSSING_SURGE' },
            { lat: -1.456, lng: 34.789, score: 89, signalType: 'HEALTH_SIGNAL' },
        ],
    },
};

// ── GET /api/corridors/[corridor_id]/drift ─────────────────────────────────────
export async function GET(
    _req: Request,
    { params }: { params: { corridor_id: string } }
) {
    const { corridor_id } = params;
    const def = STATIC[corridor_id];
    if (!def) return NextResponse.json({ error: `Corridor ${corridor_id} not found` }, { status: 404 });

    const corridorCoords: Vec2[] = def.pathCoords.map(p => [p.lng, p.lat]);
    const start = corridorCoords[0]!;
    const end = corridorCoords[corridorCoords.length - 1]!;
    const formalCoords: Vec2[][] = [[start, end]];

    // T+3d / T+7d / T+14d — scale DRIFT_SCALE linearly with days (base = T+7 = 0.12)
    const TIME_STEPS = [
        { days: 3,  driftScale: 0.12 * (3 / 7)  },
        { days: 7,  driftScale: 0.12             },
        { days: 14, driftScale: 0.12 * 2.0       },
    ];

    const steps: DriftStep[] = TIME_STEPS.map(({ days, driftScale }) => {
        const r = computeStep(corridor_id, corridorCoords, def.evidence, formalCoords, def.riskClass, driftScale);
        const { type, properties, geometry, ...metrics } = r;
        return { days, futureCorridor: { type, properties, geometry }, ...metrics };
    });

    // T+7 step is the canonical reference for downstream decisions
    const canonical = steps[1]!;

    // Early-warning detection event when activationLikelihood crosses 0.7
    if (canonical.activationLikelihood > 0.7) {
        try {
            await sql`
                INSERT INTO poe_detection_events
                    (corridor_id, event_type, activation_likelihood, confidence, metadata)
                VALUES (
                    ${corridor_id},
                    'pre_activation_warning',
                    ${canonical.activationLikelihood},
                    ${canonical.confidence},
                    ${JSON.stringify({ drivers: canonical.drivers, bearingDeg: canonical.bearingDeg, avgMagnitudeKm: canonical.avgMagnitudeKm })}::jsonb
                )
            `;
        } catch { /* table may not exist — best-effort */ }
    }

    // Drift→logistics route invalidation:
    // build a bounding box around all drift steps + buffer, then
    // expire any logistics route whose waypoints fall within it
    try {
        const allCoords = steps.flatMap(s => s.futureCorridor.geometry.coordinates);
        if (allCoords.length > 0) {
            const lngs = allCoords.map(c => c[0]!);
            const lats = allCoords.map(c => c[1]!);
            const buffer = Math.max(canonical.avgMagnitudeKm / 111.32, 0.1);
            const minLng = Math.min(...lngs) - buffer;
            const maxLng = Math.max(...lngs) + buffer;
            const minLat = Math.min(...lats) - buffer;
            const maxLat = Math.max(...lats) + buffer;

            // Expire routes whose waypoints overlap the drift bounding box
            // valid_until = NOW() + confidence * 14 days (high confidence = shorter window before re-check)
            const confidenceDays = Math.round(canonical.confidence * 14);
            await sql`
                UPDATE logistics_routes
                SET valid_until = NOW() + (${confidenceDays} || ' days')::interval
                WHERE corridor_id = ${corridor_id}
                  AND classification != 'BLOCKED'
                  AND (valid_until IS NULL OR valid_until > NOW())
                  AND EXISTS (
                    SELECT 1 FROM logistics_waypoints w
                    WHERE w.route_id = logistics_routes.id
                      AND w.lng BETWEEN ${minLng} AND ${maxLng}
                      AND w.lat BETWEEN ${minLat} AND ${maxLat}
                  )
            `;
        }
    } catch { /* DB unavailable — skip invalidation */ }

    return NextResponse.json({
        corridorId: corridor_id,
        steps,
        activationLikelihood: canonical.activationLikelihood,
        confidence: canonical.confidence,
        avgMagnitudeKm: canonical.avgMagnitudeKm,
        bearingDeg: canonical.bearingDeg,
        drivers: canonical.drivers,
    });
}
