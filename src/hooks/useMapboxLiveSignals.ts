import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import mapboxgl from "mapbox-gl";
import {
  fetchLiveDiseaseSignals,
  LIVE_DISEASE_CHOROPLETH_FILL_LAYER_ID,
  LIVE_DISEASE_CHOROPLETH_OUTLINE_LAYER_ID,
  LIVE_DISEASE_CHOROPLETH_SOURCE_ID,
  LIVE_DISEASE_CIRCLE_LAYER_ID,
  LIVE_DISEASE_LABEL_LAYER_ID,
  LIVE_DISEASE_SOURCE_ID,
  signalsToChoroplethFeatureCollection,
  signalsToFeatureCollection,
  type DiseaseLayerKey,
  type LiveSignal,
} from "@/lib/live.disease.signals";

interface LiveSignalStatus {
  connectionState: "idle" | "polling" | "error" | "stale";
  lastFetchAt: Date | null;
  lastSuccessfulFetchAt: Date | null;
  newSignalsCount: number;
  pollLatencyMs: number;
  dataFreshnessSeconds: number;
  errorMessage: string | null;
}

interface UseMapboxLiveSignalsOptions {
  mapRef: RefObject<mapboxgl.Map | null>;
  enabled: boolean;
  visible?: boolean;
  lane?: "LIVE" | "SANDBOX" | string;
  intervalMs?: number;
  apiBaseUrl?: string;
  activeDisease?: DiseaseLayerKey;
  onSignalsUpdate?: (signals: LiveSignal[]) => void;
}

const EMPTY_COLLECTION: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: "FeatureCollection",
  features: [],
};

const EMPTY_CHOROPLETH_COLLECTION: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
  type: "FeatureCollection",
  features: [],
};

function addLiveSignalLayers(map: mapboxgl.Map) {
  if (!map.getSource(LIVE_DISEASE_SOURCE_ID)) {
    map.addSource(LIVE_DISEASE_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_COLLECTION,
    });
  }

  if (!map.getSource(LIVE_DISEASE_CHOROPLETH_SOURCE_ID)) {
    map.addSource(LIVE_DISEASE_CHOROPLETH_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_CHOROPLETH_COLLECTION,
    });
  }

  if (!map.getLayer(LIVE_DISEASE_CHOROPLETH_FILL_LAYER_ID)) {
    map.addLayer({
      id: LIVE_DISEASE_CHOROPLETH_FILL_LAYER_ID,
      type: "fill",
      source: LIVE_DISEASE_CHOROPLETH_SOURCE_ID,
      layout: { visibility: "none" },
      paint: {
        "fill-color": [
          "interpolate",
          ["linear"],
          ["get", "cases_total"],
          0,
          "rgba(8, 145, 178, 0.1)",
          5,
          "rgba(34, 197, 94, 0.32)",
          20,
          "rgba(245, 158, 11, 0.48)",
          75,
          "rgba(239, 68, 68, 0.64)",
          200,
          "rgba(168, 85, 247, 0.74)",
        ],
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["get", "avg_truth_score"],
          0,
          0.28,
          0.65,
          0.58,
          1,
          0.78,
        ],
      },
    });
  }

  if (!map.getLayer(LIVE_DISEASE_CHOROPLETH_OUTLINE_LAYER_ID)) {
    map.addLayer({
      id: LIVE_DISEASE_CHOROPLETH_OUTLINE_LAYER_ID,
      type: "line",
      source: LIVE_DISEASE_CHOROPLETH_SOURCE_ID,
      layout: { visibility: "none" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.45, 8, 1.4],
        "line-opacity": 0.82,
      },
    });
  }

  if (!map.getLayer(LIVE_DISEASE_CIRCLE_LAYER_ID)) {
    map.addLayer({
      id: LIVE_DISEASE_CIRCLE_LAYER_ID,
      type: "circle",
      source: LIVE_DISEASE_SOURCE_ID,
      layout: { visibility: "none" },
      paint: {
        "circle-radius": ["get", "radius"],
        "circle-color": ["get", "color"],
        "circle-opacity": ["get", "opacity"],
        "circle-stroke-color": "#070A10",
        "circle-stroke-width": ["get", "strokeWidth"],
      },
    });
  }

  if (!map.getLayer(LIVE_DISEASE_LABEL_LAYER_ID)) {
    map.addLayer({
      id: LIVE_DISEASE_LABEL_LAYER_ID,
      type: "symbol",
      source: LIVE_DISEASE_SOURCE_ID,
      layout: {
        visibility: "none",
        "text-field": ["get", "label"],
        "text-font": ["Open Sans Regular"],
        "text-size": 10,
        "text-offset": [0, 1.5],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": ["get", "color"],
        "text-halo-color": "#070A10",
        "text-halo-width": 2,
      },
    });
  }
}

