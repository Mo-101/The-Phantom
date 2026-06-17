import mapboxgl from "mapbox-gl";

export const CROSSBORDER_ALERT_SOURCE_ID = "crossborder-risk-alerts";
export const CROSSBORDER_ALERT_FILL_LAYER_ID = "crossborder-risk-alerts-fill";
export const CROSSBORDER_ALERT_LINE_LAYER_ID = "crossborder-risk-alerts-line";
export const CROSSBORDER_ALERT_LABEL_LAYER_ID = "crossborder-risk-alerts-label";

export const CROSSBORDER_ALERT_LAYER_IDS = [
  CROSSBORDER_ALERT_FILL_LAYER_ID,
  CROSSBORDER_ALERT_LINE_LAYER_ID,
  CROSSBORDER_ALERT_LABEL_LAYER_ID,
];

const ALERT_COLOR_EXPR: mapboxgl.ExpressionSpecification = [
  "match",
  ["get", "severity"],
  "critical",
  "#FF2D55",
  "high",
  "#F97316",
  "watch",
  "#F5C518",
  "#38BDF8",
];

async function fetchAlertData(): Promise<GeoJSON.FeatureCollection | null> {
  const response = await fetch("/data/risk/crossborder-risk-alerts.geojson");
  if (!response.ok) return null;
  const data = await response.json();
  return data?.type === "FeatureCollection" ? data : null;
}

export async function drawCrossborderRiskAlerts(map: mapboxgl.Map): Promise<number> {
  const data = await fetchAlertData();
  if (!data || data.features.length === 0) return 0;

  const source = map.getSource(CROSSBORDER_ALERT_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
  } else {
    map.addSource(CROSSBORDER_ALERT_SOURCE_ID, { type: "geojson", data });
  }

  if (!map.getLayer(CROSSBORDER_ALERT_FILL_LAYER_ID)) {
    map.addLayer({
      id: CROSSBORDER_ALERT_FILL_LAYER_ID,
      type: "fill",
      source: CROSSBORDER_ALERT_SOURCE_ID,
      slot: "top",
      layout: { visibility: "none" },
      paint: {
        "fill-color": ALERT_COLOR_EXPR,
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["get", "risk_score"],
          0,
          0.08,
          55,
          0.18,
          75,
          0.28,
          100,
          0.38,
        ],
      },
    });
  }

  if (!map.getLayer(CROSSBORDER_ALERT_LINE_LAYER_ID)) {
    map.addLayer({
      id: CROSSBORDER_ALERT_LINE_LAYER_ID,
      type: "line",
      source: CROSSBORDER_ALERT_SOURCE_ID,
      slot: "top",
      layout: { visibility: "none" },
      paint: {
        "line-color": ALERT_COLOR_EXPR,
        "line-width": ["interpolate", ["linear"], ["get", "risk_score"], 0, 1, 75, 2.5, 100, 4],
        "line-opacity": 0.9,
        "line-dasharray": [2, 1.5],
      },
    });
  }

  if (!map.getLayer(CROSSBORDER_ALERT_LABEL_LAYER_ID)) {
    map.addLayer({
      id: CROSSBORDER_ALERT_LABEL_LAYER_ID,
      type: "symbol",
      source: CROSSBORDER_ALERT_SOURCE_ID,
      slot: "top",
      layout: {
        visibility: "none",
        "text-field": ["concat", ["get", "corridor_id"], " · ", ["upcase", ["get", "severity"]]],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 7, 12],
        "text-anchor": "center",
        "text-max-width": 12,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#F8FAFC",
        "text-halo-color": "#070A10",
        "text-halo-width": 1.5,
      },
    });
  }

  return data.features.length;
}

export function setCrossborderRiskAlertsVisibility(map: mapboxgl.Map, visible: boolean) {
  const visibility = visible ? "visible" : "none";
  for (const id of CROSSBORDER_ALERT_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
  }
}
