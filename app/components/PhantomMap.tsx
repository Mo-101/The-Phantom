'use client';

/**
 * ◉⟁⬡  MoStar Industries
 * Phantom POE Engine — CesiumJS Globe + MapTiler Satellite Tiles
 * Fixed: corridors as polyline tracks · full layout · all lint errors resolved
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type * as CesiumType from 'cesium';

const T = {
    bg: '#070A10', surf: '#0D1020', card: '#121626', border: '#1C2035',
    green: '#00E87A', amber: '#F5A623', red: '#FF453A', pink: '#FF0066',
    blue: '#009ADE', teal: '#3DD9C4', purple: '#8B7CF8',
    text: '#D8DCF0', sub: '#828AB5', muted: '#3A3F5C', dim: '#1C2035',
};
const RISK: Record<string, string> = { CRITICAL: '#FF0066', HIGH: '#FF453A', MEDIUM: '#F5A623', LOW: '#00E87A' };
const SIGTYPE: Record<string, string> = { HEALTH: '#FF6B8A', DISPLACEMENT: '#3DD9C4', CONFLICT: '#FF453A', ENTROPY: '#F5A623', LINGUISTIC: '#8B7CF8' };
// Source colors per cascade--intelligence-emergence-visualization.md + ingest scripts
const SOURCE_COLOR: Record<string, string> = {
    'ACLED': '#EF4444',        // conflict / fire+air
    'IOM-DTM': '#3B82F6',      // displacement / water
    'DHIS2': '#22C55E',        // disease
    'AFRO-SENTINEL': '#EAB308',// sentinel
    'entropy_spike': '#F97316',
    'phantom_poe': '#F59E0B',
};
// HMM state colors per cascade spec
const HMM_COLOR: Record<string, string> = {
    dormant: '#6B7280', probing: '#60A5FA',
    active_crossing: '#FB923C', surge: '#EF4444', dissipating: '#A78BFA',
};
const PREC_LABEL: Record<string, string> = { PRECISE: 'PRECISE·GPS', SETTLEMENT: 'SETTLEMENT', DISTRICT: 'DISTRICT', INFERRED: 'INFERRED' };
const PREC_COLOR: Record<string, string> = { PRECISE: '#00E87A', SETTLEMENT: '#3DD9C4', DISTRICT: '#F5A623', INFERRED: '#3A3F5C' };

export type TimeWindow = '7D' | '14D' | '30D' | '12W' | '6M' | '1Y';
export const getWindowDays = (w: TimeWindow): number => {
    if (w === '7D') return 7;
    if (w === '14D') return 14;
    if (w === '30D') return 30;
    if (w === '12W') return 84;
    if (w === '6M') return 180;
    return 365;
};
export const getWindowUnitLabel = (w: TimeWindow, d: number): string => {
    if (w === '12W' || w === '6M') return `W${Math.floor(d / 7) + 1}`;
    if (w === '1Y') return `M${Math.floor(d / 30) + 1}`;
    return `D${Math.floor(d)}`;
};

interface CorridorNode { name: string; lat: number; lng: number; alt: number; type: 'start' | 'end' | 'border' | 'phantom'; cc: string; km: number; prec: 'PRECISE' | 'SETTLEMENT' | 'DISTRICT' | 'INFERRED'; }
interface EvidenceAtom { id: string; day: number; km: number; type: string; tag: string; loc: string; cc: string; score: number; source: string; prec: string; sourceId: string; lat: number; lng: number; alt: number; }
interface SoulScore { key: string; sym: string; s: string; name: string; w: number; desc: string; value: number; }
interface Corridor { id: string; short: string; region: string; score: number; riskClass: string; activated: boolean; startNode: string; endNode: string; startCC: string; endCC: string; mode: string; velocity: number; totalKm: number; seasonal: boolean; canoe: boolean; detour: boolean; firstDetected: string; coverage: string; nearestFormal: string; gapZone: boolean; cameraCenter: { lat: number; lng: number; alt: number; tilt: number; heading: number }; pathCoords: Array<{ lat: number; lng: number; alt: number }>; nodes: CorridorNode[]; souls: SoulScore[]; evidence: EvidenceAtom[]; }

const RUN_ID = 'RUN-20260314-X7Q2';

declare global { interface Window { Cesium: typeof CesiumType; CESIUM_BASE_URL: string; } }

function Dot({ active, color }: { active: boolean; color: string }) {
    return <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? color : T.muted, display: 'inline-block', boxShadow: active ? `0 0 6px ${color}` : 'none', animation: active ? 'poe-dot 1.4s ease-in-out infinite' : 'none', flexShrink: 0 }} />;
}
function Bar({ value, color, height = 3 }: { value: number; color: string; height?: number }) {
    const safeVal = (value == null || isNaN(value)) ? 0 : Math.min(1, Math.max(0, value));
    return <div style={{ flex: 1, height, background: T.dim, borderRadius: 2, overflow: 'hidden' }}><div style={{ height: '100%', width: `${safeVal * 100}%`, background: color, borderRadius: 2 }} /></div>;
}

function CorridorCard({ c, sel, onClick }: { c: Corridor; sel: boolean; onClick: () => void }) {
    const rc = RISK[c.riskClass] ?? T.muted;
    return (
        <div onClick={onClick} style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, borderLeft: `4px solid ${sel ? rc : 'transparent'}`, background: sel ? T.card : 'transparent', cursor: 'pointer', transition: 'background .12s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, letterSpacing: .5, color: sel ? T.text : T.sub }}>{c.short}</span>
                <span style={{ fontSize: 8, padding: '1px 5px', background: `${rc}18`, color: rc, borderRadius: 2 }}>{c.riskClass}</span>
            </div>
            <div style={{ fontSize: 9, color: T.muted, marginBottom: 6 }}>{c.startNode} → {c.endNode}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5 }}>
                <Bar value={c.score} color={rc} height={3} />
                <span style={{ fontSize: 12, color: rc, fontWeight: 600, minWidth: 38 }}>{(c.score ?? 0).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, fontSize: 8, color: T.muted, alignItems: 'center' }}>
                <span style={{ display: 'flex', gap: 4, alignItems: 'center', color: c.activated ? T.green : T.muted }}>
                    <Dot active={c.activated} color={T.green} />{c.activated ? 'ACTIVE' : 'DORMANT'}
                </span>
                <span>{c.mode} · {c.velocity}km/d</span>
                {c.gapZone && <span style={{ color: T.amber, fontWeight: 600 }}>GAP</span>}
            </div>
        </div>
    );
}

function EvidenceTab({ corridor, currentDay }: { corridor: Corridor; currentDay: number }) {
    if (!corridor) return <div style={{ padding: 16, fontSize: 10, color: T.muted }}>NO CORRIDOR SELECTED</div>;
    return (
        <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: T.muted, marginBottom: 12 }}>SIGNAL CHAIN · {(Array.isArray(corridor.evidence) ? corridor.evidence : []).filter(e => e.day <= currentDay).length}/{(Array.isArray(corridor.evidence) ? corridor.evidence : []).length} ATOMS</div>
            {(Array.isArray(corridor.evidence) ? corridor.evidence : []).map((a, i) => {
                const tc = SIGTYPE[a.type] ?? T.sub; const vis = a.day <= currentDay;
                return (
                    <div key={a.id ?? `ev-${i}`} style={{ marginBottom: 9, padding: '9px 11px', background: vis ? T.card : T.surf, borderRadius: 3, borderLeft: `3px solid ${vis ? tc : T.border}`, opacity: vis ? 1 : .3, transition: 'all .3s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 8, padding: '1px 5px', background: `${tc}18`, color: tc, borderRadius: 2 }}>{a.type}</span>
                            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                                <span style={{ fontSize: 7, padding: '1px 5px', background: `${PREC_COLOR[a.prec] ?? T.muted}18`, color: PREC_COLOR[a.prec] ?? T.muted, borderRadius: 2 }}>{PREC_LABEL[a.prec] ?? a.prec}</span>
                                <span style={{ fontSize: 9, color: T.sub, fontWeight: 600 }}>D{a.day}</span>
                            </div>
                        </div>
                        <div style={{ fontSize: 11, color: vis ? T.text : T.sub, marginBottom: 3 }}>{a.loc}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 9, color: T.sub }}>{a.cc} · {a.source}</span>
                            <span style={{ fontSize: 9, color: tc, fontStyle: 'italic' }}>{a.tag}</span>
                        </div>
                        <div style={{ fontStyle: 'italic', fontSize: 7, color: T.border, marginBottom: 5 }}>{a.sourceId}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Bar value={a.score} color={tc} height={3} />
                            <span style={{ fontSize: 8, color: T.muted, minWidth: 38 }}>t:{(a.score ?? 0).toFixed(2)}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function ScoresTab({ corridor }: { corridor: Corridor }) {
    if (!corridor) return null;
    const rc = RISK[corridor.riskClass] ?? T.muted;
    return (
        <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: T.muted, marginBottom: 14 }}>7 MATHEMATICAL SOULS + TERRAIN PHYSICS</div>
            {(Array.isArray(corridor.souls) ? corridor.souls : []).map(s => {
                const isHigh = s.value >= 0.78;
                return (
                    <div key={s.key} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                                <span style={{ fontSize: 13, width: 18, textAlign: 'center', lineHeight: 1 }}>{s.sym}</span>
                                <div>
                                    <span style={{ fontSize: 8, color: T.muted }}>{s.s} </span>
                                    <span style={{ fontSize: 10, color: isHigh ? T.text : T.sub }}>{s.name}</span>
                                    {isHigh && <span style={{ fontSize: 7, color: rc, marginLeft: 6, padding: '1px 4px', background: `${rc}15`, borderRadius: 2 }}>DRIVER</span>}
                                </div>
                            </div>
                            <span style={{ fontSize: 12, color: isHigh ? rc : T.sub, fontWeight: 600 }}>{(s.value ?? 0).toFixed(3)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                            <Bar value={s.value} color={isHigh ? rc : `${rc}55`} height={4} />
                            <span style={{ fontSize: 8, color: T.muted, minWidth: 80, textAlign: 'right' }}>×{(s.w ?? 0).toFixed(2)}={((s.w ?? 0) * (s.value ?? 0)).toFixed(4)}</span>
                        </div>
                        <div style={{ fontSize: 8, color: T.border, paddingLeft: 25 }}>{s.desc}</div>
                    </div>
                );
            })}
            <div style={{ marginTop: 14, padding: '11px 14px', background: `${rc}0E`, border: `1px solid ${rc}25`, borderRadius: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ fontSize: 8, color: T.sub, letterSpacing: 1 }}>WEIGHTED COMPOSITE</div>
                    <div style={{ fontSize: 8, color: corridor.activated ? T.green : T.muted, marginTop: 2 }}>{corridor.riskClass} · {corridor.activated ? '◉ ACTIVATED' : '○ MONITORING'}</div>
                    <div style={{ fontSize: 7, color: T.muted, marginTop: 1 }}>truth floor: 0.75</div>
                </div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 34, color: rc, letterSpacing: 2 }}>{(corridor?.score ?? 0).toFixed(4)}</div>
            </div>
        </div>
    );
}

// ... more content coming in next chunk
function CascadeTab({ corridor, currentDay, timeWindow }: { corridor: Corridor; currentDay: number; timeWindow: TimeWindow }) {
    if (!corridor || typeof corridor !== 'object') return null;
    const rc = RISK[corridor.riskClass] ?? T.muted;
    const maxDay = getWindowDays(timeWindow);
    const maxKm = corridor.totalKm ?? 100;
    const CW = 320, CH = 240, padL = 42, padB = 32, padT = 16, padR = 26;
    const W = CW - padL - padR, H = CH - padT - padB;
    const cx = (d: number) => padL + Math.min(1, d / (maxDay || 1)) * W;
    const cy = (k: number) => padT + H - Math.min(1, k / (maxKm || 1)) * H;
    const safeEvidence = Array.isArray(corridor.evidence) ? corridor.evidence : [];
    const safeNodes = Array.isArray(corridor.nodes) ? corridor.nodes : [];
    const last = safeEvidence[safeEvidence.length - 1] ?? { day: 0, km: 0 };
    const sources = [...new Set(safeEvidence.map(e => e.source))];
    const phantomKm = safeNodes.find(n => n.type === 'phantom')?.km;
    const borderKm = safeNodes.find(n => n.type === 'border')?.km;

    const stepDays = timeWindow === '7D' ? 1 : timeWindow === '14D' ? 2 : timeWindow === '30D' ? 5 : timeWindow === '12W' ? 14 : timeWindow === '6M' ? 30 : 60;
    const tickDays = [];
    for (let d = 0; d <= maxDay; d += stepDays) tickDays.push(d);

    const arcData: { d: number; v: number }[] = [];
    for (let d = 0; d <= maxDay; d += maxDay / 40) {
        if (d > currentDay) break;
        const recentSignals = safeEvidence.filter(e => e.day >= d - 14 && e.day <= d).length;
        const normalized = Math.min(1.0, (recentSignals / 6) + (Math.sin(d / 12) * 0.15 + 0.15));
        arcData.push({ d, v: normalized });
    }
    const arcPath = arcData.length > 0 ? arcData.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${cx(pt.d)} ${padT + H - Math.max(2, pt.v * 60)}`).join(' ') : '';
    const arcFill = arcData.length > 0 ? `${arcPath} L ${cx(arcData[arcData.length - 1]!.d)} ${padT + H} L ${cx(0)} ${padT + H} Z` : '';

    return (
        <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: T.muted, marginBottom: 5 }}>SIGNAL CASCADE · SPATIAL-TEMPORAL PROOF</div>
            <div style={{ fontSize: 10, color: T.sub, lineHeight: 1.6, marginBottom: 12 }}>Consistent velocity across <span style={{ color: T.teal, fontWeight: 600 }}>{sources.length}</span> independent sources proves corridor reality.</div>
            <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: '100%', height: 'auto', background: T.card, borderRadius: 3, display: 'block', marginBottom: 12 }}>
                <defs>
                    <linearGradient id={`arcGradient-${corridor.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={rc} stopOpacity="0.8" />
                        <stop offset="100%" stopColor={rc} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <rect width={CW} height={CH} fill={T.card} rx={3} />
                {[0, 25, 50, 75, 100].map((km, i) => (
                    <g key={i}>
                        <line x1={padL} y1={cy(km)} x2={CW - padR} y2={cy(km)} stroke={T.border} strokeWidth=".5" />
                        <text x={padL - 5} y={cy(km) + 3} fill={T.muted} fontSize="8" textAnchor="end" fontFamily="monospace">{km}</text>
                    </g>
                ))}
                {tickDays.map(d => (
                    <g key={d}>
                        <line x1={cx(d)} y1={padT} x2={cx(d)} y2={padT + H} stroke={T.border} strokeWidth=".5" />
                        <text x={cx(d)} y={padT + H + 16} fill={T.muted} fontSize="8" textAnchor="middle" fontFamily="monospace">{getWindowUnitLabel(timeWindow, d)}</text>
                    </g>
                ))}
                {arcData.length > 0 && (
                    <>
                        <path d={arcFill} fill={`url(#arcGradient-${corridor.id})`} opacity="0.3" />
                        <path d={arcPath} fill="none" stroke={rc} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </>
                )}
                {borderKm !== undefined && <><line x1={padL} y1={cy(borderKm)} x2={CW - padR} y2={cy(borderKm)} stroke={T.blue} strokeWidth="1" strokeDasharray="5,3" opacity=".7" /><text x={CW - padR + 3} y={cy(borderKm) + 3} fill={T.blue} fontSize="8" fontFamily="monospace">border</text></>}
                {phantomKm !== undefined && <><line x1={padL} y1={cy(phantomKm)} x2={CW - padR} y2={cy(phantomKm)} stroke={T.amber} strokeWidth="1" strokeDasharray="3,3" opacity=".8" /><text x={CW - padR + 3} y={cy(phantomKm) + 3} fill={T.amber} fontSize="8" fontFamily="monospace">phantom</text></>}
                <line x1={cx(0)} y1={cy(0)} x2={cx(last.day)} y2={cy(last.km)} stroke={rc} strokeWidth="1" strokeDasharray="3,3" opacity=".4" />
                {safeEvidence.map(sig => {
                    const sc = SIGTYPE[sig.type] ?? T.sub; const vis = sig.day <= currentDay;
                    return (
                        <g key={sig.id}>
                            {sig.type === 'ENTROPY' && <circle cx={cx(sig.day)} cy={cy(sig.km)} r={11} fill={`${T.amber}10`} stroke={T.amber} strokeWidth=".5" />}
                            <circle cx={cx(sig.day)} cy={cy(sig.km)} r={4} fill={vis ? sc : `${sc}30`} stroke={vis ? T.bg : T.border} strokeWidth="1" />
                            <text x={cx(sig.day) + 7} y={cy(sig.km) - 2} fill={vis ? sc : T.border} fontSize="7" fontFamily="monospace">{sig.id}</text>
                        </g>
                    );
                })}
                <line x1={padL} y1={padT} x2={padL} y2={padT + H} stroke={T.border} strokeWidth=".8" />
                <line x1={padL} y1={padT + H} x2={CW - padR} y2={padT + H} stroke={T.border} strokeWidth=".8" />
                <text x={padL - 20} y={padT + H / 2} fill={T.muted} fontSize="8" textAnchor="middle" fontFamily="monospace" transform={`rotate(-90,${padL - 20},${padT + H / 2})`}>km</text>
                <text x={padL + W / 2} y={CH - 3} fill={T.muted} fontSize="8" textAnchor="middle" fontFamily="monospace">{timeWindow === '12W' || timeWindow === '6M' ? 'week' : timeWindow === '1Y' ? 'month' : 'day'}</text>
            </svg>
        </div>
    );
}

function BriefTab({ corridor }: { corridor: Corridor }) {
    if (!corridor) return <div style={{ padding: 16, fontSize: 10, color: T.muted }}>NO DATA</div>;
    const rc = RISK[corridor.riskClass] ?? T.muted;
    const drivers = (Array.isArray(corridor.souls) ? corridor.souls : []).filter(s => s.value >= 0.78).map(s => s.name);
    const sources = [...new Set((Array.isArray(corridor.evidence) ? corridor.evidence : []).map(e => e.source))];
    return (
        <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: T.muted, marginBottom: 12 }}>CORRIDOR INTELLIGENCE BRIEF</div>
            <div style={{ padding: '12px 14px', background: T.card, borderRadius: 3, marginBottom: 12, borderLeft: `3px solid ${rc}` }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: rc, letterSpacing: 2, marginBottom: 2 }}>{corridor.id}</div>
                <div style={{ fontSize: 9, color: T.sub, marginBottom: 7 }}>Issued · {new Date().toISOString().slice(0, 10)} · {RUN_ID}</div>
                <div style={{ fontSize: 10, color: T.text, lineHeight: 1.8, marginBottom: 11 }}>Probable informal cross-border corridor detected between <span style={{ color: rc }}>{corridor.startNode}</span> ({corridor.startCC}) and <span style={{ color: rc }}>{corridor.endNode}</span> ({corridor.endCC}). {corridor.coverage}.</div>
                <div style={{ fontSize: 8, color: T.muted, letterSpacing: 1.2, marginBottom: 6 }}>INFERRED PATHWAY</div>
                {(Array.isArray(corridor.nodes) ? corridor.nodes : []).map((n, i) => (
                    <div key={n.name ?? `node-${i}`} style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: n.type === 'phantom' ? T.amber : rc, width: 9, textAlign: 'center' }}>{i === 0 ? '▶' : i === (Array.isArray(corridor.nodes) ? corridor.nodes : []).length - 1 ? '◼' : '┊'}</span>
                        <span style={{ fontSize: 11, color: n.type === 'phantom' ? T.amber : T.text }}>{n.name}</span>
                        <span style={{ fontSize: 8, color: T.sub }}>{n.cc}</span>
                        {n.type === 'phantom' && <span style={{ fontSize: 7, padding: '1px 5px', background: `${T.amber}18`, color: T.amber, borderRadius: 2 }}>PHANTOM</span>}
                        <span style={{ fontSize: 8, color: T.muted, marginLeft: 'auto' }}>{PREC_LABEL[n.prec] ?? n.prec}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// TerrainInset — picture-in-picture Cesium viewer showing elevation/slope/aspect
// shading with contour lines and the corridor footprint polygon clamped to
// ground. Based on get-elevation-contour-material.js and viewer-638QR.js.
// ---------------------------------------------------------------------------
type ShadingMode = 'elevation' | 'slope' | 'aspect' | 'none';

function buildColorRamp(mode: ShadingMode): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 100; canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    const grd = ctx.createLinearGradient(0, 0, 100, 0);
    if (mode === 'elevation') {
        const stops = [0.0, 0.045, 0.1, 0.15, 0.37, 0.54, 1.0];
        const colors = ['#000000', '#2747E0', '#D33B7D', '#D33038', '#FF9742', '#ffd700', '#ffffff'];
        stops.forEach((s, i) => grd.addColorStop(s, colors[i]!));
    } else if (mode === 'slope') {
        const stops = [0.0, 0.29, 0.5, Math.sqrt(2) / 2, 0.87, 0.91, 1.0];
        const colors = ['#000000', '#2747E0', '#D33B7D', '#D33038', '#FF9742', '#ffd700', '#ffffff'];
        stops.forEach((s, i) => grd.addColorStop(s, colors[i]!));
    } else if (mode === 'aspect') {
        const stops = [0.0, 0.2, 0.4, 0.6, 0.8, 0.9, 1.0];
        const colors = ['#000000', '#2747E0', '#D33B7D', '#D33038', '#FF9742', '#ffd700', '#ffffff'];
        stops.forEach((s, i) => grd.addColorStop(s, colors[i]!));
    }
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 100, 1);
    return canvas;
}

function applyTerrainMaterial(
    Cesium: typeof CesiumType,
    globe: CesiumType.Globe,
    mode: ShadingMode,
    enableContour: boolean,
) {
    const MIN_H = -414, MAX_H = 8777;
    let material: CesiumType.Material | undefined;

    if (mode === 'none' && !enableContour) { globe.material = undefined as unknown as CesiumType.Material; return; }

    if (enableContour && mode !== 'none') {
        const typeMap: Record<string, string> = { elevation: 'ElevationColorContour', slope: 'SlopeColorContour', aspect: 'AspectColorContour' };
        const subMat: Record<string, string> = { elevation: 'elevationRampMaterial', slope: 'slopeRampMaterial', aspect: 'aspectRampMaterial' };
        const subType: Record<string, string> = { elevation: 'ElevationRamp', slope: 'SlopeRamp', aspect: 'AspectRamp' };
        material = new Cesium.Material({
            fabric: {
                type: typeMap[mode],
                materials: { contourMaterial: { type: 'ElevationContour' }, [subMat[mode]!]: { type: subType[mode] } },
                components: { diffuse: `contourMaterial.alpha == 0.0 ? ${subMat[mode]}.diffuse : contourMaterial.diffuse`, alpha: `max(contourMaterial.alpha, ${subMat[mode]}.alpha)` },
            }, translucent: false,
        });
        const shadingU = (material as any).materials[subMat[mode]!].uniforms;
        if (mode === 'elevation') { shadingU.minimumHeight = MIN_H; shadingU.maximumHeight = MAX_H; }
        shadingU.image = buildColorRamp(mode);
        const contourU = (material as any).materials.contourMaterial.uniforms;
        contourU.width = 2.0; contourU.spacing = 150.0; contourU.color = Cesium.Color.RED.clone();
    } else if (enableContour) {
        material = Cesium.Material.fromType('ElevationContour');
        (material.uniforms as any).width = 2.0; (material.uniforms as any).spacing = 150.0; (material.uniforms as any).color = Cesium.Color.RED.clone();
    } else {
        const typeMap: Record<string, string> = { elevation: 'ElevationRamp', slope: 'SlopeRamp', aspect: 'AspectRamp' };
        material = Cesium.Material.fromType(typeMap[mode]!);
        const u = material.uniforms as any;
        if (mode === 'elevation') { u.minimumHeight = MIN_H; u.maximumHeight = MAX_H; }
        u.image = buildColorRamp(mode);
    }
    globe.material = material!;
}

interface TerrainInsetProps {
    corridor: Corridor | undefined;
    ionToken: string;
}

// Ion asset IDs from the reference files (viewer-4AbUS.js)
const ION_FOOTPRINT_ASSET  = 2533131; // GeoJSON corridor footprint polygon
const ION_BUILDING_ASSET   = 2533124; // Proposed building / design tileset

function TerrainInset({ corridor, ionToken }: TerrainInsetProps) {
    const insetRef = useRef<HTMLDivElement>(null);
    const insetViewerRef = useRef<CesiumType.Viewer | null>(null);
    const footprintEntityRef = useRef<CesiumType.Entity | null>(null);
    const buildingTilesetRef = useRef<CesiumType.Cesium3DTileset | null>(null);
    const footprintDataSourceRef = useRef<CesiumType.GeoJsonDataSource | null>(null);
    const clippingPolygonsRef = useRef<CesiumType.ClippingPolygonCollection | null>(null);
    const [shadingMode, setShadingMode] = useState<ShadingMode>('elevation');
    const [contour, setContour] = useState(false);
    const [showBuilding, setShowBuilding] = useState(true);
    const [showFootprint, setShowFootprint] = useState(true);
    const [clipEnabled, setClipEnabled] = useState(false);
    const [inverseClip, setInverseClip] = useState(false);
    const [ready, setReady] = useState(false);
    const shadingRef = useRef<ShadingMode>('elevation');
    const contourRef = useRef(false);

    // Build the inset viewer once — matches viewer-4AbUS.js setup
    useEffect(() => {
        if (!insetRef.current || !window.Cesium) return;
        const Cesium = window.Cesium;
        Cesium.Ion.defaultAccessToken = ionToken;

        const creditDiv = document.createElement('div');
        creditDiv.style.display = 'none';
        document.body.appendChild(creditDiv);

        const viewer = new Cesium.Viewer(insetRef.current, {
            animation: false, baseLayerPicker: false, fullscreenButton: false,
            geocoder: false, homeButton: false, infoBox: false,
            sceneModePicker: false, selectionIndicator: false, timeline: false,
            navigationHelpButton: false, scene3DOnly: true,
            creditContainer: creditDiv, requestRenderMode: false,
            imageryProvider: false as unknown as CesiumType.ImageryProvider,
            baseLayer: false as unknown as CesiumType.ImageryLayer,
        });

        // OSM fallback base imagery
        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            maximumLevel: 19,
            credit: new Cesium.Credit('© OpenStreetMap contributors'),
        }));

        // World Terrain with vertex normals for slope/aspect/elevation shading
        Cesium.createWorldTerrainAsync({ requestVertexNormals: true }).then((tp: CesiumType.TerrainProvider) => {
            if (insetViewerRef.current?.isDestroyed()) return;
            insetViewerRef.current!.terrainProvider = tp;
            applyTerrainMaterial(Cesium, insetViewerRef.current!.scene.globe, shadingRef.current, contourRef.current);
        }).catch(() => {});

        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#070A10');
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#070A10');
        insetViewerRef.current = viewer;

        // --- Load GeoJSON footprint from Ion asset 2533131 (viewer-4AbUS.js) ---
        Cesium.IonResource.fromAssetId(ION_FOOTPRINT_ASSET).then((resource: CesiumType.IonResource) =>
            (Cesium as any).GeoJsonDataSource.load(resource, { clampToGround: true })
        ).then((dataSource: CesiumType.GeoJsonDataSource) => {
            if (insetViewerRef.current?.isDestroyed()) return;
            viewer.dataSources.add(dataSource);
            footprintDataSourceRef.current = dataSource;

            const footprint = dataSource.entities.values.find(
                (e: CesiumType.Entity) => (Cesium as any).defined(e.polygon)
            );
            if (footprint) {
                // polygon.outline = false — exact match to viewer-4AbUS.js line
                (footprint.polygon as any).outline = false;
                footprintEntityRef.current = footprint;

                // Zoom to footprint with HeadingPitchRange — viewer-4AbUS.js cameraOffset
                const cameraOffset = new Cesium.HeadingPitchRange(
                    Cesium.Math.toRadians(95.0),
                    Cesium.Math.toRadians(-75.0),
                    800.0,
                );
                viewer.zoomTo(footprint, cameraOffset).catch(() => {});

                // Build ClippingPolygonCollection from footprint positions — viewer-4AbUS.js
                const positions = (footprint.polygon as any).hierarchy.getValue().positions;
                const clippingPolygons = new (Cesium as any).ClippingPolygonCollection({
                    polygons: [new (Cesium as any).ClippingPolygon({ positions })],
                });
                clippingPolygonsRef.current = clippingPolygons;
            }
        }).catch(() => {});

        // --- Load proposed building tileset from Ion asset 2533124 (viewer-4AbUS.js) ---
        (Cesium as any).Cesium3DTileset.fromIonAssetId(ION_BUILDING_ASSET).then((tileset: CesiumType.Cesium3DTileset) => {
            if (insetViewerRef.current?.isDestroyed()) return;
            viewer.scene.primitives.add(tileset);
            buildingTilesetRef.current = tileset;
        }).catch(() => {});

        setReady(true);

        return () => {
            if (!viewer.isDestroyed()) viewer.destroy();
            insetViewerRef.current = null;
            footprintEntityRef.current = null;
            buildingTilesetRef.current = null;
            footprintDataSourceRef.current = null;
            clippingPolygonsRef.current = null;
        };
    }, [ionToken]);

    // Re-apply terrain shading when mode or contour changes
    useEffect(() => {
        shadingRef.current = shadingMode;
        contourRef.current = contour;
        const v = insetViewerRef.current;
        if (!v || v.isDestroyed() || !ready || !window.Cesium) return;
        applyTerrainMaterial(window.Cesium, v.scene.globe, shadingMode, contour);
    }, [shadingMode, contour, ready]);

    // Toggle building tileset visibility — viewer-4AbUS.js addToggleButton "Show proposed design"
    useEffect(() => {
        if (buildingTilesetRef.current) buildingTilesetRef.current.show = showBuilding;
    }, [showBuilding]);

    // Toggle footprint visibility — viewer-4AbUS.js addToggleButton "Show footprint"
    useEffect(() => {
        if (footprintEntityRef.current) footprintEntityRef.current.show = showFootprint;
    }, [showFootprint]);

    // Toggle ClippingPolygon enabled — viewer-8qsfg.js addToggleButton "Clip target location"
    useEffect(() => {
        if (clippingPolygonsRef.current) (clippingPolygonsRef.current as any).enabled = clipEnabled;
    }, [clipEnabled]);

    // Toggle ClippingPolygon inverse — viewer-8qsfg.js addToggleButton "Inverse clip"
    useEffect(() => {
        if (clippingPolygonsRef.current) (clippingPolygonsRef.current as any).inverse = inverseClip;
    }, [inverseClip]);

    // Fly inset camera to selected corridor when selection changes (corridor pathCoords fallback)
    useEffect(() => {
        const v = insetViewerRef.current;
        if (!v || v.isDestroyed() || !ready || !window.Cesium || !corridor) return;
        const Cesium = window.Cesium;
        const cam = corridor.cameraCenter;
        v.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(cam.lng, cam.lat, cam.alt * 0.4),
            orientation: { heading: Cesium.Math.toRadians(cam.heading), pitch: Cesium.Math.toRadians(-55), roll: 0 },
            duration: 1.2,
        });
    }, [corridor, ready]);

    const MODES: { k: ShadingMode; label: string }[] = [
        { k: 'elevation', label: 'ELEV' },
        { k: 'slope', label: 'SLOPE' },
        { k: 'aspect', label: 'ASPECT' },
        { k: 'none', label: 'NONE' },
    ];

    const btnStyle = (active: boolean, color = T.green) => ({
        background: active ? color : 'none',
        color: active ? T.bg : T.muted,
        border: `1px solid ${active ? color : T.border}`,
        padding: '1px 5px', fontSize: 6, cursor: 'pointer', borderRadius: 2,
    } as const);

    return (
        <div style={{
            position: 'absolute', bottom: 14, right: 8, width: 268, height: 220,
            background: T.surf, border: `1px solid ${T.border}`, borderRadius: 3,
            zIndex: 30, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,.7)',
        }}>
            {/* Inset Cesium container */}
            <div ref={insetRef} style={{ width: '100%', height: '100%' }} />

            {/* Header — shows corridor short name */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                background: `${T.bg}CC`, padding: '3px 8px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: `1px solid ${T.border}`,
            }}>
                <span style={{ fontSize: 7, letterSpacing: 1.5, color: T.muted }}>TERRAIN INSET</span>
                {corridor && <span style={{ fontSize: 7, color: RISK[corridor.riskClass] ?? T.muted }}>{corridor.short}</span>}
            </div>

            {/* viewer-4AbUS.js toggle buttons: Show proposed design / Show footprint / Clip */}
            <div style={{
                position: 'absolute', top: 18, left: 5,
                display: 'flex', flexDirection: 'column', gap: 3,
            }}>
                <button onClick={() => setShowBuilding(v => !v)} style={btnStyle(showBuilding, T.teal)}>BUILDING</button>
                <button onClick={() => setShowFootprint(v => !v)} style={btnStyle(showFootprint, T.blue)}>FOOTPRINT</button>
                <button onClick={() => setClipEnabled(v => !v)} style={btnStyle(clipEnabled, T.amber)}>CLIP</button>
                <button onClick={() => setInverseClip(v => !v)} style={btnStyle(inverseClip, T.pink)}>INVERT</button>
            </div>

            {/* Shading mode controls — get-elevation-contour-material.js viewModel */}
            <div style={{
                position: 'absolute', bottom: 14, left: 0, right: 0,
                background: `${T.bg}CC`, padding: '3px 6px',
                display: 'flex', gap: 3, alignItems: 'center',
                borderTop: `1px solid ${T.border}`,
            }}>
                {MODES.map(m => (
                    <button key={m.k} onClick={() => setShadingMode(m.k)} style={btnStyle(shadingMode === m.k)}>{m.label}</button>
                ))}
                <button onClick={() => setContour(v => !v)} style={{ ...btnStyle(contour, T.amber), marginLeft: 'auto' }}>CONTOUR</button>
            </div>

            {/* Ion asset attribution strip */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: `${T.bg}AA`, padding: '1px 6px',
                display: 'flex', gap: 6,
            }}>
                <span style={{ fontSize: 5, color: T.muted }}>Ion {ION_FOOTPRINT_ASSET} · {ION_BUILDING_ASSET}</span>
            </div>

            {/* Elevation ramp legend — getColorRamp() in get-elevation-contour-material.js */}
            {shadingMode !== 'none' && (
                <div style={{
                    position: 'absolute', top: 24, right: 5,
                    width: 8, height: 80, borderRadius: 2, overflow: 'hidden',
                    background: 'linear-gradient(to top, #000000, #2747E0, #D33B7D, #D33038, #FF9742, #ffd700, #ffffff)',
                    border: `1px solid ${T.border}`,
                }} />
            )}
        </div>
    );
}

