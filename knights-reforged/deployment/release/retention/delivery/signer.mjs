// Separate GitHub-hosted protected signing job. No Railway or SQL credentials.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {checkCoordinator,hash,checkApproval} from '../protocol.mjs';
import {deliveryScope,deliveryProtocol,input,verifyArm} from './protocol.mjs';
import {ownerReview} from './approval.mjs';
import {handoffStore} from './store.mjs';
import {readObject,writeObject} from './io.mjs';
import {liveGuards} from '../guards.mjs';
import {uuid} from '../../protocol.mjs';
export async function signRequest({env=process.env,store,runAuthorize,fetcher=globalThis.fetch}={}){
 assert.equal(env.KINGDOM_RETENTION_EXECUTION_APPROVED,'1');assert.equal(env.GITHUB_REPOSITORY,'catillatio/test');assert.equal(env.GITHUB_REF,'refs/heads/release/production');assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(env.GITHUB_JOB,'sign-retirement');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.equal(env.RETENTION_OPERATION,'retire');
 for(const k of ['RAILWAY_TOKEN','RAILWAY_API_TOKEN','DATABASE_URL','KINGDOM_RESTORE_DATABASE_URL','KINGDOM_RELEASE_SIGNING_KEY','KINGDOM_RETENTION_DATABASE_URL','KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL','KINGDOM_RETENTION_BOOTSTRAP_DATABASE_URL'])assert.ok(!env[k]);
 const scope=deliveryScope(JSON.parse(env.KINGDOM_RETENTION_SCOPE)),id=env.RETENTION_REQUEST_ID;assert.match(id,uuid);
 const run=env.GITHUB_RUN_ID+'_1',context=await readObject(await store.grant(run,id,'context.json','GET'),{fetcher});
 assert.equal(context.protocol,deliveryProtocol);assert.deepEqual(context.scope,scope);assert.equal(context.operation,'retire');assert.equal(context.requestId,id);
 const c=checkCoordinator(context.coordinator);assert.equal(c.runId,env.GITHUB_RUN_ID);assert.equal(c.runAttempt,1);assert.equal(c.headSha,env.GITHUB_SHA);
 const f={scope,coordinator:c,operation:'retire',requestId:id},data=input(await readObject(await store.grant(run,id,'input.json','GET'),{fetcher}),f);
 // No waiting for a later input: approve this environment ONLY after private
 // preparation is complete. Premature signing approval fails closed.
 const armed=await readObject(await store.grant(run,id,'executor-arm.json','GET'),{fetcher});
 assert.equal(verifyArm(armed,{protocol:deliveryProtocol,role:'executor',requestId:id,coordinator:c,codeDigest:context.codeDigests.executor,deliveryVerifyKey:context.deliveryVerifyKey},context.deployments.executor),hash(data));
 await liveGuards(scope,{githubToken:env.GH_TOKEN,fetcher}).coordinated(data.state);
 await ownerReview(c,id,hash(data),{githubToken:env.GH_TOKEN,fetcher});
 const approval=await runAuthorize(data);checkApproval(approval,env.KINGDOM_RETENTION_VERIFY_KEY,data.data.plan,data.state,scope);
 await writeObject(await store.grant(run,id,'signature.json','PUT'),{inputDigest:hash(data),approval},{fetcher});return {passed:true};
}
async function main(){
 const store=handoffStore(),dir=await mkdtemp(join(process.env.RUNNER_TEMP,'retention-signing-'));
 try{await signRequest({store,runAuthorize:async data=>{
  for(const [name,value] of Object.entries({scope:data.scope,state:data.state,plan:data.data.plan}))await writeFile(dir+'/'+name+'.json',JSON.stringify(value),{mode:0o600,flag:'wx'});
  await writeFile(dir+'/key.pem',process.env.KINGDOM_RETENTION_SIGNING_KEY,{mode:0o600,flag:'wx'});
  const child=spawn(process.execPath,['deployment/release/retention/authorize.mjs','--scope',dir+'/scope.json','--state',dir+'/state.json','--plan',dir+'/plan.json','--private-key',dir+'/key.pem','--out',dir+'/approval.txt','--release-lock-held'],{stdio:'ignore'});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(code,0);return (await readFile(dir+'/approval.txt','utf8')).trim();
 }});console.log('RETENTION_SIGNING: PASS');}finally{store.close();await rm(dir,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('RETENTION_SIGNING: FAIL');process.exitCode=1;});
