// ─────────────────────────────────────────────────────────────────
// PHANTOM POE ENGINE — Disease Heatmap Overlay Manager
// MoStar Industries · Phantom POE · Nigeria CDC SORMAS-Anonymized Data Integration
//
// Pulls heatmap layers from your two Mapbox styles and overlays
// them onto the existing Phantom hybrid map as toggleable layers.
// Phantom base map is NEVER replaced — overlays sit on top.
// ─────────────────────────────────────────────────────────────────

import mapboxgl from 'mapbox-gl';
import { readAnyPublicEnv } from '@/lib/publicEnv';

const TOKEN = readAnyPublicEnv(
  "NEXT_PUBLIC_MAPBOX_TOKEN",
  "VITE_MAPBOX_TOKEN",
  "MAPBOX_ACCESS_TOKEN"
);

const OVERLAY_INSERT_BEFORE_IDS = [
  'ituri-crisis-glow',
  'ituri-crisis-corridor',
  'corridor-nodes-circle',
  'formal-routes-line',
  'phantom-poes-circle',
  'official-poes-circle',
  'iom-fmps-circle',
];

// ── The two disease heatmap styles to overlay ───────────────────
export const DISEASE_OVERLAYS = {
  STYLE_V1: {
    id:         'overlay-style-v1',
    label:      'Disease Heat v1',
    styleUrl:   'mapbox://styles/akanimo1/cmn4h8n0q000201qse0fxfdwt',
    color:      '#f1ee06',
  },
  STYLE_V2: {
    id:         'overlay-style-v2',
    label:      'Disease Heat v2',
    styleUrl:   'mapbox://styles/akanimo1/cmq90fvm9001f01qz904x4eyu',
    color:      '#07f34e',
  },
} as const;

export type OverlayKey = keyof typeof DISEASE_OVERLAYS;
export type MapMode = 'base' | OverlayKey;

// ── Track what's loaded ───────────────────────────────────────────
const _loaded = new Set<OverlayKey>();
const _styleData = new Map<OverlayKey, any>();

// ── Fetch style JSON to extract sources and layers ───────────────
async function fetchStyle(styleUrl: string): Promise<any> {
  const url = `https://api.mapbox.com/styles/v1/${styleUrl.replace('mapbox://styles/', '')}?access_token=${TOKEN}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch style: ${response.statusText}`);
  return response.json();
}

function getOverlayBeforeId(map: mapboxgl.Map): string | undefined {
  return OVERLAY_INSERT_BEFORE_IDS.find((id) => map.getLayer(id));
}

function canInjectLayer(layer: any): boolean {
  if (!layer?.id || !layer?.type) return false;
  if (layer.type === 'background' || layer.type === 'sky') return false;
  return Boolean(layer.source);
}

// ── Add a single overlay (sources + layers from style) ─────────────
async function addOverlay(map: mapboxgl.Map, key: OverlayKey, visible: boolean) {
  const cfg = DISEASE_OVERLAYS[key];

  try {
    // Fetch the style to get its sources and layers
    const styleJson = await fetchStyle(cfg.styleUrl);
    _styleData.set(key, styleJson);

    // Add all sources from the style
    for (const [sourceId, source] of Object.entries(styleJson.sources || {})) {
      const prefixedSourceId = `${cfg.id}-${sourceId}`;
      if (!map.getSource(prefixedSourceId)) {
        // Convert source to proper format for Mapbox GL JS
        const sourceSpec = JSON.parse(JSON.stringify(source));
        map.addSource(prefixedSourceId, sourceSpec as mapboxgl.SourceSpecification);
      }
    }

    // Add all layers from the style, prefixed
    for (const layer of styleJson.layers || []) {
      if (!canInjectLayer(layer)) continue;

      const prefixedLayerId = `${cfg.id}-${layer.id}`;
      if (!map.getLayer(prefixedLayerId)) {
        const layerCopy = JSON.parse(JSON.stringify(layer));
        layerCopy.id = prefixedLayerId;
        layerCopy.source = `${cfg.id}-${layerCopy.source}`;
        if (!layerCopy.slot) {
          layerCopy.slot = 'top';
        }
        layerCopy.layout = { ...(layerCopy.layout || {}), visibility: visible ? 'visible' : 'none' };
        map.addLayer(layerCopy as mapboxgl.AnyLayer, getOverlayBeforeId(map));
      }
    }

    _loaded.add(key);
  } catch (err) {
    console.error(`[HeatmapOverlay] Failed to load style ${cfg.styleUrl}:`, err);
  }
}

