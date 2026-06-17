import { readAnyPublicEnv } from "@/lib/publicEnv";

export type DiseaseKind = "LASSA" | "CHOLERA" | "MENINGITIS" | "EBOLA" | "MEASLES" | "UNKNOWN";
export type DiseaseLayerKey = "ALL" | DiseaseKind;

export interface LiveSignal {
  id: string;
  laneId: string;
  lane: "LIVE" | "SANDBOX" | string;
  source: string;
  sourceRecordId?: string | null;
  type: string;
  disease: DiseaseKind | string;
  country?: string | null;
  admin1?: string | null;
  admin2?: string | null;
  location?: string | null;
  latitude: number;
  longitude: number;
  magnitude: number;
  truthScore: number;
  passedTruthFilter: boolean;
  timestamp: string;
  ingestedAt: string;
  corridorId?: string | null;
  fireGateActive?: boolean;
  fireTruthScore?: number | null;
}

export interface LiveSignalPollResult {
  lane: { id: string; lane: string; label?: string | null } | null;
  signals: LiveSignal[];
  count: number;
  since: string;
}

export interface LiveSignalPollOptions {
  since?: string;
  lane?: "LIVE" | "SANDBOX" | string;
  limit?: number;
  apiBaseUrl?: string;
}

export const LIVE_DISEASE_SOURCE_ID = "live-disease-signals";
export const LIVE_DISEASE_CIRCLE_LAYER_ID = "live-disease-signals-circles";
export const LIVE_DISEASE_LABEL_LAYER_ID = "live-disease-signals-labels";
export const LIVE_DISEASE_CHOROPLETH_SOURCE_ID = "live-disease-choropleth";
export const LIVE_DISEASE_CHOROPLETH_FILL_LAYER_ID = "live-disease-choropleth-fill";
export const LIVE_DISEASE_CHOROPLETH_OUTLINE_LAYER_ID = "live-disease-choropleth-outline";

export const DISEASE_STYLES: Record<DiseaseKind, { color: string; label: string }> = {
  LASSA: { color: "#EF4444", label: "Lassa" },
  CHOLERA: { color: "#22D3EE", label: "Cholera" },
  MENINGITIS: { color: "#F59E0B", label: "Meningitis" },
  EBOLA: { color: "#A855F7", label: "Ebola" },
  MEASLES: { color: "#F97316", label: "Measles" },
  UNKNOWN: { color: "#22C55E", label: "Health" },
};

export const DISEASE_LAYER_OPTIONS: Array<{ key: DiseaseLayerKey; label: string; color: string }> = [
  { key: "ALL", label: "All", color: "#E5E7EB" },
  ...Object.entries(DISEASE_STYLES).map(([key, style]) => ({
    key: key as DiseaseKind,
    label: style.label,
    color: style.color,
  })),
];

export function normalizeDisease(disease: string | null | undefined): DiseaseKind {
  const normalized = (disease ?? "UNKNOWN").trim().toUpperCase().replace(/\s+/g, "_");
  return normalized in DISEASE_STYLES ? (normalized as DiseaseKind) : "UNKNOWN";
}

export function getDiseaseStyle(disease: string | null | undefined) {
  return DISEASE_STYLES[normalizeDisease(disease)];
}

export function validateLaneIsolation(signals: LiveSignal[], expectedLane = "LIVE"): void {
  const mixed = signals.find((signal) => signal.lane !== expectedLane);
  if (mixed) {
    throw new Error(`Live signal lane isolation failed: expected ${expectedLane}, received ${mixed.lane}`);
  }
}

export function signalsToFeatureCollection(signals: LiveSignal[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: signals
      .filter((signal) => Number.isFinite(signal.latitude) && Number.isFinite(signal.longitude))
      .map((signal) => {
        const style = getDiseaseStyle(signal.disease);
        const magnitude = Number(signal.magnitude) || 0;
        const truthScore = Math.max(0, Math.min(1, Number(signal.truthScore) || 0));

        return {
          type: "Feature",
          id: signal.id,
          properties: {
            id: signal.id,
            laneId: signal.laneId,
            lane: signal.lane,
            source: signal.source,
            sourceRecordId: signal.sourceRecordId ?? "",
            type: signal.type,
            disease: normalizeDisease(signal.disease),
            diseaseLabel: style.label,
            country: signal.country ?? "",
            admin1: signal.admin1 ?? "",
            admin2: signal.admin2 ?? "",
            location: signal.location ?? "",
            magnitude,
            truthScore,
            passedTruthFilter: signal.passedTruthFilter,
            timestamp: signal.timestamp,
            ingestedAt: signal.ingestedAt,
            corridorId: signal.corridorId ?? "",
            color: style.color,
            radius: 7 + Math.min(15, Math.sqrt(Math.max(0, magnitude)) * 1.8),
            opacity: signal.passedTruthFilter ? 0.82 : 0.35,
            strokeWidth: 1 + truthScore * 2,
            label: `${style.label} ${Math.round(truthScore * 100)}`,
          },
          geometry: {
            type: "Point",
            coordinates: [signal.longitude, signal.latitude],
          },
        };
      }),
  };
}

