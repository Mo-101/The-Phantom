// ─────────────────────────────────────────────────────────────────
// PHANTOM POE ENGINE — Nigeria CDC Disease Layer Types
// MoStar Industries · Phantom POE · Nigeria CDC Integration
// ─────────────────────────────────────────────────────────────────

export type DiseaseType = 'LASSA' | 'CHOLERA' | 'MENINGITIS (CSM)' | 'ALL';

export type LayerMode = 'choropleth' | 'points' | 'both';

// ── Choropleth feature (historical_choropleth.geojson) ────────────
export interface ChoroplethProperties {
  area_id: string;
  state: string;
  lga: string;
  disease: DiseaseType;
  disease_mix: Record<string, number>;
  cases_total: number;
  confirmed_cases: number;
  suspected_cases: number;
  positive_results: number;
  deaths: number;
  weeks_observed: number;
  first_reported_at: string;
  latest_reported_at: string;
  case_density_rank: number; // 0–1 normalized — PRIMARY PAINT FIELD
  source: string;
  source_granularity: string;
}

// ── Surveillance point feature (positive_cases / surveillance_aggregates) ──
export interface SurveillanceProperties {
  aggregate_id: string;
  disease: DiseaseType;
  result_class: 'positive' | 'suspected' | 'negative';
  state: string;
  lga: string;
  ward: string;
  epi_week: number;
  epi_year: number;
  cases_total: number;
  confirmed_cases: number;
  suspected_cases: number;
  positive_results: number;
  negative_results: number;
  deaths: number;
  samples_taken: number;
  cfr: number;
  positivity_rate: number;
  mean_age: number | null;
  first_reported_at: string;
  latest_reported_at: string;
  source: string;
  source_granularity: string;
  data_quality_score: number;
}

// ── Layer state passed to map ─────────────────────────────────────
export interface DiseaseLayerState {
  activeDisease: DiseaseType;
  mode: LayerMode;
  showPoints: boolean;
  showChoropleth: boolean;
  temporalRange: [string, string] | null; // ISO date strings
  loaded: boolean;
  error: string | null;
}

// ── Summary stats for the HUD panel ──────────────────────────────
export interface DiseaseSummary {
  disease: DiseaseType;
  lgas_affected: number;
  cases_total: number;
  confirmed_cases: number;
  deaths: number;
  cfr_mean: number;
  top_lgas: Array<{ state: string; lga: string; cases: number; rank: number }>;
  date_range: { first: string; latest: string };
}
