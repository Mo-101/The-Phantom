import { SentinelService } from "./sentinel";
import { SignalRepository } from "../moscript/signal.repository";
import neo4j from "neo4j-driver";
import pg from "pg";

export interface DiagnosticResult {
  service: string;
  status: "OK" | "ERROR";
  message: string;
  latencyMs?: number;
}

export class DiagnosticService {
  async testAll(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    // 1. AFRO Sentinel (Vercel)
    results.push(await this.testSentinel());

    // 2. Neo4j
    results.push(await this.testNeo4j());

    // 3. ACLED
    results.push(await this.testACLED());

    // 4. IOM DTM
    results.push(await this.testDTM());

    // 5. DHIS2
    results.push(await this.testDHIS2());

    // 6. Neon PostgreSQL
    results.push(await this.testNeon());

    // 7. Supabase
    results.push(await this.testSupabase());

    return results;
  }

  private async testSentinel(): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
      const sentinel = new SentinelService();
      const signals = await sentinel.fetchSignals(0, 0, 1);
      
      // If signals is empty but no error was thrown, it might still be "OK" 
      // but we should check if it was a silent failure (like the HTML response)
      // The fetchSignals method now logs warnings for non-JSON.
      
      return {
        service: "AFRO Sentinel",
        status: "OK",
        message: "API reachable",
        latencyMs: Date.now() - start
      };
    } catch (error) {
      return {
        service: "AFRO Sentinel",
        status: "ERROR",
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testNeo4j(): Promise<DiagnosticResult> {
    const start = Date.now();
    let driver;
    try {
      const uri = process.env.VITE_NEO4J_URI || "bolt://localhost:7687";
      const user = process.env.VITE_NEO4J_USER || "neo4j";
      const password = process.env.VITE_NEO4J_PASSWORD || "";
      
      if (!password) throw new Error("Neo4j password not set");
      
      driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
      const session = driver.session();
      try {
        await session.run("RETURN 1");
        return {
          service: "Neo4j",
          status: "OK",
          message: `Connected successfully to ${uri}`,
          latencyMs: Date.now() - start
        };
      } finally {
        await session.close();
      }
    } catch (error) {
      return {
        service: "Neo4j",
        status: "ERROR",
        message: error instanceof Error ? error.message : String(error)
      };
    } finally {
      if (driver) await driver.close();
    }
  }

  private async testACLED(): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
      const apiKey = process.env.ACLED_API_KEY;
      const email = process.env.ACLED_EMAIL;
      if (!apiKey || !email) throw new Error("ACLED credentials missing");
      
      const url = new URL(process.env.ACLED_BASE_URL || "https://api.acleddata.com/acled/read");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("email", email);
      url.searchParams.set("limit", "1");
      
      const res = await fetch(url.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MoStarDiagnostic/1.0)" }
      });
      if (!res.ok) throw new Error(`ACLED returned ${res.status}`);
      
      return {
        service: "ACLED",
        status: "OK",
        message: "API reachable",
        latencyMs: Date.now() - start
      };
    } catch (error) {
      return {
        service: "ACLED",
        status: "ERROR",
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testDTM(): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
      const apiKey = process.env.IOM_DTM_API_KEY;
      if (!apiKey) throw new Error("IOM DTM API key missing");
      
      const baseUrl = process.env.IOM_DTM_BASE_URL || "https://dtm.iom.int/api/v1";
      const res = await fetch(`${baseUrl}/movements?limit=1`, {
        headers: { 
          "Authorization": `Bearer ${apiKey}`,
          "User-Agent": "Mozilla/5.0 (compatible; MoStarDiagnostic/1.0)"
        }
      });
      
      // DTM API might return 401 if key is invalid, but we check reachability
      if (res.status === 401) throw new Error("Invalid API Key");
      if (!res.ok && res.status !== 404) throw new Error(`DTM returned ${res.status}`);
      
      return {
        service: "IOM DTM",
        status: "OK",
        message: "API reachable",
        latencyMs: Date.now() - start
      };
    } catch (error) {
      return {
        service: "IOM DTM",
        status: "ERROR",
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testDHIS2(): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
      const user = process.env.DHIS2_USERNAME;
      const pass = process.env.DHIS2_PASSWORD;
      if (!user || !pass) throw new Error("DHIS2 credentials missing");
      
      const baseUrl = process.env.DHIS2_BASE_URL || "https://academy.demos.dhis2.org/web-apps-2-38-1";
      const creds = Buffer.from(`${user}:${pass}`).toString("base64");
      
      const res = await fetch(`${baseUrl}/api/system/info`, {
        headers: { 
          "Authorization": `Basic ${creds}`,
          "User-Agent": "Mozilla/5.0 (compatible; MoStarDiagnostic/1.0)"
        }
      });
      
      if (!res.ok) throw new Error(`DHIS2 returned ${res.status}`);
      
      return {
        service: "DHIS2",
        status: "OK",
        message: "Connected successfully",
        latencyMs: Date.now() - start
      };
    } catch (error) {
      return {
        service: "DHIS2",
        status: "ERROR",
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testNeon(): Promise<DiagnosticResult> {
    const start = Date.now();
    let client;
    try {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error("Neon DATABASE_URL missing");
      
      client = new pg.Client({
        connectionString: url,
        ssl: { rejectUnauthorized: false }
      });
      await client.connect();
      await client.query("SELECT 1");
      
      return {
        service: "Neon PostgreSQL",
        status: "OK",
        message: "Connected successfully",
        latencyMs: Date.now() - start
      };
    } catch (error) {
      return {
        service: "Neon PostgreSQL",
        status: "ERROR",
        message: error instanceof Error ? error.message : String(error)
      };
    } finally {
      if (client) await client.end();
    }
  }

  private async testSupabase(): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
      const url = process.env.VITE_SUPABASE_URL;
      const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) throw new Error("Supabase credentials missing");
      
      const res = await fetch(`${url}/rest/v1/`, {
        headers: { "apikey": key, "Authorization": `Bearer ${key}` }
      });
      
      if (!res.ok && res.status !== 404) throw new Error(`Supabase returned ${res.status}`);
      
      return {
        service: "Supabase",
        status: "OK",
        message: "API reachable",
        latencyMs: Date.now() - start
      };
    } catch (error) {
      return {
        service: "Supabase",
        status: "ERROR",
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
