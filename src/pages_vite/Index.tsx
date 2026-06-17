import { useState, useCallback } from "react";
import type { CorridorAnalysisResult, SignalSummary, MapParams } from "@/types/phantom";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { MapArea } from "@/components/dashboard/MapArea";
import { ChatPanel } from "@/components/dashboard/ChatPanel";
import { CorridorOverlay } from "@/components/dashboard/CorridorOverlay";
import { RadarIndicator } from "@/components/dashboard/RadarIndicator";
import { SignalBadge } from "@/components/dashboard/SignalBadge";
import { CorridorIntelPanel } from "@/components/dashboard/CorridorIntelPanel";
import type { useMapboxMap } from "@/hooks/useMapboxMap";

const Index = () => {
  const [radarActive, setRadarActive] = useState(false);
  const [monitoredId, setMonitoredId] = useState<string | null>(null);
  const [corridorAnalysis, setCorridorAnalysis] = useState<CorridorAnalysisResult | null>(null);
  const [signalData, setSignalData] = useState<SignalSummary | null>(null);
  const [mapHandlers, setMapHandlers] = useState<ReturnType<typeof useMapboxMap> | null>(null);

  const handleMapReady = useCallback((handlers: ReturnType<typeof useMapboxMap>) => {
    setMapHandlers(handlers);
  }, []);

  const handleMapQuery = useCallback(
    (params: MapParams) => {
      if (mapHandlers) {
        mapHandlers.handleMapQuery(params);
        if (params.radar || params.corridor) {
          setRadarActive(true);
          setMonitoredId(params.radar?.corridorId ?? params.corridor?.id ?? null);
        }
      }
      if (params.corridorAnalysis) setCorridorAnalysis(params.corridorAnalysis);
      if (params.signals) setSignalData(params.signals);
    },
    [mapHandlers]
  );

  const selectedCorridor = mapHandlers?.selectedCorridorId
    ? mapHandlers.corridorsMeta.find((c) => c.id === mapHandlers.selectedCorridorId) ?? null
    : null;

  const mb = mapHandlers;

  return (
    <div className="flex h-screen min-h-screen w-full overflow-hidden bg-background">
      <div className="relative flex min-h-0 flex-1 flex-col min-w-0">
        <DashboardHeader />

        <div className="relative min-h-0 flex-1">
          <MapArea onMapReady={handleMapReady} />

          {mb?.selectedCorridorId && (
            <CorridorIntelPanel
              corridorId={mb.selectedCorridorId}
              corridorName={selectedCorridor?.name}
              onClose={() => mb.setSelectedCorridorId(null)}
            />
          )}

          {radarActive && <RadarIndicator monitoredId={monitoredId} />}
          {corridorAnalysis && <CorridorOverlay analysis={corridorAnalysis} />}
          {signalData && <SignalBadge data={signalData} />}

          <ChatPanel onMapQuery={handleMapQuery} />


        </div>
      </div>
    </div>
  );
};

export default Index;
