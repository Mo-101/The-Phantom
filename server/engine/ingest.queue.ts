import type { IngestJob, IngestResult, IngestQueueConfig, CircuitState, PriorityTier } from './ingest.types';

const TIER_CONCURRENCY: Record<PriorityTier, number> = {
  fire: 3,
  water: 2,
  earth: 1,
};

const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_RESET_MS = 60_000;

export class IngestQueue {
  private config: IngestQueueConfig;
  private circuits: Map<string, CircuitState> = new Map();

  constructor(config: IngestQueueConfig) {
    this.config = config;
  }

  /** Run a single pass of all data sources */
  async runOnce(): Promise<{
    results: IngestResult[];
    totalIngested: number;
    totalErrors: number;
  }> {
    const jobs = this.buildJobs();
    const results: IngestResult[] = [];

    // Group by tier, run tier by tier (fire first)
    const tierOrder: PriorityTier[] = ['fire', 'water', 'earth'];

    for (const tier of tierOrder) {
      const tierJobs = jobs.filter((j) => j.tier === tier);
      const concurrency = TIER_CONCURRENCY[tier];

      // Process in batches of `concurrency`
      for (let i = 0; i < tierJobs.length; i += concurrency) {
        const batch = tierJobs.slice(i, i + concurrency);
        const batchResults = await Promise.allSettled(
          batch.map((job) => this.executeJob(job))
        );

        for (const r of batchResults) {
          if (r.status === 'fulfilled') {
            results.push(r.value);
          } else {
            results.push({
              jobId: 'unknown',
              source: 'unknown',
              status: 'error',
              recordsIngested: 0,
              durationMs: 0,
              error: String(r.reason),
            });
          }
        }
      }
    }

    return {
      results,
      totalIngested: results.reduce((s, r) => s + r.recordsIngested, 0),
      totalErrors: results.filter((r) => r.status !== 'ok').length,
    };
  }

  private buildJobs(): IngestJob[] {
    const now = Date.now();
    const jobs: IngestJob[] = [];

    // Fire tier: AFRO Sentinel (health urgency)
    jobs.push({
      id: `sentinel-${now}`,
      source: 'afro-sentinel',
      tier: 'fire',
      payload: { url: this.config.supabaseUrl },
      retries: 0,
      createdAt: now,
    });

    // Water tier: ACLED, IOM DTM
    if (this.config.acledKey) {
      jobs.push({
        id: `acled-${now}`,
        source: 'acled',
        tier: 'water',
        payload: {
          key: this.config.acledKey,
          email: this.config.acledEmail,
          baseUrl: this.config.acledBaseUrl,
        },
        retries: 0,
        createdAt: now,
      });
    }

    if (this.config.dtmApiKey) {
      jobs.push({
        id: `dtm-${now}`,
        source: 'iom-dtm',
        tier: 'water',
        payload: {
          baseUrl: this.config.dtmBaseUrl,
          apiKey: this.config.dtmApiKey,
        },
        retries: 0,
        createdAt: now,
      });
    }

    // Earth tier: DHIS2 (bulk, low priority)
    if (this.config.dhis2Username) {
      jobs.push({
        id: `dhis2-${now}`,
        source: 'dhis2',
        tier: 'earth',
        payload: {
          baseUrl: this.config.dhis2BaseUrl,
          user: this.config.dhis2Username,
          pass: this.config.dhis2Password,
        },
        retries: 0,
        createdAt: now,
      });
    }

    return jobs;
  }

