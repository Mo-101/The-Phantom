'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell, PieChart, Pie,
} from 'recharts';

// ---- Design tokens (matches PhantomMap exactly) --------------------
const T = {
  bg: '#070A10', surf: '#0D1020', card: '#121626', border: '#1C2035',
  green: '#00E87A', amber: '#F5A623', red: '#FF453A', pink: '#FF0066',
  blue: '#009ADE', teal: '#3DD9C4', purple: '#8B7CF8',
  text: '#D8DCF0', sub: '#828AB5', muted: '#3A3F5C', dim: '#1C2035',
};

const RISK_COLOR: Record<string, string> = {
  CRITICAL: '#FF0066', HIGH: '#FF453A', MEDIUM: '#F5A623', LOW: '#00E87A',
};
const HMM_COLOR: Record<string, string> = {
  surge: '#FF0066', active_crossing: '#FF453A', probing: '#60A5FA',
  dormant: '#3A3F5C', dissipating: '#8B7CF8',
};
const HMM_LABEL: Record<string, string> = {
  surge: 'SURGE', active_crossing: 'ACTIVE', probing: 'PROBING',
  dormant: 'DORMANT', dissipating: 'DISSIPATING',
};
const SIG_COLOR: Record<string, string> = {
  HEALTH: '#FF6B8A', DISPLACEMENT: '#3DD9C4', CONFLICT: '#FF453A',
  ENTROPY: '#F5A623', LINGUISTIC: '#8B7CF8',
};
const SIG_LABEL: Record<string, string> = {
  HEALTH: 'Disease / Health', DISPLACEMENT: 'People Moving',
  CONFLICT: 'Conflict', ENTROPY: 'Unusual Patterns', LINGUISTIC: 'Language Signals',
};
const RISK_LABEL: Record<string, string> = {
  CRITICAL: 'Very Dangerous', HIGH: 'Dangerous', MEDIUM: 'Watch Closely', LOW: 'Low Risk',
};
const MODE_ICON: Record<string, string> = {
  FOOT: 'On foot', MOTORCYCLE: 'Motorcycle', CANOE: 'Canoe', VEHICLE: 'Vehicle',
};

// ---- Types ---------------------------------------------------------
interface CorridorRow {
  id: string; short: string; region: string; score: number; riskClass: string;
  mode: string; totalKm: number; velocity: number; evidenceCount: number;
  gapZone: boolean; startCC: string; endCC: string;
  hmmState: string; souls?: { key: string; value: number }[];
}
interface EvidenceAtom {
  id?: string; type: string; source: string; score: number; day: number;
  precision?: string; location?: string;
  corridorId: string; corridorShort: string; corridorRiskClass: string;
}
interface AnalyticsData {
  hero: { totalCorridors: number; totalEvidence: number; avgScore: number; totalKm: number };
  signalTypes: { type: string; count: number; avgScore: number }[];
  riskBuckets: Record<string, number>;
  corridorRows: CorridorRow[];
  timeline: { day: number; label: string; signals: number }[];
  sources: { source: string; count: number }[];
  soulAverages: { key: string; avg: number }[];
  coverageGap: { monitoredPct: number; unmonitoredPct: number; gapKm: number; gapCount: number };
  allEvidence: EvidenceAtom[];
  generatedAt: string;
}

// ---- Reusable atoms ------------------------------------------------
function HeroCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '18px 22px', flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 10, color: T.sub, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 700, color, fontFamily: 'IBM Plex Mono, monospace', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: T.muted, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 9, color: T.sub, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
      {children}
    </div>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  const pct = Math.min(100, Math.max(0, (value ?? 0) * 100));
  return (
    <div style={{ flex: 1, height: 5, background: T.dim, borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
    </div>
  );
}

function RiskPill({ riskClass }: { riskClass: string }) {
  const color = RISK_COLOR[riskClass] ?? T.muted;
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, letterSpacing: 1.2, padding: '2px 6px', borderRadius: 3,
      background: `${color}22`, color, border: `1px solid ${color}44`,
      fontFamily: 'IBM Plex Mono, monospace',
    }}>{riskClass}</span>
  );
}

