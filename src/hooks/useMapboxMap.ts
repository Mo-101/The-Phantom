import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { MapParams, CameraTarget } from "@/types/phantom";
import { MAPBOX_TOKEN } from "./mapbox/types";
import type { CorridorMeta, MapboxDrawContext } from "./mapbox/types";
import { drawCorridors, CORRIDOR_LAYER_IDS, BORDER_LAYER_IDS, LABEL_LAYER_IDS, type CoverageStats } from "./mapbox/drawCorridors";
import { drawBorders } from "./mapbox/drawBorders";
import { drawGeoLabels } from "./mapbox/drawGeoLabels";
import { drawEvidenceLayer, toggleEvidenceLayer } from "./mapbox/drawEvidenceLayer";
import { drawOfficialPOEs, POE_LAYER_IDS } from "./mapbox/drawOfficialPOEs";
import { createCascadeEngine, type CascadeState } from "./mapbox/cascadeEngine";
import { createCorridorAnimator, type CorridorAnimState, type CorridorAnimator } from "./mapbox/corridorAnimator";
import { getTemporalRange, type EvidenceSignal, type TemporalRange } from "@/lib/temporalAdapter";
import { computeDrift, type DriftResult } from "./mapbox/driftEngine";
import { useMapboxLiveSignals } from "@/hooks/useMapboxLiveSignals";
import { addDriftSources, addDriftLayers, updateDriftData, setDriftVisibility, DRIFT_LAYER_IDS } from "./mapbox/drawDriftLayers";
import type { Vec2 } from "./mapbox/driftMath";
import { getComputeScoresApiUrl, getPublicApiHeaders } from "@/lib/backendEndpoints";
import {
  drawDeviationAnalytics,
  removeDeviationAnalyticsLayers,
  toggleDeviationAnalyticsLayers,
} from "./mapbox/drawDeviationAnalytics";
import { ITURI_CRISIS_CORRIDOR, getIturiLineCoordinates } from "@/data/ituri-crisis-corridor";
import { readAnyPublicEnv } from "@/lib/publicEnv";
import {
  drawNigeriaEVDRiskLayer,
  NIGERIA_EVD_POE_CIRCLE_LAYER_ID,
  NIGERIA_EVD_POE_LAYER_IDS,
  setNigeriaEVDRiskVisibility,
} from "./mapbox/drawNigeriaEVDRiskLayer";
import {
  CROSSBORDER_ALERT_LAYER_IDS,
  drawCrossborderRiskAlerts,
  setCrossborderRiskAlertsVisibility,
} from "./mapbox/drawCrossborderRiskAlerts";
import {
  useHeartbeatLayer,
} from "@/hooks/useHeartbeatLayer";
import {
  addHeartbeatSurfaceLayers,
  setHeartbeatSurfaceVisibility,
  HEARTBEAT_SURFACE_LAYER_IDS,
} from "./mapbox/drawHeartbeatSurface";

type BasemapMode = "custom" | "standard" | "standard-satellite";
type LightPreset = "day" | "dawn" | "dusk" | "night";
const PHANTOM_POE_PULSE_HZ = 0.9;
const PHANTOM_POE_BASE_RADIUS = 7;
const PHANTOM_POE_PULSE_RADIUS = 3;
const LIVE_POLL_INTERVAL_MS = 30000;

function parseBasemapMode(value: string | undefined): BasemapMode {
  if (value === "standard" || value === "standard-satellite") return value;
  return "custom";
}

function parseLightPreset(value: string | undefined): LightPreset {
  if (value === "dawn" || value === "dusk" || value === "night") return value;
  return "day";
}

function parseOptionalBool(value: string | undefined): boolean | undefined {
  if (value == null || value === "") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function getBaseStyle(mode: BasemapMode): string | mapboxgl.StyleSpecification {
  if (mode === "standard") return "mapbox://styles/mapbox/standard";
  if (mode === "standard-satellite") return "mapbox://styles/mapbox/standard-satellite";

  return {
    version: 8 as const,
    name: "qgis2web export",
    pitch: 0,
    light: { intensity: 0.2 },
    sources: {
      GoogleSatelliteHybrid_0: {
        type: "raster" as const,
        tiles: ["https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"],
        tileSize: 256,
      },
      "mapbox-dem": {

  type: "raster-dem" as const,
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      },
      openmaptiles: {
        type: "vector" as const,
        url: "mapbox://mapbox.mapbox-streets-v8",
      },
    },
    terrain: {
      source: "mapbox-dem",
      exaggeration: 2,
    },
    sprite: "",
    glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
    layers: [
      {
        id: "background",
        type: "background" as const,
        layout: {},
        paint: { "background-color": "#ffffff" },
      },
      {
        id: "lyr_GoogleSatelliteHybrid_0_0",
        type: "raster" as const,
        source: "GoogleSatelliteHybrid_0",
      },
    ],
  };
}

/** Build headers for compute-scores API — Supabase auth removed, uses public API key only */
function getComputeScoresHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...getPublicApiHeaders(),
  };
}

