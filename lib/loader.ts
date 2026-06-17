// ─────────────────────────────────────────────────────────────────
// PHANTOM POE ENGINE — Nigeria CDC Disease Data Loader
// MoStar Industries · Phantom POE · Nigeria CDC Integration
// ─────────────────────────────────────────────────────────────────

import type { ChoroplethProperties, SurveillanceProperties, DiseaseSummary, DiseaseType } from './types';

const BASE = '/data/disease/lassa';

// ── In-memory cache — load once per session ───────────────────────
let _choropleth: GeoJSON.FeatureCollection<GeoJSON.Polygon, ChoroplethProperties> | null = null;
let _positives: GeoJSON.FeatureCollection<GeoJSON.Point, SurveillanceProperties> | null = null;
let _surveillance: GeoJSON.FeatureCollection<GeoJSON.Point, SurveillanceProperties> | null = null;

async function fetchGeoJSON<G extends GeoJSON.Geometry, P>(path: string) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`[DiseaseLoader] Failed to fetch ${path}: ${res.status}`);
  return res.json() as Promise<GeoJSON.FeatureCollection<G, P>>;
}

export async function loadChoropleth() {
  if (!_choropleth) {
    _choropleth = await fetchGeoJSON<GeoJSON.Polygon, ChoroplethProperties>(
      `${BASE}/historical_choropleth.geojson`
    );
  }
  return _choropleth;
}

export async function loadPositiveCases() {
  if (!_positives) {
    _positives = await fetchGeoJSON<GeoJSON.Point, SurveillanceProperties>(
      `${BASE}/positive_cases.geojson`
    );
  }
  return _positives;
}

export async function loadSurveillanceAggregates() {
  if (!_surveillance) {
    _surveillance = await fetchGeoJSON<GeoJSON.Point, SurveillanceProperties>(
      `${BASE}/surveillance_aggregates.geojson`
    );
  }
  return _surveillance;
}

// ── Pre-load all layers in parallel ──────────────────────────────
export async function loadAllDiseaseLayers() {
  const [choropleth, positives, surveillance] = await Promise.all([
    loadChoropleth(),
    loadPositiveCases(),
    loadSurveillanceAggregates(),
  ]);
  return { choropleth, positives, surveillance };
}

// ── Compute summary stats for HUD ─────────────────────────────────
export async function getDiseaseSummary(disease: DiseaseType): Promise<DiseaseSummary> {
  const choropleth = await loadChoropleth();

  const features = disease === 'ALL'
    ? choropleth.features
    : choropleth.features.filter(f => f.properties.disease === disease);

  const cases_total = features.reduce((s, f) => s + f.properties.cases_total, 0);
  const confirmed = features.reduce((s, f) => s + f.properties.confirmed_cases, 0);
  const deaths = features.reduce((s, f) => s + f.properties.deaths, 0);
  const cfr_mean = cases_total > 0 ? (deaths / cases_total) * 100 : 0;

  const top_lgas = [...features]
    .sort((a, b) => b.properties.case_density_rank - a.properties.case_density_rank)
    .slice(0, 5)
    .map(f => ({
      state: f.properties.state,
      lga: f.properties.lga,
      cases: f.properties.cases_total,
      rank: f.properties.case_density_rank,
    }));

  const dates = features
    .flatMap(f => [f.properties.first_reported_at, f.properties.latest_reported_at])
    .filter(Boolean)
    .sort();

  return {
    disease,
    lgas_affected: features.length,
    cases_total,
    confirmed_cases: confirmed,
    deaths,
    cfr_mean: parseFloat(cfr_mean.toFixed(2)),
    top_lgas,
    date_range: {
      first: dates[0] ?? '',
      latest: dates[dates.length - 1] ?? '',
    },
  };
}

// ── Filter surveillance points by epi year range ──────────────────
export async function getTemporalSlice(
  disease: DiseaseType,
  yearFrom: number,
  yearTo: number
) {
  const surveillance = await loadSurveillanceAggregates();
  return {
    ...surveillance,
    features: surveillance.features.filter(f => {
      const matchDisease = disease === 'ALL' || f.properties.disease === disease;
      const matchYear = f.properties.epi_year >= yearFrom && f.properties.epi_year <= yearTo;
      return matchDisease && matchYear;
    }),
  };
}