  private async executeJob(job: IngestJob): Promise<IngestResult> {
    const start = Date.now();

    // Circuit breaker check
    const circuit = this.circuits.get(job.source) ?? { failures: 0, lastFailure: 0, open: false };
    if (circuit.open) {
      if (Date.now() - circuit.lastFailure < CIRCUIT_RESET_MS) {
        return {
          jobId: job.id,
          source: job.source,
          status: 'circuit-open',
          recordsIngested: 0,
          durationMs: 0,
          error: `Circuit open for ${job.source}, retry after ${CIRCUIT_RESET_MS}ms`,
        };
      }
      // Reset circuit for retry
      circuit.open = false;
      circuit.failures = 0;
    }

    try {
      let count = 0;

      switch (job.source) {
        case 'afro-sentinel':
          count = await this.fetchSentinel();
          break;
        case 'acled':
          count = await this.fetchACLED(job.payload as { key: string; email?: string; baseUrl?: string });
          break;
        case 'iom-dtm':
          count = await this.fetchDTM(job.payload as { baseUrl?: string; apiKey: string });
          break;
        case 'dhis2':
          count = await this.fetchDHIS2(job.payload as { baseUrl?: string; user: string; pass?: string });
          break;
        default:
          throw new Error(`Unknown source: ${job.source}`);
      }

      // Reset circuit on success
      circuit.failures = 0;
      circuit.open = false;
      this.circuits.set(job.source, circuit);

      return {
        jobId: job.id,
        source: job.source,
        status: 'ok',
        recordsIngested: count,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      circuit.failures += 1;
      circuit.lastFailure = Date.now();
      if (circuit.failures >= CIRCUIT_THRESHOLD) {
        circuit.open = true;
      }
      this.circuits.set(job.source, circuit);

      return {
        jobId: job.id,
        source: job.source,
        status: 'error',
        recordsIngested: 0,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /* ─── Source Fetchers ─── */

  private async fetchSentinel(): Promise<number> {
    const url = new URL('/api/signals', this.config.supabaseUrl);
    url.searchParams.set('lat', '0');
    url.searchParams.set('lng', '0');
    url.searchParams.set('radius', '10000');

    const res = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
        apikey: this.config.supabaseKey,
        Authorization: `Bearer ${this.config.supabaseKey}`,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`Sentinel ${res.status}`);
    const data = await res.json();
    const signals = data.signals ?? data ?? [];

    // Batch write to Neon
    await this.batchWriteToNeon(
      signals.map((s: Record<string, unknown>) => ({
        source: 'afro-sentinel',
        external_id: s.id ?? crypto.randomUUID(),
        payload: JSON.stringify(s),
        ingested_at: new Date().toISOString(),
      }))
    );

    return Array.isArray(signals) ? signals.length : 0;
  }

  private async fetchACLED(cfg: { key: string; email?: string; baseUrl?: string }): Promise<number> {
    const url = new URL(cfg.baseUrl ?? 'https://api.acleddata.com/acled/read');
    url.searchParams.set('key', cfg.key);
    if (cfg.email) url.searchParams.set('email', cfg.email);
    url.searchParams.set('limit', '100');

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'MoStarIngest/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`ACLED ${res.status}`);
    const data = await res.json();
    const events = data.data ?? [];

    await this.batchWriteToNeon(
      events.map((e: Record<string, unknown>) => ({
        source: 'acled',
        external_id: String(e.data_id ?? crypto.randomUUID()),
        payload: JSON.stringify(e),
        ingested_at: new Date().toISOString(),
      }))
    );

    return events.length;
  }

  private async fetchDTM(cfg: { baseUrl?: string; apiKey: string }): Promise<number> {
    const baseUrl = cfg.baseUrl ?? 'https://dtm.iom.int/api/v1';
    const res = await fetch(`${baseUrl}/movements?limit=50`, {
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'User-Agent': 'MoStarIngest/1.0',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok && res.status !== 404) throw new Error(`DTM ${res.status}`);
    const data = await res.json();
    const flows = data.data ?? data.results ?? [];

    await this.batchWriteToNeon(
      flows.map((f: Record<string, unknown>) => ({
        source: 'iom-dtm',
        external_id: String(f.id ?? crypto.randomUUID()),
        payload: JSON.stringify(f),
        ingested_at: new Date().toISOString(),
      }))
    );

    return flows.length;
  }

  private async fetchDHIS2(cfg: { baseUrl?: string; user: string; pass?: string }): Promise<number> {
    const baseUrl = cfg.baseUrl ?? 'https://academy.demos.dhis2.org/web-apps-2-38-1';
    const creds = Buffer.from(`${cfg.user}:${cfg.pass ?? ''}`).toString('base64');

    const res = await fetch(`${baseUrl}/api/dataValueSets.json?dataSet=BfMAe6Itzgt&period=202301&orgUnit=DiszpKrYNg8&limit=50`, {
      headers: {
        Authorization: `Basic ${creds}`,
        'User-Agent': 'MoStarIngest/1.0',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`DHIS2 ${res.status}`);
    const data = await res.json();
    const values = data.dataValues ?? [];

    await this.batchWriteToNeon(
      values.map((v: Record<string, unknown>) => ({
        source: 'dhis2',
        external_id: `${String(v.dataElement)}-${String(v.period)}-${String(v.orgUnit)}`,
        payload: JSON.stringify(v),
        ingested_at: new Date().toISOString(),
      }))
    );

    return values.length;
  }

  /* ─── Batch Writer ─── */

  private async batchWriteToNeon(
    rows: Array<{ source: string; external_id: string; payload: string; ingested_at: string }>
  ): Promise<void> {
    if (rows.length === 0) return;

    const pg = await import('pg');
    const client = new pg.default.Client({
      connectionString: this.config.databaseUrl,
      ssl: { rejectUnauthorized: false },
    });

    await client.connect();
    try {
      // Ensure table exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS ingested_signals (
          id SERIAL PRIMARY KEY,
          source TEXT NOT NULL,
          external_id TEXT NOT NULL,
          payload JSONB NOT NULL,
          ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(source, external_id)
        )
      `);

      // Batch insert with ON CONFLICT skip
      const BATCH_SIZE = 50;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const values: unknown[] = [];
        const placeholders = batch.map((row, idx) => {
          const offset = idx * 4;
          values.push(row.source, row.external_id, row.payload, row.ingested_at);
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
        });

        await client.query(
          `INSERT INTO ingested_signals (source, external_id, payload, ingested_at)
           VALUES ${placeholders.join(', ')}
           ON CONFLICT (source, external_id) DO NOTHING`,
          values
        );
      }
    } finally {
      await client.end();
    }
  }
}
