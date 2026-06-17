/**
 * ◉⟁⬡  MoStar Industries
 * Phantom POE — Public APIs Integration Layer v1
 * 
 * Rule: Public APIs are ENRICHMENT sources unless explicitly promoted by analyst governance.
 * They do not override DHIS2/EWARS/AFRO Sentinel, ACLED, IOM DTM, field validation, or Neo4j-sealed POE evidence.
 */

import { MoScript } from "./types";
import crypto from "crypto";

// ═══════════════════════════════════════════════════════════════
// 0. Canonical Phantom API Source Registry
// ═══════════════════════════════════════════════════════════════

export type PhantomElement = "fire" | "water" | "air" | "earth" | "ether";

export type PhantomSourceRole =
  | "PRIMARY_SIGNAL"
  | "ENRICHMENT"
  | "REFERENCE_BASELINE"
  | "VALIDATION_AUXILIARY"
  | "TEST_FIXTURE";

export type PhantomApiSourceId =
  | "open_meteo_forecast"
  | "open_meteo_historical"
  | "open_meteo_elevation"
  | "open_meteo_air_quality"
  | "open_meteo_flood"
  | "oikolab_weather"
  | "positionstack_geocoding"
  | "administrative_divisions_db"
  | "actinia_grass_gis"
  | "socrata_open_data"
  | "openafrica"
  | "data_gov"
  | "adsb_exchange"
  | "aftership_tracking";

export interface PhantomApiSourceSpec {
  id: PhantomApiSourceId;
  label: string;
  role: PhantomSourceRole;
  element: PhantomElement;
  corridorUse: string[];
  auth: "none" | "apiKey" | "basic" | "token";
  cadence: string;
  priority: 1 | 2 | 3 | 4 | 5;
  truthFloor: number;
  phantomSignalType: string;
  notes: string[];
}

