// Runs compiled migrations; no tsx/devDependencies are needed in the image.
import { loadConfig } from '../dist/config.js';
import { createDatabase } from '../dist/db.js';
import { migrate } from '../dist/migrate.js';
import { validateDeploymentEnvironment } from './environment.mjs';

validateDeploymentEnvironment();
const config=loadConfig(); // Validate private Railway target before connecting.
// The owner restores the backup to a separate *_restore_test database first.
// Verify that copy before opening the live pool or applying any live migration.
if(process.env.KINGDOM_RESTORE_TEST_DATABASE)await import('./check-upgrade.mjs');
const db = createDatabase(config.databaseUrl);
try {
  if(config.privateAlpha&&!process.env.KINGDOM_RESTORE_TEST_DATABASE){
    const exists=(await db.query("SELECT to_regclass('schema_migrations') AS installed")).rows[0].installed;
    if(exists){const versions=(await db.query('SELECT name FROM schema_migrations')).rows.map(row=>row.name);
      if(versions.includes('015_private_alpha_initialization.sql')&&!versions.includes('018_gameplay_refinement.sql'))throw new Error('First live Phase 4.5 upgrade requires a verified restored backup. Set KINGDOM_RESTORE_TEST_DATABASE to the separately restored *_restore_test database. No migration was applied.');
      if(versions.includes('018_gameplay_refinement.sql')&&!versions.includes('019_champions_and_rivalries.sql'))throw new Error('First live Phase 4.6 upgrade requires a verified restored backup. Set KINGDOM_RESTORE_TEST_DATABASE to the separately restored *_restore_test database. No migration was applied.');
    }
  }
  await migrate(db);
  console.log('Database migrations and the provisional ruleset are installed.');

} finally { await db.end(); }
