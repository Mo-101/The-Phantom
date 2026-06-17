import type mapboxgl from "mapbox-gl";
import type { DiseaseLayerKey } from "@/lib/live.disease.signals";

export const DISEASE_GEOJSON_LAYER_IDS = [
  "historical-disease-choropleth-fill",
  "historical-disease-choropleth-outline",
  "lassa-specimen-transit",
];

const BASE = "/data/disease/lassa";

async function fetchGeoJson(path: string): Promise<GeoJSON.FeatureCollection | null> {
  const response = await fetch(path);
  if (!response.ok) return null;
  const data = await response.json();
  if (data?.type !== "FeatureCollection") return null;
  return data as GeoJSON.FeatureCollection;
}

function upsertGeoJsonSource(map: mapboxgl.Map, id: string, data: GeoJSON.FeatureCollection) {
  const source = map.getSource(id) as mapboxgl.GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource(id, { type: "geojson", data });
}

export async function drawDiseaseGeojsonLayers(map: mapboxgl.Map): Promise<number> {
  const [choropleth, specimenTransit] = await Promise.all([
    fetchGeoJson(`${BASE}/historical_choropleth.geojson`),
    fetchGeoJson(`${BASE}/specimen_transit.geojson`),
  ]);

  let loaded = 0;

  if (choropleth && choropleth.features.length > 0) {
    loaded += choropleth.features.length;
    upsertGeoJsonSource(map, "historical-disease-choropleth", choropleth);

    if (!map.getLayer("historical-disease-choropleth-fill")) {
      map.addLayer({
        id: "historical-disease-choropleth-fill",
        type: "fill",
        source: "historical-disease-choropleth",
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "cases_total"],
            0,
            "rgba(8, 145, 178, 0.12)",
            5,
            "rgba(34, 197, 94, 0.34)",
            25,
            "rgba(245, 158, 11, 0.48)",
            100,
            "rgba(239, 68, 68, 0.62)",
            300,
            "rgba(124, 58, 237, 0.72)",
          ],
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.58, 8, 0.42],
        },
      });
    }

    if (!map.getLayer("historical-disease-choropleth-outline")) {
      map.addLayer({
        id: "historical-disease-choropleth-outline",
        type: "line",
        source: "historical-disease-choropleth",
        paint: {
          "line-color": [
            "interpolate",
            ["linear"],
            ["get", "cases_total"],
            0,
            "rgba(103, 232, 249, 0.25)",
            25,
            "rgba(253, 224, 71, 0.5)",
            100,
            "rgba(251, 113, 133, 0.68)",
            300,
            "rgba(216, 180, 254, 0.8)",
          ],
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.45, 8, 1.25],
          "line-opacity": 0.9,
        },
      });
    }
  }

  if (specimenTransit && specimenTransit.features.length > 0) {
    loaded += specimenTransit.features.length;
    upsertGeoJsonSource(map, "lassa-specimen-transit", specimenTransit);

    if (!map.getLayer("lassa-specimen-transit")) {
      map.addLayer({
        id: "lassa-specimen-transit",
        type: "line",
        source: "lassa-specimen-transit",
        paint: {
          "line-color": [
            "match",
            ["get", "friction_class"],
            "CRITICAL",
            "#DC2626",
            "HIGH",
            "#F97316",
            "MODERATE",
            "#F59E0B",
            "#22C55E",
          ],
          "line-width": ["interpolate", ["linear"], ["get", "transit_days"], 0, 1, 7, 5],
          "line-opacity": 0.75,
          "line-blur": 0.4,
        },
      });
    }
  }

  return loaded;
}

export function setDiseaseGeojsonVisibility(map: mapboxgl.Map, visible: boolean) {
  const visibility = visible ? "visible" : "none";
  for (const id of DISEASE_GEOJSON_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
  }
}

export function setDiseaseGeojsonDiseaseFilter(map: mapboxgl.Map, activeDisease: DiseaseLayerKey) {
  const filter = activeDisease === "ALL" ? null : ["==", ["get", "disease"], activeDisease];
  for (const id of DISEASE_GEOJSON_LAYER_IDS) {
    if (map.getLayer(id)) map.setFilter(id, filter as mapboxgl.FilterSpecification | null);
  }
}