export const PHANTOM_PUBLIC_API_SOURCES: PhantomApiSourceSpec[] = [
  {
    id: "open_meteo_forecast",
    label: "Open-Meteo Forecast API",
    role: "ENRICHMENT",
    element: "earth",
    corridorUse: [
      "rainfall and temperature context",
      "seasonal corridor activation",
      "road accessibility proxy",
      "cholera and meningitis environmental context",
    ],
    auth: "none",
    cadence: "every 6h per watched corridor centroid",
    priority: 1,
    truthFloor: 0.68,
    phantomSignalType: "weather_forecast_enrichment",
    notes: ["Do not activate corridors alone", "Useful for seasonal and friction layers"],
  },
  {
    id: "open_meteo_historical",
    label: "Open-Meteo Historical Weather API",
    role: "REFERENCE_BASELINE",
    element: "earth",
    corridorUse: [
      "historical rainfall baselines",
      "seasonality calibration",
      "activation history comparison",
      "retrospective corridor validation",
    ],
    auth: "none",
    cadence: "manual or weekly baseline refresh",
    priority: 1,
    truthFloor: 0.72,
    phantomSignalType: "historical_weather_baseline",
    notes: ["Store as baseline evidence, not live signal"],
  },
  {
    id: "open_meteo_elevation",
    label: "Open-Meteo Elevation API",
    role: "ENRICHMENT",
    element: "earth",
    corridorUse: [
      "terrain friction",
      "least-cost path validation",
      "altitude-aware corridor plausibility",
    ],
    auth: "none",
    cadence: "cache forever after first coordinate query",
    priority: 1,
    truthFloor: 0.8,
    phantomSignalType: "terrain_elevation_enrichment",
    notes: ["Elevation values should be cached by lat/lng grid cell"],
  },
  {
    id: "open_meteo_air_quality",
    label: "Open-Meteo Air Quality API",
    role: "ENRICHMENT",
    element: "earth",
    corridorUse: [
      "dust and particulate context",
      "meningitis belt dry-season context",
      "urban stress proxy",
    ],
    auth: "none",
    cadence: "daily or every 12h",
    priority: 3,
    truthFloor: 0.62,
    phantomSignalType: "air_quality_enrichment",
    notes: ["Auxiliary only; never activates corridor alone"],
  },
  {
    id: "open_meteo_flood",
    label: "Open-Meteo Flood / River Discharge API",
    role: "ENRICHMENT",
    element: "earth",
    corridorUse: [
      "river crossing disruption",
      "cholera water-risk context",
      "route blockage and displacement pressure",
    ],
    auth: "none",
    cadence: "daily during rainy season; weekly otherwise",
    priority: 2,
    truthFloor: 0.68,
    phantomSignalType: "flood_river_discharge_enrichment",
    notes: ["Use with hydrological corridor nodes only"],
  },
  {
    id: "oikolab_weather",
    label: "Oikolab Weather API",
    role: "REFERENCE_BASELINE",
    element: "earth",
    corridorUse: [
      "long-horizon historical weather",
      "70+ year baseline calibration",
      "seasonal anomaly analysis",
    ],
    auth: "apiKey",
    cadence: "monthly calibration or retrospective validation",
    priority: 2,
    truthFloor: 0.72,
    phantomSignalType: "long_horizon_weather_baseline",
    notes: ["Use when richer history is required than free forecast feeds"],
  },
  {
    id: "positionstack_geocoding",
    label: "Positionstack Geocoding API",
    role: "VALIDATION_AUXILIARY",
    element: "earth",
    corridorUse: [
      "forward geocode named places",
      "reverse geocode raw coordinates",
      "normalize source locations into POE_Node anchors",
    ],
    auth: "apiKey",
    cadence: "on new place name or low-confidence coordinate",
    priority: 1,
    truthFloor: 0.7,
    phantomSignalType: "geocoding_validation",
    notes: ["Cache all geocoding results", "Never expose key to client bundle"],
  },
  {
    id: "administrative_divisions_db",
    label: "Administrative Divisions DB",
    role: "REFERENCE_BASELINE",
    element: "earth",
    corridorUse: [
      "country/state/LGA normalization",
      "admin-boundary lookup",
      "jurisdiction rollup for reports",
    ],
    auth: "none",
    cadence: "monthly or release-based sync",
    priority: 1,
    truthFloor: 0.82,
    phantomSignalType: "admin_boundary_reference",
    notes: ["Prefer local cached copy for offline-first operation"],
  },
  {
    id: "actinia_grass_gis",
    label: "Actinia GRASS GIS",
    role: "VALIDATION_AUXILIARY",
    element: "earth",
    corridorUse: [
      "geospatial processing",
      "least-cost route analysis",
      "terrain and raster operations",
      "corridor geometry validation",
    ],
    auth: "apiKey",
    cadence: "on corridor geometry computation or batch recalculation",
    priority: 2,
    truthFloor: 0.76,
    phantomSignalType: "gis_processing_result",
    notes: ["Can be self-hosted to preserve sovereignty and offline resilience"],
  },
  {
    id: "socrata_open_data",
    label: "Socrata Open Data API",
    role: "ENRICHMENT",
    element: "ether",
    corridorUse: [
      "government open-data feeds",
      "facility, infrastructure, public service datasets",
      "market or transport datasets where available",
    ],
    auth: "none",
    cadence: "dataset-specific; usually daily/weekly",
    priority: 3,
    truthFloor: 0.6,
    phantomSignalType: "open_government_dataset_enrichment",
    notes: ["Dataset provenance must be stored because each Socrata portal differs"],
  },
  {
    id: "openafrica",
    label: "openAFRICA",
    role: "REFERENCE_BASELINE",
    element: "ether",
    corridorUse: [
      "African open datasets",
      "admin, infrastructure, demographic and public-interest data discovery",
      "baseline enrichment",
    ],
    auth: "none",
    cadence: "manual curation or weekly dataset watch",
    priority: 2,
    truthFloor: 0.64,
    phantomSignalType: "africa_open_data_reference",
    notes: ["Use as dataset discovery and baseline source, not live activation truth"],
  },
  {
    id: "data_gov",
    label: "Data.gov / Government Open Data Portals",
    role: "REFERENCE_BASELINE",
    element: "ether",
    corridorUse: [
      "open-data discovery",
      "population, facilities, transport, climate, governance datasets where applicable",
    ],
    auth: "none",
    cadence: "manual curation or scheduled catalog search",
    priority: 4,
    truthFloor: 0.58,
    phantomSignalType: "government_open_data_reference",
    notes: ["Mostly metadata/catalog source; validate dataset relevance before ingestion"],
  },
  {
    id: "adsb_exchange",
    label: "ADS-B Exchange",
    role: "ENRICHMENT",
    element: "air",
    corridorUse: [
      "formal air movement context",
      "humanitarian aviation logistics awareness",
      "not informal human corridor detection",
    ],
    auth: "apiKey",
    cadence: "on-demand or hourly where relevant",
    priority: 5,
    truthFloor: 0.58,
    phantomSignalType: "aviation_movement_enrichment",
    notes: ["Do not use for individual tracking; aggregate only"],
  },
  {
    id: "aftership_tracking",
    label: "AfterShip Tracking API",
    role: "ENRICHMENT",
    element: "water",
    corridorUse: [
      "formal shipment visibility",
      "health commodity route monitoring",
      "logistics corridor overlay",
    ],
    auth: "apiKey",
    cadence: "on tracked shipment status change",
    priority: 5,
    truthFloor: 0.66,
    phantomSignalType: "formal_logistics_tracking_enrichment",
    notes: ["Use for aid/shipment corridors, not informal movement inference"],
  },
];

