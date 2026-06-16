-- 011_dark_corridor_candidates.sql

CREATE TABLE IF NOT EXISTS dark_corridor_candidates (
    candidate_id        TEXT PRIMARY KEY,              -- e.g., 'DARK-2026-001'
    reported_name       TEXT,                          -- ground team's wording: "Aura"
    canonical_name      TEXT,                          -- resolved canonical: "Aria" or NULL
    candidate_status    TEXT NOT NULL DEFAULT 'REPORTED',
    -- REPORTED → EVIDENCE_GATHERING → INFERENCE → GENESIS_REVIEW → PROMOTED / REJECTED
    posterior_score     NUMERIC(5,4) NOT NULL DEFAULT 0.0,
    uncertainty         NUMERIC(5,4) NOT NULL DEFAULT 1.0,
    geometry_status     TEXT NOT NULL DEFAULT 'PENDING',
    -- PENDING → RUNTIME_INFERRED → FIELD_VALIDATED
    field_validation    TEXT NOT NULL DEFAULT 'PENDING',
    -- PENDING → GROUND_TEAM_DISPATCHED → CONFIRMED / REFUTED
    synthetic           BOOLEAN NOT NULL DEFAULT false,
    reported_by         TEXT NOT NULL,                 -- 'GROUND_TEAM', 'ANALYST', 'AUTO_CLUSTER'
    reported_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_evidence_at    TIMESTAMPTZ,
    explanation_json    JSONB NOT NULL DEFAULT '{}'    -- stores covenant report, inference log
);

CREATE TABLE IF NOT EXISTS dark_corridor_evidence (
    evidence_id         TEXT PRIMARY KEY,
    candidate_id        TEXT NOT NULL
        REFERENCES dark_corridor_candidates(candidate_id)
        ON DELETE CASCADE,
    source_id           TEXT NOT NULL,                 -- Afro-Sentinel record ID, ACLED event ID, UNHCR report ID
    source_family       TEXT NOT NULL,                 -- 'DISEASE_SIGNAL', 'CONFLICT_EVENT', 'DISPLACEMENT', 'MARKET', 'SATELLITE', 'FIELD_OBSERVATION'
    observed_at         TIMESTAMPTZ NOT NULL,
    ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    raw_score           NUMERIC(5,4) NOT NULL,         -- source-specific severity/relevance
    freshness_weight    NUMERIC(5,4) NOT NULL,         -- decay function applied
    contribution        NUMERIC(5,4) NOT NULL,         -- weighted contribution to posterior
    synthetic           BOOLEAN NOT NULL DEFAULT false,
    provenance_json     JSONB NOT NULL                 -- full source trace: URL, API response hash, observer identity
);

CREATE TABLE IF NOT EXISTS dark_corridor_paths (
    path_id             TEXT PRIMARY KEY,
    candidate_id        TEXT NOT NULL
        REFERENCES dark_corridor_candidates(candidate_id)
        ON DELETE CASCADE,
    rank                INT NOT NULL,
    posterior_mass      NUMERIC(5,4) NOT NULL,         -- probability weight for this path
    geometry_geojson    JSONB,                          -- LineString or MultiLineString
    terrain_cost        NUMERIC(8,2),                   -- least-cost path score
    description         TEXT
);
