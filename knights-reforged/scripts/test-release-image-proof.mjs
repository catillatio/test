// Real container/runtime guard, synthetic keys and identities, network disabled.
// Never starts the game, connects PostgreSQL, publishes or contacts Railway.
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {candidateDigest} from '../deployment/release/candidate.mjs';
import {signProof} from '../deployment/release/proof.mjs';
import {definitionDigest,imageRepository} from '../deployment/release/image-policy.mjs';
import {proof as fixtureProof,runtimeEnv} from '../tests/fixtures/release-image.mjs';

try{
 const image=process.env.KINGDOM_CONTAINER_IMAGE,sourceImage=process.env.KINGDOM_SOURCE_CONTAINER_IMAGE;
 for(const value of [image,sourceImage])assert.match(value??'',/^kingdom-come:[a-z0-9-]+$/);
 const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),actual=await candidateDigest();
 const info=JSON.parse(execFileSync('docker',['image','inspect',image],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))[0];
 assert.equal(info.Config.Labels['org.opencontainers.image.revision'],sourceSha);
 const keys=generateKeyPairSync('ed25519'),wrong=generateKeyPairSync('ed25519'),pem=keys.publicKey.export({type:'spki',format:'pem'});
 const base=fixtureProof();base.sha=sourceSha;base.candidateDigest=actual;
 Object.assign(base.image.candidate,{sha:sourceSha,candidateDigest:actual,configDigest:info.Id,manifestDigest:'sha256:'+'9'.repeat(64),reference:imageRepository+'@sha256:'+'9'.repeat(64)});
 Object.assign(base.image.candidate.identity,{sha:sourceSha,candidateDigest:actual});base.image.definitionDigest=definitionDigest(base.image.candidate);
 const env={...runtimeEnv(),KINGDOM_RELEASE_SHA:sourceSha,KINGDOM_RELEASE_IMAGE_REFERENCE:base.image.candidate.reference,KINGDOM_RELEASE_IMAGE_DIGEST:base.image.candidate.manifestDigest,KINGDOM_RELEASE_VERIFY_KEY:pem};
 const isolation=['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges'];
 const code="import {requireReleaseProof} from './deployment/release/proof.mjs';try{const p=await requireReleaseProof();if(p?.protocol!=='kingdom-release-proof-v3')throw Error();console.log('IMAGE_PROOF_ACCEPTED');}catch{console.log('IMAGE_PROOF_REJECTED');process.exitCode=2;}";
 const checks=[];
 function check(name,{p=base,overrides={},key=keys.privateKey,target=image,pass=false}={}){
  const values={...env,...overrides,KINGDOM_RELEASE_BACKUP_PROOF:signProof(p,key)};
  const args=[...isolation,...Object.entries(values).flatMap(([k,v])=>['-e',k+'='+v]),'--entrypoint','node',target,'--input-type=module','-e',code];
  const r=spawnSync('docker',args,{encoding:'utf8',timeout:30000});assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.equal(r.status,pass?0:2);
  assert.equal(r.stdout.trim(),pass?'IMAGE_PROOF_ACCEPTED':'IMAGE_PROOF_REJECTED');assert.equal(r.stderr,'');checks.push(name);
 }
 check('current signed v3 and static image identity accepted without database access',{pass:true});
 check('different manifest environment rejected',{overrides:{KINGDOM_RELEASE_IMAGE_DIGEST:'sha256:'+'8'.repeat(64)}});
 check('untrusted signing key rejected',{key:wrong.privateKey});
 check('expired recovery approval rejected',{p:{...base,expiresAt:new Date(0).toISOString()}});
 check('independent recovery remains mandatory',{p:{...base,independentRecoveryVerified:false}});
 check('v2 cannot downgrade a static image',{p:{...base,protocol:'kingdom-release-proof-v2'},overrides:{KINGDOM_RELEASE_ARTIFACT_KIND:'source-v2',KINGDOM_RELEASE_IMAGE_REFERENCE:'',KINGDOM_RELEASE_IMAGE_DIGEST:''}});
 check('disabling automated approvals cannot downgrade the image',{overrides:{KINGDOM_AUTOMATED_RELEASES:'0'}});
 check('source image cannot impersonate an image build',{target:sourceImage});
 const withoutProof={...env,KINGDOM_AUTOMATED_RELEASES:'0',KINGDOM_RELEASE_ARTIFACT_KIND:'source-v2'};
 const migration=spawnSync('docker',[...isolation,...Object.entries(withoutProof).flatMap(([k,v])=>['-e',k+'='+v]),'--entrypoint','node',image,'deployment/migrate.mjs'],{encoding:'utf8',timeout:30000});
 assert.equal(migration.error,undefined);assert.notEqual(migration.status,0);assert.ok(migration.stderr.includes('No production migration was authorized.'));assert.doesNotMatch(migration.stderr,/ENOTFOUND|getaddrinfo|password authentication failed/);
 checks.push('compiled migration rejects missing/downgraded proof before any pool');
 await mkdir('test-results',{recursive:true});await writeFile('test-results/release-image-proof-verification.json',JSON.stringify({kind:'disposable-signed-image-container-check',passed:true,checks,sourceSha,localConfigDigest:info.Id,registryManifestIntentionallySynthetic:true,registryPublished:false,productionRequests:0},null,2)+'\n');
 console.log('IMAGE_CONTAINER_PROOF: PASS');
}catch{console.error('IMAGE_CONTAINER_PROOF: FAIL');process.exitCode=1;}
