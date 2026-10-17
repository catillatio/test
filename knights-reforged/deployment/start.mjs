// Use only behind the hosting provider's owner-only access boundary.
// No demo accounts are created and no credentials are generated or printed.
if (process.env.RUN_MIGRATIONS === '1') await import('./migrate.mjs');
await import('../dist/server.js');
