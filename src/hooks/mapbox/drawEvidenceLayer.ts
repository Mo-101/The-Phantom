import type { MapboxDrawContext } from "./types";
import { fetchTemporalSignals, type EvidenceSignal } from "@/lib/temporalAdapter";
import type mapboxgl from "mapbox-gl";

const SOURCE_COLORS: Record<string, string> = {
  ACLED: "#EF4444",
  "IOM-DTM": "#3B82F6",
  DHIS2: "#22C55E",
  "AFRO-SENTINEL": "#A855F7",
};

function getSignalColor(signal: EvidenceSignal): string {
  if (signal.signalType === "FLOW") return "#3B82F6";
  if (signal.signalType.includes("CONFLICT")) return "#EF4444";
  if (signal.signalType.includes("SURGE")) return "#F97316";
  if (signal.signalType.includes("HEALTH")) return "#22C55E";
  return SOURCE_COLORS[signal.src] ?? "#9CA3AF";
}

export async function drawEvidenceLayer(
  ctx: MapboxDrawContext
): Promise<{ data: EvidenceSignal[]; featureIds: string[] }> {
  const data = await fetchTemporalSignals();
  const featureIds: string[] = [];

  const features: GeoJSON.Feature[] = data.map((e, i) => {
    const fid = `evid-${i}`;
    featureIds.push(fid);
    return {
      type: "Feature",
      id: i,
      properties: {
        fid,
        corridorId: e.cid,
        signalType: e.signalType,
        source: e.source,
        score: e.score,
        label: e.label,
        desc: e.desc,
        color: getSignalColor(e),
        radius: 6 + (e.score / 100) * 10,
      },
      geometry: {
        type: "Point",
        coordinates: [e.lng, e.lat],
      },
    };
  });

  const { map } = ctx;

  map.addSource("evidence-signals", {
    type: "geojson",
    data: { type: "FeatureCollection", features },
  });

  // Circle layer — hidden by default
  map.addLayer({
    id: "evidence-circles",
    type: "circle",
    source: "evidence-signals",
    layout: { visibility: "none" },
    paint: {
      "circle-radius": ["get", "radius"],
      "circle-color": ["get", "color"],
      "circle-opacity": 0.7,
      "circle-stroke-color": "#070A10",
      "circle-stroke-width": 1,
    },
  });

  // Label layer — hidden by default
  map.addLayer({
    id: "evidence-labels",
    type: "symbol",
    source: "evidence-signals",
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

  console.log(`[Mapbox] Drew ${data.length} evidence signals (hidden)`);
  return { data, featureIds };
}

export function toggleEvidenceLayer(map: mapboxgl.Map, visible: boolean): void {
  const vis = visible ? "visible" : "none";
  if (map.getLayer("evidence-circles")) map.setLayoutProperty("evidence-circles", "visibility", vis);
  if (map.getLayer("evidence-labels")) map.setLayoutProperty("evidence-labels", "visibility", vis);
}
