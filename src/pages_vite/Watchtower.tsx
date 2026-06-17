import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Eye,
  Filter,
  Flame,
  GitBranch,
  Grid3x3,
  LayoutDashboard,
  Lock,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Users,
  XCircle,
} from "lucide-react";

type AgentStatus =
  | "SCANNED"
  | "PENDING_REVIEW"
  | "REFORMATTED"
  | "SANCTIONED"
  | "REJECTED"
  | "QUARANTINED";

type AuthLevel = "PROVISIONAL" | "OPERATIONAL" | "INSTITUTIONAL";

interface Agent {
  id: string;
  name: string;
  source: string;
  purpose: string;
  trust_score: number;
  status: AgentStatus;
  namespace: string;
  capabilities: string[];
  data_contracts: string[];
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  auth_level: AuthLevel | null;
  last_sync: string | null;
  safety_flags: string[];
  provenance_verified: boolean;
}

const STATUS_META: Record<
  AgentStatus,
  { label: string; text: string; bg: string; icon: LucideIcon }
> = {
  SCANNED: {
    label: "SCANNED",
    text: "text-phantom-blue",
    bg: "bg-[hsl(var(--phantom-blue))]/10 border-[hsl(var(--phantom-blue))]/25",
    icon: Eye,
  },
  PENDING_REVIEW: {
    label: "PENDING",
    text: "text-phantom-amber",
    bg: "bg-[hsl(var(--phantom-amber))]/10 border-[hsl(var(--phantom-amber))]/25",
    icon: Clock,
  },
  REFORMATTED: {
    label: "REFORMATTED",
    text: "text-phantom-teal",
    bg: "bg-[hsl(var(--phantom-teal))]/10 border-[hsl(var(--phantom-teal))]/25",
    icon: GitBranch,
  },
  SANCTIONED: {
    label: "SANCTIONED",
    text: "text-primary",
    bg: "bg-primary/10 border-primary/25",
    icon: ShieldCheck,
  },
  REJECTED: {
    label: "REJECTED",
    text: "text-destructive",
    bg: "bg-destructive/10 border-destructive/25",
    icon: XCircle,
  },
  QUARANTINED: {
    label: "QUARANTINED",
    text: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/25",
    icon: ShieldAlert,
  },
};

const AUTH_META: Record<AuthLevel, { text: string; label: string }> = {
  PROVISIONAL: { text: "text-phantom-amber", label: "PROVISIONAL" },
  OPERATIONAL: { text: "text-phantom-blue", label: "OPERATIONAL" },
  INSTITUTIONAL: { text: "text-primary", label: "INSTITUTIONAL" },
};

