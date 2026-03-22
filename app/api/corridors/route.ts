import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import type { EvidenceType } from '@/src/services/intelligence';

export async function POST(req: NextRequest) {
  const env = serverEnv();

  try {
    const body = await req.json();
    const { corridorId, locationA, locationB, lat, lng, useLiveSentinel } = body;

    if (!corridorId || !locationA || !locationB) {
      return NextResponse.json({ error: 'Missing corridorId, locationA, or locationB' }, { status: 400 });
    }

    // Import intelligence engine (server-only)
    const { ExplainabilityEngine } = await import('@/src/services/intelligence');

    let liveSignals: string[] = [];
    let liveEvidence: Array<{
      evidenceType: EvidenceType;
      description: string;
      weight: number;
      source: string;
      sourceRecordId: string;
      confidence: number;
      timestamp: string;
      nodeIds: string[];
    }> = [];

    // Fetch live signals if requested
    if (useLiveSentinel && lat && lng) {
      try {
        const baseUrl = env.AFRO_SENTINEL_API_URL ?? 'https://afro-sentinel.vercel.app/';
        const url = new URL('/api/signals', baseUrl);
        url.searchParams.set('lat', String(lat));
        url.searchParams.set('lng', String(lng));
        url.searchParams.set('radius', '50');

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const token = env.AFRO_SENTINEL_OIDC_TOKEN;
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(10_000) });
        if (res.ok) {
          const data = await res.json();
          const signals = data.signals ?? [];
          liveSignals = signals.map((s: { description: string }) => s.description);
          liveEvidence = signals.map((s: { type: string; description: string; weight: number; source: string; id: string; confidence: number; timestamp: string }) => ({
            evidenceType: s.type as EvidenceType,
            description: s.description,
            weight: s.weight,
            source: s.source,
            sourceRecordId: s.id,
            confidence: s.confidence,
            timestamp: s.timestamp,
            nodeIds: [locationA, locationB],
          }));
        }
      } catch {
        // Sentinel fetch is best-effort
      }
    }

    const startCoord = { lat: lat ?? -1.234, lng: lng ?? 34.567 };
    const endCoord = { lat: (lat ?? -1.234) - 0.2, lng: (lng ?? 34.567) + 0.2 };
    const signalHistory = body.signalHistory ?? [0.05, 0.12, 0.38, 0.62, 0.78];
    const velocity = body.velocity ?? 18;
    const terrainFriction = body.terrainFriction ?? 0.5;

    const engine = new ExplainabilityEngine();
    const score = engine.synthesizeCorridorScore({
      runId: `run-${Date.now()}`,
      corridorId,
      startNode: locationA,
      endNode: locationB,
      gravityScore: 0.75,
      diffusionScore: 0.68,
      centralityScore: 0.82,
      hmmScore: 0,
      seasonalScore: 0.85,
      linguisticScore: 0.45,
      entropyScore: 0.62,
      frictionScore: 1 - terrainFriction,
      evidence: [
        ...liveEvidence,
        {
          evidenceType: 'health_signal' as const,
          description: 'Disease Signal (Cholera-adjacent)',
          weight: 0.8,
          source: 'AFRO Sentinel',
          sourceRecordId: `SIG-AFRO-${Date.now()}`,
          confidence: 0.88,
          timestamp: new Date().toISOString(),
          nodeIds: [locationA, locationB],
        },
      ],
      inferredVelocityKmh: velocity / 24,
      seasonallyActive: true,
      requiresCanoe: false,
      conflictDetour: false,
      signalHistory,
      frictionContext: { slopeDeg: 5, landCover: 'open_ground' as never },
      startCoord,
      endCoord,
      locationSignals: [
        { lat: startCoord.lat, lng: startCoord.lng, confidence: 0.9 },
        { lat: endCoord.lat, lng: endCoord.lng, confidence: 0.85 },
      ],
      previousSignalHistory: signalHistory.map((h: number) => h * 0.8),
    });

    return NextResponse.json({
      corridorId: score.corridorId,
      score: score.corridorScore,
      riskClass: score.riskClass,
      latentState: score.latentState,
      activated: score.phantomPoeActivated,
      inferredMode: score.inferredMode,
      scoreDecomposition: score.scoreDecomposition,
      traceLines: score.traceLines,
      liveSignals,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { CorridorService } = await import('@/src/services/corridor');
    const service = new CorridorService();
    const items = await service.getAllCorridors();

    return NextResponse.json({
      items,
      source: 'live',
      status: items.length > 0 ? 'active_corridors_detected' : 'no_live_corridors',
      message: items.length > 0 ? `${items.length} corridors retrieved.` : 'No live corridor records available',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
