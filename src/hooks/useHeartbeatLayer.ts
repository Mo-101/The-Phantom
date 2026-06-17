/**
 * useHeartbeatLayer.ts
 *
 * Mirrors the EXACT pattern of useMapboxLiveSignals:
 *   - Polls /api/heartbeat on a 30s interval
 *   - Calls addHeartbeatSurfaceLayers() once on first load
 *   - Calls updateHeartbeatSurface(map, cells) on each response
 *   - Injects live signals into cascadeEngine as EvidenceSignal objects
 *   - Updates drift vectors if a corridor is selected (live mode)
 *   - Updates crossborder alert source severity from posterior
 *   - Returns the latest HeartbeatApiResponse for the HUD
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import mapboxgl from "mapbox-gl";
import {
  addHeartbeatSurfaceLayers,
  updateHeartbeatSurface,
  setHeartbeatSurfaceVisibility,
  type HeartbeatApiResponse,
  type HeartbeatCellData,
} from "@/hooks/mapbox/drawHeartbeatSurface";
import {
  updateDriftData,
  setDriftVisibility,
} from "@/hooks/mapbox/drawDriftLayers";
import { computeDrift } from "@/hooks/mapbox/driftEngine";
import type { EvidenceSignal } from "@/lib/temporalAdapter";
import type { Vec2 } from "@/hooks/mapbox/driftMath";
import { CROSSBORDER_ALERT_SOURCE_ID } from "@/hooks/mapbox/drawCrossborderRiskAlerts";

// The Koboko-Arua crossing is known by this id in corridors_paired.geojson
// If the GeoJSON uses a different id, a lookup will fall back to nearest corridor.
export const KOBOKO_ARUA_CORRIDOR_ID = "koboko-arua";
const KOBOKO_ARUA_CENTER: [number, number] = [31.00, 3.30]; // [lng, lat]

export interface HeartbeatLayerStatus {
  connectionState: "idle" | "polling" | "error" | "stale";
  lastFetchAt: Date | null;
  lastSuccessfulFetchAt: Date | null;
  pollLatencyMs: number;
  dataFreshnessSeconds: number;
  errorMessage: string | null;
  data: HeartbeatApiResponse | null;
}

interface UseHeartbeatLayerOptions {
  mapRef: RefObject<mapboxgl.Map | null>;
  enabled: boolean;
  visible: boolean;
  intervalMs?: number;
  /** Called with fresh cells so cascade engine can ingest them */
  onSignals?: (signals: EvidenceSignal[]) => void;
  /** Corridor geometry cache for live drift recompute */
  corridorGeoRef?: RefObject<Map<string, Vec2[]>>;
  /** Formal geo ref for drift engine */
  formalGeoRef?: RefObject<Vec2[][]>;
  /** Currently selected corridor id */
  selectedCorridorId?: string | null;
}

/** Convert heartbeat cells to EvidenceSignal[] so the cascade engine can consume them */
function cellsToEvidenceSignals(
  cells: HeartbeatCellData[],
  corridorId: string
): EvidenceSignal[] {
  const now = new Date();
  return cells
    .filter((c) => c.posterior > 0.10 && c.evidenceCount > 0)
    .map((c) => ({
      // EvidenceSignal fields
      id: `hb-${c.cellId}-${Date.now()}`,
      cid: corridorId,
      lat: c.latCenter,
      lng: c.lngCenter,
      timestamp: c.lastEvidenceAt ? new Date(c.lastEvidenceAt) : now,
      score: Math.round(c.posterior * 100),
      day: 0,                     // live signals don't have historical day index
      source: "HEARTBEAT",
      // Extra
      posterior: c.posterior,
    } as EvidenceSignal & { posterior: number }));
}