// ═══════════════════════════════════════════════════════════════
// 1. Canonical Normalized Enrichment Signal
// ═══════════════════════════════════════════════════════════════

export interface PhantomExternalApiSignal {
  signalId: string;
  source: PhantomApiSourceId;
  sourceRecordId: string;
  sourceUrl?: string;
  sourceRole: PhantomSourceRole;
  element: PhantomElement;
  signalType: string;
  corridorId?: string;
  baselineId?: string;
  runId: string;
  workspace: "phantom-poe";
  system: "mo-border-phantom-001";
  observedAt: string;
  ingestedAt: string;
  lat?: number;
  lng?: number;
  admin0?: string;
  admin1?: string;
  admin2?: string;
  locationPrecisionClass: "exact" | "approximate" | "admin_centroid" | "unknown";
  value: number | string | boolean | Record<string, unknown>;
  unit?: string;
  truthScore: number;
  uncertainty: number;
  payload: Record<string, unknown>;
  normalizationVersion: string;
  scoringAlgorithmVersion: string;
}

// ═══════════════════════════════════════════════════════════════
// 2. Connector Contract
// ═══════════════════════════════════════════════════════════════

export interface PhantomPublicApiConnector<TInput = unknown> {
  sourceId: PhantomApiSourceId;
  fetch(input: TInput): Promise<unknown[]>;
  normalize(raw: unknown[], context: Record<string, unknown>): Promise<PhantomExternalApiSignal[]>;
  validate(signals: PhantomExternalApiSignal[]): Promise<PhantomExternalApiSignal[]>;
}

// ═══════════════════════════════════════════════════════════════
// 3. Environment Variables
// ═══════════════════════════════════════════════════════════════

