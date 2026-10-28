// Immutable policy shared by the controller and runtime. No provider access.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const imagePolicy='kingdom-release-image-v1';
// Existing owner-confirmed Private package; publication must never create one.
export const imagePackage='kingdom-come-deploy-canary';
export const imageRepository='ghcr.io/catillatio/'+imagePackage;
export const imageDigest=/^sha256:[a-f0-9]{64}$/;
const hex=/^[a-f0-9]{64}$/,sha=/^[a-f0-9]{40}$/,id=/^[1-9][0-9]{0,24}$/;
export const canonical=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const definitionDigest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const keys=(v,allowed)=>assert.deepEqual(Object.keys(v??{}).sort(),allowed.slice().sort());

export function checkImageIdentity(value,sourceSha,candidate){
 keys(value,['policy','repository','sha','candidateDigest','platform']);
 assert.equal(value.policy,imagePolicy);assert.equal(value.repository,'catillatio/test');
 assert.match(value.sha,sha);assert.equal(value.sha,sourceSha);
 assert.match(value.candidateDigest,hex);assert.equal(value.candidateDigest,candidate);assert.equal(value.platform,'linux/amd64');
 return value;
}
export function checkImageCandidate(value,{sourceSha,candidate}={}){
 keys(value,['policy','repository','branch','sha','candidateDigest','platform','reference','manifestDigest','configDigest','prepareRunId','prepareRunAttempt','identity']);
 assert.equal(value.policy,imagePolicy);assert.equal(value.repository,'catillatio/test');assert.equal(value.branch,'release/production');
 assert.match(value.sha,sha);if(sourceSha!==undefined)assert.equal(value.sha,sourceSha);
 assert.match(value.candidateDigest,hex);if(candidate!==undefined)assert.equal(value.candidateDigest,candidate);
 assert.equal(value.platform,'linux/amd64');for(const k of ['manifestDigest','configDigest'])assert.match(value[k],imageDigest);
 assert.equal(value.reference,imageRepository+'@'+value.manifestDigest);
 assert.match(value.prepareRunId,id);assert.match(value.prepareRunAttempt,/^[1-9][0-9]{0,4}$/);
 checkImageIdentity(value.identity,value.sha,value.candidateDigest);return value;
}
export function checkImageApproval(value,{sourceSha,candidate,reference,digest,identity}={}){
 keys(value,['candidate','artifactId','artifactDigest','definitionDigest']);
 checkImageCandidate(value.candidate,{sourceSha,candidate});assert.match(value.artifactId,id);assert.match(value.artifactDigest,imageDigest);
 assert.match(value.definitionDigest,hex);assert.equal(value.definitionDigest,definitionDigest(value.candidate));
 assert.equal(value.candidate.reference,reference);assert.equal(value.candidate.manifestDigest,digest);
 assert.deepEqual(checkImageIdentity(identity,sourceSha,candidate),value.candidate.identity);return value;
}
export function gameTransport(env){
 const mode=env.KINGDOM_GAME_TRANSPORT||'source-v2';assert.ok(['source-v2','oci-image-v1'].includes(mode));
 if(mode==='oci-image-v1'){
  assert.equal(env.KINGDOM_GAME_IMAGE_ENABLED,'true');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');
  assert.equal(env.KINGDOM_IMAGE_EXCLUSIVE_WINDOW,'true');
 }else assert.notEqual(env.KINGDOM_GAME_IMAGE_ENABLED,'true','Image mode is enabled; source fallback requires a separately reviewed reset.');
 return mode;
}
// Explicit owner handoff inside a real protected promotion; never a setup deploy.
export function imageRegistrySetup(env){
 const flag=env.KINGDOM_IMAGE_INSTALL_REGISTRY_CREDENTIALS;
 assert.ok([undefined,'','false','true'].includes(flag));
 if(flag!=='true')return 'preconfigured';
 assert.equal(env.KINGDOM_IMAGE_OPERATION,'image-release');assert.equal(env.KINGDOM_IMAGE_PROMOTE,'true');
 assert.equal(env.GITHUB_RUN_ATTEMPT,'1');return 'install-read-only';
}
export function imageRegistryCredentials(env){
 if(imageRegistrySetup(env)==='preconfigured')return undefined;
 const password=env.KINGDOM_IMAGE_REGISTRY_READ_TOKEN;
 if(typeof password!=='string'||!password.trim()||password!==password.trim()||password.length>8192||/[\r\n]/.test(password))throw new Error('Restricted registry credential is required.');
 return {username:'catillatio',password};
}
// Request syntax is safe to check before protected environment variables exist.
export function checkImageRequestShape(env){
 assert.equal(env.GITHUB_REPOSITORY,'catillatio/test');assert.equal(env.GITHUB_REF,'refs/heads/release/production');assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');
 const operation=env.KINGDOM_IMAGE_OPERATION;assert.ok(['image-prepare','image-release'].includes(operation));
 assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.match(env.GITHUB_SHA??'',sha);
 for(const k of ['REGISTRAR_CONFIG_PATCH_ID','REGISTRAR_CONFIG_APPROVAL_TOKEN'])assert.ok(!env[k]);
 assert.ok(!env.REGISTRAR_CONFIG_EXCLUSIVE_WINDOW||env.REGISTRAR_CONFIG_EXCLUSIVE_WINDOW==='false');
 if(operation==='image-prepare'){
  assert.equal(env.KINGDOM_IMAGE_PROMOTE,'false');assert.equal(imageRegistrySetup(env),'preconfigured');
  assert.ok(!env.KINGDOM_IMAGE_RUN_ID&&!env.KINGDOM_IMAGE_ARTIFACT_ID&&!env.KINGDOM_IMAGE_MANIFEST_DIGEST);
 }else{
  assert.ok(['true','false'].includes(env.KINGDOM_IMAGE_PROMOTE));imageRegistrySetup(env);
  assert.equal(env.KINGDOM_IMAGE_EXCLUSIVE_WINDOW,'true');
  assert.match(env.KINGDOM_IMAGE_RUN_ID??'',id);assert.match(env.KINGDOM_IMAGE_ARTIFACT_ID??'',id);assert.match(env.KINGDOM_IMAGE_MANIFEST_DIGEST??'',imageDigest);
 }
 return operation;
}
// Full authorization remains mandatory in every operational caller.
export function checkImageRequest(env){
 const operation=checkImageRequestShape(env);
 if(operation==='image-prepare'){
  assert.equal(env.KINGDOM_IMAGE_PUBLICATION_ENABLED,'true');assert.equal(env.KINGDOM_IMAGE_PACKAGE_PRIVATE_CONFIRMED,'true');
 }else gameTransport({...env,KINGDOM_GAME_TRANSPORT:'oci-image-v1'});
 return operation;
}
export function checkNoImageRequest(env){
 assert.ok([undefined,'','false'].includes(env.KINGDOM_IMAGE_INSTALL_REGISTRY_CREDENTIALS));
 for(const k of ['KINGDOM_IMAGE_RUN_ID','KINGDOM_IMAGE_ARTIFACT_ID','KINGDOM_IMAGE_MANIFEST_DIGEST'])assert.ok(!env[k]);
 assert.ok(!env.KINGDOM_IMAGE_EXCLUSIVE_WINDOW||env.KINGDOM_IMAGE_EXCLUSIVE_WINDOW==='false');
}
