/**
 * Neon serverless PostgreSQL client
 * Uses DATABASE_URL injected by the Neon integration.
 */
import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL;

if (!connectionString) {
    console.warn('[db] DATABASE_URL is not set — Neon queries will fail at runtime.');
}

// sql is a tagged-template query function; re-use the single instance across requests.
export const sql = neon(connectionString ?? '');

// ---------------------------------------------------------------------------
// Typed query helpers used by the live route
// ---------------------------------------------------------------------------

export interface DbCorridorRow {
    id: string;
    start_node: string;
    end_node: string;
    region: string | null;
    score: number;
    risk_class: string;
    activated: boolean;
    total_km: number;
    velocity_km_day: number;
    days_delta: number;
    signal_count: number;
    first_detected: string;
    cam_lat: number | null;
    cam_lng: number | null;
    cam_alt: number | null;
    cam_heading: number | null;
    cam_tilt: number | null;
}

export interface DbNodeRow {
    corridor_def_id: string;
    name: string;
    lat: number;
    lng: number;
    alt_m: number;
    type: string;
    country_code: string | null;
    km: number;
    sort_order: number;
}

export interface DbEvidenceRow {
    id: string;
    corridor_def_id: string;
    evidence_id: string | null;
    day_offset: number;
    km_marker: number;
    evidence_type: string | null;
    tag: string | null;
    location_name: string | null;
    country_code: string | null;
    score: number;
    source: string | null;
    precision_level: string | null;
    lat: number | null;
    lng: number | null;
    alt_m: number;
}

export async function fetchCorridorsFromNeon(): Promise<{
    corridors: DbCorridorRow[];
    nodes: DbNodeRow[];
    evidence: DbEvidenceRow[];
} | null> {
    try {
        const [corridors, nodes, evidence] = await Promise.all([
            sql`
                SELECT
                    d.id,
                    d.start_node,
                    d.end_node,
                    d.region,
                    s.score,
                    s.risk_class,
                    s.activated,
                    s.total_km,
                    s.velocity_km_day,
                    s.days_delta,
                    s.signal_count,
                    s.first_detected::text AS first_detected,
                    c.lat   AS cam_lat,
                    c.lng   AS cam_lng,
                    c.alt_m AS cam_alt,
                    c.heading_deg AS cam_heading,
                    c.tilt_deg    AS cam_tilt
                FROM corridor_definitions d
                JOIN corridor_scores s ON s.corridor_id = d.id
                LEFT JOIN corridor_cameras c ON c.corridor_def_id = d.id
                WHERE d.is_active = true
                ORDER BY s.score DESC
            `,
            sql`
                SELECT
                    corridor_def_id, name, lat, lng, alt_m,
                    type, country_code, km, sort_order
                FROM corridor_nodes
                ORDER BY corridor_def_id, sort_order
            `,
            sql`
                SELECT
                    id, corridor_def_id, evidence_id,
                    day_offset, km_marker, evidence_type, tag,
                    location_name, country_code, score, source,
                    precision_level, lat, lng, alt_m
                FROM corridor_evidence_chains
                ORDER BY corridor_def_id, day_offset
            `,
        ]);

        return {
            corridors: corridors as DbCorridorRow[],
            nodes: nodes as DbNodeRow[],
            evidence: evidence as DbEvidenceRow[],
        };
    } catch (err) {
        console.error('[db] fetchCorridorsFromNeon failed:', err);
        return null;
    }
}