const SEED_AGENTS: Agent[] = [
  {
    id: "AGT-0041",
    name: "Phantom POE",
    source: "MoStar Internal",
    purpose: "Cross-border corridor intelligence, IOM DTM signals",
    trust_score: 97,
    status: "SANCTIONED",
    namespace: "poe",
    capabilities: ["corridor_detection", "signal_aggregation", "geojson_emit"],
    data_contracts: ["reads:iom_dtm", "writes:grid_events"],
    approved_by: "Flame Architect",
    approved_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    auth_level: "INSTITUTIONAL",
    last_sync: new Date(Date.now() - 60000 * 4).toISOString(),
    safety_flags: [],
    provenance_verified: true,
  },
  {
    id: "AGT-0042",
    name: "AFRO Sentinel",
    source: "WHO AFRO / Azure OpenAI",
    purpose: "Disease signal tracker, 42k+ surveillance signals",
    trust_score: 94,
    status: "SANCTIONED",
    namespace: "sormas",
    capabilities: ["signal_detection", "alert_generation", "event_precursor"],
    data_contracts: ["reads:who_signals", "writes:grid_events", "reads:graph_nodes"],
    approved_by: "Flame Architect",
    approved_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 14).toISOString(),
    auth_level: "INSTITUTIONAL",
    last_sync: new Date(Date.now() - 60000 * 12).toISOString(),
    safety_flags: [],
    provenance_verified: true,
  },
  {
    id: "AGT-0043",
    name: "Wolfram Engine",
    source: "Wolfram Research",
    purpose: "Symbolic computation, mathematical validation layer",
    trust_score: 89,
    status: "SANCTIONED",
    namespace: "wolfram",
    capabilities: ["symbolic_math", "computation_verify", "statistical_proof"],
    data_contracts: ["reads:query_stream", "writes:computation_results"],
    approved_by: "TruthEngine",
    approved_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 9).toISOString(),
    auth_level: "OPERATIONAL",
    last_sync: new Date(Date.now() - 60000 * 38).toISOString(),
    safety_flags: [],
    provenance_verified: true,
  },
  {
    id: "AGT-0044",
    name: "FundiConnect Mesh",
    source: "MoStar / Kenya Internal",
    purpose: "Informal worker skills registry, Nairobi mesh layer",
    trust_score: 76,
    status: "REFORMATTED",
    namespace: "operations",
    capabilities: ["worker_registry", "skill_match", "map_emit"],
    data_contracts: ["reads:fundi_profiles", "writes:match_results"],
    approved_by: null,
    approved_at: null,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    auth_level: null,
    last_sync: null,
    safety_flags: ["missing_audit_trail"],
    provenance_verified: true,
  },
  {
    id: "AGT-0045",
    name: "DeepCAL Engine",
    source: "MoStar Logistics",
    purpose: "N-AHP / N-TOPSIS neutrosophic logistics scoring",
    trust_score: 97,
    status: "SANCTIONED",
    namespace: "operations",
    capabilities: ["topsis_score", "ahp_weight", "grey_forecast"],
    data_contracts: ["reads:logistics_matrix", "writes:ranking_results"],
    approved_by: "Flame Architect",
    approved_at: new Date(Date.now() - 86400000 * 20).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 25).toISOString(),
    auth_level: "INSTITUTIONAL",
    last_sync: new Date(Date.now() - 60000 * 2).toISOString(),
    safety_flags: [],
    provenance_verified: true,
  },
  {
    id: "AGT-0046",
    name: "Unnamed HTTP Crawler",
    source: "Unknown, detected on network segment 192.168.4.x",
    purpose: "Unknown, scraping /api/grid endpoints",
    trust_score: 12,
    status: "QUARANTINED",
    namespace: "unclassified",
    capabilities: ["http_request", "data_extraction"],
    data_contracts: [],
    approved_by: null,
    approved_at: null,
    created_at: new Date(Date.now() - 60000 * 45).toISOString(),
    auth_level: null,
    last_sync: null,
    safety_flags: ["unknown_origin", "no_data_contract", "unauthorized_read_attempt"],
    provenance_verified: false,
  },
  {
    id: "AGT-0047",
    name: "PDX Isaiah Module",
    source: "Isaiah, External Collaborator",
    purpose: "Prepositioning data exchange, 16 logistics modules",
    trust_score: 68,
    status: "PENDING_REVIEW",
    namespace: "operations",
    capabilities: ["preposition_calc", "stock_level_report", "hub_sync"],
    data_contracts: ["reads:unhrd_data", "writes:preposition_matrix"],
    approved_by: null,
    approved_at: null,
    created_at: new Date(Date.now() - 60000 * 90).toISOString(),
    auth_level: null,
    last_sync: null,
    safety_flags: ["external_author_unverified"],
    provenance_verified: false,
  },
];

function trustText(score: number) {
  if (score >= 80) return "text-primary";
  if (score >= 60) return "text-phantom-blue";
  if (score >= 40) return "text-phantom-amber";
  return "text-destructive";
}

function trustBarColor(score: number) {
  if (score >= 80) return "bg-primary";
  if (score >= 60) return "bg-[hsl(var(--phantom-blue))]";
  if (score >= 40) return "bg-[hsl(var(--phantom-amber))]";
  return "bg-destructive";
}

