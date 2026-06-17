/**
 * ◉⟁⬡  Phantom POE — Smart Tactical HUD
 *
 * Single unified HUD that consolidates:
 *   • Heartbeat honesty indicators (freshness, source health, provisional label)
 *   • Cascade replay state (Day / Signals / Score) — passes through from cascadeState
 *   • Corridor animation progress bar — passes through from corridorAnimState
 *   • Drift / prediction status — fromDriftResult
 *   • Crossborder alert severity summary
 *   • Live vs Historical mode indicator
 *
 * This is NOT a standalone panel — it receives all state from useMapboxMap
 * via props, so the same data drives both the map and the HUD with no
 * duplicate fetching.
 *
 * Layout: fixed bottom-center strip, collapsible, compact by default.
 */

'use client';

import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import type { CascadeState } from '@/hooks/mapbox/cascadeEngine';
import type { CorridorAnimState } from '@/hooks/mapbox/corridorAnimator';
import type { DriftResult } from '@/hooks/mapbox/driftEngine';
import type { HeartbeatLayerStatus } from '@/hooks/useHeartbeatLayer';
import { Play, Square, Radar, Sparkles, Activity, Radio } from 'lucide-react';

/* ─── Props ─── */

export interface SmartHudProps {
  // Mode
  mode: 'historical' | 'live';
  onSetMode: (mode: 'historical' | 'live') => void;

  // Heartbeat
  heartbeatStatus: HeartbeatLayerStatus;
  onRefreshHeartbeat: () => void;

  // Cascade (historical)
  cascadeState: CascadeState | null;
  isCascadeEnabled: boolean;
  selectedCorridorId: string | null;
  selectedCorridorEvidenceCount: number;
  onStartCascade: (corridorId: string) => void;
  onStopCascade: () => void;
  onScrub: (corridorId: string, position: number) => void;
  scrubberPosition: number;
  currentDate: Date | null;
  temporalRange: { min: Date | null; max: Date | null } | null;

  // Corridor animation (historical)
  corridorAnimState: CorridorAnimState | null;
  onStartAnim: () => void;
  onStopAnim: () => void;

  // Drift / predictive
  driftResult: DriftResult | null;
  onComputeDrift: (corridorId: string) => void;
  onClearDrift: () => void;

  // Layer toggle for heartbeat surface
  heartbeatSurfaceVisible: boolean;
  onToggleHeartbeatSurface: () => void;
}

/* ─── Constants ─── */

const SOURCE_COLOURS: Record<string, string> = {
  GDELT:     '#60a5fa',
  GDACS:     '#f97316',
  RELIEFWEB: '#a78bfa',
  IMERG:     '#34d399',
  FIRMS:     '#f43f5e',
};

/* ─── Sub-components ─── */

function Pip({ colour, pulse }: { colour: string; pulse?: boolean }) {
  return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%',
      background: colour,
      boxShadow: pulse ? `0 0 6px ${colour}` : 'none',
      transition: 'box-shadow 0.4s ease',
      flexShrink: 0,
    }} />
  );
}

function Divider() {
  return <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />;
}

function ModeTab({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px',
        borderRadius: 4,
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        background: active ? 'rgba(52,211,153,0.18)' : 'transparent',
        color: active ? '#34d399' : 'rgba(148,163,184,0.6)',
        transition: 'all 0.2s',
      }}
    >
      {label}
    </button>
  );
}

/* ─── Main HUD ─── */

