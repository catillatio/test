// Read-only image compatibility check. No registry push, Railway request, live
// credential, database connection, recovery rehearsal or deployment is possible.
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {candidateDigest} from '../deployment/release/candidate.mjs';

try{
 const image=process.env.KINGDOM_CONTAINER_IMAGE;assert.match(image??'',/^kingdom-come:[a-z0-9-]+$/);
 const run=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000}).trim();
 const info=JSON.parse(run('image','inspect',image))[0];
 assert.match(info.Id,/^sha256:[a-f0-9]{64}$/);assert.equal(info.Architecture,'amd64');assert.equal(info.Config.User,'node');
 assert.deepEqual(info.Config.Cmd,['node','deployment/start.mjs']);
 assert.ok(info.Config.Env.every(v=>!/^(DATABASE_URL|KINGDOM_.*(?:KEY|TOKEN|PROOF|PASSWORD)|RAILWAY_TOKEN)=/.test(v)));
 const isolated=['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges'];
 const actual=run(...isolated,'--entrypoint','node',image,'--input-type=module','-e',"import {candidateDigest} from './deployment/release/candidate.mjs'; console.log(await candidateDigest());");
 assert.match(actual,/^[a-f0-9]{64}$/);assert.equal(actual,await candidateDigest());
 const denied=spawnSync('docker',[...isolated,'-e','NODE_ENV=production','-e','APP_ORIGIN=https://realm.fixture.invalid',
  '-e','DATABASE_URL=postgres://fixture@source.fixture.invalid/railway','-e','KINGDOM_AUTOMATED_RELEASES=1',
  '--entrypoint','node',image,'deployment/migrate.mjs'],{encoding:'utf8',timeout:60000});
 assert.equal(denied.error,undefined);assert.equal(denied.signal,null);assert.notEqual(denied.status,0);
 assert.ok(denied.stderr.includes('A current signed approval for the independently retained backup and exact candidate is required. No production migration was authorized.'));
 const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.match(sourceSha,/^[a-f0-9]{40}$/);
 const report={kind:'read-only-container-candidate-preflight',sourceSha,passed:true,candidateDigest:actual,architecture:'amd64',nonRoot:true,
  localConfigDigest:info.Id,registryManifestDigest:null,registryPublished:false,railwayDeploymentTested:false,
  candidateMatchesCheckedCompilerOutput:true,unsignedMigrationRejectedBeforeDatabaseAccess:true};
 await mkdir('test-results',{recursive:true});await writeFile('test-results/release-image-preflight.json',JSON.stringify(report,null,2)+'\n');
 console.log('RELEASE_IMAGE_PREFLIGHT: PASS');
}catch{console.error('RELEASE_IMAGE_PREFLIGHT: FAIL');process.exitCode=1;}
