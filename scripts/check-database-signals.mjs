// scripts/check-database-signals.mjs

import pg from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Error: NEON_DATABASE_URL is not set in .env.local');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  await client.connect();
  try {
    const resCount = await client.query('SELECT COUNT(*) FROM poe_signals');
    console.log(`\n📊 Total poe_signals rows: ${resCount.rows[0].count}`);

    if (parseInt(resCount.rows[0].count) > 0) {
      const resSample = await client.query('SELECT * FROM poe_signals LIMIT 5');
      console.log('\n🔍 Sample records:');
      console.log(JSON.stringify(resSample.rows, null, 2));
    } else {
      console.log('\n❌ poe_signals table is currently empty.');
    }

    const resLanes = await client.query('SELECT * FROM data_lanes');
    console.log('\n🚦 Data Lanes:');
    console.log(JSON.stringify(resLanes.rows, null, 2));

  } catch (error) {
    console.error('Query failed:', error);
  } finally {
    await client.end();
  }
}

check();
