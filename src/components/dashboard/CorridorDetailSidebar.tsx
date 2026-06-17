import { useEffect, useState } from "react";
import { X, MapPin, Calendar, TrendingUp, AlertTriangle, ArrowRight, Shield, ShieldOff } from "lucide-react";
import { queryNeon } from "@/integrations/neon/client";

interface CorridorMeta {
  id: string;
  name: string;
  risk: string;
  km: number;
  mode: string;
}

interface TemporalFlow {
  id: string;
  corridor_id: string;
  period_start: string;
  period_end: string;
  flow_count: number;
  flow_direction: string;
  source_report: string;
  notes: string | null;
}

interface TemporalEvent {
  id: string;
  corridor_id: string | null;
  event_date: string;
  event_type: string;
  description: string;
  flow_impact: string | null;
  source: string;
}

interface CrossingPoint {
  id: string;
  name: string;
  country_a: string;
  country_b: string;
  monthly_avg_flow: number;
  peak_daily_flow: number;
  status: string;
  iom_fmp_active: boolean;
  closure_periods: string | null;
}

interface FormalCounterpart {
  name: string;
  coveragePct: number;
  gapNote: string;
  monitoring: string;
  customs: boolean;
  immigration: boolean;
  iomFmp: boolean;
}

interface Props {
  corridor: CorridorMeta;
  onClose: () => void;
}

const EVENT_COLORS: Record<string, string> = {
  CONFLICT_ONSET: "text-phantom-red",
  CROSSING_SURGE: "text-phantom-amber",
  MASSACRE: "text-phantom-red",
  BORDER_CLOSURE: "text-phantom-red",
  BORDER_REOPENING: "text-phantom-green",
  HEALTH_CRISIS: "text-phantom-amber",
  POLICY_CHANGE: "text-phantom-blue",
};

