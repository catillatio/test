// Runs compiled migrations; no tsx/devDependencies are needed in the image.
import { loadConfig } from '../dist/config.js';
import { createDatabase } from '../dist/db.js';
import { migrate } from '../dist/migrate.js';
import { validateDeploymentEnvironment } from './environment.mjs';

validateDeploymentEnvironment();
const db = createDatabase(loadConfig().databaseUrl);
try {
  await migrate(db);
  console.log('Database migrations and the provisional ruleset are installed.');
} finally { await db.end(); }
