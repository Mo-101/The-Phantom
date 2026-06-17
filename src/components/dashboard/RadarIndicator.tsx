interface RadarIndicatorProps {
  monitoredId: string | null;
}

const RadarIndicator = ({ monitoredId }: RadarIndicatorProps) => {
  return (
    <div className="absolute top-4 right-4 z-10 animate-fade-in-up">
      <div
        className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-card/90 border border-phantom-green/20 backdrop-blur-sm glow-green"
        title="Active monitoring target triggered by chat, MCP, or map query command."
      >
        <div className="relative w-5 h-5">
          <div className="absolute inset-0 rounded-full border border-phantom-green/40 animate-pulse-ring" />
          <div className="absolute inset-[3px] rounded-full bg-phantom-green/80" />
        </div>
        <span className="text-sm font-mono text-phantom-green tracking-wider uppercase">
          Active Monitoring: {monitoredId ?? "UNKNOWN"}
        </span>
      </div>
    </div>
  );
};

export { RadarIndicator };