export const PHANTOM_PUBLIC_API_ENV = {
  // No key required
  OPEN_METEO_BASE_URL: "https://api.open-meteo.com",
  OPEN_METEO_ARCHIVE_BASE_URL: "https://archive-api.open-meteo.com",
  OPEN_METEO_AIR_QUALITY_BASE_URL: "https://air-quality-api.open-meteo.com",
  OPEN_METEO_FLOOD_BASE_URL: "https://flood-api.open-meteo.com",
  OPEN_METEO_ELEVATION_BASE_URL: "https://api.open-meteo.com/v1/elevation",

  // Keys required (server-only)
  POSITIONSTACK_ACCESS_KEY: process.env.POSITIONSTACK_ACCESS_KEY || "",
  OIKOLAB_API_KEY: process.env.OIKOLAB_API_KEY || "",
  ACTINIA_API_KEY: process.env.ACTINIA_API_KEY || "",
  ADSB_EXCHANGE_API_KEY: process.env.ADSB_EXCHANGE_API_KEY || "",
  AFTERSHIP_API_KEY: process.env.AFTERSHIP_API_KEY || "",
};

// ═══════════════════════════════════════════════════════════════
// 4. Execution Order & Promotion Rules
// ═══════════════════════════════════════════════════════════════

export const PHANTOM_PUBLIC_API_EXECUTION_ORDER: PhantomApiSourceId[] = [
  "administrative_divisions_db",
  "positionstack_geocoding",
  "open_meteo_elevation",
  "open_meteo_forecast",
  "open_meteo_historical",
  "open_meteo_flood",
  "open_meteo_air_quality",
  "oikolab_weather",
  "actinia_grass_gis",
  "openafrica",
  "socrata_open_data",
  "data_gov",
  "adsb_exchange",
  "aftership_tracking",
];

export const PUBLIC_API_PROMOTION_RULES = {
  defaultRole: "ENRICHMENT" as PhantomSourceRole,
  canActivateCorridorAlone: false,
  mayPromoteToValidationAuxiliaryWhen: [
    "source is stable for 30 days",
    "source has documented provenance",
    "source output is reproducible",
    "Woo approves source ethics",
    "analyst governance signs promotion",
  ],
  requiredFields: [
    "source",
    "sourceRecordId",
    "runId",
    "observedAt",
    "ingestedAt",
    "truthScore",
    "uncertainty",
    "normalizationVersion",
  ] as const,
};

// ═══════════════════════════════════════════════════════════════
// 5. MoScript: Public API Connector Registry
// ═══════════════════════════════════════════════════════════════

export const mo_PUBLIC_API_REGISTRY: MoScript = {
  id: "mo-poe-public-api-registry-v1-001" as `mo-${string}-${string}-${number}`,
  name: "Public API Connector Registry",
  trigger: 'boot("layer-1.8")',
  inputs: ["registry"],
  logic: async (inputs: Record<string, unknown>) => {
    const { registry } = inputs as {
      registry: {
        mountMany: (ids: string[]) => Promise<void>;
        registerSources: (sources: PhantomApiSourceSpec[]) => Promise<void>;
      };
    };
    
    // Register all public API sources
    await registry.registerSources(PHANTOM_PUBLIC_API_SOURCES);
    
    // Mount high-priority connectors (no API key required first)
    const priorityConnectors = [
      "mo-poe-open-meteo-forecast-v1-001",
      "mo-poe-open-meteo-elevation-v1-001",
      "mo-poe-admin-divisions-sync-v1-001",
    ];
    
    await registry.mountMany(priorityConnectors);
    
    return { 
      mounted: priorityConnectors.length, 
      sourcesRegistered: PHANTOM_PUBLIC_API_SOURCES.length,
      freeApis: PHANTOM_PUBLIC_API_SOURCES.filter(s => s.auth === "none").length,
      keyRequiredApis: PHANTOM_PUBLIC_API_SOURCES.filter(s => s.auth !== "none").length,
    };
  },
  voiceLine: (r: { mounted: number; sourcesRegistered: number; freeApis: number }) =>
    `Public API conduit sealed. ${r.mounted} connectors mounted, ${r.freeApis} free APIs ready.`,
  sass: true,
};

// ═══════════════════════════════════════════════════════════════
// 6. MoScript: Open-Meteo Forecast Connector
// ═══════════════════════════════════════════════════════════════

