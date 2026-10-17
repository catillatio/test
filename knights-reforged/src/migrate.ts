import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type Database, transaction } from './db.js';
import { projectRoot } from './config.js';
import { rules } from './rules.js';

export async function migrate(db: Database) {
  await transaction(db, async client => {
    await client.query('SELECT pg_advisory_xact_lock(61824004)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const files = (await readdir(join(projectRoot, 'migrations'))).filter(f => f.endsWith('.sql')).sort();
    for (const name of files) {
      if ((await client.query('SELECT name FROM schema_migrations WHERE name=$1', [name])).rows.length) continue;
      await client.query(await readFile(join(projectRoot, 'migrations', name), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
    }
    await client.query('INSERT INTO rulesets(id,definition) VALUES($1,$2) ON CONFLICT DO NOTHING', [rules.id, rules]);
    const stored = (await client.query('SELECT definition FROM rulesets WHERE id=$1', [rules.id])).rows[0]?.definition;
    // PostgreSQL jsonb key order differs from JSON source: compare recursively below.
    const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) :
      value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort().map(([k,v]) => [k,normalize(v)])) : value;
    if (JSON.stringify(normalize(stored)) !== JSON.stringify(normalize(rules))) {
      throw new Error('An existing ruleset version is immutable. Create a new ruleset ID for changed rules.');
    }
  });
}
