/**
 * MoStar Phantom XO — Neon Database Types
 * moscript://codex/v1
 * sass: "Types that map truth, not decoration."
 *
 * Lean row types for all tables in the Neon database.
 * Replaces the auto-generated Supabase types.ts (3100 lines → lean).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = "admin" | "analyst" | "viewer";

// ── Core Tables ─────────────────────────────────────────────────────

export interface DataLane {
  id: string;
  lane: string;
  label: string;
  badge_color: string;
  is_active: boolean;
  description: string | null;
  created_at: string;
}

export interface PoeCorridorRow {
  id: string;
  lane_id: string;
  start_node: string;
  end_node: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  start_country: string;
  end_country: string;
  score: number;
  risk_class: string;
  activated: boolean;
  phantom_poe_activated: boolean;
  distance_km: number | null;
  gap_km: number | null;
  evidence_count: number;
  signal_count: number;
  first_detected: string;
  last_updated: string;
  latent_state: string | null;
  previous_score: number | null;
  score_delta: number | null;
  inferred_mode: string | null;
  inferred_velocity_kmh: number | null;
  inferred_path_json: string | null;
  conflict_detour: boolean;
  requires_canoe: boolean;
  formal_poe_coverage: string | null;
}

export interface PoeDetectionEvent {
  id: string;
  lane_id: string;
  corridor_id: string | null;
  event_type: string;
  severity: string;
  summary: string;
  route_name: string | null;
  score: number | null;
  score_delta: number | null;
  source_count: number | null;
  click_action: string | null;
  acknowledged: boolean;
  created_at: string;
}

export interface PoeDivergence {
  id: string;
  corridor_id: string;
  lane_id: string;
  divergence_ratio: number;
  formal_distance_km: number | null;
  phantom_distance_km: number | null;
  trend: string | null;
  computed_at: string;
}

export interface PoeEntropy {
  id: string;
  lane_id: string;
  node_id: string;
  h_baseline: number;
  h_current: number;
  delta_h: number;
  risk_class: string;
  spiked: boolean;
  signal_count: number;
  computed_at: string;
}

export interface PoeEvidence {
  id: string;
  corridor_id: string;
  lane_id: string;
  evidence_type: string;
  source: string;
  confidence: number;
  weight: number;
  description: string | null;
  timestamp: string;
  synthetic: boolean;
  node_ids_json: string | null;
}

export interface PoeSignal {
  id: string;
  lane_id: string;
  source: string;
  type: string;
  country: string;
  admin1: string | null;
  location: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  truth_score: number;
  passed_truth_filter: boolean;
  timestamp: string;
  ingested_at: string;
  disease: string | null;
  element: string | null;
  raw_source_id: string | null;
}

export interface PoeTemporal {
  id: string;
  corridor_id: string;
  lane_id: string;
  bucket_date: string;
  signal_count: number;
  dominant_type: string | null;
  avg_magnitude: number | null;
  avg_truth_score: number | null;
  activity_status: string | null;
  divergence_ratio: number | null;
  estimated_daily_crossings: number | null;
  formal_poe_crossings: number | null;
  informal_crossings: number | null;
}

export interface PoeTerrain {
  id: string;
  corridor_id: string;
  lane_id: string;
  best_mode: string;
  best_friction: number | null;
  avg_slope_deg: number | null;
  primary_land_cover: string;
  has_river_crossing: boolean;
  river_width_m: number | null;
  requires_canoe: boolean;
  seasonal_phase: string | null;
  computed_at: string;
}

export interface PoeDeviation {
  corridor_id: string;
  phantom_distance_km: number | null;
  formal_distance_km: number | null;
  shortcut_ratio: number | null;
  route_efficiency: number | null;
  deviation_mean_km: number;
  deviation_max_km: number;
  deviation_pct_gt_1km: number;
  deviation_pct_gt_5km: number;
  invisibility_index: number;
  signals_in_high_dev_zone: number;
  signal_deviation_correlation: number;
  deviation_segment_count: number;
  vertex_deviations_json?: string | null;
}

// ── Supporting Tables ───────────────────────────────────────────────

export interface CorridorDefinition {
  id: string;
  start_node: string;
  end_node: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  region: string;
  active: boolean;
  created_at: string;
}

export interface CorridorEvidenceChain {
  id: string;
  corridor_def_id: string;
  day_offset: number;
  evidence_id: string;
  evidence_type: string;
  source: string;
  source_record_id: string;
  lat: number;
  lng: number;
  alt_m: number | null;
  location_name: string;
  score: number;
  precision_level: string;
  km_marker: number;
  tag: string;
}

export interface CorridorNode {
  id: string;
  corridor_def_id: string;
  node_order: number;
  name: string;
  lat: number;
  lng: number;
  alt_m: number | null;
  km_marker: number;
  country_code: string;
  node_type: string;
  precision_level: string;
}

export interface CorridorScore {
  id: string;
  corridor_id: string;
  corridor_score: number;
  risk_class: string;
  created_at: string;
  gravity_score: number | null;
  diffusion_score: number | null;
  centrality_score: number | null;
  hmm_score: number | null;
  seasonal_score: number | null;
  linguistic_score: number | null;
  entropy_score: number | null;
  friction_score: number | null;
  inferred_mode: string | null;
  inferred_velocity_kmh: number | null;
  seasonally_active: boolean | null;
  requires_canoe: boolean | null;
  conflict_detour: boolean | null;
  phantom_poe_activated: boolean | null;
  soul_weights: string | null;
  trace_lines: string | null;
  run_id: string | null;
}

export interface CorridorDrift {
  id: string;
  corridor_id: string;
  score_before: number;
  score_after: number;
  drift_magnitude: number;
  drift_direction: string;
  risk_before: string;
  risk_after: string;
  computed_at: string;
}

export interface NormalizedSignal {
  id: string;
  source: string;
  type: string;
  country: string;
  admin1: string | null;
  location: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  truth_score: number;
  timestamp: string;
}

export interface EvidenceAtom {
  id: string;
  corridor_score_id: string;
  evidence_type: string;
  source: string;
  source_record_id: string;
  description: string;
  confidence: number;
  weight: number;
  timestamp: string;
  synthetic: boolean;
  node_ids_json: string;
  raw_value_json: string | null;
}

export interface IngestionRun {
  run_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  acled_fetched: number | null;
  dtm_fetched: number | null;
  dhis2_fetched: number | null;
  signals_normalized: number | null;
  signals_after_truth_filter: number | null;
  corridors_detected: number | null;
  entropy_spikes: number | null;
  error_message: string | null;
}

export interface RealCrossingPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country_a: string;
  country_b: string;
  monthly_avg_flow: number | null;
  peak_daily_flow: number | null;
  status: string;
  iom_fmp_active: boolean;
  closure_periods: string | null;
  source: string | null;
  customs?: boolean;
  immigration?: boolean;
  iom_fmp?: boolean;
}

export interface CorridorTemporalEvent {
  id: string;
  corridor_id: string | null;
  crossing_point_id: string | null;
  event_date: string;
  event_type: string;
  description: string;
  flow_impact: string | null;
  source: string;
}

export interface TemporalFlow {
  id: string;
  corridor_id: string;
  period_start: string;
  period_end: string;
  flow_count: number;
  flow_direction: string;
  source_report: string;
  source_url: string | null;
  notes: string | null;
  provenance: string | null;
}

export interface FrictionCell {
  id: string;
  corridor_id: string;
  segment_index: number;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  distance_km: number;
  elevation_gain_m: number;
  slope_deg: number;
  land_cover: string;
  road_quality: number | null;
  river_width_m: number | null;
  rainfall_anomaly: number | null;
  seasonal_phase: string;
  friction_foot: number;
  friction_motorcycle: number;
  friction_vehicle: number;
  friction_canoe: number;
  friction_livestock: number;
  best_friction: number;
  best_mode: string;
  computed_at: string;
}

export interface TruthEngineRun {
  id: string;
  run_id: string;
  lane_id: string | null;
  run_mode: string;
  total_signals: number;
  truth_passed: number;
  rejected: number;
  avg_truth_score: number | null;
  created_at: string;
}

export interface SentinelSignal {
  id: string;
  corridor_id: string | null;
  evidence_type: string;
  source: string;
  description: string;
  lat: number;
  lng: number;
  confidence: number;
  weight: number;
  timestamp: string;
  ingested_at: string;
}

export interface PoeRun {
  id: string;
  run_mode: string;
  started_at: string;
  completed_at: string | null;
  ok: boolean;
  duration_ms: number;
  signals_fetched: number | null;
  truth_passed: number | null;
  rejected: number | null;
  persisted: number | null;
  corridor_candidates: number | null;
  top_corridor_id: string | null;
  top_corridor_score: number | null;
  top_corridor_risk: string | null;
  errors: string | null;
  warnings: string | null;
  providers_healthy: string | null;
  providers_unhealthy: string | null;
}

export interface PoeMoment {
  id: string;
  lane_id: string;
  corridor_id: string | null;
  trigger: string;
  sealed_at: string;
  woo_state: string;
  synthesis_text: string | null;
  evidence_count: number | null;
  script_id: string | null;
  trinity_hash: string | null;
}