function setLiveSignalVisibility(map: mapboxgl.Map, visible: boolean) {
  const visibility = visible ? "visible" : "none";
  for (const id of [LIVE_DISEASE_CHOROPLETH_FILL_LAYER_ID, LIVE_DISEASE_CHOROPLETH_OUTLINE_LAYER_ID]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
  }
  for (const id of [LIVE_DISEASE_CIRCLE_LAYER_ID, LIVE_DISEASE_LABEL_LAYER_ID]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
  }
}

function setLiveDiseaseFilter(map: mapboxgl.Map, activeDisease: DiseaseLayerKey) {
  const filter = activeDisease === "ALL" ? null : ["==", ["get", "disease"], activeDisease];
  for (const id of [LIVE_DISEASE_CHOROPLETH_FILL_LAYER_ID, LIVE_DISEASE_CHOROPLETH_OUTLINE_LAYER_ID]) {
    if (map.getLayer(id)) map.setFilter(id, filter as mapboxgl.FilterSpecification | null);
  }
}

function updateLiveSignalData(map: mapboxgl.Map, signals: LiveSignal[]) {
  const source = map.getSource(LIVE_DISEASE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  source?.setData(signalsToFeatureCollection(signals));
  const choroplethSource = map.getSource(LIVE_DISEASE_CHOROPLETH_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  choroplethSource?.setData(signalsToChoroplethFeatureCollection(signals));
}

export function useMapboxLiveSignals({
  mapRef,
  enabled,
  visible = true,
  lane = "LIVE",
  intervalMs = 30_000,
  apiBaseUrl,
  activeDisease = "ALL",
  onSignalsUpdate,
}: UseMapboxLiveSignalsOptions) {
  const [signals, setSignals] = useState<LiveSignal[]>([]);
  const [status, setStatus] = useState<LiveSignalStatus>({
    connectionState: "idle",
    lastFetchAt: null,
    lastSuccessfulFetchAt: null,
    newSignalsCount: 0,
    pollLatencyMs: 0,
    dataFreshnessSeconds: 0,
    errorMessage: null,
  });
  const [layerReady, setLayerReady] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeenRef = useRef<string>(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  const latestSignalsRef = useRef<LiveSignal[]>([]);

  const ensureLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return false;

    addLiveSignalLayers(map);
    setLiveSignalVisibility(map, enabled && visible);
    setLiveDiseaseFilter(map, activeDisease);
    updateLiveSignalData(map, latestSignalsRef.current);
    setLayerReady(true);
    return true;
  }, [activeDisease, enabled, mapRef, visible]);

  const refresh = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !enabled) return;
    if (!ensureLayers()) return;

    const startedAt = performance.now();
    setStatus((prev) => ({ ...prev, connectionState: "polling", lastFetchAt: new Date() }));

    try {
      const result = await fetchLiveDiseaseSignals({
        since: lastSeenRef.current,
        lane,
        limit: 500,
        apiBaseUrl,
      });
      const latency = Math.round(performance.now() - startedAt);
      const incoming = result.signals ?? [];
      const byId = new Map(latestSignalsRef.current.map((signal) => [signal.id, signal]));

      for (const signal of incoming) byId.set(signal.id, signal);

      const merged = [...byId.values()]
        .sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1))
        .slice(0, 1000);
      latestSignalsRef.current = merged;
      setSignals(merged);
      onSignalsUpdate?.(merged);
      updateLiveSignalData(map, merged);

      const newest = incoming.reduce<string | null>((max, signal) => {
        const candidate = signal.ingestedAt || signal.timestamp;
        return !max || candidate > max ? candidate : max;
      }, null);
      if (newest) lastSeenRef.current = newest;

      setStatus((prev) => ({
        ...prev,
        connectionState: "idle",
        lastSuccessfulFetchAt: new Date(),
        newSignalsCount: incoming.length,
        pollLatencyMs: latency,
        dataFreshnessSeconds: 0,
        errorMessage: null,
      }));
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        connectionState: "error",
        pollLatencyMs: Math.round(performance.now() - startedAt),
        errorMessage: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [apiBaseUrl, enabled, ensureLayers, lane, mapRef, onSignalsUpdate]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let eventsAttached = false;
    const handleClick = (event: mapboxgl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const props = feature.properties ?? {};
      const html = `
        <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; min-width: 220px">
          <div style="font-weight: 700; margin-bottom: 4px">${props.diseaseLabel ?? "Disease layer"}</div>
          <div>Cases: ${Number(props.cases_total ?? 0).toLocaleString()}</div>
          <div>Signals: ${Number(props.signal_count ?? 0).toLocaleString()}</div>
          <div>Truth: ${Math.round(Number(props.avg_truth_score ?? 0) * 100)}%</div>
          <div>Location: ${props.admin2 || props.admin1 || props.country || "grid cell"}</div>
          <div style="margin-top: 4px; opacity: .75">${props.latest_reported_at ?? ""}</div>
        </div>
      `;
      new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
        .setLngLat(event.lngLat)
        .setHTML(html)
        .addTo(map);
    };
    const handleEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleLeave = () => {
      map.getCanvas().style.cursor = "";
    };
    const attachDelegatedEvents = () => {
      if (eventsAttached || !map.getLayer(LIVE_DISEASE_CHOROPLETH_FILL_LAYER_ID)) return;
      map.on("click", LIVE_DISEASE_CHOROPLETH_FILL_LAYER_ID, handleClick);
      map.on("mouseenter", LIVE_DISEASE_CHOROPLETH_FILL_LAYER_ID, handleEnter);
      map.on("mouseleave", LIVE_DISEASE_CHOROPLETH_FILL_LAYER_ID, handleLeave);
      eventsAttached = true;
    };
    const handleLoad = () => {
      if (ensureLayers()) attachDelegatedEvents();
    };

    if (map.isStyleLoaded()) handleLoad();
    map.on("load", handleLoad);
    map.on("style.load", handleLoad);

    return () => {
      map.off("load", handleLoad);
      map.off("style.load", handleLoad);
      if (eventsAttached) {
        map.off("click", LIVE_DISEASE_CHOROPLETH_FILL_LAYER_ID, handleClick);
        map.off("mouseenter", LIVE_DISEASE_CHOROPLETH_FILL_LAYER_ID, handleEnter);
        map.off("mouseleave", LIVE_DISEASE_CHOROPLETH_FILL_LAYER_ID, handleLeave);
      }
    };
  }, [ensureLayers, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    ensureLayers();
    setLiveSignalVisibility(map, enabled && visible);
    setLiveDiseaseFilter(map, activeDisease);
  }, [activeDisease, enabled, ensureLayers, mapRef, visible]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setStatus((prev) => ({ ...prev, connectionState: "idle" }));
      return;
    }

    void refresh();
    intervalRef.current = setInterval(refresh, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalMs, refresh]);

  useEffect(() => {
    if (!enabled) return;

    const freshnessInterval = setInterval(() => {
      setStatus((prev) => {
        const secondsSinceLastSuccess = prev.lastSuccessfulFetchAt
          ? Math.floor((Date.now() - prev.lastSuccessfulFetchAt.getTime()) / 1000)
          : 0;

        return {
          ...prev,
          connectionState:
            secondsSinceLastSuccess > 120 && prev.connectionState !== "error"
              ? "stale"
              : prev.connectionState,
          dataFreshnessSeconds: secondsSinceLastSuccess,
        };
      });
    }, 5_000);

    return () => clearInterval(freshnessInterval);
  }, [enabled]);

  return {
    signals,
    status,
    layerReady,
    refresh,
    setVisible: (nextVisible: boolean) => {
      const map = mapRef.current;
      if (map) setLiveSignalVisibility(map, nextVisible);
    },
  };
}
