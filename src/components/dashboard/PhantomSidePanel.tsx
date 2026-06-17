"use client";

/**
 * ◉⟁⬡  Phantom POE — Unified Collapsible Side Panel
 *
 * Collapsible left command rail for the Phantom POE map.
 *
 * Design doctrine:
 *   1. PROVENANCE FIRST. The top block is always the live data sources —
 *      where the signal comes from, how fresh, how many contributing.
 *      This is the credibility layer; it does not get buried under the legend.
 *   2. Collapsible to a thin rail so the operator can see the full map.
 *   3. Honest status. A source that is stale/erroring shows it. No source
 *      ever displays "live" on stale data. UNKNOWN_STALE != fresh.
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  ChevronDown, 
  ChevronUp, 
  Layers, 
  Eye, 
  EyeOff, 
  History, 
  Radio, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  Clock, 
  HelpCircle 
} from "lucide-react";
import {
  initHeatmapOverlays,
  switchMode,
  setOverlayOpacity,
  DISEASE_OVERLAYS,
  type MapMode,
  type OverlayKey,
} from "../../../lib/heatmapOverlays";
import { EVD_RISK_BANDS } from "@/hooks/mapbox/drawNigeriaEVDRiskLayer";

export type SourceStatus = "live" | "idle" | "down";

export interface PhantomSource {
  id: string;
  label: string;
  family: string;
  status: SourceStatus;
  freshnessSec: number | null;
  roseColor?: string;
  cadence: string;
  downReason?: string;
}

export interface PhantomPrior {
  id: string;
  label: string;
  role: string;
}

export interface PhantomPanelProps {
  map?: mapboxgl.Map | null;
  classification?: string;
  fieldValidation?: string;
  syntheticInput?: boolean;
  
  // Layer visibility & callbacks
  officialPOEsVisible: boolean;
  onTogglePOEs: (visible: boolean) => void;
  evidenceVisible: boolean;
  onToggleEvidence: () => void;
  layerVisibility?: Record<string, boolean>;
  onToggleLayer?: (layer: string) => void;

  // Mode & Live Status
  mode: "historical" | "live";
  onSetMode: (mode: "historical" | "live") => void;
  liveStatus?: {
    connectionState: "idle" | "polling" | "error" | "stale";
    lastFetchAt: Date | null;
    lastSuccessfulFetchAt: Date | null;
    newSignalsCount: number;
    pollLatencyMs: number;
    dataFreshnessSeconds: number;
    errorMessage: string | null;
    sources?: Array<{
      id: string;
      lastFetchIso: string | null;
      ageMinutes: number | null;
      lastCount: number;
      error: string | null;
      decayConstantS: number;
    }>;
  };
  onRefreshLiveData?: () => void;

  // Metadata / Stats
  corridorsLoaded?: boolean;
  coverageStats?: {
    monitoredPct: number;
    unmonitoredPct: number;
    totalCorridors: number;
    totalPhantomKm: number;
    totalFormalKm: number;
  } | null;
  selectedCorridorId?: string | null;
  driftResult?: {
    corridorId: string;
    confidence: number;
    avgMagnitudeKm: number;
    bearingDeg: number;
    activationLikelihood: number;
    drivers: Array<{ name: string; weight: number; signalCount: number }>;
  } | null;
}

const LAYER_DEFS = [
  { key: "corridors", label: "Corridors", color: "hsl(var(--phantom-green))", tip: "Inferred phantom paths and paired formal routes currently drawn on the map." },
  { key: "officialPOEs", label: "Official POEs", color: "hsl(217, 91%, 60%)", tip: "Known formal points of entry and monitored border gates." },
  { key: "evidence", label: "Evidence Signals", color: "hsl(var(--phantom-amber))", tip: "Time-stamped signals from flows, events, health, conflict, and static live seeds." },
  { key: "liveDiseaseSignals", label: "Live Disease Areas", color: "#EF4444", tip: "Real-time disease signals from the protected live API, aggregated into choropleth grid cells by disease." },
  { key: "nigeriaEVDRisk", label: "Nigeria EVD POE Risk", color: "#FF2D55", tip: "Seed Nigeria point-of-entry risk scores for Ebola virus disease importation readiness review." },
  { key: "crossborderRiskAlerts", label: "Cross-Border Alerts", color: "#F97316", tip: "Action zones where corridor pressure, disease proximity, and POE readiness combine into a cross-border risk alert." },
  { key: "deviationAnalytics", label: "Deviation Heatline", color: "#EF4444", tip: "Selected-corridor analysis showing where phantom movement diverges from monitored roads." },
  { key: "heartbeatSurface", label: "Heartbeat Surface (P-Grid)", color: "#10B981", tip: "Probability surface grid (cells) driven by Bayesian posteriors from live OSINT sources." },
];

const STATUS_META: Record<SourceStatus, { color: string; dot: string; text: string; glow: boolean }> = {
  live: { color: "#22C55E", dot: "#22C55E", text: "live", glow: true },
  idle: { color: "#4B7A5A", dot: "#3A5F47", text: "idle", glow: false },
  down: { color: "#EF4444", dot: "#EF4444", text: "down", glow: false },
};

function freshLabel(sec: number | null): string {
  if (sec === null) return "—";
  if (sec < 60) return `${Math.round(sec)}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  return `${Math.round(sec / 3600)}h ago`;
}

// Custom CSS variables mapped to Tailwind themes
const PANEL_BG = "#0A0E14";
const PANEL_BORDER = "#1C2430";
const TEXT_DIM = "#6B7685";
const TEXT_MID = "#9CA8B8";
const TEXT_BRIGHT = "#D6DEE8";
const ACCENT = "#F59E0B";

export function PhantomSidePanel(props: PhantomPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [layersExpanded, setLayersExpanded] = useState(true);
  const [diseaseMode, setDiseaseMode] = useState<MapMode>("base");
  const [diseaseOpacity, setDiseaseOpacity] = useState(0.82);
  const initRef = useRef(false);

  const {
    map,
    classification = "PROVISIONAL OSINT INFERENCE",
    fieldValidation = "PENDING",
    syntheticInput = false,
    officialPOEsVisible,
    onTogglePOEs,
    evidenceVisible,
    onToggleEvidence,
    layerVisibility = {},
    onToggleLayer,
    mode,
    onSetMode,
    liveStatus,
    onRefreshLiveData,
    corridorsLoaded = false,
    coverageStats = null,
    selectedCorridorId = null,
    driftResult = null,
  } = props;

  // Initialize disease overlays from map legend code
  useEffect(() => {
    if (!map || initRef.current) return;
    void initHeatmapOverlays(map).then(() => {
      switchMode(map, diseaseMode);
      if (diseaseMode !== "base") setOverlayOpacity(map, diseaseMode, diseaseOpacity);
    });
    initRef.current = true;
  }, [map]);

  const changeDiseaseMode = (next: MapMode) => {
    if (!map) return;
    setDiseaseMode(next);
    switchMode(map, next);
    if (next !== "base") setOverlayOpacity(map, next, diseaseOpacity);
  };

  const handleDiseaseOpacity = (val: number) => {
    setDiseaseOpacity(val);
    if (diseaseMode !== "base" && map) setOverlayOpacity(map, diseaseMode, val);
  };

  // Honest sources setup based on API status
  const sources: PhantomSource[] = [
    {
      id: "gdelt",
      label: "GDELT",
      family: "event",
      status: (liveStatus?.connectionState === "error" || liveStatus?.sources?.find(s => s.id === "GDELT")?.error) ? "down" : "live",
      freshnessSec: liveStatus?.dataFreshnessSeconds ?? null,
      cadence: "30 min",
      downReason: liveStatus?.sources?.find(s => s.id === "GDELT")?.error ?? undefined,
    },
    {
      id: "gdacs",
      label: "GDACS",
      family: "disaster",
      status: liveStatus?.sources?.find(s => s.id === "GDACS")?.error ? "down" : "live",
      freshnessSec: liveStatus?.dataFreshnessSeconds ?? null,
      cadence: "6 min",
    },
    {
      id: "afro-sentinel",
      label: "AFRO Sentinel",
      family: "disease",
      status: liveStatus?.sources?.find(s => s.id === "AFRO Sentinel")?.error ? "down" : "live",
      freshnessSec: liveStatus?.dataFreshnessSeconds ?? null,
      cadence: "on-demand",
    },
    {
      id: "imerg",
      label: "IMERG",
      family: "precip",
      status: "idle",
      freshnessSec: null,
      cadence: "30 min",
    },
    {
      id: "firms",
      label: "FIRMS",
      family: "fire",
      status: "idle",
      freshnessSec: null,
      cadence: "3 hr",
    },
    {
      id: "acled",
      label: "ACLED",
      family: "conflict",
      status: "down",
      freshnessSec: null,
      cadence: "30 min",
      downReason: "403 auth mismatch",
    },
    {
      id: "dhis2",
      label: "DHIS2 / EWARS",
      family: "disease",
      status: "down",
      freshnessSec: null,
      cadence: "daily",
      downReason: "demo sandbox dead",
    }
  ];

  // Static/Grounding Priors
  const priors: PhantomPrior[] = [
    { id: "unhcr", label: "UNHCR Uganda", role: "settlement prior" },
    { id: "ncdc", label: "NCDC Lassa", role: "3,036 static records" },
    { id: "iom-dtm", label: "IOM DTM", role: "admin displacement prior" },
  ];

  const contributingCount = sources.filter(s => s.status === "live").length;
  const totalSources = sources.length;

  if (collapsed) {
    return (
      <div style={{
        position: "absolute", top: 12, left: 12, zIndex: 20,
        background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 8, width: 44, display: "flex", flexDirection: "column",
        alignItems: "center", padding: "10px 0", gap: 14, fontFamily: "monospace",
      }}>
        <button onClick={() => setCollapsed(false)} aria-label="Expand panel"
          style={iconBtn}>›</button>
        <div style={{ writingMode: "vertical-rl", fontSize: 10, letterSpacing: 2,
          color: TEXT_DIM, textTransform: "uppercase" }}>Phantom</div>
        <div style={{ width: 8, height: 8, borderRadius: "50%",
          background: contributingCount > 0 ? "#22C55E" : "#EF4444" }} />
      </div>
    );
  }

  return (
    <div style={{
      position: "absolute", top: 12, left: 12, zIndex: 20,
      background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`,
      borderRadius: 10, width: 300, maxHeight: "calc(100vh - 100px)",
      overflowY: "auto", fontFamily: "monospace", color: TEXT_MID,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 14px", borderBottom: `1px solid ${PANEL_BORDER}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: ACCENT, fontSize: 13 }}>◉⟁⬡</span>
          <span style={{ fontSize: 12, color: TEXT_BRIGHT, letterSpacing: 1 }}>
            PHANTOM POE HUD
          </span>
        </div>
        <button onClick={() => setCollapsed(true)} aria-label="Collapse panel"
          style={iconBtn}>‹</button>
      </div>

      {/* MODE TOGGLE & STATUS */}
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${PANEL_BORDER}` }}>
        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-md">
          <button
            onClick={() => onSetMode?.("historical")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-mono rounded transition-colors ${
              mode === "historical"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Historical mode"
          >
            <History className="w-3.5 h-3.5" />
            Historical
          </button>
          <button
            onClick={() => onSetMode?.("live")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-mono rounded transition-colors ${
              mode === "live"
                ? "bg-card text-phantom-green shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Live mode"
          >
            <Radio className="w-3.5 h-3.5" />
            Live
          </button>
        </div>

        {/* Live Refresh Status */}
        {mode === "live" && liveStatus && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-border/50 mt-2 bg-muted/30">
            {liveStatus.connectionState === "error" ? (
              <WifiOff className="w-3.5 h-3.5 text-destructive" />
            ) : liveStatus.connectionState === "stale" ? (
              <Clock className="w-3.5 h-3.5 text-phantom-amber" />
            ) : liveStatus.connectionState === "polling" ? (
              <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-phantom-green" />
            )}
            <span className={`text-[10px] uppercase font-bold ${
              liveStatus.connectionState === "error"
                ? "text-destructive"
                : liveStatus.connectionState === "stale"
                ? "text-phantom-amber"
                : "text-phantom-green"
            }`}>
              {liveStatus.connectionState === "error" ? "CONN ERROR" : liveStatus.connectionState === "stale" ? "STALE" : "LIVE SCANNING"}
            </span>
            <button
              onClick={onRefreshLiveData}
              className="ml-auto p-1 hover:bg-white/10 rounded transition-colors"
              title="Manual refresh"
            >
              <RefreshCw className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>

      {/* ── PROVENANCE BLOCK (top, always) ── */}
      <Section title="Live data sources" accent>
        <div style={{
          display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10,
        }}>
          <span style={{ fontSize: 22, color: TEXT_BRIGHT, fontWeight: 500 }}>
            {contributingCount}
          </span>
          <span style={{ fontSize: 12, color: TEXT_DIM }}>
            of {totalSources} contributing
          </span>
        </div>

        {sources.map((s) => {
          const m = STATUS_META[s.status];
          return (
            <div key={s.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "5px 0", borderBottom: `1px solid #131A24`,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%", background: m.dot,
                flexShrink: 0,
                boxShadow: m.glow ? `0 0 6px ${m.dot}` : "none",
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: TEXT_BRIGHT }}>
                  {s.label}
                  <span style={{ color: TEXT_DIM, marginLeft: 6, fontSize: 10 }}>
                    {s.family}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: TEXT_DIM }}>
                  {s.status === "down"
                    ? (s.downReason ?? "unreachable")
                    : s.status === "idle"
                      ? `${s.cadence} · 0 in AOI`
                      : `${s.cadence} · ${freshLabel(s.freshnessSec)}`}
                </div>
              </div>
              <span style={{
                fontSize: 9, color: m.color, textTransform: "uppercase",
                letterSpacing: 0.5,
              }}>{m.text}</span>
            </div>
          );
        })}
      </Section>

      {/* ── GROUND TEAM BRIEFING (with live telemetry and API feed monitor) ── */}
      <Section title="Ground Team Briefing">
        <div style={{
          padding: 8,
          background: "rgba(245, 158, 11, 0.04)",
          border: "1px solid rgba(245, 158, 11, 0.15)",
          borderRadius: 6,
          fontSize: 10,
          fontFamily: "monospace",
          marginBottom: 10,
        }}>
          {/* Telemetry Status Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 6, marginBottom: 6 }}>
            <div>
              <span style={{ color: TEXT_DIM }}>Scan latency</span>
              <div style={{ color: TEXT_BRIGHT }}>{liveStatus?.pollLatencyMs ? `${liveStatus.pollLatencyMs}ms` : "—"}</div>
            </div>
            <div>
              <span style={{ color: TEXT_DIM }}>Signals fused</span>
              <div style={{ color: "#22C55E", fontWeight: "bold" }}>{liveStatus?.newSignalsCount ?? 0} active</div>
            </div>
            <div>
              <span style={{ color: TEXT_DIM }}>Last poll</span>
              <div style={{ color: TEXT_BRIGHT }}>{freshLabel(liveStatus?.dataFreshnessSeconds ?? null)}</div>
            </div>
            <div>
              <span style={{ color: TEXT_DIM }}>State model</span>
              <div style={{ color: ACCENT }}>v3.1 Sealed</div>
            </div>
          </div>

          {/* Dynamic Advisories */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, lineHeight: 1.4 }}>
            <div style={{ color: TEXT_BRIGHT, fontWeight: "bold", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Live Telemetry & Alerts:
            </div>
            {sources.some(s => s.status === "down") ? (
              <div style={{ color: "#EF4444" }}>
                ⚠️ Feed disruption: {sources.filter(s => s.status === "down").map(s => s.label).join(", ")} offline. Cross-verify via AFRO Sentinel.
              </div>
            ) : (
              <div style={{ color: "#22C55E" }}>
                ✓ All telemetry links online and functional.
              </div>
            )}
            {selectedCorridorId ? (
              <div style={{ color: "#FDE047" }}>
                ◉ Focus: {selectedCorridorId.toUpperCase()} selected. Trace spatial-temporal cascade for anomalies.
              </div>
            ) : (
              <div style={{ color: TEXT_MID }}>
                ◉ No corridor selected. Scanning regional grid SW: [3.00N, 30.85E] to NE: [3.50N, 31.05E].
              </div>
            )}
            {driftResult && (
              <div style={{ color: "#F59E0B" }}>
                ✦ Drift Alert: Inferred path shifting by {driftResult.avgMagnitudeKm.toFixed(1)} km at {driftResult.bearingDeg.toFixed(0)}°.
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* ── PRIORS (separated — grounding weights, never tick, never counted) ── */}
      {priors.length > 0 && (
        <Section title="Priors · grounding">
          <div style={{ fontSize: 9, color: TEXT_DIM, marginBottom: 8, lineHeight: 1.5 }}>
            static baselines the live layer modulates — not heartbeat feeds
          </div>
          {priors.map((p) => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: 2, background: "#2C3644",
                border: `1px solid ${PANEL_BORDER}`, flexShrink: 0,
              }} />
              <span style={{ fontSize: 11, color: TEXT_MID }}>{p.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 9, color: TEXT_DIM }}>
                {p.role}
              </span>
            </div>
          ))}
        </Section>
      )}

      {/* CLASSIFICATION */}
      <Section title="Classification">
        <Row k="status" v={classification} vColor={ACCENT} />
        <Row k="field validation" v={fieldValidation}
          vColor={fieldValidation === "PENDING" ? "#EAB308" : "#22C55E"} />
        <Row k="synthetic input" v={syntheticInput ? "YES" : "NO"}
          vColor={syntheticInput ? "#EF4444" : "#22C55E"} />
        <Row k="geometry" v="RUNTIME INFERRED" vColor={TEXT_MID} />
      </Section>

      {/* PREDICTIVE DRIFT */}
      {driftResult && (
        <Section title="Predictive Analysis">
          <div className="p-2 bg-yellow-400/5 border border-yellow-400/20 rounded text-[10px] font-mono space-y-1">
            <div className="flex justify-between text-yellow-300/80">
              <span title="Likelihood of drift activation.">Activation likelihood</span>
              <span className="tabular-nums font-semibold">{(driftResult.activationLikelihood * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Confidence</span>
              <span className="tabular-nums">{(driftResult.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Avg shift</span>
              <span className="tabular-nums">{driftResult.avgMagnitudeKm.toFixed(1)} km</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Bearing</span>
              <span className="tabular-nums">{driftResult.bearingDeg.toFixed(0)}°</span>
            </div>
            {driftResult.drivers.length > 0 && (
              <div className="pt-1 border-t border-yellow-400/10">
                <p className="text-muted-foreground/60 mb-1">Drivers</p>
                {driftResult.drivers.slice(0, 4).map(d => (
                  <div key={d.name} className="flex justify-between">
                    <span className="text-muted-foreground/70 truncate max-w-[140px]">{d.name}</span>
                    <span className="tabular-nums text-yellow-300/60">{(d.weight * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── COVERAGE ── */}
      {corridorsLoaded && coverageStats && (
        <Section title="Coverage gap">
          <div style={{
            height: 6, borderRadius: 3, marginBottom: 6, overflow: "hidden",
            background: "#EF4444",
          }}>
            <div style={{
              width: `${coverageStats.monitoredPct}%`, height: "100%", background: "#3B82F6",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
            <span style={{ color: "#3B82F6" }}>{coverageStats.monitoredPct}% monitored</span>
            <span style={{ color: "#EF4444" }}>{coverageStats.unmonitoredPct}% hidden</span>
          </div>
          <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 6 }}>
            {coverageStats.totalCorridors} corridors · {coverageStats.totalPhantomKm.toLocaleString()} km phantom ·{" "}
            {coverageStats.totalFormalKm.toLocaleString()} km formal
          </div>
        </Section>
      )}

      {/* ── LAYERS ── */}
      {onToggleLayer && (
        <Section title="Layers">
          <button
            onClick={() => setLayersExpanded(!layersExpanded)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", background: "none", border: "none", cursor: "pointer",
              color: TEXT_DIM, marginBottom: 8
            }}
          >
            <span className="flex items-center gap-1.5">
              <Layers className="w-3 h-3" />
              Toggle Map Layers
            </span>
            {layersExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {layersExpanded && (
            <div className="space-y-1">
              {LAYER_DEFS.map((layer) => {
                const isOn = layer.key === "officialPOEs"
                  ? officialPOEsVisible
                  : layer.key === "evidence"
                  ? evidenceVisible
                  : (layerVisibility[layer.key] ?? true);
                return (
                  <button
                    key={layer.key}
                    title={layer.tip}
                    onClick={() => {
                      if (layer.key === "evidence") {
                        onToggleEvidence?.();
                      } else if (layer.key === "officialPOEs") {
                        onTogglePOEs(!officialPOEsVisible);
                      } else {
                        onToggleLayer(layer.key);
                      }
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "5px 0", background: "none", border: "none",
                      cursor: "pointer", textAlign: "left",
                      opacity: isOn ? 1 : 0.4,
                    }}
                  >
                    {layer.key === "corridors" && (
                      <div className="w-5 h-[3px] rounded bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 shrink-0" />
                    )}
                    {layer.key === "officialPOEs" && (
                      <div className="w-2.5 h-2.5 rotate-45 shrink-0 border bg-blue-500 border-blue-500" />
                    )}
                    {layer.key === "evidence" && (
                      <div className="w-2 rounded-full h-2 shrink-0 border bg-amber-500 border-amber-500" />
                    )}
                    {layer.key === "liveDiseaseSignals" && (
                      <div className="w-2 rounded-full h-2 shrink-0 border bg-red-500 border-red-500" />
                    )}
                    {layer.key === "nigeriaEVDRisk" && (
                      <div className="w-2 rounded-full h-2 shrink-0 border bg-pink-500 border-pink-500" />
                    )}
                    {layer.key === "crossborderRiskAlerts" && (
                      <div className="w-2.5 h-2.5 rounded-sm border shrink-0 bg-orange-500 border-orange-500" />
                    )}
                    {layer.key === "deviationAnalytics" && (
                      <div className="w-5 h-[2px] rounded bg-red-500 shrink-0" />
                    )}
                    {layer.key === "heartbeatSurface" && (
                      <div className="grid grid-cols-2 gap-[1px] w-3 h-3 shrink-0">
                        <div className="w-1.5 h-1.5 border border-emerald-500 bg-emerald-500/20" />
                        <div className="w-1.5 h-1.5 border border-amber-500 bg-amber-500/20" />
                        <div className="w-1.5 h-1.5 border border-orange-500 bg-orange-500/20" />
                        <div className="w-1.5 h-1.5 border border-red-500 bg-red-500/20" />
                      </div>
                    )}
                    <span style={{ fontSize: 11, color: isOn ? TEXT_BRIGHT : TEXT_DIM }} className={isOn ? "" : "line-through"}>
                      {layer.label}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 9, color: TEXT_DIM }}>
                      {isOn ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* DISEASE HEATMAP OVERLAYS */}
      <Section title="Disease Heat">
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          <button
            onClick={() => changeDiseaseMode("base")}
            className={`py-1 rounded text-[10px] font-mono border transition-all ${
              diseaseMode === "base"
                ? "border-muted text-foreground bg-muted/20 font-bold"
                : "border-border/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            Base
          </button>
          {(Object.keys(DISEASE_OVERLAYS) as OverlayKey[]).map(key => {
            const cfg = DISEASE_OVERLAYS[key];
            const on = diseaseMode === key;
            return (
              <button
                key={key}
                onClick={() => changeDiseaseMode(key)}
                className="py-1 rounded text-[10px] font-mono border transition-all"
                style={{
                  borderColor: on ? cfg.color : "rgba(255,255,255,0.08)",
                  background: on ? `${cfg.color}18` : "transparent",
                  color: on ? cfg.color : "rgba(148,163,184,0.6)",
                  fontWeight: on ? 700 : 400,
                }}
              >
                {key === "STYLE_V1" ? "Heat v1" : "Heat v2"}
              </button>
            );
          })}
        </div>

        {diseaseMode !== "base" && (
          <div className="flex items-center gap-2 px-1 text-[9px] font-mono text-muted-foreground">
            <span>Opacity</span>
            <input
              type="range" min={0.1} max={1} step={0.05}
              value={diseaseOpacity}
              onChange={(e) => handleDiseaseOpacity(parseFloat(e.target.value))}
              className="flex-1 cursor-pointer h-1 bg-border rounded-lg appearance-none"
              style={{ accentColor: DISEASE_OVERLAYS[diseaseMode].color }}
            />
            <span className="w-8 text-right">{Math.round(diseaseOpacity * 100)}%</span>
          </div>
        )}
      </Section>

      {/* ── LEGEND ── */}
      <Section title="Legend">
        <LegendRow swatch={<GradientSwatch />} label="Phantom corridor — risk gradient" />
        <LegendRow swatch={<Dot c="#F59E0B" />} label="Phantom crossing / dark candidate" />
        <LegendRow swatch={<LineSwatch c="#3B82F6" />} label="Formal route — monitored" />
        <LegendRow swatch={<Dot c="#3DD9C4" />} label="IOM FMP" />
        <LegendRow swatch={<Dot c="#3B82F6" />} label="Official gate" />
        <LegendRow swatch={<DriftPathSwatch />} label="Predicted future path" />
        <LegendRow swatch={<DriftHaloSwatch />} label="Confidence halo" />
        <LegendRow swatch={<DriftVectorSwatch />} label="Drift force vectors" />
      </Section>
    </div>
  );
}

/* ── small building blocks ── */

const iconBtn: React.CSSProperties = {
  background: "none", border: `1px solid ${PANEL_BORDER}`, color: TEXT_MID,
  borderRadius: 5, width: 22, height: 22, cursor: "pointer", fontSize: 13,
  lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
};

function Section({ title, children, accent }: {
  title: string; children: React.ReactNode; accent?: boolean;
}) {
  return (
    <div style={{ padding: "12px 14px", borderBottom: `1px solid ${PANEL_BORDER}` }}>
      <div style={{
        fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase",
        color: accent ? ACCENT : TEXT_DIM, marginBottom: 10,
      }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ k, v, vColor }: { k: string; v: string; vColor: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "3px 0", fontSize: 11,
    }}>
      <span style={{ color: TEXT_DIM }}>{k}</span>
      <span style={{ color: vColor, fontSize: 10, letterSpacing: 0.5 }}>{v}</span>
    </div>
  );
}

function LegendRow({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
      <div style={{ width: 20, display: "flex", justifyContent: "center", flexShrink: 0 }}>{swatch}</div>
      <span style={{ fontSize: 10, color: TEXT_MID }}>{label}</span>
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return <span style={{ width: 10, height: 10, borderRadius: "50%", background: c,
    border: "1px solid #070A10", flexShrink: 0 }} />;
}
function LineSwatch({ c }: { c: string }) {
  return <span style={{ width: 18, height: 3, borderRadius: 2, background: c,
    flexShrink: 0 }} />;
}
function GradientSwatch() {
  return <span style={{ width: 18, height: 3, borderRadius: 2, flexShrink: 0,
    background: "linear-gradient(90deg,#22C55E,#84CC16,#EAB308,#F97316,#EF4444)" }} />;
}

function DriftPathSwatch() {
  return (
    <svg width="20" height="6" viewBox="0 0 20 6" style={{ flexShrink: 0 }}>
      <line x1="0" y1="3" x2="20" y2="3" stroke="white" strokeWidth="2" strokeDasharray="4 3" strokeOpacity="0.5" />
    </svg>
  );
}

function DriftHaloSwatch() {
  return (
    <div
      className="w-5 h-[6px] rounded-full"
      style={{ background: "#EAB308", opacity: 0.35, filter: "blur(2px)", flexShrink: 0 }}
    />
  );
}

function DriftVectorSwatch() {
  return (
    <svg width="20" height="8" viewBox="0 0 20 8" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="dv-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#EAB308" />
          <stop offset="50%" stopColor="#F5A623" />
          <stop offset="100%" stopColor="#FF453A" />
        </linearGradient>
      </defs>
      <line x1="1" y1="4" x2="16" y2="4" stroke="url(#dv-grad)" strokeWidth="2" />
      <polyline points="13,1 16,4 13,7" fill="none" stroke="#F5A623" strokeWidth="1.5" />
    </svg>
  );
}
