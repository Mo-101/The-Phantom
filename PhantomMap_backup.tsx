'use client';

/**
 * ◉⟁⬡  MoStar Industries
 * Phantom POE Engine — CesiumJS Globe + MapTiler Satellite Tiles
 *
 * Corridor paths as PolylineGlowMaterial entities
 * Signal atoms + phantom nodes as Cesium point/label entities
 * MapTiler satellite imagery · queryable terrain via sampleTerrain
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type * as CesiumType from 'cesium';

// ─────────────────────────────────────────────────────────────
// TOKENS
// ─────────────────────────────────────────────────────────────

const T = {
    bg: '#070A10',
    surf: '#0D1020',
    card: '#121626',
    border: '#1C2035',
    green: '#00E87A',
    amber: '#F5A623',
    red: '#FF453A',
    pink: '#FF0066',
    blue: '#009ADE',
    teal: '#3DD9C4',
    purple: '#8B7CF8',
    text: '#D8DCF0',
    sub: '#828AB5',
    muted: '#3A3F5C',
    dim: '#1C2035',
};

const RISK: Record<string, string> = {
    CRITICAL: '#FF0066',
    HIGH: '#FF453A',
    MEDIUM: '#F5A623',
    LOW: '#00E87A',
};

const SIGTYPE: Record<string, string> = {
    HEALTH: '#FF6B8A',
    DISPLACEMENT: '#3DD9C4',
    CONFLICT: '#FF453A',
    ENTROPY: '#F5A623',
    LINGUISTIC: '#8B7CF8',
};

const PREC_LABEL: Record<string, string> = {
    PRECISE: 'PRECISE·GPS',
    SETTLEMENT: 'SETTLEMENT',
    DISTRICT: 'DISTRICT',
    INFERRED: 'INFERRED',
};

const PREC_COLOR: Record<string, string> = {
    PRECISE: '#00E87A',
    SETTLEMENT: '#3DD9C4',
    DISTRICT: '#F5A623',
    INFERRED: '#3A3F5C',
};

// ─────────────────────────────────────────────────────────────
// DATA TYPES
// ─────────────────────────────────────────────────────────────

interface CorridorNode {
    name: string;
    lat: number;
    lng: number;
    alt: number;
    type: 'start' | 'end' | 'border' | 'phantom';
    cc: string;
    km: number;
    prec: 'PRECISE' | 'SETTLEMENT' | 'DISTRICT' | 'INFERRED';
}

interface EvidenceAtom {
    id: string;
    day: number;
    km: number;
    type: string;
    tag: string;
    loc: string;
    cc: string;
    score: number;
    source: string;
    prec: string;
    sourceId: string;
    lat: number;
    lng: number;
    alt: number;
}

interface SoulScore {
    key: string;
    sym: string;
    s: string;
    name: string;
    w: number;
    desc: string;
    value: number;
}

interface Corridor {
    id: string;
    short: string;
    region: string;
    score: number;
    riskClass: string;
    activated: boolean;
    startNode: string;
    endNode: string;
    startCC: string;
    endCC: string;
    mode: string;
    velocity: number;
    totalKm: number;
    seasonal: boolean;
    canoe: boolean;
    detour: boolean;
    firstDetected: string;
    coverage: string;
    nearestFormal: string;
    gapZone: boolean;
    cameraCenter: { lat: number; lng: number; alt: number; tilt: number; heading: number };
    pathCoords: Array<{ lat: number; lng: number; alt: number }>;
    nodes: CorridorNode[];
    souls: SoulScore[];
    evidence: EvidenceAtom[];
}

// ─────────────────────────────────────────────────────────────
// CORRIDOR DATA (replace with /api/corridors in production)
// ─────────────────────────────────────────────────────────────

const CORRIDORS: Corridor[] = [
    {
        id: 'CORRIDOR-KE-TZ-047',
        short: 'KE → TZ · 047',
        region: 'Lwanda–Bunda · Kenya / Tanzania',
        score: 0.7887,
        riskClass: 'HIGH',
        activated: true,
        startNode: 'Lwanda',
        endNode: 'Bunda',
        startCC: 'KE',
        endCC: 'TZ',
        mode: 'MOTORCYCLE',
        velocity: 18,
        totalKm: 95,
        seasonal: true,
        canoe: false,
        detour: false,
        firstDetected: '14 Mar 2026 · 06:23 UTC',
        coverage: '120km of unmonitored border',
        nearestFormal: 'Isebania (partial surveillance)',
        gapZone: true,
        cameraCenter: { lat: -1.52, lng: 34.13, alt: 180000, tilt: 52, heading: 195 },
        pathCoords: [
            { lat: -0.60, lng: 34.10, alt: 1280 },
            { lat: -0.82, lng: 34.35, alt: 1320 },
            { lat: -1.07, lng: 34.76, alt: 1350 },
            { lat: -1.30, lng: 34.40, alt: 1290 },
            { lat: -1.55, lng: 33.95, alt: 1180 },
            { lat: -1.90, lng: 33.87, alt: 1120 },
            { lat: -2.20, lng: 33.83, alt: 1080 },
            { lat: -2.45, lng: 33.80, alt: 1150 },
        ],
        nodes: [
            { name: 'Lwanda', lat: -0.60, lng: 34.10, alt: 1280, type: 'start', cc: 'KE', km: 0, prec: 'PRECISE' },
            { name: 'Isebania', lat: -1.07, lng: 34.76, alt: 1350, type: 'border', cc: 'KE', km: 36, prec: 'SETTLEMENT' },
            { name: 'Forest Jcn.', lat: -1.55, lng: 33.95, alt: 1180, type: 'phantom', cc: 'TZ', km: 62, prec: 'INFERRED' },
            { name: 'Bunda', lat: -2.45, lng: 33.80, alt: 1150, type: 'end', cc: 'TZ', km: 95, prec: 'SETTLEMENT' },
        ],
        souls: [
            { key: 'gravity', sym: '🜁', s: 'S1', name: 'Gravity', w: 0.10, desc: 'Population × market pull', value: 0.72 },
            { key: 'diffusion', sym: '🜂', s: 'S2', name: 'Diffusion', w: 0.20, desc: 'Outbreak timing → path', value: 0.88 },
            { key: 'centrality', sym: '🜃', s: 'S3', name: 'Centrality', w: 0.15, desc: 'Betweenness · no formal POE', value: 0.81 },
            { key: 'hmm', sym: '🜄', s: 'S4', name: 'HMM', w: 0.20, desc: 'Hidden Markov crossing prob', value: 0.79 },
            { key: 'seasonal', sym: '☿', s: 'S5', name: 'Seasonal', w: 0.08, desc: '52-week Fourier harmonic', value: 0.65 },
            { key: 'linguistic', sym: '♄', s: 'S6', name: 'Linguistic', w: 0.10, desc: 'Language shift rate', value: 0.70 },
            { key: 'entropy', sym: '♃', s: 'S7', name: 'Entropy', w: 0.12, desc: 'Shannon ΔH spike detection', value: 0.91 },
            { key: 'friction', sym: '⛰', s: 'T', name: 'Terrain', w: 0.05, desc: 'Least-cost path physics', value: 0.60 },
        ],
        evidence: [
            { id: 'E1', day: 1, km: 0, type: 'HEALTH', tag: 'CHOLERA ↑', loc: 'Lwanda Health Centre', cc: 'KE', score: .88, source: 'AFRO-SENTINEL', prec: 'SETTLEMENT', sourceId: 'SIG-001247', lat: -0.60, lng: 34.10, alt: 1280 },
            { id: 'E2', day: 2, km: 14, type: 'DISPLACEMENT', tag: 'MOBILITY FLUX', loc: 'Migori North', cc: 'KE', score: .82, source: 'IOM-DTM', prec: 'DISTRICT', sourceId: 'DTM-783421', lat: -0.82, lng: 34.35, alt: 1320 },
            { id: 'E3', day: 3, km: 36, type: 'CONFLICT', tag: 'ROUTE DETOUR', loc: 'Isebania Road', cc: 'KE', score: .78, source: 'ACLED', prec: 'PRECISE', sourceId: 'ACL-20260311', lat: -1.07, lng: 34.76, alt: 1350 },
            { id: 'E4', day: 3, km: 38, type: 'HEALTH', tag: 'CHOLERA ↑', loc: 'Isebania Market', cc: 'KE', score: .91, source: 'DHIS2', prec: 'SETTLEMENT', sourceId: 'DHIS-KE-889', lat: -1.10, lng: 34.72, alt: 1340 },
            { id: 'E5', day: 5, km: 62, type: 'ENTROPY', tag: 'ΔH=1.42', loc: 'Forest Junction', cc: 'TZ', score: .93, source: 'SOUL-7', prec: 'INFERRED', sourceId: 'ENT-2260314', lat: -1.55, lng: 33.95, alt: 1180 },
            { id: 'E6', day: 6, km: 95, type: 'HEALTH', tag: 'CHOLERA ↑', loc: 'Bunda Dist. Hospital', cc: 'TZ', score: .88, source: 'DHIS2', prec: 'SETTLEMENT', sourceId: 'DHIS-TZ-441', lat: -2.45, lng: 33.80, alt: 1150 },
        ],
    },
    {
        id: 'CORRIDOR-UG-CD-018',
        short: 'UG → CD · 018',
        region: 'Ishasha–Rutshuru · Uganda / DRC',
        score: 0.5834,
        riskClass: 'MEDIUM',
        activated: true,
        startNode: 'Ishasha',
        endNode: 'Rutshuru',
        startCC: 'UG',
        endCC: 'CD',
        mode: 'FOOT',
        velocity: 5,
        totalKm: 42,
        seasonal: true,
        canoe: false,
        detour: true,
        firstDetected: '11 Mar 2026 · 14:45 UTC',
        coverage: 'Virunga zone — no POE for 90km',
        nearestFormal: 'Kasindi (65km south)',
        gapZone: true,
        cameraCenter: { lat: -0.75, lng: 29.55, alt: 120000, tilt: 48, heading: 200 },
        pathCoords: [
            { lat: -0.50, lng: 29.72, alt: 920 },
            { lat: -0.68, lng: 29.58, alt: 1800 },
            { lat: -0.85, lng: 29.45, alt: 2100 },
            { lat: -1.20, lng: 29.28, alt: 1600 },
        ],
        nodes: [
            { name: 'Ishasha', lat: -0.50, lng: 29.72, alt: 920, type: 'start', cc: 'UG', km: 0, prec: 'SETTLEMENT' },
            { name: 'Virunga', lat: -0.85, lng: 29.45, alt: 2100, type: 'phantom', cc: 'CD', km: 24, prec: 'INFERRED' },
            { name: 'Rutshuru', lat: -1.20, lng: 29.28, alt: 1600, type: 'end', cc: 'CD', km: 42, prec: 'SETTLEMENT' },
        ],
        souls: [
            { key: 'gravity', sym: '🜁', s: 'S1', name: 'Gravity', w: 0.10, desc: 'Population × market pull', value: 0.52 },
            { key: 'diffusion', sym: '🜂', s: 'S2', name: 'Diffusion', w: 0.20, desc: 'Outbreak timing → path', value: 0.61 },
            { key: 'centrality', sym: '🜃', s: 'S3', name: 'Centrality', w: 0.15, desc: 'Betweenness · no formal POE', value: 0.68 },
            { key: 'hmm', sym: '🜄', s: 'S4', name: 'HMM', w: 0.20, desc: 'Hidden Markov crossing', value: 0.58 },
            { key: 'seasonal', sym: '☿', s: 'S5', name: 'Seasonal', w: 0.08, desc: '52-week Fourier harmonic', value: 0.71 },
            { key: 'linguistic', sym: '♄', s: 'S6', name: 'Linguistic', w: 0.10, desc: 'Language shift rate', value: 0.45 },
            { key: 'entropy', sym: '♃', s: 'S7', name: 'Entropy', w: 0.12, desc: 'Shannon ΔH spike', value: 0.62 },
            { key: 'friction', sym: '⛰', s: 'T', name: 'Terrain', w: 0.05, desc: 'Least-cost path physics', value: 0.44 },
        ],
        evidence: [
            { id: 'F1', day: 1, km: 0, type: 'DISPLACEMENT', tag: 'IDP FLOW', loc: 'Ishasha', cc: 'UG', score: .85, source: 'IOM-DTM', prec: 'SETTLEMENT', sourceId: 'DTM-991023', lat: -0.50, lng: 29.72, alt: 920 },
            { id: 'F2', day: 2, km: 18, type: 'CONFLICT', tag: 'ARMED GROUP', loc: 'Rutshuru', cc: 'CD', score: .80, source: 'ACLED', prec: 'PRECISE', sourceId: 'ACL-20260309', lat: -1.00, lng: 29.38, alt: 1700 },
            { id: 'F3', day: 4, km: 42, type: 'HEALTH', tag: 'MEASLES ↑', loc: 'Kiwanja', cc: 'CD', score: .76, source: 'AFRO-SENTINEL', prec: 'DISTRICT', sourceId: 'SIG-002109', lat: -1.20, lng: 29.28, alt: 1600 },
        ],
    },
];

const RUN_ID = 'RUN-20260314-X7Q2';

// ─────────────────────────────────────────────────────────────
// Cesium window type (runtime loaded from CDN, types from npm)
// ─────────────────────────────────────────────────────────────

declare global {
    interface Window {
        Cesium: typeof CesiumType;
        CESIUM_BASE_URL: string;
    }
}

// ─────────────────────────────────────────────────────────────
// PRIMITIVE COMPONENTS
// ─────────────────────────────────────────────────────────────

function Dot({ active, color }: { active: boolean; color: string }) {
    return (
        <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: active ? color : T.muted,
            display: 'inline-block',
            boxShadow: active ? `0 0 6px ${color}` : 'none',
            animation: active ? 'poe-dot 1.4s ease-in-out infinite' : 'none',
            flexShrink: 0,
        }} />
    );
}

function Bar({ value, color, height = 3 }: { value: number; color: string; height?: number }) {
    return (
        <div style={{ flex: 1, height, background: T.dim, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${value * 100}%`, background: color, borderRadius: 2 }} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// CORRIDOR CARD
// ─────────────────────────────────────────────────────────────

function CorridorCard({ c, sel, onClick }: { c: Corridor; sel: boolean; onClick: () => void }) {
    const rc = RISK[c.riskClass] ?? T.muted;
    return (
        <div onClick={onClick} style={{
            padding: '10px 14px',
            borderBottom: `1px solid ${T.border}`,
            borderLeft: `3px solid ${sel ? rc : 'transparent'}`,
            background: sel ? T.card : 'transparent',
            cursor: 'pointer',
            transition: 'background .12s',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 8, letterSpacing: .5, color: sel ? T.text : T.sub }}>{c.short}</span>
                <span style={{ fontSize: 6, padding: '1px 5px', background: `${rc}18`, color: rc, letterSpacing: .8 }}>{c.riskClass}</span>
            </div>
            <div style={{ fontSize: 7, color: T.muted, marginBottom: 6 }}>{c.startNode} → {c.endNode}</div>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 4 }}>
                <Bar value={c.score} color={rc} />
                <span style={{ fontSize: 9, color: rc, fontWeight: 600, minWidth: 34 }}>{c.score.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, fontSize: 6, color: T.muted, alignItems: 'center' }}>
                <span style={{ display: 'flex', gap: 3, alignItems: 'center', color: c.activated ? T.green : T.muted }}>
                    <Dot active={c.activated} color={T.green} />
                    {c.activated ? 'ACTIVE' : 'DORMANT'}
                </span>
                <span>{c.mode} · {c.velocity}km/d</span>
                {c.gapZone && <span style={{ color: T.amber }}>GAP</span>}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// EVIDENCE TAB
// ─────────────────────────────────────────────────────────────

function EvidenceTab({ corridor, currentDay }: { corridor: Corridor; currentDay: number }) {
    return (
        <div style={{ padding: '12px 13px' }}>
            <div style={{ fontSize: 6.5, letterSpacing: 2, color: T.muted, marginBottom: 10 }}>
                SIGNAL CHAIN · {corridor.evidence.filter(e => e.day <= currentDay).length}/{corridor.evidence.length} ATOMS
            </div>
            {corridor.evidence.map(a => {
                const tc = SIGTYPE[a.type] ?? T.sub;
                const vis = a.day <= currentDay;
                return (
                    <div key={a.id} style={{
                        marginBottom: 7, padding: '8px 10px',
                        background: vis ? T.card : T.surf,
                        borderRadius: 2,
                        borderLeft: `3px solid ${vis ? tc : T.border}`,
                        opacity: vis ? 1 : .3,
                        transition: 'all .3s',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 6, padding: '1px 5px', background: `${tc}18`, color: tc, letterSpacing: .7 }}>{a.type}</span>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span style={{ fontSize: 6, padding: '1px 5px', background: `${PREC_COLOR[a.prec] ?? T.muted}18`, color: PREC_COLOR[a.prec] ?? T.muted, letterSpacing: .6 }}>
                                    {PREC_LABEL[a.prec] ?? a.prec}
                                </span>
                                <span style={{ fontSize: 7, color: T.sub }}>D{a.day}</span>
                            </div>
                        </div>
                        <div style={{ fontSize: 9, color: vis ? T.text : T.sub, marginBottom: 3 }}>{a.loc}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 7, color: T.sub }}>{a.cc} · {a.source}</span>
                            <span style={{ fontSize: 7, color: tc, fontStyle: 'italic' }}>{a.tag}</span>
                        </div>
                        <div style={{ fontSize: 6, color: T.muted, marginBottom: 5 }}>{a.sourceId}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Bar value={a.score} color={tc} height={2} />
                            <span style={{ fontSize: 6.5, color: T.muted, minWidth: 30 }}>t:{a.score.toFixed(2)}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// SCORES TAB
// ─────────────────────────────────────────────────────────────

function ScoresTab({ corridor }: { corridor: Corridor }) {
    const rc = RISK[corridor.riskClass] ?? T.muted;
    return (
        <div style={{ padding: '12px 13px' }}>
            <div style={{ fontSize: 6.5, letterSpacing: 2, color: T.muted, marginBottom: 11 }}>
                7 MATHEMATICAL SOULS + TERRAIN PHYSICS
            </div>
            {corridor.souls.map(s => {
                const isHigh = s.value >= 0.78;
                return (
                    <div key={s.key} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span style={{ fontSize: 11, width: 16, textAlign: 'center', lineHeight: 1 }}>{s.sym}</span>
                                <div>
                                    <span style={{ fontSize: 6, color: T.muted }}>{s.s} </span>
                                    <span style={{ fontSize: 8, color: isHigh ? T.text : T.sub }}>{s.name}</span>
                                    {isHigh && <span style={{ fontSize: 6, color: rc, marginLeft: 5 }}>DRIVER</span>}
                                </div>
                            </div>
                            <span style={{ fontSize: 9, color: isHigh ? rc : T.sub, fontWeight: 600 }}>{s.value.toFixed(3)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 2 }}>
                            <Bar value={s.value} color={isHigh ? rc : `${rc}55`} height={4} />
                            <span style={{ fontSize: 6.5, color: T.muted, minWidth: 72, textAlign: 'right' }}>
                                ×{s.w.toFixed(2)}={(s.w * s.value).toFixed(4)}
                            </span>
                        </div>
                        <div style={{ fontSize: 6, color: T.border, paddingLeft: 22 }}>{s.desc}</div>
                    </div>
                );
            })}
            <div style={{
                marginTop: 12, padding: '9px 11px',
                background: `${rc}0E`, border: `1px solid ${rc}25`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
                <div>
                    <div style={{ fontSize: 6.5, color: T.sub, letterSpacing: 1 }}>WEIGHTED COMPOSITE</div>
                    <div style={{ fontSize: 6, color: T.muted, marginTop: 3 }}>
                        {corridor.riskClass} · {corridor.activated ? '◉ ACTIVATED' : '○ MONITORING'}
                    </div>
                    <div style={{ fontSize: 6, color: T.muted, marginTop: 1 }}>truth floor: 0.75</div>
                </div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, color: rc, letterSpacing: 2 }}>
                    {corridor.score.toFixed(4)}
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// CASCADE TAB
// ─────────────────────────────────────────────────────────────

function CascadeTab({ corridor, currentDay }: { corridor: Corridor; currentDay: number }) {
    const rc = RISK[corridor.riskClass] ?? T.muted;
    const maxDay = Math.max(...corridor.evidence.map(e => e.day)) + 1;
    const maxKm = corridor.totalKm;
    const CW = 268, CH = 210, padL = 42, padB = 28, padT = 14, padR = 20;
    const W = CW - padL - padR;
    const H = CH - padT - padB;
    function cx(day: number) { return padL + (day / maxDay) * W; }
    function cy(km: number) { return padT + H - (km / maxKm) * H; }
    const last = corridor.evidence[corridor.evidence.length - 1]!;
    const sources = [...new Set(corridor.evidence.map(e => e.source))];
    const phantomKm = corridor.nodes.find(n => n.type === 'phantom')?.km;
    const borderKm = corridor.nodes.find(n => n.type === 'border')?.km;
    return (
        <div style={{ padding: '12px 13px' }}>
            <div style={{ fontSize: 6.5, letterSpacing: 2, color: T.muted, marginBottom: 6 }}>SIGNAL CASCADE · SPATIAL-TEMPORAL PROOF</div>
            <div style={{ fontSize: 7, color: T.sub, lineHeight: 1.8, marginBottom: 10 }}>
                Consistent velocity across {sources.length} independent sources proves corridor reality.
            </div>
            <svg width={CW} height={CH} style={{ background: T.card, borderRadius: 2, display: 'block', marginBottom: 10 }}>
                <rect width={CW} height={CH} fill={T.card} />
                {[0, 25, 50, 75, 100].map((km, i) => (
                    <g key={i}>
                        <line x1={padL} y1={cy(km)} x2={CW - padR} y2={cy(km)} stroke={T.border} strokeWidth=".4" />
                        <text x={padL - 4} y={cy(km) + 4} fill={T.muted} fontSize="7" textAnchor="end" fontFamily="'IBM Plex Mono', monospace">{km}</text>
                    </g>
                ))}
                {[0, 2, 4, 6, 8].map(d => (
                    <g key={d}>
                        <line x1={cx(d)} y1={padT} x2={cx(d)} y2={padT + H} stroke={T.border} strokeWidth=".4" />
                        <text x={cx(d)} y={padT + H + 14} fill={T.muted} fontSize="7" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace">D{d}</text>
                    </g>
                ))}
                {borderKm !== undefined && <>
                    <line x1={padL} y1={cy(borderKm)} x2={CW - padR} y2={cy(borderKm)} stroke={T.blue} strokeWidth=".7" strokeDasharray="5,4" opacity=".7" />
                    <text x={CW - padR + 2} y={cy(borderKm) + 4} fill={T.blue} fontSize="6" fontFamily="'IBM Plex Mono', monospace">border</text>
                </>}
                {phantomKm !== undefined && <>
                    <line x1={padL} y1={cy(phantomKm)} x2={CW - padR} y2={cy(phantomKm)} stroke={T.amber} strokeWidth=".7" strokeDasharray="3,3" opacity=".8" />
                    <text x={CW - padR + 2} y={cy(phantomKm) + 4} fill={T.amber} fontSize="6" fontFamily="'IBM Plex Mono', monospace">phantom</text>
                </>}
                <line x1={cx(0)} y1={cy(0)} x2={cx(last.day)} y2={cy(last.km)} stroke={rc} strokeWidth=".8" strokeDasharray="3,3" opacity=".4" />
                {corridor.evidence.map(sig => {
                    const sc = SIGTYPE[sig.type] ?? T.sub;
                    const vis = sig.day <= currentDay;
                    return (
                        <g key={sig.id}>
                            {sig.type === 'ENTROPY' && (
                                <circle cx={cx(sig.day)} cy={cy(sig.km)} r={9} fill={`${T.amber}12`} stroke={T.amber} strokeWidth=".5" />
                            )}
                            <circle cx={cx(sig.day)} cy={cy(sig.km)} r={3.5} fill={vis ? sc : `${sc}30`} stroke={vis ? T.bg : T.border} strokeWidth="1" />
                            <text x={cx(sig.day) + 6} y={cy(sig.km) - 3} fill={vis ? sc : T.border} fontSize="6" fontFamily="'IBM Plex Mono', monospace">{sig.id}</text>
                        </g>
                    );
                })}
                <line x1={padL} y1={padT} x2={padL} y2={padT + H} stroke={T.border} strokeWidth=".8" />
                <line x1={padL} y1={padT + H} x2={CW - padR} y2={padT + H} stroke={T.border} strokeWidth=".8" />
                <text x={padL - 16} y={padT + H / 2} fill={T.muted} fontSize="7" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" transform={`rotate(-90,${padL - 16},${padT + H / 2})`}>km</text>
                <text x={padL + W / 2} y={CH - 2} fill={T.muted} fontSize="7" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace">day</text>
            </svg>
            <div style={{ display: 'flex', gap: 8 }}>
                {([
                    { lb: 'VELOCITY', v: `${corridor.velocity}km/d`, cl: rc },
                    { lb: 'SIGNALS', v: `${corridor.evidence.length}`, cl: T.sub },
                    { lb: 'SOURCES', v: `${sources.length}`, cl: T.teal },
                    { lb: 'PATH', v: `${corridor.totalKm}km`, cl: T.sub },
                ] as const).map(({ lb, v, cl }) => (
                    <div key={lb} style={{ flex: 1, padding: '6px 8px', background: T.surf, borderRadius: 2, textAlign: 'center' }}>
                        <div style={{ fontSize: 6, color: T.muted, letterSpacing: .8, marginBottom: 2 }}>{lb}</div>
                        <div style={{ fontSize: 10, color: cl, fontWeight: 600 }}>{v}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// BRIEF TAB
// ─────────────────────────────────────────────────────────────

function BriefTab({ corridor }: { corridor: Corridor }) {
    const rc = RISK[corridor.riskClass] ?? T.muted;
    const drivers = corridor.souls.filter(s => s.value >= 0.78).map(s => s.name);
    const sources = [...new Set(corridor.evidence.map(e => e.source))];
    return (
        <div style={{ padding: '12px 13px' }}>
            <div style={{ fontSize: 6.5, letterSpacing: 2, color: T.muted, marginBottom: 10 }}>CORRIDOR INTELLIGENCE BRIEF</div>
            <div style={{ padding: '10px 11px', background: T.card, borderRadius: 3, marginBottom: 8, borderLeft: `3px solid ${rc}` }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, color: rc, letterSpacing: 2, marginBottom: 2 }}>{corridor.id}</div>
                <div style={{ fontSize: 7, color: T.sub, marginBottom: 6 }}>Issued · {new Date().toISOString().slice(0, 10)} · {RUN_ID}</div>
                <div style={{ fontSize: 7, color: T.text, lineHeight: 1.9, marginBottom: 8 }}>
                    Probable informal cross-border corridor detected between {corridor.startNode} ({corridor.startCC}) and {corridor.endNode} ({corridor.endCC}). {corridor.coverage}.
                </div>
                <div style={{ fontSize: 6.5, color: T.muted, letterSpacing: 1, marginBottom: 5 }}>INFERRED PATHWAY</div>
                {corridor.nodes.map((n, i) => (
                    <div key={n.name} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ fontSize: 7, color: n.type === 'phantom' ? T.amber : rc, width: 8 }}>
                            {i === 0 ? '▶' : i === corridor.nodes.length - 1 ? '◼' : '┊'}
                        </span>
                        <span style={{ fontSize: 8, color: n.type === 'phantom' ? T.amber : T.text }}>{n.name}</span>
                        <span style={{ fontSize: 6.5, color: T.muted }}>{n.cc}</span>
                        {n.type === 'phantom' && (
                            <span style={{ fontSize: 6, padding: '1px 5px', background: `${T.amber}18`, color: T.amber }}>PHANTOM</span>
                        )}
                        <span style={{ fontSize: 6, color: T.muted, marginLeft: 'auto' }}>{PREC_LABEL[n.prec] ?? n.prec}</span>
                    </div>
                ))}
                <div style={{ marginTop: 9 }}>
                    <div style={{ fontSize: 6.5, color: T.muted, letterSpacing: 1, marginBottom: 4 }}>ACTIVATION DRIVERS</div>
                    {drivers.map(d => (
                        <div key={d} style={{ fontSize: 7, color: T.text, paddingLeft: 8, marginBottom: 2, borderLeft: `2px solid ${rc}35` }}>
                            ◈ {d} soul above threshold
                        </div>
                    ))}
                </div>
                <div style={{ marginTop: 9 }}>
                    <div style={{ fontSize: 6.5, color: T.muted, letterSpacing: 1, marginBottom: 4 }}>SOURCES</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {sources.map(s => (
                            <span key={s} style={{ fontSize: 6.5, padding: '1px 6px', background: `${T.blue}15`, color: T.blue, borderRadius: 1 }}>{s}</span>
                        ))}
                    </div>
                </div>
                <div style={{ marginTop: 9, padding: '7px 9px', background: `${T.amber}08`, border: `1px solid ${T.amber}20`, borderRadius: 2 }}>
                    <div style={{ fontSize: 6.5, color: T.amber, letterSpacing: 1, marginBottom: 3 }}>RECOMMENDED ACTION</div>
                    <div style={{ fontSize: 7, color: T.sub, lineHeight: 1.8 }}>
                        {corridor.endNode} District Hospital should be flagged for enhanced case reporting.
                        Nearest formal POE: {corridor.nearestFormal}.
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function PhantomMap() {
    const mapDivRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<CesiumType.Viewer | null>(null);
    const entityIdsRef = useRef<string[]>([]);
    const [cesiumReady, setCesiumReady] = useState(false);
    const [selId, setSelId] = useState(CORRIDORS[0]!.id);
    const [tab, setTab] = useState<'evidence' | 'cascade' | 'scores' | 'brief'>('evidence');
    const [currentDay, setCurrentDay] = useState(6);
    const [playing, setPlaying] = useState(false);
    const [clock, setClock] = useState('');
    const [showSidebar, setShowSidebar] = useState(true);

    const corridor = CORRIDORS.find(c => c.id === selId) ?? CORRIDORS[0]!;
    const rc = RISK[corridor.riskClass] ?? T.muted;
    const maxDay = Math.max(...corridor.evidence.map(e => e.day)) + 1;

    // Clock
    useEffect(() => {
        const t = setInterval(() => setClock(new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC'), 1000);
        return () => clearInterval(t);
    }, []);

    // Replay
    useEffect(() => {
        if (!playing) return;
        const t = setInterval(() => {
            setCurrentDay(d => {
                if (d >= maxDay) { setPlaying(false); return d; }
                return d + 1;
            });
        }, 700);
        return () => clearInterval(t);
    }, [playing, maxDay]);

    useEffect(() => {
        setCurrentDay(Math.max(...corridor.evidence.map(e => e.day)));
        setPlaying(false);
        setTab('evidence');
    }, [selId, corridor.evidence]);

    // ── Initialize Cesium viewer (once, on mount) ───────────
    useEffect(() => {
        if (!mapDivRef.current) return;
        let stopped = false;

        const check = setInterval(() => {
            if (!window.Cesium) return;
            clearInterval(check);
            if (stopped) return;

            const Cesium = window.Cesium;
            const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';

            // Hide Cesium credit banner
            const creditDiv = document.createElement('div');
            creditDiv.style.display = 'none';
            document.body.appendChild(creditDiv);

            const viewer = new Cesium.Viewer(mapDivRef.current!, {
                animation: false,
                baseLayerPicker: false,
                fullscreenButton: false,
                geocoder: false,
                homeButton: false,
                infoBox: false,
                sceneModePicker: false,
                selectionIndicator: false,
                timeline: false,
                navigationHelpButton: false,
                scene3DOnly: true,
                creditContainer: creditDiv,
                requestRenderMode: false,
                msaaSamples: 4,
            });

            // ── Imagery ───────────────────────────────────────
            viewer.imageryLayers.removeAll();
            if (maptilerKey) {
                viewer.imageryLayers.addImageryProvider(
                    new Cesium.UrlTemplateImageryProvider({
                        url: `https://api.maptiler.com/maps/satellite/{z}/{x}/{y}@2x.jpg?key=${maptilerKey}`,
                        maximumLevel: 18,
                        credit: new Cesium.Credit('© MapTiler · © OpenStreetMap contributors'),
                    })
                );
            } else {
                // Fallback: plain dark globe — add NEXT_PUBLIC_MAPTILER_KEY for satellite tiles
                viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString(T.bg);
            }

            // ── Terrain ───────────────────────────────────────
            if (maptilerKey) {
                Cesium.CesiumTerrainProvider.fromUrl(
                    new Cesium.Resource({
                        url: 'https://api.maptiler.com/tiles/terrain-quantized-mesh-v2/',
                        queryParameters: { key: maptilerKey },
                    }),
                    { requestVertexNormals: true }
                ).then(tp => {
                    if (!stopped && viewerRef.current && !viewerRef.current.isDestroyed()) {
                        viewerRef.current.terrainProvider = tp;
                    }
                }).catch(() => { /* terrain is optional */ });
            }

            // ── Globe atmosphere ──────────────────────────────
            viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString(T.bg);
            viewer.scene.backgroundColor = Cesium.Color.fromCssColorString(T.bg);
            viewer.scene.globe.enableLighting = false;
            viewer.scene.globe.showGroundAtmosphere = false;
            if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
            if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
            if (viewer.scene.sun) viewer.scene.sun.show = false;
            if (viewer.scene.moon) viewer.scene.moon.show = false;

            viewerRef.current = viewer;
            setCesiumReady(true);

            // Initial camera position
            const c0 = CORRIDORS[0]!.cameraCenter;
            viewer.camera.setView({
                destination: Cesium.Cartesian3.fromDegrees(c0.lng, c0.lat, c0.alt),
                orientation: { heading: Cesium.Math.toRadians(c0.heading), pitch: Cesium.Math.toRadians(-50), roll: 0 },
            });
        }, 200);

        return () => {
            stopped = true;
            clearInterval(check);
            if (viewerRef.current && !viewerRef.current.isDestroyed()) {
                viewerRef.current.destroy();
            }
            viewerRef.current = null;
        };
    }, []);

    // ── Rebuild entities on corridor / day change ─────────────
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed() || !cesiumReady) return;
        const Cesium = window.Cesium;

        // Remove stale entities
        for (const id of entityIdsRef.current) viewer.entities.removeById(id);
        entityIdsRef.current = [];

        const positions = Cesium.Cartesian3.fromDegreesArrayHeights(
            corridor.pathCoords.flatMap(p => [p.lng, p.lat, p.alt])
        );

        // Glow band
        const glowId = `${corridor.id}-glow`;
        viewer.entities.add({
            id: glowId,
            polyline: {
                positions,
                width: 20,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.35,
                    color: Cesium.Color.fromCssColorString(rc).withAlpha(0.5),
                }),
                arcType: Cesium.ArcType.GEODESIC,
                clampToGround: false,
            },
        });
        entityIdsRef.current.push(glowId);

        // Main corridor line
        const lineId = `${corridor.id}-line`;
        viewer.entities.add({
            id: lineId,
            polyline: {
                positions,
                width: 3,
                material: Cesium.Color.fromCssColorString(rc),
                arcType: Cesium.ArcType.GEODESIC,
                clampToGround: false,
            },
        });
        entityIdsRef.current.push(lineId);

        // Node markers (start, end, border, phantom)
        for (const node of corridor.nodes) {
            const nc = node.type === 'phantom' ? T.amber
                : node.type === 'border' ? T.blue
                    : rc;
            const nodeId = `${corridor.id}-node-${node.name}`;
            viewer.entities.add({
                id: nodeId,
                position: Cesium.Cartesian3.fromDegrees(node.lng, node.lat, node.alt + 800),
                point: {
                    pixelSize: node.type === 'phantom' ? 13 : 10,
                    color: Cesium.Color.fromCssColorString(nc),
                    outlineColor: Cesium.Color.fromCssColorString(T.bg),
                    outlineWidth: 2,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    heightReference: Cesium.HeightReference.NONE,
                },
                label: {
                    text: node.name,
                    font: '11px "IBM Plex Mono", monospace',
                    fillColor: Cesium.Color.fromCssColorString(nc),
                    outlineColor: Cesium.Color.fromCssColorString(T.bg),
                    outlineWidth: 3,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                    pixelOffset: new Cesium.Cartesian2(0, -16),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    scale: 0.95,
                },
            });
            entityIdsRef.current.push(nodeId);
        }

        // Signal atom markers (filtered to currentDay)
        for (const sig of corridor.evidence.filter(e => e.day <= currentDay)) {
            const sc = SIGTYPE[sig.type] ?? T.sub;
            const sigId = `${corridor.id}-sig-${sig.id}`;
            viewer.entities.add({
                id: sigId,
                position: Cesium.Cartesian3.fromDegrees(sig.lng, sig.lat, sig.alt + 1200),
                point: {
                    pixelSize: 9,
                    color: Cesium.Color.fromCssColorString(sc),
                    outlineColor: Cesium.Color.fromCssColorString(T.bg),
                    outlineWidth: 1.5,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    heightReference: Cesium.HeightReference.NONE,
                },
                label: {
                    text: sig.id,
                    font: '9px "IBM Plex Mono", monospace',
                    fillColor: Cesium.Color.fromCssColorString(sc),
                    outlineColor: Cesium.Color.fromCssColorString(T.bg),
                    outlineWidth: 2,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                    pixelOffset: new Cesium.Cartesian2(0, -12),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    scale: 0.85,
                },
            });
            entityIdsRef.current.push(sigId);
        }
    }, [cesiumReady, corridor, currentDay, rc]);

    // ── Camera fly-to ─────────────────────────────────────────
    const flyToCorridorCamera = useCallback(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed() || !window.Cesium) return;
        const Cesium = window.Cesium;
        const cam = corridor.cameraCenter;
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(cam.lng, cam.lat, cam.alt),
            orientation: { heading: Cesium.Math.toRadians(cam.heading), pitch: Cesium.Math.toRadians(-50), roll: 0 },
            duration: 1.8,
            easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
        });
    }, [corridor]);

    useEffect(() => {
        if (cesiumReady) flyToCorridorCamera();
    }, [cesiumReady, flyToCorridorCamera]);

    const TABS = [
        { k: 'evidence' as const, label: 'EVIDENCE' },
        { k: 'cascade' as const, label: 'CASCADE' },
        { k: 'scores' as const, label: 'SCORES' },
        { k: 'brief' as const, label: 'BRIEF' },
    ];

    return (
        <>
            <style>{`
        @keyframes poe-dot     { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes poe-breathe { 0%,100%{opacity:.45} 50%{opacity:1} }
        @keyframes poe-bloom   { from{opacity:0;transform:scale(.4)} to{opacity:1;transform:scale(1)} }
        @keyframes spin        { to { transform: rotate(360deg); } }
        .cesium-widget-credits, .cesium-viewer-bottom { display: none !important; }
      `}</style>

            <div style={{
                display: 'flex', flexDirection: 'column',
                height: '100vh', width: '100vw',
                background: T.bg, color: T.text,
                fontFamily: "'IBM Plex Mono', monospace",
                overflow: 'hidden',
            }}>

                {/* ── HEADER ───────────────────────────────────────────── */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '6px 18px',
                    background: T.surf, borderBottom: `1px solid ${T.border}`,
                    flexShrink: 0, zIndex: 10,
                }}>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 4, color: T.green, flexShrink: 0 }}>
                        ◉⟁⬡ PHANTOM POE
                    </span>
                    <span style={{ fontSize: 7, color: T.muted, letterSpacing: 1.5, flexShrink: 0 }}>
                        CORRIDOR INTELLIGENCE · mo-border-phantom-001
                    </span>
                    <div style={{ flex: 1, fontSize: 8, color: T.sub, textAlign: 'center', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        &ldquo;We do not watch people. We listen to where the earth is being walked.&rdquo;
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 7, flexShrink: 0 }}>
                        <span style={{ color: T.muted }}>{RUN_ID}</span>
                        <span style={{ color: T.muted }}>{clock}</span>
                        <span style={{ padding: '2px 8px', border: `1px solid ${rc}40`, color: rc }}>{corridor.riskClass}</span>
                        <span style={{ padding: '2px 8px', border: `1px solid ${T.green}40`, color: T.green, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Dot active color={T.green} />ACTIVE
                        </span>
                    </div>
                </div>

                {/* ── BODY ─────────────────────────────────────────────── */}
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

                    {/* ── CORRIDOR SIDEBAR ─────────────────────────────── */}
                    {showSidebar && (
                        <div style={{
                            width: 210, flexShrink: 0,
                            background: T.surf, borderRight: `1px solid ${T.border}`,
                            display: 'flex', flexDirection: 'column',
                            zIndex: 5,
                        }}>
                            <div style={{ padding: '8px 14px 6px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 7, letterSpacing: 1.8, color: T.muted }}>CORRIDORS</span>
                                <span style={{ fontSize: 7, color: T.green }}>{CORRIDORS.filter(c => c.activated).length}/{CORRIDORS.length} ACTIVE</span>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {CORRIDORS.map(c => (
                                    <CorridorCard key={c.id} c={c} sel={selId === c.id} onClick={() => { setSelId(c.id); flyToCorridorCamera(); }} />
                                ))}
                            </div>
                            <div style={{ padding: '10px 14px', borderTop: `1px solid ${T.border}`, fontSize: 6, color: T.muted, lineHeight: 2 }}>
                                <div style={{ color: T.border }}>◉⟁⬡ MoStar Industries</div>
                                <div>African Flame Initiative</div>
                                <div>Zero person-level tracking</div>
                            </div>
                        </div>
                    )}

                    {/* ── MAP AREA ─────────────────────────────────────── */}
                    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

                        {corridor.activated && (
                            <div style={{
                                position: 'absolute', top: 12, left: 14, zIndex: 20,
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '4px 12px',
                                background: `${T.green}08`, border: `1px solid ${T.green}25`,
                                fontSize: 7, letterSpacing: 1.2, color: T.green,
                            }}>
                                <Dot active color={T.green} />
                                ACTIVE MONITORING: {corridor.id} · {corridor.startNode} {corridor.startCC} → {corridor.endNode} {corridor.endCC}
                            </div>
                        )}

                        {/* Map controls */}
                        <div style={{ position: 'absolute', top: corridor.activated ? 46 : 12, right: 14, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <button onClick={flyToCorridorCamera} style={{ background: T.surf, border: `1px solid ${T.border}`, color: T.sub, padding: '4px 10px', cursor: 'pointer', fontSize: 7, letterSpacing: 1.5, fontFamily: "'IBM Plex Mono', monospace" }}>
                                FLY TO
                            </button>
                            <button onClick={() => setShowSidebar(s => !s)} style={{ background: T.surf, border: `1px solid ${T.border}`, color: T.sub, padding: '4px 10px', cursor: 'pointer', fontSize: 7, letterSpacing: 1.5, fontFamily: "'IBM Plex Mono', monospace" }}>
                                {showSidebar ? '← HIDE' : '→ LIST'}
                            </button>
                        </div>

                        {/* Legend */}
                        <div style={{ position: 'absolute', bottom: 56, right: 14, zIndex: 20, background: `${T.surf}CC`, border: `1px solid ${T.border}`, padding: '8px 10px', fontSize: 6.5, color: T.sub, lineHeight: 2.1 }}>
                            {[
                                { cl: T.red, s: 'ACTIVE (HIGH)' },
                                { cl: T.amber, s: 'ACTIVE (MEDIUM)' },
                                { cl: T.green, s: 'ACTIVE (LOW)' },
                                { cl: T.amber, s: 'PHANTOM NODE (⊙)' },
                                { cl: T.blue, s: 'FORMAL POE (◆)' },
                            ].map(({ cl, s }) => (
                                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                    <div style={{ width: 16, height: 2, background: cl }} />
                                    <span>{s}</span>
                                </div>
                            ))}
                        </div>

                        {/* Loading overlay */}
                        {!cesiumReady && (
                            <div style={{ position: 'absolute', inset: 0, zIndex: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid ${T.green}`, borderTopColor: 'transparent', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                                    <div style={{ fontSize: 9, color: T.muted, letterSpacing: 2 }}>INITIALIZING CESIUM GLOBE</div>
                                    <div style={{ fontSize: 7, color: T.border, marginTop: 6 }}>MapTiler Satellite · Africa</div>
                                </div>
                            </div>
                        )}

                        {/* Cesium container — viewer mounts here */}
                        <div ref={mapDivRef} style={{ width: '100%', height: '100%', background: T.bg }} />
                    </div>

                    {/* ── INTEL PANEL ──────────────────────────────────── */}
                    <div style={{
                        width: 295, flexShrink: 0,
                        background: T.surf, borderLeft: `1px solid ${T.border}`,
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        zIndex: 5,
                    }}>
                        {/* Corridor header */}
                        <div style={{ padding: '11px 13px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, color: rc, letterSpacing: 2, marginBottom: 3 }}>{corridor.id}</div>
                            <div style={{ fontSize: 7.5, color: T.sub, marginBottom: 7 }}>
                                {corridor.startNode} ({corridor.startCC}) → {corridor.endNode} ({corridor.endCC})
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: rc, letterSpacing: 1 }}>
                                    {corridor.score.toFixed(4)}
                                </span>
                                <div>
                                    <div style={{ fontSize: 7, padding: '1px 6px', background: `${rc}18`, color: rc, letterSpacing: .8, marginBottom: 3 }}>{corridor.riskClass}</div>
                                    <div style={{ fontSize: 7, color: T.muted }}>{corridor.mode} · {corridor.velocity}km/d</div>
                                </div>
                            </div>
                            {corridor.gapZone && (
                                <div style={{ marginTop: 5, fontSize: 6.5, color: T.amber }}>◉ GAP ZONE: {corridor.coverage}</div>
                            )}
                        </div>

                        {/* Tab bar */}
                        <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                            {TABS.map(t => (
                                <button key={t.k} onClick={() => setTab(t.k)} style={{
                                    flex: 1, padding: '7px 0',
                                    background: 'none', border: 'none',
                                    borderBottom: `2px solid ${tab === t.k ? rc : 'transparent'}`,
                                    color: tab === t.k ? rc : T.muted,
                                    fontSize: 7, letterSpacing: 1.5, cursor: 'pointer',
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    transition: 'color .12s',
                                }}>
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab content */}
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {tab === 'evidence' && <EvidenceTab corridor={corridor} currentDay={currentDay} />}
                            {tab === 'cascade' && <CascadeTab corridor={corridor} currentDay={currentDay} />}
                            {tab === 'scores' && <ScoresTab corridor={corridor} />}
                            {tab === 'brief' && <BriefTab corridor={corridor} />}
                        </div>
                    </div>
                </div>

                {/* ── BOTTOM BAR ───────────────────────────────────────── */}
                <div style={{ background: `${T.surf}F0`, borderTop: `1px solid ${T.border}`, padding: '6px 16px', flexShrink: 0, zIndex: 10 }}>
                    {/* Time scrubber */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 5 }}>
                        <button onClick={() => setPlaying(p => !p)} style={{
                            background: 'none', border: `1px solid ${T.border}`,
                            color: playing ? T.amber : T.sub,
                            padding: '2px 10px', cursor: 'pointer',
                            fontSize: 7, letterSpacing: 1.5, fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0,
                        }}>
                            {playing ? '▐▌ PAUSE' : '▶ REPLAY'}
                        </button>
                        <span style={{ fontSize: 7, color: T.muted, flexShrink: 0 }}>D0</span>
                        <input
                            type="range" min={0} max={maxDay} value={currentDay} step={1}
                            onChange={e => setCurrentDay(Number(e.target.value))}
                            style={{ flex: 1, accentColor: rc }}
                        />
                        <span style={{ fontSize: 7, color: T.muted, flexShrink: 0 }}>D{maxDay}</span>
                        <div style={{ flexShrink: 0, display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: rc }}>D{currentDay}</span>
                            <div style={{ fontSize: 6.5, color: T.sub, lineHeight: 1.8 }}>
                                <div>{corridor.evidence.filter(e => e.day <= currentDay).length}/{corridor.evidence.length} signals</div>
                                <div style={{ color: corridor.evidence.filter(e => e.day <= currentDay).length >= 3 ? rc : T.muted }}>
                                    {corridor.evidence.filter(e => e.day <= currentDay).length >= 3 ? 'CORRIDOR ACTIVATED' : 'awaiting threshold'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Meta strip */}
                    <div style={{ display: 'flex', gap: 20, overflowX: 'auto', flexWrap: 'nowrap' }}>
                        {[
                            { k: 'ENGINE', v: 'CesiumJS · MapTiler Satellite' },
                            { k: 'TRUTH FLOOR', v: 'fire:0.75 · water:0.70 · air:0.65 · earth:0.80' },
                            { k: 'MODE', v: corridor.mode },
                            { k: 'FIRST DETECTED', v: corridor.firstDetected },
                            { k: 'FORMAL POE', v: corridor.nearestFormal },
                            { k: 'SEASONAL', v: corridor.seasonal ? 'ACTIVE' : 'DORMANT' },
                        ].map(({ k, v }) => (
                            <div key={k} style={{ flexShrink: 0, display: 'flex', gap: 7, alignItems: 'center' }}>
                                <span style={{ fontSize: 6.5, color: T.muted, letterSpacing: 1 }}>{k}</span>
                                <span style={{ fontSize: 6.5, color: T.sub }}>{v}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
