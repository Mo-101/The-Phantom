import { z } from 'zod';

const ServerEnvSchema = z.object({
  // AI (optional — only required for AI chat features, not map/corridor)
  GEMINI_API_KEY: z.string().optional(),

  // Database — Neon injects DATABASE_URL; NEON_DATABASE_URL is a legacy alias
  DATABASE_URL: z.string().optional(),
  NEON_DATABASE_URL: z.string().optional(),

  // Neo4j
  NEO4J_URI: z.string().optional(),
  NEO4J_USER: z.string().optional(),
  NEO4J_PASSWORD: z.string().optional(),

  // Supabase / AFRO Sentinel
  SUPABASE_URL: z.string().optional(),
  AFRO_SENTINEL_SERVICE_KEY: z.string().optional(), // was SUPABASE_KEY

  // Ollama / Trinity
  OLLAMA_BASE_URL: z.string().optional(),

  // ACLED
  ACLED_API_KEY: z.string().optional(),
  ACLED_EMAIL: z.string().optional(),
  ACLED_BASE_URL: z.string().optional(),

  // IOM DTM
  IOM_DTM_BASE_URL: z.string().optional(),
  IOM_DTM_API_KEY: z.string().optional(),

  // DHIS2
  DHIS2_BASE_URL: z.string().optional(),
  DHIS2_USERNAME: z.string().optional(),
  DHIS2_PASSWORD: z.string().optional(),

  // AFRO Sentinel direct
  AFRO_SENTINEL_API_URL: z.string().optional(),
  AFRO_SENTINEL_OIDC_TOKEN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let _cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (_cached) return _cached;

  const result = ServerEnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map(i => `  ✗ ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `\n◉⟁⬡ Phantom POE — Environment Validation Failed\n\n${missing}\n\nFix .env.local and restart.\n`
    );
  }

  _cached = result.data;
  return _cached;
}

type EngineMode = 'ingest' | 'graph' | 'trinity' | 'client';

const MODE_KEYS: Record<EngineMode, (keyof ServerEnv)[]> = {
  ingest: ['DATABASE_URL', 'SUPABASE_URL', 'AFRO_SENTINEL_SERVICE_KEY'],
  graph: ['NEO4J_URI', 'NEO4J_USER', 'NEO4J_PASSWORD'],
  trinity: ['OLLAMA_BASE_URL', 'GEMINI_API_KEY'],
  client: [],
};

export function validateMode(mode: EngineMode): void {
  const env = serverEnv();
  const missing = MODE_KEYS[mode].filter(k => !env[k]);
  if (missing.length > 0) {
    throw new Error(`Mode "${mode}" requires: ${missing.join(', ')}`);
  }
}
