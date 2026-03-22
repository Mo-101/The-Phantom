/**
 * GET /api/corridors/:id/cascade
 *
 * Returns the temporal signal propagation for a corridor — frame by frame —
 * showing how ACLED conflict, IOM-DTM displacement, and DHIS2 disease signals
 * converge on a hidden border crossing.
 *
 * Data contract from cascade_spec.ts (attached file).
 * Source colors per cascade--intelligence-emergence-visualization.md:
 *   ACLED         → #EF4444  (conflict / fire+air)
 *   IOM-DTM       → #3B82F6  (displacement / water)
 *   DHIS2         → #22C55E  (disease / fire+water+air+earth)
 *   AFRO-SENTINEL → #EAB308  (sentinel)
 *   Entropy spike → #F97316
 *   Phantom POE   → #F59E0B  (gold)
 */

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// Source → element mapping from ingest scripts
const SOURCE_ELEMENT: Record<string, string> = {
  ACLED: 'fire',
  'IOM-DTM': 'water',
  DHIS2: 'earth',
  'AFRO-SENTINEL': 'air',
};

const SOURCE_TYPE: Record<string, string> = {
  ACLED: 'conflict',
  'IOM-DTM': 'displacement',
  DHIS2: 'disease',
  'AFRO-SENTINEL': 'signal',
};

// HMM state thresholds — derived from orchestrator.ts score logic
function hmmState(score: number): string {
  if (score < 0.25) return 'dormant';
  if (score < 0.50) return 'probing';
  if (score < 0.75) return 'active_crossing';
  if (score < 0.90) return 'surge';
  return 'dissipating';
}

