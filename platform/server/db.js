'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');

function createPool(config = process.env.DATABASE_URL) {
  const options = typeof config === 'string' ? { connectionString: config } : (config || {});
  return new Pool({ max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000,
    statement_timeout: 30000, idle_in_transaction_session_timeout: 30000, ...options });
}
async function transaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
async function migrate(pool) {
  return transaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ains-platform-migrations'))");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(row => row.name));
    const dir = path.join(__dirname, 'migrations');
    for (const name of (await fs.readdir(dir)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      if (applied.has(name)) continue;
      await client.query(await fs.readFile(path.join(dir, name), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
    }
  });
}
module.exports = { createPool, migrate, transaction };
