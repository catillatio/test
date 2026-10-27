import assert from 'node:assert/strict';
import {uuid} from '../../protocol.mjs';
import {verifyQueuedDeployment,waitForWorkerCompletion} from '../../deployment.mjs';
const endpoint='https://backboard.railway.com/graphql/v2';
export const preflightQuery=`query RetentionDeliveryPreflight($projectId:String!,$environmentId:String!){
 project(id:$projectId){id name}
 environment(id:$environmentId,projectId:$projectId){id projectId name
  serviceInstances{edges{node{serviceId environmentId serviceName source{repo image} startCommand buildCommand preDeployCommand rootDirectory cronSchedule restartPolicyType numReplicas healthcheckPath
   service{repoTriggers{edges{node{id}}}} domains{serviceDomains{id} customDomains{id}}
   activeDeployments{id deploymentStopped instances{id status}}}}}
  volumeInstances{edges{node{volumeId serviceId mountPath isPendingDeletion}}}}
 pending:environmentStagedChanges(environmentId:$environmentId){environmentId status appliedAt lastAppliedError patch(decryptVariables:false)}
}`;
export const stageMutation=`mutation RetentionDeliveryStage($projectId:String!,$environmentId:String!,$serviceId:String!,$variables:EnvironmentVariables!){
 variableCollectionUpsert(input:{projectId:$projectId,environmentId:$environmentId,serviceId:$serviceId,variables:$variables,skipDeploys:true})}`;
