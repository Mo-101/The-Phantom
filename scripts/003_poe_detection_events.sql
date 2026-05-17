-- Migration 003: POE detection events table
-- Stores early-warning and activation events fired by the drift engine.
-- Run once against the Neon database.

CREATE TABLE IF NOT EXISTS poe_detection_events (
    id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    corridor_id   text        NOT NULL,
    event_type    text        NOT NULL,  -- 'pre_activation_warning' | 'activation_confirmed'
    activation_likelihood numeric(5,4),
    confidence    numeric(5,4),
    created_at    timestamptz DEFAULT NOW(),
    metadata      jsonb
);

CREATE INDEX IF NOT EXISTS idx_pde_corridor_created
    ON poe_detection_events (corridor_id, created_at DESC);
