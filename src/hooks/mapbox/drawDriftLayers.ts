/**
 * Draws drift engine visualization layers on the Mapbox map:
 * - drift-vectors: small arrow lines showing force direction
 * - future-corridor: ghosted predicted path
 * - future-corridor-halo: confidence glow around predicted path
 */

import type mapboxgl from "mapbox-gl";
import type { DriftResult } from "./driftEngine";

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const EMPTY_LINE: GeoJSON.Feature<GeoJSON.LineString> = {
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: [] },
};

export const DRIFT_LAYER_IDS = [
  "drift-vectors",
  "future-corridor-halo",
  "future-corridor",
];

export function addDriftSources(map: mapboxgl.Map): void {
  if (!map.getSource("drift-field")) {
    map.addSource("drift-field", { type: "geojson", data: EMPTY_FC });
  }
  if (!map.getSource("future-corridor")) {
    map.addSource("future-corridor", { type: "geojson", data: EMPTY_LINE });
  }
}

export function addDriftLayers(map: mapboxgl.Map): void {
  if (map.getLayer("drift-vectors")) return;

  // Confidence halo (drawn first = behind)
  map.addLayer({
    id: "future-corridor-halo",
    type: "line",
    source: "future-corridor",
    paint: {
      "line-color": "#EAB308",
      "line-width": 18,
      "line-opacity": 0.12,
      "line-blur": 8,
    },
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
  });

  // Future corridor ghost line
  map.addLayer({
    id: "future-corridor",
    type: "line",
    source: "future-corridor",
    paint: {
      "line-color": "#ffffff",
      "line-width": 3,
      "line-opacity": 0.5,
      "line-dasharray": [4, 3],
    },
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
  });

  // Drift vector arrows
  map.addLayer({
    id: "drift-vectors",
    type: "line",
    source: "drift-field",
    paint: {
      "line-color": [
        "interpolate",
        ["linear"],
        ["get", "magnitude"],
        0, "#EAB308",
        0.3, "#F5A623",
        0.7, "#FF453A",
      ],
      "line-width": 2,
      "line-opacity": 0.7,
    },
    layout: {
      "line-cap": "round",
    },
  });
}

export function updateDriftData(map: mapboxgl.Map, result: DriftResult | null): void {
  const driftSrc = map.getSource("drift-field") as mapboxgl.GeoJSONSource | undefined;
  const futureSrc = map.getSource("future-corridor") as mapboxgl.GeoJSONSource | undefined;

  if (result) {
    driftSrc?.setData(result.driftField);
    futureSrc?.setData(result.futureCorridor);
  } else {
    driftSrc?.setData(EMPTY_FC);
    futureSrc?.setData(EMPTY_LINE);
  }
}

export function setDriftVisibility(map: mapboxgl.Map, visible: boolean): void {
  const vis = visible ? "visible" : "none";
  for (const id of DRIFT_LAYER_IDS) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", vis);
    }
  }
}
