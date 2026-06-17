import { NextResponse } from "next/server";

const GDELT_DOC = "https://api.gdeltproject.org/api/v2/doc/doc";

const LAT_MIN = 3.0;
const LAT_MAX = 3.5;
const LON_MIN = 30.8;
const LON_MAX = 31.1;
const CELL_KM = 8;
const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LON = 111.32 * Math.cos((((LAT_MIN + LAT_MAX) / 2) * Math.PI) / 180);
const INTERCEPT = -1.8;

const ARUA: [number, number] = [30.911, 3.02];
const KOBOKO: [number, number] = [30.957, 3.412];

const GAZETTEER: Record<string, [number, number]> = {
  arua: [3.02, 30.911],
  koboko: [3.412, 30.957],
  yumbe: [3.465, 31.247],
  maracha: [3.287, 30.879],
  oraba: [3.495, 30.96],
  vurra: [2.96, 30.93],
  logiri: [3.13, 30.86],
  midigo: [3.52, 31.0],
  lodonga: [3.33, 31.06],
  nyadri: [3.29, 30.88],
  omugo: [3.23, 31.15],
};

interface Article {
  title?: string;
  url?: string;
  seendate?: string;
  domain?: string;
  sourcecountry?: string;
}

interface Evidence {
  source: "GDELT";
  fetchedAt: number;
  cellScores: Map<string, number>;
}

interface CellPosterior {
  row: number;
  col: number;
  lat: number;
  lon: number;
  posterior: number;
  freshestAgeHours: number;
}

class Grid {
  nRows = Math.max(1, Math.round(((LAT_MAX - LAT_MIN) * KM_PER_DEG_LAT) / CELL_KM));
  nCols = Math.max(1, Math.round(((LON_MAX - LON_MIN) * KM_PER_DEG_LON) / CELL_KM));
  dLat = (LAT_MAX - LAT_MIN) / this.nRows;
  dLon = (LON_MAX - LON_MIN) / this.nCols;

  cellCenter(row: number, col: number): [number, number] {
    return [LAT_MIN + (row + 0.5) * this.dLat, LON_MIN + (col + 0.5) * this.dLon];
  }

  cells(): Array<[number, number]> {
    const cells: Array<[number, number]> = [];
    for (let row = 0; row < this.nRows; row += 1) {
      for (let col = 0; col < this.nCols; col += 1) cells.push([row, col]);
    }
    return cells;
  }
}

function key(row: number, col: number) {
  return `${row},${col}`;
}

