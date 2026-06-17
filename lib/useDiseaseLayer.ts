// ─────────────────────────────────────────────────────────────────
// PHANTOM POE ENGINE — useDiseaseLayer React Hook
// MoStar Industries · Phantom POE · Nigeria CDC Integration
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';
import type mapboxgl from 'mapbox-gl';
import type { DiseaseType, LayerMode, DiseaseLayerState, DiseaseSummary } from './types';
import {
  initDiseaseLayer,
  setActiveDisease,
  setLayerMode,
  updateTemporalData,
  removeDiseaseLayer,
  buildChoroplethPopup,
} from './layerManager';
import { getDiseaseSummary, getTemporalSlice } from './loader';

interface UseDiseaseLayerOptions {
  map: mapboxgl.Map | null;
  initialDisease?: DiseaseType;
  initialMode?: LayerMode;
}

export function useDiseaseLayer({
  map,
  initialDisease = 'LASSA',
  initialMode = 'both',
}: UseDiseaseLayerOptions) {
  const [state, setState] = useState<DiseaseLayerState>({
    activeDisease: initialDisease,
    mode: initialMode,
    showPoints: initialMode !== 'choropleth',
    showChoropleth: initialMode !== 'points',
    temporalRange: null,
    loaded: false,
    error: null,
  });

  const [summary, setSummary] = useState<DiseaseSummary | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const initializedRef = useRef(false);

  // ── Init layers when map is ready ──────────────────────────────
  useEffect(() => {
    if (!map || initializedRef.current) return;

    const onLoad = async () => {
      try {
        await initDiseaseLayer(map, initialDisease, initialMode);
        initializedRef.current = true;
        setState(s => ({ ...s, loaded: true }));

        // Load initial summary
        const sum = await getDiseaseSummary(initialDisease);
        setSummary(sum);

        // ── Popup on choropleth hover ───────────────────────────
        const mapboxgl = (await import('mapbox-gl')).default;

        map.on('mouseenter', 'ngcdc-choro-fill', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'ngcdc-choro-fill', () => {
          map.getCanvas().style.cursor = '';
          popupRef.current?.remove();
        });
        map.on('mousemove', 'ngcdc-choro-fill', (e) => {
          const feat = e.features?.[0];
          if (!feat) return;
          popupRef.current?.remove();
          popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false })
            .setLngLat(e.lngLat)
            .setHTML(buildChoroplethPopup(feat.properties as Record<string, unknown>))
            .addTo(map);
        });

        // ── Popup on point click ────────────────────────────────
        map.on('click', 'ngcdc-points-circle', (e) => {
          const feat = e.features?.[0];
          if (!feat) return;
          const props = feat.properties as Record<string, unknown>;
          popupRef.current?.remove();
          const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
          popupRef.current = new mapboxgl.Popup()
            .setLngLat(coords)
            .setHTML(buildChoroplethPopup(props))
            .addTo(map);
        });

      } catch (err) {
        setState(s => ({ ...s, error: String(err) }));
      }
    };

    if (map.isStyleLoaded()) {
      onLoad();
    } else {
      map.once('load', onLoad);
    }

    return () => {
      if (map && initializedRef.current) {
        popupRef.current?.remove();
        removeDiseaseLayer(map);
        initializedRef.current = false;
      }
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Switch disease ──────────────────────────────────────────────
  const switchDisease = useCallback(async (disease: DiseaseType) => {
    if (!map || !initializedRef.current) return;
    setActiveDisease(map, disease);
    setState(s => ({ ...s, activeDisease: disease }));
    const sum = await getDiseaseSummary(disease);
    setSummary(sum);
  }, [map]);

  // ── Switch mode ─────────────────────────────────────────────────
  const switchMode = useCallback((mode: LayerMode) => {
    if (!map || !initializedRef.current) return;
    setLayerMode(map, mode);
    setState(s => ({
      ...s,
      mode,
      showChoropleth: mode !== 'points',
      showPoints: mode !== 'choropleth',
    }));
  }, [map]);

  // ── Temporal filter ─────────────────────────────────────────────
  const applyTemporalFilter = useCallback(async (yearFrom: number, yearTo: number) => {
    if (!map || !initializedRef.current) return;
    const slice = await getTemporalSlice(state.activeDisease, yearFrom, yearTo);
    updateTemporalData(map, slice as GeoJSON.FeatureCollection);
    setState(s => ({
      ...s,
      temporalRange: [`${yearFrom}`, `${yearTo}`],
    }));
  }, [map, state.activeDisease]);

  // ── Clear temporal filter ───────────────────────────────────────
  const clearTemporalFilter = useCallback(async () => {
    if (!map || !initializedRef.current) return;
    const { loadSurveillanceAggregates } = await import('./loader');
    const full = await loadSurveillanceAggregates();
    updateTemporalData(map, full as GeoJSON.FeatureCollection);
    setState(s => ({ ...s, temporalRange: null }));
  }, [map]);

  return {
    state,
    summary,
    switchDisease,
    switchMode,
    applyTemporalFilter,
    clearTemporalFilter,
  };
}
