'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell, PieChart, Pie,
} from 'recharts';

// ---- Design tokens (matches PhantomMap) ----------------------------
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

const RISK_COLOR: Record<string, string> = {
  CRITICAL: '#FF0066',
  HIGH: '#FF453A',
  MEDIUM: '#F5A623',
  LOW: '#00E87A',
};

const SIG_COLOR: Record<string, string> = {
  HEALTH: '#FF6B8A',
  DISPLACEMENT: '#3DD9C4',
  CONFLICT: '#FF453A',
  ENTROPY: '#F5A623',
  LINGUISTIC: '#8B7CF8',
};

const SIG_LABEL: Record<string, string> = {
  HEALTH: 'Disease / Health',
  DISPLACEMENT: 'People Moving',
  CONFLICT: 'Conflict',
  ENTROPY: 'Unusual Patterns',
  LINGUISTIC: 'Language Signals',
};

const RISK_LABEL: Record<string, string> = {
  CRITICAL: 'Very Dangerous',
  HIGH: 'Dangerous',
  MEDIUM: 'Watch Closely',
  LOW: 'Low Risk',
};

const MODE_ICON: Record<string, string> = {
  FOOT: 'On foot',
  MOTORCYCLE: 'Motorcycle',
  CANOE: 'Canoe',
  VEHICLE: 'Vehicle',
};

// ---- Types ---------------------------------------------------------
interface AnalyticsData {
  hero: { totalCorridors: number; totalEvidence: number; avgScore: number; totalKm: number };
  signalTypes: { type: string; count: number; avgScore: number }[];
  riskBuckets: Record<string, number>;
  corridorRows: {
    id: string; short: string; region: string; score: number; riskClass: string;
    mode: string; totalKm: number; velocity: number; evidenceCount: number;
    gapZone: boolean; startCC: string; endCC: string;
  }[];
  timeline: { day: number; label: string; signals: number }[];
  sources: { source: string; count: number }[];
  soulAverages: { key: string; avg: number }[];
  generatedAt: string;
}

// ---- Small reusable atoms ------------------------------------------
function HeroCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
      padding: '20px 24px', flex: 1, minWidth: 160,
    }}>
      <div style={{ fontSize: 11, color: T.sub, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 40, fontWeight: 700, color, fontFamily: 'IBM Plex Mono, monospace', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 10, color: T.sub, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
      {children}
    </div>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  const pct = Math.min(100, Math.max(0, (value ?? 0) * 100));
  return (
    <div style={{ flex: 1, height: 6, background: T.dim, borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
    </div>
  );
}

function RiskPill({ riskClass }: { riskClass: string }) {
  const color = RISK_COLOR[riskClass] ?? T.muted;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: 1.2, padding: '2px 7px',
      borderRadius: 4, background: `${color}22`, color, border: `1px solid ${color}55`,
      fontFamily: 'IBM Plex Mono, monospace',
    }}>
      {riskClass}
    </span>
  );
}

// ---- Custom Tooltip for recharts ----------------------------------
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, color: T.sub, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ fontSize: 12, color: p.color ?? T.text }}>
          {p.value} {p.name}
        </div>
      ))}
    </div>
  );
}

