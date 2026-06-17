#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import xlsx from "xlsx";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const DEFAULT_SHEETS = ["2022 Linelist", "2023 linelist", "2024 linelist", "2025 linelist"];
const DEFAULT_OUT_DIR = "public/data/disease/lassa";
const DEFAULT_CACHE = ".cache/geocode-cache.json";

const SENSITIVE_COLUMN_PATTERNS = [
  /surname/i,
  /other\s*names?/i,
  /^name$/i,
  /patient/i,
  /case\s*id/i,
  /caseid/i,
  /serial/i,
  /epi\s*#/i,
  /specimen\s*id/i,
  /laboratory\s*assigned\s*specimen/i,
  /\bct\b/i,
  /cycle\s*threshold/i,
  /phone/i,
  /email/i,
  /address/i,
];

const args = parseArgs(process.argv.slice(2));

if (!args.input) {
  console.error(
    [
      "Usage:",
      "  npm run disease:geojson -- --input phantom-lf-01.xlsx",
      "",
      "Converts Excel linelist sheets into privacy-cleaned GeoJSON. This is an offline",
      "data preparation script, not a live ingestion route.",
      "",
      "Options:",
      "  --sheets \"2022 Linelist,2023 linelist\"",
      "  --out public/data/disease/lassa",
      "  --cache .cache/geocode-cache.json",
      "  --no-geocode",
      "  --country Nigeria",
    ].join("\n")
  );
  process.exit(1);
}

const inputPath = resolve(args.input);
const outDir = resolve(args.out ?? DEFAULT_OUT_DIR);
const cachePath = resolve(args.cache ?? DEFAULT_CACHE);
const sheets = args.sheets ? args.sheets.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_SHEETS;
const country = args.country ?? "Nigeria";
const shouldGeocode = args.geocode !== false;
const cache = loadJson(cachePath, {});

mkdirSync(outDir, { recursive: true });
mkdirSync(dirname(cachePath), { recursive: true });

const workbook = xlsx.readFile(inputPath, { cellDates: true });
const positives = [];
const aggregates = new Map();
const facilityNodes = new Map();
const transitEdges = [];
const summary = {
  input: inputPath,
  sheets: {},
  totals: {
    rows: 0,
    positives: 0,
    aggregates: 0,
    geocoded: 0,
    directCoordinates: 0,
    skippedNoLocation: 0,
    transitEdges: 0,
  },
  privacy: {
    removed: [
      "names",
      "surname",
      "case identifiers",
      "specimen identifiers",
      "addresses",
      "CT/cycle-threshold values",
    ],
    addressHandling: "Address fields may be used for geocoding only; they are not written to output GeoJSON.",
    cacheHandling: "Geocode cache keys are hashed so raw address strings are not persisted by the cache.",
  },
};

