/**
 * Signal Repository - Truth-Cleared Persistence Only
 */

import { Driver } from "neo4j-driver";
import type { NormalizedSignal } from "./signal.schemas";
import { asNeo4jInt, fromNeo4jInt } from "./neo4j.util";

class SignalRepository {
  upsertEntropyAlert(arg0: { runId: string | undefined; nodeId: string; H_baseline: number; H_current: number; deltaH: number; threshold: number; spiked: boolean; riskClass: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; }) {
    throw new Error("Method not implemented.");
  }
  upsertCorridor(arg0: { corridorId: string; runId: string | undefined; startNode: string; endNode: string; score: number; riskClass: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; activated: boolean; velocity: number; totalKm: number; timestamp: string; }) {
    throw new Error("Method not implemented.");
  }
  getBaselineSignals(nodeId: string, baselineWeeks: number) {
    throw new Error("Method not implemented.");
  }
  constructor(private readonly driver: Driver, private readonly database: string = "neo4j") {}

  async upsertSignal(signal: any): Promise<void> {
    const session = this.driver.session({ database: this.database });
    try {
      const query = `
        MERGE (e:SignalEvent {signalId: $id})
        SET e.type      = $type,
            e.nodeId    = $nodeId,
            e.magnitude = toFloat($magnitude),
            e.timestamp = datetime($timestamp),
            e.country   = $metadata.country,
            e.lat       = toFloat($metadata.lat),
            e.lng       = toFloat($metadata.lng),
            e.rawValue  = toFloat($metadata.rawValue),
            e.truthScore = toFloat($metadata.truthScore),
            e.notes     = $metadata.notes,
            e.runId     = $runId,
            e.updatedAt = datetime()
        RETURN count(e) AS count
      `;
      await session.run(query, { ...signal, runId: signal.runId || "manual" });
    } finally {
      await session.close();
    }
  }

  async getSignalsByTimeRange(start: string, end: string): Promise<any[]> {
    const session = this.driver.session({ database: this.database });
    try {
      const query = `
        MATCH (e:SignalEvent)
        WHERE e.timestamp >= datetime($start) AND e.timestamp <= datetime($end)
        RETURN e
        ORDER BY e.timestamp ASC
      `;
      const result = await session.run(query, { start, end });
      return result.records.map(record => {
        const props = record.get("e").properties;
        return {
          ...props,
          timestamp: props.timestamp.toString()
        };
      });
    } finally {
      await session.close();
    }
  }

  async upsertSignals(signals: NormalizedSignal[]): Promise<number> {
    if (!signals.length) return 0;
    const session = this.driver.session({ database: this.database });
    try {
      const query = `
        UNWIND $signals AS s
        MERGE (e:SignalEvent {signalId: s.id})
        SET e.source    = s.source,
            e.type      = s.type,
            e.element   = s.element,
            e.location  = s.location,
            e.country   = s.country,
            e.lat       = toFloat(s.latitude),
            e.lon       = toFloat(s.longitude),
            e.magnitude = toFloat(s.magnitude),
            e.truthScore = toFloat(s.truthScore),
            e.disease   = s.disease,
            e.timestamp = datetime(s.timestamp),
            e.raw       = s.rawJson,
            e.runId     = s.runId,
            e.updatedAt = datetime()
        RETURN count(e) AS count
      `;
      const result = await session.run(query, {
        signals: signals.map(s => ({
          id:         s.id,
          runId:      s.runId || "manual",
          source:     s.source,
          type:       s.type,
          element:    s.element,
          location:   s.location,
          country:    s.country,
          latitude:   s.latitude ?? null,
          longitude:  s.longitude ?? null,
          magnitude:  s.magnitude,
          truthScore: s.truthScore,
          disease:    s.disease ?? null,
          timestamp:  s.timestamp,
          rawJson:    JSON.stringify(s.raw),
        }))
      });
      const count = result.records[0]?.get("count");
      return fromNeo4jInt(count);
    } finally {
      await session.close();
    }
  }

  async getRecentSignals(limit = 10): Promise<Record<string, unknown>[]> {
    const session = this.driver.session({ database: this.database });
    try {
      const query = `
        MATCH (e:SignalEvent)
        RETURN e
        ORDER BY e.timestamp DESC
        LIMIT $limit
      `;
      const result = await session.run(query, { limit: asNeo4jInt(limit) });
      return result.records.map(record => {
        const e = record.get("e").properties;
        return { ...e };
      });
    } finally {
      await session.close();
    }
  }

  async countSignals(): Promise<{ total: number; bySource: Record<string, number> }> {
    const session = this.driver.session({ database: this.database });
    try {
      const totalQuery = `
        MATCH (e:SignalEvent)
        RETURN count(e) AS total
      `;
      const sourceQuery = `
        MATCH (e:SignalEvent)
        RETURN e.source AS source, count(e) AS count
      `;
      const [totalResult, sourceResult] = await Promise.all([
        session.run(totalQuery),
        session.run(sourceQuery),
      ]);
      const total = fromNeo4jInt(totalResult.records[0]?.get("total"));
      const bySource: Record<string, number> = {};
      sourceResult.records.forEach(record => {
        const source = record.get("source");
        const count = fromNeo4jInt(record.get("count"));
        bySource[source] = count;
      });
      return { total, bySource };
    } finally {
      await session.close();
    }
  }
}

export default SignalRepository;
export { SignalRepository };
