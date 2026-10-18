import { loadConfig } from './config.js';
import { createDatabase } from './db.js';
import { createApp } from './app.js';
import { assertInstalledRulesets } from './migrate.js';
import {assertPrivateAlphaInitialized} from './development.js';

const config = loadConfig();
const db = createDatabase(config.databaseUrl);
const app = await createApp({ db, config, logger: true });
try {
  await assertInstalledRulesets(db);
  const schema = await db.query("SELECT name FROM schema_migrations WHERE name='014_economy_and_progression.sql'");
  if (!schema.rows.length) throw new Error('Phase 4.3 migrations are incomplete. Run node deployment/migrate.mjs before starting.');
  if(config.privateAlpha)await assertPrivateAlphaInitialized(db);
  await app.listen({ host: config.host, port: config.port });
  app.log.info({event:'realm_origin_configuration',origin:config.origin,originSource:config.originSource,
    codespacesOrigin:config.codespacesOrigin,port:config.port,secureCookies:config.secureCookies},'Resolved realm origin');
  console.log(`Kingdom Come is ready at ${config.origin}`);
} catch (error) {
  app.log.error(error, 'Startup failed. Run npm run db:migrate before starting.');
  await db.end();
  process.exit(1);
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => { await app.close(); await db.end(); process.exit(0); });
}
