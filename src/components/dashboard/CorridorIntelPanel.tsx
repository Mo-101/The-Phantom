/**
 * MoStar Phantom XO — CorridorIntelPanel v2
 * moscript://codex/v1
 * agent: phantom-xo-intel-panel
 * sass: "The sidebar is the analyst's first question answered."
 *
 * Consumes CorridorIntelligenceViewModel — never raw DB rows.
 * Five sections: Age, Evolution, Usage, Evidence, Data Quality.
 * Explicit states: loading, live, partial, no_evidence, unavailable.
 * No placeholder numbers. No invented narrative.
 */

import { useEffect, useState } from "react";
import { X, Activity, TrendingUp, Users, Shield, Database, AlertTriangle, Eye, Mountain, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  buildCorridorIntelligence,
  type CorridorIntelligenceViewModel,
  type DataState,
} from "@/lib/corridorIntelViewModel";

interface CorridorIntelPanelProps {
  corridorId: string | null;
  corridorName?: string;
  onClose: () => void;
}

export function CorridorIntelPanel({ corridorId, corridorName, onClose }: CorridorIntelPanelProps) {
  const [vm, setVm] = useState<CorridorIntelligenceViewModel | null>(null);

  useEffect(() => {
    if (!corridorId) { setVm(null); return; }
    let cancelled = false;
    buildCorridorIntelligence(corridorId).then((result) => {
      if (!cancelled) setVm(result);
    });
    return () => { cancelled = true; };
  }, [corridorId]);

  if (!corridorId) return null;

  return (
    <div className="absolute top-4 left-4 z-20 w-80 max-h-[85vh] overflow-y-auto bg-card/95 border border-border rounded-lg backdrop-blur-md shadow-2xl">
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-md px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-mono font-semibold text-foreground truncate">
            {corridorName || vm?.corridorName || corridorId}
          </h3>
          {vm && vm.score != null && (
            <div className="flex items-center gap-2 mt-0.5">
              <RiskBadge risk={vm.riskClass} />
              <span
                className="text-[10px] font-mono text-muted-foreground tabular-nums"
                title="Composite corridor risk score from evidence, structural signals, and model inputs."
              >
                Score: {vm.score.toFixed(2)}
              </span>
              <StateBadge state={vm.latentState} />
            </div>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted/30 transition-colors flex-shrink-0" title="Close corridor intelligence panel">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="px-4 py-3 space-y-4">
        {!vm && <LoadingState />}
        {vm?.state === "unavailable" && <UnavailableState />}
        {vm?.state === "no_evidence" && <NoEvidenceState corridorId={corridorId} />}

        {vm && (vm.state === "live" || vm.state === "partial") && (
          <>
            {vm.state === "partial" && <PartialDataBanner />}

            {/* 1. Age & Origin */}
            <Section icon={<Activity className="w-3.5 h-3.5" />} title="Corridor Age & Origin" tip="When the corridor was first detected, when it last updated, total route distance, and primary movement mode.">
              {vm.age.firstDetected ? (
                <Prose>
                  Observed since <Strong>{formatDate(vm.age.firstDetected)}</Strong>
                  {vm.age.lastSeen && <>, last updated <Strong>{formatDate(vm.age.lastSeen)}</Strong></>}.
                  {vm.age.activeDurationDays != null && <> Active duration: <Strong>{vm.age.activeDurationDays} days</Strong>.</>}
                  {vm.distanceKm != null && <> Spans <Strong>{vm.distanceKm.toFixed(0)} km</Strong>{vm.gapKm != null && <> with a <Strong>{vm.gapKm.toFixed(0)} km</Strong> monitoring gap</>}.</>}
                  {vm.usage.mode && <> Primary mode: <Strong>{vm.usage.mode}</Strong>.</>}
                </Prose>
              ) : (
                <EmptyField label="Detection date not recorded" />
              )}
            </Section>

            {/* 2. Evolution */}
            <Section icon={<TrendingUp className="w-3.5 h-3.5" />} title="Evolution" tip="Temporal movement trend and whether formal/informal divergence is widening, stable, or declining.">
              {vm.evolution.summary ? (
                <>
                  <div className="flex items-center gap-2 mb-1.5">
                    <TrendIndicator trend={vm.evolution.trend} />
                    {vm.evolution.divergenceTrend && (
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground"
                        title="Direction of the gap between formal monitoring and inferred informal movement."
                      >
                        divergence {vm.evolution.divergenceTrend}
                      </span>
                    )}
                  </div>
                  <Prose>{vm.evolution.summary}</Prose>
                  {vm.evolution.formalVolume != null && vm.evolution.informalVolume != null && (
                    <DivergenceBar formal={vm.evolution.formalVolume} informal={vm.evolution.informalVolume} />
                  )}
                </>
              ) : (
                <EmptyField label="Insufficient temporal data for trend analysis" />
              )}
            </Section>

            {/* 3. Usage */}
            <Section icon={<Users className="w-3.5 h-3.5" />} title="Observed Usage" tip="Estimated movement behavior, likely user groups, dominant movement type, and crossing frequency when available.">
              {vm.usage.summary ? (
                <>
                  <Prose>{vm.usage.summary}</Prose>
                  {vm.usage.likelyUserGroups.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {vm.usage.likelyUserGroups.map((g) => (
                        <span key={g} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/20 text-foreground/60" title="Likely user group inferred from evidence types.">{g}</span>
                      ))}
                    </div>
                  )}
                  {vm.usage.crossingFrequency != null && (
                    <div className="mt-1.5 text-[10px] font-mono text-muted-foreground">
                      Est. daily crossings: <span className="text-foreground tabular-nums">{vm.usage.crossingFrequency}</span>
                    </div>
                  )}
                </>
              ) : (
                <EmptyField label="No usage patterns observed yet" />
              )}
            </Section>

            {/* Invisibility */}
            {vm.invisibility.index != null && (
              <Section icon={<Eye className="w-3.5 h-3.5" />} title="Invisibility" tip="How far the phantom route departs from formal roads, monitored gates, or known observation coverage.">
                <Prose>
                  {vm.invisibility.pctOffroad != null && vm.invisibility.pctOffroad > 80
                    ? `${vm.invisibility.pctOffroad.toFixed(0)}% of this corridor runs more than 1km from any formal road.`
                    : vm.invisibility.pctOffroad != null ? `${vm.invisibility.pctOffroad.toFixed(0)}% of vertices diverge from formal roads.` : ""}
                  {vm.invisibility.shortcutRatio != null && vm.invisibility.shortcutRatio < 0.6
                    ? ` The phantom path is ${((1 - vm.invisibility.shortcutRatio) * 100).toFixed(0)}% shorter than the formal route.` : ""}
                </Prose>
                <StatGrid>
                  <Stat label="Invisibility" value={`${(vm.invisibility.index * 100).toFixed(0)}%`} highlight tip="Percent-style score for how poorly formal systems observe this corridor." />
                  <Stat label="Mean dev." value={vm.invisibility.deviationMeanKm != null ? `${vm.invisibility.deviationMeanKm.toFixed(1)} km` : "\u2014"} tip="Average distance from the phantom route to its formal counterpart." />
                  <Stat label="Max dev." value={vm.invisibility.deviationMaxKm != null ? `${vm.invisibility.deviationMaxKm.toFixed(0)} km` : "\u2014"} tip="Largest observed distance from formal coverage along the selected corridor." />
                  <Stat label="Shortcut" value={vm.invisibility.shortcutRatio != null ? `${((1 - vm.invisibility.shortcutRatio) * 100).toFixed(0)}%` : "\u2014"} tip="How much shorter the inferred route is than the formal route." />
                </StatGrid>
              </Section>
            )}

            {/* Terrain */}
            {vm.terrain.landCover && (
              <Section icon={<Mountain className="w-3.5 h-3.5" />} title="Terrain" tip="Physical context that affects route friction: land cover, slope, rivers, canoe requirement, and seasonal phase.">
                <Prose>
                  Land cover: <Strong>{vm.terrain.landCover}</Strong>.
                  {vm.terrain.avgSlope != null && <> Slope: <Strong>{vm.terrain.avgSlope.toFixed(1)}\u00b0</Strong>.</>}
                  {vm.terrain.hasRiver && <> River crossing{vm.terrain.riverWidthM ? ` (~${vm.terrain.riverWidthM.toFixed(0)}m)` : ""}.</>}
                  {vm.terrain.requiresCanoe && " Canoe required."}
                  {vm.terrain.seasonalPhase && <> Season: <Strong>{vm.terrain.seasonalPhase}</Strong>.</>}
                </Prose>
              </Section>
            )}

            {/* Entropy */}
            {vm.entropySpikes.length > 0 && (
              <Section icon={<AlertTriangle className="w-3.5 h-3.5" />} title="Entropy Spikes" tip="Nodes where signal disorder or sudden change is elevated compared with normal corridor behavior.">
                <Prose>{vm.entropySpikes.length} node{vm.entropySpikes.length > 1 ? "s" : ""} showing elevated signal entropy.</Prose>
                <div className="space-y-1 mt-1.5">
                  {vm.entropySpikes.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-foreground/80">{s.nodeId}</span>
                      <span className={s.riskClass === "CRITICAL" ? "text-red-400" : "text-orange-400"}>\u0394H {s.deltaH.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* 4. Evidence & Credibility */}
            <Section icon={<Shield className="w-3.5 h-3.5" />} title="Evidence & Credibility" tip="Signal count, source mix, strongest detections, and confidence explanation for the corridor assessment.">
              {vm.evidence.signalCount > 0 ? (
                <>
                  <Prose>{vm.evidence.confidenceExplanation}</Prose>
                  {vm.evidence.sourceTypes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {vm.evidence.sourceTypes.map((s) => (
                        <span key={s} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/20 text-foreground/60" title="Evidence source family contributing to this assessment.">{s}</span>
                      ))}
                    </div>
                  )}
                  {vm.evidence.strongest.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Strongest detections</p>
                      {vm.evidence.strongest.slice(0, 3).map((d, i) => (
                        <div key={i} className="text-[11px] font-mono">
                          <div className="flex items-start gap-1.5">
                            <span className="w-1.5 h-1.5 mt-1 rounded-full flex-shrink-0 bg-amber-400" />
                            <span className="text-foreground/80">{d.summary || d.type}</span>
                          </div>
                          {d.timestamp && <span className="text-[9px] text-muted-foreground ml-3">{formatDate(d.timestamp)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <StatGrid>
                    <Stat label="Signals" value={vm.evidence.signalCount} tip="Number of signal observations attached to this corridor." />
                    <Stat label="Evidence" value={vm.evidence.count} tip="Number of evidence records used in the intelligence view." />
                  </StatGrid>
                </>
              ) : (
                <EmptyField label="No evidence signals recorded" />
              )}
            </Section>

            {/* 5. Data Quality */}
            <Section icon={<Database className="w-3.5 h-3.5" />} title="Data Quality" tip="Completeness, freshness, active lane mode, and remaining data gaps for this corridor.">
              <StatGrid>
                <Stat label="Completeness" value={vm.dataQuality.evidenceCompleteness} tip="How much evidence is available relative to what the view model expects." />
                <Stat label="Freshness" value={vm.dataQuality.sourceFreshness} tip="Whether the latest source run is current, stale, or unknown." />
                <Stat label="Mode" value={vm.dataQuality.laneMode} tip="Current data lane classification: live, sandbox, test, or unknown." />
                <Stat label="Gaps" value={vm.dataQuality.unresolvedGaps.length} tip="Known unresolved data gaps for this corridor." />
              </StatGrid>
              {vm.dataQuality.unresolvedGaps.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {vm.dataQuality.unresolvedGaps.map((gap, i) => (
                    <p key={i} className="text-[9px] font-mono text-muted-foreground/60">\u00b7 {gap}</p>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

/* ── State indicators ── */
function LoadingState() {
  return (
    <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground py-4">
      <div className="w-3 h-3 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
      Querying intelligence\u2026
    </div>
  );
}
function UnavailableState() {
  return (
    <div className="py-4 text-center">
      <Database className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
      <p className="text-xs font-mono text-muted-foreground">Data source unavailable</p>
      <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">Neon database connection failed.</p>
    </div>
  );
}
function NoEvidenceState({ corridorId }: { corridorId: string }) {
  return (
    <div className="py-4 text-center">
      <Shield className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
      <p className="text-xs font-mono text-muted-foreground">No evidence yet</p>
      <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">Corridor {corridorId} has no intelligence data. Ingestion pipeline may not have reached this corridor.</p>
    </div>
  );
}
function PartialDataBanner() {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20">
      <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
      <span className="text-[10px] font-mono text-amber-400">Partial evidence \u2014 some data sources not yet available</span>
    </div>
  );
}

/* ── Primitives ── */
function Section({ icon, title, tip, children }: { icon: React.ReactNode; title: string; tip: string; children: React.ReactNode }) {
  return (
    <div className="pt-2 border-t border-border first:pt-0 first:border-t-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-muted-foreground">{icon}</span>
        <h4 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider font-semibold">{title}</h4>
        <InfoTip text={tip} />
      </div>
      {children}
    </div>
  );
}
function Prose({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-mono text-foreground/70 leading-relaxed">{children}</p>;
}
function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="text-foreground/90">{children}</strong>;
}
function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">{children}</div>;
}
function Stat({ label, value, highlight, tip }: { label: string; value: string | number; highlight?: boolean; tip: string }) {
  return (
    <div className="flex justify-between text-[10px] font-mono gap-2" title={tip}>
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "text-red-400 font-semibold" : "text-foreground tabular-nums"}>{value}</span>
    </div>
  );
}
function EmptyField({ label }: { label: string }) {
  return <p className="text-[10px] font-mono text-muted-foreground/50 italic">{label}</p>;
}
function RiskBadge({ risk }: { risk: string | null }) {
  if (!risk) return null;
  const cls = risk === "CRITICAL" ? "bg-red-500/20 text-red-400" : risk === "HIGH" ? "bg-orange-500/20 text-orange-400" : risk === "MEDIUM" ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400";
  return <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${cls}`} title="Categorical risk class derived from the corridor score and evidence profile.">{risk}</span>;
}
function StateBadge({ state }: { state: string | null }) {
  if (!state) return null;
  return <span className="text-[9px] font-mono text-muted-foreground/60" title="Current latent state assigned by corridor intelligence.">{state === "active_crossing" ? "\u25c9 active" : state === "surge" ? "\u25c9 surge" : "\u25cb " + state}</span>;
}
function TrendIndicator({ trend }: { trend: string }) {
  const label = trend === "rising" ? "\u2191 Rising" : trend === "declining" ? "\u2193 Declining" : trend === "stable" ? "\u2192 Stable" : "? Unknown";
  const cls = trend === "rising" ? "text-red-400" : trend === "declining" ? "text-green-400" : "text-muted-foreground";
  return <span className={`text-[10px] font-mono font-semibold ${cls}`} title="Recent direction of corridor signal activity.">{label}</span>;
}
function DivergenceBar({ formal, informal }: { formal: number; informal: number }) {
  const total = formal + informal;
  const formalPct = total > 0 ? (formal / total) * 100 : 50;
  return (
    <div className="mt-2">
      <div className="flex h-2 rounded-full overflow-hidden border border-border" title="Blue is formal observed volume. Red is inferred informal volume.">
        <div className="bg-blue-500" style={{ width: `${formalPct}%` }} />
        <div className="bg-red-500/60" style={{ width: `${100 - formalPct}%` }} />
      </div>
      <div className="flex justify-between mt-1 text-[9px] font-mono">
        <span className="text-blue-400">{formal} formal</span>
        <span className="text-red-400">{informal.toLocaleString()} informal</span>
      </div>
    </div>
  );
}
function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="w-3 h-3 text-muted-foreground/50 hover:text-foreground/80 shrink-0" />
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[260px] text-xs font-mono leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "unknown";
  try { return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return dateStr; }
}