function HmmBadge({ state }: { state: string }) {
  const color = HMM_COLOR[state] ?? T.muted;
  return (
    <span style={{
      fontSize: 7.5, letterSpacing: 1, padding: '1px 5px', borderRadius: 3,
      background: `${color}18`, color, border: `1px solid ${color}40`,
      fontFamily: 'IBM Plex Mono, monospace', whiteSpace: 'nowrap',
    }}>{HMM_LABEL[state] ?? state.toUpperCase()}</span>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ fontSize: 9, color: T.sub, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ fontSize: 11, color: p.color ?? T.text }}>{p.value} {p.name}</div>
      ))}
    </div>
  );
}

// ---- Corridor Intelligence Card ------------------------------------
function CorridorCard({ c }: { c: CorridorRow }) {
  const riskColor = RISK_COLOR[c.riskClass] ?? T.muted;
  const hmmColor = HMM_COLOR[c.hmmState] ?? T.muted;
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 8,
      borderLeft: `3px solid ${riskColor}`, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>{c.short}</div>
          <div style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>{c.startCC} → {c.endCC}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <RiskPill riskClass={c.riskClass} />
          <HmmBadge state={c.hmmState} />
        </div>
      </div>

      {/* Score bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ScoreBar value={c.score} color={riskColor} />
        <span style={{ fontSize: 11, fontWeight: 700, color: riskColor, minWidth: 32 }}>
          {Math.round(c.score * 100)}%
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, color: T.sub }}>{c.totalKm} km</span>
        <span style={{ fontSize: 9, color: T.sub }}>{c.velocity} km/h</span>
        <span style={{ fontSize: 9, color: c.evidenceCount > 0 ? T.amber : T.muted }}>{c.evidenceCount} signals</span>
        <span style={{ fontSize: 9, color: T.sub }}>{MODE_ICON[c.mode] ?? c.mode}</span>
        {c.gapZone && (
          <span style={{ fontSize: 9, color: T.red, fontWeight: 600 }}>GAP ZONE</span>
        )}
      </div>

      {/* Link back to map */}
      <a href={`/?sel=${c.id}`} style={{ fontSize: 8, color: T.sub, textDecoration: 'none', letterSpacing: 1, alignSelf: 'flex-start' }}>
        EXPLORE ON MAP ↗
      </a>
    </div>
  );
}

