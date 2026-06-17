import mapboxgl from "mapbox-gl";

export interface CorridorAnimState {
  active: boolean;
  progress: number;           // 0–1 (normalised to actual animation range)
  day: number;
  totalDays: number;
  week: number;
  month: number;
  year: number;
  dateLabel: string;          // e.g. "15 Mar 2024"
  dayLabel: string;           // "Day 12 of 90"
  weekLabel: string;          // "Week 2"
  monthLabel: string;         // "Month 1"
  corridorProgress: Record<string, number>;
}

export interface CorridorAnimator {
  start: (onUpdate: (state: CorridorAnimState) => void) => void;
  stop: () => void;
  seek: (position: number) => void;
  isActive: () => boolean;
}

const DEFAULT_TOTAL_DAYS = 90;
const MS_PER_DAY = 1000; // 1 real second = 1 simulated day

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function simDate(day: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + day);
  return d;
}

function formatDate(d: Date): string {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Create a corridor line-draw animator.
 * Each corridor is staggered so shorter / higher-risk corridors appear first.
 * Animation ends exactly when the last corridor line finishes drawing.
 */
export function createCorridorAnimator(
  map: mapboxgl.Map,
  phantomLayerIds: string[],
  corridorsMeta: { id: string; km: number; risk: string }[],
  opts?: { startDate?: Date; endDate?: Date }
): CorridorAnimator {
  let rafId: number | null = null;
  let active = false;
  let currentProgress = 0;
  let startTime = 0;
  let onUpdateCb: ((s: CorridorAnimState) => void) | null = null;

  // Build per-corridor timing: stagger start based on risk priority
  const riskOrder: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 0.08,
    ELEVATED: 0.18,
    MODERATE: 0.30,
    LOW: 0.40,
  };

  interface Timing { layerId: string; startAt: number; endAt: number; id: string }
  const timings: Timing[] = [];

  for (const lyrId of phantomLayerIds) {
    const cid = lyrId.replace("phantom-line-", "");
    const meta = corridorsMeta.find((m) => m.id === cid);
    const offset = riskOrder[meta?.risk ?? "LOW"] ?? 0.40;
    timings.push({
      layerId: lyrId,
      id: cid,
      startAt: offset,
      endAt: Math.min(1, offset + 0.55),
    });
  }

  // The animation ends when the last corridor finishes — not at progress=1
  const maxEndAt = timings.length > 0
    ? Math.max(...timings.map(t => t.endAt))
    : 1;

  const startDate = opts?.startDate ? new Date(opts.startDate) : new Date("2024-01-15T00:00:00Z");
  const endDate = opts?.endDate ? new Date(opts.endDate) : null;
  const derivedTotalDays = endDate
    ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)))
    : DEFAULT_TOTAL_DAYS;

  // Real duration scales to maxEndAt so timer and lines end together
  const realDurationMs = maxEndAt * derivedTotalDays * MS_PER_DAY;
  const effectiveTotalDays = Math.round(maxEndAt * derivedTotalDays);

  function buildState(rawProgress: number, isActive: boolean): CorridorAnimState {
    const day = Math.round(rawProgress * derivedTotalDays);
    const clampedDay = Math.min(day, effectiveTotalDays);
    const d = new Date(startDate);
    d.setDate(d.getDate() + clampedDay);
    const week = Math.floor(clampedDay / 7) + 1;
    const month = Math.floor(clampedDay / 30) + 1;
    // normalised 0–1 within the actual animation window
    const normProgress = Math.min(1, rawProgress / maxEndAt);

    return {
      active: isActive,
      progress: normProgress,
      day: clampedDay,
      totalDays: effectiveTotalDays,
      week,
      month,
      year: d.getFullYear(),
      dateLabel: formatDate(d),
      dayLabel: `Day ${clampedDay} of ${effectiveTotalDays}`,
      weekLabel: `Week ${week}`,
      monthLabel: `Month ${month}`,
      corridorProgress: {},
    };
  }

  function applyProgress(rawProgress: number) {
    currentProgress = rawProgress;
    const corridorProgress: Record<string, number> = {};

    for (const t of timings) {
      let p = 0;
      if (rawProgress >= t.endAt) {
        p = 1;
      } else if (rawProgress > t.startAt) {
        p = (rawProgress - t.startAt) / (t.endAt - t.startAt);
      }
      corridorProgress[t.id] = p;

      if (map.getLayer(t.layerId)) {
        map.setPaintProperty(t.layerId, "line-trim-offset", [0, 1 - p]);
      }
    }

    const state = buildState(rawProgress, active);
    state.corridorProgress = corridorProgress;
    onUpdateCb?.(state);
  }

  function animate(timestamp: number) {
    if (!active) return;
    if (startTime === 0) startTime = timestamp;

    // raw progress goes from 0 to maxEndAt (not 1) over realDurationMs
    const elapsed = timestamp - startTime;
    const rawProgress = Math.min(maxEndAt, (elapsed / realDurationMs) * maxEndAt);
    applyProgress(rawProgress);

    if (rawProgress >= maxEndAt) {
      active = false;
      const finalState = buildState(maxEndAt, false);
      onUpdateCb?.(finalState);
      return;
    }
    rafId = requestAnimationFrame(animate);
  }

  return {
    start(onUpdate) {
      onUpdateCb = onUpdate;
      active = true;
      currentProgress = 0;
      startTime = 0;
      applyProgress(0);
      rafId = requestAnimationFrame(animate);
    },

    stop() {
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      for (const t of timings) {
        if (map.getLayer(t.layerId)) {
          map.setPaintProperty(t.layerId, "line-trim-offset", [0, 0]);
        }
      }
      onUpdateCb?.(buildState(0, false));
    },

    seek(position: number) {
      const clamped = Math.max(0, Math.min(1, position));
      applyProgress(clamped * maxEndAt);
    },

    isActive() {
      return active;
    },
  };
}