for (const sheetName of sheets) {
  if (!workbook.SheetNames.includes(sheetName)) {
    summary.sheets[sheetName] = { status: "missing" };
    continue;
  }

  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: false });
  const resultKey = findColumn(rows, [/result/i, /interpretation/i, /outcome/i]);
  const latKey = findColumn(rows, [/^lat/i, /latitude/i]);
  const lngKey = findColumn(rows, [/^lon/i, /^lng/i, /longitude/i]);
  const stateKey = findColumn(rows, [/^state$/i, /admin1/i]);
  const lgaKey = findColumn(rows, [/^lga$/i, /admin2/i, /district/i]);
  const villageKey = findColumn(rows, [/village/i, /town/i, /community/i, /settlement/i]);
  const addressKey = findColumn(rows, [/address/i]);
  const weekKey = findColumn(rows, [/epi\s*week/i, /^week$/i]);
  const yearKey = findColumn(rows, [/epi\s*year/i, /^year$/i]);
  const onsetKey = findColumn(rows, [/symptom\s*onset/i, /date\s*of\s*onset/i, /onset/i]);
  const collectionKey = findColumn(rows, [/specimen\s*collection/i, /date\s*collected/i]);
  const receivedKey = findColumn(rows, [/specimen\s*received/i, /received\s*at\s*lab/i]);
  const facilityKey = findColumn(rows, [/facility/i, /referred\s*from/i, /clinic/i, /hospital/i]);
  const labKey = findColumn(rows, [/laboratory/i, /^lab$/i]);

  let sheetPositives = 0;
  let sheetAggregates = 0;
  let sheetSkipped = 0;

  for (const [rowIndex, row] of rows.entries()) {
    summary.totals.rows++;
    const result = normalizeText(value(row, resultKey));
    const isPositive = /\bpositive\b/i.test(result);
    const state = normalizeText(value(row, stateKey));
    const lga = normalizeText(value(row, lgaKey));
    const village = normalizeText(value(row, villageKey));
    const epiWeek = numberish(value(row, weekKey));
    const epiYear = numberish(value(row, yearKey)) ?? inferYear(value(row, onsetKey)) ?? inferYearFromSheet(sheetName);
    const onsetDate = dateString(value(row, onsetKey));
    const collectionDate = dateString(value(row, collectionKey));
    const receivedDate = dateString(value(row, receivedKey));
    const facility = normalizeText(value(row, facilityKey));
    const lab = normalizeText(value(row, labKey));

    const directCoords = readCoords(row, latKey, lngKey);
    let location = directCoords;
    let geocodePrecision = directCoords ? "SOURCE_COORDINATES" : "NONE";
    if (location) summary.totals.directCoordinates++;

    const address = normalizeText(value(row, addressKey));
    const geocodeQuery = buildGeocodeQuery({ address, village, lga, state, country });
    if (!location && shouldGeocode && geocodeQuery) {
      location = await geocode(geocodeQuery, cache);
      if (location) {
        geocodePrecision = address ? "ADDRESS_GEOCODED" : village ? "SETTLEMENT_GEOCODED" : "ADMIN_GEOCODED";
        summary.totals.geocoded++;
      }
    }

    if (isPositive) {
      if (!location) {
        sheetSkipped++;
        summary.totals.skippedNoLocation++;
      } else {
        sheetPositives++;
        summary.totals.positives++;
        positives.push({
          type: "Feature",
          id: stableId(["lassa-positive", sheetName, rowIndex, state, lga, epiWeek, epiYear]),
          properties: cleanProperties({
            disease: "LASSA",
            result_class: "POSITIVE",
            sheet: sheetName,
            epi_week: epiWeek,
            epi_year: epiYear,
            onset_date: onsetDate,
            state,
            lga,
            village,
            source_granularity: geocodePrecision,
            facility_present: Boolean(facility),
            lab_present: Boolean(lab),
          }),
          geometry: { type: "Point", coordinates: [location.lng, location.lat] },
        });
      }
    }

    const aggregateKey = JSON.stringify({
      state,
      lga,
      epiWeek,
      epiYear,
      resultClass: isPositive ? "positive" : classifyNonPositive(result),
    });
    const aggregate = aggregates.get(aggregateKey) ?? {
      state,
      lga,
      epi_week: epiWeek,
      epi_year: epiYear,
      result_class: isPositive ? "positive" : classifyNonPositive(result),
      positive_count: 0,
      non_positive_count: 0,
      total_records: 0,
      geocode_query: buildGeocodeQuery({ lga, state, country }),
    };
    aggregate.total_records++;
    if (isPositive) aggregate.positive_count++;
    else aggregate.non_positive_count++;
    aggregates.set(aggregateKey, aggregate);
    sheetAggregates++;

    await collectTransitEdge({
      facility,
      lab,
      state,
      lga,
      country,
      collectionDate,
      receivedDate,
      directLocation: location,
      facilityNodes,
      transitEdges,
      cache,
      shouldGeocode,
      sheetName,
      rowIndex,
    });
  }

  summary.sheets[sheetName] = {
    status: "processed",
    rows: rows.length,
    positives: sheetPositives,
    aggregateRecords: sheetAggregates,
    skippedNoLocation: sheetSkipped,
  };
}

