/**
 * MoStar Phantom XO — drawDeviationAnalytics (Neon-backed)
 * moscript://codex/v1
 * agent: phantom-xo-deviation-viz
 * intent: render deviation as analytical intelligence — heatline + blind spot markers
 * sass: "Red means invisible. Green means watched. The gradient is the gap."
 *
 * Queries poe_deviation from Neon.
 * When a corridor is selected, renders:
 *   1. Deviation heatline (green=near road -> red=far from road)
 *   2. Blind spot markers at peak deviation points
 *
 * Also provides the invisibility ranking for the sidebar/legend.
 */

import type mapboxgl from "mapbox-gl";
import { queryNeon } from "@/lib/neon";

// Theme background (matches app dark theme)
const THEME_BG = "#0A0E14";

// ── Layer IDs ───────────────────────────────────────────────────────
export const DEVIATION_ANALYTICS_LAYER_IDS = [
  "deviation-heatline",
  "deviation-blind-spots",
  "deviation-blind-labels",
];

// ── Types ───────────────────────────────────────────────────────────
export interface DeviationRecord {
  corridor_id: string;
  phantom_distance_km: number;
  formal_distance_km: number;
  shortcut_ratio: number;
  route_efficiency: number;
  deviation_mean_km: number;
  deviation_max_km: number;
  deviation_pct_gt_1km: number;
  deviation_pct_gt_5km: number;
  invisibility_index: number | null;
  signals_in_high_dev_zone: number;
  signal_deviation_correlation: number;
  deviation_segment_count: number;
}

export interface InvisibilityRanking {
  corridors: DeviationRecord[];
  totalCorridors: number;
  avgInvisibility: number;
  mostInvisible: DeviationRecord | null;
  leastInvisible: DeviationRecord | null;
}

// ── Fetch all deviation records (for legend/sidebar) ────────────────
export async function fetchInvisibilityRanking(): Promise<InvisibilityRanking> {
  const rows = await queryNeon<DeviationRecord>(
    `SELECT corridor_id, phantom_distance_km, formal_distance_km,
            shortcut_ratio, route_efficiency, deviation_mean_km, deviation_max_km,
            deviation_pct_gt_1km, deviation_pct_gt_5km, invisibility_index,
            signals_in_high_dev_zone, signal_deviation_correlation, deviation_segment_count
     FROM poe_deviation
     WHERE invisibility_index IS NOT NULL
     ORDER BY invisibility_index DESC`
  );

  const validRows = rows.filter((r) => r.invisibility_index != null);
  const avg =
    validRows.length > 0
      ? validRows.reduce((s, r) => s + (r.invisibility_index || 0), 0) / validRows.length
      : 0;

  return {
    corridors: rows,
    totalCorridors: rows.length,
    avgInvisibility: Math.round(avg * 1000) / 1000,
    mostInvisible: validRows[0] || null,
    leastInvisible: validRows[validRows.length - 1] || null,
  };
}

// ── Fetch single corridor deviation ─────────────────────────────────
export async function fetchCorridorDeviation(
  corridorId: string
): Promise<DeviationRecord | null> {
  const rows = await queryNeon<DeviationRecord>(
    `SELECT * FROM poe_deviation WHERE corridor_id = $1`,
    [corridorId]
  );
  return rows[0] || null;
}

