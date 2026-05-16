import { NextResponse } from 'next/server';
import { ExplainabilityEngine } from '@/src/services/intelligence';
import { fetchCorridorsFromNeon, type DbCorridorRow, type DbNodeRow, type DbEvidenceRow } from '@/lib/db';

// Use genuine coordinates in Africa
const LIVE_CORRIDORS = [
    {
        id: 'CORRIDOR-CD-RW-001',
        short: 'CD → RW · 001',
        region: 'Goma–Gisenyi · DRC / Rwanda',
        startNode: 'Goma',
        endNode: 'Gisenyi',
        startCC: 'CD',
        endCC: 'RW',
        mode: 'FOOT',
        velocity: 4.5,
        totalKm: 12,
        seasonal: false,
        canoe: false,
        detour: true,
        coverage: 'Volcanic border porosity',
        nearestFormal: 'Corniche border post',
        gapZone: true,
        cameraCenter: { lat: -1.68, lng: 29.23, alt: 35000, tilt: 55, heading: 90 },
        pathCoords: [
            { lat: -1.66, lng: 29.21, alt: 1530 },
            { lat: -1.67, lng: 29.22, alt: 1540 },
            { lat: -1.68, lng: 29.24, alt: 1510 },
            { lat: -1.70, lng: 29.26, alt: 1480 },
        ],
        nodes: [
            { name: 'Goma', lat: -1.66, lng: 29.21, alt: 1530, type: 'start' as const, cc: 'CD', km: 0, prec: 'PRECISE' },
            { name: 'Mount Goma', lat: -1.67, lng: 29.22, alt: 1540, type: 'border' as const, cc: 'CD', km: 4, prec: 'SETTLEMENT' },
            { name: 'Rubavu', lat: -1.68, lng: 29.24, alt: 1510, type: 'phantom' as const, cc: 'RW', km: 8, prec: 'INFERRED' },
            { name: 'Gisenyi', lat: -1.70, lng: 29.26, alt: 1480, type: 'end' as const, cc: 'RW', km: 12, prec: 'SETTLEMENT' },
        ],
        engineInput: {
            gravityScore: 0.85,
            diffusionScore: 0.72,
            centralityScore: 0.65,
            hmmScore: 0.8,
            seasonalScore: 0.4,
            linguisticScore: 0.88,
            entropyScore: 0.9,
            frictionScore: 0.35, // High friction (volcanic rock) -> low score
        },
        evidence: [
            { id: 'E1', day: 1, km: 0, type: 'DISPLACEMENT', tag: 'IDP FLOW', loc: 'Goma', cc: 'CD', score: .95, source: 'IOM-DTM', prec: 'SETTLEMENT', sourceId: 'DTM-CD-01', lat: -1.66, lng: 29.21, alt: 1530 },
            { id: 'E2', day: 2, km: 4, type: 'HEALTH', tag: 'CHOLERA ↑', loc: 'Mount Goma', cc: 'CD', score: .88, source: 'DHIS2', prec: 'PRECISE', sourceId: 'DHIS-CD-99', lat: -1.67, lng: 29.22, alt: 1540 },
            { id: 'E3', day: 4, km: 12, type: 'HEALTH', tag: 'CHOLERA ↑', loc: 'Gisenyi', cc: 'RW', score: .81, source: 'AFRO-SENTINEL', prec: 'DISTRICT', sourceId: 'SIG-RW-08', lat: -1.70, lng: 29.26, alt: 1480 },
        ]
    },
    {
        id: 'CORRIDOR-KE-TZ-047',
        short: 'KE → TZ · 047',
        region: 'Lake Victoria · Migori / Mara',
        startNode: 'Lwanda',
        endNode: 'Bunda',
        startCC: 'KE',
        endCC: 'TZ',
        mode: 'MOTORCYCLE',
        velocity: 22,
        totalKm: 95,
        seasonal: true,
        canoe: false,
        detour: true,
        coverage: 'Phantom forest crossing',
        nearestFormal: 'Isebania',
        gapZone: true,
        cameraCenter: { lat: -1.35, lng: 34.65, alt: 80000, tilt: 45, heading: 180 },
        pathCoords: [
            { lat: -1.234, lng: 34.567, alt: 1140 }, // Lwanda
            { lat: -1.28, lng: 34.60, alt: 1180 },
            { lat: -1.345, lng: 34.678, alt: 1220 }, // Forest Junction
            { lat: -1.40, lng: 34.73, alt: 1160 },
            { lat: -1.456, lng: 34.789, alt: 1140 }, // Bunda
        ],
        nodes: [
            { name: 'Lwanda', lat: -1.234, lng: 34.567, alt: 1140, type: 'start' as const, cc: 'KE', km: 0, prec: 'PRECISE' },
            { name: 'Forest Junction', lat: -1.345, lng: 34.678, alt: 1220, type: 'phantom' as const, cc: 'TZ', km: 42, prec: 'INFERRED' },
            { name: 'Bunda', lat: -1.456, lng: 34.789, alt: 1140, type: 'end' as const, cc: 'TZ', km: 95, prec: 'SETTLEMENT' },
        ],
        engineInput: {
            gravityScore: 0.78,
            diffusionScore: 0.82,
            centralityScore: 0.60,
            hmmScore: 0.88,
            seasonalScore: 0.70,
            linguisticScore: 0.35,
            entropyScore: 0.92,
            frictionScore: 0.55,
        },
        evidence: [
            { id: 'G1', day: 1, km: 0, type: 'HEALTH', tag: 'CHOLERA ↑', loc: 'Lwanda', cc: 'KE', score: .92, source: 'AFRO-SENTINEL', prec: 'PRECISE', sourceId: 'SIG-KE-047', lat: -1.234, lng: 34.567, alt: 1140 },
            { id: 'G2', day: 3, km: 42, type: 'ENTROPY', tag: 'TRACK SCAR', loc: 'Forest Junction', cc: 'TZ', score: .85, source: 'SENTINEL-2', prec: 'INFERRED', sourceId: 'S2-TZ-88', lat: -1.345, lng: 34.678, alt: 1220 },
            { id: 'G3', day: 5, km: 95, type: 'HEALTH', tag: 'CHOLERA ↑', loc: 'Bunda', cc: 'TZ', score: .89, source: 'AFRO-SENTINEL', prec: 'SETTLEMENT', sourceId: 'SIG-TZ-047', lat: -1.456, lng: 34.789, alt: 1140 },
        ]
    }
];

