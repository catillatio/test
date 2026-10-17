import { loadConfig } from './config.js';
import { createDatabase } from './db.js';
import { createApp } from './app.js';
import { assertInstalledRulesets } from './migrate.js';

const config = loadConfig();
const db = createDatabase(config.databaseUrl);
const app = await createApp({ db, config, logger: true });
try {
  await assertInstalledRulesets(db);
  const schema = await db.query("SELECT name FROM schema_migrations WHERE name='009_combat_training.sql'");
  if (!schema.rows.length) throw new Error('Phase 3.5 migrations are incomplete. Run npm run db:migrate.');
  await app.listen({ host: config.host, port: config.port });
  console.log(`Kingdom Come is ready at ${config.origin}`);
} catch (error) {
  app.log.error(error, 'Startup failed. Run npm run db:migrate before starting.');
  await db.end();
  process.exit(1);
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => { await app.close(); await db.end(); process.exit(0); });
}
