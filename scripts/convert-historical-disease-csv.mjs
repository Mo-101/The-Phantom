#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import pg from "pg";
import xlsx from "xlsx";

dotenv.config({ path: ".env.local", quiet: true });

const DEFAULT_INPUT = "src/data";
const DEFAULT_OUT_DIR = "public/data/disease/lassa";
const DEFAULT_CACHE = ".cache/historical-disease-geocode-cache.json";
const DEFAULT_COUNTRY = "Nigeria";
const DEFAULT_COUNTRY_CODE = "NG";
const SOURCE = "SORMAS_HISTORICAL";
const TYPE = "disease";

const args = parseArgs(process.argv.slice(2));
const inputPath = resolve(args.input ?? DEFAULT_INPUT);
const outDir = resolve(args.out ?? DEFAULT_OUT_DIR);
const cachePath = resolve(args.cache ?? DEFAULT_CACHE);
const country = args.country ?? DEFAULT_COUNTRY;
const countryCode = args.countryCode ?? DEFAULT_COUNTRY_CODE;
const shouldGeocode = args.geocode !== false;
const shouldNetworkGeocode = args.networkGeocode === true;
const shouldSeedDb = args.seedDb === true;

if (!existsSync(inputPath)) {
  console.error(`Input path not found: ${inputPath}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
mkdirSync(dirname(cachePath), { recursive: true });

const cache = loadJson(cachePath, {});
const files = listCsvLikeFiles(inputPath);
const seenFileHashes = new Set();
const aggregates = new Map();
const summary = {
  input: inputPath,
  output: outDir,
  files: {},
  totals: {
    filesDiscovered: files.length,
    filesProcessed: 0,
    duplicateFilesSkipped: 0,
    rowsRead: 0,
    duplicateCaseRowsSkipped: 0,
    skippedInvalidDisease: 0,
    aggregateFeatures: 0,
    positiveFeatures: 0,
    geocodedAdminLocations: 0,
    skippedNoAdmin: 0,
    seededSignals: 0,
  },
  privacy: {
    mode: "historical_admin_aggregate",
    removed: [
      "case identifiers",
      "epidemiological identifiers",
      "patient names",
      "addresses",
      "phone numbers",
      "facility names",
      "occupation",
      "free-text symptoms",
      "travel history",
      "CT/cycle-threshold values",
    ],
    outputPolicy: "GeoJSON and database rows contain weekly administrative aggregates only, never raw case rows.",
    geocodingPolicy: "Missing GPS is resolved with ward/LGA/state admin text. Raw addresses are not used for public point generation.",
    defaultLocator: "Deterministic Nigeria admin centroids are used by default; pass --network-geocode to call an external geocoder.",
    cachePolicy: "Geocode cache keys are hashed; raw admin queries are not persisted as cache keys.",
  },
};

const seenCases = new Set();

for (const file of files) {
  const fileHash = hashBuffer(readFileSync(file));
  const relative = file.replace(`${process.cwd()}/`, "");
  if (seenFileHashes.has(fileHash)) {
    summary.files[relative] = { status: "duplicate_file_skipped", hash: fileHash.slice(0, 16) };
    summary.totals.duplicateFilesSkipped++;
    continue;
  }
  seenFileHashes.add(fileHash);

  const rows = readRows(file);
  summary.files[relative] = { status: "processed", rows: rows.length };
  summary.totals.filesProcessed++;

  for (const row of rows) {
    summary.totals.rowsRead++;
    const disease = normalizeDisease(first(row, ["Disease", "disease"]));
    if (!disease || disease === "DISEASE" || disease === "UNKNOWN") {
      summary.totals.skippedInvalidDisease++;
      continue;
    }
    const state = cleanText(first(row, ["State", "state", "Admin1", "admin1", "region", "responsibleRegion"]));
    const lga = cleanText(first(row, ["LGA", "lga", "Admin2", "admin2", "District", "district", "responsibleDistrict"]));
    const ward = cleanText(first(row, ["Ward", "ward", "community", "responsibleCommunity"]));

    if (!state) {
      summary.totals.skippedNoAdmin++;
      continue;
    }

    const reportDate = parseDate(first(row, ["Date of report", "Date report", "reported_at", "reportDate"]));
    const onsetDate = parseDate(first(row, ["Date of symptom onset", "Date of onset", "onset_date"]));
    const eventDate = onsetDate ?? reportDate ?? inferDateFromFilename(file);
    const year = eventDate ? eventDate.getUTCFullYear() : inferYearFromFilename(file);
    const epiWeek = eventDate ? epiWeekOfYear(eventDate) : 1;
    const labResult = cleanText(first(row, ["Lab results", "Lab result", "Result", "pathogenTestResult", "sampleTestResult"]));
    const classification = cleanText(first(row, ["Case classification", "Classification", "caseClassification"]));
    const outcome = cleanText(first(row, ["Outcome", "Present condition"]));
    const sampleTaken = cleanText(first(row, ["Sample taken?"]));
    const gender = cleanText(first(row, ["Gender", "person.sex"]));
    const age = numberish(first(row, ["Age", "person.approximateAge"]));

    const caseKey = stableId([
      first(row, ["SORMAS Unique CaseID"]),
      first(row, ["EPID number"]),
      first(row, ["CaseID SORMAS"]),
      first(row, ["uuid"]),
      first(row, ["epidNumber"]),
      first(row, ["externalID"]),
      disease,
      state,
      lga,
      ward,
      reportDate?.toISOString(),
      onsetDate?.toISOString(),
      labResult,
      classification,
      gender,
      age,
    ]);
    if (seenCases.has(caseKey)) {
      summary.totals.duplicateCaseRowsSkipped++;
      continue;
    }
    seenCases.add(caseKey);

    const aggregateKey = stableId([disease, state, lga, ward, year, epiWeek]);
    const aggregate = aggregates.get(aggregateKey) ?? {
      id: aggregateKey,
      disease,
      state,
      lga,
      ward,
      year,
      epi_week: epiWeek,
      cases_total: 0,
      confirmed_cases: 0,
      suspected_cases: 0,
      positive_results: 0,
      negative_results: 0,
      deaths: 0,
      samples_taken: 0,
      male_count: 0,
      female_count: 0,
      age_sum: 0,
      age_count: 0,
      first_reported_at: reportDate?.toISOString() ?? eventDate?.toISOString() ?? null,
      latest_reported_at: reportDate?.toISOString() ?? eventDate?.toISOString() ?? null,
      source_files: new Set(),
    };

    aggregate.cases_total++;
    if (/confirm/i.test(classification) || /positive/i.test(labResult)) aggregate.confirmed_cases++;
    if (/suspect/i.test(classification)) aggregate.suspected_cases++;
    if (/positive/i.test(labResult)) aggregate.positive_results++;
    if (/negative|not detected/i.test(labResult)) aggregate.negative_results++;
    if (/dead|died|deceased/i.test(outcome)) aggregate.deaths++;
    if (/yes|true|taken/i.test(sampleTaken)) aggregate.samples_taken++;
    if (/^m/i.test(gender)) aggregate.male_count++;
    if (/^f/i.test(gender)) aggregate.female_count++;
    if (age != null) {
      aggregate.age_sum += age;
      aggregate.age_count++;
    }
    if (reportDate) {
      const iso = reportDate.toISOString();
      if (!aggregate.first_reported_at || iso < aggregate.first_reported_at) aggregate.first_reported_at = iso;
      if (!aggregate.latest_reported_at || iso > aggregate.latest_reported_at) aggregate.latest_reported_at = iso;
    }
    aggregate.source_files.add(relative);
    aggregates.set(aggregateKey, aggregate);
  }
}

const aggregateFeatures = [];
const positiveFeatures = [];

for (const aggregate of aggregates.values()) {
  const query = buildGeocodeQuery({
    lga: aggregate.lga,
    state: aggregate.state,
    country,
  });
  const location = shouldGeocode ? await geocode(query, cache) : null;
  if (!location) continue;
  if (location.fromNetwork) summary.totals.geocodedAdminLocations++;

  const properties = cleanProperties({
    aggregate_id: aggregate.id,
    disease: aggregate.disease,
    result_class: aggregate.positive_results > 0 ? "positive" : aggregate.confirmed_cases > 0 ? "confirmed" : "surveillance",
    state: aggregate.state,
    lga: aggregate.lga,
    ward: aggregate.ward,
    epi_week: aggregate.epi_week,
    epi_year: aggregate.year,
    cases_total: aggregate.cases_total,
    confirmed_cases: aggregate.confirmed_cases,
    suspected_cases: aggregate.suspected_cases,
    positive_results: aggregate.positive_results,
    negative_results: aggregate.negative_results,
    deaths: aggregate.deaths,
    samples_taken: aggregate.samples_taken,
    cfr: aggregate.confirmed_cases > 0 ? round(aggregate.deaths / aggregate.confirmed_cases, 4) : 0,
    positivity_rate: aggregate.samples_taken > 0 ? round(aggregate.positive_results / aggregate.samples_taken, 4) : null,
    mean_age: aggregate.age_count > 0 ? round(aggregate.age_sum / aggregate.age_count, 1) : null,
    first_reported_at: aggregate.first_reported_at,
    latest_reported_at: aggregate.latest_reported_at,
    source: SOURCE,
    source_granularity: aggregate.lga ? "LGA_ADMIN_GEOCODED" : "STATE_ADMIN_GEOCODED",
    data_quality_score: dataQualityScore(aggregate),
  });

  const feature = {
    type: "Feature",
    id: aggregate.id,
    properties,
    geometry: { type: "Point", coordinates: [location.lng, location.lat] },
  };
  aggregateFeatures.push(feature);
  if (aggregate.positive_results > 0 || aggregate.confirmed_cases > 0) positiveFeatures.push(feature);
}

summary.totals.aggregateFeatures = aggregateFeatures.length;
summary.totals.positiveFeatures = positiveFeatures.length;
const choroplethFeatures = buildChoroplethFeatures(aggregateFeatures);
summary.totals.choroplethAreas = choroplethFeatures.length;

writeJson(resolve(outDir, "historical_choropleth.geojson"), featureCollection(choroplethFeatures));
writeJson(resolve(outDir, "historical_admin_aggregates.geojson"), featureCollection(aggregateFeatures));
writeJson(resolve(outDir, "surveillance_aggregates.geojson"), featureCollection(aggregateFeatures));
writeJson(resolve(outDir, "positive_cases.geojson"), featureCollection(positiveFeatures));
writeJson(resolve(outDir, "specimen_transit.geojson"), featureCollection([]));
writeJson(resolve(outDir, "historical_conversion_summary.json"), serializeSummary(summary));
writeJson(cachePath, cache);

if (shouldSeedDb) {
  summary.totals.seededSignals = await seedDatabase(aggregateFeatures, country, countryCode);
  writeJson(resolve(outDir, "historical_conversion_summary.json"), serializeSummary(summary));
}

console.log(JSON.stringify(serializeSummary(summary), null, 2));

function parseArgs(argv) {
  const parsed = { geocode: true, seedDb: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--no-geocode") parsed.geocode = false;
    else if (arg === "--seed-db") parsed.seedDb = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) parsed[key] = true;
      else parsed[key] = next, i++;
    }
  }
  return parsed;
}

function listCsvLikeFiles(path) {
  const stat = existsSync(path) ? readFileSync : null;
  void stat;
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().includes("csv")) files.push(resolve(full));
    }
  };
  if (inputPath.endsWith(".csv") || inputPath.toLowerCase().includes("csv")) files.push(inputPath);
  else walk(inputPath);
  return files.sort();
}

function readRows(file) {
  if (file.toLowerCase().includes("csv")) {
    return parseCsvRows(readFileSync(file, "utf8"));
  }
  const workbook = xlsx.readFile(file, { cellDates: true, raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet, { defval: null, raw: false });
}

function parseCsvRows(text) {
  const records = parseCsvRecords(text.replace(/^\uFEFF/, ""));
  if (records.length === 0) return [];
  const hasSectionHeader = records[0].filter((value) => /^(CaseData|Person|Location|Hospitalization|EpiData)$/i.test(cleanText(value))).length > 5;
  const headerIndex = hasSectionHeader && records.length > 1 ? 1 : 0;
  const rawHeaders = records[headerIndex];
  const seen = new Map();
  const headers = rawHeaders.map((header) => {
    const clean = cleanText(header);
    const count = seen.get(clean) ?? 0;
    seen.set(clean, count + 1);
    return count === 0 ? clean : `${clean}__${count + 1}`;
  });

  const rows = [];
  for (const values of records.slice(headerIndex + 1)) {
    if (values.every((value) => cleanText(value) === "")) continue;
    const row = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = values[i] ?? null;
    }
    rows.push(row);
  }
  return rows;
}

function parseCsvRecords(text) {
  const records = [];
  let row = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(current);
      records.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }
  if (current !== "" || row.length > 0) {
    row.push(current);
    records.push(row);
  }
  return records;
}

function cleanText(input) {
  if (input == null) return "";
  const text = String(input).trim();
  if (!text || /^nan|null|undefined$/i.test(text)) return "";
  return text;
}

function first(row, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  const normalized = Object.fromEntries(Object.keys(row).map((key) => [key.toLowerCase(), key]));
  for (const key of keys) {
    const realKey = normalized[key.toLowerCase()];
    if (realKey) return row[realKey];
  }
  return null;
}

function normalizeDisease(input) {
  const text = cleanText(input);
  if (/cholera/i.test(text)) return "CHOLERA";
  if (/lassa/i.test(text)) return "LASSA";
  return text ? text.toUpperCase() : "UNKNOWN";
}

function numberish(input) {
  if (input == null || input === "") return null;
  const n = Number(String(input).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseDate(input) {
  const text = cleanText(input);
  if (!text) return null;
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    const date = new Date(Date.UTC(year, Number(dmy[2]) - 1, Number(dmy[1])));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inferDateFromFilename(file) {
  const year = inferYearFromFilename(file);
  return year ? new Date(Date.UTC(year, 0, 1)) : null;
}

function inferYearFromFilename(file) {
  const match = file.match(/\b(20\d{2})\b|\b([12][789])\b/);
  if (!match) return null;
  if (match[1]) return Number(match[1]);
  const shortYear = Number(match[2]);
  return shortYear >= 70 ? 1900 + shortYear : 2000 + shortYear;
}

function epiWeekOfYear(date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target - yearStart) / 86_400_000 + 1) / 7);
}

function buildGeocodeQuery(parts) {
  return [parts.ward, parts.lga, parts.state, parts.country]
    .map(cleanText)
    .filter(Boolean)
    .filter((part, idx, arr) => arr.indexOf(part) === idx)
    .join(", ");
}

async function geocode(query, cache) {
  if (!query) return null;
  const key = stableId(["historical-geocode", query.toLowerCase()]);
  if (cache[key]) return { ...cache[key], fromNetwork: false };

  if (!shouldNetworkGeocode) {
    const approximate = approximateNigeriaLocation(query);
    if (approximate) {
      cache[key] = approximate;
      return { ...approximate, fromNetwork: false };
    }
  }

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
      headers: { "User-Agent": "phantom-poe-historical-disease/1.0" },
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

  if (!result) return null;
  cache[key] = result;
  return { ...result, fromNetwork: true };
}

async function seedDatabase(features, country, countryCode) {
  const databaseUrl = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("NEON_DATABASE_URL is not configured");

  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const laneId = await getHistoricalLaneId(client);
    const rows = [];
    for (const feature of features) {
      const p = feature.properties;
      const [lng, lat] = feature.geometry.coordinates;
      const id = `hist-${p.aggregate_id}`;
      const timestamp = p.first_reported_at ?? `${p.epi_year}-01-01T00:00:00.000Z`;
      const magnitude = Math.min(1, Math.max(0.05, (p.confirmed_cases || p.cases_total || 1) / 25));
      const truthScore = p.data_quality_score ?? 0.8;
      rows.push([
          id,
          laneId,
          SOURCE,
          TYPE,
          p.disease === "CHOLERA" ? "water" : "fire",
          [p.ward, p.lga, p.state].filter(Boolean).join(", "),
          country,
          p.state,
          lat,
          lng,
          magnitude,
          truthScore,
          truthScore >= 0.7,
          p.disease,
          p.aggregate_id,
          timestamp,
          countryCode,
          p.state,
          p.lga,
          p.lga,
          p.epi_week,
          p.epi_year,
          p.aggregate_id,
          p.confirmed_cases ?? 0,
          p.suspected_cases ?? 0,
          p.deaths ?? 0,
          truthScore,
      ]);
    }

    await client.query(`DELETE FROM poe_signals WHERE source = $1 AND id LIKE 'hist-%'`, [SOURCE]);
    for (const chunk of chunks(rows, 100)) {
      const values = [];
      const placeholders = chunk.map((row, rowIndex) => {
        const base = rowIndex * row.length;
        values.push(...row);
        return `(${row.map((_value, colIndex) => `$${base + colIndex + 1}`).join(",")})`;
      }).join(",");
      await client.query(
        `INSERT INTO poe_signals (
          id, lane_id, source, type, element, location, country, admin1, latitude, longitude,
          magnitude, truth_score, passed_truth_filter, disease, raw_source_id, timestamp,
          country_code, state, admin2, lga, epi_week, year, source_record_id,
          confirmed_cases, suspected_cases, deaths, data_quality_score
        ) VALUES ${placeholders}
        ON CONFLICT (id) DO UPDATE SET
          magnitude = EXCLUDED.magnitude,
          truth_score = EXCLUDED.truth_score,
          confirmed_cases = EXCLUDED.confirmed_cases,
          suspected_cases = EXCLUDED.suspected_cases,
          deaths = EXCLUDED.deaths,
          data_quality_score = EXCLUDED.data_quality_score,
          updated_at = NOW()`,
        values
      );
    }
    return rows.length;
  } finally {
    await client.end();
  }
}

function chunks(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

async function getHistoricalLaneId(client) {
  const active = await client.query(`SELECT id FROM data_lanes WHERE lane = 'LIVE' LIMIT 1`);
  if (active.rows[0]?.id) return active.rows[0].id;
  const inserted = await client.query(
    `INSERT INTO data_lanes (id, lane, label, description, is_active, badge_color)
     VALUES ('lane-live', 'LIVE', 'Live Intelligence', 'Live and historical intelligence lane', true, '#22C55E')
     ON CONFLICT (lane) DO UPDATE SET is_active = EXCLUDED.is_active
     RETURNING id`
  );
  return inserted.rows[0].id;
}

function dataQualityScore(aggregate) {
  let score = 0.72;
  if (aggregate.lga) score += 0.06;
  if (aggregate.ward) score += 0.04;
  if (aggregate.samples_taken > 0) score += 0.05;
  if (aggregate.confirmed_cases > 0) score += 0.05;
  return Math.min(0.92, round(score, 2));
}

function buildChoroplethFeatures(features) {
  const byArea = new Map();
  for (const feature of features) {
    const p = feature.properties;
    const key = stableId(["choropleth", p.state, p.lga]);
    const area = byArea.get(key) ?? {
      id: key,
      state: p.state,
      lga: p.lga,
      lat: feature.geometry.coordinates[1],
      lng: feature.geometry.coordinates[0],
      cases_total: 0,
      confirmed_cases: 0,
      suspected_cases: 0,
      positive_results: 0,
      deaths: 0,
      weeks_observed: new Set(),
      diseases: new Map(),
      first_reported_at: p.first_reported_at,
      latest_reported_at: p.latest_reported_at,
    };

    area.cases_total += Number(p.cases_total ?? 0);
    area.confirmed_cases += Number(p.confirmed_cases ?? 0);
    area.suspected_cases += Number(p.suspected_cases ?? 0);
    area.positive_results += Number(p.positive_results ?? 0);
    area.deaths += Number(p.deaths ?? 0);
    area.weeks_observed.add(`${p.epi_year}-W${p.epi_week}`);
    area.diseases.set(p.disease, (area.diseases.get(p.disease) ?? 0) + Number(p.cases_total ?? 0));
    if (p.first_reported_at && (!area.first_reported_at || p.first_reported_at < area.first_reported_at)) {
      area.first_reported_at = p.first_reported_at;
    }
    if (p.latest_reported_at && (!area.latest_reported_at || p.latest_reported_at > area.latest_reported_at)) {
      area.latest_reported_at = p.latest_reported_at;
    }
    byArea.set(key, area);
  }

  const maxCases = Math.max(1, ...[...byArea.values()].map((area) => area.cases_total));
  return [...byArea.values()].map((area) => {
    const sortedDiseases = [...area.diseases.entries()].sort((a, b) => b[1] - a[1]);
    const dominantDisease = sortedDiseases[0]?.[0] ?? "UNKNOWN";
    const radiusKm = 16 + Math.min(28, Math.sqrt(area.cases_total) * 1.8);
    return {
      type: "Feature",
      id: area.id,
      properties: {
        area_id: area.id,
        state: area.state,
        lga: area.lga,
        disease: dominantDisease,
        disease_mix: Object.fromEntries(sortedDiseases),
        cases_total: area.cases_total,
        confirmed_cases: area.confirmed_cases,
        suspected_cases: area.suspected_cases,
        positive_results: area.positive_results,
        deaths: area.deaths,
        weeks_observed: area.weeks_observed.size,
        first_reported_at: area.first_reported_at,
        latest_reported_at: area.latest_reported_at,
        case_density_rank: round(area.cases_total / maxCases, 4),
        source: SOURCE,
        source_granularity: area.lga ? "LGA_CHOROPLETH_CELL" : "STATE_CHOROPLETH_CELL",
      },
      geometry: {
        type: "Polygon",
        coordinates: [regularPolygon(area.lng, area.lat, radiusKm, 12, area.id)],
      },
    };
  });
}

function regularPolygon(lng, lat, radiusKm, sides, seed) {
  const hash = createHash("sha256").update(seed).digest();
  const rotation = (hash[0] / 255) * Math.PI * 2;
  const latRadius = radiusKm / 111.32;
  const lngRadius = radiusKm / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const coords = [];
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (Math.PI * 2 * i) / sides;
    coords.push([
      round(lng + Math.cos(angle) * lngRadius, 6),
      round(lat + Math.sin(angle) * latRadius, 6),
    ]);
  }
  coords.push(coords[0]);
  return coords;
}

function getNigeriaStateCentroids() {
  return {
  abia: [5.4527, 7.5248],
  adamawa: [9.3265, 12.3984],
  "akwa ibom": [4.9057, 7.8537],
  anambra: [6.2209, 6.9369],
  bauchi: [10.3158, 9.8442],
  bayelsa: [4.7719, 6.0699],
  benue: [7.3369, 8.7404],
  borno: [11.8846, 13.1510],
  "cross river": [5.8702, 8.5988],
  delta: [5.7040, 5.9339],
  ebonyi: [6.2649, 8.0137],
  edo: [6.6342, 5.9304],
  ekiti: [7.7190, 5.3110],
  enugu: [6.5364, 7.4356],
  fct: [9.0765, 7.3986],
  abuja: [9.0765, 7.3986],
  gombe: [10.2904, 11.1696],
  imo: [5.5720, 7.0588],
  jigawa: [12.2280, 9.5616],
  kaduna: [10.3764, 7.7095],
  kano: [11.7471, 8.5247],
  katsina: [12.3797, 7.6306],
  kebbi: [11.6781, 4.0695],
  kogi: [7.7337, 6.6906],
  kwara: [8.9669, 4.3874],
  lagos: [6.5244, 3.3792],
  nasarawa: [8.4998, 8.1997],
  niger: [9.9309, 5.5983],
  ogun: [7.1608, 3.3470],
  ondo: [7.2508, 5.2103],
  osun: [7.5629, 4.5200],
  oyo: [8.1574, 3.6147],
  plateau: [9.2182, 9.5179],
  rivers: [4.8581, 6.9209],
  sokoto: [13.0059, 5.2476],
  taraba: [7.9994, 10.7730],
  yobe: [12.2939, 11.4390],
  zamfara: [12.1222, 6.2236],
  };
}

function approximateNigeriaLocation(query) {
  const text = query.toLowerCase();
  const centroids = getNigeriaStateCentroids();
  const stateName = Object.keys(centroids).find((state) => text.includes(state));
  if (!stateName) return null;
  const [baseLat, baseLng] = centroids[stateName];
  const hash = createHash("sha256").update(query.toLowerCase()).digest();
  const latOffset = ((hash[0] / 255) - 0.5) * 0.7;
  const lngOffset = ((hash[1] / 255) - 0.5) * 0.7;
  return {
    lat: round(baseLat + latOffset, 6),
    lng: round(baseLng + lngOffset, 6),
    provider: "deterministic_admin_centroid",
  };
}

function cleanProperties(props) {
  const clean = {};
  for (const [key, val] of Object.entries(props)) {
    if (val == null || val === "") continue;
    if (/address|phone|patient|surname|other_name|epid|facility|occupation|symptom|travel|ct_value|cycle_threshold/i.test(key)) continue;
    clean[key] = val;
  }
  return clean;
}

function featureCollection(features) {
  return { type: "FeatureCollection", features };
}

function serializeSummary(value) {
  return JSON.parse(JSON.stringify(value, (_key, val) => val instanceof Set ? [...val] : val));
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

function hashBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function stableId(parts) {
  return createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 24);
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