/** Build the full Corridor shape from Neon rows, merged with static geometry */
function buildFromNeon(
    dbRows: DbCorridorRow[],
    nodes: DbNodeRow[],
    evidence: DbEvidenceRow[],
) {
    return dbRows.map(row => {
        // Find matching static corridor for geometry (pathCoords, engineInput, etc.)
        const staticCor = LIVE_CORRIDORS.find(c => c.id === row.id);

        const corNodes = nodes
            .filter(n => n.corridor_def_id === row.id)
            .map(n => ({
                name: n.name,
                lat: n.lat,
                lng: n.lng,
                alt: n.alt_m,
                type: (n.type as 'start' | 'end' | 'border' | 'phantom') ?? 'start',
                cc: n.country_code ?? '',
                km: n.km,
                prec: 'SETTLEMENT' as const,
            }));

        const corEvidence = evidence
            .filter(e => e.corridor_def_id === row.id)
            .map(e => ({
                id: e.id,
                day: e.day_offset,
                km: e.km_marker,
                type: e.evidence_type ?? 'DISPLACEMENT',
                tag: e.tag ?? '',
                loc: e.location_name ?? '',
                cc: e.country_code ?? '',
                score: e.score,
                source: e.source ?? 'NEON',
                prec: e.precision_level ?? 'SETTLEMENT',
                sourceId: e.evidence_id ?? e.id,
                lat: e.lat ?? 0,
                lng: e.lng ?? 0,
                alt: e.alt_m,
            }));

        return {
            id: row.id,
            short: `${row.start_node} → ${row.end_node}`,
            region: row.region ?? '',
            score: row.score,
            riskClass: row.risk_class,
            activated: row.activated,
            startNode: row.start_node,
            endNode: row.end_node,
            startCC: staticCor?.startCC ?? '',
            endCC: staticCor?.endCC ?? '',
            mode: staticCor?.mode ?? 'FOOT',
            velocity: row.velocity_km_day,
            totalKm: row.total_km,
            seasonal: staticCor?.seasonal ?? false,
            canoe: staticCor?.canoe ?? false,
            detour: staticCor?.detour ?? false,
            firstDetected: row.first_detected ?? new Date().toISOString(),
            coverage: staticCor?.coverage ?? '',
            nearestFormal: staticCor?.nearestFormal ?? '',
            gapZone: staticCor?.gapZone ?? false,
            cameraCenter: row.cam_lat != null && row.cam_lng != null && row.cam_alt != null
                ? { lat: row.cam_lat, lng: row.cam_lng, alt: row.cam_alt, tilt: row.cam_tilt ?? 50, heading: row.cam_heading ?? 0 }
                : staticCor?.cameraCenter ?? null,
            pathCoords: staticCor?.pathCoords ?? corNodes.map(n => ({ lat: n.lat, lng: n.lng, alt: n.alt })),
            nodes: corNodes.length > 0 ? corNodes : (staticCor?.nodes ?? []),
            souls: staticCor ? [] : [], // populated via engine below if static match found
            evidence: corEvidence.length > 0 ? corEvidence : (staticCor?.evidence ?? []),
        };
    });
}


