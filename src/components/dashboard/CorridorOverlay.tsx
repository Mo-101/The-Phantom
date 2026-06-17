import type { CorridorAnalysisResult } from "@/types/phantom";

const SOURCE_COLORS: Record<string, string> = {
  ACLED: "bg-phantom-red/20 text-phantom-red",
  DTM: "bg-phantom-blue/20 text-phantom-blue",
  DHIS2: "bg-phantom-teal/20 text-phantom-teal",
  "AFRO-SENTINEL": "bg-phantom-amber/20 text-phantom-amber",
};

interface CorridorOverlayProps {
  analysis: CorridorAnalysisResult;
}

const riskColor = (risk: string) => {
  switch (risk?.toLowerCase()) {
    case "critical": return "text-phantom-red";
    case "high": return "text-phantom-amber";
    case "medium": return "text-phantom-blue";
    default: return "text-phantom-teal";
  }
};

const CorridorOverlay = ({ analysis }: CorridorOverlayProps) => {
  return (
    <div className="absolute top-4 left-4 z-10 w-96 max-h-[calc(100vh-8rem)] overflow-y-auto animate-fade-in-up">
      <div className="bg-card/95 border border-border rounded-lg backdrop-blur-sm overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono font-semibold text-phantom-green tracking-wide" title="Corridor identifier returned by the analysis engine.">
              {analysis.id}
            </span>
            <span className="text-xs font-mono px-2 py-1 rounded bg-secondary text-muted-foreground uppercase" title="Current latent state assigned by the analysis result.">
              {analysis.latentState ?? "unknown"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm font-mono text-muted-foreground">
            <span title="Region covered by this corridor analysis.">{analysis.region}</span>
            <span className={riskColor(analysis.riskClass ?? "")} title="Categorical risk class for this corridor.">
              {analysis.riskClass}
            </span>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-px bg-border">
          {[
            { label: "SCORE", value: analysis.score?.toFixed(4) },
            { label: "VELOCITY", value: analysis.velocity },
            { label: "DISTANCE", value: `${analysis.totalKm} km` },
            { label: "MODE", value: analysis.mode },
          ].map((m) => (
            <div key={m.label} className="bg-card px-3 py-2.5" title={metricTooltip(m.label)}>
              <span className="text-xs font-mono text-muted-foreground block">{m.label}</span>
              <span className="text-sm font-mono font-semibold text-foreground">{m.value ?? "—"}</span>
            </div>
          ))}
        </div>

        {/* Souls */}
        {analysis.souls && (
          <div className="px-4 py-3 border-t border-border">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider block mb-2" title="Model score decomposition across the Phantom mathematical axes.">
              7 Mathematical Souls
            </span>
            <div className="space-y-2">
              {Object.entries(analysis.souls).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2" title={`${key}: ${(val * 100).toFixed(0)}% contribution score`}>
                  <span className="text-xs font-mono text-muted-foreground w-24 uppercase truncate">{key}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-phantom-green/70 transition-all duration-500"
                      style={{ width: `${Math.min(val * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-foreground tabular-nums w-10 text-right">
                    {val.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Forecast */}
        {analysis.forecast && (
          <div className="px-4 py-3 border-t border-border">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider block mb-2" title="Forward-looking activation and drift estimate from the analysis payload.">
              Forecast
            </span>
            <div className="flex gap-4">
              <div title="Probability that this corridor activates or reactivates next.">
                <span className="text-xs font-mono text-muted-foreground block">NEXT ACTIVATION</span>
                <span className="text-sm font-mono font-semibold text-phantom-amber">
                  {((analysis.forecast.nextActivationLikelihood ?? 0) * 100).toFixed(0)}%
                </span>
              </div>
              <div title="Expected drift direction in compass degrees.">
                <span className="text-xs font-mono text-muted-foreground block">DRIFT</span>
                <span className="text-sm font-mono font-semibold text-foreground">
                  {analysis.forecast.driftDirectionDeg}°
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Nodes */}
        {analysis.nodes && analysis.nodes.length > 0 && (
          <div className="px-4 py-3 border-t border-border">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider block mb-2" title="Named nodes along the inferred corridor path.">
              Corridor Nodes
            </span>
            <div className="space-y-1.5">
              {analysis.nodes.map((node) => (
                <div key={node.id} className="flex items-center justify-between text-sm font-mono" title={`${node.name}: ${node.type.replace(/_/g, " ")}${node.risk ? `, ${node.risk}` : ""}`}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`inline-block w-2.5 h-2.5 flex-shrink-0 ${
                      node.type === "FORMAL_POE" ? "rotate-45 bg-[hsl(var(--phantom-blue))]" :
                      node.type === "PHANTOM_POE" ? "rounded-full bg-[hsl(var(--phantom-amber))] animate-pulse" :
                      "rounded-full bg-[hsl(var(--phantom-teal))]"
                    }`} />
                    <span className="text-foreground truncate max-w-[140px]">{node.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${
                      node.type === "FORMAL_POE" ? "text-phantom-blue" :
                      node.type === "PHANTOM_POE" ? "text-phantom-amber" :
                      "text-muted-foreground"
                    }`}>{node.type.replace(/_/g, " ")}</span>
                    {node.risk && <span className={riskColor(node.risk)}>{node.risk}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Evidence */}
        {analysis.evidence && analysis.evidence.length > 0 && (
          <div className="px-4 py-3 border-t border-border">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider block mb-2" title="Sources and confidence values used by the analysis result.">
              Evidence Provenance
            </span>
            <div className="space-y-2">
              {analysis.evidence.map((ev, i) => (
                <div key={i} className="text-sm font-mono" title={`${ev.source} ${ev.type}; truth score ${ev.truthScore}; location confidence ${ev.locationConfidence || "unknown"}`}>
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-semibold uppercase ${SOURCE_COLORS[ev.source] ?? "bg-secondary text-muted-foreground"}`}>
                        {ev.source}
                      </span>
                      <span className="text-muted-foreground">{ev.type}</span>
                    </div>
                    <span className="text-muted-foreground/60 tabular-nums">
                      t:{ev.truthScore}
                    </span>
                  </div>
                  {ev.locationConfidence && (
                    <span className="text-muted-foreground/40 text-xs">
                      {ev.locationConfidence}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trace lines */}
        {analysis.traceLines && analysis.traceLines.length > 0 && (
          <div className="px-4 py-3 border-t border-border">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider block mb-2" title="Step-by-step inference notes returned by the engine.">
              Inference Trace
            </span>
            <pre className="text-xs font-mono text-muted-foreground/80 whitespace-pre-wrap leading-relaxed">
              {analysis.traceLines.join("\n")}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

function metricTooltip(label: string): string {
  switch (label) {
    case "SCORE":
      return "Composite risk score for this corridor analysis.";
    case "VELOCITY":
      return "Estimated movement speed or activation velocity.";
    case "DISTANCE":
      return "Total inferred route length.";
    case "MODE":
      return "Dominant movement mode for the corridor.";
    default:
      return "Corridor analysis metric.";
  }
}

export { CorridorOverlay };
