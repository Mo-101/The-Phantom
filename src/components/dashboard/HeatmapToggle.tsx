// ─────────────────────────────────────────────────────────────────
// PHANTOM POE ENGINE — HeatmapToggle Component
// MoStar Industries · Phantom POE · Nigeria CDC Integration
// ─────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import type mapboxgl from 'mapbox-gl';
import {
  initHeatmapOverlays,
  switchMode,
  setOverlayOpacity,
  removeHeatmapOverlays,
  DISEASE_OVERLAYS,
  type MapMode,
  type OverlayKey,
} from '../../../lib/heatmapOverlays';

interface HeatmapToggleProps {
  map: mapboxgl.Map | null;
}

export const HeatmapToggle: React.FC<HeatmapToggleProps> = ({ map }) => {
  const [mode, setMode] = useState<MapMode>('base');
  const [opacity, setOpacity] = useState(0.82);
  const initRef = useRef(false);
  const modeRef = useRef<MapMode>('base');
  const opacityRef = useRef(0.82);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);

  // Init on mount
  useEffect(() => {
    if (!map || initRef.current) return;
    void initHeatmapOverlays(map).then(() => {
      switchMode(map, modeRef.current);
      if (modeRef.current !== 'base') setOverlayOpacity(map, modeRef.current, opacityRef.current);
    });
    initRef.current = true;
    return () => { if (map) removeHeatmapOverlays(map); };
  }, [map]);

  const changeMode = (next: MapMode) => {
    if (!map) return;
    setMode(next);
    switchMode(map, next);
    if (next !== 'base') setOverlayOpacity(map, next, opacity);
  };

  const handleOpacity = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setOpacity(val);
    if (mode !== 'base' && map) setOverlayOpacity(map, mode, val);
  };

  const activeOverlay = mode === 'base' ? null : mode;

  return (
    <div style={WRAP}>
      {/* Header */}
      <div style={HDR}>
        <span style={{ color: '#f03b20', marginRight: 6, fontSize: 11 }}>◈</span>
        DISEASE HEAT
      </div>

      {/* Map mode switch */}
      <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 1fr 1fr', gap: 6, marginBottom: activeOverlay ? 8 : 0 }}>
        <button
          onClick={() => changeMode('base')}
          style={{
            padding: '5px 0',
            borderRadius: 5,
            border: `1px solid ${mode === 'base' ? '#8FA3B8' : '#333'}`,
            background: mode === 'base' ? 'rgba(148,163,184,0.13)' : 'transparent',
            color: mode === 'base' ? '#CBD5E1' : '#666',
            fontFamily: 'monospace',
            fontSize: 10,
            fontWeight: mode === 'base' ? 700 : 400,
            cursor: 'pointer',
            transition: 'all 0.15s',
            letterSpacing: 0,
          }}
          title="Show Phantom satellite base and corridor layers without disease style overlays."
        >
          {mode === 'base' ? '◉' : '○'} Base
        </button>
        {(Object.keys(DISEASE_OVERLAYS) as OverlayKey[]).map(key => {
          const cfg = DISEASE_OVERLAYS[key];
          const on  = mode === key;
          return (
            <button
              key={key}
              onClick={() => changeMode(key)}
              style={{
                padding: '5px 0',
                borderRadius: 5,
                border: `1px solid ${on ? cfg.color : '#333'}`,
                background: on ? `${cfg.color}22` : 'transparent',
                color: on ? cfg.color : '#666',
                fontFamily: 'monospace',
                fontSize: 10,
                fontWeight: on ? 700 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
                letterSpacing: 0,
              }}
              title={`Show ${cfg.label} over the Phantom hybrid satellite map.`}
            >
              {on ? '◉' : '○'} {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Opacity slider — only shown when an overlay is active */}
      {activeOverlay && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#555', fontSize: 9, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            Opacity
          </span>
          <input
            type="range" min={0.1} max={1} step={0.05}
            value={opacity}
            onChange={handleOpacity}
            style={{ flex: 1, accentColor: DISEASE_OVERLAYS[activeOverlay].color, cursor: 'pointer' }}
          />
          <span style={{ color: '#888', fontSize: 9, width: 28, textAlign: 'right' }}>
            {Math.round(opacity * 100)}%
          </span>
        </div>
      )}

      {/* Status dot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: activeOverlay ? DISEASE_OVERLAYS[activeOverlay].color : '#334155',
          boxShadow: activeOverlay ? `0 0 5px ${DISEASE_OVERLAYS[activeOverlay].color}` : 'none',
          transition: 'all 0.3s',
        }} />
        <span style={{ color: '#444', fontSize: 9 }}>
          {activeOverlay ? `${DISEASE_OVERLAYS[activeOverlay].label} active · Phantom base intact` : 'base map active'}
        </span>
      </div>
    </div>
  );
};

const WRAP: React.CSSProperties = {
  position: 'absolute',
  top: 76,
  left: 16,
  width: 286,
  background: 'rgba(10,12,20,0.90)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  padding: '10px 12px',
  color: '#e0e0e0',
  fontFamily: 'monospace',
  fontSize: 11,
  zIndex: 100,
};

const HDR: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: 1.2,
  color: '#888',
  textTransform: 'uppercase',
  marginBottom: 8,
};

export default HeatmapToggle;
