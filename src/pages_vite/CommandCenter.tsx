import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, Radio, Activity, AlertTriangle, Zap, Eye, ChevronRight,
  Globe, Lock, Database, Cpu, ArrowLeft, BarChart3, Fingerprint,
  Network, Target, Brain, TrendingUp, Waves
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/* ── Mock data ── */
const CORRIDORS = [
  { id: "C-NG-001", name: "Baga → Diffa", risk: "CRITICAL", score: 91, mode: "canoe", hmm: "surge", signals: 847, delta: "+12" },
  { id: "C-CD-003", name: "Goma → Gisenyi", risk: "CRITICAL", score: 89, mode: "foot", hmm: "surge", signals: 1203, delta: "+8" },
  { id: "C-NG-002", name: "Gwoza → Mora", risk: "CRITICAL", score: 87, mode: "foot/truck", hmm: "active", signals: 634, delta: "+5" },
  { id: "C-SD-001", name: "Renk → Ed Damazin", risk: "CRITICAL", score: 85, mode: "truck", hmm: "surge", signals: 512, delta: "+15" },
  { id: "C-ET-001", name: "Metema → Gallabat", risk: "CRITICAL", score: 83, mode: "mixed", hmm: "active", signals: 389, delta: "+3" },
  { id: "C-CD-001", name: "Mbandaka → Impfondo", risk: "HIGH", score: 78, mode: "canoe", hmm: "active", signals: 445, delta: "+7" },
  { id: "C-CD-002", name: "Gbadolite → Bangui", risk: "HIGH", score: 76, mode: "canoe", hmm: "probing", signals: 298, delta: "+2" },
  { id: "C-SS-001", name: "Kapoeta → Lodwar", risk: "HIGH", score: 74, mode: "livestock", hmm: "active", signals: 356, delta: "+4" },
  { id: "C-SS-002", name: "Malakal → Gambela", risk: "HIGH", score: 71, mode: "foot", hmm: "probing", signals: 267, delta: "+1" },
  { id: "C-CD-004", name: "Luiza → Kasumbalesa", risk: "HIGH", score: 69, mode: "foot/truck", hmm: "probing", signals: 234, delta: "+6" },
  { id: "C-SO-001", name: "Dolo → Baidoa", risk: "MEDIUM", score: 64, mode: "truck", hmm: "dormant", signals: 178, delta: "-2" },
  { id: "C-SO-002", name: "Bossaso → Aden", risk: "MEDIUM", score: 61, mode: "sea", hmm: "probing", signals: 145, delta: "+1" },
  { id: "C-NG-003", name: "Banki → Amchide", risk: "MEDIUM", score: 58, mode: "foot", hmm: "dormant", signals: 423, delta: "-1" },
  { id: "C-CD-005", name: "Cazombo → Luau", risk: "MEDIUM", score: 55, mode: "foot", hmm: "dormant", signals: 112, delta: "0" },
];

const DETECTION_EVENTS = [
  { id: "DET-001", severity: "critical", time: "2m ago", summary: "Surge detected: C-NG-001 Baga→Diffa score +12 in 48h", corridor: "C-NG-001" },
  { id: "DET-002", severity: "critical", time: "18m ago", summary: "New phantom POE activated near Renk (SD→ET corridor)", corridor: "C-SD-001" },
  { id: "DET-003", severity: "high", time: "1h ago", summary: "Entropy spike at Goma node — 3 new signal sources", corridor: "C-CD-003" },
  { id: "DET-004", severity: "medium", time: "3h ago", summary: "Canoe traffic +40% on Ubangi River corridor", corridor: "C-CD-002" },
  { id: "DET-005", severity: "low", time: "6h ago", summary: "IOM FMP Nimule reports normal flow patterns", corridor: null },
];

const ENTROPY_NODES = [
  { node: "Goma", hBaseline: 2.1, hCurrent: 3.8, deltaH: 1.7, spiked: true, signals: 1203 },
  { node: "Baga", hBaseline: 1.8, hCurrent: 3.2, deltaH: 1.4, spiked: true, signals: 847 },
  { node: "Renk", hBaseline: 1.5, hCurrent: 2.8, deltaH: 1.3, spiked: true, signals: 512 },
  { node: "Metema", hBaseline: 2.0, hCurrent: 2.6, deltaH: 0.6, spiked: false, signals: 389 },
  { node: "Kapoeta", hBaseline: 1.2, hCurrent: 1.7, deltaH: 0.5, spiked: false, signals: 356 },
  { node: "Mbandaka", hBaseline: 1.9, hCurrent: 2.3, deltaH: 0.4, spiked: false, signals: 445 },
];

