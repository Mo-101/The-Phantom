/**
 * Neo4j Utilities - Safe Integer Handling
 * Engine: mo-border-phantom-001
 * Fix: Prevents "LIMIT 3.0" type errors
 */

import neo4j, { Integer, DateTime } from "neo4j-driver";

export function asNeo4jLimit(value: unknown, fallback = 3): Integer {
  const n = typeof value === "number" ? value : Number(value);
  const safe = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
  return neo4j.int(safe);
}

export function asNeo4jInt(value: unknown, fallback = 0): Integer {
  const n = typeof value === "number" ? value : Number(value);
  const safe = Number.isFinite(n) ? Math.floor(n) : fallback;
  return neo4j.int(safe);
}

export function asNeo4jDateTime(value: string | Date | number): DateTime {
  const date = value instanceof Date ? value : new Date(value);
  return new neo4j.DateTime(
    neo4j.int(date.getFullYear()),
    neo4j.int(date.getMonth() + 1),
    neo4j.int(date.getDate()),
    neo4j.int(date.getHours()),
    neo4j.int(date.getMinutes()),
    neo4j.int(date.getSeconds()),
    neo4j.int(date.getMilliseconds() * 1000000)
  );
}

export function fromNeo4jInt(value: Integer | number): number {
  if (typeof value === "number") return value;
  return typeof (value as Integer)?.toNumber === "function" ? (value as Integer).toNumber() : Number(value ?? 0);
}
