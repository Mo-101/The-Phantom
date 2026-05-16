import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// ---- Types -----------------------------------------------------------------

type RouteClassification = 'PRIMARY' | 'ALTERNATE' | 'BLOCKED' | 'CONTINGENCY';

interface LogisticsWaypoint {
  id: string;
  seq: number;
  name: string;
  lat: number;
  lng: number;
  alt_m: number;
  country_code: string;
  waypoint_type: string;
  leg_mode: string | null;
  leg_km: number | null;
  leg_hours: number | null;
  leg_risk_score: number | null;
  operator: string | null;
  notes: string | null;
}

interface LogisticsRoute {
  id: string;
  corridor_id: string;
  name: string;
  classification: RouteClassification;
  purpose: string;
  supply_classes: string[];
  origin_name: string;
  origin_cc: string;
  destination_name: string;
  destination_cc: string;
  total_km: number;
  estimated_hours: number;
  modes: string[];
  risk_class: string;
  risk_score: number;
  cold_chain_capable: boolean;
  cost_class: string;
  formal_crossings_used: string[];
  blocked_reason: string | null;
  derived_from_evidence: string[];
  valid_from: string;
  valid_until: string | null;
  computed_at: string;
  style_color: string;
  style_dash_pattern: number[];
  notes: string | null;
  waypoints: LogisticsWaypoint[];
}

// ---- DB helpers ------------------------------------------------------------

async function fetchRoutesWithWaypoints(corridorId: string): Promise<LogisticsRoute[]> {
  const rows = await sql`
    SELECT * FROM logistics_routes
    WHERE corridor_id = ${corridorId}
      AND (valid_until IS NULL OR valid_until > NOW())
    ORDER BY
      CASE classification
        WHEN 'PRIMARY'     THEN 1
        WHEN 'ALTERNATE'   THEN 2
        WHEN 'CONTINGENCY' THEN 3
        WHEN 'BLOCKED'     THEN 4
      END,
      computed_at DESC
  `;

  if (rows.length === 0) return [];

  const routeIds = rows.map((r) => r.id as string);
  const waypointRows = await sql`
    SELECT * FROM logistics_waypoints
    WHERE route_id = ANY(${routeIds})
    ORDER BY route_id, seq
  `;

  const waypointsByRoute = new Map<string, LogisticsWaypoint[]>();
  for (const w of waypointRows) {
    const list = waypointsByRoute.get(w.route_id as string) ?? [];
    list.push({
      id: w.id as string,
      seq: w.seq as number,
      name: w.name as string,
      lat: w.lat as number,
      lng: w.lng as number,
      alt_m: (w.alt_m as number) ?? 0,
      country_code: w.country_code as string,
      waypoint_type: w.waypoint_type as string,
      leg_mode: (w.leg_mode as string) ?? null,
      leg_km: (w.leg_km as number) ?? null,
      leg_hours: (w.leg_hours as number) ?? null,
      leg_risk_score: (w.leg_risk_score as number) ?? null,
      operator: (w.operator as string) ?? null,
      notes: (w.notes as string) ?? null,
    });
    waypointsByRoute.set(w.route_id as string, list);
  }

  return rows.map((r) => ({
    id: r.id as string,
    corridor_id: r.corridor_id as string,
    name: r.name as string,
    classification: r.classification as RouteClassification,
    purpose: r.purpose as string,
    supply_classes: (r.supply_classes as string[]) ?? [],
    origin_name: r.origin_name as string,
    origin_cc: r.origin_cc as string,
    destination_name: r.destination_name as string,
    destination_cc: r.destination_cc as string,
    total_km: r.total_km as number,
    estimated_hours: r.estimated_hours as number,
    modes: (r.modes as string[]) ?? [],
    risk_class: r.risk_class as string,
    risk_score: r.risk_score as number,
    cold_chain_capable: (r.cold_chain_capable as boolean) ?? false,
    cost_class: r.cost_class as string,
    formal_crossings_used: (r.formal_crossings_used as string[]) ?? [],
    blocked_reason: (r.blocked_reason as string) ?? null,
    derived_from_evidence: (r.derived_from_evidence as string[]) ?? [],
    valid_from: r.valid_from as string,
    valid_until: (r.valid_until as string) ?? null,
    computed_at: r.computed_at as string,
    style_color: r.style_color as string,
    style_dash_pattern: (r.style_dash_pattern as number[]) ?? [],
    notes: (r.notes as string) ?? null,
    waypoints: waypointsByRoute.get(r.id as string) ?? [],
  }));
}

function buildRecommendationSummary(routes: LogisticsRoute[]): string {
  const primary = routes.find((r) => r.classification === 'PRIMARY');
  const alternate = routes.find((r) => r.classification === 'ALTERNATE');
  const blocked = routes.filter((r) => r.classification === 'BLOCKED');

  const parts: string[] = [];
  if (primary) {
    parts.push(
      `Primary route '${primary.name}' — ${primary.total_km.toFixed(0)}km, ` +
      `~${primary.estimated_hours.toFixed(1)}h, risk ${primary.risk_class}, ` +
      `cold-chain ${primary.cold_chain_capable ? 'maintained' : 'not maintained'}.`
    );
  }
  if (alternate) {
    parts.push(
      `Alternate '${alternate.name}' available for bulk supplies ` +
      `(${alternate.total_km.toFixed(0)}km, ~${alternate.estimated_hours.toFixed(1)}h).`
    );
  }
  if (blocked.length > 0) {
    parts.push(
      `${blocked.length} route(s) rejected by current evidence — ` +
      `see classification=BLOCKED for rationale.`
    );
  }
  return parts.join(' ');
}

// ---- Route handler ---------------------------------------------------------

export async function GET(
  _req: Request,
  { params }: { params: { corridor_id: string } }
) {
  const { corridor_id } = params;
  try {
    const routes = await fetchRoutesWithWaypoints(corridor_id);

    if (routes.length === 0) {
      return NextResponse.json(
        { error: `No logistics routes for corridor ${corridor_id}` },
        { status: 404 }
      );
    }

    const primary = routes.find((r) => r.classification === 'PRIMARY');

    return NextResponse.json({
      corridor_id,
      routes,
      generated_at: new Date().toISOString(),
      primary_route_id: primary?.id ?? null,
      recommendation_summary: buildRecommendationSummary(routes),
    });
  } catch (err) {
    console.error('[logistics-routes] GET error:', err);
    return NextResponse.json(
      { error: `logistics fetch failed: ${String(err)}` },
      { status: 500 }
    );
  }
}
