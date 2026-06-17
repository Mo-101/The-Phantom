import { Shield } from "lucide-react";

const DashboardHeader = () => {
  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-card/80 backdrop-blur-sm z-10">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span
            className="text-phantom-green font-mono text-xl font-bold tracking-tight glow-green-text select-none"
            title="Phantom POE operational mark for the corridor intelligence dashboard."
          >
            ◉⟁⬡
          </span>
          <div>
            <h1 className="text-base font-semibold tracking-wide text-foreground leading-none" title="Primary dashboard for phantom point-of-entry corridor intelligence.">
              PHANTOM POE ENGINE
            </h1>
            <p className="text-sm font-mono text-muted-foreground tracking-widest mt-0.5" title="Active intelligence lane and project identifier.">
              Corridor Intelligence · mo-border-phantom-001
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            window.location.href = "/command-center";
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-secondary/50 border border-border text-sm font-mono text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
          title="Open the command center view for analyst commands and system controls."
        >
          <Shield className="w-4 h-4" />
          Command Center
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-secondary border border-border" title="Dashboard runtime status indicator.">
          <span className="w-2 h-2 rounded-full bg-phantom-green animate-pulse" />
          <span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
            Live
          </span>
        </div>
        <div className="text-sm font-mono text-muted-foreground tabular-nums" title="Current UTC timestamp for the dashboard session.">
          {new Date().toISOString().slice(0, 19).replace("T", " ")} UTC
        </div>
      </div>
    </header>
  );
};

export { DashboardHeader };
