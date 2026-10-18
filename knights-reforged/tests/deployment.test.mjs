import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateDeploymentEnvironment } from '../deployment/environment.mjs';

const production = {
  NODE_ENV: 'production', APP_ORIGIN: 'https://kingdom-come.example',
  DATABASE_URL: 'postgresql://game:fixture-only@postgres.railway.internal:5432/railway',
};

test('production entrypoints require explicit HTTPS and PostgreSQL configuration without leaking credentials', () => {
  assert.doesNotThrow(() => validateDeploymentEnvironment(production));
  assert.doesNotThrow(() => validateDeploymentEnvironment({NODE_ENV:'development'}));
  for (const patch of [
    {APP_ORIGIN:undefined}, {DATABASE_URL:undefined}, {APP_ORIGIN:'http://kingdom-come.example'},
    {APP_ORIGIN:production.APP_ORIGIN+'/game'}, {APP_ORIGIN:'https://user:secret@example.com'},
    {DATABASE_URL:'https://private-password@example.com/db'}, {DATABASE_URL:'postgresql://localhost'},
  ]) {
    assert.throws(() => validateDeploymentEnvironment({...production,...patch}), error => {
      assert.doesNotMatch(error.message,/fixture-only|private-password|user:secret/);
      return /Production requires/.test(error.message);
    });
  }
});

test('Railway uses a portable Docker build and a separate compiled migration command', async () => {
  const config=JSON.parse(await readFile(new URL('../railway.json',import.meta.url),'utf8'));
  assert.equal(config.build.builder,'DOCKERFILE');
  assert.equal(config.build.dockerfilePath,'Dockerfile');
  assert.deepEqual(config.deploy.preDeployCommand,['node deployment/migrate.mjs']);
  assert.equal(config.deploy.startCommand,'node deployment/start.mjs');
  assert.equal(config.deploy.healthcheckPath,'/healthz');
  assert.equal(config.deploy.numReplicas,1);
  const dockerfile=await readFile(new URL('../Dockerfile',import.meta.url),'utf8');
  assert.doesNotMatch(dockerfile,/--mount|RUN.*(?:db:migrate|db:seed|dev:bots)/);
  assert.match(dockerfile,/npm ci --include=dev/);
  assert.match(dockerfile,/USER node/);
  const startup=await readFile(new URL('../deployment/start.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(startup,/import\(['"]\.\/migrate/);
});
