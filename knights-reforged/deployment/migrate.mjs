// Runs compiled migrations; no tsx/devDependencies are needed in the image.
import { loadConfig } from '../dist/config.js';
import { createDatabase } from '../dist/db.js';
import { migrate } from '../dist/migrate.js';
import { validateDeploymentEnvironment } from './environment.mjs';
import { initializePrivateAlpha,assertPrivateAlphaBootstrapTarget } from '../dist/development.js';

validateDeploymentEnvironment();
const config=loadConfig(); // Validate private Railway target before connecting.
const db = createDatabase(config.databaseUrl);
try {
  if(process.env.KINGDOM_ALPHA_INITIALIZE)await assertPrivateAlphaBootstrapTarget(db,process.env);
  await migrate(db);
  console.log('Database migrations and the provisional ruleset are installed.');
  if(process.env.KINGDOM_ALPHA_INITIALIZE){
    const environment={...process.env};
    delete process.env.KINGDOM_DEV_PASSWORD;
    const result=await initializePrivateAlpha(db,environment);
    console.log(JSON.stringify({event:'private_alpha_initialization',...result}));
  }
} finally { await db.end(); }