const SOUL_WEIGHTS = [
  { name: "gravity", weight: 0.20, icon: Target },
  { name: "diffusion", weight: 0.15, icon: Waves },
  { name: "centrality", weight: 0.15, icon: Network },
  { name: "hmm", weight: 0.15, icon: Brain },
  { name: "seasonal", weight: 0.10, icon: TrendingUp },
  { name: "linguistic", weight: 0.10, icon: Fingerprint },
  { name: "entropy", weight: 0.10, icon: Zap },
  { name: "terrain", weight: 0.05, icon: Globe },
];

type Tab = "command" | "corridors" | "truth" | "entropy" | "souls";

const RISK_COLORS: Record<string, string> = {
  CRITICAL: "text-destructive",
  HIGH: "text-[hsl(var(--phantom-amber))]",
  MEDIUM: "text-yellow-400",
  LOW: "text-primary",
};

const RISK_BG: Record<string, string> = {
  CRITICAL: "bg-destructive/10 border-destructive/30 text-destructive",
  HIGH: "bg-[hsl(var(--phantom-amber))]/10 border-[hsl(var(--phantom-amber))]/30 text-[hsl(var(--phantom-amber))]",
  MEDIUM: "bg-yellow-400/10 border-yellow-400/30 text-yellow-400",
  LOW: "bg-primary/10 border-primary/30 text-primary",
};

const HMM_COLORS: Record<string, string> = {
  surge: "text-destructive",
  active: "text-[hsl(var(--phantom-blue))]",
  probing: "text-[hsl(var(--phantom-amber))]",
  dormant: "text-muted-foreground",
  dissipating: "text-purple-400",
};

const SEV_COLORS: Record<string, string> = {
  critical: "border-l-destructive bg-destructive/5",
  high: "border-l-[hsl(var(--phantom-amber))] bg-[hsl(var(--phantom-amber))]/5",
  medium: "border-l-yellow-400 bg-yellow-400/5",
  low: "border-l-primary bg-primary/5",
};

const CommandCenter = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("command");
  const [riskFilter, setRiskFilter] = useState<string>("all");

  const filteredCorridors = riskFilter === "all"
    ? CORRIDORS
    : CORRIDORS.filter((c) => c.risk === riskFilter.toUpperCase());

  const tabs: { id?: Tab; label: string; icon: typeof Shield; badge?: number; path?: string }[] = [
    { id: "command", label: "Command Center", icon: Shield },
    { id: "corridors", label: "Corridor Registry", icon: Radio, badge: CORRIDORS.length },
    { id: "truth", label: "Truth Engine", icon: Eye },
    { id: "entropy", label: "Entropy Monitor", icon: Zap },
    { id: "souls", label: "Soul Weights", icon: Fingerprint },
    { label: "Watchtower", icon: Database, path: "/watchtower" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-mono">
      {/* Grid background */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(hsl(var(--border)) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)
          `,
          backgroundSize: "20px 20px",
        }}
      />

      {/* Header */}
      <header className="relative z-10 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Map
            </button>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-2.5">
              <span className="text-primary font-mono text-lg font-bold tracking-tight select-none">
                ◉⟁⬡
              </span>
              <div>
                <h1 className="text-sm font-semibold tracking-wide text-foreground leading-none">
                  COMMAND CENTER
                </h1>
                <p className="text-[10px] font-mono text-muted-foreground tracking-widest mt-0.5">
                  Phantom POE Engine v2.1
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary border border-border">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Live
              </span>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground tabular-nums">
              {new Date().toISOString().slice(0, 19).replace("T", " ")} UTC
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-5 py-2 border-t border-border bg-card/50">
          <div className="flex items-center gap-6 text-[10px] font-mono text-muted-foreground">
            <span>CORRIDORS: <strong className="text-foreground">{CORRIDORS.length}</strong></span>
            <span>SIGNALS: <strong className="text-foreground">6,348</strong></span>
            <span>ENTROPY: <strong className="text-destructive">3 SPIKES</strong></span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            POLLING ACTIVE
            <span className="text-muted-foreground/50">30s ago</span>
          </div>
        </div>
      </header>

      <div className="relative z-10 flex">
        {/* Sidebar nav */}
        <nav className="w-56 border-r border-border bg-card/50 min-h-[calc(100vh-5.5rem)] p-3 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id ?? tab.path}
              onClick={() => (tab.path ? navigate(tab.path) : setActiveTab(tab.id as Tab))}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs transition-all ${
                tab.id && activeTab === tab.id
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.badge && (
                <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}

          {/* Boot layers */}
          <div className="pt-4 mt-4 border-t border-border">
            <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-2 px-3">
              Boot Layers
            </p>
            {[
              { name: "Database", ok: true },
              { name: "Signal Repo", ok: true },
              { name: "Edge Functions", ok: true },
              { name: "Mapbox Hybrid", ok: true },
            ].map((l) => (
              <div key={l.name} className="flex items-center justify-between px-3 py-1 text-[10px] text-muted-foreground">
                <span>{l.name}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${l.ok ? "bg-primary" : "bg-destructive"}`} />
              </div>
            ))}
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 p-6 overflow-auto max-h-[calc(100vh-5.5rem)]">
          {activeTab === "command" && <CommandTab />}
          {activeTab === "corridors" && (
            <CorridorsTab corridors={filteredCorridors} riskFilter={riskFilter} setRiskFilter={setRiskFilter} />
          )}
          {activeTab === "truth" && <TruthTab />}
          {activeTab === "entropy" && <EntropyTab />}
          {activeTab === "souls" && <SoulsTab />}
        </main>
      </div>
    </div>
  );
};

