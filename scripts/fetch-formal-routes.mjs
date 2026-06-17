/**
 * MoStar Phantom XO — Formal Route Fetcher & Deviation Analyzer
 * 
 * Reads all 17 phantom corridors from corridors_paired.geojson,
 * fetches the official Mapbox driving route for each,
 * saves individual GeoJSON files, and computes deviation metrics.
 *
 * Usage:  node scripts/fetch-formal-routes.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA = resolve(ROOT, "public", "data");

// ── Config ──────────────────────────────────────────────────────────
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN ?? process.env.VITE_MAPBOX_TOKEN;

if (!MAPBOX_TOKEN) {
  throw new Error("Missing MAPBOX_TOKEN or VITE_MAPBOX_TOKEN");
}

const PROFILES = ["driving", "walking"]; // fallback order
const DELAY_MS = 500; // polite delay between API calls

// ── Output dirs ─────────────────────────────────────────────────────
const DIRS = {
  phantom: resolve(DATA, "phantom"),
  formal: resolve(DATA, "formal"),
  deviation: resolve(DATA, "deviation"),
};

for (const d of Object.values(DIRS)) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

// ── Haversine helper (km) ───────────────────────────────────────────
function haversineKm([lon1, lat1], [lon2, lat2]) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Nearest point on a polyline (returns distance in km) ────────────
function nearestDistToLine(pt, lineCoords) {
  let minDist = Infinity;
  for (let i = 0; i < lineCoords.length - 1; i++) {
    const dist = pointToSegmentDist(pt, lineCoords[i], lineCoords[i + 1]);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

function pointToSegmentDist(p, a, b) {
  // project p onto segment a→b, clamp, return haversine distance
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return haversineKm(p, a);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const proj = [a[0] + t * dx, a[1] + t * dy];
  return haversineKm(p, proj);
}

// ── Polyline total length (km) ──────────────────────────────────────
function polylineLength(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineKm(coords[i - 1], coords[i]);
  }
  return total;
}

// ── Fetch formal route from Mapbox ──────────────────────────────────
async function fetchFormalRoute(startCoord, endCoord, corridorId) {
  for (const profile of PROFILES) {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/${profile}/` +
      `${startCoord[0]},${startCoord[1]};${endCoord[0]},${endCoord[1]}` +
      `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

    const res = await fetch(url);
    const json = await res.json();

    if (json.code === "Ok" && json.routes && json.routes.length > 0) {
      const route = json.routes[0];
      return {
        profile,
        distance_km: route.distance / 1000,
        duration_min: route.duration / 60,
        geometry: route.geometry,
        legs: route.legs,
      };
    }
    console.warn(
      `  ⚠ ${profile} returned ${json.code || "error"} for ${corridorId}, trying next profile…`
    );
  }
  return null;
}

// ── Compute deviation metrics ───────────────────────────────────────
function computeDeviation(phantomCoords, formalCoords) {
  const deviations = phantomCoords.map((pt) => ({
    coord: pt,
    dist_km: nearestDistToLine(pt, formalCoords),
  }));

  const distances = deviations.map((d) => d.dist_km);
  const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
  const max = Math.max(...distances);
  const median = [...distances].sort((a, b) => a - b)[Math.floor(distances.length / 2)];

  const pct_gt_500m = distances.filter((d) => d > 0.5).length / distances.length;
  const pct_gt_1km = distances.filter((d) => d > 1).length / distances.length;
  const pct_gt_5km = distances.filter((d) => d > 5).length / distances.length;
  const pct_gt_10km = distances.filter((d) => d > 10).length / distances.length;

  // Build deviation segments (where phantom is >500m from formal)
  const deviationSegments = [];
  let currentSegment = null;

  for (const d of deviations) {
    if (d.dist_km > 0.5) {
      if (!currentSegment) currentSegment = [];
      currentSegment.push(d.coord);
    } else {
      if (currentSegment && currentSegment.length >= 2) {
        deviationSegments.push(currentSegment);
      }
      currentSegment = null;
    }
  }
  if (currentSegment && currentSegment.length >= 2) {
    deviationSegments.push(currentSegment);
  }

  // Deviation length (km of phantom that is >500m from formal)
  let deviationLengthKm = 0;
  for (const seg of deviationSegments) {
    deviationLengthKm += polylineLength(seg);
  }

  return {
    mean_km: Math.round(mean * 1000) / 1000,
    median_km: Math.round(median * 1000) / 1000,
    max_km: Math.round(max * 1000) / 1000,
    pct_gt_500m: Math.round(pct_gt_500m * 1000) / 10,
    pct_gt_1km: Math.round(pct_gt_1km * 1000) / 10,
    pct_gt_5km: Math.round(pct_gt_5km * 1000) / 10,
    pct_gt_10km: Math.round(pct_gt_10km * 1000) / 10,
    deviation_length_km: Math.round(deviationLengthKm * 100) / 100,
    total_vertices: phantomCoords.length,
    segments: deviationSegments,
    per_vertex: deviations.map((d) => ({
      lon: d.coord[0],
      lat: d.coord[1],
      deviation_km: Math.round(d.dist_km * 1000) / 1000,
    })),
  };
}

// ── GeoJSON helpers ─────────────────────────────────────────────────
function featureLineString(coords, properties) {
  return {
    type: "Feature",
    properties,
    geometry: { type: "LineString", coordinates: coords },
  };
}

function featureCollection(features, metadata = {}) {
  return { type: "FeatureCollection", metadata, features };
}

function save(filepath, data) {
  writeFileSync(filepath, JSON.stringify(data, null, 2), "utf8");
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  MoStar Phantom XO — Formal Route Pipeline");
  console.log("═══════════════════════════════════════════════════\n");

  // Load paired data
  const paired = JSON.parse(
    readFileSync(resolve(DATA, "corridors_paired.geojson"), "utf8")
  );
  const phantoms = paired.features.filter(
    (f) => f.properties.route_type === "PHANTOM"
  );

  console.log(`Found ${phantoms.length} phantom corridors.\n`);

  const summaryRows = [];
  const allFormalFeatures = [];
  const allDeviationFeatures = [];

  for (let i = 0; i < phantoms.length; i++) {
    const phantom = phantoms[i];
    const id = phantom.properties.id;
    const name = phantom.properties.name;
    const coords = phantom.geometry.coordinates;
    const startCoord = coords[0];
    const endCoord = coords[coords.length - 1];

    console.log(
      `[${i + 1}/${phantoms.length}] ${id} — ${name}`
    );
    console.log(
      `  Start: [${startCoord}]  End: [${endCoord}]  Vertices: ${coords.length}`
    );

    // Save phantom route
    const phantomFile = resolve(DIRS.phantom, `phantom_${id}.geojson`);
    save(phantomFile, featureLineString(coords, {
      id,
      name,
      route_type: "PHANTOM",
      risk_class: phantom.properties.risk_class,
      distance_km: phantom.properties.distance_km,
      inferred_mode: phantom.properties.inferred_mode,
    }));
    console.log(`  ✓ Saved phantom_${id}.geojson`);

    // Fetch formal route
    const formal = await fetchFormalRoute(startCoord, endCoord, id);

    if (!formal) {
      console.log(`  ✗ No formal route found (all profiles failed)\n`);
      summaryRows.push({
        id,
        name,
        status: "NO_ROUTE",
        phantom_km: phantom.properties.distance_km,
        formal_km: null,
        profile: null,
        deviation_mean_km: null,
        deviation_max_km: null,
      });
      continue;
    }

    const formalCoords = formal.geometry.coordinates;
    console.log(
      `  ✓ Formal route (${formal.profile}): ${formal.distance_km.toFixed(1)} km, ` +
      `${formal.duration_min.toFixed(0)} min, ${formalCoords.length} vertices`
    );

    // Save formal route
    const formalProps = {
      id,
      name: name.replace("→", "→ [FORMAL]"),
      route_type: "FORMAL",
      profile: formal.profile,
      distance_km: Math.round(formal.distance_km * 100) / 100,
      duration_min: Math.round(formal.duration_min * 10) / 10,
      color: "#3B82F6",
      line_style: "solid",
      line_width: 3,
    };

    const formalFile = resolve(DIRS.formal, `formal_${id}.geojson`);
    save(formalFile, featureLineString(formalCoords, formalProps));
    console.log(`  ✓ Saved formal_${id}.geojson`);

    allFormalFeatures.push(featureLineString(formalCoords, formalProps));

    // Compute deviation
    const dev = computeDeviation(coords, formalCoords);
    console.log(
      `  📊 Deviation: mean=${dev.mean_km}km, max=${dev.max_km}km, ` +
      `>500m=${dev.pct_gt_500m}%, >1km=${dev.pct_gt_1km}%, >5km=${dev.pct_gt_5km}%`
    );

    // Save deviation GeoJSON (segments where phantom diverges >500m)
    const devFeatures = dev.segments.map((seg, si) =>
      featureLineString(seg, {
        id,
        name,
        segment_index: si,
        type: "DEVIATION",
        color: "#EF4444",
        line_width: 3,
      })
    );

    const devFile = resolve(DIRS.deviation, `deviation_${id}.geojson`);
    save(
      devFile,
      featureCollection(devFeatures, {
        corridor_id: id,
        corridor_name: name,
        mean_deviation_km: dev.mean_km,
        median_deviation_km: dev.median_km,
        max_deviation_km: dev.max_km,
        pct_gt_500m: dev.pct_gt_500m,
        pct_gt_1km: dev.pct_gt_1km,
        pct_gt_5km: dev.pct_gt_5km,
        pct_gt_10km: dev.pct_gt_10km,
        deviation_length_km: dev.deviation_length_km,
        phantom_length_km: phantom.properties.distance_km,
        formal_length_km: Math.round(formal.distance_km * 100) / 100,
      })
    );
    console.log(`  ✓ Saved deviation_${id}.geojson (${devFeatures.length} segments)\n`);

    allDeviationFeatures.push(...devFeatures);

    summaryRows.push({
      id,
      name,
      status: "OK",
      profile: formal.profile,
      phantom_km: phantom.properties.distance_km,
      formal_km: Math.round(formal.distance_km * 100) / 100,
      deviation_mean_km: dev.mean_km,
      deviation_max_km: dev.max_km,
      deviation_pct_gt_1km: dev.pct_gt_1km,
      deviation_length_km: dev.deviation_length_km,
    });

    // Polite delay
    if (i < phantoms.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  // ── Combined formal routes file ─────────────────────────────────
  save(
    resolve(DATA, "formal", "all_formal_routes.geojson"),
    featureCollection(allFormalFeatures, {
      title: "All 17 Formal (Official) Routes",
      generated: new Date().toISOString(),
    })
  );

  // ── Combined deviation file ─────────────────────────────────────
  save(
    resolve(DATA, "deviation", "all_deviations.geojson"),
    featureCollection(allDeviationFeatures, {
      title: "All Deviation Segments (>500m from formal route)",
      generated: new Date().toISOString(),
    })
  );

  // ── Summary report ──────────────────────────────────────────────
  const summaryFile = resolve(DATA, "route_comparison_summary.json");
  save(summaryFile, {
    generated: new Date().toISOString(),
    total_corridors: phantoms.length,
    routes_found: summaryRows.filter((r) => r.status === "OK").length,
    routes_failed: summaryRows.filter((r) => r.status === "NO_ROUTE").length,
    corridors: summaryRows,
  });

  // Print summary table
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════\n");
  console.log(
    "ID          | Name                         | Status   | Phantom km | Formal km | Dev Mean | Dev Max"
  );
  console.log(
    "------------|------------------------------|----------|------------|-----------|----------|--------"
  );
  for (const r of summaryRows) {
    console.log(
      `${(r.id || "").padEnd(12)}| ${(r.name || "").padEnd(29)}| ${(r.status || "").padEnd(9)}| ${String(r.phantom_km ?? "—").padEnd(11)}| ${String(r.formal_km ?? "—").padEnd(10)}| ${String(r.deviation_mean_km ?? "—").padEnd(9)}| ${r.deviation_max_km ?? "—"}`
    );
  }

  console.log(`\n✅ Done. Files saved to:`);
  console.log(`   ${DIRS.phantom}`);
  console.log(`   ${DIRS.formal}`);
  console.log(`   ${DIRS.deviation}`);
  console.log(`   ${summaryFile}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
