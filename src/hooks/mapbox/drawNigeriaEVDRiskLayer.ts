import mapboxgl from "mapbox-gl";

export const NIGERIA_EVD_POE_SOURCE_ID = "nigeria-evd-poe-risk";
export const NIGERIA_EVD_POE_PULSE_LAYER_ID = "nigeria-evd-poe-pulse";
export const NIGERIA_EVD_POE_CIRCLE_LAYER_ID = "nigeria-evd-poe-circles";
export const NIGERIA_EVD_POE_LABEL_LAYER_ID = "nigeria-evd-poe-labels";

export const NIGERIA_EVD_POE_LAYER_IDS = [
  NIGERIA_EVD_POE_PULSE_LAYER_ID,
  NIGERIA_EVD_POE_CIRCLE_LAYER_ID,
  NIGERIA_EVD_POE_LABEL_LAYER_ID,
];

export const EVD_SCORING_WEIGHTS = {
  outbreak_proximity: 0.35,
  corridor_movement_pressure: 0.25,
  poe_exposure_class: 0.2,
  surveillance_readiness_gap: 0.1,
  modifiers: 0.1,
};

export const EVD_RISK_BANDS = {
  low: { color: "#00C896", label: "Low", range: "0-30" },
  moderate: { color: "#F5C518", label: "Moderate", range: "31-55" },
  high: { color: "#FF8C00", label: "High", range: "56-75" },
  critical: { color: "#FF2D55", label: "Critical", range: "76-100" },
};

type ScoreBreakdownEntry = {
  value: number;
  max: number;
  note?: string;
};

type ScoreBreakdown = Record<string, ScoreBreakdownEntry>;

const RISK_COLOR_EXPR: mapboxgl.ExpressionSpecification = [
  "step",
  ["get", "risk_score"],
  EVD_RISK_BANDS.low.color,
  31,
  EVD_RISK_BANDS.moderate.color,
  56,
  EVD_RISK_BANDS.high.color,
  76,
  EVD_RISK_BANDS.critical.color,
];

const RISK_RADIUS_EXPR: mapboxgl.ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["get", "risk_score"],
  0,
  8,
  30,
  10,
  55,
  13,
  75,
  17,
  100,
  22,
];

