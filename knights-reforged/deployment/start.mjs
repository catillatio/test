// Restarts only start the web server. Run migrations as a controlled pre-deploy
// command, never as a side effect of a replica/restart coming online.
import { validateDeploymentEnvironment } from './environment.mjs';
if(process.env.KINGDOM_RELEASE_WORKER)throw new Error('A private verification job cannot start the game service.');
validateDeploymentEnvironment();
if (process.env.RUN_MIGRATIONS === '1') {
  throw new Error('Remove RUN_MIGRATIONS. Run node deployment/migrate.mjs as the pre-deploy command.');
}
// The game server never needs the one-time provisioning credential.
delete process.env.KINGDOM_DEV_PASSWORD;
await import('../dist/server.js');
