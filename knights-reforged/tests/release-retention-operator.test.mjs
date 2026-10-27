import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
test('private executor payload is default-disabled, non-root and contains no game or privileged signing/adoption tool',async()=>{
 const source=await readFile(new URL('../deployment/release/retention/Dockerfile',import.meta.url),'utf8');
 assert.match(source,/KINGDOM_RETENTION_ENABLED=0/);assert.match(source,/USER node/);assert.match(source,/job\.mjs/);
 assert.doesNotMatch(source,/COPY\s+\.\s|COPY.*(?:public|views|dist|src|adoption|register|authorize|permit|observations\.sql)|EXPOSE|SIGNING_KEY|DATABASE_URL/);
 const job=await readFile(new URL('../deployment/release/retention/job.mjs',import.meta.url),'utf8');
 assert.match(job,/KINGDOM_RETENTION_ENABLED,'1'/);
});
test('built private payload cannot start a job or contact a database under its disabled defaults',{skip:!process.env.KINGDOM_RETENTION_OPERATOR_IMAGE},()=>{
 const image=process.env.KINGDOM_RETENTION_OPERATOR_IMAGE;
 assert.match(image,/^kingdom-come:[a-z0-9-]+$/);
 const r=spawnSync('docker',['run','--rm','--network','none','--read-only',image],{encoding:'utf8',timeout:30000});
 assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr,'COPY_RETENTION_JOB: FAIL\n');
 const cli=spawnSync('docker',['run','--rm','--network','none','--read-only','--entrypoint','node',image,'deployment/release/retention/cli.mjs'],{encoding:'utf8',timeout:30000});
 assert.equal(cli.status,1);assert.equal(cli.stdout,'');assert.equal(cli.stderr,'COPY_RETENTION: FAIL\n');
});