/** Update crossborder alert source risk_score from posterior weighted average */
function updateCrossborderSeverity(
  map: mapboxgl.Map,
  cells: HeartbeatCellData[]
): void {
  const src = map.getSource(CROSSBORDER_ALERT_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (!src) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = (src as any)._data as GeoJSON.FeatureCollection | null;
  if (!current || !current.features?.length) return;

  const avgPosterior =
    cells.reduce((sum, c) => sum + c.posterior, 0) / Math.max(1, cells.length);

  const updated: GeoJSON.FeatureCollection = {
    ...current,
    features: current.features.map((f) => {
      const props = f.properties ?? {};
      // Only update UGA/SSD crossing zones (those that mention south sudan or uganda)
      const relevant =
        String(props.countries ?? "").toLowerCase().includes("uga") ||
        String(props.countries ?? "").toLowerCase().includes("ssd") ||
        String(props.corridor_id ?? "").toLowerCase().includes("koboko") ||
        String(props.corridor_id ?? "").toLowerCase().includes("arua");

      if (!relevant) return f;

      const liveScore = Math.round(avgPosterior * 100);
      const severity =
        liveScore >= 75 ? "critical" :
        liveScore >= 55 ? "high" :
        liveScore >= 30 ? "watch" : props.severity;

      return {
        ...f,
        properties: { ...props, risk_score: liveScore, severity },
      };
    }),
  };

  src.setData(updated);
}

export function useHeartbeatLayer({
  mapRef,
  enabled,
  visible,
  intervalMs = 30_000,
  onSignals,
  corridorGeoRef,
  formalGeoRef,
  selectedCorridorId,
}: UseHeartbeatLayerOptions) {
  const [status, setStatus] = useState<HeartbeatLayerStatus>({
    connectionState: "idle",
    lastFetchAt: null,
    lastSuccessfulFetchAt: null,
    pollLatencyMs: 0,
    dataFreshnessSeconds: 0,
    errorMessage: null,
    data: null,
  });

  const layerReadyRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ensureLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return false;
    if (!layerReadyRef.current) {
      addHeartbeatSurfaceLayers(map);
      layerReadyRef.current = true;
    }
    setHeartbeatSurfaceVisibility(map, enabled && visible);
    return true;
  }, [enabled, mapRef, visible]);

  const refresh = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !enabled) return;
    if (!ensureLayers()) return;

    const startedAt = performance.now();
    setStatus((prev) => ({ ...prev, connectionState: "polling", lastFetchAt: new Date() }));

    try {
      // Fetch surface snapshot with cells included
      const res = await fetch("/api/heartbeat?cells=1", { cache: "no-store" });
      if (!res.ok) throw new Error(`Heartbeat API HTTP ${res.status}`);
      const data = await res.json() as HeartbeatApiResponse;
      const latency = Math.round(performance.now() - startedAt);

      const cells: HeartbeatCellData[] = data.surfaceSnapshot?.cells ?? [];

      // 1. Update the probability surface layer
      if (cells.length > 0) {
        updateHeartbeatSurface(map, cells);
      }

      // 2. Find the best matching corridor id for signal injection
      // Use the configured ID or fall back to the first corridor that
      // has geometry near the Koboko-Arua center
      let corridorId = KOBOKO_ARUA_CORRIDOR_ID;
      if (corridorGeoRef?.current && corridorGeoRef.current.size > 0) {
        if (!corridorGeoRef.current.has(KOBOKO_ARUA_CORRIDOR_ID)) {
          // Find closest corridor by first coordinate proximity
          let bestId = KOBOKO_ARUA_CORRIDOR_ID;
          let bestDist = Infinity;
          for (const [id, coords] of corridorGeoRef.current.entries()) {
            const [lng, lat] = coords[0] as [number, number];
            const dist = Math.hypot(lng - KOBOKO_ARUA_CENTER[0], lat - KOBOKO_ARUA_CENTER[1]);
            if (dist < bestDist) { bestDist = dist; bestId = id; }
          }
          corridorId = bestId;
        }
      }

      // 3. Inject live evidence signals into cascade engine via callback
      if (cells.length > 0 && onSignals) {
        const signals = cellsToEvidenceSignals(cells, corridorId);
        if (signals.length > 0) onSignals(signals);
      }

      // 4. Live drift recompute for selected corridor
      if (selectedCorridorId && corridorGeoRef?.current && formalGeoRef?.current) {
        const coords = corridorGeoRef.current.get(selectedCorridorId);
        if (coords && coords.length >= 2) {
          const evidence = cellsToEvidenceSignals(cells, selectedCorridorId);
          if (evidence.length >= 1) {
            const drift = computeDrift(
              selectedCorridorId,
              coords,
              evidence,
              formalGeoRef.current,
              "MODERATE"
            );
            updateDriftData(map, drift);
            setDriftVisibility(map, true);
          }
        }
      }

      // 5. Update crossborder alert severity
      if (cells.length > 0) {
        updateCrossborderSeverity(map, cells);
      }

      setStatus({
        connectionState: "idle",
        lastFetchAt: new Date(),
        lastSuccessfulFetchAt: new Date(),
        pollLatencyMs: latency,
        dataFreshnessSeconds: 0,
        errorMessage: null,
        data,
      });
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        connectionState: "error",
        pollLatencyMs: Math.round(performance.now() - startedAt),
        errorMessage: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [enabled, ensureLayers, formalGeoRef, corridorGeoRef, mapRef, onSignals, selectedCorridorId]);

  // Layer init on style load (mirrors useMapboxLiveSignals)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handleLoad = () => ensureLayers();
    if (map.isStyleLoaded()) handleLoad();
    map.on("load", handleLoad);
    map.on("style.load", handleLoad);
    return () => {
      map.off("load", handleLoad);
      map.off("style.load", handleLoad);
    };
  }, [ensureLayers, mapRef]);

  // Visibility sync
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setHeartbeatSurfaceVisibility(map, enabled && visible);
  }, [enabled, mapRef, visible]);

  // Polling loop (mirrors useMapboxLiveSignals exactly)
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setStatus((prev) => ({ ...prev, connectionState: "idle" }));
      return;
    }
    void refresh();
    intervalRef.current = setInterval(() => void refresh(), intervalMs);
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [enabled, intervalMs, refresh]);

  // Freshness ticker (mirrors useMapboxLiveSignals)
  useEffect(() => {
    if (!enabled) return;
    const ticker = setInterval(() => {
      setStatus((prev) => {
        const secs = prev.lastSuccessfulFetchAt
          ? Math.floor((Date.now() - prev.lastSuccessfulFetchAt.getTime()) / 1000)
          : 0;
        return {
          ...prev,
          connectionState: secs > 90 && prev.connectionState !== "error" ? "stale" : prev.connectionState,
          dataFreshnessSeconds: secs,
        };
      });
    }, 5_000);
    return () => clearInterval(ticker);
  }, [enabled]);

  return { status, refresh };
}