export function useMapboxMap(containerRef: React.RefObject<HTMLDivElement | null>) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [officialPOEsVisible, setOfficialPOEsVisible] = useState(true);
  const poesLoadedRef = useRef(false);

  const [corridorsMeta, setCorridorsMeta] = useState<CorridorMeta[]>([]);
  const [corridorsLoaded, setCorridorsLoaded] = useState(false);
  const [coverageStats, setCoverageStats] = useState<CoverageStats | null>(null);
  const [evidenceVisible, setEvidenceVisible] = useState(true);
  const [cascadeState, setCascadeState] = useState<CascadeState | null>(null);
  const [temporalRange, setTemporalRange] = useState<TemporalRange | null>(null);
  const [selectedCorridorId, setSelectedCorridorId] = useState<string | null>(null);
  const evidenceDataRef = useRef<EvidenceSignal[]>([]);
  const featureIdsRef = useRef<string[]>([]);
  const cascadeEngineRef = useRef<ReturnType<typeof createCascadeEngine> | null>(null);
  const corridorAnimRef = useRef<CorridorAnimator | null>(null);
  const [corridorAnimState, setCorridorAnimState] = useState<CorridorAnimState | null>(null);
  const phantomLayerIdsRef = useRef<string[]>([]);
  const historicalEvidenceVisibleRef = useRef<boolean>(true);
  const historicalEvidenceLayerVisRef = useRef<boolean>(true);
  const [driftResult, setDriftResult] = useState<DriftResult | null>(null);
  const corridorGeoRef = useRef<Map<string, Vec2[]>>(new Map());
  const formalGeoRef = useRef<Vec2[][]>([]);

  const selectedCorridorEvidenceCount = useMemo(() => {
    if (!selectedCorridorId) return 0;
    const evidence = evidenceDataRef.current;
    if (!evidence || evidence.length === 0) return 0;
    return evidence.filter((s) => String(s.cid) === String(selectedCorridorId)).length;
  }, [selectedCorridorId]);

  // ── Mode & Live Monitoring State ──
  type Mode = "historical" | "live";
  const [mode, setMode] = useState<Mode>("historical");

  // Layer visibility — includes deviationAnalytics
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({
    corridors: true,
    officialPOEs: true,
    evidence: true,
    liveDiseaseSignals: true,
    nigeriaEVDRisk: false,
    crossborderRiskAlerts: false,
    deviationAnalytics: false,
    heartbeatSurface: false,
  });

  const handleHeartbeatSignals = useCallback((liveSignals: EvidenceSignal[]) => {
    const existing = evidenceDataRef.current;
    const incomingIds = new Set(liveSignals.map((s) => s.id));
    evidenceDataRef.current = [
      ...existing.filter((s) => !incomingIds.has(s.id)),
      ...liveSignals,
    ];
  }, []);

  const liveSignals = useMapboxLiveSignals({
    mapRef,
    enabled: mode === "live" && mapReady,
    visible: layerVisibility.liveDiseaseSignals !== false,
    lane: "LIVE",
    intervalMs: LIVE_POLL_INTERVAL_MS,
    activeDisease: "ALL",
  });

  // ── Heartbeat surface layer (live + historical) ──
  const heartbeat = useHeartbeatLayer({
    mapRef,
    enabled: mapReady,                       // always on once map is ready
    visible: layerVisibility.heartbeatSurface,
    intervalMs: LIVE_POLL_INTERVAL_MS,
    corridorGeoRef: corridorGeoRef,
    formalGeoRef: formalGeoRef,
    selectedCorridorId,
    onSignals: handleHeartbeatSignals,
  });

  // ── Initialize map ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let destroyed = false;
    const basemapMode = parseBasemapMode(readAnyPublicEnv("NEXT_PUBLIC_MAPBOX_BASEMAP", "VITE_MAPBOX_BASEMAP"));
    const isStandardBasemap = basemapMode !== "custom";

    if (!mapboxgl.supported({ failIfMajorPerformanceCaveat: false })) {
      console.error("[Mapbox] WebGL is not supported in this browser. Mapbox GL JS v3 requires WebGL2.");
      return;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      accessToken: MAPBOX_TOKEN,
      style: getBaseStyle(basemapMode),
      center: [32.05, 3.2],
      zoom: 6,
      pitch: 45,
      bearing: 0,
      antialias: true,
      attributionControl: false,
      logoPosition: "bottom-left",
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");

    map.on("style.load", () => {
      if (!isStandardBasemap) return;

      const setBasemapConfig = (prop: string, value: string | boolean) => {
        try {
          map.setConfigProperty("basemap", prop, value);
        } catch {
          // Ignore unsupported keys for the active basemap style.
        }
      };

      const lightPreset = parseLightPreset(readAnyPublicEnv("NEXT_PUBLIC_MAPBOX_LIGHT_PRESET", "VITE_MAPBOX_LIGHT_PRESET"));
      setBasemapConfig("lightPreset", lightPreset);

      const theme = readAnyPublicEnv("NEXT_PUBLIC_MAPBOX_STANDARD_THEME", "VITE_MAPBOX_STANDARD_THEME");
      if (theme) {
        setBasemapConfig("theme", theme);
      }

      const font = readAnyPublicEnv("NEXT_PUBLIC_MAPBOX_STANDARD_FONT", "VITE_MAPBOX_STANDARD_FONT");
      if (font) {
        setBasemapConfig("font", font);
      }

      const showPoi = parseOptionalBool(readAnyPublicEnv("NEXT_PUBLIC_MAPBOX_SHOW_POI_LABELS", "VITE_MAPBOX_SHOW_POI_LABELS"));
      if (showPoi != null) {
        setBasemapConfig("showPointOfInterestLabels", showPoi);
      }

      const showRoad = parseOptionalBool(readAnyPublicEnv("NEXT_PUBLIC_MAPBOX_SHOW_ROAD_LABELS", "VITE_MAPBOX_SHOW_ROAD_LABELS"));
      if (showRoad != null) {
        setBasemapConfig("showRoadLabels", showRoad);
      }

      const showPlace = parseOptionalBool(readAnyPublicEnv("NEXT_PUBLIC_MAPBOX_SHOW_PLACE_LABELS", "VITE_MAPBOX_SHOW_PLACE_LABELS"));
      if (showPlace != null) {
        setBasemapConfig("showPlaceLabels", showPlace);
      }

      const showTransit = parseOptionalBool(readAnyPublicEnv("NEXT_PUBLIC_MAPBOX_SHOW_TRANSIT_LABELS", "VITE_MAPBOX_SHOW_TRANSIT_LABELS"));
      if (showTransit != null) {
        setBasemapConfig("showTransitLabels", showTransit);
      }

      const show3D = parseOptionalBool(readAnyPublicEnv("NEXT_PUBLIC_MAPBOX_SHOW_3D_OBJECTS", "VITE_MAPBOX_SHOW_3D_OBJECTS"));
      if (show3D != null) {
        setBasemapConfig("show3dObjects", show3D);
      }

      const showRoadsAndTransit = parseOptionalBool(readAnyPublicEnv("NEXT_PUBLIC_MAPBOX_SHOW_ROADS_AND_TRANSIT", "VITE_MAPBOX_SHOW_ROADS_AND_TRANSIT"));
      if (showRoadsAndTransit != null) {
        setBasemapConfig("showRoadsAndTransit", showRoadsAndTransit);
      }

      const showPedestrianRoads = parseOptionalBool(readAnyPublicEnv("NEXT_PUBLIC_MAPBOX_SHOW_PEDESTRIAN_ROADS", "VITE_MAPBOX_SHOW_PEDESTRIAN_ROADS"));
      if (showPedestrianRoads != null) {
        setBasemapConfig("showPedestrianRoads", showPedestrianRoads);
      }
    });

    map.on("load", () => {
      if (destroyed) return;

      if (!isStandardBasemap) {
        // 3D Buildings
        map.addLayer({
          id: "3d-buildings",
          source: "openmaptiles",
          "source-layer": "building",
          type: "fill-extrusion",
          minzoom: 15,
          filter: [
            "all",
            ["!=", ["get", "type"], "building:part"],
            ["==", ["get", "underground"], "false"],
          ],
          layout: { "fill-extrusion-edge-radius": 0.1 },
          paint: {
            "fill-extrusion-color": [
              "interpolate",
              ["linear"],
              ["get", "height"],
              0, "hsl(72, 89%, 67%)",
              2.5, "hsl(0, 92%, 54%)",
              3.3, "hsl(227, 90%, 59%)",
            ],
            "fill-extrusion-height": 3,
            "fill-extrusion-opacity": 0.75,
            "fill-extrusion-ambient-occlusion-intensity": 1,
            "fill-extrusion-ambient-occlusion-radius": 5,
          },
        });

        // Daylight sky
        map.addLayer({
          id: "sky",
          type: "sky",
          paint: {
            "sky-type": "atmosphere",
            "sky-atmosphere-sun": [0, 0],
            "sky-atmosphere-sun-intensity": 15,
          },
        });
      }

      mapRef.current = map;
      setMapReady(true);
      console.log(`[Mapbox] Map loaded (${basemapMode})`);
    });

    return () => {
      destroyed = true;
      map.remove();
      mapRef.current = null;
    };
  }, [containerRef]);

  const getDrawContext = useCallback((): MapboxDrawContext | null => {
    const map = mapRef.current;
    if (!map) return null;
    return { map };
  }, []);

  // ── Load all data layers ──
  const loadAllLayers = useCallback(async () => {
    if (corridorsLoaded) return;
    const ctx = getDrawContext();
    if (!ctx) return;

    try {
      const { meta, phantomLayerIds, coverageStats: stats } = await drawCorridors(ctx);
      setCorridorsMeta(meta);
      setCoverageStats(stats);

      phantomLayerIdsRef.current = phantomLayerIds;

      const { data, featureIds } = await drawEvidenceLayer(ctx);
      evidenceDataRef.current = data;
      featureIdsRef.current = featureIds;
      const range = getTemporalRange(data);
      setTemporalRange(range);

      corridorAnimRef.current = createCorridorAnimator(
        ctx.map,
        phantomLayerIds,
        meta.map((m) => ({ id: m.id, km: m.km, risk: m.risk })),
        { startDate: range.min, endDate: range.max }
      );

      // Make evidence visible immediately (default ON)
      toggleEvidenceLayer(ctx.map, true);

      cascadeEngineRef.current = createCascadeEngine(ctx.map, data, featureIds);

      const evdPoeCount = await drawNigeriaEVDRiskLayer(ctx.map);
      setNigeriaEVDRiskVisibility(ctx.map, layerVisibility.nigeriaEVDRisk === true);
      if (evdPoeCount > 0) {
        console.log(`[Mapbox] Drew ${evdPoeCount} Nigeria EVD POE risk features`);
      }

      const alertCount = await drawCrossborderRiskAlerts(ctx.map);
      setCrossborderRiskAlertsVisibility(ctx.map, layerVisibility.crossborderRiskAlerts === true);
      if (alertCount > 0) {
        console.log(`[Mapbox] Drew ${alertCount} cross-border risk alert zones`);
      }

      // Heartbeat surface — add layers now, data arrives via useHeartbeatLayer
      addHeartbeatSurfaceLayers(ctx.map);
      setHeartbeatSurfaceVisibility(ctx.map, layerVisibility.heartbeatSurface === true);
      console.log(`[Mapbox] Heartbeat surface layers registered`);

      // Cache corridor geometry for drift engine
      try {
        const pairedGeo = await (await fetch("/data/corridors_paired.geojson")).json();
        for (const f of pairedGeo.features) {
          const rt = f.properties?.route_type;
          const gt = f.geometry?.type;
          if (gt === "LineString" && rt === "PHANTOM") {
            const cid = f.properties?.id ?? "";
            corridorGeoRef.current.set(cid, f.geometry.coordinates as Vec2[]);
          } else if (gt === "LineString" && rt === "FORMAL") {
            formalGeoRef.current.push(f.geometry.coordinates as Vec2[]);
          }
        }
        corridorGeoRef.current.set(ITURI_CRISIS_CORRIDOR.id, getIturiLineCoordinates() as Vec2[]);
      } catch { /* geometry cache is best-effort */ }

      // Add drift sources + layers
      addDriftSources(ctx.map);
      addDriftLayers(ctx.map);
      setDriftVisibility(ctx.map, false);

      setCorridorsLoaded(true);
      console.log(`[Mapbox] All layers loaded: ${meta.length} corridors, ${data.length} evidence signals (VISIBLE)`);
      console.log(`[Mapbox] Evidence signals are now visible on map`);
      console.log(`[Mapbox] Click "Animate Corridors" button (bottom center) to play corridor animation`);
      console.log(`[Mapbox] Use Legend > Cascade Replay to play evidence cascade`);
    } catch (err) {
      console.error("[Mapbox] Failed to load layers:", err);
    }
  }, [corridorsLoaded, getDrawContext, layerVisibility.nigeriaEVDRisk, layerVisibility.crossborderRiskAlerts]);

  // ── Mode semantics (Historical vs Live) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (mode === "live") {
      // Preserve historical visibility state so switching back restores correctly.
      historicalEvidenceVisibleRef.current = evidenceVisible;
      historicalEvidenceLayerVisRef.current = layerVisibility.evidence;

      // Live mode must not show or mutate historical replay state.
      cascadeEngineRef.current?.stop();
      cascadeEngineRef.current?.hideAll();
      setCascadeState(null);

      corridorAnimRef.current?.stop();
      setCorridorAnimState(null);

      // Hide historical evidence layer in Live mode (until live-layer merge is implemented)
      toggleEvidenceLayer(map, false);
      // Do NOT mutate evidenceVisible permanently; restore when back to historical.
      setLayerVisibility((prev) => ({ ...prev, evidence: false }));

      // Hide drift overlay (predictive) in Live mode
      try {
        setDriftVisibility(map, false);
      } catch {
        // best effort
      }
      setDriftResult(null);
      return;
    }

    // Historical mode: restore evidence visibility according to state
    // If we came from live mode, restore historical preference first.
    setEvidenceVisible(historicalEvidenceVisibleRef.current);
    setLayerVisibility((prev) => ({
      ...prev,
      evidence: historicalEvidenceLayerVisRef.current,
    }));
    toggleEvidenceLayer(map, historicalEvidenceVisibleRef.current);
  }, [mode, evidenceVisible, layerVisibility.evidence]);

  const loadOfficialPOEs = useCallback(async () => {
    if (poesLoadedRef.current) return;
    const ctx = getDrawContext();
    if (!ctx) return;
    poesLoadedRef.current = true;
    await drawOfficialPOEs(ctx);
  }, [getDrawContext]);

  // ── Camera ──
  const flyTo = useCallback((target: CameraTarget) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [target.lng, target.lat],
      zoom: Math.max(4, 16 - Math.log2(Math.max(1, target.alt / 1000))),
      bearing: target.heading,
      pitch: Math.abs(target.pitch),
      duration: 1800,
    });
  }, []);

  // ── Layer toggles ──
  const setLayerGroupVisibility = useCallback((layerIds: string[], visible: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    const vis = visible ? "visible" : "none";
    for (const id of layerIds) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", vis);
      }
    }
  }, []);

  const toggleEvidence = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const newVisible = !evidenceVisible;
    toggleEvidenceLayer(map, newVisible);
    setEvidenceVisible(newVisible);
    setLayerVisibility((prev) => ({ ...prev, evidence: newVisible }));
  }, [evidenceVisible]);

  const toggleLayer = useCallback((layerName: string) => {
    const map = mapRef.current;
    const newVisible = !layerVisibility[layerName];

    switch (layerName) {
      case "corridors":
        setLayerGroupVisibility(CORRIDOR_LAYER_IDS, newVisible);
        break;
      case "borders":
        setLayerGroupVisibility(BORDER_LAYER_IDS, newVisible);
        break;
      case "labels":
        setLayerGroupVisibility(LABEL_LAYER_IDS, newVisible);
        break;
      case "officialPOEs":
        setLayerGroupVisibility(POE_LAYER_IDS, newVisible);
        setOfficialPOEsVisible(newVisible);
        break;
      case "evidence":
        toggleEvidence();
        return;
      case "liveDiseaseSignals":
        liveSignals.setVisible(newVisible);
        break;
      case "nigeriaEVDRisk":
        if (map) {
          setNigeriaEVDRiskVisibility(map, newVisible);
        }
        break;
      case "crossborderRiskAlerts":
        if (map) {
          setCrossborderRiskAlertsVisibility(map, newVisible);
        }
        break;
      case "heartbeatSurface":
        if (map) {
          setHeartbeatSurfaceVisibility(map, newVisible);
        }
        break;
      case "deviationAnalytics":
        if (map) {
          toggleDeviationAnalyticsLayers(map, newVisible);
        }
        break;
      default:
        return;
    }

    setLayerVisibility((prev) => ({ ...prev, [layerName]: newVisible }));
  }, [layerVisibility, liveSignals, setLayerGroupVisibility, toggleEvidence]);

  // ── Cascade controls ──
  const startCascade = useCallback((corridorId: string) => {
    const evidenceCount = evidenceDataRef.current.filter((s) => String(s.cid) === String(corridorId)).length;
    console.log(`[Cascade] start corridorId=${corridorId} matchedEvidence=${evidenceCount}`);
    cascadeEngineRef.current?.start(corridorId, (s) => {
      setCascadeState({ ...s });
    });
  }, []);

  const scrubCascade = useCallback((corridorId: string, position: number) => {
    if (!corridorId) return;
    cascadeEngineRef.current?.seek(corridorId, position, (s) => {
      setCascadeState({ ...s });
    });
  }, []);

  const stopCascade = useCallback(() => {
    cascadeEngineRef.current?.stop();
    cascadeEngineRef.current?.hideAll();
    setCascadeState(null);
  }, []);

  // ── Map query (from chat/MCP) ──
  const handleMapQuery = useCallback((params: MapParams) => {
    if (params.camera) flyTo(params.camera);
  }, [flyTo]);

  // ── Drift engine controls ──
  const computeDriftForCorridor = useCallback(async (corridorId: string) => {
    const map = mapRef.current;
    if (!map) return;
    const coords = corridorGeoRef.current.get(corridorId);
    if (!coords || coords.length < 2) return;
    const meta = corridorsMeta.find((m) => m.id === corridorId);
    const risk = meta?.risk ?? "MODERATE";

    // Backend-first: compute and persist canonical drift from live DB signals.
    try {
      const url = getComputeScoresApiUrl();
      if (url) {
        const response = await fetch(url, {
          method: "POST",
          headers: getComputeScoresHeaders(),
          body: JSON.stringify({
            corridorId,
            corridorCoords: coords,
            riskClass: risk,
            windowDays: 30,
          }),
        });
        const data = await response.json().catch(() => ({}));
        const error = response.ok ? null : { message: data?.error ?? `HTTP ${response.status}` };

        if (!error && data?.result?.driftField && data?.result?.futureCorridor) {
          const result = data.result as DriftResult;
          updateDriftData(map, result);
          setDriftVisibility(map, true);
          setDriftResult(result);
          return;
        }

        if (error) {
          console.warn("[Mapbox] compute-scores fallback:", error.message);
        }
      }
    } catch (err) {
      console.warn("[Mapbox] compute-scores fallback:", err);
    }

    // Local fallback keeps UI usable before backend function is deployed.
    const result = computeDrift(corridorId, coords, evidenceDataRef.current, formalGeoRef.current, risk);

    updateDriftData(map, result);
    setDriftVisibility(map, true);
    setDriftResult(result);
  }, [corridorsMeta]);

  const clearDrift = useCallback(() => {
    const map = mapRef.current;
    if (map) {
      updateDriftData(map, null);
      setDriftVisibility(map, false);
    }
    setDriftResult(null);
  }, []);

  // ── Corridor animation controls ──
  const startCorridorAnim = useCallback(() => {
    corridorAnimRef.current?.start((s) => setCorridorAnimState({ ...s }));
  }, []);

  const stopCorridorAnim = useCallback(() => {
    corridorAnimRef.current?.stop();
    setCorridorAnimState(null);
  }, []);

  const seekCorridorAnim = useCallback((position: number) => {
    corridorAnimRef.current?.seek(position);
  }, []);

  // ── Click handler for corridor features + empty-space deselect ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Corridor-selection analytics are historical-only.
    if (mode !== "historical") return;

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      const queryLayers = [...phantomLayerIdsRef.current, "formal-routes-line", "ituri-crisis-nodes-circle"].filter(id => map.getLayer(id));
      if (queryLayers.length === 0) {
        // No corridor layers exist yet — deselect
        setSelectedCorridorId(null);
        return;
      }
      const features = map.queryRenderedFeatures(e.point, {
        layers: queryLayers,
      });
      if (features.length > 0) {
        const props = features[0].properties;
        const cid = props?.id ?? props?.corridor_id ?? null;
        if (cid) {
          console.log(`[Selection] corridor click raw=${String(cid)} evidenceMatches=${evidenceDataRef.current.filter((s) => String(s.cid) === String(cid)).length}`);
          setSelectedCorridorId(cid);
          return;
        }
      }
      // Click on empty space → deselect
      setSelectedCorridorId(null);
    };

    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [mapReady, mode]);

  // ── Selected corridor → draw deviation analytics + auto-drift ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!selectedCorridorId) {
      // Deselect: remove deviation layers, clear drift
      removeDeviationAnalyticsLayers(map);
      setLayerVisibility((prev) => ({ ...prev, deviationAnalytics: false }));
      clearDrift();
      return;
    }

    // Get corridor geometry from cache
    const coords = corridorGeoRef.current.get(selectedCorridorId);
    if (coords && coords.length >= 2) {
      // Draw deviation heatline + blind spots (async, fire-and-forget)
      drawDeviationAnalytics(map, selectedCorridorId, coords as number[][])
        .then((dev) => {
          if (dev) {
            setLayerVisibility((prev) => ({ ...prev, deviationAnalytics: true }));
            console.log(`[Mapbox] Deviation analytics drawn for ${selectedCorridorId}`);
          }
        })
        .catch((err) => {
          console.warn("[Mapbox] Deviation analytics failed:", err);
        });

      // Auto-compute drift
      computeDriftForCorridor(selectedCorridorId);
    }
  }, [selectedCorridorId, mapReady, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tooltip on hover ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: "320px",
      className: "corridor-tooltip",
    });

      const pointLayers = [
        "corridor-nodes-circle",
        "formal-gates-circle",
        "iom-fmps-circle",
        "phantom-poes-circle",
        "official-poes-circle",
        NIGERIA_EVD_POE_CIRCLE_LAYER_ID,
        "ituri-crisis-nodes-circle",
      ];

    const DRIFT_LAYER_TIPS: Record<string, { title: string; desc: string }> = {
      "future-corridor": {
        title: "Predicted Future Path",
        desc: "Dashed white line showing where this corridor is projected to shift based on current evidence pressure. Driven by conflict, flow, and closure vectors.",
      },
      "future-corridor-halo": {
        title: "Confidence Halo",
        desc: "Yellow glow around the projected path — width encodes model confidence. Wider = higher certainty of corridor drift in this direction.",
      },
      "drift-vectors": {
        title: "Drift Force Vector",
        desc: "Arrow showing directional pressure on the corridor at this point. Yellow = low pressure, orange = moderate, red = high. Magnitude drives the predicted shift distance.",
      },
    };

    function buildDriftTooltipHTML(layerId: string): string {
      const tip = DRIFT_LAYER_TIPS[layerId];
      if (!tip) return "";
      return `<div style="display:flex;flex-direction:column;gap:3px;padding:2px;font-family:monospace">
        <strong style="font-size:12px;color:#EAB308">${tip.title}</strong>
        <span style="font-size:10px;color:#9CA3AF;max-width:280px;display:block;line-height:1.5">${tip.desc}</span>
      </div>`;
    }

    function escapeTooltipValue(value: unknown): string {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function buildTooltipHTML(props: Record<string, unknown>): string {
      const rt = props.route_type ?? props.type ?? "";
      const rows: string[] = [];

      if (props.name) rows.push(`<strong style="font-size:13px">${escapeTooltipValue(props.name)}</strong>`);
      if (!props.name && props.title) rows.push(`<strong style="font-size:13px">${escapeTooltipValue(props.title)}</strong>`);
      if (rt) rows.push(`<span style="color:#9CA3AF;font-size:10px;text-transform:uppercase;letter-spacing:0.05em">${escapeTooltipValue(rt)}</span>`);
      if (props.severity) rows.push(`<span style="font-size:11px">Severity: <b>${escapeTooltipValue(String(props.severity).toUpperCase())}</b></span>`);
      if (props.risk_class) rows.push(`<span style="font-size:11px">Risk: <b>${escapeTooltipValue(props.risk_class)}</b></span>`);
      if (props.risk_band) rows.push(`<span style="font-size:11px">Risk band: <b>${escapeTooltipValue(String(props.risk_band).toUpperCase())}</b></span>`);
      if (props.risk_score != null) rows.push(`<span style="font-size:11px">Risk score: <b>${Number(props.risk_score).toFixed(0)}/100</b></span>`);
      if (props.composite_score != null) rows.push(`<span style="font-size:11px">Score: <b>${Number(props.composite_score).toFixed(1)}</b></span>`);
      if (props.distance_km != null) rows.push(`<span style="font-size:11px">Distance: <b>${Number(props.distance_km).toFixed(0)} km</b></span>`);
      if (props.cases_total != null) rows.push(`<span style="font-size:11px">Cases: <b>${Number(props.cases_total).toLocaleString()}</b></span>`);
      if (props.confirmed_cases != null) rows.push(`<span style="font-size:11px">Confirmed: <b>${Number(props.confirmed_cases).toLocaleString()}</b></span>`);
      if (props.deaths != null) rows.push(`<span style="font-size:11px">Deaths: <b>${Number(props.deaths).toLocaleString()}</b></span>`);
      if (props.weeks_observed != null) rows.push(`<span style="font-size:11px">Weeks observed: <b>${Number(props.weeks_observed).toLocaleString()}</b></span>`);
      if (props.lga) rows.push(`<span style="font-size:11px">LGA: ${escapeTooltipValue(props.lga)}</span>`);
      if (props.state) rows.push(`<span style="font-size:11px">State: ${escapeTooltipValue(props.state)}</span>`);
      if (props.mode) rows.push(`<span style="font-size:11px">Mode: ${escapeTooltipValue(props.mode)}</span>`);
      if (props.description) rows.push(`<span style="font-size:10px;color:#9CA3AF;max-width:280px;display:block">${escapeTooltipValue(String(props.description).slice(0, 200))}</span>`);
      if (props.poe_type) rows.push(`<span style="font-size:11px">POE Type: ${escapeTooltipValue(props.poe_type)}</span>`);
      if (props.type) rows.push(`<span style="font-size:11px">Type: ${escapeTooltipValue(props.type)}</span>`);
      if (props.country) rows.push(`<span style="font-size:11px">Country: ${escapeTooltipValue(props.country)}</span>`);
      if (props.countries) rows.push(`<span style="font-size:11px">Countries: ${escapeTooltipValue(props.countries)}</span>`);
      if (props.trigger) rows.push(`<span style="font-size:10px;color:#CBD5E1;max-width:280px;display:block">Trigger: ${escapeTooltipValue(String(props.trigger).slice(0, 220))}</span>`);
      if (props.recommended_action) rows.push(`<span style="font-size:10px;color:#FDE68A;max-width:280px;display:block">Action: ${escapeTooltipValue(String(props.recommended_action).slice(0, 220))}</span>`);
      return `<div style="display:flex;flex-direction:column;gap:2px;padding:2px;font-family:monospace">${rows.join("")}</div>`;
    }

      const driftLayers = ["future-corridor", "future-corridor-halo", "drift-vectors"];

    const onMouseMove = (e: mapboxgl.MapMouseEvent) => {
      const corridorLayers = [
        ...phantomLayerIdsRef.current,
        "historical-disease-choropleth-fill",
        "live-disease-choropleth-fill",
        "formal-routes-line",
        "lassa-specimen-transit",
        ...CROSSBORDER_ALERT_LAYER_IDS,
        ...pointLayers,
      ].filter(id => map.getLayer(id));

      const activeDriftLayers = driftLayers.filter(id => map.getLayer(id));

      // Check drift layers first — they sit on top of corridors
      if (activeDriftLayers.length > 0) {
        const driftFeatures = map.queryRenderedFeatures(e.point, { layers: activeDriftLayers });
        if (driftFeatures.length > 0) {
          map.getCanvas().style.cursor = "crosshair";
          popup.setLngLat(e.lngLat).setHTML(buildDriftTooltipHTML(driftFeatures[0].layer.id)).addTo(map);
          return;
        }
      }

      if (corridorLayers.length === 0) return;

      const features = map.queryRenderedFeatures(e.point, { layers: corridorLayers });
      if (features.length > 0) {
        map.getCanvas().style.cursor = "pointer";
        const props = features[0].properties ?? {};
        popup.setLngLat(e.lngLat).setHTML(buildTooltipHTML(props)).addTo(map);
      } else {
        map.getCanvas().style.cursor = "";
        popup.remove();
      }
    };

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    };

    map.on("mousemove", onMouseMove);
    map.on("mouseout", onMouseLeave);

    return () => {
      map.off("mousemove", onMouseMove);
      map.off("mouseout", onMouseLeave);
      popup.remove();
    };
  }, [mapReady]);

  // ── Auto-load layers ──
  useEffect(() => {
    if (mapReady && officialPOEsVisible) loadOfficialPOEs();
  }, [mapReady, officialPOEsVisible, loadOfficialPOEs]);

  useEffect(() => {
    if (mapReady) loadAllLayers();
  }, [mapReady, loadAllLayers]);

  // ── Phantom POE pulse animation ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    let rafId = 0;
    const startedAt = performance.now();

    const animate = (now: number) => {
      const elapsedSec = (now - startedAt) / 1000;
      const pulse = (Math.sin(elapsedSec * PHANTOM_POE_PULSE_HZ * Math.PI * 2) + 1) / 2;
      const radius = PHANTOM_POE_BASE_RADIUS + pulse * PHANTOM_POE_PULSE_RADIUS;
      const strokeOpacity = 0.2 + pulse * 0.5;

      if (map.getLayer("phantom-poes-circle")) {
        map.setPaintProperty("phantom-poes-circle", "circle-radius", radius);
        map.setPaintProperty("phantom-poes-circle", "circle-stroke-opacity", strokeOpacity);
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [mapReady]);

  // ── Live Polling Effect ──
  // ── Cleanup deviation layers on unmount ──
  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (map) {
        removeDeviationAnalyticsLayers(map);
        setNigeriaEVDRiskVisibility(map, false);
        setCrossborderRiskAlertsVisibility(map, false);
        setHeartbeatSurfaceVisibility(map, false);
      }
    };
  }, []);

  return {
    map: mapRef,
    mapReady,
    radarActive: false,
    monitoredId: null as string | null,
    officialPOEsVisible,
    setOfficialPOEsVisible,
    handleMapQuery,
    corridorsMeta,
    corridorsLoaded,
    coverageStats,
    evidenceVisible,
    toggleEvidence,
    cascadeState,
    temporalRange,
    scrubberPosition: cascadeState?.progress ?? 0,
    currentCascadeDate: cascadeState?.currentDate ?? temporalRange?.min ?? null,
    startCascade,
    scrubCascade,
    stopCascade,
    selectedCorridorId,
    setSelectedCorridorId,
    selectedCorridorEvidenceCount,
    layerVisibility,
    toggleLayer,
    corridorAnimState,
    startCorridorAnim,
    stopCorridorAnim,
    seekCorridorAnim,
    driftResult,
    computeDriftForCorridor,
    clearDrift,
    // Mode & Live Monitoring
    mode,
    setMode,
    liveStatus: {
      connectionState: heartbeat.status.connectionState,
      lastFetchAt: heartbeat.status.lastFetchAt,
      lastSuccessfulFetchAt: heartbeat.status.lastSuccessfulFetchAt,
      newSignalsCount: heartbeat.status.data?.surfaceSnapshot?.totalSignalsFused ?? 0,
      pollLatencyMs: heartbeat.status.pollLatencyMs,
      dataFreshnessSeconds: heartbeat.status.dataFreshnessSeconds,
      errorMessage: heartbeat.status.errorMessage,
    },
    refreshLiveData: heartbeat.refresh,
    isCascadeEnabled: mode === "historical",
    // Heartbeat
    heartbeatStatus: heartbeat.status,
    refreshHeartbeat: heartbeat.refresh,
  };
}
