// ─────────────────────────────────────────────────────────────────
// PHANTOM POE ENGINE — Nigeria CDC Disease Layer Manager (Mapbox)
// MoStar Industries · Phantom POE · Nigeria CDC Integration
//
// Manages: choropleth fill, outline, point signals
// Paint field: case_density_rank (0–1 normalized)
// Toggle: per-disease filter expression
// ─────────────────────────────────────────────────────────────────

import type mapboxgl from 'mapbox-gl';
import type { DiseaseType, LayerMode } from './types';
import { loadChoropleth, loadPositiveCases } from './loader';

// ── Source + Layer IDs ────────────────────────────────────────────
const SRC_CHORO  = 'ngcdc-choropleth';
const SRC_POINTS = 'ngcdc-positive-points';

const LYR_FILL    = 'ngcdc-choro-fill';
const LYR_OUTLINE = 'ngcdc-choro-outline';
const LYR_POINTS  = 'ngcdc-points-circle';
const LYR_LABELS  = 'ngcdc-points-label';

// ── Color ramps per disease ───────────────────────────────────────
const RAMPS: Record<DiseaseType, string[]> = {
  'LASSA':           ['#fff7ec', '#fee8c8', '#fdd49e', '#fdbb84', '#fc8d59', '#ef6548', '#d7301f', '#990000'],
  'CHOLERA':         ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594'],
  'MENINGITIS (CSM)':['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#005a32'],
  'ALL':             ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#800026'],
};

function buildColorExpression(disease: DiseaseType): mapboxgl.Expression {
  const stops = RAMPS[disease];
  return [
    'interpolate', ['linear'],
    ['get', 'case_density_rank'],
    0,    stops[0],
    0.14, stops[1],
    0.28, stops[2],
    0.43, stops[3],
    0.57, stops[4],
    0.71, stops[5],
    0.86, stops[6],
    1.0,  stops[7],
  ] as mapboxgl.Expression;
}

function diseaseFilter(disease: DiseaseType): mapboxgl.Expression {
  if (disease === 'ALL') return ['has', 'disease'] as mapboxgl.Expression;
  return ['==', ['get', 'disease'], disease] as mapboxgl.Expression;
}

// ── Init: add sources + layers ────────────────────────────────────
export async function initDiseaseLayer(
  map: mapboxgl.Map,
  initialDisease: DiseaseType = 'LASSA',
  mode: LayerMode = 'both'
) {
  const [choropleth, positives] = await Promise.all([
    loadChoropleth(),
    loadPositiveCases(),
  ]);

  // ── Choropleth source ─────────────────────────────────────────
  if (!map.getSource(SRC_CHORO)) {
    map.addSource(SRC_CHORO, {
      type: 'geojson',
      data: choropleth as GeoJSON.FeatureCollection,
    });
  }

  // ── Point source ──────────────────────────────────────────────
  if (!map.getSource(SRC_POINTS)) {
    map.addSource(SRC_POINTS, {
      type: 'geojson',
      data: positives as GeoJSON.FeatureCollection,
    });
  }

  // ── Choropleth fill ───────────────────────────────────────────
  if (!map.getLayer(LYR_FILL)) {
    map.addLayer({
      id: LYR_FILL,
      type: 'fill',
      source: SRC_CHORO,
      filter: diseaseFilter(initialDisease),
      paint: {
        'fill-color': buildColorExpression(initialDisease),
        'fill-opacity': [
          'interpolate', ['linear'], ['get', 'case_density_rank'],
          0, 0.25,
          1, 0.82,
        ],
      },
      layout: { visibility: mode !== 'points' ? 'visible' : 'none' },
    });
  }

  // ── Choropleth outline ────────────────────────────────────────
  if (!map.getLayer(LYR_OUTLINE)) {
    map.addLayer({
      id: LYR_OUTLINE,
      type: 'line',
      source: SRC_CHORO,
      filter: diseaseFilter(initialDisease),
      paint: {
        'line-color': '#ffffff',
        'line-width': 0.6,
        'line-opacity': 0.45,
      },
      layout: { visibility: mode !== 'points' ? 'visible' : 'none' },
    });
  }

  // ── Point circles ─────────────────────────────────────────────
  if (!map.getLayer(LYR_POINTS)) {
    map.addLayer({
      id: LYR_POINTS,
      type: 'circle',
      source: SRC_POINTS,
      filter: diseaseFilter(initialDisease),
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['get', 'cases_total'],
          1,  3,
          50, 7,
          200, 12,
          500, 18,
        ],
        'circle-color': buildColorExpression(initialDisease),
        'circle-opacity': 0.85,
        'circle-stroke-width': 1.2,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 0.6,
      },
      layout: { visibility: mode !== 'choropleth' ? 'visible' : 'none' },
    });
  }

  // ── Point label (LGA name, only at zoom > 7) ──────────────────
  if (!map.getLayer(LYR_LABELS)) {
    map.addLayer({
      id: LYR_LABELS,
      type: 'symbol',
      source: SRC_POINTS,
      filter: diseaseFilter(initialDisease),
      minzoom: 7,
      layout: {
        'text-field': ['get', 'lga'],
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-size': 10,
        'text-offset': [0, 1.4],
        'text-anchor': 'top',
        'text-allow-overlap': false,
        visibility: mode !== 'choropleth' ? 'visible' : 'none',
      },
      paint: {
        'text-color': '#f0f0f0',
        'text-halo-color': '#1a1a2e',
        'text-halo-width': 1.5,
      },
    });
  }
}

