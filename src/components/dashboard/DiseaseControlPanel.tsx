// ─────────────────────────────────────────────────────────────────
// PHANTOM POE ENGINE — DiseaseControlPanel Component
// MoStar Industries · Phantom POE · Nigeria CDC Integration
// ─────────────────────────────────────────────────────────────────

import React from 'react';
import type { DiseaseType, LayerMode, DiseaseSummary, DiseaseLayerState } from '../../../lib/types';

interface DiseaseControlPanelProps {
  state: DiseaseLayerState;
  summary: DiseaseSummary | null;
  onDiseaseChange: (d: DiseaseType) => void;
  onModeChange: (m: LayerMode) => void;
  onYearFilter: (from: number, to: number) => void;
  onClearFilter: () => void;
}

const DISEASES: DiseaseType[] = ['LASSA', 'CHOLERA', 'MENINGITIS (CSM)', 'ALL'];
const MODES: { value: LayerMode; label: string }[] = [
  { value: 'both',        label: 'Choropleth + Points' },
  { value: 'choropleth',  label: 'Choropleth only' },
  { value: 'points',      label: 'Points only' },
];

const DISEASE_COLORS: Record<DiseaseType, string> = {
  'LASSA':            '#f03b20',
  'CHOLERA':          '#2171b5',
  'MENINGITIS (CSM)': '#238b45',
  'ALL':              '#fd8d3c',
};

const PANEL: React.CSSProperties = {
  position: 'absolute',
  top: 16,
  right: 16,
  width: 260,
  background: 'rgba(10,12,20,0.92)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  padding: '14px 16px',
  color: '#e0e0e0',
  fontFamily: 'monospace',
  fontSize: 12,
  zIndex: 100,
};

export const DiseaseControlPanel: React.FC<DiseaseControlPanelProps> = ({
  state,
  summary,
  onDiseaseChange,
  onModeChange,
  onYearFilter,
  onClearFilter,
}) => {
  const [yearFrom, setYearFrom] = React.useState(2018);
  const [yearTo, setYearTo]     = React.useState(2023);

  return (
    <div style={PANEL}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: DISEASE_COLORS[state.activeDisease],
          boxShadow: `0 0 6px ${DISEASE_COLORS[state.activeDisease]}`,
        }} />
        <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
          DISEASE LAYER
        </span>
        {!state.loaded && (
          <span style={{ color: '#888', fontSize: 10, marginLeft: 'auto' }}>loading…</span>
        )}
      </div>

      {/* Disease selector */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ color: '#666', fontSize: 10, marginBottom: 4, textTransform: 'uppercase' }}>
          Active Disease
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {DISEASES.map(d => (
            <button
              key={d}
              onClick={() => onDiseaseChange(d)}
              style={{
                padding: '3px 8px',
                borderRadius: 4,
                border: `1px solid ${state.activeDisease === d ? DISEASE_COLORS[d] : '#333'}`,
                background: state.activeDisease === d ? `${DISEASE_COLORS[d]}22` : 'transparent',
                color: state.activeDisease === d ? DISEASE_COLORS[d] : '#888',
                cursor: 'pointer',
                fontSize: 10,
                fontFamily: 'monospace',
                fontWeight: state.activeDisease === d ? 700 : 400,
                transition: 'all 0.15s',
              }}
            >
              {d === 'MENINGITIS (CSM)' ? 'CSM' : d}
            </button>
          ))}
        </div>
      </div>

      {/* Layer mode */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ color: '#666', fontSize: 10, marginBottom: 4, textTransform: 'uppercase' }}>
          Layer Mode
        </div>
        <select
          value={state.mode}
          onChange={e => onModeChange(e.target.value as LayerMode)}
          style={{
            width: '100%', background: '#111', color: '#ccc',
            border: '1px solid #333', borderRadius: 4, padding: '4px 6px',
            fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
          }}
        >
          {MODES.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Year range filter */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ color: '#666', fontSize: 10, marginBottom: 4, textTransform: 'uppercase' }}>
          Epi Year Range
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" min={2017} max={2023} value={yearFrom}
            onChange={e => setYearFrom(Number(e.target.value))}
            style={inputStyle}
          />
          <span style={{ color: '#555' }}>→</span>
          <input
            type="number" min={2017} max={2023} value={yearTo}
            onChange={e => setYearTo(Number(e.target.value))}
            style={inputStyle}
          />
          <button
            onClick={() => onYearFilter(yearFrom, yearTo)}
            style={btnStyle('#2171b5')}
          >Apply</button>
        </div>
        {state.temporalRange && (
          <button onClick={onClearFilter} style={{ ...btnStyle('#555'), marginTop: 4, width: '100%' }}>
            Clear filter ({state.temporalRange[0]}–{state.temporalRange[1]})
          </button>
        )}
      </div>

      {/* Summary stats */}
      {summary && (
        <div style={{ borderTop: '1px solid #222', paddingTop: 10 }}>
          <div style={{ color: '#666', fontSize: 10, marginBottom: 6, textTransform: 'uppercase' }}>
            Summary · {summary.disease}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
            <Stat label="LGAs" value={summary.lgas_affected} />
            <Stat label="Cases" value={summary.cases_total.toLocaleString()} />
            <Stat label="Confirmed" value={summary.confirmed_cases.toLocaleString()} />
            <Stat label="Deaths" value={summary.deaths} />
            <Stat label="CFR" value={`${summary.cfr_mean}%`} color="#f03b20" />
          </div>

          {/* Top LGAs */}
          <div style={{ marginTop: 8 }}>
            <div style={{ color: '#555', fontSize: 10, marginBottom: 4 }}>TOP BURDEN LGAs</div>
            {summary.top_lgas.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ color: '#aaa', fontSize: 10 }}>{l.lga}, {l.state}</span>
                <span style={{ color: DISEASE_COLORS[summary.disease], fontSize: 10, fontWeight: 600 }}>
                  {l.cases}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Mini components ───────────────────────────────────────────────
const Stat: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color }) => (
  <div>
    <div style={{ color: '#555', fontSize: 9, textTransform: 'uppercase' }}>{label}</div>
    <div style={{ color: color ?? '#e0e0e0', fontWeight: 600, fontSize: 12 }}>{value}</div>
  </div>
);

const inputStyle: React.CSSProperties = {
  width: 52, background: '#111', color: '#ccc',
  border: '1px solid #333', borderRadius: 4,
  padding: '3px 5px', fontSize: 11, fontFamily: 'monospace',
};

const btnStyle = (bg: string): React.CSSProperties => ({
  background: `${bg}33`, border: `1px solid ${bg}`,
  color: '#ccc', borderRadius: 4, padding: '3px 8px',
  cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
});

export default DiseaseControlPanel;