function timeAgo(iso?: string | null) {
  if (!iso) return "never";
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return "unknown";
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function TrustBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-secondary">
        <div
          className={`h-full rounded-sm transition-[width] duration-500 ${trustBarColor(score)}`}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
      <span className={`w-7 text-right text-[11px] font-semibold tabular-nums ${trustText(score)}`}>
        {score}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: AgentStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[10px] font-semibold tracking-wider ${meta.text} ${meta.bg}`}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function AssessmentPanel({
  agent,
  onAction,
}: {
  agent: Agent;
  onAction: (id: string, action: AgentStatus) => void;
}) {
  const actionable = !["SANCTIONED", "REJECTED"].includes(agent.status);

  return (
    <section className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-5">
        <div className="mb-2 flex items-start justify-between gap-4">
          <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Agent {agent.id} / {agent.namespace}
          </span>
          <StatusBadge status={agent.status} />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{agent.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{agent.source}</p>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        <section>
          <h3 className="mb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Purpose
          </h3>
          <p className="max-w-3xl text-sm leading-6 text-foreground/75">{agent.purpose}</p>
        </section>

        <section className="rounded-md border border-border bg-card/70 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Trust Assessment
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">Composite provenance and contract score</p>
            </div>
            <span className={`text-3xl font-semibold tabular-nums ${trustText(agent.trust_score)}`}>
              {agent.trust_score}
            </span>
          </div>
          <TrustBar score={agent.trust_score} />
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              {agent.provenance_verified ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              Provenance
            </div>
            <div className="flex items-center gap-2">
              {agent.safety_flags.length === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-phantom-amber" />
              )}
              {agent.safety_flags.length === 0 ? "Safety clear" : `${agent.safety_flags.length} flags`}
            </div>
          </div>
        </section>

        {agent.safety_flags.length > 0 && (
          <section>
            <h3 className="mb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Safety Flags
            </h3>
            <div className="space-y-2">
              {agent.safety_flags.map((flag) => (
                <div
                  key={flag}
                  className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-mono">{flag}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Capabilities
          </h3>
          <div className="flex flex-wrap gap-2">
            {agent.capabilities.map((capability) => (
              <span
                key={capability}
                className="rounded-sm border border-border bg-secondary px-2 py-1 text-[11px] text-muted-foreground"
              >
                {capability}
              </span>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Data Contracts
          </h3>
          {agent.data_contracts.length > 0 ? (
            <div className="space-y-2">
              {agent.data_contracts.map((contract) => (
                <div
                  key={contract}
                  className="flex items-center gap-2 rounded-md border border-border bg-card/70 px-3 py-2 text-xs text-muted-foreground"
                >
                  <GitBranch className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-mono">{contract}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-muted-foreground">No contracts defined</p>
          )}
        </section>

        <section className="rounded-md border border-border bg-card/70 p-4">
          <h3 className="mb-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Authorization Trail
          </h3>
          <div className="grid gap-2 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Approved by</span>
              <span className="font-mono text-foreground/70">{agent.approved_by ?? "unsealed"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Auth level</span>
              <span className={`font-mono font-semibold ${agent.auth_level ? AUTH_META[agent.auth_level].text : "text-muted-foreground"}`}>
                {agent.auth_level ?? "none"}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Last sync</span>
              <span className="font-mono text-foreground/70">{timeAgo(agent.last_sync)}</span>
            </div>
          </div>
        </section>
      </div>

      {actionable && (
        <footer className="border-t border-border px-6 py-5">
          <h3 className="mb-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Assessment Actions
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <ActionButton icon={ShieldCheck} label="Sanction" tone="primary" onClick={() => onAction(agent.id, "SANCTIONED")} />
            <ActionButton icon={GitBranch} label="Reformat" tone="blue" onClick={() => onAction(agent.id, "REFORMATTED")} />
            <ActionButton icon={ShieldAlert} label="Quarantine" tone="amber" onClick={() => onAction(agent.id, "QUARANTINED")} />
            <ActionButton icon={ShieldOff} label="Reject" tone="destructive" onClick={() => onAction(agent.id, "REJECTED")} />
          </div>
        </footer>
      )}
    </section>
  );
}

function ActionButton({
  icon: Icon,
  label,
  tone,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  tone: "primary" | "blue" | "amber" | "destructive";
  onClick: () => void;
}) {
  const tones = {
    primary: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
    blue: "border-[hsl(var(--phantom-blue))]/30 bg-[hsl(var(--phantom-blue))]/10 text-phantom-blue hover:bg-[hsl(var(--phantom-blue))]/15",
    amber: "border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/15",
    destructive: "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${tones[tone]}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

export default function Watchtower() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>(SEED_AGENTS);
  const [selected, setSelected] = useState<Agent | null>(SEED_AGENTS.find((a) => a.id === "AGT-0046") ?? SEED_AGENTS[0]);
  const [filter, setFilter] = useState<AgentStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(false);
  const [usingSeed, setUsingSeed] = useState(true);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await fetch("/watchtower/agents");
      if (!res.ok) return;
      const data = (await res.json()) as Agent[];
      if (!Array.isArray(data) || data.length === 0) return;
      setAgents(data);
      setUsingSeed(false);
      setSelected((current) => data.find((agent) => agent.id === current?.id) ?? data[0]);
    } catch {
      setUsingSeed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAgents();
  }, []);

  const updateAgentStatus = async (id: string, status: AgentStatus) => {
    const approved_by = status === "SANCTIONED" ? "Watchtower" : undefined;
    const auth_level = status === "SANCTIONED" ? "OPERATIONAL" : undefined;

    setAgents((prev) => prev.map((agent) => (agent.id === id ? { ...agent, status, approved_by: approved_by ?? agent.approved_by, auth_level: (auth_level as AuthLevel | undefined) ?? agent.auth_level } : agent)));
    setSelected((prev) => (prev?.id === id ? { ...prev, status, approved_by: approved_by ?? prev.approved_by, auth_level: (auth_level as AuthLevel | undefined) ?? prev.auth_level } : prev));

    try {
      await fetch(`/watchtower/agents/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, approved_by, auth_level }),
      });
      void fetchAgents();
    } catch {
      setUsingSeed(true);
    }
  };

  const filteredAgents = useMemo(
    () => (filter === "ALL" ? agents : agents.filter((agent) => agent.status === filter)),
    [agents, filter],
  );
  const sanctioned = agents.filter((agent) => agent.status === "SANCTIONED");
  const pending = agents.filter((agent) => ["SCANNED", "PENDING_REVIEW", "REFORMATTED"].includes(agent.status));
  const flagged = agents.filter((agent) => agent.safety_flags.length > 0);

  const filters: Array<{ value: AgentStatus | "ALL"; label: string }> = [
    { value: "ALL", label: "ALL" },
    { value: "SCANNED", label: "SCANNED" },
    { value: "PENDING_REVIEW", label: "PENDING" },
    { value: "REFORMATTED", label: "REFORMATTED" },
    { value: "SANCTIONED", label: "SANCTIONED" },
    { value: "QUARANTINED", label: "QUARANTINED" },
    { value: "REJECTED", label: "REJECTED" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground font-mono">
      <aside className="flex w-[72px] shrink-0 flex-col items-center border-r border-border bg-card py-6">
        <Link
          to="/"
          className="mb-8 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary hover:bg-primary/15"
          aria-label="Return to map"
        >
          <Flame className="h-5 w-5" />
        </Link>
        <nav className="flex flex-1 flex-col gap-3">
          {[
            { icon: LayoutDashboard, label: "Command", path: "/command-center" },
            { icon: Grid3x3, label: "MindGraph", path: "/command-center" },
            { icon: Activity, label: "TruthEngine", path: "/command-center" },
            { icon: Database, label: "Watchtower", path: "/watchtower", active: true },
            { icon: Users, label: "Disputes", path: "/command-center" },
          ].map(({ icon: Icon, label, path, active }) => (
            <Link
              key={label}
              to={path}
              title={label}
              className={`flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
                active ? "border border-primary/25 bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-3 text-muted-foreground">
          <button className="rounded-md p-2 hover:bg-secondary hover:text-foreground" title="Compute">
            <Cpu className="h-4 w-4" />
          </button>
          <button className="rounded-md p-2 hover:bg-secondary hover:text-foreground" title="Settings">
            <Settings className="h-4 w-4" />
          </button>
          <button className="relative rounded-md p-2 hover:bg-secondary hover:text-foreground" title="Alerts">
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-card/70 px-6 py-4">
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              MoCenter / Sovereign Governance
            </p>
            <h1 className="text-xl font-semibold tracking-tight">Grid Watchtower</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-4 rounded-md border border-border bg-secondary px-3 py-2 text-[11px] text-muted-foreground md:flex">
              <span>SANCTIONED <strong className="text-primary">{sanctioned.length}</strong></span>
              <span>PENDING <strong className="text-phantom-amber">{pending.length}</strong></span>
              <span>FLAGGED <strong className="text-destructive">{flagged.length}</strong></span>
            </div>
            {usingSeed && (
              <span className="rounded-sm border border-[hsl(var(--phantom-amber))]/25 bg-[hsl(var(--phantom-amber))]/10 px-2 py-1 text-[10px] uppercase tracking-wider text-phantom-amber">
                Seed
              </span>
            )}
            <button
              type="button"
              onClick={fetchAgents}
              className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Scan
            </button>
            <button
              type="button"
              onClick={() => navigate("/command-center")}
              className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Command
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <section className="flex w-[420px] shrink-0 flex-col border-r border-border">
            <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border px-4 py-3">
              <Filter className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {filters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={`shrink-0 rounded-sm border px-2 py-1 text-[10px] font-semibold tracking-wider transition-colors ${
                    filter === item.value ? "border-primary/25 bg-primary/10 text-primary" : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Agents Detected
              </span>
              <span className="text-[10px] text-muted-foreground">{filteredAgents.length} total</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredAgents.map((agent) => {
                const selectedAgent = selected?.id === agent.id;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setSelected(agent)}
                    className={`w-full border-b border-border px-5 py-4 text-left transition-colors ${
                      selectedAgent ? "bg-primary/10 outline outline-1 outline-primary/20" : "hover:bg-secondary/50"
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <span className="text-[10px] text-muted-foreground">{agent.id}</span>
                      <StatusBadge status={agent.status} />
                    </div>
                    <h2 className="mb-1 text-sm font-semibold text-foreground">{agent.name}</h2>
                    <p className="mb-3 truncate text-xs text-muted-foreground">{agent.source}</p>
                    <TrustBar score={agent.trust_score} />
                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>ns:{agent.namespace}</span>
                      <span>{timeAgo(agent.created_at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="min-w-0 flex-1 overflow-hidden">
            {selected ? (
              <AssessmentPanel agent={selected} onAction={updateAgentStatus} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select an agent to assess
              </div>
            )}
          </section>
        </div>

        <section className="shrink-0 border-t border-border bg-card/80">
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Agents In Sanctuary
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {sanctioned.length} active, governance sealed
            </span>
          </div>
          <div className="max-h-44 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2 font-normal">Agent ID</th>
                  <th className="px-5 py-2 font-normal">Name</th>
                  <th className="px-5 py-2 font-normal">Namespace</th>
                  <th className="px-5 py-2 font-normal">Auth Level</th>
                  <th className="px-5 py-2 font-normal">Trust</th>
                  <th className="px-5 py-2 font-normal">Approved By</th>
                  <th className="px-5 py-2 font-normal">Last Sync</th>
                </tr>
              </thead>
              <tbody>
                {sanctioned.map((agent) => (
                  <tr
                    key={agent.id}
                    className="cursor-pointer border-b border-border text-muted-foreground hover:bg-secondary/50"
                    onClick={() => setSelected(agent)}
                  >
                    <td className="px-5 py-3 text-primary">{agent.id}</td>
                    <td className="px-5 py-3 text-foreground/80">{agent.name}</td>
                    <td className="px-5 py-3">{agent.namespace}</td>
                    <td className="px-5 py-3">
                      {agent.auth_level ? (
                        <span className={`font-semibold ${AUTH_META[agent.auth_level].text}`}>
                          {AUTH_META[agent.auth_level].label}
                        </span>
                      ) : (
                        "none"
                      )}
                    </td>
                    <td className="min-w-32 px-5 py-3">
                      <TrustBar score={agent.trust_score} />
                    </td>
                    <td className="px-5 py-3">{agent.approved_by ?? "unsealed"}</td>
                    <td className="px-5 py-3">{timeAgo(agent.last_sync)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
