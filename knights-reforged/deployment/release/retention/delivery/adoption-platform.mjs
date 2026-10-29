import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {verifyQueuedDeployment} from '../../deployment.mjs';
import {waitForRunning,stopExactDeployment} from './lifecycle.mjs';
import {adoptionTarget} from './protocol.mjs';
export const credentialReferences=Object.freeze({KINGDOM_RETENTION_ADOPTER_DB_HOST:'${{KingdomReleaseCopy.RAILWAY_PRIVATE_DOMAIN}}',KINGDOM_RETENTION_ADOPTER_DB_USER:'${{KingdomReleaseCopy.POSTGRES_USER}}',KINGDOM_RETENTION_ADOPTER_DB_PASSWORD:'${{KingdomReleaseCopy.POSTGRES_PASSWORD}}',KINGDOM_RETENTION_ADOPTER_DB_NAME:'${{KingdomReleaseCopy.POSTGRES_DB}}'});
export const unrenderedQuery='query RetentionAdoptionVariables($projectId:String!,$environmentId:String!,$serviceId:String!){variables(projectId:$projectId,environmentId:$environmentId,serviceId:$serviceId,unrendered:true)}';
export const replaceMutation='mutation RetentionAdoptionReset($projectId:String!,$environmentId:String!,$serviceId:String!,$variables:EnvironmentVariables!){variableCollectionUpsert(input:{projectId:$projectId,environmentId:$environmentId,serviceId:$serviceId,variables:$variables,replace:true,skipDeploys:true})}';
const empty=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.values(v).every(x=>x===null||empty(x));
export function checkAdopter(data,scope,id){
 const d=data;assert.equal(d.project.id,scope.projectId);assert.equal(d.environment.id,scope.environmentId);assert.equal(d.environment.projectId,scope.projectId);assert.equal(d.environment.name,'production');
 if(d.pending!==null){assert.equal(d.pending.environmentId,scope.environmentId);assert.equal(d.pending.lastAppliedError,null);if(d.pending.status==='APPLIED')assert.ok(Number.isFinite(Date.parse(d.pending.appliedAt)));else{assert.equal(d.pending.status,'STAGED');assert.equal(d.pending.appliedAt,null);assert.ok(empty(d.pending.patch));}}
   const source=d.environment.serviceInstances.edges.filter(e=>e.node.serviceId===scope.verificationServiceId);assert.equal(source.length,1);assert.equal(source[0].node.serviceName,'KingdomReleaseCopy');assert.equal(source[0].node.environmentId,scope.environmentId);assert.equal(d.environment.serviceInstances.edges.filter(e=>e.node.serviceName==='KingdomReleaseCopy').length,1);
   const rows=d.environment.serviceInstances.edges.filter(e=>e.node.serviceId===id);assert.equal(rows.length,1);const s=rows[0].node;
   const target=adoptionTarget({serviceId:id,futureAfter:s.service.createdAt},scope);
   assert.equal(s.serviceName,'KingdomCopyAdopter');assert.equal(s.environmentId,scope.environmentId);
   assert.ok(s.source===null||s.source.repo===null&&s.source.image===null);assert.equal(s.service.repoTriggers.edges.length,0);
   for(const k of ['buildCommand','preDeployCommand','cronSchedule','healthcheckPath'])assert.equal(s[k],null);
   assert.ok(s.rootDirectory===null||s.rootDirectory==='/');assert.equal(s.startCommand,null);assert.equal(s.restartPolicyType,'NEVER');
   assert.ok(s.numReplicas===null||s.numReplicas===1);assert.deepEqual(d.environment.config.services[id].deploy.multiRegionConfig,{iad:{numReplicas:1}});
   assert.equal(s.domains.serviceDomains.length+s.domains.customDomains.length,0);
   assert.ok(s.activeDeployments.every(x=>x.deploymentStopped===true&&x.instances.length<=1&&x.instances.every(i=>i.status==='EXITED')));
   assert.equal(d.environment.volumeInstances.edges.filter(e=>e.node.serviceId===id).length,0);
   return target;
}
export function adoptionMethods(api,base,{command,token,fetcher,preflightQuery,stageMutation,stopMutation}){
 const changes=new Map();
 const args=(scope,serviceId)=>({projectId:scope.projectId,environmentId:scope.environmentId,serviceId});
 const vars=async(scope,id)=>(await api(unrenderedQuery,args(scope,id))).variables;
 const set=async(scope,id,variables,replace=false)=>assert.equal((await api(replace?replaceMutation:stageMutation,{...args(scope,id),variables})).variableCollectionUpsert,true);
 const remember=(id,baseline,next)=>{let c=changes.get(id);if(!c){c={baseline,states:[baseline]};changes.set(id,c);}c.states.push(next);};
 return {
  async adoptionPreflight(scope,id){
   await base.preflight(scope);
   const d=await api(preflightQuery,{projectId:scope.projectId,environmentId:scope.environmentId});
   const target=checkAdopter(d,scope,id);
   assert.equal((await api('query RetentionAdopterNetwork($environmentId:String!,$serviceId:String!){tcpProxies(environmentId:$environmentId,serviceId:$serviceId){id}}',{environmentId:scope.environmentId,serviceId:id})).tcpProxies.length,0);
   assert.deepEqual(await vars(scope,id),{NODE_ENV:'production',KINGDOM_RETENTION_ADOPTER_ENABLED:'0',RAILWAY_RUN_UID:'1000'});
   return target;
  },
  async adoptionLaunch(role,f,directory){
   const id=role==='authorizer'?f.scope.delivery.authorizerServiceId:f.scope.operatorServiceId;
   const old=await vars(f.scope,id);assert.equal(old.KINGDOM_RETENTION_ENABLED,'0');assert.ok(!old.KINGDOM_RETENTION_JOB);
   const next={...old,KINGDOM_RETENTION_ENABLED:'1'};remember(id,old,next);await set(f.scope,id,{KINGDOM_RETENTION_ENABLED:'1'});
   remember(id,old,{...next,KINGDOM_RETENTION_JOB:Buffer.from(JSON.stringify(f)).toString('base64url')});
   return base.launch(role,f,directory);
  },
  async launchAdopter(f,directory){
   const id=f.adoption.serviceId;
   assert.deepEqual(checkAdopter(await api(preflightQuery,{projectId:f.scope.projectId,environmentId:f.scope.environmentId}),f.scope,id),f.adoption);
   assert.equal((await api('query RetentionAdopterNetwork($environmentId:String!,$serviceId:String!){tcpProxies(environmentId:$environmentId,serviceId:$serviceId){id}}',{environmentId:f.scope.environmentId,serviceId:id})).tcpProxies.length,0);
   const old=await vars(f.scope,id);
   assert.deepEqual(old,{NODE_ENV:'production',KINGDOM_RETENTION_ADOPTER_ENABLED:'0',RAILWAY_RUN_UID:'1000'});
   const next={...old,KINGDOM_RETENTION_ADOPTER_ENABLED:'1',KINGDOM_RETENTION_JOB:Buffer.from(JSON.stringify(f)).toString('base64url'),...credentialReferences};
   remember(id,old,next);await set(f.scope,id,next,true);assert.deepEqual(await vars(f.scope,id),next);
   const out=await command('railway',['up',directory,'--project',f.scope.projectId,'--environment',f.scope.environmentId,'--service',id,'--detach','--json','--path-as-root','--message','Kingdom exact-copy adoption '+f.coordinator.headSha],{cwd:directory});
   return verifyQueuedDeployment(out,{...args(f.scope,id)},{token,fetcher});
  },
  async adoptionRunning(id,scope,target,options){return waitForRunning(api,id,{...args(scope,target.serviceId)},options);},
  async stopAdopter(id,scope,target,options){return stopExactDeployment(api,id,{...args(scope,target.serviceId)},stopMutation,options);},
  async resetAdoption(scope){
   const results=await Promise.allSettled([...changes].map(async([id,c])=>{
    const current=await vars(scope,id);assert.ok(c.states.some(s=>isDeepStrictEqual(s,current)),'Configuration drift blocks reset.');
    if(!isDeepStrictEqual(current,c.baseline)){
     const privileged=id!==scope.operatorServiceId&&id!==scope.delivery.authorizerServiceId;
     const restored=privileged?c.baseline:{...c.baseline,KINGDOM_RETENTION_JOB:c.baseline.KINGDOM_RETENTION_JOB??''};
     await set(scope,id,privileged?c.baseline:{KINGDOM_RETENTION_ENABLED:c.baseline.KINGDOM_RETENTION_ENABLED,KINGDOM_RETENTION_JOB:restored.KINGDOM_RETENTION_JOB},privileged);assert.deepEqual(await vars(scope,id),restored);
    }
   }));assert.ok(results.every(r=>r.status==='fulfilled'));
  }
 };
}