export function computeEVDRiskScore(
  breakdown: ScoreBreakdown,
  weights: Record<string, number> = EVD_SCORING_WEIGHTS
): number {
  let weighted = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const entry = breakdown[key];
    if (!entry) continue;
    const max = Number(entry.max) || 0;
    const value = Number(entry.value) || 0;
    const normalized = max > 0 ? value / max : 0;
    weighted += normalized * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) : 0;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseBreakdown(value: unknown): ScoreBreakdown {
  if (!value) return {};
  if (typeof value === "object") return value as ScoreBreakdown;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getRiskColor(riskBand: unknown): string {
  const key = String(riskBand ?? "").toLowerCase() as keyof typeof EVD_RISK_BANDS;
  return EVD_RISK_BANDS[key]?.color ?? "#9CA3AF";
}

function formatDriverLabel(key: string): string {
  return key.replace(/_/g, " ");
}

function buildEVDRiskPopupHTML(props: Record<string, unknown>): string {
  const breakdown = parseBreakdown(props.score_breakdown);
  const color = getRiskColor(props.risk_band);
  const score = Number(props.risk_score ?? 0);

  const driverRows = Object.entries(breakdown).map(([key, entry]) => {
    const value = Number(entry?.value ?? 0);
    const max = Number(entry?.max ?? 0);
    const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
    return `
      <div style="display:grid;grid-template-columns:122px 1fr 42px;gap:3px 7px;align-items:center;margin-bottom:8px">
        <span style="font-size:10px;color:#CBD5E1;text-transform:capitalize">${escapeHtml(formatDriverLabel(key))}</span>
        <span style="height:4px;background:#1F2937;border-radius:99px;overflow:hidden">
          <span style="display:block;width:${pct}%;height:100%;background:${color};border-radius:99px"></span>
        </span>
        <span style="font-size:10px;color:#94A3B8;text-align:right">${escapeHtml(value)}/${escapeHtml(max)}</span>
        <span style="grid-column:1 / -1;font-size:10px;color:#94A3B8;line-height:1.45">${escapeHtml(entry?.note)}</span>
      </div>
    `;
  }).join("");

  return `
    <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;min-width:300px;max-width:360px;color:#E5E7EB">
      <div style="padding-bottom:8px;border-bottom:1px solid rgba(148,163,184,.25)">
        <strong style="display:block;font-size:13px;line-height:1.35">${escapeHtml(props.name)}</strong>
        <span style="display:block;margin-top:3px;font-size:11px;color:#94A3B8">${escapeHtml(props.state)} / ${escapeHtml(props.region)} / ${escapeHtml(props.type)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0">
        <span style="display:inline-flex;align-items:baseline;gap:2px;padding:6px 10px;border-radius:6px;background:${color};color:#fff">
          <strong style="font-size:23px;line-height:1">${escapeHtml(score)}</strong>
          <span style="font-size:10px;opacity:.75">/100</span>
        </span>
        <span style="font-size:12px;font-weight:700;color:${color};text-transform:uppercase">${escapeHtml(props.risk_band)} risk</span>
      </div>
      <div style="padding-top:2px">
        <div style="font-size:9px;color:#94A3B8;letter-spacing:.12em;text-transform:uppercase;margin-bottom:7px">Risk drivers</div>
        ${driverRows || `<div style="font-size:11px;color:#94A3B8">No breakdown available.</div>`}
      </div>
      <div style="border-top:1px solid rgba(148,163,184,.18);padding-top:9px;margin-top:4px;font-size:11px;line-height:1.5;color:#CBD5E1">
        <strong style="display:block;color:#E5E7EB;margin-bottom:3px">Summary</strong>
        ${escapeHtml(props.drivers_summary)}
      </div>
      <div style="border:1px solid ${color}55;border-radius:6px;padding:8px;margin-top:9px;font-size:11px;line-height:1.5;color:#E5E7EB">
        <strong style="display:block;margin-bottom:3px">Recommended action</strong>
        ${escapeHtml(props.recommended_action)}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;font-size:9px;color:#94A3B8">
        <span>Confidence: <strong>${escapeHtml(props.data_confidence)}</strong></span>
        <span>Source: ${escapeHtml(props.source_date)}</span>
        <span>Seed data v1</span>
      </div>
    </div>
  `;
}

async function fetchEVDRiskData(): Promise<GeoJSON.FeatureCollection | null> {
  const response = await fetch("/data/risk/nigeria-evd-poe-risk.geojson");
  if (!response.ok) return null;
  const data = await response.json();
  return data?.type === "FeatureCollection" ? data : null;
}

export async function drawNigeriaEVDRiskLayer(map: mapboxgl.Map): Promise<number> {
  const data = await fetchEVDRiskData();
  if (!data || data.features.length === 0) return 0;

  if (!map.getSource(NIGERIA_EVD_POE_SOURCE_ID)) {
    map.addSource(NIGERIA_EVD_POE_SOURCE_ID, { type: "geojson", data });
  } else {
    const source = map.getSource(NIGERIA_EVD_POE_SOURCE_ID) as mapboxgl.GeoJSONSource;
    source.setData(data);
  }

  if (!map.getLayer(NIGERIA_EVD_POE_PULSE_LAYER_ID)) {
    map.addLayer({
      id: NIGERIA_EVD_POE_PULSE_LAYER_ID,
      type: "circle",
      source: NIGERIA_EVD_POE_SOURCE_ID,
      layout: { visibility: "none" },
      paint: {
        "circle-radius": ["*", RISK_RADIUS_EXPR, 1.7],
        "circle-color": RISK_COLOR_EXPR,
        "circle-opacity": 0.18,
        "circle-stroke-width": 0,
      },
    });
  }

  if (!map.getLayer(NIGERIA_EVD_POE_CIRCLE_LAYER_ID)) {
    map.addLayer({
      id: NIGERIA_EVD_POE_CIRCLE_LAYER_ID,
      type: "circle",
      source: NIGERIA_EVD_POE_SOURCE_ID,
      layout: { visibility: "none" },
      paint: {
        "circle-radius": RISK_RADIUS_EXPR,
        "circle-color": RISK_COLOR_EXPR,
        "circle-opacity": 0.9,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#070A10",
      },
    });
  }

  if (!map.getLayer(NIGERIA_EVD_POE_LABEL_LAYER_ID)) {
    map.addLayer({
      id: NIGERIA_EVD_POE_LABEL_LAYER_ID,
      type: "symbol",
      source: NIGERIA_EVD_POE_SOURCE_ID,
      filter: [">=", ["get", "risk_score"], 56],
      layout: {
        visibility: "none",
        "text-field": ["get", "short_name"],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-size": 11,
        "text-offset": [0, 1.8],
        "text-anchor": "top",
        "text-max-width": 9,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#F9FAFB",
        "text-halo-color": "#070A10",
        "text-halo-width": 1.5,
      },
    });
  }

  const boundMap = map as mapboxgl.Map & { __nigeriaEVDRiskBound?: boolean };
  if (!boundMap.__nigeriaEVDRiskBound) {
    const handleClick = (event: mapboxgl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;
      new mapboxgl.Popup({ maxWidth: "380px", className: "evd-risk-popup" })
        .setLngLat(event.lngLat)
        .setHTML(buildEVDRiskPopupHTML(feature.properties ?? {}))
        .addTo(map);
    };

    const handleEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", NIGERIA_EVD_POE_CIRCLE_LAYER_ID, handleClick);
    map.on("mouseenter", NIGERIA_EVD_POE_CIRCLE_LAYER_ID, handleEnter);
    map.on("mouseleave", NIGERIA_EVD_POE_CIRCLE_LAYER_ID, handleLeave);
    boundMap.__nigeriaEVDRiskBound = true;
  }

  return data.features.length;
}

export function setNigeriaEVDRiskVisibility(map: mapboxgl.Map, visible: boolean) {
  const visibility = visible ? "visible" : "none";
  for (const id of NIGERIA_EVD_POE_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
  }
}