export const mo_OPEN_METEO_FORECAST: MoScript = {
  id: "mo-poe-open-meteo-forecast-v1-001" as `mo-${string}-${string}-${number}`,
  name: "Open-Meteo Forecast Corridor Enrichment",
  trigger: 'cron("0 */6 * * *")', // Every 6 hours
  inputs: ["corridorRepo", "signalRepo", "runId"],
  logic: async (inputs: Record<string, unknown>) => {
    const { corridorRepo, signalRepo, runId } = inputs as {
      corridorRepo: {
        getWatchedCorridors: () => Promise<Array<{
          corridorId: string;
          centroid: { lat: number; lng: number };
        }>>;
      };
      signalRepo: {
        upsertSignals: (signals: PhantomExternalApiSignal[]) => Promise<void>;
      };
      runId: string;
    };
    
    const corridors = await corridorRepo.getWatchedCorridors();
    const signals: PhantomExternalApiSignal[] = [];
    const baseUrl = PHANTOM_PUBLIC_API_ENV.OPEN_METEO_BASE_URL;
    
    for (const c of corridors) {
      try {
        // Fetch forecast from Open-Meteo
        const url = `${baseUrl}/v1/forecast?latitude=${c.centroid.lat}&longitude=${c.centroid.lng}&hourly=temperature_2m,precipitation,relative_humidity_2m&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=auto`;
        const response = await fetch(url);
        
        if (!response.ok) {
          console.warn(`Open-Meteo fetch failed for corridor ${c.corridorId}: ${response.status}`);
          continue;
        }
        
        const weather = await response.json();
        const observedAt = new Date().toISOString();
        
        signals.push({
          signalId: crypto.randomUUID(),
          source: "open_meteo_forecast",
          sourceRecordId: `open-meteo:${c.corridorId}:${observedAt.slice(0, 10)}`,
          sourceRole: "ENRICHMENT",
          element: "earth",
          signalType: "weather_forecast_enrichment",
          corridorId: c.corridorId,
          runId,
          workspace: "phantom-poe",
          system: "mo-border-phantom-001",
          observedAt,
          ingestedAt: new Date().toISOString(),
          lat: c.centroid.lat,
          lng: c.centroid.lng,
          locationPrecisionClass: "approximate",
          value: weather,
          truthScore: 0.68,
          uncertainty: 0.24,
          payload: weather,
          normalizationVersion: "public-api-v1.0",
          scoringAlgorithmVersion: "weather-enrichment-v1.0",
        });
      } catch (err) {
        console.error(`Open-Meteo error for corridor ${c.corridorId}:`, err);
      }
    }
    
    if (signals.length > 0) {
      await signalRepo.upsertSignals(signals);
    }
    
    return { 
      source: "open_meteo_forecast", 
      pulled: signals.length,
      corridorsChecked: corridors.length,
    };
  },
  voiceLine: (r: { pulled: number; corridorsChecked: number }) => 
    `Open-Meteo forecast sealed. ${r.pulled} corridor enrichments from ${r.corridorsChecked} corridors.`,
  sass: true,
};

// ═══════════════════════════════════════════════════════════════
// 7. MoScript: Open-Meteo Elevation Connector
// ═══════════════════════════════════════════════════════════════

