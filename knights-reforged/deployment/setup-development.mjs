// Optional setup for an approved cloud devcontainer with working npm/PostgreSQL.
// Does not create hosting resources or players. Run only in a chosen Codespace.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

function run(args) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} failed with exit ${result.status}.`);
}
run([existsSync('package-lock.json') ? 'ci' : 'install', '--no-audit', '--no-fund']);
const { default: pg } = await import('pg');
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  try { await db.query('CREATE DATABASE knights_test'); }
  catch (error) { if (error.code !== '42P04') throw error; }
} finally { await db.end(); }
run(['run', 'db:migrate']);
run(['run', 'verify']);
console.log('Development setup verified. No demo players were created.');
console.log('Run node deployment/preview.mjs and keep the forwarded port PRIVATE.');
