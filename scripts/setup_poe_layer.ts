import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const connectionString = process.env.NEON_DATABASE_URL;

if (!connectionString) {
    console.error('Error: NEON_DATABASE_URL is not set in .env.local');
    process.exit(1);
}

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

const schema = `
-- ◉⟁⬡ Phantom POE Canonical Layer Setup

CREATE TABLE IF NOT EXISTS data_lanes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lane TEXT NOT NULL UNIQUE CHECK (lane IN ('LIVE', 'SANDBOX', 'TEST')),
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  badge_color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS poe_corridors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lane_id UUID NOT NULL REFERENCES data_lanes(id),
  start_node TEXT NOT NULL,
  end_node TEXT NOT NULL,
  start_country TEXT NOT NULL,
  end_country TEXT NOT NULL,
  start_lat REAL NOT NULL,
  start_lng REAL NOT NULL,
  end_lat REAL NOT NULL,
  end_lng REAL NOT NULL,
  score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  risk_class TEXT NOT NULL CHECK (risk_class IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  latent_state TEXT CHECK (latent_state IN ('dormant','probing','active_crossing','surge','dissipating')),
  distance_km REAL,
  inferred_mode TEXT,
  inferred_velocity_kmh REAL,
  signal_count INTEGER NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  phantom_poe_activated BOOLEAN NOT NULL DEFAULT false,
  conflict_detour BOOLEAN NOT NULL DEFAULT false,
  requires_canoe BOOLEAN NOT NULL DEFAULT false,
  gap_km REAL,
  formal_poe_coverage TEXT,
  inferred_path_json JSONB,
  activated BOOLEAN NOT NULL DEFAULT true,
  first_detected TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  previous_score REAL,
  score_delta REAL
);

CREATE TABLE IF NOT EXISTS poe_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lane_id UUID NOT NULL REFERENCES data_lanes(id),
  source TEXT NOT NULL,
  type TEXT NOT NULL,
  element TEXT,
  location TEXT NOT NULL,
  country TEXT NOT NULL,
  admin1 TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  magnitude REAL NOT NULL CHECK (magnitude >= 0 AND magnitude <= 1),
  truth_score REAL NOT NULL CHECK (truth_score >= 0 AND truth_score <= 1),
  passed_truth_filter BOOLEAN NOT NULL,
  disease TEXT,
  raw_source_id TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  ingested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS poe_entropy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lane_id UUID NOT NULL REFERENCES data_lanes(id),
  node_id TEXT NOT NULL,
  h_baseline REAL NOT NULL,
  h_current REAL NOT NULL,
  delta_h REAL NOT NULL,
  spiked BOOLEAN NOT NULL DEFAULT false,
  risk_class TEXT NOT NULL CHECK (risk_class IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  signal_count INTEGER NOT NULL DEFAULT 0,
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS poe_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lane_id UUID NOT NULL REFERENCES data_lanes(id),
  corridor_id UUID NOT NULL REFERENCES poe_corridors(id),
  evidence_type TEXT NOT NULL,
  description TEXT,
  weight REAL NOT NULL CHECK (weight >= 0 AND weight <= 1),
  source TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  node_ids_json JSONB,
  synthetic BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS explainability_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corridor_id UUID NOT NULL REFERENCES poe_corridors(id),
  run_id TEXT,
  corridor_score REAL NOT NULL,
  risk_class TEXT NOT NULL,
  gravity_score REAL,
  diffusion_score REAL,
  centrality_score REAL,
  hmm_score REAL,
  seasonal_score REAL,
  linguistic_score REAL,
  entropy_score REAL,
  friction_score REAL,
  inferred_mode TEXT,
  inferred_velocity_kmh REAL,
  phantom_poe_activated BOOLEAN,
  trace_lines JSONB,
  soul_weights JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS friction_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corridor_id UUID NOT NULL REFERENCES poe_corridors(id),
  cell_index INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  elevation_m REAL,
  slope_deg REAL,
  land_cover TEXT NOT NULL,
  river_present BOOLEAN DEFAULT false,
  river_width_m REAL,
  flood_probability REAL,
  flooded BOOLEAN DEFAULT false,
  conflict_risk REAL,
  friction_cost REAL NOT NULL,
  passable BOOLEAN DEFAULT true,
  transport_mode TEXT,
  seasonal_phase TEXT
);

CREATE TABLE IF NOT EXISTS phantom_node_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  node_type TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  country TEXT NOT NULL,
  properties JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS poe_detection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lane_id UUID NOT NULL REFERENCES data_lanes(id),
  event_type TEXT NOT NULL,
  corridor_id UUID REFERENCES poe_corridors(id),
  route_name TEXT,
  score REAL,
  score_delta REAL,
  summary TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  click_action TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed data for lanes
INSERT INTO data_lanes (lane, label, description, is_active, badge_color)
VALUES 
  ('LIVE', 'Live Intelligence', 'Real provider ingestion pipeline.', true, '#FF453A'),
  ('SANDBOX', 'Sandbox / Regression', 'Synthetic test data for UI and map behavior.', false, '#F5A623')
ON CONFLICT (lane) DO NOTHING;
`;

async function main() {
    await client.connect();
    console.log('Connected to Neon PostgreSQL');
    try {
        await client.query(schema);
        console.log('Canonical POE layer created successfully.');
    } catch (err) {
        console.error('Error creating schema:', err);
    } finally {
        await client.end();
    }
}

main().catch(console.error);
