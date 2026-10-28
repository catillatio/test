// HTTP integration of the actual controller/client with a stateful provider and
// a continuously running synthetic game. No Railway, registry or database calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {deployImage,preflightImageTarget,imageReleaseKeys,imageSourceMutation,imageTargetSnapshot} from '../deployment/release/image-deploy.mjs';
import {railwayClient} from '../deployment/release/registrar-config.mjs';
import {signProof,verifyProof} from '../deployment/release/proof.mjs';
import {candidate,approval,proof,runtimeEnv,ids} from './fixtures/release-image.mjs';

const privateToken='synthetic-project-access-token',registryPassword='synthetic-registry-read-password';
const oldId='77777777-7777-4777-8777-777777777777',newId='88888888-8888-4888-8888-888888888888',patchId='99999999-9999-4999-8999-999999999999';
async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port;}
async function close(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
async function rehearsal(t,{install=true,delta=true,existingCredentials=false,mode='success'}={}){
 const target={projectId:ids[0],environmentId:ids[1],serviceId:ids[2]},calls=[],logs=[],requests=[];
 const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'pem'}),p=proof();
 const signed=signProof(p,keys.privateKey),values={KINGDOM_AUTOMATED_RELEASES:'1',KINGDOM_RELEASE_SHA:p.sha,KINGDOM_RESTORE_TEST_DATABASE:p.copy,KINGDOM_RELEASE_BACKUP_PROOF:signed,
  KINGDOM_RELEASE_ARTIFACT_KIND:'oci-image-v1',KINGDOM_RELEASE_IMAGE_REFERENCE:candidate().reference,KINGDOM_RELEASE_IMAGE_DIGEST:candidate().manifestDigest};
 const oldIdentity={deploymentId:oldId,instanceId:'old-running-process',boot:1};let healthReads=0;
 const gameServer=createServer((_req,res)=>{healthReads++;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(oldIdentity));});
 const gameURL=await listen(gameServer);t.after(()=>close(gameServer));
 const identity={id:oldId,...target,status:'SUCCESS',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:01:00Z',deploymentStopped:false,instances:[{id:oldIdentity.instanceId,status:'RUNNING'}]};
 const game={serviceId:ids[2],environmentId:ids[1],startCommand:'node deployment/start.mjs',preDeployCommand:['node deployment/migrate.mjs'],healthcheckPath:'/healthz',healthcheckTimeout:120,numReplicas:1,
  restartPolicyType:'ON_FAILURE',rootDirectory:'/knights-reforged',source:{repo:'catillatio/test',image:null},latestDeployment:identity,activeDeployments:[structuredClone(identity)]};
 const initialConfig={services:{[ids[2]]:{source:{repo:'catillatio/test',branch:'old-github-branch',commitSha:'0'.repeat(40)},build:{builder:'RAILPACK',watchPatterns:['src/**']},
  deploy:{startCommand:'node deployment/start.mjs',...(!install||existingCredentials?{registryCredentials:{username:'catillatio',password:registryPassword}}:{})},variables:{PRIVATE:{value:'unchanged-fixture'},KINGDOM_AUTOMATED_RELEASES:{value:'1'}}},
  [ids[4]]:{variables:{WORKER_PRIVATE:{value:'unchanged-worker-fixture'}}}},sharedVariables:{UNCHANGED_SHARED:{value:'shared-fixture'}}};
 let config=structuredClone(initialConfig),staged=null,receipt=null,sourceApplied=false,queued=false,receiptReads=0;
 const inspect=()=>{
  const data={project:{id:ids[0],name:'merry-patience',environments:{edges:[{node:{id:ids[1],projectId:ids[0],deletedAt:null}}],pageInfo:{hasNextPage:false,hasPreviousPage:false}}},
   environment:{id:ids[1],projectId:ids[0],name:'production',config:structuredClone(config)},game:structuredClone(game),inFlight:{edges:[]},pending:staged?structuredClone(staged):null};
  if(mode==='environment_race'&&receiptReads>=2)data.project.environments.edges.push({node:{id:ids[5],projectId:ids[0],deletedAt:null}});
  return data;
 };
 const payloadBefore=structuredClone(initialConfig),baseline=imageTargetSnapshot(inspect(),target);
 const settings={...target,gameServiceId:target.serviceId,sha:p.sha,registrySetup:install?'install-read-only':'preconfigured',imageTargetDigest:createHash('sha256').update(baseline).digest('hex')};
 const provider=createServer(async(req,res)=>{
  let body='';for await(const part of req)body+=part;const {query,variables:v}=JSON.parse(body);
  try{
   assert.equal(req.method,'POST');assert.equal(req.headers['project-access-token'],privateToken);
   assert.deepEqual(await (await fetch(gameURL+'/healthz')).json(),oldIdentity);
   requests.push({query,variables:v});let data;
   if(query.startsWith('query KingdomImageInspect')){calls.push('inspect');data=inspect();}
   else if(query.startsWith('mutation KingdomImageStage')){
    calls.push('stage');assert.equal(v.environmentId,ids[1]);assert.equal(v.merge,true);
    const svc=v.input.services[ids[2]];assert.deepEqual(Object.keys(v.input),['services']);assert.deepEqual(Object.keys(v.input.services),[ids[2]]);assert.equal(Object.hasOwn(svc,'source'),false);
    assert.deepEqual(Object.keys(svc).sort(),install?['deploy','variables']:['variables']);if(install)assert.deepEqual(svc.deploy,{registryCredentials:{username:'catillatio',password:registryPassword}});
    staged={id:patchId,environmentId:ids[1],status:'STAGED',createdAt:'2026-10-02T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z',appliedAt:null,lastAppliedError:null,patch:structuredClone(v.input)};
    if(delta)delete staged.patch.services[ids[2]].variables.KINGDOM_AUTOMATED_RELEASES;
    if(install&&existingCredentials)delete staged.patch.services[ids[2]].deploy;
    data={environmentStageChanges:structuredClone(staged)};
   }else if(query.startsWith('mutation KingdomImageCommit')){
    calls.push('commit');assert.match(query,/skipDeploys:true/);assert.equal(v.environmentId,ids[1]);assert.equal(sourceApplied,false);assert.equal(queued,false);
    const svc=staged.patch.services[ids[2]];Object.assign(config.services[ids[2]].variables,structuredClone(svc.variables));if(install&&svc.deploy)config.services[ids[2]].deploy.registryCredentials=structuredClone(svc.deploy.registryCredentials);
    receipt={...structuredClone(staged),status:'COMMITTED',appliedAt:'2026-10-02T00:00:01Z',updatedAt:'2026-10-02T00:00:01Z'};staged=null;
    if(mode==='partial_config')delete config.services[ids[2]].variables.KINGDOM_RELEASE_SHA;
    if(mode==='commit_ack_lost'){req.socket.destroy();return;}
    data={environmentPatchCommitStaged:'synthetic-private-workflow-receipt'};
   }else if(query.startsWith('query KingdomImageWorkflow')){calls.push('workflow');data={workflowStatus:{status:'Complete',error:null}};}
   else if(query.startsWith('query KingdomImageReceipt')){
    calls.push('receipt');receiptReads++;data={...inspect(),receipt:structuredClone(receipt)};
    if(mode==='predeploy_drift'&&sourceApplied&&receiptReads===4)data.environment.config.services[ids[2]].variables.PRIVATE.value='edited';
   }else if(query===imageSourceMutation){
    calls.push('source');assert.deepEqual(v,{serviceId:ids[2],environmentId:ids[1],input:{source:{image:candidate().reference,repo:null}}});assert.ok(receipt);assert.equal(staged,null);assert.equal(queued,false);
    for(const name of imageReleaseKeys)assert.equal(config.services[ids[2]].variables[name].value,values[name]);
    assert.deepEqual(game.source,{repo:'catillatio/test',image:null});
    sourceApplied=true;config.services[ids[2]].source={image:candidate().reference};game.source={image:candidate().reference,repo:mode==='repo_retained'?'catillatio/test':null};
    if(mode==='implicit_source_restart')game.activeDeployments[0].instances[0].id='unapproved-restarted-instance';
    if(mode==='source_ack_lost'){req.socket.destroy();return;}
    if(mode==='source_graphql_error'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({errors:[{message:registryPassword,extensions:{code:'INTERNAL_SERVER_ERROR'}}]}));return;}
    data={serviceInstanceUpdate:true};
   }else if(query.startsWith('mutation KingdomImageDeploy')){
    calls.push('deploy');assert.deepEqual(v,{environmentId:ids[1],serviceId:ids[2]});assert.equal(queued,false);assert.equal(sourceApplied,true);assert.equal(staged,null);
    assert.deepEqual(game.source,{image:candidate().reference,repo:null});assert.deepEqual(config.services[ids[2]].source,{image:candidate().reference});
    const env={...runtimeEnv(),...Object.fromEntries(imageReleaseKeys.map(name=>[name,config.services[ids[2]].variables[name].value]))};
    assert.deepEqual(verifyProof(env.KINGDOM_RELEASE_BACKUP_PROOF,publicKey,env,candidate().candidateDigest,{imageIdentity:candidate().identity}),p);
    queued=true;if(mode==='deploy_ack_lost'){req.socket.destroy();return;}data={serviceInstanceDeployV2:newId};
   }else if(query.startsWith('query KingdomImageDeployment')){calls.push('identity');assert.equal(v.id,newId);data={deployment:{...identity,id:newId,status:'QUEUED',meta:{image:candidate().reference}}};}
   else throw Error('Unapproved provider operation');
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data}));
  }catch{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({errors:[{message:'Synthetic provider assertion failed',extensions:{code:'BAD_USER_INPUT'}}]}));}
 });
 const providerURL=await listen(provider);t.after(()=>close(provider));
 const api=railwayClient(privateToken,async(endpoint,options)=>{
  assert.equal(endpoint,'https://backboard.railway.com/graphql/v2');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  return fetch(providerURL,options);
 });
 const run=()=>deployImage(settings,approval(),values,{api,credentials:install?{username:'catillatio',password:registryPassword}:undefined,log:code=>logs.push(code)});
 return {run,api,settings,calls,logs,requests,values,initialConfig:payloadBefore,state:()=>({config,sourceApplied,queued,receiptReads,healthReads}),health:async()=>assert.deepEqual(await (await fetch(gameURL+'/healthz')).json(),oldIdentity)};
}
for(const install of [true,false])for(const delta of [true,false])test('HTTP running-service transition preserves signed proof and runtime, credentials '+install+', omitted unchanged value '+delta,async t=>{
 const f=await rehearsal(t,{install,delta});await f.health();assert.equal(await f.run(),newId);await f.health();
 assert.deepEqual(f.calls,['inspect','stage','inspect','commit','workflow','receipt','receipt','source','receipt','receipt','deploy','identity']);
 assert.deepEqual(f.logs,['PATCH_STAGED','CONFIG_COMMITTED_NO_DEPLOY','SOURCE_UPDATE_REQUESTED','SOURCE_VERIFIED_NO_DEPLOY','DEPLOYMENT_QUEUED']);
 assert.ok(f.state().healthReads>=f.calls.length);assert.equal(f.state().queued,true);
 assert.deepEqual(f.state().config.services[ids[4]],f.initialConfig.services[ids[4]]);assert.deepEqual(f.state().config.sharedVariables,f.initialConfig.sharedVariables);
 assert.ok(!JSON.stringify(f.logs).includes(registryPassword)&&!JSON.stringify(f.logs).includes(f.values.KINGDOM_RELEASE_BACKUP_PROOF));
});
for(const delta of [true,false])test('HTTP first handoff with already installed credentials authenticates an omitted credential delta: '+delta,async t=>{
 const f=await rehearsal(t,{existingCredentials:true,delta});assert.equal(await f.run(),newId);await f.health();
 const committed=f.state().config.services[ids[2]];assert.deepEqual(committed.deploy.registryCredentials,{username:'catillatio',password:registryPassword});
 assert.deepEqual(f.calls.filter(x=>['stage','commit','source','deploy'].includes(x)),['stage','commit','source','deploy']);
});
for(const mode of ['commit_ack_lost','partial_config','source_ack_lost','source_graphql_error','repo_retained','implicit_source_restart','environment_race','predeploy_drift','deploy_ack_lost'])test('HTTP uncertain/partial transition stops without retries: '+mode,async t=>{
 const f=await rehearsal(t,{mode});await assert.rejects(f.run());await f.health();
 for(const name of ['stage','commit','source','deploy'])assert.ok(f.calls.filter(c=>c===name).length<=1);
 assert.equal(f.calls.includes('deploy'),mode==='deploy_ack_lost');assert.equal(f.state().queued,mode==='deploy_ack_lost');
 if(['commit_ack_lost','partial_config','environment_race'].includes(mode))assert.equal(f.calls.includes('source'),false);
 if(mode==='source_ack_lost')assert.equal(f.state().sourceApplied,true);
 assert.ok(!JSON.stringify(f.logs).includes(registryPassword)&&!JSON.stringify(f.logs).includes(f.values.KINGDOM_RELEASE_BACKUP_PROOF));
});