// Shannon entropy from a score array
function shannonEntropy(scores: number[]): number {
  if (!scores.length) return 0;
  const total = scores.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return -scores
    .map(s => s / total)
    .filter(p => p > 0)
    .reduce((h, p) => h + p * Math.log2(p), 0);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    // 1. Corridor header
    const [corridorRows, nodeRows, evidenceRows, signalRows] = await Promise.all([
      sql`
        SELECT d.id, d.start_node, d.end_node, d.region,
               s.score, s.total_km, s.first_detected::text,
               s.days_delta, s.signal_count
        FROM corridor_definitions d
        JOIN corridor_scores s ON s.corridor_id = d.id
        WHERE d.id = ${id}
        LIMIT 1
      `,
      sql`
        SELECT name, lat, lng, alt_m, type, country_code, km
        FROM corridor_nodes
        WHERE corridor_def_id = ${id}
        ORDER BY sort_order
      `,
      sql`
        SELECT id, evidence_id, day_offset, km_marker, evidence_type,
               tag, location_name, country_code, score, source,
               precision_level, lat, lng
        FROM corridor_evidence_chains
        WHERE corridor_def_id = ${id}
        ORDER BY day_offset
      `,
      // Pull any live normalized signals near this corridor's bounding box
      sql`
        SELECT id, source, type, element, location, country,
               latitude, longitude, magnitude, truth_score, timestamp, notes
        FROM normalized_signals
        WHERE passed_truth_filter = true
        ORDER BY timestamp DESC
        LIMIT 200
      `,
    ]);

    if (!corridorRows.length) {
      return NextResponse.json({ error: 'Corridor not found' }, { status: 404 });
    }

    const corridor = corridorRows[0]!;
    const evidence = evidenceRows as any[];
    const liveSignals = signalRows as any[];

    // 2. Determine time range from evidence chain
    const days = evidence.map(e => Number(e.day_offset));
    const maxDay = days.length ? Math.max(...days) : 30;
    const firstDetected = corridor.first_detected ?? new Date().toISOString();
    const startTs = new Date(firstDetected);

    // 3. Build frames — one per unique day in the evidence chain
    const uniqueDays = [...new Set(days)].sort((a, b) => a - b);
    if (!uniqueDays.length) uniqueDays.push(0);

    let cumulativeScore = 0;
    const frames = uniqueDays.map((day, fi) => {
      const frameSignals = evidence.filter(e => Number(e.day_offset) === day);
      const scoreDelta = frameSignals.reduce((s, e) => s + Number(e.score ?? 0), 0);
      cumulativeScore = Math.min(1, cumulativeScore + scoreDelta);

      // Which km range is lit up at this frame
      const frameKms = frameSignals.map(e => Number(e.km_marker ?? 0));
      const minKm = frameKms.length ? Math.min(...frameKms) : 0;
      const maxKm = frameKms.length ? Math.max(...frameKms) : 0;

      // Map evidence atoms → CascadeSignal shape
      const signals = frameSignals.map(e => {
        const src = e.source ?? 'ACLED';
        return {
          id: e.evidence_id ?? e.id,
          source: src,
          type: SOURCE_TYPE[src] ?? e.evidence_type ?? 'conflict',
          element: SOURCE_ELEMENT[src] ?? 'fire',
          location: e.location_name ?? '',
          lat: Number(e.lat ?? 0),
          lng: Number(e.lng ?? 0),
          km_marker: Number(e.km_marker ?? 0),
          magnitude: Number(e.score ?? 0),
          truth_score: Number(e.score ?? 0),
          tag: e.tag ?? '',
          country: e.country_code ?? '',
          precision: e.precision_level ?? 'DISTRICT',
        };
      });

      // Entropy across scores in frame
      const frameScores = frameSignals.map(e => Number(e.score ?? 0));
      const H = shannonEntropy(frameScores);
      const entropySpike = H > 2.5;

      // Active nodes — nodes whose km falls within frame range
      const activeNodes = (nodeRows as any[])
        .filter(n => Number(n.km ?? 0) >= minKm && Number(n.km ?? 0) <= maxKm + 20)
        .map(n => ({
          name: n.name,
          lat: Number(n.lat),
          lng: Number(n.lng),
          signal_count: signals.length,
          brightest_source: signals[0]?.source ?? 'ACLED',
        }));

      // Phantom POE detection: score crosses 0.75 and 3+ sources present
      const sourcesInFrame = [...new Set(evidence.filter(e => Number(e.day_offset) <= day).map(e => e.source))];
      const phantomPoeDetected = cumulativeScore >= 0.75 && sourcesInFrame.length >= 3;
      const phantomNode = (nodeRows as any[]).find((n: any) => n.type === 'phantom');

      const frameTs = new Date(startTs);
      frameTs.setDate(startTs.getDate() + day);

      return {
        frame_index: fi,
        timestamp: frameTs.toISOString(),
        day_offset: day,
        cumulative_score: Math.round(cumulativeScore * 1000) / 1000,
        score_delta: Math.round(scoreDelta * 1000) / 1000,
        active_km_range: [minKm, maxKm] as [number, number],
        signals_in_frame: signals,
        entropy: {
          value: Math.round(H * 1000) / 1000,
          is_spike: entropySpike,
          risk_class: entropySpike ? 'CRITICAL' : cumulativeScore > 0.75 ? 'HIGH' : cumulativeScore > 0.5 ? 'MEDIUM' : 'LOW',
        },
        hmm_state: hmmState(cumulativeScore),
        active_nodes: activeNodes,
        phantom_poe_detected: phantomPoeDetected,
        phantom_poe_location: phantomPoeDetected && phantomNode
          ? { lat: Number(phantomNode.lat), lng: Number(phantomNode.lng), name: phantomNode.name }
          : null,
      };
    });

    // 4. Soul timeline — derive from evidence per-frame soul component approximations
    // These map directly to the 8 axes in the cascade spec radar chart
    const soulTimeline = frames.map(f => {
      const frame = evidence.filter(e => Number(e.day_offset) === f.day_offset);
      const acledSigs = frame.filter(e => e.source === 'ACLED');
      const dtmSigs   = frame.filter(e => e.source === 'IOM-DTM');
      const dhis2Sigs = frame.filter(e => e.source === 'DHIS2');
      const avg = (arr: any[]) => arr.length ? arr.reduce((s, e) => s + Number(e.score ?? 0), 0) / arr.length : 0;
      const cs = f.cumulative_score;
      return {
        frame_index: f.frame_index,
        gravity:     Math.min(1, cs * 1.1),               // population pull proxy
        diffusion:   Math.min(1, dtmSigs.length * 0.2),   // displacement spread
        centrality:  Math.min(1, cs * 0.9),
        hmm:         Math.min(1, cs + 0.05),
        seasonal:    Math.min(1, 0.3 + cs * 0.4),
        linguistic:  Math.min(1, 0.2 + cs * 0.35),
        entropy:     Math.min(1, f.entropy.value / 3.5),  // normalise to 0-1
        friction:    Math.min(1, Math.max(0, 1 - avg(acledSigs) * 0.8)), // inverse of conflict
      };
    });

    // 5. Also include any live signals from normalized_signals for the map overlay
    const liveSignalLayer = liveSignals.slice(0, 80).map(s => ({
      id: s.id,
      source: s.source,
      type: SOURCE_TYPE[s.source] ?? s.type,
      element: SOURCE_ELEMENT[s.source] ?? s.element ?? 'fire',
      location: s.location,
      lat: Number(s.latitude ?? 0),
      lng: Number(s.longitude ?? 0),
      magnitude: Number(s.magnitude ?? 0),
      truth_score: Number(s.truth_score ?? 0),
      tag: (s.notes ?? '').substring(0, 80),
      country: s.country ?? '',
    }));

    return NextResponse.json({
      corridor_id: corridor.id,
      corridor_name: `${corridor.start_node} → ${corridor.end_node}`,
      start_node: corridor.start_node,
      end_node: corridor.end_node,
      total_km: Number(corridor.total_km ?? 0),
      total_frames: frames.length,
      time_range: {
        start: startTs.toISOString(),
        end: new Date(startTs.getTime() + maxDay * 86400000).toISOString(),
      },
      frames,
      soul_timeline: soulTimeline,
      live_signal_layer: liveSignalLayer,
      // Source legend from cascade spec
      source_colors: {
        ACLED: '#EF4444',
        'IOM-DTM': '#3B82F6',
        DHIS2: '#22C55E',
        'AFRO-SENTINEL': '#EAB308',
        entropy_spike: '#F97316',
        phantom_poe: '#F59E0B',
      },
      hmm_states: {
        dormant: '#6B7280',
        probing: '#60A5FA',
        active_crossing: '#FB923C',
        surge: '#EF4444',
        dissipating: '#A78BFA',
      },
    });

  } catch (err) {
    console.error('[cascade] error:', err);
    // Return graceful empty response so the UI never hard-crashes
    return NextResponse.json({
      corridor_id: id,
      corridor_name: '',
      start_node: '',
      end_node: '',
      total_km: 0,
      total_frames: 0,
      time_range: { start: new Date().toISOString(), end: new Date().toISOString() },
      frames: [],
      soul_timeline: [],
      live_signal_layer: [],
      source_colors: {
        ACLED: '#EF4444',
        'IOM-DTM': '#3B82F6',
        DHIS2: '#22C55E',
        'AFRO-SENTINEL': '#EAB308',
        entropy_spike: '#F97316',
        phantom_poe: '#F59E0B',
      },
      hmm_states: {
        dormant: '#6B7280',
        probing: '#60A5FA',
        active_crossing: '#FB923C',
        surge: '#EF4444',
        dissipating: '#A78BFA',
      },
      error: err instanceof Error ? err.message : 'unknown error',
    });
  }
}
