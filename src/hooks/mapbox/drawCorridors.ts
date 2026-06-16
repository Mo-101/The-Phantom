import type { MapboxDrawContext, CorridorMeta } from "./types";
import { RISK_COLORS } from "./types";
import {
  ITURI_CORRIDOR_META,
  ITURI_CRISIS_CORRIDOR,
  getIturiLineCoordinates,
} from "@/data/ituri-crisis-corridor";

const FORMAL_BLUE = "#3B82F6";
const FORMAL_HALO = "rgba(59, 130, 246, 0.34)";
const PHANTOM_HALO = "rgba(249, 115, 22, 0.34)";
const PHANTOM_LINE_GRADIENT: mapboxgl.ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["line-progress"],
  0,
  "#22C55E",
  0.22,
  "#84CC16",
  0.45,
  "#EAB308",
  0.68,
  "#F97316",
  1,
  "#EF4444",
];
const ITURI_LAYER_ID = "phantom-line-CORRIDOR-CD-UG-ITU-001";
const KOBOKO_ARUA_ID = "koboko-arua";
const KOBOKO_ARUA_PHANTOM_HALO_LAYER_ID = "phantom-line-koboko-arua-halo";
const KOBOKO_ARUA_PHANTOM_LAYER_ID = "phantom-line-koboko-arua";
const KOBOKO_ARUA_KM = 52;
const KOBOKO_ARUA_META: CorridorMeta = {
  id: KOBOKO_ARUA_ID,
  name: "Arua -> Koboko",
  risk: "HIGH",
  km: KOBOKO_ARUA_KM,
  mode: "mixed",
  center: [30.935, 3.22],
  zoom: 8,
};
const KOBOKO_ARUA_FORMAL_COORDS: [number, number][] = [
  [30.91, 3.02],
  [30.93, 3.13],
  [30.95, 3.25],
  [30.96, 3.413],
];
const KOBOKO_ARUA_PHANTOM_COORDS: [number, number][] = [
  [30.91, 3.02],
  [30.855, 3.115],
  [30.875, 3.245],
  [30.925, 3.34],
  [30.96, 3.413],
];

function removeLayerIfExists(map: mapboxgl.Map, layerId: string) {
  if (map.getLayer(layerId)) {
    map.removeLayer(layerId);
  }
}

function removeSourceIfExists(map: mapboxgl.Map, sourceId: string) {
  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }
}

export interface CoverageStats {
  monitoredPct: number;
  unmonitoredPct: number;
  totalCorridors: number;
  totalPhantomKm: number;
  totalFormalKm: number;
}

export interface DrawCorridorsResult {
  meta: CorridorMeta[];
  phantomLayerIds: string[];
  coverageStats: CoverageStats;
}

type RuntimeCorridorGeoJson = GeoJSON.FeatureCollection & {
  meta?: {
    geometry_status?: string;
    articles_fetched?: number;
    geolocated_hits?: number;
    contributing_sources?: number;
    total_sources?: number;
  };
};