export function signalsToChoroplethFeatureCollection(
  signals: LiveSignal[],
  cellSizeDegrees = 0.65
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const cells = new Map<
    string,
    {
      disease: DiseaseKind;
      diseaseLabel: string;
      color: string;
      minLng: number;
      minLat: number;
      maxLng: number;
      maxLat: number;
      casesTotal: number;
      signalCount: number;
      truthScoreTotal: number;
      latestTimestamp: string;
      country: string;
      admin1: string;
      admin2: string;
    }
  >();

  for (const signal of signals) {
    if (!Number.isFinite(signal.latitude) || !Number.isFinite(signal.longitude)) continue;

    const disease = normalizeDisease(signal.disease);
    const style = getDiseaseStyle(disease);
    const latIndex = Math.floor(signal.latitude / cellSizeDegrees);
    const lngIndex = Math.floor(signal.longitude / cellSizeDegrees);
    const minLat = latIndex * cellSizeDegrees;
    const minLng = lngIndex * cellSizeDegrees;
    const key = `${disease}:${lngIndex}:${latIndex}`;
    const magnitude = Math.max(1, Number(signal.magnitude) || 1);
    const truthScore = Math.max(0, Math.min(1, Number(signal.truthScore) || 0));
    const existing = cells.get(key);

    if (existing) {
      existing.casesTotal += magnitude;
      existing.signalCount += 1;
      existing.truthScoreTotal += truthScore;
      if (signal.timestamp > existing.latestTimestamp) existing.latestTimestamp = signal.timestamp;
      if (!existing.country && signal.country) existing.country = signal.country;
      if (!existing.admin1 && signal.admin1) existing.admin1 = signal.admin1;
      if (!existing.admin2 && signal.admin2) existing.admin2 = signal.admin2;
      continue;
    }

    cells.set(key, {
      disease,
      diseaseLabel: style.label,
      color: style.color,
      minLng,
      minLat,
      maxLng: minLng + cellSizeDegrees,
      maxLat: minLat + cellSizeDegrees,
      casesTotal: magnitude,
      signalCount: 1,
      truthScoreTotal: truthScore,
      latestTimestamp: signal.timestamp,
      country: signal.country ?? "",
      admin1: signal.admin1 ?? "",
      admin2: signal.admin2 ?? "",
    });
  }

  return {
    type: "FeatureCollection",
    features: [...cells.entries()].map(([id, cell]) => ({
      type: "Feature",
      id,
      properties: {
        id,
        disease: cell.disease,
        diseaseLabel: cell.diseaseLabel,
        color: cell.color,
        cases_total: Math.round(cell.casesTotal),
        signal_count: cell.signalCount,
        avg_truth_score: cell.signalCount > 0 ? cell.truthScoreTotal / cell.signalCount : 0,
        latest_reported_at: cell.latestTimestamp,
        country: cell.country,
        admin1: cell.admin1,
        admin2: cell.admin2,
        source_granularity: "LIVE_GRID_CELL",
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [cell.minLng, cell.minLat],
          [cell.maxLng, cell.minLat],
          [cell.maxLng, cell.maxLat],
          [cell.minLng, cell.maxLat],
          [cell.minLng, cell.minLat],
        ]],
      },
    })),
  };
}

function getApiBaseUrl(explicit?: string): string {
  const value = explicit ?? readAnyPublicEnv("NEXT_PUBLIC_API_BASE_URL", "VITE_API_BASE_URL") ?? "";
  return value.replace(/\/+$/, "");
}

export async function fetchLiveDiseaseSignals(options: LiveSignalPollOptions = {}): Promise<LiveSignalPollResult> {
  const base = getApiBaseUrl(options.apiBaseUrl);
  const url = new URL(`${base}/api/signals/live`, window.location.origin);

  if (options.since) url.searchParams.set("since", options.since);
  if (options.lane) url.searchParams.set("lane", options.lane);
  if (options.limit) url.searchParams.set("limit", String(options.limit));

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Live disease signals returned ${response.status}`);
  }

  const result = (await response.json()) as LiveSignalPollResult;
  validateLaneIsolation(result.signals ?? [], options.lane ?? "LIVE");
  return result;
}

export function startLivePolling(
  onResult: (result: LiveSignalPollResult) => void,
  onError: (error: Error) => void,
  options: LiveSignalPollOptions & { intervalMs?: number } = {}
) {
  let stopped = false;
  let interval: ReturnType<typeof setInterval> | null = null;
  let since = options.since;

  const tick = async () => {
    try {
      const result = await fetchLiveDiseaseSignals({ ...options, since });
      if (stopped) return;
      onResult(result);
      const newest = result.signals.reduce<string | null>((max, signal) => {
        const candidate = signal.ingestedAt || signal.timestamp;
        return !max || candidate > max ? candidate : max;
      }, null);
      if (newest) since = newest;
    } catch (error) {
      if (!stopped) onError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  void tick();
  interval = setInterval(tick, options.intervalMs ?? 30_000);

  return {
    refresh: tick,
    stop: () => {
      stopped = true;
      if (interval) clearInterval(interval);
    },
  };
}