export function CorridorDetailSidebar({ corridor, onClose }: Props) {
  const [flows, setFlows] = useState<TemporalFlow[]>([]);
  const [events, setEvents] = useState<TemporalEvent[]>([]);
  const [crossings, setCrossings] = useState<CrossingPoint[]>([]);
  const [formal, setFormal] = useState<FormalCounterpart | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"flows" | "events" | "crossings">("flows");

  useEffect(() => {
    setLoading(true);
    const cid = corridor.id;

    // Replace supabase.from() with direct Neon queries
    const dbPromise = Promise.all([
      queryNeon<TemporalFlow>(
        `SELECT * FROM temporal_flows WHERE corridor_id = $1 ORDER BY period_start ASC`,
        [cid]
      ),
      queryNeon<TemporalEvent>(
        `SELECT * FROM corridor_temporal_events WHERE corridor_id = $1 OR corridor_id = 'MULTI-CORRIDOR-SUDAN' OR corridor_id = 'MULTI-CORRIDOR-SOMALIA' ORDER BY event_date ASC`,
        [cid]
      ),
      queryNeon<CrossingPoint>(
        `SELECT * FROM real_crossing_points ORDER BY monthly_avg_flow DESC NULLS LAST`
      ),
    ]);

    const formalPromise = fetch("/data/corridors_paired.geojson")
      .then((r) => r.json())
      .then((geo) => {
        const formalFeature = geo.features.find(
          (f: any) => f.properties.route_type === "FORMAL" && f.properties.phantom_id === cid
        );
        if (formalFeature) {
          const p = formalFeature.properties;
          return {
            name: p.name,
            coveragePct: p.coverage_pct ?? 0,
            gapNote: p.gap_note ?? "",
            monitoring: p.monitoring ?? "unknown",
            customs: !!p.customs,
            immigration: !!p.immigration,
            iomFmp: !!p.iom_fmp,
          } as FormalCounterpart;
        }
        return null;
      })
      .catch(() => null);

    Promise.all([dbPromise, formalPromise]).then(([[flowsRes, eventsRes, xpRes], formalData]) => {
      setFlows(flowsRes as TemporalFlow[]);
      setEvents(eventsRes as TemporalEvent[]);
      setCrossings(xpRes as CrossingPoint[]);
      setFormal(formalData);
      setLoading(false);
    });
  }, [corridor.id]);

  const totalFlow = flows.reduce((s, f) => s + (f.flow_count || 0), 0);
  const peakFlow = flows.length ? Math.max(...flows.map((f) => f.flow_count || 0)) : 0;

  return (
    <div className="absolute top-0 right-0 w-96 h-full bg-card/95 backdrop-blur-md border-l border-border shadow-2xl z-30 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-phantom-green" />
            <h3 className="text-sm font-semibold text-foreground truncate max-w-[260px]">
              {corridor.name}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex items-center gap-3 mt-2 text-xs font-mono text-muted-foreground">
          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
            corridor.risk === "CRITICAL" ? "bg-red-500/20 text-red-400" :
            corridor.risk === "HIGH" ? "bg-orange-500/20 text-orange-400" :
            corridor.risk === "ELEVATED" ? "bg-yellow-500/20 text-yellow-400" :
            "bg-green-500/20 text-green-400"
          }`}>{corridor.risk}</span>
          <span>{corridor.km} km</span>
          <span>{corridor.mode}</span>
        </div>

        {/* Formal counterpart */}
        {formal && (
          <div className="mt-2 p-2 rounded bg-muted/30 border border-border">
            <div className="flex items-center gap-1.5 text-xs font-mono">
              {formal.monitoring === "active" ? (
                <Shield className="w-3 h-3 text-phantom-green" />
              ) : (
                <ShieldOff className="w-3 h-3 text-phantom-amber" />
              )}
              <span className="text-muted-foreground">Formal: {formal.name}</span>
            </div>
            <div className="text-[10px] text-muted-foreground/70 mt-1">
              Coverage: {formal.coveragePct}% | {formal.gapNote || "No gaps noted"}
            </div>
          </div>
        )}

        {/* Stats row */}
        {!loading && (
          <div className="flex items-center gap-4 mt-2 text-xs font-mono text-muted-foreground">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {totalFlow.toLocaleString()} total
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {events.length} events
            </span>
            <span className="flex items-center gap-1">
              <ArrowRight className="w-3 h-3" />
              Peak: {peakFlow.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["flows", "events", "crossings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2 text-xs font-mono transition-colors ${
              tab === t
                ? "text-foreground border-b-2 border-phantom-green"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "flows" ? `Flows (${flows.length})` :
             t === "events" ? `Events (${events.length})` :
             `Crossings (${crossings.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {loading && (
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground py-8 justify-center">
            <div className="w-3 h-3 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
            Loading corridor intelligence\u2026
          </div>
        )}

        {!loading && tab === "flows" && (
          <>
            {flows.map((f) => (
              <div key={f.id} className="p-2.5 rounded border border-border bg-muted/10 hover:bg-muted/20 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-muted-foreground">
                    <Calendar className="w-3 h-3 inline mr-1" />
                    {f.period_start.slice(0, 10)} \u2192 {f.period_end.slice(0, 10)}
                  </span>
                  <span className="text-sm font-mono text-phantom-green tabular-nums font-medium">
                    {f.flow_count?.toLocaleString()}
                  </span>
                </div>
                <div className="text-xs font-mono text-muted-foreground/80">
                  {f.flow_direction}
                </div>
                {f.notes && (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.notes}</p>
                )}
              </div>
            ))}
            {flows.length === 0 && (
              <p className="text-sm font-mono text-muted-foreground py-6 text-center">
                No temporal flow data for this corridor
              </p>
            )}
          </>
        )}

        {!loading && tab === "events" && (
          <>
            {events.map((e) => (
              <div key={e.id} className="p-2.5 rounded border border-border bg-muted/10 hover:bg-muted/20 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold ${EVENT_COLORS[e.event_type] ?? "text-muted-foreground"}`}>
                    {e.event_type.replace(/_/g, " ")}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {e.event_date.slice(0, 10)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{e.description}</p>
                {e.flow_impact && (
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Impact: {e.flow_impact}</p>
                )}
              </div>
            ))}
            {events.length === 0 && (
              <p className="text-sm font-mono text-muted-foreground py-6 text-center">
                No temporal events for this corridor
              </p>
            )}
          </>
        )}

        {!loading && tab === "crossings" && (
          <>
            {crossings.map((xp) => (
              <div key={xp.id} className="p-2.5 rounded border border-border bg-muted/10 hover:bg-muted/20 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">{xp.name}</span>
                  <span
                    className={`text-xs font-mono px-2 py-0.5 rounded ${xp.status === "active"
                        ? "bg-primary/15 text-phantom-teal"
                        : xp.status === "partially_restricted"
                          ? "bg-accent/15 text-phantom-amber"
                          : "bg-destructive/15 text-phantom-red"
                      }`}
                  >
                    {xp.status}
                  </span>
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  {xp.country_a} \u2194 {xp.country_b}
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-muted-foreground/70">
                  <span>Avg: {(xp.monthly_avg_flow ?? 0).toLocaleString()}/mo</span>
                  <span>Peak: {(xp.peak_daily_flow ?? 0).toLocaleString()}/day</span>
                  {xp.iom_fmp_active && <span className="text-phantom-green">IOM FMP</span>}
                </div>
              </div>
            ))}
            {crossings.length === 0 && (
              <p className="text-sm font-mono text-muted-foreground py-6 text-center">
                No crossing point data available
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
