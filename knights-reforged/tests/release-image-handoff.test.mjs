import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {inspectImageHandoff,handoffInspectQuery,handoffReceiptQuery} from '../deployment/release/inspect-image-handoff.mjs';
import {checkImagePatch,appliedImageVariables,imageReleaseKeys,imageInspectQuery,imageReceiptQuery,imageHandoffFailure} from '../deployment/release/image-deploy.mjs';
import {signProof,verifyProof} from '../deployment/release/proof.mjs';
import {proof,runtimeEnv,ids} from './fixtures/release-image.mjs';

const key=generateKeyPairSync('ed25519'),publicKey=key.publicKey.export({type:'spki',format:'pem'});
const stamp='2026-10-28T04:09:02.032Z',stageTime=Date.parse(stamp),privateToken='fixture-private-registry-token';
const privateExtra='private-provider-https://credential.invalid/?password=secret\n::error::secret';
function fixture({delta=true,edit,readErrorAt,proofEdit,credential='match'}={}){
 const p=proof();p.issuedAt=new Date(stageTime-1000).toISOString();p.expiresAt=new Date(stageTime+3600000).toISOString();proofEdit?.(p);
 const expected={policy:'read-only-staged-image-handoff-v1',releaseRunId:'123',sourceSha:p.sha,patchId:ids[3],patchUpdatedAt:stamp,activeDeploymentId:ids[4],
  imagePrepareRunId:'101',imageArtifactId:'102',imageArtifactDigest:'sha256:'+'e'.repeat(64),imageManifestDigest:'sha256:'+'b'.repeat(64),recoveryArtifactId:'103'};
 const target={projectId:ids[0],environmentId:ids[1],serviceId:ids[2]},runtime=runtimeEnv();
 const env={GITHUB_REPOSITORY:'catillatio/test',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/release/production',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'9'.repeat(40),
  KINGDOM_IMAGE_HANDOFF_INSPECTION:'true',RAILWAY_TOKEN:'synthetic-project-token',KINGDOM_IMAGE_REGISTRY_READ_TOKEN:privateToken,
  RAILWAY_PROJECT_ID:ids[0],RAILWAY_ENVIRONMENT_ID:ids[1],RAILWAY_GAME_SERVICE_ID:ids[2],KINGDOM_RELEASE_VERIFY_KEY:publicKey};
 const values={KINGDOM_AUTOMATED_RELEASES:'1',KINGDOM_RELEASE_SHA:p.sha,KINGDOM_RESTORE_TEST_DATABASE:p.copy,KINGDOM_RELEASE_BACKUP_PROOF:signProof(p,key.privateKey),
  KINGDOM_RELEASE_ARTIFACT_KIND:'oci-image-v1',KINGDOM_RELEASE_IMAGE_REFERENCE:p.image.candidate.reference,KINGDOM_RELEASE_IMAGE_DIGEST:p.image.candidate.manifestDigest};
 const variables=Object.fromEntries(imageReleaseKeys.filter(name=>!delta||name!=='KINGDOM_AUTOMATED_RELEASES').map(name=>[name,{value:values[name]}]));
 const credentials={username:'catillatio',password:credential==='redacted'?'[REDACTED]':credential==='mismatch'?privateExtra:credential==='object'?{opaque:privateExtra}:privateToken};
 const pending={id:expected.patchId,environmentId:ids[1],status:'STAGED',createdAt:'2026-10-27T01:53:46.217Z',updatedAt:stamp,appliedAt:null,lastAppliedError:null,
  patch:{services:{[ids[2]]:{source:{image:values.KINGDOM_RELEASE_IMAGE_REFERENCE,repo:null},deploy:{registryCredentials:credentials},variables}}}};
 const identity={id:ids[4],...target,status:'SUCCESS',createdAt:'2026-10-27T01:00:00Z',updatedAt:'2026-10-27T01:01:00Z',deploymentStopped:false,
  instances:[{id:'synthetic-removed-instance',status:'REMOVED'},{id:'synthetic-running-instance',status:'RUNNING'}]};
 const data={project:{id:ids[0],name:'merry-patience'},environment:{id:ids[1],projectId:ids[0],name:'production',config:{services:{[ids[2]]:{
  variables:{KINGDOM_AUTOMATED_RELEASES:{value:'1'},PRIVATE:{value:privateExtra}},deploy:{multiRegionConfig:{iad:{numReplicas:1}}}}}}},
  game:{serviceId:ids[2],environmentId:ids[1],startCommand:'node deployment/start.mjs',preDeployCommand:['node deployment/migrate.mjs'],healthcheckPath:'/healthz',healthcheckTimeout:null,
   restartPolicyType:'ON_FAILURE',rootDirectory:'/knights-reforged',numReplicas:null,source:{image:null,repo:'catillatio/test'},activeDeployments:[identity],
   latestDeployment:{...structuredClone(identity),id:ids[5],status:'FAILED',createdAt:'2026-10-27T02:00:00Z',updatedAt:'2026-10-27T02:01:00Z',deploymentStopped:true,instances:[]}},
  pending,inFlight:{edges:[]},privateExtra,resolved:{APP_ORIGIN:runtime.APP_ORIGIN,DATABASE_URL:runtime.DATABASE_URL,KINGDOM_RESTORE_DATABASE_URL:runtime.KINGDOM_RESTORE_DATABASE_URL}};
 const calls=[];
 const api=async(q,v)=>{
  assert.ok([handoffInspectQuery,handoffReceiptQuery].includes(q));assert.match(q,/^query /);assert.doesNotMatch(q,/mutation|subscription/);
  calls.push(q);if(calls.length===readErrorAt)throw Error(privateExtra);
  const result=structuredClone(data);edit?.(result,calls.length,v);
  if(q===handoffReceiptQuery&&!Object.hasOwn(result,'receipt'))result.receipt=structuredClone(result.pending);
  return result;
 };
 const run=(override={})=>inspectImageHandoff({...env,...override},{api,expected,now:stageTime+1000});
 return {run,api,expected,env,data,calls,target,values,runtime,p};
}
for(const delta of [false,true])test('read-only inspection identifies original and corrected behavior for '+(delta?'six':'seven')+' changed variables',async()=>{
 const f=fixture({delta}),r=await f.run();assert.equal(r.result,'MATCH');assert.equal(r.failure,'NONE');assert.equal(r.correctedFirstRejection,'CORRECTED_MATCH');
 assert.equal(r.legacyFirstRejection,delta?'VARIABLE_DELTA_KEYS':'LEGACY_MATCH');assert.equal(r.variableDelta,delta?'VARIABLE_DELTA_SIX':'VARIABLE_DELTA_SEVEN');
 assert.equal(r.credentials,'CREDENTIAL_EXACT_MATCH');assert.equal(r.signedEvidence,'SIGNED_CURRENT');assert.equal(r.revision,'EXACT_MATCH');assert.equal(r.authorizesRelease,false);
 assert.deepEqual(f.calls,[handoffInspectQuery,handoffReceiptQuery]);
 assert.doesNotMatch(JSON.stringify(r),/fixture|private|https:|sha256:|[a-f0-9]{8}-[a-f0-9]{4}-/);
});
for(const [credential,category]of [['redacted','CREDENTIAL_REDACTED'],['object','CREDENTIAL_NONSTRING'],['mismatch','CREDENTIAL_STRING_MISMATCH']])test('credential mismatch precedes the variable-key rejection: '+credential,async()=>{
 const f=fixture({credential}),r=await f.run();assert.equal(r.result,'REJECTED');assert.equal(r.legacyFirstRejection,'REGISTRY_PASSWORD');assert.equal(r.correctedFirstRejection,'REGISTRY_PASSWORD');
 assert.equal(r.credentials,category);assert.equal(r.authorizesRelease,false);assert.doesNotMatch(JSON.stringify(r),/fixture|provider|password|credential.invalid|secret/);
});
for(const delta of [false,true])for(const name of imageReleaseKeys.filter(n=>!['KINGDOM_RELEASE_BACKUP_PROOF','KINGDOM_RESTORE_TEST_DATABASE'].includes(n)))test('no mismatched effective value is accepted: '+name+' delta '+delta,async()=>{
 const f=fixture({delta,edit:d=>{
  const changed=d.pending.patch.services[ids[2]].variables;
  if(Object.hasOwn(changed,name))changed[name].value='forged';else d.environment.config.services[ids[2]].variables[name].value='forged';
 }}),r=await f.run();assert.equal(r.result,'REJECTED');assert.equal(r.correctedFirstRejection,'EFFECTIVE_RELEASE_VALUE');assert.equal(r.authorizesRelease,false);
});
for(const delta of [false,true])for(const what of ['proof','copy'])test('invalid signed evidence cannot invent expected values or hide an earlier scope rejection: '+what+' delta '+delta,async()=>{
 const f=fixture({delta,edit:d=>{d.pending.patch.services[ids[2]].variables[what==='proof'?'KINGDOM_RELEASE_BACKUP_PROOF':'KINGDOM_RESTORE_TEST_DATABASE'].value=privateExtra;}}),r=await f.run();
 assert.equal(r.result,'UNVERIFIED');assert.equal(r.failure,'INSPECTION_SIGNED_EVIDENCE');assert.equal(r.legacyFirstRejection,delta?'VARIABLE_DELTA_KEYS':'UNVERIFIED');assert.equal(r.authorizesRelease,false);
 assert.equal(r.revision,'EXACT_MATCH');assert.equal(r.correctedFirstRejection,'UNVERIFIED');
});
test('redacted credentials remain the first scope rejection even when the proof cannot be decoded',async()=>{
 const f=fixture({credential:'redacted',edit:d=>{d.pending.patch.services[ids[2]].variables.KINGDOM_RELEASE_BACKUP_PROOF={encryptedValue:privateExtra};}}),r=await f.run();
 assert.equal(r.result,'UNVERIFIED');assert.equal(r.failure,'INSPECTION_SIGNED_EVIDENCE');assert.equal(r.legacyFirstRejection,'REGISTRY_PASSWORD');assert.equal(r.credentials,'CREDENTIAL_REDACTED');
 assert.equal(r.correctedFirstRejection,'UNVERIFIED');assert.equal(r.revision,'EXACT_MATCH');assert.equal(r.authorizesRelease,false);
});
for(const field of ['jobId','artifactId','imageArtifactId','imageArtifactDigest','prepareRunId','prepareRunAttempt','issuedAt'])test('even a signed different release cannot impersonate the bound handoff: '+field,async()=>{
 const f=fixture({proofEdit:p=>{
  if(field==='jobId')p.jobId='gh_124_1_'+'f'.repeat(32);
  if(field==='artifactId')p.artifactId='999';
  if(field==='imageArtifactId')p.image.artifactId='999';
  if(field==='imageArtifactDigest')p.image.artifactDigest='sha256:'+'9'.repeat(64);
  if(field==='prepareRunId')p.image.candidate.prepareRunId='999';
  if(field==='prepareRunAttempt')p.image.candidate.prepareRunAttempt='2';
  if(field==='issuedAt')p.issuedAt=new Date(stageTime+60001).toISOString();
 }}),r=await f.run();assert.equal(r.result,'UNVERIFIED');assert.equal(r.failure,'INSPECTION_SIGNED_EVIDENCE');assert.equal(r.authorizesRelease,false);
});
test('expired signature can be inspected historically but cannot authorize a current runtime',async()=>{
 const f=fixture(),now=stageTime+7200000;
 const r=await inspectImageHandoff(f.env,{api:f.api,expected:f.expected,now});assert.equal(r.result,'MATCH');assert.equal(r.signedEvidence,'SIGNED_HISTORICAL_ONLY');assert.equal(r.authorizesRelease,false);
 assert.throws(()=>verifyProof(f.values.KINGDOM_RELEASE_BACKUP_PROOF,publicKey,{...f.runtime,...f.values},f.p.candidateDigest,{now,imageIdentity:f.p.image.candidate.identity}));
});
for(const change of ['revision','private patch content','applied omitted value','other private config','source','active identity','receipt','committed state'])test('competing edits or uncertain receipt cannot produce a stable inspection: '+change,async()=>{
 const f=fixture({edit:(d,n)=>{if(n!==2)return;
  if(change==='revision')d.pending.updatedAt=new Date(stageTime+1).toISOString();
  if(change==='private patch content')d.pending.patch.services[ids[2]].deploy.registryCredentials.password=privateExtra;
  if(change==='applied omitted value')d.environment.config.services[ids[2]].variables.KINGDOM_AUTOMATED_RELEASES.value='0';
  if(change==='other private config')d.environment.config.services[ids[2]].variables.PRIVATE.value='changed';
  if(change==='source')d.game.source.image='unexpected';
  if(change==='active identity')d.game.activeDeployments[0].id=ids[5];
  if(change==='receipt')d.receipt=null;
  if(change==='committed state')d.receipt={...structuredClone(d.pending),status:'COMMITTED'};
 }}),r=await f.run();assert.equal(r.result,'UNVERIFIED');assert.equal(r.failure,'INSPECTION_REVISION_BINDING');assert.equal(r.legacyFirstRejection,'UNVERIFIED');assert.equal(r.authorizesRelease,false);
});
for(const n of [1,2])test('lost read acknowledgment produces no retry or authoritative conclusion: '+n,async()=>{
 const f=fixture({readErrorAt:n}),r=await f.run();assert.equal(r.result,'UNVERIFIED');assert.equal(r.failure,'INSPECTION_PROVIDER');assert.equal(f.calls.length,n);assert.equal(r.authorizesRelease,false);assert.doesNotMatch(JSON.stringify(r),/provider|https:|secret/);
});
for(const patch of [{GITHUB_REF:'refs/heads/feature/untrusted'},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_EVENT_NAME:'push'},{KINGDOM_IMAGE_HANDOFF_INSPECTION:'false'},{RAILWAY_API_TOKEN:'forbidden'},{KINGDOM_IMAGE_REGISTRY_READ_TOKEN:''}])test('invalid protected inspection request cannot access Railway '+Object.keys(patch)[0],async()=>{
 const f=fixture(),r=await f.run(patch);assert.equal(r.result,'UNVERIFIED');assert.equal(f.calls.length,0);assert.equal(r.authorizesRelease,false);
});
for(const change of ['metadata','unknown variable','variable removal','extra metadata','absent applied value'])test('delta compatibility is narrow: '+change,()=>{
 const f=fixture(),p=structuredClone(f.data.pending),svc=p.patch.services[ids[2]],applied=appliedImageVariables(f.data,f.target);
 if(change==='metadata')svc.variables.KINGDOM_RELEASE_SHA.isOptional=true;
 if(change==='unknown variable')svc.variables.DATABASE_URL={value:privateExtra};
 if(change==='variable removal')svc.variables.KINGDOM_RELEASE_SHA=null;
 if(change==='extra metadata')svc.variables.KINGDOM_RELEASE_SHA.unexpected=privateExtra;
 if(change==='absent applied value')delete applied.KINGDOM_AUTOMATED_RELEASES;
 assert.throws(()=>checkImagePatch(p,f.target,f.values.KINGDOM_RELEASE_IMAGE_REFERENCE,f.values,{username:'catillatio',password:privateToken},{appliedVariables:applied}),e=>imageHandoffFailure(e)!=='UNVERIFIED'&&!e.message.includes(privateExtra));
});
for(const omitted of imageReleaseKeys)test('any unchanged release variable requires independent exact applied evidence: '+omitted,()=>{
 const f=fixture({delta:false}),p=structuredClone(f.data.pending),variables=p.patch.services[ids[2]].variables;
 const applied={[omitted]:structuredClone(variables[omitted])};delete variables[omitted];
 const credentials={username:'catillatio',password:privateToken};
 checkImagePatch(p,f.target,f.values.KINGDOM_RELEASE_IMAGE_REFERENCE,f.values,credentials,{appliedVariables:applied});
 applied[omitted].value='forged';
 assert.throws(()=>checkImagePatch(p,f.target,f.values.KINGDOM_RELEASE_IMAGE_REFERENCE,f.values,credentials,{appliedVariables:applied}),e=>imageHandoffFailure(e)==='EFFECTIVE_RELEASE_VALUE');
});
test('new workflow mode keeps protected ref, exact checkout, mutual exclusion, production lock and step-scoped secrets',()=>{
 const s=readFileSync(new URL('../../.github/workflows/railway-authorization-diagnostic.yml',import.meta.url),'utf8');
 assert.match(s,/github.ref == 'refs\/heads\/release\/production'/);assert.match(s,/environment: production/);assert.match(s,/ref: \$\{\{ github.sha \}\}/);assert.match(s,/persist-credentials: false/);
 assert.match(s,/image_handoff_inspection:[\s\S]*?type: boolean\n        default: false/);assert.match(s,/inputs.image_handoff_inspection && !inputs.image_target_inspection/);
 assert.match(s,/\(inputs.image_target_inspection \|\| inputs.image_handoff_inspection \|\| inputs.image_commit_history_inspection\) && 'kingdom-come-production'/);assert.match(s,/cancel-in-progress: false/);
 assert.equal((s.match(/secrets.KINGDOM_IMAGE_REGISTRY_READ_TOKEN/g)||[]).length,1);
 const step=s.split('- name: Inspect only the bound staged image handoff and signed evidence')[1].split('- name:')[0];assert.match(step,/secrets.RAILWAY_TOKEN/);assert.match(step,/secrets.KINGDOM_IMAGE_REGISTRY_READ_TOKEN/);assert.match(step,/run: node knights-reforged\/deployment\/release\/inspect-image-handoff.mjs/);
 assert.doesNotMatch(s,/packages: write|actions: write|SIGNING_KEY|KINGDOM_BACKUP_|run\.mjs|worker\.mjs|upload-artifact|image\.mjs (publish|verify)/);
 const source=readFileSync(new URL('../deployment/release/inspect-image-handoff.mjs',import.meta.url),'utf8');assert.match(source,/\[handoffInspectQuery,handoffReceiptQuery\]\.includes\(query\)/);assert.match(source,/assert.ok\(\+\+reads<=2\)/);
 assert.match(handoffInspectQuery,/resolved:variablesForServiceDeployment\(projectId:\$projectId,environmentId:\$environmentId,serviceId:\$serviceId\)/);
 assert.doesNotMatch(source,/writeFile|createHash|child_process|signProof|createPrivateKey|error\.(message|stack)|console\.(error|warn)/);
});
test('CLI output remains one sanitized category report even for hostile provider output',()=>{
 const folder=mkdtempSync(join(tmpdir(),'image-handoff-secret-safe-'));
 try{
  const preload=join(folder,'preload.mjs');writeFileSync(preload,'globalThis.fetch=async()=>{throw Error('+JSON.stringify(privateExtra)+');};');
  const f=fixture(),r=spawnSync(process.execPath,['--import',preload,new URL('../deployment/release/inspect-image-handoff.mjs',import.meta.url).pathname],{env:{PATH:process.env.PATH,...f.env},encoding:'utf8',timeout:5000});
  assert.equal(r.status,1);assert.equal(r.stderr,'');const line=r.stdout.trim();assert.match(line,/^IMAGE_HANDOFF_INSPECTION: /);
  const report=JSON.parse(line.slice('IMAGE_HANDOFF_INSPECTION: '.length));assert.equal(report.result,'UNVERIFIED');assert.equal(report.authorizesRelease,false);
  assert.doesNotMatch(r.stdout,/fixture|password|secret|https?:|sha256:|BEGIN PUBLIC|[a-f0-9]{8}-[a-f0-9]{4}-/);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