const aggregateFeatures = [];
for (const aggregate of aggregates.values()) {
  let location = null;
  if (shouldGeocode && aggregate.geocode_query) {
    location = await geocode(aggregate.geocode_query, cache);
  }
  if (!location) continue;
  aggregateFeatures.push({
    type: "Feature",
    id: stableId(["lassa-aggregate", aggregate.state, aggregate.lga, aggregate.epi_week, aggregate.epi_year, aggregate.result_class]),
    properties: cleanProperties({
      disease: "LASSA",
      state: aggregate.state,
      lga: aggregate.lga,
      epi_week: aggregate.epi_week,
      epi_year: aggregate.epi_year,
      result_class: aggregate.result_class,
      positive_count: aggregate.positive_count,
      non_positive_count: aggregate.non_positive_count,
      total_records: aggregate.total_records,
      surveillance_blindspot_score: blindspotScore(aggregate),
      true_clearance_score: aggregate.non_positive_count > 0 && aggregate.positive_count === 0 ? Math.min(1, aggregate.non_positive_count / 500) : 0,
      source_granularity: "ADMIN_GEOCODED",
    }),
    geometry: { type: "Point", coordinates: [location.lng, location.lat] },
  });
}

summary.totals.aggregates = aggregateFeatures.length;
summary.totals.transitEdges = transitEdges.length;

writeJson(resolve(outDir, "positive_cases.geojson"), featureCollection(positives));
writeJson(resolve(outDir, "surveillance_aggregates.geojson"), featureCollection(aggregateFeatures));
writeJson(resolve(outDir, "specimen_transit.geojson"), featureCollection(transitEdges));
writeJson(resolve(outDir, "conversion_summary.json"), summary);
writeJson(cachePath, cache);

console.log(JSON.stringify(summary, null, 2));

function parseArgs(argv) {
  const parsed = { geocode: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--no-geocode") parsed.geocode = false;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) parsed[key] = true;
      else parsed[key] = next, i++;
    }
  }
  return parsed;
}

function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function featureCollection(features) {
  return { type: "FeatureCollection", features };
}

function findColumn(rows, patterns) {
  const keys = new Set();
  for (const row of rows.slice(0, 25)) {
    for (const key of Object.keys(row)) keys.add(key);
  }
  return [...keys].find((key) => patterns.some((pattern) => pattern.test(key))) ?? null;
}

function value(row, key) {
  return key ? row[key] : null;
}

function normalizeText(input) {
  if (input == null) return "";
  const text = String(input).trim();
  if (!text || /^nan$/i.test(text) || /^null$/i.test(text) || /^undefined$/i.test(text)) return "";
  return text;
}