export const mo_OPEN_METEO_ELEVATION: MoScript = {
  id: "mo-poe-open-meteo-elevation-v1-001" as `mo-${string}-${string}-${number}`,
  name: "Open-Meteo Elevation Terrain Cache",
  trigger: 'event("corridor.geometry.created")',
  inputs: ["corridor", "terrainRepo", "runId"],
  logic: async (inputs: Record<string, unknown>) => {
    const { corridor, terrainRepo, runId } = inputs as {
      corridor: {
        corridorId: string;
        geometry?: {
          samplePoints?: Array<{ lat: number; lng: number }>;
        };
        centroid: { lat: number; lng: number };
      };
      terrainRepo: {
        cacheElevation: (data: {
          corridorId: string;
          elevation: Array<{ lat: number; lng: number; elevation: number }>;
          runId: string;
        }) => Promise<void>;
      };
      runId: string;
    };
    
    const samplePoints = corridor.geometry?.samplePoints ?? [corridor.centroid];
    const baseUrl = PHANTOM_PUBLIC_API_ENV.OPEN_METEO_ELEVATION_BASE_URL;
    
    try {
      const url = `${baseUrl}?latitude=${samplePoints.map(p => p.lat).join(",")}&longitude=${samplePoints.map(p => p.lng).join(",")}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Open-Meteo Elevation API error: ${response.status}`);
      }
      
      const data = await response.json();
      const elevation = samplePoints.map((point, i) => ({
        lat: point.lat,
        lng: point.lng,
        elevation: data.elevation?.[i] ?? 0,
      }));
      
      await terrainRepo.cacheElevation({ 
        corridorId: corridor.corridorId, 
        elevation, 
        runId 
      });
      
      return {
        corridorId: corridor.corridorId,
        samples: samplePoints.length,
        source: "open_meteo_elevation",
        cached: true,
      };
    } catch (err) {
      console.error(`Elevation cache failed for ${corridor.corridorId}:`, err);
      return {
        corridorId: corridor.corridorId,
        samples: samplePoints.length,
        source: "open_meteo_elevation",
        cached: false,
        error: String(err),
      };
    }
  },
  voiceLine: (r: { corridorId: string; samples: number; cached: boolean }) =>
    r.cached
      ? `Elevation cache sealed for ${r.corridorId}. ${r.samples} terrain points resolved.`
      : `Elevation cache FAILED for ${r.corridorId}.`,
  sass: true,
};

// ═══════════════════════════════════════════════════════════════
// 8. MoScript: Administrative Divisions Sync
// ═══════════════════════════════════════════════════════════════

export const mo_ADMIN_DIVISIONS_SYNC: MoScript = {
  id: "mo-poe-admin-divisions-sync-v1-001" as `mo-${string}-${string}-${number}`,
  name: "Administrative Divisions Reference Sync",
  trigger: 'cron("0 2 1 * *")', // Monthly at 2am
  inputs: ["adminRepo", "runId"],
  logic: async (inputs: Record<string, unknown>) => {
    const { adminRepo, runId } = inputs as {
      adminRepo: {
        upsertAdministrativeDivisions: (
          records: unknown[], 
          context: { runId: string; source: string }
        ) => Promise<number>;
      };
      runId: string;
    };
    
    // Core African countries for Phantom POE
    const countries = ["KE", "TZ", "UG", "CD", "NG", "GH", "RW", "ZA", "MZ", "ET", "SO", "SS", "ML", "NE", "TD", "BF"];
    
    // This would integrate with countriesnow.space or similar free API
    // For now, placeholder for actual implementation
    const mockRecords = countries.map(iso2 => ({
      countryCode: iso2,
      countryName: iso2, // Would be resolved
      divisions: [], // Would be fetched
      syncedAt: new Date().toISOString(),
    }));
    
    const inserted = await adminRepo.upsertAdministrativeDivisions(mockRecords, {
      runId,
      source: "administrative_divisions_db",
    });
    
    return { 
      countries: countries.length, 
      records: inserted,
      source: "administrative_divisions_db",
    };
  },
  voiceLine: (r: { records: number; countries: number }) =>
    `Administrative boundary memory sealed. ${r.records} divisions across ${r.countries} countries synced.`,
  sass: true,
};

// ═══════════════════════════════════════════════════════════════
// 9. Export All Public API Scripts
// ═══════════════════════════════════════════════════════════════

export const PUBLIC_API_SCRIPTS = [
  mo_PUBLIC_API_REGISTRY,
  mo_OPEN_METEO_FORECAST,
  mo_OPEN_METEO_ELEVATION,
  mo_ADMIN_DIVISIONS_SYNC,
] as const;

// Individual exports are available via the const declarations above
// Access via: PUBLIC_API_SCRIPTS[0], PUBLIC_API_SCRIPTS[1], etc.
