# PHANTOM POE ENGINE — Nigeria CDC Disease Layer Integration
## MoStar Industries · Phantom POE

---

## Files Delivered

```
src/
  lib/disease/
    types.ts              ← all TypeScript interfaces
    loader.ts             ← fetch + cache + summary stats
    layerManager.ts       ← Mapbox add/update/remove logic
    useDiseaseLayer.ts    ← React hook — the integration point
  components/
    DiseaseControlPanel.tsx  ← HUD panel UI

public/data/disease/lassa/
    historical_choropleth.geojson       ← 342 LGA polygons  ✅ choropleth
    positive_cases.geojson              ← 877 positive points
    surveillance_aggregates.geojson     ← 3,219 full signal set
    historical_admin_aggregates.geojson ← same, with epi metadata
    specimen_transit.geojson            ← placeholder (empty, safe)
```

---

## Wire Into PhantomMap.tsx

### Step 1 — Import hook + panel

```tsx
import { useDiseaseLayer } from '@/lib/disease/useDiseaseLayer';
import { DiseaseControlPanel } from '@/components/DiseaseControlPanel';
```

### Step 2 — Add after your mapRef

```tsx
const { state, summary, switchDisease, switchMode, applyTemporalFilter, clearTemporalFilter } =
  useDiseaseLayer({ map: mapRef.current });
```

### Step 3 — Render panel alongside your existing panels

```tsx
<DiseaseControlPanel
  state={state}
  summary={summary}
  onDiseaseChange={switchDisease}
  onModeChange={switchMode}
  onYearFilter={applyTemporalFilter}
  onClearFilter={clearTemporalFilter}
/>
```

That is the complete integration. The hook handles:
- Loading all GeoJSONs on mount
- Adding Mapbox sources + layers
- Popups on hover (choropleth) and click (points)
- Teardown on unmount

---

## Layer IDs (for z-ordering in your drawCorridors())

The disease layers use these IDs — place them **below** corridor layers:

```
ngcdc-choropleth          (source)
ngcdc-positive-points     (source)
ngcdc-choro-fill          (layer — fill)
ngcdc-choro-outline       (layer — line)
ngcdc-points-circle       (layer — circle)
ngcdc-points-label        (layer — symbol, minzoom 7)
```

To insert below corridor layers, use Mapbox's `beforeId`:

```ts
map.addLayer({ id: 'ngcdc-choro-fill', ... }, 'phantom-corridors-line');
```

In `layerManager.ts`, pass `beforeId` to each `map.addLayer()` call if ordering matters.

---

## Paint Field

**`case_density_rank`** — 0 to 1, normalized across all LGAs per disease.
- 0 = lowest burden LGA
- 1 = highest burden LGA (Zamfara/Shinkafi for Cholera, rank=1.0)

Color ramps are per-disease:
- LASSA → yellow → deep red
- CHOLERA → light blue → navy
- CSM → light green → forest green
- ALL → yellow → crimson

---

## Disease Summary (available instantly after load)

```ts
const sum = await getDiseaseSummary('LASSA');
// {
//   lgas_affected: 151,
//   cases_total: ...,
//   confirmed_cases: ...,
//   deaths: ...,
//   cfr_mean: ...,
//   top_lgas: [{ state, lga, cases, rank }x5],
//   date_range: { first, latest }
// }
```

---

## Temporal Filtering

```ts
// Show only epi years 2018–2020
await applyTemporalFilter(2018, 2020);

// Reset to full dataset
await clearTemporalFilter();
```

---

## Data Provenance

Source: `SORMAS_HISTORICAL`
Privacy: Admin aggregates only. No case identifiers, no GPS coordinates, no patient data.
Granularity: `LGA_CHOROPLETH_CELL` for polygons, `WARD` for point signals.
Records: 68,061 raw → 600 deduped → 3,219 aggregate features → 342 choropleth cells.
Diseases: LASSA (2018–2023), CHOLERA (2017–2023), MENINGITIS/CSM (2019–2022)