function numberish(input) {
  if (input == null || input === "") return null;
  const n = Number(String(input).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function readCoords(row, latKey, lngKey) {
  const lat = numberish(value(row, latKey));
  const lng = numberish(value(row, lngKey));
  if (lat == null || lng == null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function dateString(input) {
  if (input == null || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function inferYear(input) {
  const date = dateString(input);
  return date ? Number(date.slice(0, 4)) : null;
}

function inferYearFromSheet(sheetName) {
  const match = String(sheetName).match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function classifyNonPositive(result) {
  if (/reject|invalid|insufficient|inadequate/i.test(result)) return "rejected";
  if (/negative|not detected/i.test(result)) return "negative";
  return "other_non_positive";
}

function blindspotScore(aggregate) {
  if (aggregate.result_class === "rejected") return 0.8;
  if (aggregate.result_class === "other_non_positive") return 0.5;
  if (aggregate.positive_count > 0 && aggregate.total_records < 3) return 0.4;
  return 0;
}

function buildGeocodeQuery(parts) {
  return [parts.address, parts.village, parts.lga, parts.state, parts.country]
    .map(normalizeText)
    .filter(Boolean)
    .filter((part, idx, arr) => arr.indexOf(part) === idx)
    .join(", ");
}

async function geocode(query, cache) {
  if (!query) return null;
  const key = stableId(["geocode", query.toLowerCase()]);
  if (cache[key]) return cache[key];

  const positionstackKey = process.env.POSITIONSTACK_ACCESS_KEY;
  let result = null;

  if (positionstackKey) {
    const url = new URL("http://api.positionstack.com/v1/forward");
    url.searchParams.set("access_key", positionstackKey);
    url.searchParams.set("query", query);
    url.searchParams.set("limit", "1");
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) }).catch(() => null);
    if (response?.ok) {
      const data = await response.json().catch(() => null);
      const first = data?.data?.[0];
      if (first?.latitude != null && first?.longitude != null) {
        result = { lat: Number(first.latitude), lng: Number(first.longitude), provider: "positionstack" };
      }
    }
  } else {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, {
      headers: { "User-Agent": "phantom-poe-disease-geojson/1.0" },
      signal: AbortSignal.timeout(12_000),
    }).catch(() => null);
    if (response?.ok) {
      const data = await response.json().catch(() => null);
      const first = data?.[0];
      if (first?.lat != null && first?.lon != null) {
        result = { lat: Number(first.lat), lng: Number(first.lon), provider: "nominatim" };
      }
    }
  }

  if (result) cache[key] = result;
  return result;
}

async function collectTransitEdge({
  facility,
  lab,
  state,
  lga,
  country,
  collectionDate,
  receivedDate,
  directLocation,
  facilityNodes,
  transitEdges,
  cache,
  shouldGeocode,
  sheetName,
  rowIndex,
}) {
  if (!facility || !lab || !collectionDate || !receivedDate) return;
  const days = Math.round((new Date(receivedDate).getTime() - new Date(collectionDate).getTime()) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return;

  const facilityKey = stableId(["facility", facility, lga, state]);
  const labKey = stableId(["lab", lab, state, country]);
  let facilityPoint = facilityNodes.get(facilityKey);
  let labPoint = facilityNodes.get(labKey);

  if (!facilityPoint) {
    facilityPoint = directLocation ?? (shouldGeocode ? await geocode(buildGeocodeQuery({ village: facility, lga, state, country }), cache) : null);
    if (facilityPoint) facilityNodes.set(facilityKey, facilityPoint);
  }

  if (!labPoint) {
    labPoint = shouldGeocode ? await geocode(buildGeocodeQuery({ village: lab, state, country }), cache) : null;
    if (labPoint) facilityNodes.set(labKey, labPoint);
  }

  if (!facilityPoint || !labPoint) return;

  transitEdges.push({
    type: "Feature",
    id: stableId(["transit", sheetName, rowIndex, facilityKey, labKey]),
    properties: cleanProperties({
      disease: "LASSA",
      route_type: "SPECIMEN_TRANSIT",
      state,
      lga,
      collection_date: collectionDate,
      received_date: receivedDate,
      transit_days: days,
      friction_class: days > 7 ? "CRITICAL" : days > 3 ? "HIGH" : days > 1 ? "MODERATE" : "LOW",
      facility_hash: facilityKey,
      lab_hash: labKey,
    }),
    geometry: {
      type: "LineString",
      coordinates: [
        [facilityPoint.lng, facilityPoint.lat],
        [labPoint.lng, labPoint.lat],
      ],
    },
  });
}

function cleanProperties(props) {
  const clean = {};
  for (const [key, val] of Object.entries(props)) {
    if (val == null || val === "") continue;
    if (SENSITIVE_COLUMN_PATTERNS.some((pattern) => pattern.test(key))) continue;
    clean[key] = val;
  }
  return clean;
}

function stableId(parts) {
  return createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 24);
}