function logistic(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function gdeltQuality(ageHours: number) {
  const freshness = Math.exp(-Math.max(0, ageHours) / 0.75);
  return freshness * 0.7 * 0.85;
}

function nearestCell(grid: Grid, lat: number, lon: number): [number, number] | null {
  if (lat < LAT_MIN || lat > LAT_MAX || lon < LON_MIN || lon > LON_MAX) return null;
  const row = Math.min(grid.nRows - 1, Math.floor((lat - LAT_MIN) / grid.dLat));
  const col = Math.min(grid.nCols - 1, Math.floor((lon - LON_MIN) / grid.dLon));
  return [row, col];
}

function geolocate(article: Article): Array<[number, number]> {
  const haystack = `${article.title ?? ""} ${article.url ?? ""}`.toLowerCase();
  const hits: Array<[number, number]> = [];
  for (const [name, coord] of Object.entries(GAZETTEER)) {
    if (haystack.includes(name)) hits.push(coord);
  }
  return hits;
}

async function fetchGdelt(): Promise<{ articles: Article[]; status: number; emptyBody: boolean }> {
  const params = new URLSearchParams({
    query: "Uganda (refugee OR border OR Arua)",
    mode: "artlist",
    format: "json",
    maxrecords: "75",
    timespan: "3d",
  });
  const response = await fetch(`${GDELT_DOC}?${params.toString()}`, {
    headers: { "User-Agent": "phantom-poe/1.0" },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) return { articles: [], status: response.status, emptyBody: false };
  const text = await response.text();
  if (!text.trim()) return { articles: [], status: response.status, emptyBody: true };
  const data = JSON.parse(text) as { articles?: Article[] };
  return { articles: data.articles ?? [], status: response.status, emptyBody: false };
}

function gdeltEvidence(grid: Grid, articles: Article[], now: number): { evidence: Evidence; geolocatedHits: number } {
  const raw = new Map<string, number>();
  let geolocatedHits = 0;

  for (const article of articles) {
    for (const [lat, lon] of geolocate(article)) {
      const cell = nearestCell(grid, lat, lon);
      if (!cell) continue;
      raw.set(key(cell[0], cell[1]), (raw.get(key(cell[0], cell[1])) ?? 0) + 1);
      geolocatedHits += 1;
    }
  }

  const cellScores = new Map<string, number>();
  for (const [cellKey, count] of raw.entries()) {
    cellScores.set(cellKey, 1 - Math.exp(-count / 3));
  }

  return { evidence: { source: "GDELT", fetchedAt: now, cellScores }, geolocatedHits };
}

function fuse(grid: Grid, evidence: Evidence, now: number): Map<string, CellPosterior> {
  const out = new Map<string, CellPosterior>();
  const ageHours = (now - evidence.fetchedAt) / 3_600_000;
  const q = gdeltQuality(ageHours);

  for (const [row, col] of grid.cells()) {
    const [lat, lon] = grid.cellCenter(row, col);
    const z = evidence.cellScores.get(key(row, col)) ?? 0;
    const logOdds = INTERCEPT + (z > 0 ? 1.4 * q * z : 0);
    out.set(key(row, col), {
      row,
      col,
      lat,
      lon,
      posterior: logistic(logOdds),
      freshestAgeHours: z > 0 ? ageHours : 0,
    });
  }
  return out;
}

function buildGeoJson(
  fused: Map<string, CellPosterior>,
  meta: { live: boolean; articlesFetched: number; geolocatedHits: number; gdeltStatus: number; gdeltEmptyBody: boolean },
): GeoJSON.FeatureCollection & { meta: Record<string, unknown> } {
  const lit = [...fused.values()]
    .filter((cell) => cell.posterior > 0.15)
    .sort((a, b) => a.lat - b.lat);
  const informalCoords = lit.map((cell) => [cell.lon, cell.lat]);

  const features: GeoJSON.Feature[] = [
    {
      type: "Feature",
      properties: {
        kind: "formal",
        isRisk: false,
        label: "Arua-Koboko (official)",
        status: "gazetted",
        distance_km: 52,
        coverage_pct: 82,
      },
      geometry: { type: "LineString", coordinates: [ARUA, KOBOKO] },
    },
  ];

  if (informalCoords.length >= 2) {
    const avgPosterior = lit.reduce((sum, cell) => sum + cell.posterior, 0) / lit.length;
    const freshest = Math.min(...lit.map((cell) => cell.freshestAgeHours));
    features.push({
      type: "Feature",
      properties: {
        kind: "informal",
        isRisk: true,
        label: "Phantom corridor (runtime inferred)",
        status: "RUNTIME_INFERRED",
        field_validation: "PENDING",
        posterior: Number(avgPosterior.toFixed(3)),
        freshest_evidence_min: Number((freshest * 60).toFixed(1)),
        synthetic: false,
        risk_class: "HIGH",
        score: Number(avgPosterior.toFixed(3)),
        distance_km: 52,
      },
      geometry: { type: "LineString", coordinates: informalCoords },
    });
  }

  return {
    type: "FeatureCollection",
    features,
    meta: {
      generated_at: Date.now(),
      classification: "PROVISIONAL OSINT INFERENCE",
      field_validation: "PENDING",
      synthetic_input: false,
      contributing_sources: meta.live ? 1 : 0,
      total_sources: 7,
      articles_fetched: meta.articlesFetched,
      geolocated_hits: meta.geolocatedHits,
      gdelt_status: meta.gdeltStatus,
      gdelt_empty_body: meta.gdeltEmptyBody,
      geometry_status: informalCoords.length >= 2 ? "RUNTIME_INFERRED" : "NO_RUNTIME_RIDGE",
    },
  };
}

export async function GET() {
  try {
    // Attempt to query FastAPI live backend on port 8085
    const fastApiRes = await fetch("http://localhost:8085/corridor", {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (fastApiRes.ok) {
      const data = await fastApiRes.json();
      return NextResponse.json(data);
    }
  } catch (e) {
    console.warn("[runtime route] FastAPI live backend unreachable, falling back to local TS engine:", e);
  }

  try {
    const grid = new Grid();
    const now = Date.now();
    const gdelt = await fetchGdelt();
    const articles = gdelt.articles;
    const { evidence, geolocatedHits } = gdeltEvidence(grid, articles, now);
    const fused = fuse(grid, evidence, now);
    return NextResponse.json(buildGeoJson(fused, {
      live: articles.length > 0,
      articlesFetched: articles.length,
      geolocatedHits,
      gdeltStatus: gdelt.status,
      gdeltEmptyBody: gdelt.emptyBody,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        type: "FeatureCollection",
        features: [],
        meta: {
          classification: "PROVISIONAL OSINT INFERENCE",
          field_validation: "PENDING",
          synthetic_input: false,
          contributing_sources: 0,
          total_sources: 7,
          geometry_status: "FETCH_FAILED",
          error: message,
        },
      },
      { status: 502 },
    );
  }
}