export function SmartHud({
  mode, onSetMode,
  heartbeatStatus, onRefreshHeartbeat,
  cascadeState, isCascadeEnabled, selectedCorridorId, selectedCorridorEvidenceCount,
  onStartCascade, onStopCascade, onScrub, scrubberPosition, currentDate, temporalRange,
  corridorAnimState, onStartAnim, onStopAnim,
  driftResult, onComputeDrift, onClearDrift,
  heartbeatSurfaceVisible, onToggleHeartbeatSurface,
}: SmartHudProps) {
  const [expanded, setExpanded] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const prevFreshRef = useRef<number | null>(null);

  // Pulse animation when freshness counter decreases (new data arrived)
  useEffect(() => {
    const age = heartbeatStatus.data?.freshestEvidence?.ageMinutes ?? null;
    if (age !== null && prevFreshRef.current !== null && age < prevFreshRef.current) {
      setPulsing(true);
      const t = setTimeout(() => setPulsing(false), 900);
      return () => clearTimeout(t);
    }
    prevFreshRef.current = age;
  }, [heartbeatStatus.data?.freshestEvidence?.ageMinutes]);

  const hb = heartbeatStatus.data;
  const freshAge = hb?.freshestEvidence?.ageMinutes ?? null;
  const freshLabel = freshAge === null ? 'awaiting…' : freshAge === 0 ? 'just now' : `${freshAge}m ago`;

  const enginesAlive = (hb?.contributing?.count ?? 0) > 0;
  const isError = heartbeatStatus.connectionState === 'error';
  const isStale = heartbeatStatus.connectionState === 'stale';

  const borderColour = isError ? '#f43f5e' : isStale ? '#f59e0b' : enginesAlive ? 'rgba(52,211,153,0.35)' : 'rgba(71,85,105,0.5)';
  const heartColour = isError ? '#f43f5e' : isStale ? '#f59e0b' : enginesAlive ? '#34d399' : '#475569';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        minWidth: 520,
        maxWidth: 720,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
        fontSize: 11,
      }}
    >
      <div
        style={{
          background: 'rgba(7, 10, 16, 0.97)',
          border: `1px solid ${borderColour}`,
          borderRadius: 10,
          padding: '8px 12px',
          backdropFilter: 'blur(12px)',
          boxShadow: pulsing
            ? `0 0 28px rgba(52,211,153,0.22), 0 4px 24px rgba(0,0,0,0.7)`
            : `0 4px 24px rgba(0,0,0,0.7)`,
          transition: 'box-shadow 0.4s ease, border-color 0.3s ease',
        }}
      >
        {/* ── Top row: mode tabs + honesty label + expand ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {/* Mode tabs */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: 2, gap: 2 }}>
            <ModeTab label="Historical" active={mode === 'historical'} onClick={() => onSetMode('historical')} />
            <ModeTab label="Live" active={mode === 'live'} onClick={() => onSetMode('live')} />
          </div>

          <Divider />

          {/* Provisional label */}
          <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 9, letterSpacing: '0.14em' }}>
            ⟁ PROVISIONAL OSINT
          </span>

          {/* Field validation + synthetic */}
          <span style={{ color: 'rgba(148,163,184,0.5)', fontSize: 9 }}>
            FIELD: <span style={{ color: 'rgba(148,163,184,0.8)' }}>{hb?.fieldValidation ?? '…'}</span>
          </span>
          <span style={{
            color: hb?.syntheticInput ? '#f43f5e' : 'rgba(52,211,153,0.7)',
            fontSize: 9,
          }}>
            {hb?.syntheticInput ? 'SYNTHETIC ⚠' : 'REAL'}
          </span>

          <div style={{ flex: 1 }} />

          {/* Surface layer toggle */}
          <button
            onClick={onToggleHeartbeatSurface}
            style={{
              padding: '2px 7px', borderRadius: 4, fontSize: 9, fontFamily: 'inherit',
              cursor: 'pointer', fontWeight: 600, letterSpacing: '0.08em',
              background: heartbeatSurfaceVisible ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.04)',
              border: heartbeatSurfaceVisible ? '1px solid rgba(52,211,153,0.4)' : '1px solid rgba(255,255,255,0.1)',
              color: heartbeatSurfaceVisible ? '#34d399' : 'rgba(148,163,184,0.6)',
              transition: 'all 0.2s',
            }}
            title="Toggle probability surface grid on map"
          >
            P-GRID
          </button>

          <button
            onClick={() => setExpanded((v) => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(148,163,184,0.6)', fontSize: 10, padding: 0, fontFamily: 'inherit' }}
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>

        {/* ── Core metrics row ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

          {/* Heartbeat counter — the proof */}
          <div style={{
            flex: 1.5,
            background: pulsing ? 'rgba(52,211,153,0.07)' : 'rgba(52,211,153,0.02)',
            border: `1px solid rgba(52,211,153,0.18)`,
            borderRadius: 6,
            padding: '5px 9px',
            transition: 'background 0.4s ease',
          }}>
            <div style={{ color: 'rgba(52,211,153,0.55)', fontSize: 9, marginBottom: 2 }}>FRESHEST EVIDENCE</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Pip
                colour={heartColour}
                pulse={pulsing || heartbeatStatus.connectionState === 'polling'}
              />
              <span style={{
                color: freshAge !== null && freshAge <= 5 ? '#34d399' : freshAge !== null && freshAge <= 20 ? '#fbbf24' : '#f87171',
                fontWeight: 700,
                fontSize: 14,
              }}>
                {freshLabel}
              </span>
              {hb?.freshestEvidence?.source && (
                <span style={{ color: 'rgba(148,163,184,0.5)', fontSize: 9 }}>
                  {hb.freshestEvidence.source}
                </span>
              )}
            </div>
          </div>

          <Divider />

          {/* Contributing */}
          <div style={{ textAlign: 'center', minWidth: 56 }}>
            <div style={{ color: 'rgba(148,163,184,0.5)', fontSize: 9, marginBottom: 2 }}>SOURCES</div>
            <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 13 }}>
              {hb ? `${hb.contributing.count}/${hb.contributing.outOf}` : '—'}
            </div>
          </div>

          <Divider />

          {/* State summary pills */}
          {hb?.stateSummary && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {hb.stateSummary.active > 0 && (
                <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(52,211,153,0.12)', color: '#34d399', fontSize: 9, fontWeight: 700 }}>
                  A:{hb.stateSummary.active}
                </span>
              )}
              {hb.stateSummary.provisional > 0 && (
                <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(251,191,36,0.12)', color: '#fbbf24', fontSize: 9, fontWeight: 700 }}>
                  P:{hb.stateSummary.provisional}
                </span>
              )}
              {hb.stateSummary.unknownStale > 0 && (
                <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(249,115,22,0.12)', color: '#f97316', fontSize: 9, fontWeight: 700 }}>
                  S:{hb.stateSummary.unknownStale}
                </span>
              )}
              <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(71,85,105,0.2)', color: '#64748b', fontSize: 9 }}>
                SURGE:OFF
              </span>
            </div>
          )}

          <Divider />

          {/* Action buttons — same as MapArea bottom bar, consolidated here */}
          <div style={{ display: 'flex', gap: 4 }}>
            {/* Animate */}
            <ActionButton
              icon={corridorAnimState?.active ? <Square size={10} /> : <Play size={10} />}
              label="ANIM"
              active={!!corridorAnimState?.active}
              disabled={mode !== 'historical'}
              activeColour="#f43f5e"
              idleColour="#34d399"
              title={mode !== 'historical' ? 'Historical mode only' : 'Animate corridor build-up'}
              onClick={() => corridorAnimState?.active ? onStopAnim() : onStartAnim()}
            />

            {/* Cascade */}
            <ActionButton
              icon={<Radar size={10} />}
              label="CASCADE"
              active={!!cascadeState?.active}
              disabled={!isCascadeEnabled || (!selectedCorridorId && !cascadeState?.active) || (!cascadeState?.active && selectedCorridorEvidenceCount === 0)}
              activeColour="#ef4444"
              idleColour="#f59e0b"
              title={selectedCorridorId ? `Cascade evidence for ${selectedCorridorId}` : 'Select a corridor first'}
              onClick={() => {
                if (cascadeState?.active) { onStopCascade(); return; }
                if (selectedCorridorId) onStartCascade(selectedCorridorId);
              }}
            />

            {/* Predictive */}
            <ActionButton
              icon={<Sparkles size={10} />}
              label="DRIFT"
              active={!!driftResult}
              disabled={!isCascadeEnabled || (!selectedCorridorId && !driftResult)}
              activeColour="#94a3b8"
              idleColour="#818cf8"
              title={selectedCorridorId ? 'Compute drift prediction' : 'Select a corridor first'}
              onClick={() => {
                if (driftResult) { onClearDrift(); return; }
                if (selectedCorridorId) onComputeDrift(selectedCorridorId);
              }}
            />
          </div>
        </div>

        {/* ── Cascade progress bar (when active) ── */}
        {cascadeState?.active && (
          <div style={{ marginTop: 8, padding: '6px 9px', background: 'rgba(245,158,11,0.06)', borderRadius: 6, border: '1px solid rgba(245,158,11,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ color: 'rgba(148,163,184,0.6)', fontSize: 9 }}>CASCADE</span>
              <span style={{ color: '#34d399', fontSize: 11, fontWeight: 600 }}>Day {cascadeState.day}</span>
              <span style={{ color: '#e2e8f0', fontSize: 11 }}>{cascadeState.signalsRevealed} signals</span>
              <span style={{ color: '#f59e0b', fontSize: 11 }}>Score {cascadeState.cumulativeScore.toFixed(0)}</span>
              {cascadeState.currentDate && (
                <span style={{ color: 'rgba(148,163,184,0.5)', fontSize: 9, marginLeft: 'auto' }}>
                  {cascadeState.currentDate.toLocaleDateString()}
                </span>
              )}
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${cascadeState.progress}%`,
                background: 'linear-gradient(90deg, #3b82f6, #22d3ee, #84cc16, #eab308, #ef4444)',
                borderRadius: 2,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )}

        {/* ── Corridor anim progress bar (when active) ── */}
        {corridorAnimState?.active && (
          <div style={{ marginTop: 8, padding: '6px 9px', background: 'rgba(52,211,153,0.04)', borderRadius: 6, border: '1px solid rgba(52,211,153,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ color: 'rgba(148,163,184,0.6)', fontSize: 9 }}>CORRIDOR ANIM</span>
              <span style={{ color: '#34d399', fontSize: 11, fontFamily: 'monospace' }}>{corridorAnimState.dateLabel}</span>
              <span style={{ color: 'rgba(52,211,153,0.6)', fontSize: 9, marginLeft: 'auto' }}>
                {Math.round(corridorAnimState.progress * 100)}%
              </span>
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(corridorAnimState.progress * 100).toFixed(1)}%`,
                background: 'linear-gradient(90deg, #3b82f6, #22d3ee, #84cc16, #eab308, #ef4444)',
                transition: 'width 0.1s linear',
              }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 3, color: 'rgba(148,163,184,0.4)', fontSize: 9 }}>
              <span>{corridorAnimState.dayLabel}</span>
              <span>·</span>
              <span>{corridorAnimState.weekLabel}</span>
              <span>·</span>
              <span>{corridorAnimState.monthLabel}</span>
              <span>·</span>
              <span>{corridorAnimState.year}</span>
            </div>
          </div>
        )}

        {/* ── Drift active pill ── */}
        {driftResult && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.25)', color: '#818cf8', fontSize: 9, fontWeight: 600 }}>
              ◇ PREDICTIVE DRIFT ACTIVE
            </span>
            <span style={{ color: 'rgba(148,163,184,0.4)', fontSize: 9 }}>
              confidence: {((driftResult.confidence ?? 0.5) * 100).toFixed(0)}%
            </span>
          </div>
        )}

        {/* ── Error strip ── */}
        {isError && heartbeatStatus.errorMessage && (
          <div style={{ marginTop: 6, padding: '3px 8px', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: 4, color: '#f43f5e', fontSize: 9 }}>
            ⚠ {heartbeatStatus.errorMessage.slice(0, 80)}
          </div>
        )}

        {/* ── Expanded: source rows ── */}
        {expanded && hb && (
          <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
            <div style={{ color: 'rgba(148,163,184,0.45)', fontSize: 9, letterSpacing: '0.12em', marginBottom: 6 }}>
              LIVE SOURCE STATUS
            </div>
            {hb.sources.map((src) => {
              const colour = SOURCE_COLOURS[src.id] ?? '#94a3b8';
              const tauMin = Math.round(src.decayConstantS / 60);
              const stale = src.ageMinutes !== null && src.ageMinutes > tauMin * 3;
              return (
                <div key={src.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <Pip colour={src.error ? '#f43f5e' : stale ? '#f59e0b' : colour} pulse={!src.error && !stale} />
                  <span style={{ color: colour, width: 72, fontWeight: 600, fontSize: 10 }}>{src.id}</span>
                  <span style={{ flex: 1, color: src.error ? '#f87171' : stale ? '#fbbf24' : '#94a3b8', fontSize: 10 }}>
                    {src.error
                      ? `✗ ${src.error.slice(0, 40)}`
                      : src.ageMinutes === null
                      ? 'pending…'
                      : `${src.ageMinutes}m ago  ·  ${src.lastCount} records`}
                  </span>
                  <span style={{ color: 'rgba(148,163,184,0.3)', fontSize: 9 }}>τ={tauMin}m</span>
                </div>
              );
            })}

            {/* Highest cell */}
            {hb.surfaceSnapshot?.highestCell && (
              <div style={{ marginTop: 6, color: 'rgba(148,163,184,0.5)', fontSize: 9 }}>
                Highest cell: <span style={{ color: '#e2e8f0' }}>{hb.surfaceSnapshot.highestCell.cellId}</span>
                {' '}p=<span style={{ color: '#fbbf24' }}>{hb.surfaceSnapshot.highestCell.posterior.toFixed(3)}</span>
                {' '}· {hb.surfaceSnapshot.totalSignalsFused} signals fused
                {' '}· {heartbeatStatus.dataFreshnessSeconds}s ago
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── ActionButton ─── */

function ActionButton({
  icon, label, active, disabled, activeColour, idleColour, title, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  disabled: boolean;
  activeColour: string;
  idleColour: string;
  title: string;
  onClick: () => void;
}) {
  const colour = disabled ? '#374151' : active ? activeColour : idleColour;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 8px', borderRadius: 5,
        background: active ? `${colour}18` : 'rgba(255,255,255,0.03)',
        border: `1px solid ${active ? `${colour}55` : 'rgba(255,255,255,0.08)'}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: colour,
        fontFamily: 'inherit',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.08em',
        opacity: disabled ? 0.4 : 1,
        transition: 'all 0.2s',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