// ── Init: load both overlays, hidden by default ───────────────────
export function initHeatmapOverlays(map: mapboxgl.Map): Promise<void> {
  mapboxgl.accessToken = TOKEN;

  const tryAdd = async (): Promise<void> => {
    if (!map.isStyleLoaded()) {
      return new Promise((resolve) => {
        map.once('idle', () => {
          void tryAdd().then(resolve);
        });
      });
    }
    await Promise.all([
      addOverlay(map, 'STYLE_V1', false),
      addOverlay(map, 'STYLE_V2', false),
    ]);
  };

  if (map.isStyleLoaded()) return tryAdd();

  return new Promise((resolve) => {
    map.once('load', () => {
      void tryAdd().then(resolve);
    });
  });
}

// ── Show one overlay, hide the other ─────────────────────────────
export function activateOverlay(map: mapboxgl.Map, key: OverlayKey | null) {
  (Object.keys(DISEASE_OVERLAYS) as OverlayKey[]).forEach(k => {
    const styleData = _styleData.get(k);
    if (!styleData) return;

    const cfg = DISEASE_OVERLAYS[k];
    const isVisible = k === key;

    for (const layer of styleData.layers || []) {
      const prefixedLayerId = `${cfg.id}-${layer.id}`;
      if (map.getLayer(prefixedLayerId)) {
        map.setLayoutProperty(prefixedLayerId, 'visibility', isVisible ? 'visible' : 'none');
      }
    }
  });
}

export function switchMode(map: mapboxgl.Map, mode: MapMode) {
  activateOverlay(map, mode === 'base' ? null : mode);
}

// ── Set opacity on active overlay (affects all layers) ─────────────
export function setOverlayOpacity(map: mapboxgl.Map, key: OverlayKey, opacity: number) {
  const styleData = _styleData.get(key);
  if (!styleData) return;

  const cfg = DISEASE_OVERLAYS[key];

  for (const layer of styleData.layers || []) {
    const prefixedLayerId = `${cfg.id}-${layer.id}`;
    if (map.getLayer(prefixedLayerId)) {
      // Try to set opacity if the layer type supports it
      try {
        const layerType = layer.type;
        if (layerType === 'heatmap') {
          (map as any).setPaintProperty(prefixedLayerId, 'heatmap-opacity', opacity);
        } else if (layerType === 'fill') {
          (map as any).setPaintProperty(prefixedLayerId, 'fill-opacity', opacity);
        } else if (layerType === 'circle') {
          (map as any).setPaintProperty(prefixedLayerId, 'circle-opacity', opacity);
        } else if (layerType === 'line') {
          (map as any).setPaintProperty(prefixedLayerId, 'line-opacity', opacity);
        } else if (layerType === 'raster') {
          (map as any).setPaintProperty(prefixedLayerId, 'raster-opacity', opacity);
        }
      } catch {
        // Some layer types don't support opacity
      }
    }
  }
}

// ── Teardown ──────────────────────────────────────────────────────
export function removeHeatmapOverlays(map: mapboxgl.Map) {
  (Object.keys(DISEASE_OVERLAYS) as OverlayKey[]).forEach(k => {
    const styleData = _styleData.get(k);
    if (!styleData) return;

    const cfg = DISEASE_OVERLAYS[k];

    // Remove all layers
    for (const layer of styleData.layers || []) {
      const prefixedLayerId = `${cfg.id}-${layer.id}`;
      if (map.getLayer(prefixedLayerId)) {
        map.removeLayer(prefixedLayerId);
      }
    }

    // Remove all sources
    for (const sourceId of Object.keys(styleData.sources || {})) {
      const prefixedSourceId = `${cfg.id}-${sourceId}`;
      if (map.getSource(prefixedSourceId)) {
        map.removeSource(prefixedSourceId);
      }
    }

    _styleData.delete(k);
    _loaded.delete(k);
  });
}