// ---- Evidence Atom Row --------------------------------------------
function EvidenceRow({ ev, idx }: { ev: EvidenceAtom; idx: number }) {
  const sigColor = SIG_COLOR[ev.type] ?? T.sub;
  const riskColor = RISK_COLOR[ev.corridorRiskClass] ?? T.muted;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px',
      borderBottom: `1px solid ${T.dim}`,
      background: idx % 2 === 0 ? 'transparent' : `${T.surf}44`,
    }}>
      {/* Day badge */}
      <div style={{
        minWidth: 34, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: T.dim, borderRadius: 3, fontSize: 9, color: T.sub, fontWeight: 700, flexShrink: 0,
      }}>D{ev.day ?? '?'}</div>

      {/* Signal type chip */}
      <span style={{
        fontSize: 8, padding: '1px 5px', borderRadius: 2, background: `${sigColor}18`,
        color: sigColor, border: `1px solid ${sigColor}44`, whiteSpace: 'nowrap', flexShrink: 0,
      }}>{SIG_LABEL[ev.type] ?? ev.type}</span>

      {/* Source */}
      <span style={{ fontSize: 9, color: T.muted, flexShrink: 0 }}>{ev.source}</span>

      {/* Location */}
      {ev.location && (
        <span style={{ fontSize: 9, color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ev.location}
        </span>
      )}

      {/* Score mini bar */}
      <div style={{ width: 48, flexShrink: 0 }}>
        <div style={{ height: 3, background: T.dim, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.round((ev.score ?? 0) * 100)}%`, background: sigColor, borderRadius: 2 }} />
        </div>
      </div>

      {/* Precision */}
      {ev.precision && (
        <span style={{ fontSize: 8, color: T.muted, flexShrink: 0 }}>{ev.precision}</span>
      )}

      {/* Corridor ID pill */}
      <span style={{
        fontSize: 8, padding: '1px 5px', borderRadius: 2,
        background: `${riskColor}18`, color: riskColor, border: `1px solid ${riskColor}33`,
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>{ev.corridorShort}</span>
    </div>
  );
}

// ---- Main page -----------------------------------------------------
export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evidenceLimit, setEvidenceLimit] = useState(40);

  useEffect(() => {
    fetch('/api/analytics')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(e => setError(String(e)));
  }, []);

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bg, color: T.red, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>
      Could not load analytics: {error}
    </div>
  );

  if (!data) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bg, color: T.green, fontFamily: 'IBM Plex Mono, monospace', gap: 12 }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', border: `2px solid ${T.green}`, borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
      <div style={{ fontSize: 9, letterSpacing: 2 }}>LOADING ANALYTICS...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const { hero, signalTypes, riskBuckets, corridorRows, timeline, sources, soulAverages, coverageGap, allEvidence } = data;
  const riskPieData = Object.entries(riskBuckets).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  const scorePercent = Math.round((hero.avgScore ?? 0) * 100);

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: 'IBM Plex Mono, monospace', overflowY: 'auto' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        a.back-link:hover { color: ${T.green} !important; }
        a.map-link:hover { color: ${T.green} !important; }
      `}</style>

      {/* ---- Sticky header ----------------------------------------- */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: `${T.surf}EE`, backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${T.border}`,
        padding: '0 24px', height: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 4, color: T.green }}>◉⟁⬡ PHANTOM POE</span>
          <span style={{ color: T.muted, fontSize: 10 }}>/</span>
          <span style={{ fontSize: 9, color: T.sub, letterSpacing: 1.5 }}>DETECTION ANALYTICS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 8, color: T.muted }}>Updated {new Date(data.generatedAt).toLocaleTimeString()}</span>
          <a href="/" className="back-link" style={{
            fontSize: 8, color: T.sub, textDecoration: 'none', letterSpacing: 1.2,
            border: `1px solid ${T.border}`, padding: '3px 10px', transition: 'color 0.15s',
          }}>← BACK TO MAP</a>
        </div>
      </div>

      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* ---- Page title ----------------------------------------- */}
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: T.text, margin: 0, letterSpacing: -0.5, fontFamily: 'IBM Plex Mono, monospace' }}>
            What is the system detecting?
          </h1>
          <p style={{ fontSize: 12, color: T.sub, marginTop: 6, lineHeight: 1.6, maxWidth: 560, fontFamily: 'IBM Plex Mono, monospace' }}>
            Every corridor, signal, and risk the engine has found — plain English.
          </p>
        </div>

        {/* ---- Hero numbers --------------------------------------- */}
        <div>
          <SectionLabel>At a glance</SectionLabel>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <HeroCard label="Corridors found" value={hero.totalCorridors} sub="Unofficial crossing routes" color={T.green} />
            <HeroCard label="Evidence pieces" value={hero.totalEvidence} sub="Signals, reports & detections" color={T.blue} />
            <HeroCard label="Avg risk score" value={`${scorePercent}%`} sub={scorePercent >= 70 ? 'High concern' : 'Moderate concern'} color={scorePercent >= 70 ? T.red : T.amber} />
            <HeroCard label="Total distance" value={`${hero.totalKm} km`} sub="Across all corridors" color={T.teal} />
          </div>
        </div>

        {/* ---- Coverage gap --------------------------------------- */}
        {coverageGap && (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20 }}>
            <SectionLabel>Intelligence coverage gap</SectionLabel>
            <p style={{ fontSize: 11, color: T.sub, marginBottom: 14, lineHeight: 1.6 }}>
              How much of the corridor network can the engine actually see? The dark bar shows hidden terrain.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ flex: 1, height: 12, background: T.dim, borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${coverageGap.monitoredPct}%`,
                  background: `linear-gradient(90deg, ${T.green}, ${T.teal})`,
                  borderRadius: 6,
                }} />
              </div>
              <span style={{ fontSize: 11, color: T.green, minWidth: 36, fontWeight: 700 }}>{coverageGap.monitoredPct}%</span>
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10, color: T.muted }}>Monitored</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.green }}>{coverageGap.monitoredPct}%</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.muted }}>Unmonitored</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.red }}>{coverageGap.unmonitoredPct}%</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.muted }}>Gap corridors</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.amber }}>{coverageGap.gapCount}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.muted }}>Hidden distance</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.amber }}>{coverageGap.gapKm} km</div>
              </div>
            </div>
          </div>
        )}

        {/* ---- Signal types + Risk distribution ------------------- */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {/* Signal types */}
          <div style={{ flex: 2, minWidth: 280, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20 }}>
            <SectionLabel>What kind of signals?</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {signalTypes.length === 0 && <div style={{ fontSize: 10, color: T.muted }}>No signal data yet.</div>}
              {signalTypes.map(s => {
                const color = SIG_COLOR[s.type] ?? T.muted;
                const maxCount = Math.max(...signalTypes.map(x => x.count), 1);
                return (
                  <div key={s.type} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: T.text }}>{SIG_LABEL[s.type] ?? s.type}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: T.sub }}>{Math.round(s.avgScore * 100)}% conf.</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color }}>{s.count}</span>
                      </div>
                    </div>
                    <div style={{ height: 7, background: T.dim, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(s.count / maxCount) * 100}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Risk pie */}
          <div style={{ flex: 1, minWidth: 220, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column' }}>
            <SectionLabel>How dangerous?</SectionLabel>
            {riskPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={riskPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={62} dataKey="value" paddingAngle={3}>
                    {riskPieData.map(entry => <Cell key={entry.name} fill={RISK_COLOR[entry.name] ?? T.muted} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 10, color: T.text }} formatter={(v, name) => [v, RISK_LABEL[name as string] ?? name]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: 10 }}>No risk data</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
              {Object.entries(RISK_LABEL).map(([key, label]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: RISK_COLOR[key] ?? T.muted, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: T.sub, flex: 1 }}>{label}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: RISK_COLOR[key] ?? T.muted }}>{riskBuckets[key] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ---- 7-day timeline ------------------------------------- */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20 }}>
          <SectionLabel>Signal activity — last 7 days</SectionLabel>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={timeline} barSize={26} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: T.sub, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: T.sub, fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: `${T.border}66` }} />
              <Bar dataKey="signals" name="signals" radius={[3, 3, 0, 0]}>
                {timeline.map(entry => <Cell key={entry.day} fill={entry.signals > 2 ? T.amber : entry.signals > 0 ? T.green : T.muted} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ---- Corridor intelligence cards grid ------------------- */}
        <div>
          <SectionLabel>Corridor intelligence — each route</SectionLabel>
          <p style={{ fontSize: 11, color: T.sub, marginBottom: 16, lineHeight: 1.6 }}>
            Each card shows one unofficial crossing route. Risk level, HMM state, signal count, and current activity.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
            {corridorRows.length === 0 && (
              <div style={{ fontSize: 10, color: T.muted, gridColumn: '1/-1', padding: 24, textAlign: 'center' }}>No corridors detected yet.</div>
            )}
            {corridorRows.map(c => <CorridorCard key={c.id} c={c} />)}
          </div>
        </div>

        {/* ---- Full corridor table -------------------------------- */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.border}` }}>
            <SectionLabel>Every corridor — one row each</SectionLabel>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ background: T.surf }}>
                  {['Route', 'Region', 'Risk', 'HMM State', 'Score', 'Distance', 'Speed', 'Signals', 'Travel'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', color: T.sub, letterSpacing: 1, fontSize: 8, fontWeight: 600, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {corridorRows.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${T.dim}`, background: i % 2 === 0 ? 'transparent' : `${T.surf}55` }}>
                    <td style={{ padding: '10px 14px', color: T.text, fontWeight: 600 }}>
                      <div>{c.short}</div>
                      <div style={{ fontSize: 8, color: T.muted, marginTop: 1 }}>{c.startCC} → {c.endCC}</div>
                    </td>
                    <td style={{ padding: '10px 14px', color: T.sub, maxWidth: 160 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.region}</div>
                    </td>
                    <td style={{ padding: '10px 14px' }}><RiskPill riskClass={c.riskClass} /></td>
                    <td style={{ padding: '10px 14px' }}><HmmBadge state={c.hmmState} /></td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <ScoreBar value={c.score} color={RISK_COLOR[c.riskClass] ?? T.muted} />
                        <span style={{ color: RISK_COLOR[c.riskClass] ?? T.text, minWidth: 30, textAlign: 'right' }}>{Math.round(c.score * 100)}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', color: T.teal }}>{c.totalKm} km</td>
                    <td style={{ padding: '10px 14px', color: T.sub }}>{c.velocity} km/h</td>
                    <td style={{ padding: '10px 14px' }}><span style={{ color: c.evidenceCount > 0 ? T.amber : T.muted }}>{c.evidenceCount}</span></td>
                    <td style={{ padding: '10px 14px', color: T.sub }}>{MODE_ICON[c.mode] ?? c.mode}</td>
                  </tr>
                ))}
                {corridorRows.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 28, textAlign: 'center', color: T.muted, fontSize: 10 }}>No corridors detected yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---- Evidence atom feed --------------------------------- */}
        {allEvidence && allEvidence.length > 0 && (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <SectionLabel>Evidence atom feed — all corridors</SectionLabel>
              <span style={{ fontSize: 9, color: T.muted }}>{allEvidence.length} atoms</span>
            </div>
            <div>
              {allEvidence.slice(0, evidenceLimit).map((ev, i) => <EvidenceRow key={`${ev.corridorId}-${i}`} ev={ev} idx={i} />)}
            </div>
            {evidenceLimit < allEvidence.length && (
              <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={() => setEvidenceLimit(n => n + 40)}
                  style={{ background: 'none', border: `1px solid ${T.border}`, color: T.sub, padding: '5px 18px', fontSize: 9, cursor: 'pointer', letterSpacing: 1 }}
                >
                  LOAD MORE ({allEvidence.length - evidenceLimit} remaining)
                </button>
              </div>
            )}
          </div>
        )}

        {/* ---- Data sources + Soul radar -------------------------- */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20 }}>
            <SectionLabel>Where does the data come from?</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sources.length === 0 && <div style={{ fontSize: 10, color: T.muted }}>No sources yet.</div>}
              {sources.map(s => {
                const maxC = Math.max(...sources.map(x => x.count), 1);
                return (
                  <div key={s.source} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: T.text }}>{s.source}</span>
                      <span style={{ fontSize: 10, color: T.sub }}>{s.count} signals</span>
                    </div>
                    <div style={{ height: 4, background: T.dim, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(s.count / maxC) * 100}%`, background: T.blue, borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {soulAverages.length > 0 && (
            <div style={{ flex: 1.5, minWidth: 260, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20 }}>
              <SectionLabel>Engine confidence — by dimension</SectionLabel>
              <p style={{ fontSize: 10, color: T.sub, marginBottom: 12, lineHeight: 1.6 }}>
                Bigger web = more confident across all corridors.
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={soulAverages.map(s => ({ subject: s.key.toUpperCase(), value: Math.round(s.avg * 100) }))}>
                  <PolarGrid stroke={T.border} />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: T.sub, fontSize: 8 }} />
                  <Radar name="avg" dataKey="value" stroke={T.green} fill={T.green} fillOpacity={0.18} />
                  <Tooltip contentStyle={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 10, color: T.text }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