/* ── Command Tab ── */
function CommandTab() {
  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "ACTIVE CORRIDORS", value: "14", sub: "Across 7 countries", icon: Radio, color: "text-primary" },
          { label: "CRITICAL RISK", value: "5", sub: "Surge state detected", icon: AlertTriangle, color: "text-destructive" },
          { label: "TRUTH RATE", value: "94.2%", sub: "6,348 signals validated", icon: Eye, color: "text-primary" },
          { label: "PHANTOM POEs", value: "23", sub: "Inferred crossings", icon: Zap, color: "text-[hsl(var(--phantom-amber))]" },
        ].map((s) => (
          <Card key={s.label} className="bg-card/80 border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">{s.label}</span>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className={`text-3xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detection events */}
      <Card className="bg-card/80 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Detection Events
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {DETECTION_EVENTS.map((ev) => (
            <div
              key={ev.id}
              className={`flex items-start gap-3 px-3 py-2.5 rounded border-l-2 ${SEV_COLORS[ev.severity]}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs leading-relaxed">{ev.summary}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {ev.time} {ev.corridor && `· ${ev.corridor}`}
                </p>
              </div>
              <Badge variant="outline" className="text-[9px] shrink-0 uppercase">
                {ev.severity}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Top corridors preview */}
      <Card className="bg-card/80 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary" />
            Top 5 Corridors by Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {CORRIDORS.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded bg-secondary/30 border border-border/50">
                <span className={`text-lg font-bold tabular-nums w-10 ${RISK_COLORS[c.risk]}`}>{c.score}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground">{c.id} · {c.mode}</p>
                </div>
                <Badge className={`text-[9px] border ${RISK_BG[c.risk]}`} variant="outline">
                  {c.risk}
                </Badge>
                <span className={`text-[10px] font-mono ${HMM_COLORS[c.hmm]}`}>{c.hmm}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Corridors Tab ── */
function CorridorsTab({
  corridors,
  riskFilter,
  setRiskFilter,
}: {
  corridors: typeof CORRIDORS;
  riskFilter: string;
  setRiskFilter: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Corridor Registry</h2>
        <div className="flex gap-1.5">
          {["all", "critical", "high", "medium"].map((f) => (
            <button
              key={f}
              onClick={() => setRiskFilter(f)}
              className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${
                riskFilter === f
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground bg-secondary/50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {corridors.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-4 px-4 py-3 rounded-lg bg-card/80 border border-border hover:border-border/80 transition-all hover:-translate-y-px cursor-pointer"
          >
            <div className={`text-xl font-bold tabular-nums w-12 text-center ${RISK_COLORS[c.risk]}`}>
              {c.score}
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium">{c.name}</p>
                <Badge className={`text-[9px] border ${RISK_BG[c.risk]}`} variant="outline">
                  {c.risk}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {c.id} · {c.mode} · {c.signals} signals · Δ{c.delta}
              </p>
            </div>
            <span className={`text-[10px] font-mono uppercase tracking-wider ${HMM_COLORS[c.hmm]}`}>
              {c.hmm}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Truth Tab ── */
function TruthTab() {
  return (
    <div className="space-y-6">
      <Card className="bg-card/80 border-border">
        <CardContent className="p-5">
          <p className="text-[10px] font-mono text-primary uppercase tracking-widest mb-2">Truth Engine Mandate</p>
          <blockquote className="text-xs italic text-muted-foreground border-l-2 border-primary/30 pl-3">
            "No mocked or stale signal may cross into operational inference."
          </blockquote>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Signals", value: "6,348", icon: Database },
          { label: "Truth Passed (>0.70)", value: "5,974", icon: Eye },
          { label: "Rejected", value: "374", icon: Lock },
        ].map((s) => (
          <Card key={s.label} className="bg-card/80 border-border">
            <CardContent className="p-4 text-center">
              <s.icon className="w-5 h-5 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold tabular-nums">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Validation gates */}
      <Card className="bg-card/80 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Validation Gates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { name: "Freshness Gate", desc: "Signal age < 14 days", passed: 6102, failed: 246, rate: 96.1 },
            { name: "Geo-Coherence Gate", desc: "Location within ±0.5° of known corridor", passed: 5989, failed: 359, rate: 94.3 },
            { name: "Source Diversity Gate", desc: "≥2 independent sources confirm", passed: 5974, failed: 374, rate: 94.1 },
            { name: "Mock Detection Gate", desc: "Synthetic/test signals flagged", passed: 6340, failed: 8, rate: 99.9 },
          ].map((g) => (
            <div key={g.name} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">{g.name}</p>
                  <p className="text-[10px] text-muted-foreground">{g.desc}</p>
                </div>
                <span className="text-xs font-mono tabular-nums text-primary">{g.rate}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${g.rate}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Entropy Tab ── */
function EntropyTab() {
  return (
    <div className="space-y-6">
      <Card className="bg-card/80 border-border">
        <CardContent className="p-5">
          <p className="text-[10px] font-mono text-primary uppercase tracking-widest mb-2">Entropy Detection</p>
          <p className="text-xs text-muted-foreground">
            Shannon entropy H computed per geographic node. 4-week baseline vs current window. Spike threshold: ΔH &gt; 0.8
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {ENTROPY_NODES.map((n) => (
          <div
            key={n.node}
            className={`flex items-center gap-4 px-4 py-3 rounded-lg border transition-all ${
              n.spiked
                ? "bg-destructive/5 border-destructive/30"
                : "bg-card/80 border-border"
            }`}
          >
            <div className="w-16">
              <p className="text-xs font-medium">{n.node}</p>
              <p className="text-[10px] text-muted-foreground">{n.signals} signals</p>
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                <span>H₀ = {n.hBaseline.toFixed(2)}</span>
                <span>→</span>
                <span className={n.spiked ? "text-destructive font-bold" : ""}>
                  H = {n.hCurrent.toFixed(2)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${n.spiked ? "bg-destructive" : "bg-[hsl(var(--phantom-amber))]"}`}
                  style={{ width: `${Math.min(100, (n.deltaH / 2) * 100)}%` }}
                />
              </div>
            </div>
            <div className={`text-sm font-bold tabular-nums ${n.spiked ? "text-destructive" : "text-[hsl(var(--phantom-amber))]"}`}>
              ΔH {n.deltaH.toFixed(2)}
            </div>
            {n.spiked && (
              <Badge variant="destructive" className="text-[9px]">
                SPIKE
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Souls Tab ── */
function SoulsTab() {
  return (
    <div className="space-y-6">
      <Card className="bg-card/80 border-border">
        <CardContent className="p-5">
          <p className="text-[10px] font-mono text-primary uppercase tracking-widest mb-2">Soul-Weighted Scoring</p>
          <p className="text-xs text-muted-foreground">
            Each corridor score is a weighted sum of 8 "soul" models. Weights are tuned based on operational feedback.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {SOUL_WEIGHTS.map((s) => (
          <div
            key={s.name}
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-card/80 border border-border"
          >
            <s.icon className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium capitalize">{s.name}</p>
                <span className="text-xs font-mono text-muted-foreground tabular-nums">
                  {(s.weight * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/70 transition-all"
                  style={{ width: `${s.weight * 100 * 5}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CommandCenter;