// ---- Main page -----------------------------------------------------
export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/analytics')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(e => setError(String(e)));
  }, []);

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bg, color: T.red, fontFamily: 'IBM Plex Mono, monospace', fontSize: 13 }}>
        Could not load analytics: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bg, color: T.green, fontFamily: 'IBM Plex Mono, monospace', gap: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid ${T.green}`, borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: 10, letterSpacing: 2 }}>LOADING ANALYTICS...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const { hero, signalTypes, riskBuckets, corridorRows, timeline, sources, soulAverages } = data;

  const riskPieData = Object.entries(riskBuckets)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  const scorePercent = Math.round((hero.avgScore ?? 0) * 100);

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: 'IBM Plex Mono, monospace', overflowY: 'auto' }}>

      {/* ---- Top bar -------------------------------------------- */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: `${T.bg}ee`, backdropFilter: 'blur(12px)', borderBottom: `1px solid ${T.border}`, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ fontSize: 10, color: T.sub, textDecoration: 'none', letterSpacing: 1 }}>PHANTOM POE</a>
          <span style={{ color: T.muted }}>/</span>
          <span style={{ fontSize: 10, color: T.green, letterSpacing: 1.5 }}>DETECTION ANALYTICS</span>
        </div>
        <div style={{ fontSize: 9, color: T.muted }}>
          Updated {new Date(data.generatedAt).toLocaleTimeString()}
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* ---- Page title ----------------------------------------- */}
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: T.text, margin: 0, letterSpacing: -0.5 }}>
            What is the system detecting?
          </h1>
          <p style={{ fontSize: 13, color: T.sub, marginTop: 6, lineHeight: 1.6, maxWidth: 600, fontFamily: 'IBM Plex Mono, monospace' }}>
            Plain-English view of every corridor, signal, and risk the engine has found — updated in real time. No jargon.
          </p>
        </div>

        {/* ---- Hero numbers row ----------------------------------- */}
        <div>
          <SectionLabel>At a glance</SectionLabel>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <HeroCard label="Corridors found" value={hero.totalCorridors} sub="Unofficial border crossing routes" color={T.green} />
            <HeroCard label="Evidence pieces" value={hero.totalEvidence} sub="Signals, reports & detections" color={T.blue} />
            <HeroCard label="Avg risk score" value={`${scorePercent}%`} sub={scorePercent >= 70 ? 'High concern' : 'Moderate concern'} color={scorePercent >= 70 ? T.red : T.amber} />
            <HeroCard label="Total distance" value={`${hero.totalKm} km`} sub="Across all corridors" color={T.teal} />
          </div>
        </div>

        {/* ---- Signal types + Risk distribution (side by side) ---- */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>

          {/* Signal types */}
          <div style={{ flex: 2, minWidth: 300, background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
            <SectionLabel>What kind of signals?</SectionLabel>
            <p style={{ fontSize: 11, color: T.sub, marginBottom: 16, lineHeight: 1.6 }}>
              Each bar shows how many alerts of that type were found. Bigger bar = more events.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {signalTypes.length === 0 && (
                <div style={{ fontSize: 11, color: T.muted }}>No signal data yet.</div>
              )}
              {signalTypes.map(s => {
                const color = SIG_COLOR[s.type] ?? T.muted;
                const maxCount = Math.max(...signalTypes.map(x => x.count), 1);
                return (
                  <div key={s.type} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: T.text }}>{SIG_LABEL[s.type] ?? s.type}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: T.sub }}>{Math.round(s.avgScore * 100)}% confidence</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color }}>{s.count}</span>
                      </div>
                    </div>
                    <div style={{ height: 8, background: T.dim, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${(s.count / maxCount) * 100}%`,
                        background: color, borderRadius: 4,
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Risk pie */}
          <div style={{ flex: 1, minWidth: 240, background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column' }}>
            <SectionLabel>How dangerous?</SectionLabel>
            <p style={{ fontSize: 11, color: T.sub, marginBottom: 8, lineHeight: 1.6 }}>
              Each corridor gets a danger level. Red = most urgent, green = calm.
            </p>
            {riskPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={riskPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                    {riskPieData.map(entry => (
                      <Cell key={entry.name} fill={RISK_COLOR[entry.name] ?? T.muted} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11, color: T.text }}
                    formatter={(v, name) => [v, RISK_LABEL[name as string] ?? name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: 11 }}>No risk data</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(RISK_LABEL).map(([key, label]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: RISK_COLOR[key] ?? T.muted, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: T.sub, flex: 1 }}>{label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: RISK_COLOR[key] ?? T.muted }}>{riskBuckets[key] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ---- 7-day signal timeline ------------------------------ */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
          <SectionLabel>Signal activity — last 7 days</SectionLabel>
          <p style={{ fontSize: 11, color: T.sub, marginBottom: 16, lineHeight: 1.6 }}>
            How many alerts did the system detect each day? Tall bars = busy days.
          </p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={timeline} barSize={28} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: T.sub, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: T.sub, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: `${T.border}66` }} />
              <Bar dataKey="signals" name="signals" radius={[4, 4, 0, 0]}>
                {timeline.map(entry => (
                  <Cell key={entry.day} fill={entry.signals > 2 ? T.amber : entry.signals > 0 ? T.green : T.muted} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ---- Corridor table ------------------------------------- */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
            <SectionLabel>Every corridor — one row each</SectionLabel>
            <p style={{ fontSize: 11, color: T.sub, margin: 0, lineHeight: 1.6 }}>
              A corridor is a secret route people use to cross borders. The score shows how certain we are it is active.
            </p>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: T.surf }}>
                  {['Route', 'Region', 'Risk', 'Score', 'Distance', 'Speed', 'Signals', 'Travel'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: T.sub, letterSpacing: 1, fontSize: 9, fontWeight: 600, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {corridorRows.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${T.dim}`, background: i % 2 === 0 ? 'transparent' : `${T.surf}55` }}>
                    <td style={{ padding: '12px 16px', color: T.text, fontWeight: 600 }}>
                      <div>{c.short}</div>
                      <div style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>{c.startCC} → {c.endCC}</div>
                    </td>
                    <td style={{ padding: '12px 16px', color: T.sub, maxWidth: 180 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.region}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <RiskPill riskClass={c.riskClass} />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ScoreBar value={c.score} color={RISK_COLOR[c.riskClass] ?? T.muted} />
                        <span style={{ color: RISK_COLOR[c.riskClass] ?? T.text, minWidth: 32, textAlign: 'right' }}>
                          {Math.round(c.score * 100)}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: T.teal }}>{c.totalKm} km</td>
                    <td style={{ padding: '12px 16px', color: T.sub }}>{c.velocity} km/h</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ color: c.evidenceCount > 0 ? T.amber : T.muted }}>
                        {c.evidenceCount} found
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: T.sub }}>
                      {MODE_ICON[c.mode] ?? c.mode}
                    </td>
                  </tr>
                ))}
                {corridorRows.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: T.muted, fontSize: 11 }}>
                      No corridors detected yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---- Data sources + Soul averages ----------------------- */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>

          {/* Sources */}
          <div style={{ flex: 1, minWidth: 240, background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
            <SectionLabel>Where does the data come from?</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sources.length === 0 && <div style={{ fontSize: 11, color: T.muted }}>No sources yet.</div>}
              {sources.map(s => {
                const maxC = Math.max(...sources.map(x => x.count), 1);
                return (
                  <div key={s.source} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, color: T.text }}>{s.source}</span>
                      <span style={{ fontSize: 11, color: T.sub }}>{s.count} signals</span>
                    </div>
                    <div style={{ height: 4, background: T.dim, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(s.count / maxC) * 100}%`, background: T.blue, borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Engine soul averages radar */}
          {soulAverages.length > 0 && (
            <div style={{ flex: 1.5, minWidth: 280, background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
              <SectionLabel>Engine confidence — by dimension</SectionLabel>
              <p style={{ fontSize: 11, color: T.sub, marginBottom: 12, lineHeight: 1.6 }}>
                The engine scores each corridor on 8 dimensions. This shows how certain it is across all corridors combined.
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={soulAverages.map(s => ({ subject: s.key.toUpperCase(), value: Math.round(s.avg * 100) }))}>
                  <PolarGrid stroke={T.border} />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: T.sub, fontSize: 9 }} />
                  <Radar dataKey="value" stroke={T.green} fill={T.green} fillOpacity={0.15} dot={{ fill: T.green, r: 3 }} />
                  <Tooltip
                    contentStyle={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11, color: T.text }}
                    formatter={(v: any) => [`${v}%`, 'Confidence']}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ---- Footer -------------------------------------------- */}
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1 }}>
            PHANTOM POE ENGINE · MOSTAR INDUSTRIES · DETECTION ANALYTICS
          </div>
          <a href="/" style={{ fontSize: 9, color: T.sub, textDecoration: 'none', letterSpacing: 1 }}>
            BACK TO MAP VIEW
          </a>
        </div>

      </div>
    </div>
  );
}
