import { loadConfig } from './config.js';
import { createDatabase } from './db.js';
import { createApp } from './app.js';

const config = loadConfig();
const db = createDatabase(config.databaseUrl);
const app = await createApp({ db, config, logger: true });
try {
  const installed = await db.query('SELECT id FROM rulesets WHERE id=$1', ['recreation-0.1']);
  if (!installed.rows.length) throw new Error('The ruleset is not installed. Run npm run db:migrate.');
  await app.listen({ host: config.host, port: config.port });
  console.log(`Knights Reforged is ready at ${config.origin}`);
} catch (error) {
  app.log.error(error, 'Startup failed. Run npm run db:migrate before starting.');
  await db.end();
  process.exit(1);
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => { await app.close(); await db.end(); process.exit(0); });
}