// ── Draw deviation heatline for a selected corridor ─────────────────
export async function drawDeviationAnalytics(
  map: mapboxgl.Map,
  corridorId: string,
  phantomCoords: number[][] // from the GeoJSON corridor geometry
): Promise<DeviationRecord | null> {
  // Fetch deviation data
  const dev = await fetchCorridorDeviation(corridorId);
  if (!dev) {
    console.warn(`[drawDeviationAnalytics] No deviation data for ${corridorId}`);
    return null;
  }

  // If we have per-vertex deviations in the DB, use them
  let vertexDevs: number[] | null = null;

  const rawRows = await queryNeon<{ vertex_deviations_json: string }>(
    `SELECT vertex_deviations_json FROM poe_deviation WHERE corridor_id = $1`,
    [corridorId]
  );

  if (rawRows[0]?.vertex_deviations_json) {
    try {
      vertexDevs = JSON.parse(rawRows[0].vertex_deviations_json);
    } catch { /* ignore parse error */ }
  }

  // If no per-vertex data, synthesize from aggregate metrics
  if (!vertexDevs || vertexDevs.length === 0) {
    const n = phantomCoords.length;
    vertexDevs = phantomCoords.map((_, i) => {
      const t = i / Math.max(n - 1, 1);
      const center = 0.5;
      const spread = 0.3;
      const gaussian = Math.exp(-((t - center) ** 2) / (2 * spread ** 2));
      return dev.deviation_mean_km * (0.3 + 0.7 * gaussian);
    });
  }

  const len = Math.min(vertexDevs.length, phantomCoords.length);

  // ── Build segment features ──────────────────────────────────────
  const segmentFeatures: GeoJSON.Feature[] = [];

  for (let i = 0; i < len - 1; i++) {
    const avgDev = (vertexDevs[i] + vertexDevs[Math.min(i + 1, len - 1)]) / 2;
    segmentFeatures.push({
      type: "Feature",
      properties: {
        deviation_km: Math.round(avgDev * 100) / 100,
        band:
          avgDev < 0.5 ? "monitored"
          : avgDev < 1 ? "marginal"
          : avgDev < 5 ? "blind"
          : avgDev < 10 ? "invisible"
          : "deep_invisible",
      },
      geometry: {
        type: "LineString",
        coordinates: [phantomCoords[i], phantomCoords[i + 1]],
      },
    });
  }

  // ── Build blind spot markers ────────────────────────────────────
  const blindSpotFeatures: GeoJSON.Feature[] = [];
  let maxInRun = 0;
  let maxIdx = -1;
  let inRun = false;

  for (let i = 0; i < len; i++) {
    if (vertexDevs[i] > 5) {
      if (!inRun) { inRun = true; maxInRun = 0; maxIdx = i; }
      if (vertexDevs[i] > maxInRun) {
        maxInRun = vertexDevs[i];
        maxIdx = i;
      }
    } else {
      if (inRun && maxIdx >= 0 && maxIdx < phantomCoords.length) {
        blindSpotFeatures.push({
          type: "Feature",
          properties: {
            deviation_km: Math.round(maxInRun * 10) / 10,
            label: `${Math.round(maxInRun)}km blind`,
          },
          geometry: {
            type: "Point",
            coordinates: phantomCoords[maxIdx],
          },
        });
      }
      inRun = false;
    }
  }
  if (inRun && maxIdx >= 0 && maxIdx < phantomCoords.length) {
    blindSpotFeatures.push({
      type: "Feature",
      properties: {
        deviation_km: Math.round(maxInRun * 10) / 10,
        label: `${Math.round(maxInRun)}km blind`,
      },
      geometry: {
        type: "Point",
        coordinates: phantomCoords[maxIdx],
      },
    });
  }

  // ── Remove existing layers ──────────────────────────────────────
  removeDeviationAnalyticsLayers(map);

  // ── Add sources + layers ────────────────────────────────────────
  map.addSource("deviation-heatline", {
    type: "geojson",
    data: { type: "FeatureCollection", features: segmentFeatures },
  });

  map.addSource("deviation-blind-spots", {
    type: "geojson",
    data: { type: "FeatureCollection", features: blindSpotFeatures },
  });

  // Deviation heatline: green->yellow->orange->red->dark-red
  map.addLayer({
    id: "deviation-heatline",
    type: "line",
    source: "deviation-heatline",
    paint: {
      "line-color": [
        "interpolate", ["linear"], ["get", "deviation_km"],
        0, "#22C55E",
        0.5, "#86EFAC",
        1, "#FACC15",
        5, "#F97316",
        10, "#EF4444",
        30, "#991B1B",
      ],
      "line-width": 6,
      "line-opacity": 0.9,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });

  // Blind spot pulsing circles
  map.addLayer({
    id: "deviation-blind-spots",
    type: "circle",
    source: "deviation-blind-spots",
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["get", "deviation_km"],
        5, 8, 20, 14, 50, 20,
      ],
      "circle-color": "#EF4444",
      "circle-opacity": 0.3,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#EF4444",
      "circle-stroke-opacity": 0.7,
    },
  });

  // Blind spot labels
  map.addLayer({
    id: "deviation-blind-labels",
    type: "symbol",
    source: "deviation-blind-spots",
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
      "text-size": 10,
      "text-offset": [0, -2],
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#EF4444",
      "text-halo-color": THEME_BG,
      "text-halo-width": 2,
    },
  });

  return dev;
}

// ── Remove layers ───────────────────────────────────────────────────
export function removeDeviationAnalyticsLayers(map: mapboxgl.Map) {
  for (const id of DEVIATION_ANALYTICS_LAYER_IDS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource("deviation-heatline")) map.removeSource("deviation-heatline");
  if (map.getSource("deviation-blind-spots")) map.removeSource("deviation-blind-spots");
}

// ── Toggle visibility ───────────────────────────────────────────────
export function toggleDeviationAnalyticsLayers(map: mapboxgl.Map, visible: boolean) {
  const vis = visible ? "visible" : "none";
  for (const id of DEVIATION_ANALYTICS_LAYER_IDS) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", vis);
    }
  }
}
