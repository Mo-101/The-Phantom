import { readFileSync, existsSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadEnv(".env.local");
loadEnv(".env");

const databaseUrl = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("NEON_DATABASE_URL is not configured");

const sql = neon(databaseUrl);
const migration = readFileSync("scripts/011_live_disease_signals_contract.sql", "utf8");
const statements = migration
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(`${statement};`);
}

console.log("migration applied: 011_live_disease_signals_contract.sql");
