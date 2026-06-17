/**
 * drawHeartbeatSurface.ts
 *
 * Renders the 21-cell probability surface from the heartbeat engine
 * directly on the Mapbox map. Follows the IDENTICAL pattern to
 * drawCrossborderRiskAlerts.ts — GeoJSON source + fill/line layers,
 * updated via source.setData() on each poll.
 *
 * Colour: posterior 0 → transparent | 0.35+ → amber | 0.65+ → red
 * Opacity: driven by posterior value, pulsed by freshness age.
 */

import type mapboxgl from "mapbox-gl";

export const HEARTBEAT_SURFACE_SOURCE_ID = "heartbeat-surface";
export const HEARTBEAT_SURFACE_FILL_LAYER_ID = "heartbeat-surface-fill";
export const HEARTBEAT_SURFACE_LINE_LAYER_ID = "heartbeat-surface-line";
export const HEARTBEAT_SURFACE_LABEL_LAYER_ID = "heartbeat-surface-label";

export const HEARTBEAT_SURFACE_LAYER_IDS = [
  HEARTBEAT_SURFACE_FILL_LAYER_ID,
  HEARTBEAT_SURFACE_LINE_LAYER_ID,
  HEARTBEAT_SURFACE_LABEL_LAYER_ID,
];

// Matches the HeartbeatData shape from /api/heartbeat
export interface HeartbeatCellData {
  cellId: string;
  latCenter: number;
  lngCenter: number;
  posterior: number;
  qBaseline: number;
  contributingSources: string[];
  lastEvidenceAt: string | null;
  evidenceCount: number;
}

export interface HeartbeatApiResponse {
  ok: boolean;
  provisionalLabel: string;
  fieldValidation: string;
  syntheticInput: boolean;
  contributing: { count: number; outOf: number };
  freshestEvidence: { ageMinutes: number | null; source: string | null };
  sources: Array<{
    id: string;
    lastFetchIso: string | null;
    ageMinutes: number | null;
    lastCount: number;
    error: string | null;
    decayConstantS: number;
  }>;
  surfaceSnapshot: {
    generatedAt: string;
    totalSignalsFused: number;
    highestCell: { cellId: string; posterior: number } | null;
    cells?: HeartbeatCellData[];
  };
  stateSummary: {
    active: number;
    provisional: number;
    unknownStale: number;
    dormant: number;
    surgeActive: false;
  };
}

const CELL_DEG = 0.072; // same grid constant as probability.surface.ts

/** Convert surface cells to GeoJSON polygon grid */
function cellsToFeatureCollection(
  cells: HeartbeatCellData[]
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: "FeatureCollection",
    features: cells.map((cell) => {
      const { lngCenter, latCenter, posterior, qBaseline, contributingSources, lastEvidenceAt, evidenceCount, cellId } = cell;
      const half = CELL_DEG / 2;
      return {
        type: "Feature",
        properties: {
          cellId,
          posterior,
          qBaseline,
          evidenceCount,
          lastEvidenceAt,
          sources: (contributingSources || []).join(", "),
          // Derived display props
          posteriorPct: Math.round(posterior * 100),
          label: posterior >= 0.20 ? `${Math.round(posterior * 100)}%` : "",
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [lngCenter - half, latCenter - half],
            [lngCenter + half, latCenter - half],
            [lngCenter + half, latCenter + half],
            [lngCenter - half, latCenter + half],
            [lngCenter - half, latCenter - half],
          ]],
        },
      };
    }),
  };
}

const EMPTY_FC: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
  type: "FeatureCollection",
  features: [],
};

/** Add the heartbeat surface source and layers to the map (idempotent). */
export function addHeartbeatSurfaceLayers(map: mapboxgl.Map): void {
  if (!map.getSource(HEARTBEAT_SURFACE_SOURCE_ID)) {
    map.addSource(HEARTBEAT_SURFACE_SOURCE_ID, { type: "geojson", data: EMPTY_FC });
  }

  if (!map.getLayer(HEARTBEAT_SURFACE_FILL_LAYER_ID)) {
    map.addLayer({
      id: HEARTBEAT_SURFACE_FILL_LAYER_ID,
      type: "fill",
      source: HEARTBEAT_SURFACE_SOURCE_ID,
      layout: { visibility: "none" },
      paint: {
        "fill-color": [
          "interpolate", ["linear"], ["get", "posterior"],
          0.00, "rgba(52, 211, 153, 0)",    // transparent below baseline
          0.15, "rgba(52, 211, 153, 0.18)",  // green tint — nominal
          0.35, "rgba(251, 191, 36, 0.35)",  // amber — provisional
          0.55, "rgba(249, 115, 22, 0.48)",  // orange — active candidate
          0.75, "rgba(239, 68, 68, 0.62)",   // red — high activation
        ],
        "fill-opacity": 1,
      },
    });
  }

  if (!map.getLayer(HEARTBEAT_SURFACE_LINE_LAYER_ID)) {
    map.addLayer({
      id: HEARTBEAT_SURFACE_LINE_LAYER_ID,
      type: "line",
      source: HEARTBEAT_SURFACE_SOURCE_ID,
      layout: { visibility: "none" },
      paint: {
        "line-color": [
          "interpolate", ["linear"], ["get", "posterior"],
          0.15, "rgba(52, 211, 153, 0.3)",
          0.35, "rgba(251, 191, 36, 0.7)",
          0.65, "rgba(239, 68, 68, 0.9)",
        ],
        "line-width": ["interpolate", ["linear"], ["get", "posterior"], 0.15, 0.5, 0.75, 2],
        "line-dasharray": [2, 2],
      },
    });
  }

  if (!map.getLayer(HEARTBEAT_SURFACE_LABEL_LAYER_ID)) {
    map.addLayer({
      id: HEARTBEAT_SURFACE_LABEL_LAYER_ID,
      type: "symbol",
      source: HEARTBEAT_SURFACE_SOURCE_ID,
      layout: {
        visibility: "none",
        "text-field": ["get", "label"],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-size": 10,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#F8FAFC",
        "text-halo-color": "#070A10",
        "text-halo-width": 1.5,
      },
    });
  }
}

/** Push fresh cells into the map source. */
export function updateHeartbeatSurface(
  map: mapboxgl.Map,
  cells: HeartbeatCellData[]
): void {
  const src = map.getSource(HEARTBEAT_SURFACE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData(cellsToFeatureCollection(cells));
}

export function setHeartbeatSurfaceVisibility(map: mapboxgl.Map, visible: boolean): void {
  const vis = visible ? "visible" : "none";
  for (const id of HEARTBEAT_SURFACE_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
  }
}