export const stopMutation='mutation RetentionDeliveryStop($id:String!){deploymentRemove(id:$id)}';
const identityQuery='query RetentionDeliveryStopIdentity($id:String!){deployment(id:$id){id projectId environmentId serviceId deploymentStopped instances{id status}}}';
const empty=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.values(v).every(x=>x===null||empty(x));
export function checkPreflight(data,scope){
 assert.equal(data.project.id,scope.projectId);assert.equal(data.project.name,'merry-patience');
 assert.equal(data.environment.id,scope.environmentId);assert.equal(data.environment.projectId,scope.projectId);assert.equal(data.environment.name,'production');
 const p=data.pending;
 if(p!==null){assert.equal(p.environmentId,scope.environmentId);assert.equal(p.lastAppliedError,null);
  if(p.status==='APPLIED')assert.ok(Number.isFinite(Date.parse(p.appliedAt)));
  else{assert.equal(p.status,'STAGED');assert.equal(p.appliedAt,null);assert.ok(empty(p.patch));}}
 const services=data.environment.serviceInstances.edges.map(e=>e.node);
 for(const [role,id,name] of [['executor',scope.operatorServiceId,'KingdomCopyRetention'],['authorizer',scope.delivery.authorizerServiceId,'KingdomCopyAuthorizer']]){
  const rows=services.filter(s=>s.serviceId===id);assert.equal(rows.length,1);const s=rows[0];assert.equal(s.serviceName,name);assert.equal(s.environmentId,scope.environmentId);
  assert.ok(s.source===null||s.source.repo===null&&s.source.image===null);assert.equal(s.service.repoTriggers.edges.length,0);
  for(const k of ['buildCommand','preDeployCommand','cronSchedule','healthcheckPath'])assert.equal(s[k],null);
  assert.ok(s.rootDirectory===null||s.rootDirectory==='/');assert.ok(s.startCommand===null||s.startCommand==='node deployment/release/retention/delivery/worker.mjs');
  assert.equal(s.restartPolicyType,'NEVER');assert.equal(s.numReplicas,1);
  assert.equal(s.domains.serviceDomains.length+s.domains.customDomains.length,0);
  assert.ok(s.activeDeployments.every(d=>d.deploymentStopped===true&&d.instances.length<=1&&d.instances.every(i=>i.status==='EXITED')));
 }
 const volumes=data.environment.volumeInstances.edges.map(e=>e.node),own=volumes.filter(v=>v.serviceId===scope.operatorServiceId);
 assert.equal(own.length,1);assert.equal(own[0].volumeId,scope.delivery.journalVolumeId);assert.equal(own[0].mountPath,'/run/kingdom-retention');assert.equal(own[0].isPendingDeletion,false);
 assert.equal(volumes.filter(v=>v.volumeId===scope.delivery.journalVolumeId).length,1);
 assert.equal(volumes.filter(v=>v.serviceId===scope.delivery.authorizerServiceId).length,0);
}
export function platform(token,{fetcher=globalThis.fetch,command}={}){
 assert.ok(token&&!/[\r\n]/.test(token));
 const api=async(query,variables)=>{
  const r=await fetcher(endpoint,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json','project-access-token':token},body:JSON.stringify({query,variables})});
  assert.equal(r.ok,true);const text=await r.text();assert.ok(Buffer.byteLength(text)<=2000000);const d=JSON.parse(text);assert.ok(!d.errors||Array.isArray(d.errors)&&!d.errors.length);assert.ok(d.data);return d.data;
 };
 return {async install(role,scope,bundle,mode){
   assert.ok(['initialize-journal','install-disabled'].includes(mode));const serviceId=role==='executor'?scope.operatorServiceId:scope.delivery.authorizerServiceId;
   const vars=(await api('query RetentionDeliveryVariables($projectId:String!,$environmentId:String!,$serviceId:String!){variables(projectId:$projectId,environmentId:$environmentId,serviceId:$serviceId)}',{projectId:scope.projectId,environmentId:scope.environmentId,serviceId})).variables;
   assert.equal(vars.KINGDOM_RETENTION_ENABLED,'0');
   for(const k of Object.keys(vars))if(/DATABASE_URL|SIGNING_KEY|STORE_.*KEY|TOKEN/.test(k))assert.ok(!vars[k]);
   const initialize=mode==='initialize-journal';assert.ok(!initialize||role==='executor');
   const variables={KINGDOM_RETENTION_JOB:'',KINGDOM_RETENTION_INITIALIZE_JOURNAL:initialize?'owner-approved':'',KINGDOM_RETENTION_CONSOLE_SETUP:initialize?'':'1',RAILWAY_RUN_UID:initialize?'0':'1000',KINGDOM_RETENTION_JOURNAL_VOLUME_ID:scope.delivery.journalVolumeId,KINGDOM_RETENTION_INSTALL_TARGET:JSON.stringify(scope)};
   assert.equal((await api(stageMutation,{projectId:scope.projectId,environmentId:scope.environmentId,serviceId,variables})).variableCollectionUpsert,true);
   const out=await command('railway',['up',bundle,'--project',scope.projectId,'--environment',scope.environmentId,'--service',serviceId,'--detach','--json','--path-as-root','--message','Kingdom retention disabled installation'],{cwd:bundle});
   return verifyQueuedDeployment(out,{projectId:scope.projectId,environmentId:scope.environmentId,serviceId},{token,fetcher});
  },async resetInstallation(scope){
   const current=(await api('query RetentionDeliveryVariables($projectId:String!,$environmentId:String!,$serviceId:String!){variables(projectId:$projectId,environmentId:$environmentId,serviceId:$serviceId)}',{projectId:scope.projectId,environmentId:scope.environmentId,serviceId:scope.operatorServiceId})).variables;
   if(current.KINGDOM_RETENTION_INITIALIZE_JOURNAL!=='owner-approved')return;
   assert.equal(current.KINGDOM_RETENTION_ENABLED,'0');assert.equal(current.RAILWAY_RUN_UID,'0');assert.ok(!current.KINGDOM_RETENTION_JOB);
   for(const key of Object.keys(current))if(/DATABASE_URL|SIGNING_KEY|TOKEN/.test(key))assert.ok(!current[key]);
   const variables={KINGDOM_RETENTION_INITIALIZE_JOURNAL:'',KINGDOM_RETENTION_CONSOLE_SETUP:'',KINGDOM_RETENTION_JOB:'',RAILWAY_RUN_UID:'1000'};
   assert.equal((await api(stageMutation,{projectId:scope.projectId,environmentId:scope.environmentId,serviceId:scope.operatorServiceId,variables})).variableCollectionUpsert,true);
  },async running(id,scope,role,{deadline,signal}){
   const expected={projectId:scope.projectId,environmentId:scope.environmentId,serviceId:role==='executor'?scope.operatorServiceId:scope.delivery.authorizerServiceId};
   for(;;){signal?.throwIfAborted();assert.ok(Date.now()<deadline);const d=(await api(identityQuery,{id})).deployment;assert.equal(d.id,id);for(const [k,v] of Object.entries(expected))assert.equal(d[k],v);
    if(d.instances.length===1&&d.instances[0].status==='RUNNING'&&d.deploymentStopped===false)return;
    assert.ok(!d.deploymentStopped);await new Promise(r=>setTimeout(r,1000));
   }
  },async preflight(scope){checkPreflight(await api(preflightQuery,{projectId:scope.projectId,environmentId:scope.environmentId}),scope);
   // TCP proxy presence is checked separately using the schema's fixed query.
   const q='query RetentionDeliveryNetwork($environmentId:String!,$serviceId:String!){tcpProxies(environmentId:$environmentId,serviceId:$serviceId){id}}';
   for(const serviceId of [scope.operatorServiceId,scope.delivery.authorizerServiceId])assert.equal((await api(q,{environmentId:scope.environmentId,serviceId})).tcpProxies.length,0);
  },async launch(role,f,bundle){
   const serviceId=role==='executor'?f.scope.operatorServiceId:f.scope.delivery.authorizerServiceId;
   const variables={KINGDOM_RETENTION_JOB:Buffer.from(JSON.stringify(f)).toString('base64url')};
   assert.equal((await api(stageMutation,{projectId:f.scope.projectId,environmentId:f.scope.environmentId,serviceId,variables})).variableCollectionUpsert,true);
   const current=await api('query RetentionDeliveryVariables($projectId:String!,$environmentId:String!,$serviceId:String!){variables(projectId:$projectId,environmentId:$environmentId,serviceId:$serviceId)}',{projectId:f.scope.projectId,environmentId:f.scope.environmentId,serviceId});
   assert.equal(current.variables?.KINGDOM_RETENTION_JOB,variables.KINGDOM_RETENTION_JOB);assert.equal(current.variables.KINGDOM_RETENTION_ENABLED,'1');assert.ok(!current.variables.KINGDOM_RETENTION_INITIALIZE_JOURNAL&&!current.variables.KINGDOM_RETENTION_CONSOLE_SETUP);
   for(const key of ['DATABASE_URL','KINGDOM_RESTORE_DATABASE_URL','KINGDOM_RELEASE_SIGNING_KEY','KINGDOM_RETENTION_SIGNING_KEY','KINGDOM_RETENTION_BOOTSTRAP_DATABASE_URL','RAILWAY_TOKEN','RAILWAY_API_TOKEN','NODE_OPTIONS','KINGDOM_RETENTION_STORE_ACCESS_KEY_ID','KINGDOM_RETENTION_STORE_SECRET_ACCESS_KEY'])assert.ok(!current.variables[key]);
   assert.ok(!current.variables[role==='executor'?'KINGDOM_RETENTION_AUTHORIZER_DATABASE_URL':'KINGDOM_RETENTION_DATABASE_URL']);

   const output=await command('railway',['up',bundle,'--project',f.scope.projectId,'--environment',f.scope.environmentId,'--service',serviceId,'--detach','--json','--path-as-root','--message','Kingdom retention '+f.coordinator.headSha],{cwd:bundle});
   return verifyQueuedDeployment(output,{projectId:f.scope.projectId,environmentId:f.scope.environmentId,serviceId},{token,fetcher});
  },async completion(id,scope,role,options){return waitForWorkerCompletion(id,{projectId:scope.projectId,environmentId:scope.environmentId,serviceId:role==='executor'?scope.operatorServiceId:scope.delivery.authorizerServiceId},{token,fetcher,...options});},
  async stop(id,scope,role){
   assert.match(id,uuid);const expected={projectId:scope.projectId,environmentId:scope.environmentId,serviceId:role==='executor'?scope.operatorServiceId:scope.delivery.authorizerServiceId};
   const read=async()=>{const d=(await api(identityQuery,{id})).deployment;assert.equal(d.id,id);for(const [k,v] of Object.entries(expected))assert.equal(d[k],v);return d;};
   let d=await read();if(d.deploymentStopped===true&&d.instances.every(i=>i.status==='EXITED'))return;
   // One exact-ID mutation only. Never `railway down` or "latest deployment".
   assert.equal((await api(stopMutation,{id})).deploymentRemove,true);
   for(let n=0;n<20;n++){d=await read();if(d.deploymentStopped===true&&d.instances.every(i=>i.status==='EXITED'))return;await new Promise(r=>setTimeout(r,500));}
   throw Error('Exact worker stop is unverified.');
  }};
}