export async function drawCorridors(ctx: MapboxDrawContext): Promise<DrawCorridorsResult> {
  const { map } = ctx;

  const [pairedRes, metaRes, formalRes, runtimeRes] = await Promise.all([
    fetch("/data/corridors_paired.geojson"),
    fetch("/data/corridors_meta.json"),
    fetch("/data/formal/all_formal_routes.geojson"),
    fetch("/api/corridors/runtime", { cache: "no-store" }),
  ]);

  if (!pairedRes.ok) {
    throw new Error(`Corridor fetch failed: ${pairedRes.status}`);
  }
  if (!metaRes.ok) {
    throw new Error(`Metadata fetch failed: ${metaRes.status}`);
  }

  const paired = await pairedRes.json();
  const baseMeta: CorridorMeta[] = await metaRes.json();
  const runtimeGeo: RuntimeCorridorGeoJson = runtimeRes.ok
    ? await runtimeRes.json()
    : { type: "FeatureCollection", features: [], meta: { geometry_status: "FETCH_FAILED" } };
  const runtimeFormalFeature = runtimeGeo.features.find((feature) =>
    feature.geometry?.type === "LineString" && feature.properties?.kind === "formal"
  ) as GeoJSON.Feature<GeoJSON.LineString> | undefined;
  const runtimeInformalFeature = runtimeGeo.features.find((feature) =>
    feature.geometry?.type === "LineString" && feature.properties?.kind === "informal"
  ) as GeoJSON.Feature<GeoJSON.LineString> | undefined;
  const meta: CorridorMeta[] = [
    ITURI_CORRIDOR_META,
    ...(runtimeInformalFeature ? [KOBOKO_ARUA_META] : []),
    ...baseMeta,
  ];
  console.log("[Mapbox] Paired GeoJSON loaded:", paired.features.length, "features");
  console.log(
    "[Mapbox] Runtime corridor:",
    runtimeGeo.meta?.geometry_status ?? "UNKNOWN",
    `articles=${runtimeGeo.meta?.articles_fetched ?? 0}`,
    `geolocated=${runtimeGeo.meta?.geolocated_hits ?? 0}`,
  );

  // ── Separate features by type ──
  const phantomLines: GeoJSON.Feature[] = [];
  const formalLinesOld: GeoJSON.Feature[] = [];
  const nodePoints: GeoJSON.Feature[] = [];

  for (const feature of paired.features) {
    const rt = feature.properties?.route_type;
    const gt = feature.geometry?.type;
    if (gt === "LineString" && rt === "PHANTOM") phantomLines.push(feature);
    else if (gt === "LineString" && rt === "FORMAL") formalLinesOld.push(feature);
    else if (gt === "Point") nodePoints.push(feature);
  }
  console.log("[Mapbox] Phantom lines:", phantomLines.length, "Formal lines:", formalLinesOld.length, "Nodes:", nodePoints.length);

  // ── 1. Phantom corridors (per-feature line-gradient) ──
  const phantomLayerIds: string[] = [];
  const dynamicPhantomLayerIds = phantomLines.flatMap((f, i) => {
    const cid = f.properties?.id ?? `phantom-${i}`;
    const lyrId = `phantom-line-${cid}`;
    return [`${lyrId}-halo`, lyrId];
  });
  const dynamicPhantomSourceIds = phantomLines.map((f, i) => {
    const cid = f.properties?.id ?? `phantom-${i}`;
    return `phantom-src-${cid}`;
  });
  const staticCorridorLayerIds = [
    "ituri-crisis-glow",
    ITURI_LAYER_ID,
    KOBOKO_ARUA_PHANTOM_HALO_LAYER_ID,
    KOBOKO_ARUA_PHANTOM_LAYER_ID,
    "phantom-corridor-labels",
    "formal-routes-halo",
    "formal-routes-line",
    "formal-route-labels",
    "corridor-nodes-circle",
    "corridor-nodes-labels",
    "formal-gates-circle",
    "iom-fmps-circle",
    "phantom-poes-circle",
    "phantom-poes-labels",
    "ituri-crisis-nodes-circle",
    "ituri-crisis-nodes-labels",
  ];
  const staticCorridorSourceIds = [
    "ituri-crisis-corridor",
    "koboko-arua-phantom",
    "phantom-labels",
    "formal-routes",
    "formal-labels",
    "corridor-nodes",
    "formal-gates",
    "iom-fmps",
    "phantom-poes",
    "ituri-crisis-nodes",
  ];

  [...staticCorridorLayerIds, ...dynamicPhantomLayerIds].reverse().forEach((layerId) => {
    removeLayerIfExists(map, layerId);
  });
  [...staticCorridorSourceIds, ...dynamicPhantomSourceIds].forEach((sourceId) => {
    removeSourceIfExists(map, sourceId);
  });

  for (let i = 0; i < phantomLines.length; i++) {
    const f = phantomLines[i];
    const cid = f.properties?.id ?? `phantom-${i}`;
    const srcId = `phantom-src-${cid}`;
    const lyrId = `phantom-line-${cid}`;

    map.addSource(srcId, {
      type: "geojson",
      data: f as GeoJSON.Feature,
      lineMetrics: true,
    });

    map.addLayer({
      id: `${lyrId}-halo`,
      type: "line",
      source: srcId,
      paint: {
        "line-color": PHANTOM_HALO,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4, 7,
          7, 11,
          10, 15,
        ],
        "line-opacity": 0.9,
        "line-blur": 2,
        "line-offset": -2,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });

    map.addLayer({
      id: lyrId,
      type: "line",
      source: srcId,
      paint: {
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4, 3.5,
          7, 5.5,
          10, 8,
        ],
        "line-opacity": 1,
        "line-gradient": PHANTOM_LINE_GRADIENT,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });

    phantomLayerIds.push(`${lyrId}-halo`, lyrId);
  }

  const ituriLineFeature: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    properties: {
      id: ITURI_CRISIS_CORRIDOR.id,
      name: `${ITURI_CRISIS_CORRIDOR.startNode} -> ${ITURI_CRISIS_CORRIDOR.endNode}`,
      route_type: "PHANTOM",
      risk_class: ITURI_CRISIS_CORRIDOR.riskClass,
      latent_state: "live_crisis",
      score: ITURI_CRISIS_CORRIDOR.score,
      distance_km: ITURI_CRISIS_CORRIDOR.totalKm,
      inferred_mode: ITURI_CRISIS_CORRIDOR.mode,
      gap_km: ITURI_CRISIS_CORRIDOR.totalKm,
      formal_poe_coverage: "gap",
      signal_count: ITURI_CRISIS_CORRIDOR.evidence.length,
      conflict_detour: ITURI_CRISIS_CORRIDOR.detour,
      description: ITURI_CRISIS_CORRIDOR.coverage,
    },
    geometry: {
      type: "LineString",
      coordinates: getIturiLineCoordinates(),
    },
  };

  map.addSource("ituri-crisis-corridor", {
    type: "geojson",
    data: ituriLineFeature,
    lineMetrics: true,
  });

  map.addLayer({
    id: "ituri-crisis-glow",
    type: "line",
    source: "ituri-crisis-corridor",
    paint: {
      "line-color": "#EF4444",
      "line-width": 13,
      "line-opacity": 0.32,
      "line-blur": 5,
      "line-offset": -2,
    },
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
  });

  map.addLayer({
    id: ITURI_LAYER_ID,
    type: "line",
    source: "ituri-crisis-corridor",
    paint: {
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4, 4.5,
        7, 6.5,
        10, 9,
      ],
      "line-opacity": 1,
      "line-gradient": PHANTOM_LINE_GRADIENT,
    },
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
  });

  phantomLayerIds.unshift("ituri-crisis-glow", ITURI_LAYER_ID);

  if (runtimeInformalFeature) {
    runtimeInformalFeature.properties = {
      ...runtimeInformalFeature.properties,
      id: KOBOKO_ARUA_ID,
      name: runtimeInformalFeature.properties?.label ?? KOBOKO_ARUA_META.name,
      route_type: "PHANTOM",
      risk_class: runtimeInformalFeature.properties?.risk_class ?? KOBOKO_ARUA_META.risk,
      inferred_mode: "runtime",
      formal_poe_coverage: "pending",
    };

    map.addSource("koboko-arua-phantom", {
      type: "geojson",
      data: runtimeInformalFeature,
      lineMetrics: true,
    });

    map.addLayer({
      id: KOBOKO_ARUA_PHANTOM_HALO_LAYER_ID,
      type: "line",
      source: "koboko-arua-phantom",
      paint: {
        "line-color": PHANTOM_HALO,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4, 8,
          7, 12,
          10, 16,
        ],
        "line-opacity": 0.95,
        "line-blur": 2,
        "line-offset": -2,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });

    map.addLayer({
      id: KOBOKO_ARUA_PHANTOM_LAYER_ID,
      type: "line",
      source: "koboko-arua-phantom",
      paint: {
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4, 4,
          7, 6,
          10, 8,
        ],
        "line-opacity": 1,
        "line-gradient": PHANTOM_LINE_GRADIENT,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });

    phantomLayerIds.unshift(KOBOKO_ARUA_PHANTOM_HALO_LAYER_ID, KOBOKO_ARUA_PHANTOM_LAYER_ID);
  }

  // Phantom corridor labels at midpoints
  const phantomLabelFeatures: GeoJSON.Feature[] = [
    ...(runtimeInformalFeature ? [{
      type: "Feature" as const,
      properties: {
        name: runtimeInformalFeature.properties?.label ?? KOBOKO_ARUA_META.name,
        risk_class: runtimeInformalFeature.properties?.status ?? "RUNTIME_INFERRED",
        score: runtimeInformalFeature.properties?.posterior ?? 0,
      },
      geometry: { type: "Point" as const, coordinates: [30.915, 3.245] },
    }] : []),
    {
      type: "Feature",
      properties: {
        name: ITURI_CRISIS_CORRIDOR.short,
        risk_class: ITURI_CRISIS_CORRIDOR.riskClass,
        score: ITURI_CRISIS_CORRIDOR.score,
      },
      geometry: { type: "Point", coordinates: [30.55, 1.95] },
    },
    ...phantomLines.map((f): GeoJSON.Feature<GeoJSON.Point> => {
    const coords = (f.geometry as GeoJSON.LineString).coordinates;
    const mid = coords[Math.floor(coords.length / 2)];
    return {
      type: "Feature" as const,
      properties: {
        name: f.properties?.name ?? "",
        risk_class: f.properties?.risk_class ?? "",
        score: f.properties?.score ?? 0,
      },
      geometry: { type: "Point" as const, coordinates: mid },
    };
    }),
  ];

  map.addSource("phantom-labels", {
    type: "geojson",
    data: { type: "FeatureCollection", features: phantomLabelFeatures },
  });

  map.addLayer({
    id: "phantom-corridor-labels",
    type: "symbol",
    source: "phantom-labels",
    layout: {
      "text-field": ["concat", ["get", "name"], "\n", ["get", "risk_class"], " · ", ["to-string", ["get", "score"]]],
      "text-font": ["Open Sans Bold"],
      "text-size": 10,
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": [
        "match", ["get", "risk_class"],
        "CRITICAL", RISK_COLORS.CRITICAL,
        "HIGH", RISK_COLORS.HIGH,
        "ELEVATED", RISK_COLORS.ELEVATED,
        "MODERATE", RISK_COLORS.MODERATE,
        "LOW", RISK_COLORS.LOW,
        "#9CA3AF",
      ],
      "text-halo-color": "#070A10",
      "text-halo-width": 2,
    },
  });

  // ── 2. Formal routes (road-snapped from Mapbox Directions API) ──
  let formalGeo: { features: GeoJSON.Feature[] } = { features: [] };
  try {
    if (formalRes.ok) {
      formalGeo = await formalRes.json();
      console.log("[Mapbox] Formal routes loaded:", formalGeo.features.length, "routes");
    } else {
      console.warn(`[Mapbox] Formal routes fetch failed: ${formalRes.status}`);
    }
  } catch (err) {
    console.warn("[Mapbox] Error loading formal routes:", err);
  }

  const kobokoAruaFormalFeature: GeoJSON.Feature<GeoJSON.LineString> = runtimeFormalFeature ?? {
    type: "Feature",
    properties: {
      id: KOBOKO_ARUA_ID,
      name: "Arua -> Koboko formal road",
      route_type: "FORMAL",
      phantom_id: KOBOKO_ARUA_ID,
      distance_km: KOBOKO_ARUA_KM,
      coverage_pct: 82,
    },
    geometry: {
      type: "LineString",
      coordinates: KOBOKO_ARUA_FORMAL_COORDS,
    },
  };
  formalGeo.features = [kobokoAruaFormalFeature, ...formalGeo.features];

  // Build metadata lookup from old formal features (paired file)
  const formalMetaMap = new Map<string, Record<string, unknown>>();
  for (const f of formalLinesOld) {
    const pid = f.properties?.phantom_id;
    if (pid) formalMetaMap.set(pid, f.properties ?? {});
  }

  // Enrich formal features with paired metadata
  for (const f of formalGeo.features) {
    const cid = f.properties?.id;
    const pairedMeta = formalMetaMap.get(cid);
    if (pairedMeta) {
      f.properties = { ...f.properties, ...pairedMeta };
    }
  }

  map.addSource("formal-routes", {
    type: "geojson",
    data: { type: "FeatureCollection", features: formalGeo.features },
  });

  map.addLayer({
    id: "formal-routes-halo",
    type: "line",
    source: "formal-routes",
    paint: {
      "line-color": FORMAL_HALO,
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4, 7,
        7, 11,
        10, 15,
      ],
      "line-opacity": 0.95,
      "line-blur": 1.5,
      "line-offset": 2,
    },
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
  });

  map.addLayer({
    id: "formal-routes-line",
    type: "line",
    source: "formal-routes",
    paint: {
      "line-color": FORMAL_BLUE,
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4, 3.5,
        7, 5.5,
        10, 8,
      ],
      "line-opacity": 0.98,
      "line-offset": 2,
    },
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
  });

  // Formal labels at midpoints
  const formalLabelFeatures: GeoJSON.Feature[] = formalGeo.features.map((f) => {
    const coords = (f.geometry as GeoJSON.LineString).coordinates;
    const mid = coords[Math.floor(coords.length / 2)];
    const distKm = f.properties?.distance_km ?? 0;
    const coverage = f.properties?.coverage_pct ?? 0;
    const label = coverage > 0
      ? `FORMAL · ${coverage}% · ${Math.round(distKm)} km`
      : `FORMAL · ${Math.round(distKm)} km`;
    return {
      type: "Feature",
      properties: { label, name: f.properties?.name ?? "" },
      geometry: { type: "Point", coordinates: mid },
    };
  });

  map.addSource("formal-labels", {
    type: "geojson",
    data: { type: "FeatureCollection", features: formalLabelFeatures },
  });

  map.addLayer({
    id: "formal-route-labels",
    type: "symbol",
    source: "formal-labels",
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Open Sans Bold"],
      "text-size": 9,
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": FORMAL_BLUE,
      "text-halo-color": "#070A10",
      "text-halo-width": 2,
    },
  });

  // ── 3. Point features (nodes, gates, FMPs, phantom POEs) ──
  const nodesByType: Record<string, GeoJSON.Feature[]> = {};
  for (const f of nodePoints) {
    const rt = f.properties?.route_type ?? "UNKNOWN";
    (nodesByType[rt] ??= []).push(f);
  }

  // Nodes (start/end/waypoint)
  if (nodesByType["NODE"]?.length) {
    map.addSource("corridor-nodes", {
      type: "geojson",
      data: { type: "FeatureCollection", features: nodesByType["NODE"] },
    });
    map.addLayer({
      id: "corridor-nodes-circle",
      type: "circle",
      source: "corridor-nodes",
      paint: {
        "circle-radius": [
          "match", ["get", "node_type"],
          "start", 6, "end", 6, "phantom", 8, "border", 4, 3,
        ],
        "circle-color": [
          "match", ["get", "node_type"],
          "start", "#22C55E", "end", "#EF4444", "phantom", "#F59E0B", "border", "#F97316", "#9CA3AF",
        ],
        "circle-stroke-color": "#070A10",
        "circle-stroke-width": 1,
      },
    });
    map.addLayer({
      id: "corridor-nodes-labels",
      type: "symbol",
      source: "corridor-nodes",
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Open Sans Regular"],
        "text-size": 9,
        "text-offset": [0, 1.2],
        "text-anchor": "top",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#D1D5DB",
        "text-halo-color": "#070A10",
        "text-halo-width": 1.5,
      },
    });
  }

  // Formal gates
  if (nodesByType["FORMAL_GATE"]?.length) {
    map.addSource("formal-gates", {
      type: "geojson",
      data: { type: "FeatureCollection", features: nodesByType["FORMAL_GATE"] },
    });
    map.addLayer({
      id: "formal-gates-circle",
      type: "circle",
      source: "formal-gates",
      paint: {
        "circle-radius": 6,
        "circle-color": FORMAL_BLUE,
        "circle-stroke-color": "rgba(59,130,246,0.3)",
        "circle-stroke-width": 3,
      },
    });
  }

  // IOM FMPs
  if (nodesByType["IOM_FMP"]?.length) {
    map.addSource("iom-fmps", {
      type: "geojson",
      data: { type: "FeatureCollection", features: nodesByType["IOM_FMP"] },
    });
    map.addLayer({
      id: "iom-fmps-circle",
      type: "circle",
      source: "iom-fmps",
      paint: {
        "circle-radius": 6,
        "circle-color": "#3DD9C4",
        "circle-stroke-color": "rgba(61,217,196,0.3)",
        "circle-stroke-width": 3,
      },
    });
  }

  // Phantom POEs
  if (nodesByType["PHANTOM_POE"]?.length) {
    map.addSource("phantom-poes", {
      type: "geojson",
      data: { type: "FeatureCollection", features: nodesByType["PHANTOM_POE"] },
    });
    map.addLayer({
      id: "phantom-poes-circle",
      type: "circle",
      source: "phantom-poes",
      paint: {
        "circle-radius": 7,
        "circle-color": "#FFD700",
        "circle-stroke-color": "#070A10",
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: "phantom-poes-labels",
      type: "symbol",
      source: "phantom-poes",
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Open Sans Bold"],
        "text-size": 9,
        "text-offset": [0, -1.5],
        "text-anchor": "bottom",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#FFD700",
        "text-halo-color": "#070A10",
        "text-halo-width": 1,
      },
    });
  }

  const ituriNodeFeatures: GeoJSON.Feature[] = ITURI_CRISIS_CORRIDOR.nodes.map((node) => ({
    type: "Feature",
    properties: {
      id: ITURI_CRISIS_CORRIDOR.id,
      corridor_id: ITURI_CRISIS_CORRIDOR.id,
      name: node.name,
      route_type: "ITURI_CRISIS_NODE",
      node_type: node.type,
      risk_class: node.type === "crossing" || node.type === "phantom" ? "CRITICAL" : "HIGH",
      km: node.km,
      cc: node.cc,
      prec: node.prec,
    },
    geometry: {
      type: "Point",
      coordinates: [node.lng, node.lat],
    },
  }));

  map.addSource("ituri-crisis-nodes", {
    type: "geojson",
    data: { type: "FeatureCollection", features: ituriNodeFeatures },
  });

  map.addLayer({
    id: "ituri-crisis-nodes-circle",
    type: "circle",
    source: "ituri-crisis-nodes",
    paint: {
      "circle-radius": [
        "match",
        ["get", "node_type"],
        "crossing",
        9,
        "phantom",
        8,
        "border",
        7,
        6,
      ],
      "circle-color": [
        "match",
        ["get", "node_type"],
        "crossing",
        "#FDE047",
        "phantom",
        "#EF4444",
        "border",
        "#F97316",
        "#22C55E",
      ],
      "circle-stroke-color": "#070A10",
      "circle-stroke-width": 2,
    },
  });

  map.addLayer({
    id: "ituri-crisis-nodes-labels",
    type: "symbol",
    source: "ituri-crisis-nodes",
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Open Sans Bold"],
      "text-size": 10,
      "text-offset": [0, -1.5],
      "text-anchor": "bottom",
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#FDE047",
      "text-halo-color": "#070A10",
      "text-halo-width": 1.5,
    },
  });

  // ── Compute real coverage stats ──
  let totalPhantomKm = ITURI_CRISIS_CORRIDOR.totalKm + KOBOKO_ARUA_KM;
  let weightedCoverage = 0;
  let totalFormalKm = 0;

  for (const f of phantomLines) {
    const km = Number(f.properties?.distance_km) || 0;
    totalPhantomKm += km;
  }

  for (const f of formalGeo.features) {
    const km = Number(f.properties?.distance_km) || 0;
    const cov = Number(f.properties?.coverage_pct) || 0;
    totalFormalKm += km;
    weightedCoverage += km * cov;
  }

  const monitoredPct = totalFormalKm > 0
    ? Math.round((weightedCoverage / totalFormalKm) * 10) / 10
    : 0;
  const unmonitoredPct = Math.round((100 - monitoredPct) * 10) / 10;

  const coverageStats: CoverageStats = {
    monitoredPct,
    unmonitoredPct,
    totalCorridors: phantomLines.length + 2,
    totalPhantomKm: Math.round(totalPhantomKm),
    totalFormalKm: Math.round(totalFormalKm),
  };

  setCorridorLayerIds(phantomLayerIds);
  return { meta, phantomLayerIds, coverageStats };
}

// Dynamic layer IDs populated at draw time
export let CORRIDOR_LAYER_IDS: string[] = [];

export function setCorridorLayerIds(phantomIds: string[]) {
  CORRIDOR_LAYER_IDS = [
    ...phantomIds,
    "phantom-corridor-labels",
    "formal-routes-halo",
    "formal-routes-line",
    "formal-route-labels",
    "corridor-nodes-circle",
    "corridor-nodes-labels",
    "formal-gates-circle",
    "iom-fmps-circle",
    "phantom-poes-circle",
    "phantom-poes-labels",
    "ituri-crisis-nodes-circle",
    "ituri-crisis-nodes-labels",
  ];
}

export const BORDER_LAYER_IDS = ["admin-borders-line"];

export const LABEL_LAYER_IDS = [
  "geo-country-labels",
  "geo-admin1-labels",
  "geo-city-dots",
  "geo-city-labels",
];