export async function GET() {
    try {
        const engine = new ExplainabilityEngine();
        const runId = `RUN-${new Date().toISOString().split('T')[0]?.replace(/-/g, '')}`;

        // --- Try Neon first ---
        const neonData = await fetchCorridorsFromNeon();
        if (neonData && neonData.corridors.length > 0) {
            const neonCorridors = buildFromNeon(neonData.corridors, neonData.nodes, neonData.evidence);
            // For Neon corridors that also have a static match, run the engine to populate souls
            const enriched = neonCorridors.map(cor => {
                const staticCor = LIVE_CORRIDORS.find(c => c.id === cor.id);
                if (!staticCor) return { ...cor, souls: [] };
                const score = engine.synthesizeCorridorScore({
                    runId,
                    corridorId: cor.id,
                    startNode: cor.startNode,
                    endNode: cor.endNode,
                    ...staticCor.engineInput,
                    evidence: (cor.evidence ?? []).map(e => ({
                        evidenceType: (e.type === 'HEALTH' ? 'health_signal' : 'market_signal') as never,
                        description: e.tag,
                        weight: e.score,
                        source: e.source,
                        sourceRecordId: e.sourceId,
                        confidence: e.score,
                        timestamp: new Date().toISOString(),
                        nodeIds: [cor.startNode, cor.endNode],
                    })),
                    inferredVelocityKmh: staticCor.velocity,
                    seasonallyActive: staticCor.seasonal,
                    requiresCanoe: staticCor.canoe,
                    conflictDetour: staticCor.detour,
                    signalHistory: [0.2, 0.4, 0.6, 0.8, 0.9],
                    frictionContext: { slopeDeg: 2, landCover: 'sparse_vegetation' as never },
                    startCoord: { lat: staticCor.pathCoords[0]!.lat, lng: staticCor.pathCoords[0]!.lng },
                    endCoord: { lat: staticCor.pathCoords[staticCor.pathCoords.length - 1]!.lat, lng: staticCor.pathCoords[staticCor.pathCoords.length - 1]!.lng },
                    locationSignals: [],
                    previousSignalHistory: [0.1, 0.2, 0.3],
                });
                return {
                    ...cor,
                    souls: Object.entries(score.scoreDecomposition).map(([key, value]) => ({
                        key, sym: getSym(key), s: key.slice(0, 2).toUpperCase(),
                        name: key.charAt(0).toUpperCase() + key.slice(1),
                        w: 0.1, desc: `Engine synthesis (${key})`, value: value as number,
                    })),
                };
            });
            return NextResponse.json({ runId, corridors: enriched, source: 'neon' });
        }

        // --- Fall back to static LIVE_CORRIDORS processed through the engine ---
        const synthesized = LIVE_CORRIDORS.map(c => {
            const startCoord = { lat: c.pathCoords[0]!.lat, lng: c.pathCoords[0]!.lng };
            const endCoord = { lat: c.pathCoords[c.pathCoords.length - 1]!.lat, lng: c.pathCoords[c.pathCoords.length - 1]!.lng };

            // Just transform our static evidence to what engine expects to get a true trace
            const mappedEvidence = c.evidence.map(e => ({
                evidenceType: (e.type === 'HEALTH' ? 'health_signal' : 'market_signal') as any,
                description: e.tag,
                weight: e.score,
                source: e.source,
                sourceRecordId: e.sourceId,
                confidence: e.score,
                timestamp: new Date().toISOString(),
                nodeIds: [c.startNode, c.endNode],
            }));

            const score = engine.synthesizeCorridorScore({
                runId,
                corridorId: c.id,
                startNode: c.startNode,
                endNode: c.endNode,
                ...c.engineInput,
                evidence: mappedEvidence,
                inferredVelocityKmh: c.velocity,
                seasonallyActive: c.seasonal,
                requiresCanoe: c.canoe,
                conflictDetour: c.detour,
                signalHistory: [0.2, 0.4, 0.6, 0.8, 0.9],
                frictionContext: { slopeDeg: 2, landCover: 'sparse_vegetation' as never },
                startCoord,
                endCoord,
                locationSignals: [],
                previousSignalHistory: [0.1, 0.2, 0.3],
            });

            // Map engine output back to UI's Corridor format
            return {
                id: c.id,
                short: c.short,
                region: c.region,
                score: score.corridorScore,
                riskClass: score.riskClass,
                activated: score.phantomPoeActivated,
                startNode: c.startNode,
                endNode: c.endNode,
                startCC: c.startCC,
                endCC: c.endCC,
                mode: score.inferredMode,
                velocity: score.inferredVelocityKmh,
                totalKm: c.totalKm,
                seasonal: score.seasonallyActive,
                canoe: score.requiresCanoe,
                detour: score.conflictDetour,
                firstDetected: score.firstDetected ?? new Date().toISOString(),
                coverage: c.coverage,
                nearestFormal: c.nearestFormal,
                gapZone: c.gapZone,
                cameraCenter: c.cameraCenter,
                pathCoords: c.pathCoords,
                nodes: c.nodes,
                // Replace hardcoded souls with actual engine trace output
                souls: Object.entries(score.scoreDecomposition).map(([key, value]) => ({
                    key,
                    sym: getSym(key),
                    s: key.slice(0, 2).toUpperCase(),
                    name: key.charAt(0).toUpperCase() + key.slice(1),
                    w: 0.1, // Approximate
                    desc: `Engine synthesis (${key})`,
                    value: value as number,
                })),
                evidence: c.evidence,
            };
        });

        return NextResponse.json({ runId, corridors: synthesized, source: 'static' });
    } catch (err) {
        console.error('[live/route] GET error:', err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}

function getSym(key: string) {
    if (key.includes('gravity')) return '🜁';
    if (key.includes('diffusion')) return '🜂';
    if (key.includes('centrality')) return '🜃';
    if (key.includes('hmm')) return '🜄';
    if (key.includes('seasonal')) return '☿';
    if (key.includes('linguistic')) return '♄';
    if (key.includes('entropy')) return '♃';
    return '⛰';
}
