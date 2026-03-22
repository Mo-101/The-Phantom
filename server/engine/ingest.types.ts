/* ─── Ingestion Queue Types ─── */

export type PriorityTier = 'fire' | 'water' | 'earth';

export interface IngestJob {
  id: string;
  source: string;
  tier: PriorityTier;
  payload: unknown;
  retries: number;
  createdAt: number;
}

export interface IngestResult {
  jobId: string;
  source: string;
  status: 'ok' | 'error' | 'circuit-open';
  recordsIngested: number;
  durationMs: number;
  error?: string;
}

export interface IngestQueueConfig {
  supabaseUrl: string;
  supabaseKey: string;
  databaseUrl: string;
  acledKey?: string;
  acledEmail?: string;
  acledBaseUrl?: string;
  dtmBaseUrl?: string;
  dtmApiKey?: string;
  dhis2BaseUrl?: string;
  dhis2Username?: string;
  dhis2Password?: string;
}

export interface CircuitState {
  failures: number;
  lastFailure: number;
  open: boolean;
}

/* ─── DCX Trinity Types ─── */

export type DCXRole = 'mind' | 'soul' | 'body';

export interface DCXModelConfig {
  role: DCXRole;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

export interface DCXMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface DCXTrinityResult {
  mind: string;  // Analysis / reasoning
  soul: string;  // Ethical / humanitarian lens
  body: string;  // Operational / actionable output
  synthesized: string;
  latencyMs: number;
}

export interface DCXContext {
  corridorId?: string;
  signals: string[];
  scoreDecomposition?: Record<string, number>;
  traceLines?: string[];
}
