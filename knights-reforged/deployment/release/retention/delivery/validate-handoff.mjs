// Store-only readiness check. No Railway, SQL, scope, signing or worker access.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {uuid} from '../../protocol.mjs';
import {handoffStore} from './store.mjs';
import {readObject,writeObject} from './io.mjs';

// Authenticated connection metadata for the installed dedicated handoff bucket.
export const expectedHandoffSettings=Object.freeze({
 KINGDOM_RETENTION_STORE_ENDPOINT:'https://t3.storageapi.dev',
 KINGDOM_RETENTION_STORE_REGION:'auto',
 KINGDOM_RETENTION_STORE_BUCKET:'kingdom-retention-handoff-g6-jcd',
 KINGDOM_RETENTION_STORE_PATH_STYLE:'false'
});
export async function validateHandoff(env,{storeFactory=handoffStore,fetcher=globalThis.fetch,signal,log=console.log}={}){
 let stage='WORKFLOW_CONTEXT',store,passed=false;
 try{
  assert.equal(env.GITHUB_REPOSITORY,'catillatio/test');assert.equal(env.GITHUB_REF,'refs/heads/release/production');
  assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(env.GITHUB_JOB,'validate-handoff');
  assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);
  assert.match(env.GITHUB_RUN_ID??'',/^[1-9][0-9]{0,19}$/);assert.match(env.RETENTION_REQUEST_ID??'',uuid);
  assert.equal(env.RETENTION_OPERATION,'validate-handoff');assert.equal(env.KINGDOM_RETENTION_EXECUTION_APPROVED,'0');
  assert.ok(['retention-execution','retention-signing'].includes(env.RETENTION_HANDOFF_ENVIRONMENT));
  stage='CREDENTIAL_ISOLATION';
  for(const [key,value] of Object.entries(env))if(/DATABASE_URL|^PG(?:HOST|PORT|USER|PASSWORD|DATABASE|SERVICE)|^(?:RAILWAY_(?:TOKEN|API_TOKEN)|GH_TOKEN|KINGDOM_(?:BACKUP_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY)|RELEASE_SIGNING_KEY|RETENTION_(?:SIGNING_KEY|SCOPE|INSTALL_TARGET|ENABLED|JOB)))$/.test(key))assert.ok(!value);
  stage='STORE_CONFIGURATION';for(const [key,value] of Object.entries(expectedHandoffSettings))assert.equal(env[key],value);
  assert.ok(env.KINGDOM_RETENTION_STORE_ACCESS_KEY_ID&&env.KINGDOM_RETENTION_STORE_SECRET_ACCESS_KEY);
  assert.notEqual(env.NODE_TLS_REJECT_UNAUTHORIZED,'0');signal?.throwIfAborted();
  store=storeFactory(env);
  // Fresh per-environment object; never overwrite or delete an existing object.
  const id=randomUUID(),run=env.GITHUB_RUN_ID+'_1';
  const payload={protocol:'kingdom-retention-handoff-check-v1',requestId:env.RETENTION_REQUEST_ID,environment:env.RETENTION_HANDOFF_ENVIRONMENT,headSha:env.GITHUB_SHA};
  const io={signal,fetcher,wait:false};
  stage='PROBE_CREATE';const put=await store.grant(run,id,'probe.json','PUT');await writeObject(put,payload,io);
  stage='CONDITIONAL_WRITE';await writeObject(put,payload,{...io,expectExisting:true});
  stage='PROBE_READ';signal?.throwIfAborted();const get=await store.grant(run,id,'probe.json','GET');
  assert.deepEqual(await readObject(get,io),payload);passed=true;
 }catch{
  // Provider errors, signed URLs, response bodies and credential hashes never escape.
 }finally{
  try{store?.close();}catch{stage='STORE_CLOSE';passed=false;}
 }
 if(!passed)log('RETENTION_HANDOFF_FAILURE: '+stage);
 log('RETENTION_HANDOFF: '+(passed?'PASS':'FAIL'));return {passed};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const control=new AbortController();process.once('SIGTERM',()=>control.abort());process.once('SIGINT',()=>control.abort());
 const result=await validateHandoff(process.env,{signal:control.signal});if(!result.passed)process.exitCode=1;
}
