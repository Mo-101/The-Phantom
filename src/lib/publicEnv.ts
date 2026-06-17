type PublicEnv = Record<string, string | undefined>;

const nextPublicEnv: PublicEnv = {
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_API_COMPUTE_SCORES_URL: process.env.NEXT_PUBLIC_API_COMPUTE_SCORES_URL,
  NEXT_PUBLIC_API_OLLAM_CHAT_URL: process.env.NEXT_PUBLIC_API_OLLAM_CHAT_URL,
  NEXT_PUBLIC_API_PHANTOM_MCP_URL: process.env.NEXT_PUBLIC_API_PHANTOM_MCP_URL,
  NEXT_PUBLIC_API_PUBLIC_KEY: process.env.NEXT_PUBLIC_API_PUBLIC_KEY,
  NEXT_PUBLIC_API_TEMPORAL_URL: process.env.NEXT_PUBLIC_API_TEMPORAL_URL,
  NEXT_PUBLIC_ENABLE_NEON_TEMPORAL: process.env.NEXT_PUBLIC_ENABLE_NEON_TEMPORAL,
  NEXT_PUBLIC_MAPBOX_BASEMAP: process.env.NEXT_PUBLIC_MAPBOX_BASEMAP,
  NEXT_PUBLIC_MAPBOX_LIGHT_PRESET: process.env.NEXT_PUBLIC_MAPBOX_LIGHT_PRESET,
  NEXT_PUBLIC_MAPBOX_SHOW_3D_OBJECTS: process.env.NEXT_PUBLIC_MAPBOX_SHOW_3D_OBJECTS,
  NEXT_PUBLIC_MAPBOX_SHOW_PEDESTRIAN_ROADS: process.env.NEXT_PUBLIC_MAPBOX_SHOW_PEDESTRIAN_ROADS,
  NEXT_PUBLIC_MAPBOX_SHOW_PLACE_LABELS: process.env.NEXT_PUBLIC_MAPBOX_SHOW_PLACE_LABELS,
  NEXT_PUBLIC_MAPBOX_SHOW_POI_LABELS: process.env.NEXT_PUBLIC_MAPBOX_SHOW_POI_LABELS,
  NEXT_PUBLIC_MAPBOX_SHOW_ROAD_LABELS: process.env.NEXT_PUBLIC_MAPBOX_SHOW_ROAD_LABELS,
  NEXT_PUBLIC_MAPBOX_SHOW_ROADS_AND_TRANSIT: process.env.NEXT_PUBLIC_MAPBOX_SHOW_ROADS_AND_TRANSIT,
  NEXT_PUBLIC_MAPBOX_SHOW_TRANSIT_LABELS: process.env.NEXT_PUBLIC_MAPBOX_SHOW_TRANSIT_LABELS,
  NEXT_PUBLIC_MAPBOX_STANDARD_FONT: process.env.NEXT_PUBLIC_MAPBOX_STANDARD_FONT,
  NEXT_PUBLIC_MAPBOX_STANDARD_THEME: process.env.NEXT_PUBLIC_MAPBOX_STANDARD_THEME,
  NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  NEXT_PUBLIC_OLLAMA_HOST: process.env.NEXT_PUBLIC_OLLAMA_HOST,
  NEXT_PUBLIC_OLLAMA_MODEL: process.env.NEXT_PUBLIC_OLLAMA_MODEL,
};

function getImportMetaEnv(): PublicEnv {
  try {
    return ((import.meta as unknown as { env?: PublicEnv }).env ?? {}) as PublicEnv;
  } catch {
    return {};
  }
}

function getProcessEnv(): PublicEnv {
  if (typeof process === "undefined") return {};
  return process.env as PublicEnv;
}

export function readPublicEnv(key: string): string | undefined {
  const metaEnv = getImportMetaEnv();
  const processEnv = getProcessEnv();
  return metaEnv[key] ?? nextPublicEnv[key] ?? processEnv[key];
}

export function readAnyPublicEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readPublicEnv(key);
    if (value != null && value !== "") return value;
  }
  return undefined;
}

export function isDevRuntime(): boolean {
  return readPublicEnv("DEV") === "true" || readPublicEnv("NODE_ENV") === "development";
}
