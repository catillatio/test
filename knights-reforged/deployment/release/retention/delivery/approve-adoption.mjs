// Existing protected reviewer environment; no private key, Railway token or SQL URL.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {coordinator,input,verifyArm} from './protocol.mjs';
import {hash} from '../protocol.mjs';
import {adoptionInput} from './adoption-operation.mjs';
import {ownerReview} from './approval.mjs';
import {handoffStore} from './store.mjs';
import {readObject,writeObject} from './io.mjs';
export async function approveAdoption(env,{store,fetcher=globalThis.fetch}={}){
 assert.equal(env.GITHUB_JOB,'approve-adoption');assert.equal(env.RETENTION_OPERATION,'adopt');
 for(const [k,v] of Object.entries(env))if(/DATABASE_URL|ADOPTER_DB_|SIGNING_KEY|^RAILWAY_(TOKEN|API_TOKEN)$/.test(k))assert.ok(!v);
 const c=coordinator({...env,GITHUB_JOB:'retire'}),run=c.runId+'_1',id=env.RETENTION_REQUEST_ID;
 const context=await readObject(await store.grant(run,id,'context.json','GET'),{fetcher});
 assert.equal(context.operation,'adopt');assert.deepEqual(context.coordinator,c);assert.equal(context.requestId,id);
 const f={protocol:context.protocol,scope:context.scope,coordinator:c,operation:'adopt',requestId:id,role:'authorizer',adoption:context.adoption,codeDigest:context.codeDigests.authorizer,deliveryVerifyKey:context.deliveryVerifyKey},data=input(await readObject(await store.grant(run,id,'input.json','GET'),{fetcher}),f);adoptionInput(data,f);
 const digest=hash(data),arm=await readObject(await store.grant(run,id,'adoption-review-arm.json','GET'),{fetcher});
 assert.equal(verifyArm(arm,f,context.deployments.authorizer),digest);
 await ownerReview(c,id,digest,{githubToken:env.GH_TOKEN,fetcher,purpose:'adoption'});
 await writeObject(await store.grant(run,id,'adoption-approval.json','PUT'),{requestId:id,coordinator:c,inputDigest:digest},{fetcher});return {passed:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let store;try{store=handoffStore();await approveAdoption(process.env,{store});console.log('RETENTION_ADOPTION_REVIEW: PASS');}
 catch{console.error('RETENTION_ADOPTION_REVIEW: FAIL');process.exitCode=1;}finally{store?.close();}
}