// ── Switch active disease ─────────────────────────────────────────
export function setActiveDisease(map: mapboxgl.Map, disease: DiseaseType) {
  const filter = diseaseFilter(disease);
  const color  = buildColorExpression(disease);

  if (map.getLayer(LYR_FILL)) {
    map.setFilter(LYR_FILL, filter);
    map.setPaintProperty(LYR_FILL, 'fill-color', color);
  }
  if (map.getLayer(LYR_OUTLINE)) {
    map.setFilter(LYR_OUTLINE, filter);
  }
  if (map.getLayer(LYR_POINTS)) {
    map.setFilter(LYR_POINTS, filter);
    map.setPaintProperty(LYR_POINTS, 'circle-color', color);
  }
  if (map.getLayer(LYR_LABELS)) {
    map.setFilter(LYR_LABELS, filter);
  }
}

// ── Switch layer mode ─────────────────────────────────────────────
export function setLayerMode(map: mapboxgl.Map, mode: LayerMode) {
  const showChoro  = mode !== 'points'  ? 'visible' : 'none';
  const showPoints = mode !== 'choropleth' ? 'visible' : 'none';

  if (map.getLayer(LYR_FILL))    map.setLayoutProperty(LYR_FILL,    'visibility', showChoro);
  if (map.getLayer(LYR_OUTLINE)) map.setLayoutProperty(LYR_OUTLINE, 'visibility', showChoro);
  if (map.getLayer(LYR_POINTS))  map.setLayoutProperty(LYR_POINTS,  'visibility', showPoints);
  if (map.getLayer(LYR_LABELS))  map.setLayoutProperty(LYR_LABELS,  'visibility', showPoints);
}

// ── Update temporal slice (re-ingest filtered data) ───────────────
export function updateTemporalData(
  map: mapboxgl.Map,
  filteredData: GeoJSON.FeatureCollection
) {
  const src = map.getSource(SRC_POINTS) as mapboxgl.GeoJSONSource | undefined;
  if (src) src.setData(filteredData);
}

// ── Teardown ──────────────────────────────────────────────────────
export function removeDiseaseLayer(map: mapboxgl.Map) {
  [LYR_LABELS, LYR_POINTS, LYR_OUTLINE, LYR_FILL].forEach(id => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  [SRC_CHORO, SRC_POINTS].forEach(id => {
    if (map.getSource(id)) map.removeSource(id);
  });
}

// ── Popup content builder ─────────────────────────────────────────
export function buildChoroplethPopup(props: Record<string, unknown>): string {
  const cfr = props.deaths && props.cases_total
    ? ((Number(props.deaths) / Number(props.cases_total)) * 100).toFixed(1)
    : '—';
  return `
    <div style="font-family:monospace;font-size:12px;line-height:1.6;min-width:180px">
      <div style="font-weight:700;font-size:13px;margin-bottom:4px">
        ${props.lga}, ${props.state}
      </div>
      <div style="color:#f03b20;font-weight:600">${props.disease}</div>
      <hr style="border-color:#333;margin:4px 0"/>
      <div>Cases: <b>${props.cases_total}</b></div>
      <div>Confirmed: <b>${props.confirmed_cases}</b></div>
      <div>Deaths: <b>${props.deaths}</b> · CFR: <b>${cfr}%</b></div>
      <div>Density rank: <b>${(Number(props.case_density_rank) * 100).toFixed(1)}th pct</b></div>
      <div style="color:#888;font-size:10px;margin-top:4px">${props.source}</div>
    </div>
  `;
}
