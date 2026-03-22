/**
 * ◉⟁⬡  MoStar Industries
 * Data Conduit — Elemental Signal Intake
 */

import crypto from "node:crypto";
import { TRUTH_FLOORS } from "./signal.schemas.js";

export type Element = "🜂" | "🜄" | "🜁" | "🜃";

export const ELEMENTS: Record<Element, { name: string }> = {
  "🜂": { name: "Fire" },
  "🜄": { name: "Water" },
  "🜁": { name: "Air" },
  "🜃": { name: "Earth" },
};

export const DEMO_ELEMENTAL_SIGNALS = [
  { element: "🜂" as Element, volume: 14, truth: 0.92 },
  { element: "🜄" as Element, volume: 8,  truth: 0.88 },
  { element: "🜁" as Element, volume: 3,  truth: 0.74 },
  { element: "🜃" as Element, volume: 21, truth: 0.95 },
];

export function runConduitCycle(signals: { element: Element; volume: number; truth: number }[]) {
  const channels: Record<Element, { flowing: boolean; volume: number; avgTruth: number }> = {
    "🜂": { flowing: false, volume: 0, avgTruth: 0 },
    "🜄": { flowing: false, volume: 0, avgTruth: 0 },
    "🜁": { flowing: false, volume: 0, avgTruth: 0 },
    "🜃": { flowing: false, volume: 0, avgTruth: 0 },
  };

  signals.forEach(s => {
    const elementName = ELEMENTS[s.element].name.toLowerCase() as keyof typeof TRUTH_FLOORS;
    const floor = TRUTH_FLOORS[elementName] || 0.7;
    
    channels[s.element] = {
      flowing: s.volume > 0 && s.truth >= floor,
      volume: s.volume,
      avgTruth: s.truth,
    };
  });

  const elementsFlowing = Object.values(channels).filter(c => c.flowing).length;
  const conduitScore = Object.values(channels).reduce((acc, c) => acc + c.avgTruth, 0) / 4;

  return {
    channels,
    elementsFlowing,
    cycleComplete: true,
    conduitScore: parseFloat(conduitScore.toFixed(4)),
    readyForWoo: channels["🜂"].flowing,
    cycleId: `cycle-${crypto.randomBytes(4).toString("hex")}`,
  };
}
