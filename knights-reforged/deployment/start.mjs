// Restarts only start the web server. Run migrations as a controlled pre-deploy
// command, never as a side effect of a replica/restart coming online.
import { validateDeploymentEnvironment } from './environment.mjs';
validateDeploymentEnvironment();
if (process.env.RUN_MIGRATIONS === '1') {
  throw new Error('Remove RUN_MIGRATIONS. Run node deployment/migrate.mjs as the pre-deploy command.');
}
await import('../dist/server.js');
