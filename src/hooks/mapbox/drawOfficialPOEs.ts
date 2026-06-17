import type { MapboxDrawContext } from "./types";
import { T, RISK_COLORS } from "./types";
import { queryNeon } from "@/lib/neon";

export const POE_LAYER_IDS = [
  "official-poes-circle",
  "official-poes-outline",
  "official-poes-label",
];

interface POERow {
  name: string;
  lat: number;
  lng: number;
  country: string;
  role: string;
  corridor_id: string;
  risk_class: string;
  score: number;
}

interface POENode {
  name: string;
  lat: number;
  lng: number;
  country: string;
  role: "start" | "end";
  corridor_id: string;
  risk_class: string;
  score: number;
}

export async function drawOfficialPOEs(ctx: MapboxDrawContext): Promise<void> {
  const { map } = ctx;

  const rows = await queryNeon<POERow>(`
    SELECT start_node AS name, start_lat AS lat, start_lng AS lng,
           start_country AS country, 'start' AS role,
           id AS corridor_id, risk_class, score
    FROM poe_corridors
    UNION ALL
    SELECT end_node AS name, end_lat AS lat, end_lng AS lng,
           end_country AS country, 'end' AS role,
           id AS corridor_id, risk_class, score
    FROM poe_corridors
    ORDER BY score DESC
  `);

  if (rows.length === 0) {
    console.warn("[drawOfficialPOEs] No POE nodes found in Neon");
    return;
  }

  // Deduplicate by name + rounded coordinates
  const seen = new Set<string>();
  const uniqueNodes: POENode[] = [];

  for (const r of rows) {
    const key = `${r.name}_${Number(r.lat).toFixed(3)}_${Number(r.lng).toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueNodes.push({
      name: r.name,
      lat: Number(r.lat),
      lng: Number(r.lng),
      country: r.country,
      role: r.role as "start" | "end",
      corridor_id: r.corridor_id,
      risk_class: r.risk_class,
      score: Number(r.score),
    });
  }

  const features: GeoJSON.Feature[] = uniqueNodes.map((node) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [node.lng, node.lat],
    },
    properties: {
      name: node.name,
      country: node.country,
      role: node.role,
      corridor_id: node.corridor_id,
      risk_class: node.risk_class,
      score: node.score,
      color: RISK_COLORS[node.risk_class] || T.blue,
    },
  }));

  // Cleanup existing layers/source before re-adding
  for (const id of POE_LAYER_IDS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource("official-poes")) map.removeSource("official-poes");

  map.addSource("official-poes", {
    type: "geojson",
    data: { type: "FeatureCollection", features },
  });

  // Outer ring — risk-colored
  map.addLayer({
    id: "official-poes-outline",
    type: "circle",
    source: "official-poes",
    paint: {
      "circle-radius": 9,
      "circle-color": "transparent",
      "circle-stroke-width": 2.5,
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-opacity": 0.9,
    },
  });

  // Inner fill — role-coded (green=start/entry, orange=end/exit)
  map.addLayer({
    id: "official-poes-circle",
    type: "circle",
    source: "official-poes",
    paint: {
      "circle-radius": 6,
      "circle-color": [
        "case",
        ["==", ["get", "role"], "start"],
        "#22C55E",
        "#F97316",
      ],
      "circle-opacity": 0.85,
      "circle-stroke-width": 1,
      "circle-stroke-color": T.bg,
    },
  });

  // Labels
  map.addLayer({
    id: "official-poes-label",
    type: "symbol",
    source: "official-poes",
    layout: {
      "text-field": ["concat", ["get", "name"], " ", ["get", "country"]],
      "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
      "text-size": 10,
      "text-offset": [0, 1.6],
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": T.text,
      "text-halo-color": T.bg,
      "text-halo-width": 2,
      "text-opacity": 0.85,
    },
    minzoom: 6,
  });

  console.log(
    `[drawOfficialPOEs] Rendered ${uniqueNodes.length} POE nodes from Neon (${rows.length} raw)`
  );
}
