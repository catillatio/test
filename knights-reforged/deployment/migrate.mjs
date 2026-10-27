// Runs compiled migrations; no tsx/devDependencies are needed in the image.
import { loadConfig } from '../dist/config.js';
import { createDatabase } from '../dist/db.js';
import { migrate } from '../dist/migrate.js';
import { validateDeploymentEnvironment } from './environment.mjs';
import assert from 'node:assert/strict';

if(process.env.KINGDOM_RELEASE_WORKER)throw new Error('A private verification job cannot migrate the source database.');
validateDeploymentEnvironment();
// A signed, current, exact-candidate approval precedes every production pool.
// It can be minted only by the owner-approved release job after independently
// downloading the encrypted recovery artifact. No SSH or public DB access.
// An OCI image's static identity cannot be downgraded by omitting a variable.
// Source images retain their existing opt-in behavior inside this guard.
const {requireReleaseProof}=await import('./release/proof.mjs');
const approval=await requireReleaseProof();
const config=loadConfig(); // Validate private Railway target before connecting.
// The owner restores the backup to a separate *_restore_test database first.
// Verify that copy before opening the live pool or applying any live migration.
if(process.env.KINGDOM_RESTORE_TEST_DATABASE){
 const {upgradeReport}=await import('./check-upgrade.mjs');
 if(approval)assert.equal(upgradeReport.sha256,approval.preservationSha256,'Restored-copy data changed after the approved backup rehearsal. No production migration was authorized.');
}
const db = createDatabase(config.databaseUrl);
try {
  if(config.privateAlpha&&!process.env.KINGDOM_RESTORE_TEST_DATABASE){
    const exists=(await db.query("SELECT to_regclass('schema_migrations') AS installed")).rows[0].installed;
    if(exists){const versions=(await db.query('SELECT name FROM schema_migrations')).rows.map(row=>row.name);
      if(versions.includes('015_private_alpha_initialization.sql')&&!versions.includes('018_gameplay_refinement.sql'))throw new Error('First live Phase 4.5 upgrade requires a verified restored backup. Set KINGDOM_RESTORE_TEST_DATABASE to the separately restored *_restore_test database. No migration was applied.');
      if(versions.includes('019_champions_and_rivalries.sql')&&!versions.includes('020_game_feel.sql'))throw new Error('First live Phase 4.7 upgrade requires a verified restored backup. Set KINGDOM_RESTORE_TEST_DATABASE to the separately restored *_restore_test database. No migration was applied.');
      if(versions.includes('018_gameplay_refinement.sql')&&!versions.includes('019_champions_and_rivalries.sql'))throw new Error('First live Phase 4.6 upgrade requires a verified restored backup. Set KINGDOM_RESTORE_TEST_DATABASE to the separately restored *_restore_test database. No migration was applied.');
    }
  }
  await migrate(db);
  console.log('Database migrations and the provisional ruleset are installed.');

} finally { await db.end(); }