interface PhantomMapProps {
    CORRIDORS: Corridor[];
    initialSelId: string;
}

export default function PhantomMap({ CORRIDORS, initialSelId }: PhantomMapProps) {
    const mapDivRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<CesiumType.Viewer | null>(null);
    const entityIdsRef = useRef<string[]>([]);
    const [cesiumReady, setCesiumReady] = useState(false);
    const [corridors, setCorridors] = useState<Corridor[]>(CORRIDORS ?? []);
    const [selId, setSelId] = useState<string | null>(initialSelId ?? null);
    const [tab, setTab] = useState<'evidence' | 'cascade' | 'scores' | 'brief'>('evidence');
    const [timeWindow, setTimeWindow] = useState<TimeWindow>('14D');
    const [currentDay, setCurrentDay] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [clock, setClock] = useState('');
    const [showSidebar, setShowSidebar] = useState(true);
    const [terrainRelief, setTerrainRelief] = useState(false);
    const [terrainExaggeration, setTerrainExaggeration] = useState(false);
    const [showOfficialRoute, setShowOfficialRoute] = useState(true);
    const [showGapAnalysis, setShowGapAnalysis] = useState(false);
    const [photoReal, setPhotoReal] = useState(false);
    const [showRoadOverlay, setShowRoadOverlay] = useState(false);
    const googleTilesetRef = useRef<CesiumType.Cesium3DTileset | null>(null);
    const roadOverlayLayerRef = useRef<CesiumType.ImageryLayer | null>(null);
    const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; title: string; subtitle: string; color: string; details?: { label: string; value: string }[] } | null>(null);
    // Cascade data — fetched from /api/corridors/:id/cascade on corridor select
    const [cascadeData, setCascadeData] = useState<any | null>(null);
    const [showCascadeLayer, setShowCascadeLayer] = useState(true);
    const cascadeEntityIdsRef = useRef<string[]>([]);

    // Sync corridors if parent re-fetches and passes updated props
    useEffect(() => {
        if (CORRIDORS && CORRIDORS.length > 0) {
            setCorridors(CORRIDORS);
            if (!selId) setSelId(initialSelId);
        }
    }, [CORRIDORS, initialSelId]);

    const corridor = corridors.find(c => c.id === selId) ?? corridors[0];
    const rc = corridor ? (RISK[corridor.riskClass] ?? T.muted) : T.muted;
    const maxDay = corridor ? getWindowDays(timeWindow) : 14;

    useEffect(() => { const t = setInterval(() => setClock(new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC'), 1000); return () => clearInterval(t); }, []);
    useEffect(() => {
        if (!playing) return;
        const stepSize = maxDay > 90 ? 4 : maxDay > 30 ? 2 : maxDay > 14 ? 1 : 0.5;
        const t = setInterval(() => { setCurrentDay(d => { if (d >= maxDay) { setPlaying(false); return d; } return d + stepSize; }); }, 700);
        return () => clearInterval(t);
    }, [playing, maxDay]);
    useEffect(() => { 
        if (!corridor) return;
        const evArr = corridor.evidence ?? [];
        setCurrentDay(evArr.length > 0 ? Math.max(...evArr.map(e => e.day)) : 0); 
        setPlaying(false); 
        setTab('evidence'); 
    }, [selId, corridor]);

    // Fetch cascade data (source-coded signal layer) from /api/corridors/:id/cascade
    // — feeds ACLED/DTM/DHIS2 signal markers onto the Cesium terrain per cascade_spec.ts
    useEffect(() => {
        if (!corridor) return;
        setCascadeData(null);
        fetch(`/api/corridors/${corridor.id}/cascade`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setCascadeData(data); })
            .catch(() => {});
    }, [corridor?.id]);

    // Render ACLED / IOM-DTM / DHIS2 signal markers from cascade API onto the terrain.
    // Colors from cascade--intelligence-emergence-visualization.md:
    //   ACLED=#EF4444  IOM-DTM=#3B82F6  DHIS2=#22C55E  Sentinel=#EAB308
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed() || !cesiumReady || !window.Cesium) return;
        const Cesium = window.Cesium;

        // Remove previous cascade markers
        for (const id of cascadeEntityIdsRef.current) viewer.entities.removeById(id);
        cascadeEntityIdsRef.current = [];

        if (!showCascadeLayer || !cascadeData) return;

        // Render live_signal_layer — all signals near this corridor from normalized_signals
        const liveLayer: any[] = cascadeData.live_signal_layer ?? [];
        for (const sig of liveLayer) {
            if (!sig.lat || !sig.lng) continue;
            const color = SOURCE_COLOR[sig.source] ?? T.sub;
            const eid = `cascade-live-${sig.id}`;
            viewer.entities.add({
                id: eid,
                position: Cesium.Cartesian3.fromDegrees(sig.lng, sig.lat),
                point: {
                    pixelSize: Math.max(5, (sig.magnitude ?? 0.5) * 12),
                    color: Cesium.Color.fromCssColorString(color).withAlpha(0.85),
                    outlineColor: Cesium.Color.fromCssColorString(T.bg),
                    outlineWidth: 1.5,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                },
                label: {
                    text: sig.source,
                    font: '8px "IBM Plex Mono",monospace',
                    fillColor: Cesium.Color.fromCssColorString(color),
                    outlineColor: Cesium.Color.fromCssColorString(T.bg),
                    outlineWidth: 2,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset: new Cesium.Cartesian2(0, -10),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    scale: 0.8,
                    show: false, // Only show on hover — controlled by mouse handler
                },
            });
            cascadeEntityIdsRef.current.push(eid);
        }

        // Render phantom POE detection location from latest frame — gold flash marker
        const lastPhantom = [...(cascadeData.frames ?? [])].reverse().find((f: any) => f.phantom_poe_detected);
        if (lastPhantom?.phantom_poe_location) {
            const p = lastPhantom.phantom_poe_location;
            const phId = `cascade-phantom-poe-${cascadeData.corridor_id}`;
            viewer.entities.add({
                id: phId,
                position: Cesium.Cartesian3.fromDegrees(p.lng, p.lat),
                point: {
                    pixelSize: 18,
                    color: Cesium.Color.fromCssColorString(SOURCE_COLOR.phantom_poe),
                    outlineColor: Cesium.Color.fromCssColorString('#000'),
                    outlineWidth: 2,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                },
                label: {
                    text: `PHANTOM POE\n${p.name}`,
                    font: '9px "IBM Plex Mono",monospace',
                    fillColor: Cesium.Color.fromCssColorString(SOURCE_COLOR.phantom_poe),
                    outlineColor: Cesium.Color.fromCssColorString(T.bg),
                    outlineWidth: 3,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset: new Cesium.Cartesian2(0, -22),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    scale: 0.9,
                },
            });
            cascadeEntityIdsRef.current.push(phId);
        }
    }, [cesiumReady, cascadeData, showCascadeLayer]);

    useEffect(() => {
        if (!mapDivRef.current) return;
        let stopped = false;
        const check = setInterval(() => {
            if (!window.Cesium) return;
            clearInterval(check);
            if (stopped) return;
            const Cesium = window.Cesium;
            // Suppress all Cesium Ion requests — we use MapTiler exclusively.
            // Without this, Cesium fires authenticated requests to api.cesium.com
            // on every startup, which fail with [object Object] errors when no token is set.
            Cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiMmRmYzcxNC0yZjM5LTQ0NzUtYWRkYi1kMjc1NzYwYTQ0NjYiLCJpZCI6MjE0OTQzLCJpYXQiOjE3MTU2NTMyNjN9.1fW--_-6R3TApPF2tAlOfXrqJadYPdwKqpPVkPetHP4';
            const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';
            const creditDiv = document.createElement('div');
            creditDiv.style.display = 'none';
            document.body.appendChild(creditDiv);
            const viewer = new Cesium.Viewer(mapDivRef.current!, {
                animation: false, baseLayerPicker: false, fullscreenButton: false,
                geocoder: false, homeButton: false, infoBox: false,
                sceneModePicker: false, selectionIndicator: false, timeline: false,
                navigationHelpButton: false, scene3DOnly: true,
                creditContainer: creditDiv, requestRenderMode: false, msaaSamples: 4,
                // Use a blank provider so Cesium never auto-loads ion base imagery
                imageryProvider: false as unknown as CesiumType.ImageryProvider,
                baseLayer: false as unknown as CesiumType.ImageryLayer,
            });
            viewer.imageryLayers.removeAll();
            if (maptilerKey) {
                viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
                    url: `https://api.maptiler.com/maps/satellite/{z}/{x}/{y}@2x.jpg?key=${maptilerKey}`,
                    maximumLevel: 18,
                    credit: new Cesium.Credit('© MapTiler · © OpenStreetMap'),
                }));
                Cesium.CesiumTerrainProvider.fromUrl(new Cesium.Resource({
                    url: 'https://api.maptiler.com/tiles/terrain-quantized-mesh-v2/',
                    queryParameters: { key: maptilerKey },
                }), { requestVertexNormals: true }).then(tp => {
                    if (!stopped && viewerRef.current && !viewerRef.current.isDestroyed()) viewerRef.current.terrainProvider = tp;
                }).catch(() => { });
            } else {
                // Fallback: OpenStreetMap tiles (no API key required) so the globe is
                // never a plain black void when NEXT_PUBLIC_MAPTILER_KEY is not set.
                viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
                    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    maximumLevel: 19,
                    credit: new Cesium.Credit('© OpenStreetMap contributors'),
                }));
                // Load Cesium World Terrain using the Ion token we already set above
                Cesium.createWorldTerrainAsync({ requestVertexNormals: true }).then(tp => {
                    if (!stopped && viewerRef.current && !viewerRef.current.isDestroyed()) viewerRef.current.terrainProvider = tp;
                }).catch(() => { });
            }
            viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a0e1a');
            viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0a0e1a');
            viewerRef.current = viewer;
            setCesiumReady(true);

            const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
            handler.setInputAction((mv: any) => {
                const picked = viewer.scene.pick(mv.endPosition);
                if (Cesium.defined(picked) && picked.id) {
                    const entity = picked.id as CesiumType.Entity;
                    const eid = entity.id as string;
                    const props = entity.properties;
                    const kind = (props?.kind?.getValue() as string | undefined) ?? (eid.includes('-node-') ? 'node' : eid.includes('-sig-') ? 'signal' : eid.includes('-track-') ? 'corridor' : null);
                    if (kind === 'node' || kind === 'signal') {
                        const meta = (props?.meta?.getValue() as Record<string, unknown>) ?? {};
                        const details: { label: string; value: string }[] = [];
                        if (kind === 'node') { if (meta['type']) details.push({ label: 'TYPE', value: String(meta['type']).toUpperCase() }); if (meta['cc']) details.push({ label: 'COUNTRY', value: String(meta['cc']) }); if (meta['prec']) details.push({ label: 'PRECISION', value: String(meta['prec']) }); if (meta['km'] != null) details.push({ label: 'KM', value: String(meta['km']) }); }
                        else { if (meta['type']) details.push({ label: 'SIGNAL', value: String(meta['type']) }); if (meta['source']) details.push({ label: 'SOURCE', value: String(meta['source']) }); details.push({ label: 'SCORE', value: Number(meta['score'] ?? 0).toFixed(3) }); }
                        if (meta['lat'] != null && meta['lng'] != null) details.push({ label: 'COORD', value: `${Number(meta['lat']).toFixed(4)}, ${Number(meta['lng']).toFixed(4)}` });
                        setHoverInfo({ x: mv.endPosition.x, y: mv.endPosition.y, title: entity.label?.text?.getValue(Cesium.JulianDate.now()) as string ?? eid, subtitle: kind === 'node' ? 'CORRIDOR NODE' : 'EVIDENCE ATOM', color: T.green, details });
                        return;
                    }
                    if (kind === 'corridor') { const cid = (props?.corridorId?.getValue() as string) ?? eid.split('-track-')[0]; setHoverInfo({ x: mv.endPosition.x, y: mv.endPosition.y, title: cid, subtitle: 'CORRIDOR TRACK', color: T.sub }); return; }
                }
                setHoverInfo(null);
            }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

            handler.setInputAction((click: any) => {
                const picked = viewer.scene.pick(click.position);
                if (Cesium.defined(picked) && picked.id) {
                    const entity = picked.id as CesiumType.Entity;
                    const eid = entity.id as string;
                    const props = entity.properties;
                    const kind = (props?.kind?.getValue() as string | undefined) ?? (eid.includes('-track-') ? 'corridor' : eid.includes('-node-') ? 'node' : eid.includes('-sig-') ? 'signal' : null);
                    if (kind === 'corridor') { 
                        const cid = (props?.corridorId?.getValue() as string) ?? eid.split('-track-')[0]; 
                        const found = corridors.find(c => c.id === cid); 
                        if (found) setSelId(found.id); 
                    }
                    else if (kind === 'signal' || kind === 'node') { 
                        const cid = (props?.corridorId?.getValue() as string) ?? ((props?.meta?.getValue() as Record<string, unknown>)?.['corridorId'] as string); 
                        if (cid) { 
                            setSelId(cid); 
                            setTab(kind === 'signal' ? 'evidence' : 'brief'); 
                        } 
                    }
                }
            }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

            const c0 = corridors[0]?.cameraCenter ?? { lat: -1.52, lng: 34.13, alt: 180000, tilt: 52, heading: 195 };
            viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(c0.lng, c0.lat, c0.alt), orientation: { heading: Cesium.Math.toRadians(c0.heading), pitch: Cesium.Math.toRadians(-50), roll: 0 } });
        }, 200);
        return () => { stopped = true; clearInterval(check); if (viewerRef.current && !viewerRef.current.isDestroyed()) viewerRef.current.destroy(); viewerRef.current = null; };
    }, []);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed() || !cesiumReady || !window.Cesium) return;
        const Cesium = window.Cesium;
        if (terrainRelief) {
            viewer.scene.globe.material = Cesium.createElevationBandMaterial({ scene: viewer.scene, layers: [{ entries: [{ height: 0, color: new Cesium.Color(0.20, 0.31, 0.19, 0.55) }, { height: 500, color: new Cesium.Color(0.36, 0.53, 0.26, 0.50) }, { height: 1200, color: new Cesium.Color(0.90, 0.85, 0.65, 0.45) }, { height: 2000, color: new Cesium.Color(0.99, 0.78, 0.44, 0.45) }, { height: 2800, color: new Cesium.Color(0.75, 0.62, 0.54, 0.50) }, { height: 4000, color: new Cesium.Color(0.94, 0.94, 0.94, 0.55) }], extendDownwards: true, extendUpwards: true }] });
            viewer.scene.globe.enableLighting = true;
        } else { viewer.scene.globe.material = undefined as unknown as CesiumType.Material; viewer.scene.globe.enableLighting = false; }
    }, [cesiumReady, terrainRelief]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed() || !cesiumReady) return;
        viewer.scene.verticalExaggeration = terrainExaggeration ? 2.5 : 1.0;
        viewer.scene.verticalExaggerationRelativeHeight = terrainExaggeration ? 1200.0 : 0.0;
    }, [cesiumReady, terrainExaggeration]);

    // Google Photorealistic 3D Tiles — viewer-8qsfg.js
    // globe: false, skyAtmosphere: true, createGooglePhotorealistic3DTileset,
    // GeoJSON footprint (Ion 2533131) clampToGround, ClippingPolygonCollection,
    // building tileset (Ion 2533124), inverse clip — all four toggles wired.
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed() || !cesiumReady || !window.Cesium) return;
        const Cesium = window.Cesium;

        if (photoReal) {
            viewer.scene.globe.show = false;
            viewer.scene.skyAtmosphere.show = true;

            Cesium.createGooglePhotorealistic3DTileset({
                onlyUsingWithGoogleGeocoder: true,
            }).then((tileset: CesiumType.Cesium3DTileset) => {
                if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
                viewer.scene.primitives.add(tileset);
                googleTilesetRef.current = tileset;

                // Load footprint from Ion 2533131 and attach clipping polygons to the tileset
                // — matches viewer-8qsfg.js: googleTileset.clippingPolygons = clippingPolygons
                Cesium.IonResource.fromAssetId(2533131).then((resource: CesiumType.IonResource) =>
                    (Cesium as any).GeoJsonDataSource.load(resource, { clampToGround: true })
                ).then((ds: CesiumType.GeoJsonDataSource) => {
                    if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
                    viewer.dataSources.add(ds);
                    const fp = ds.entities.values.find((e: CesiumType.Entity) => (Cesium as any).defined(e.polygon));
                    if (fp && googleTilesetRef.current) {
                        (fp.polygon as any).outline = false;
                        const positions = (fp.polygon as any).hierarchy.getValue().positions;
                        const clippingPolygons = new (Cesium as any).ClippingPolygonCollection({
                            polygons: [new (Cesium as any).ClippingPolygon({ positions })],
                        });
                        (googleTilesetRef.current as any).clippingPolygons = clippingPolygons;
                    }
                }).catch(() => {});
            }).catch(() => {});
        } else {
            if (googleTilesetRef.current) {
                viewer.scene.primitives.remove(googleTilesetRef.current);
                googleTilesetRef.current = null;
            }
            viewer.scene.globe.show = true;
            viewer.scene.skyAtmosphere.show = false;
        }
    }, [cesiumReady, photoReal]);

    // Google 2D satellite base + styled road overlay — from asset-id-l10i1.js (Ion asset 3830184)
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed() || !cesiumReady || !window.Cesium) return;
        const Cesium = window.Cesium;
        const G2D_ASSET = 3830184;

        if (showRoadOverlay) {
            // Add road overlay layer on top of existing imagery
            const overlayLayer = Cesium.ImageryLayer.fromProviderAsync(
                (Cesium as any).Google2DImageryProvider
                    ? (Cesium as any).Google2DImageryProvider.fromIonAssetId({
                        assetId: G2D_ASSET,
                        overlayLayerType: 'layerRoadmap',
                        styles: [
                            { stylers: [{ hue: '#00ffe6' }, { saturation: -20 }] },
                            { featureType: 'road', elementType: 'geometry', stylers: [{ lightness: 100 }, { visibility: 'simplified' }] },
                        ],
                    })
                    : Promise.resolve(new Cesium.UrlTemplateImageryProvider({
                        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        credit: new Cesium.Credit('© OpenStreetMap'),
                        maximumLevel: 19,
                    })),
                {},
            );
            overlayLayer.alpha = 0.55;
            viewer.imageryLayers.add(overlayLayer);
            roadOverlayLayerRef.current = overlayLayer;
        } else {
            if (roadOverlayLayerRef.current) {
                viewer.imageryLayers.remove(roadOverlayLayerRef.current, true);
                roadOverlayLayerRef.current = null;
            }
        }
    }, [cesiumReady, showRoadOverlay]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed() || !cesiumReady || !window.Cesium) return;
        const Cesium = window.Cesium;
        for (const id of entityIdsRef.current) viewer.entities.removeById(id);
        entityIdsRef.current = [];

        for (const cor of corridors) {
            const corRc = RISK[cor.riskClass] ?? T.muted;
            const isActive = cor.activated;
            const isSel = cor.id === selId;
            if (!cor.pathCoords || !Array.isArray(cor.pathCoords) || cor.pathCoords.length === 0) continue;
            const positions = Cesium.Cartesian3.fromDegreesArray(cor.pathCoords.flatMap(p => [p.lng, p.lat]));
            const startPos = cor.pathCoords[0]!;
            const endPos = cor.pathCoords[cor.pathCoords.length - 1]!;

            if (showOfficialRoute) {
                const formalId = `${cor.id}-formal-route`;
                viewer.entities.add({
                    id: formalId, properties: { kind: 'formal', corridorId: cor.id },
                    polyline: { positions: Cesium.Cartesian3.fromDegreesArray([startPos.lng, startPos.lat, endPos.lng, endPos.lat]), width: isSel ? 2 : 1.5, material: Cesium.Color.fromCssColorString(T.blue).withAlpha(isSel ? 0.8 : 0.4), clampToGround: true }
                });
                entityIdsRef.current.push(formalId);
            }
            const ribbonId = `${cor.id}-track-ribbon`;
            viewer.entities.add({ id: ribbonId, properties: { kind: 'corridor', corridorId: cor.id }, polyline: { positions, clampToGround: true, width: (isSel ? 28 : 16) * (cor.score ?? 0), material: Cesium.Color.fromCssColorString(corRc).withAlpha(isSel ? 0.13 : 0.06) } });
            entityIdsRef.current.push(ribbonId);

            const flowId = `${cor.id}-track-flow`;
            viewer.entities.add({ id: flowId, properties: { kind: 'corridor', corridorId: cor.id }, polyline: { positions, clampToGround: true, width: isSel ? 6 : 3.5, material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString(corRc).withAlpha(isActive ? 0.6 : 0.25), dashLength: isSel ? 20 : 12, dashPattern: 255 }) } });
            entityIdsRef.current.push(flowId);

            const spineId = `${cor.id}-track-spine`;
            viewer.entities.add({ id: spineId, properties: { kind: 'corridor', corridorId: cor.id }, polyline: { positions, clampToGround: true, width: isSel ? 4 : 2, material: Cesium.Color.fromCssColorString(corRc).withAlpha(isActive ? (isSel ? 1.0 : 0.65) : 0.30) } });
            entityIdsRef.current.push(spineId);

            for (const node of cor.nodes) {
                if (showGapAnalysis) {
                    if (node.type === 'border' || node.type === 'start' || node.type === 'end') {
                        const isBorder = node.type === 'border';
                        const gapCovId = `${cor.id}-gap-cov-${node.name}`;
                        // outline: true is unsupported on terrain-clamped geometry — Cesium ignores it
                        // and logs a warning. Use a thin outer fill ellipse for the ring effect instead.
                        viewer.entities.add({ id: gapCovId, position: Cesium.Cartesian3.fromDegrees(node.lng, node.lat), ellipse: { semiMinorAxis: isBorder ? 12000 : 8000, semiMajorAxis: isBorder ? 12000 : 8000, material: Cesium.Color.fromCssColorString(isBorder ? T.blue : T.sub).withAlpha(isBorder ? 0.15 : 0.05), outline: false, classificationType: Cesium.ClassificationType.TERRAIN } });
                        entityIdsRef.current.push(gapCovId);
                    }
                    if (node.type === 'phantom') {
                        const bzId = `${cor.id}-gap-blind-${node.name}`;
                        viewer.entities.add({ id: bzId, polyline: { positions: Cesium.Cartesian3.fromDegreesArray([node.lng - 0.2, node.lat - 0.1, node.lng + 0.2, node.lat + 0.1]), width: 8, material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.2, taperPower: 0.5, color: Cesium.Color.fromCssColorString(T.red).withAlpha(0.8) }), clampToGround: true } });
                        entityIdsRef.current.push(bzId);
                    }
                }
                const nc = node.type === 'phantom' ? T.amber : node.type === 'border' ? T.blue : corRc;
                const nodeId = `${cor.id}-node-${node.name}`;
                viewer.entities.add({ id: nodeId, properties: { kind: 'node', corridorId: cor.id, meta: { ...node, corridorId: cor.id } }, position: Cesium.Cartesian3.fromDegrees(node.lng, node.lat), point: { pixelSize: node.type === 'phantom' ? (isSel ? 14 : 9) : (isSel ? 11 : 6), color: Cesium.Color.fromCssColorString(nc), outlineColor: Cesium.Color.fromCssColorString(T.bg), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND }, label: isSel ? { text: node.name, font: '11px "IBM Plex Mono",monospace', fillColor: Cesium.Color.fromCssColorString(nc), outlineColor: Cesium.Color.fromCssColorString(T.bg), outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, horizontalOrigin: Cesium.HorizontalOrigin.CENTER, pixelOffset: new Cesium.Cartesian2(0, -16), disableDepthTestDistance: Number.POSITIVE_INFINITY, scale: 0.95 } : undefined });
                entityIdsRef.current.push(nodeId);
            }
            if (isSel) {
                for (const sig of cor.evidence) {
                    const sc = SIGTYPE[sig.type] ?? T.sub;
                    const sigId = `${cor.id}-sig-${sig.id}`;
                    viewer.entities.add({ id: sigId, properties: { kind: 'signal', corridorId: cor.id, meta: { ...sig, corridorId: cor.id } }, position: Cesium.Cartesian3.fromDegrees(sig.lng, sig.lat), point: { pixelSize: new Cesium.CallbackProperty(() => { if (currentDay < sig.day) return 0; const diff = currentDay - sig.day; return diff < 0.5 ? 14 * (1 + (0.5 - diff) * 2) : Math.max(7, 14 - diff * 0.5); }, false), color: new Cesium.CallbackProperty(() => Cesium.Color.fromCssColorString(sc).withAlpha(currentDay >= sig.day ? 1 : 0), false), outlineColor: Cesium.Color.fromCssColorString(T.bg), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND }, label: { text: sig.id, show: new Cesium.CallbackProperty(() => currentDay >= sig.day, false), font: '10px "IBM Plex Mono",monospace', fillColor: Cesium.Color.fromCssColorString(sc), outlineColor: Cesium.Color.fromCssColorString(T.bg), outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, horizontalOrigin: Cesium.HorizontalOrigin.CENTER, pixelOffset: new Cesium.Cartesian2(0, -14), disableDepthTestDistance: Number.POSITIVE_INFINITY, scale: 0.85 } });
                    entityIdsRef.current.push(sigId);
                }
            }
        }
    }, [cesiumReady, selId, currentDay, showGapAnalysis, showOfficialRoute, corridors]);

    const flyToCorridorCamera = useCallback(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed() || !window.Cesium) return;
        if (!corridor) return;
        const cam = corridor?.cameraCenter;
        const lng = typeof cam?.lng === 'number' ? cam.lng : null;
        const lat = typeof cam?.lat === 'number' ? cam.lat : null;
        const alt = typeof cam?.alt === 'number' ? cam.alt : null;
        if (lng === null || lat === null || alt === null) return;
        const Cesium = window.Cesium;
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lng, lat, alt),
            orientation: { heading: Cesium.Math.toRadians(typeof cam?.heading === 'number' ? cam.heading : 0), pitch: Cesium.Math.toRadians(-50), roll: 0 },
            duration: 1.8,
            easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT
        });
    }, [corridor]);

    useEffect(() => { if (cesiumReady) flyToCorridorCamera(); }, [cesiumReady, flyToCorridorCamera]);

    const TABS = [{ k: 'evidence' as const, label: 'EVIDENCE' }, { k: 'cascade' as const, label: 'CASCADE' }, { k: 'scores' as const, label: 'SCORES' }, { k: 'brief' as const, label: 'BRIEF' }];

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        @keyframes poe-dot{0%,100%{opacity:1}50%{opacity:.2}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .cesium-widget-credits,.cesium-viewer-bottom{display:none!important}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:${T.surf}}::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px}
      `}</style>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: T.bg, color: T.text, fontFamily: "'IBM Plex Mono',monospace", overflow: 'hidden' }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 18px', background: T.surf, borderBottom: `1px solid ${T.border}`, flexShrink: 0, zIndex: 10 }}>
                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 4, color: T.green, flexShrink: 0 }}>◉⟁⬡ PHANTOM POE</span>
                    <span style={{ fontSize: 7, color: T.muted, letterSpacing: 1.5, flexShrink: 0 }}>CORRIDOR INTELLIGENCE · {RUN_ID}</span>
                    <div style={{ flex: 1, fontSize: 8, color: T.sub, textAlign: 'center', fontStyle: 'italic' }}>&ldquo;We listen to where the earth is being walked.&rdquo;</div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 7 }}>
                        <span style={{ color: T.muted }}>{clock}</span>
                        {corridor && <span style={{ padding: '2px 8px', border: `1px solid ${rc}40`, color: rc }}>{corridor.riskClass}</span>}
                    </div>
                </div>

                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

                    {showSidebar && (
                        <div style={{ width: 215, flexShrink: 0, background: T.surf, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', zIndex: 5 }}>
                            <div style={{ padding: '8px 14px 6px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 7, letterSpacing: 1.8, color: T.muted }}>CORRIDORS</span>
                                <span style={{ fontSize: 7, color: T.green }}>{corridors.length} ACTIVE</span>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {corridors.map(c => <CorridorCard key={c.id} c={c} sel={selId === c.id} onClick={() => { setSelId(c.id); setTimeout(flyToCorridorCamera, 50); }} />)}
                            </div>
                            <div style={{ padding: '9px 14px', borderTop: `1px solid ${T.border}` }}>
                                <div style={{ fontSize: 7, letterSpacing: 1.5, color: T.muted, marginBottom: 6 }}>LAYERS</div>
                                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8 }}>
                                    OFFICIAL ROUTE <input type="checkbox" checked={showOfficialRoute} onChange={e => setShowOfficialRoute(e.target.checked)} />
                                </label>
                                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, marginTop: 4 }}>
                                    GAP ANALYSIS <input type="checkbox" checked={showGapAnalysis} onChange={e => setShowGapAnalysis(e.target.checked)} />
                                </label>
                                {/* Cascade source signal layer — ACLED/DTM/DHIS2 markers on terrain */}
                                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, marginTop: 4, color: showCascadeLayer ? SOURCE_COLOR['AFRO-SENTINEL'] : T.sub }}>
                                    CASCADE SIGNALS <input type="checkbox" checked={showCascadeLayer} onChange={e => setShowCascadeLayer(e.target.checked)} />
                                </label>
                                {showCascadeLayer && cascadeData && (
                                    <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        {Object.entries(SOURCE_COLOR).filter(([k]) => !['entropy_spike','phantom_poe'].includes(k)).map(([src, col]) => (
                                            <div key={src} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: col, flexShrink: 0 }} />
                                                <span style={{ fontSize: 7, color: T.muted }}>{src}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div style={{ height: 1, background: T.border, margin: '6px 0' }} />
                                <div style={{ fontSize: 7, letterSpacing: 1.5, color: T.muted, marginBottom: 6 }}>TERRAIN</div>
                                {/* Photorealistic 3D Tiles — viewer-4AbUS.js */}
                                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: photoReal ? T.green : T.sub }}>
                                    PHOTO REAL 3D
                                    <input type="checkbox" checked={photoReal} onChange={e => setPhotoReal(e.target.checked)} />
                                </label>
                                {/* Google road overlay — asset-id-l10i1.js (Ion asset 3830184) */}
                                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, marginTop: 4, color: showRoadOverlay ? T.teal : T.sub }}>
                                    ROAD OVERLAY
                                    <input type="checkbox" checked={showRoadOverlay} onChange={e => setShowRoadOverlay(e.target.checked)} />
                                </label>
                            </div>
                        </div>
                    )}

                    <div style={{ flex: 1, position: 'relative' }}>
                        <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />
                        {hoverInfo && (
                            <div style={{ position: 'absolute', left: hoverInfo.x + 15, top: hoverInfo.y - 15, background: `${T.card}EE`, borderLeft: `4px solid ${hoverInfo.color}`, padding: '9px 13px', borderRadius: 3, zIndex: 1000 }}>
                                <div style={{ fontSize: 7, color: T.muted }}>{hoverInfo.subtitle}</div>
                                <div style={{ fontSize: 14, color: hoverInfo.color }}>{hoverInfo.title}</div>
                            </div>
                        )}
                        <div style={{ position: 'absolute', top: 12, right: 14, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <button onClick={() => setShowSidebar(!showSidebar)} style={{ background: T.surf, border: `1px solid ${T.border}`, color: T.sub, padding: '4px 10px', fontSize: 7 }}>{showSidebar ? 'HIDE LIST' : 'SHOW LIST'}</button>
                        </div>
                        {/* Terrain inset — elevation/slope/aspect shading with contour lines
                            and corridor footprint polygon, per get-elevation-contour-material.js
                            and viewer-638QR.js reference patterns */}
                        {cesiumReady && (
                            <TerrainInset
                                corridor={corridor}
                                ionToken={process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiMmRmYzcxNC0yZjM5LTQ0NzUtYWRkYi1kMjc1NzYwYTQ0NjYiLCJpZCI6MjE0OTQzLCJpYXQiOjE3MTU2NTMyNjN9.1fW--_-6R3TApPF2tAlOfXrqJadYPdwKqpPVkPetHP4'}
                            />
                        )}
                    </div>

                    <div style={{ width: 285, flexShrink: 0, background: T.surf, borderLeft: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', zIndex: 5 }}>
                        {corridor && (
                            <div style={{ padding: '10px 13px', borderBottom: `1px solid ${T.border}` }}>
                                <div style={{ fontSize: 13, color: rc, letterSpacing: 2 }}>{corridor.id}</div>
                                <div style={{ fontSize: 11, color: T.text, fontWeight: 700 }}>{(corridor.score ?? 0).toFixed(4)}</div>
                            </div>
                        )}
                        <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}` }}>
                            {TABS.map(t => (
                                <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, padding: '6px 0', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t.k ? rc : 'transparent'}`, color: tab === t.k ? rc : T.muted, fontSize: 7, cursor: 'pointer' }}>{t.label}</button>
                            ))}
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {corridor && tab === 'evidence' && <EvidenceTab corridor={corridor} currentDay={currentDay} />}
                            {corridor && tab === 'cascade' && <CascadeTab corridor={corridor} currentDay={currentDay} timeWindow={timeWindow} />}
                            {corridor && tab === 'scores' && <ScoresTab corridor={corridor} />}
                            {corridor && tab === 'brief' && <BriefTab corridor={corridor} />}
                        </div>
                    </div>
                </div>

                <div style={{ background: T.surf, borderTop: `1px solid ${T.border}`, padding: '8px 16px', zIndex: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => setPlaying(!playing)} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.text, padding: '4px 12px', fontSize: 8 }}>{playing ? 'PAUSE' : 'PLAY'}</button>
                        <input type="range" min={0} max={maxDay} value={isNaN(currentDay) ? 0 : currentDay} step={0.1} onChange={e => setCurrentDay(Number(e.target.value))} style={{ flex: 1, accentColor: rc }} />
                        <span style={{ fontSize: 10, color: rc, minWidth: 40 }}>D{(currentDay ?? 0).toFixed(1)}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {(['7D', '14D', '30D', '12W', '6M', '1Y'] as TimeWindow[]).map(w => (
                                <button key={w} onClick={() => setTimeWindow(w)} style={{ background: timeWindow === w ? rc : 'none', color: timeWindow === w ? T.bg : T.sub, border: 'none', padding: '2px 6px', fontSize: 7, cursor: 'pointer' }}>{w}</button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
