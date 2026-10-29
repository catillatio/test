import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {posix} from 'node:path';
import {roleFiles} from '../deployment/release/retention/delivery/bundle.mjs';
for(const [role,path] of [['executor','Dockerfile'],['authorizer','delivery/Authorizer.Dockerfile']])test(role+' Dockerfile uses a portable locked install and preserves the private disabled worker contract',async()=>{
 const source=await readFile(new URL('../deployment/release/retention/'+path,import.meta.url),'utf8');
 const lines=source.split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
 const instructions=name=>lines.filter(s=>s.startsWith(name+' '));
 assert.deepEqual(instructions('FROM'),['FROM node:24-bookworm-slim']);
 assert.deepEqual(instructions('WORKDIR'),['WORKDIR /app']);
 assert.deepEqual(instructions('RUN'),['RUN npm ci --ignore-scripts --omit=dev --no-audit --no-fund','RUN node deployment/release/retention/delivery/build-image.mjs '+role]);
 assert.deepEqual(instructions('ENV'),['ENV NODE_ENV=production KINGDOM_RETENTION_ENABLED=0']);
 assert.deepEqual(instructions('USER'),['USER node']);
 assert.deepEqual(instructions('ENTRYPOINT'),['ENTRYPOINT ["node", "deployment/release/retention/delivery/worker.mjs"]']);
 assert.doesNotMatch(source,/--mount(?:=|\s)|proxy_ca|NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED|strict-ssl|--insecure|--unsafe-perm/);
 assert.doesNotMatch(source,/^(?:ADD|ARG|CMD|EXPOSE|HEALTHCHECK|VOLUME|ONBUILD)\b/m);
 const copied=[];
 for(const line of instructions('COPY')){
  assert.match(line,/^COPY --chown=node:node /);
  const paths=line.slice('COPY --chown=node:node '.length).split(/\s+/),destination=paths.pop();
  for(const file of paths){
   const target=destination.endsWith('/')?posix.join(destination,posix.basename(file)):posix.normalize(destination);
   assert.equal(target,file);copied.push(file);
  }
 }
 assert.deepEqual(copied.sort(),roleFiles(role).sort());
});
test('private executor payload is default-disabled, non-root and contains no game or privileged signing/adoption tool',async()=>{
 const source=await readFile(new URL('../deployment/release/retention/Dockerfile',import.meta.url),'utf8');
 assert.match(source,/KINGDOM_RETENTION_ENABLED=0/);assert.match(source,/USER node/);assert.match(source,/delivery\/worker\.mjs/);
 assert.doesNotMatch(source,/COPY\s+\.\s|COPY.*(?:public|views|dist|src|adoption|register|authorize|permit|observations\.sql)|EXPOSE|SIGNING_KEY|DATABASE_URL/);
 const job=await readFile(new URL('../deployment/release/retention/job.mjs',import.meta.url),'utf8');
 assert.match(job,/KINGDOM_RETENTION_ENABLED,'1'/);
});
if(process.env.KINGDOM_RETENTION_OPERATOR_IMAGE)test('built private payload cannot start a job or contact a database under its disabled defaults',()=>{
 const image=process.env.KINGDOM_RETENTION_OPERATOR_IMAGE;
 assert.match(image,/^kingdom-come:[a-z0-9-]+$/);
 const r=spawnSync('docker',['run','--rm','--network','none','--read-only',image],{encoding:'utf8',timeout:30000});
 assert.equal(r.status,0);assert.equal(r.stdout,'RETENTION_DELIVERY_WORKER: DISABLED\n');assert.equal(r.stderr,'');
 const cli=spawnSync('docker',['run','--rm','--network','none','--read-only','--entrypoint','node',image,'deployment/release/retention/cli.mjs'],{encoding:'utf8',timeout:30000});
 assert.equal(cli.status,1);assert.equal(cli.stdout,'');assert.equal(cli.stderr,'COPY_RETENTION: FAIL\n');
});
