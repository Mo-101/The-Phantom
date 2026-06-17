import type { JsonRecord, MoScript } from '../runtime.js';

type Shipment = { forwarder: string; route?: string; cost?: number; deliveryDays?: number; onTime?: boolean; mode?: 'air' | 'sea' | 'road' | 'rail' };
function asShipments(value: unknown): Shipment[] { return Array.isArray(value) ? value.filter((row): row is Shipment => typeof row === 'object' && row !== null && 'forwarder' in row) : []; }

export function rankForwarders(shipmentData: unknown) {
  const shipments = asShipments(shipmentData);
  const groups = new Map<string, Shipment[]>();
  for (const shipment of shipments) { const list = groups.get(shipment.forwarder) ?? []; list.push(shipment); groups.set(shipment.forwarder, list); }
  const ranked = [...groups.entries()].map(([name, rows]) => {
    const avgDeliveryDays = rows.reduce((sum, r) => sum + (Number(r.deliveryDays) || 0), 0) / Math.max(rows.length, 1);
    const avgCost = rows.reduce((sum, r) => sum + (Number(r.cost) || 0), 0) / Math.max(rows.length, 1);
    const onTimeRate = rows.filter(r => r.onTime).length / Math.max(rows.length, 1);
    const score = Number((onTimeRate * 60 + Math.max(0, 30 - avgDeliveryDays) + Math.max(0, 10 - avgCost / 1000)).toFixed(2));
    return { name, shipments: rows.length, avgDeliveryDays, avgCost, onTimeRate, score };
  }).sort((a, b) => b.score - a.score);
  return { top: ranked[0] ?? null, ranked };
}

export function detectSavingsRoutes(shipmentData: unknown) {
  const shipments = asShipments(shipmentData);
  const routeMode = new Map<string, Shipment[]>();
  for (const shipment of shipments) {
    if (!shipment.route || !shipment.mode || typeof shipment.cost !== 'number') continue;
    const key = `${shipment.route}|${shipment.mode}`;
    const list = routeMode.get(key) ?? []; list.push(shipment); routeMode.set(key, list);
  }
  const byRoute = new Map<string, { mode: string; avgCost: number; count: number }[]>();
  for (const [key, rows] of routeMode.entries()) {
    const [route, mode] = key.split('|');
    const avgCost = rows.reduce((sum, r) => sum + (r.cost ?? 0), 0) / rows.length;
    const list = byRoute.get(route) ?? []; list.push({ mode, avgCost, count: rows.length }); byRoute.set(route, list);
  }
  const opportunities = [];
  for (const [route, modes] of byRoute.entries()) {
    if (modes.length < 2) continue;
    const sorted = modes.sort((a, b) => a.avgCost - b.avgCost);
    const cheapest = sorted[0]; const expensive = sorted[sorted.length - 1];
    const savingPct = expensive.avgCost > 0 ? ((expensive.avgCost - cheapest.avgCost) / expensive.avgCost) * 100 : 0;
    if (savingPct >= 10) opportunities.push({ route, fromMode: expensive.mode, toMode: cheapest.mode, savingPct: Number(savingPct.toFixed(2)), estimatedSavingPerShipment: Number((expensive.avgCost - cheapest.avgCost).toFixed(2)) });
  }
  return { count: opportunities.length, best: opportunities.sort((a, b) => b.savingPct - a.savingPct)[0] ?? null, opportunities };
}

export const mo_FWD_EFFICIENCY: MoScript<JsonRecord> = {
  id: 'mo-fwd-eff-001',
  name: 'Forwarder Efficiency Ranker',
  trigger: 'onCalculateResults',
  inputs: ['shipmentData'],
  logic: ({ shipmentData }) => rankForwarders(shipmentData),
  voiceLine: (result: any) => result.top ? `After scouring every shipment, the data speaks: ${result.top.name} leads the pack — part cheetah, part calculator.` : 'No forwarder data found. The cheetah stayed home.',
  sass: true,
};

export const mo_COST_ALERT: MoScript<JsonRecord> = {
  id: 'mo-cost-saver-007',
  name: 'Cost Optimization Oracle',
  trigger: 'onMonthlyTrendUpdate',
  inputs: ['shipmentData', 'historical'],
  logic: ({ shipmentData }) => detectSavingsRoutes(shipmentData),
  voiceLine: (result: any) => result.best ? `Ka-ching! ${result.best.savingPct}% drop spotted on ${result.best.route} if you swap ${result.best.fromMode} to ${result.best.toMode}.` : 'No material savings found. The money is hiding like a shy informant.',
  sass: true,
};
