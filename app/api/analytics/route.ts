import { NextResponse } from 'next/server';

/**
 * GET /api/analytics
 *
 * Aggregates corridor + evidence data into detection analytics numbers.
 * Pulls from /api/corridors/live (which already handles Neon → static fallback).
 */
export async function GET(req: Request) {
  try {
    // Derive the base URL from the incoming request so this works on any host
    const origin = new URL(req.url).origin;
    const res = await fetch(`${origin}/api/corridors/live`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`live route returned ${res.status}`);
    const { corridors = [] } = await res.json();

    // ---- Hero numbers ----------------------------------------
    const totalCorridors = corridors.length;
    const totalEvidence = corridors.reduce((a: number, c: any) => a + (c.evidence?.length ?? 0), 0);
    const avgScore =
      corridors.length
        ? corridors.reduce((a: number, c: any) => a + (c.score ?? 0), 0) / corridors.length
        : 0;
    const totalKm = corridors.reduce((a: number, c: any) => a + (c.totalKm ?? 0), 0);

    // ---- Signal type breakdown --------------------------------
    const sigTypeCounts: Record<string, number> = {};
    const sigTypeScores: Record<string, number[]> = {};
    for (const corridor of corridors) {
      for (const ev of corridor.evidence ?? []) {
        const t: string = ev.type ?? 'UNKNOWN';
        sigTypeCounts[t] = (sigTypeCounts[t] ?? 0) + 1;
        if (!sigTypeScores[t]) sigTypeScores[t] = [];
        sigTypeScores[t].push(ev.score ?? 0);
      }
    }
    const signalTypes = Object.entries(sigTypeCounts)
      .map(([type, count]) => ({
        type,
        count,
        avgScore:
          sigTypeScores[type]!.reduce((a, b) => a + b, 0) / sigTypeScores[type]!.length,
      }))
      .sort((a, b) => b.count - a.count);

    // ---- Risk distribution -----------------------------------
    const riskBuckets: Record<string, number> = {
      CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0,
    };
    for (const c of corridors) {
      const s = c.score ?? 0;
      if (s >= 0.85) riskBuckets['CRITICAL']!++;
      else if (s >= 0.70) riskBuckets['HIGH']!++;
      else if (s >= 0.50) riskBuckets['MEDIUM']!++;
      else riskBuckets['LOW']!++;
    }

    // ---- Per-corridor rows -----------------------------------
    const corridorRows = corridors.map((c: any) => ({
      id: c.id,
      short: c.short,
      region: c.region,
      score: c.score ?? 0,
      riskClass:
        c.riskClass ??
        (c.score >= 0.85
          ? 'CRITICAL'
          : c.score >= 0.70
          ? 'HIGH'
          : c.score >= 0.50
          ? 'MEDIUM'
          : 'LOW'),
      mode: c.mode,
      totalKm: c.totalKm,
      velocity: c.velocity,
      evidenceCount: c.evidence?.length ?? 0,
      gapZone: c.gapZone ?? false,
      startCC: c.startCC,
      endCC: c.endCC,
    }));

    // ---- 7-day activity timeline from evidence.day ----------
    const dayBuckets: Record<number, number> = {};
    for (const corridor of corridors) {
      for (const ev of corridor.evidence ?? []) {
        const d = Number(ev.day ?? 0);
        dayBuckets[d] = (dayBuckets[d] ?? 0) + 1;
      }
    }
    const timeline = Array.from({ length: 7 }, (_, i) => ({
      day: i + 1,
      label: `Day ${i + 1}`,
      signals: dayBuckets[i + 1] ?? 0,
    }));

    // ---- Source breakdown ------------------------------------
    const sourceCounts: Record<string, number> = {};
    for (const c of corridors) {
      for (const ev of c.evidence ?? []) {
        const s: string = ev.source ?? 'UNKNOWN';
        sourceCounts[s] = (sourceCounts[s] ?? 0) + 1;
      }
    }
    const sources = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    // ---- Engine soul averages (across corridors that have souls) ---
    const soulAccum: Record<string, number[]> = {};
    for (const c of corridors) {
      for (const soul of c.souls ?? []) {
        if (!soulAccum[soul.key]) soulAccum[soul.key] = [];
        soulAccum[soul.key].push(soul.value ?? 0);
      }
    }
    const soulAverages = Object.entries(soulAccum).map(([key, vals]) => ({
      key,
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    }));

    return NextResponse.json({
      hero: { totalCorridors, totalEvidence, avgScore, totalKm },
      signalTypes,
      riskBuckets,
      corridorRows,
      timeline,
      sources,
      soulAverages,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[api/analytics] failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
