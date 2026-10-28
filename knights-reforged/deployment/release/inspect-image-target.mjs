// Read-only inspection of the EXACT operational provider-state assertions.
// No source/image publication, configuration mutation, DB, CLI or subprocess.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {inspectImageTargetState,imageInspectQuery,imageReceiptQuery} from './image-deploy.mjs';
import {railwayClient,failureCategory} from './registrar-config.mjs';
import {uuid} from './protocol.mjs';

const statuses=new Set(['BUILDING','CRASHED','DEPLOYING','FAILED','INITIALIZING','NEEDS_APPROVAL','QUEUED','REMOVED','REMOVING','SKIPPED','SLEEPING','SUCCESS','WAITING',
 'CREATED','EXITED','RESTARTING','RUNNING','STOPPED','STAGED','COMMITTED','APPLYING','ON_FAILURE','ALWAYS','NEVER','INSPECT','RECEIPT']);
const type=value=>value===null?'NULL':Array.isArray(value)?'ARRAY':typeof value==='object'?'OBJECT':typeof value==='string'?'STRING':typeof value==='undefined'?'MISSING':typeof value==='number'?'NUMBER':typeof value==='boolean'?'BOOLEAN':'OTHER';
function safe(value){
 if(typeof value==='boolean'||value===null)return value;
 if(typeof value==='number')return Number.isSafeInteger(value)&&Math.abs(value)<=86400?value:'OTHER_NUMBER';
 if(typeof value==='string')return statuses.has(value)?value:'OTHER_STRING';
 if(Array.isArray(value))return 'ARRAY';
 return type(value);
}
const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function safeCheck(field,value){
 if(['latest.instances.status','active.instances.status'].includes(field)&&Array.isArray(value))return value.slice(0,8).map(safe);
 if(field.endsWith('.status')||field==='game.restartPolicyType'||field==='provider.query')return safe(value);
 return typeof value==='string'?type(value):safe(value);
}
function deploymentFields(name,d){
 return {
  [name+'.status']:safe(d?.status),[name+'.deploymentStopped']:safe(d?.deploymentStopped),
  [name+'.instances.type']:type(d?.instances),[name+'.instances.count']:Array.isArray(d?.instances)?safe(d.instances.length):null,
  [name+'.instances.status']:Array.isArray(d?.instances)?d.instances.slice(0,8).map(i=>safe(i?.status)):[],
  [name+'.createdAt.valid']:validDate(d?.createdAt),[name+'.updatedAt.valid']:validDate(d?.updatedAt)
 };
}
export function sanitizedTargetMetadata(data,target){
 const game=data?.game,p=data?.pending,regions=data?.environment?.config?.services?.[target.serviceId]?.deploy?.multiRegionConfig;
 const counts=regions&&typeof regions==='object'&&!Array.isArray(regions)?Object.values(regions).slice(0,8).map(r=>safe(r?.numReplicas)):[];
 const containers=p?.patch&&typeof p.patch==='object'&&!Array.isArray(p.patch)?Object.entries(p.patch):[];
 return {
  'game.healthcheckTimeout':typeof game?.healthcheckTimeout==='string'?'STRING':safe(game?.healthcheckTimeout),'game.restartPolicyType':safe(game?.restartPolicyType),
  'game.rootDirectory.type':type(game?.rootDirectory),'game.rootDirectory.matches':game?.rootDirectory==='/knights-reforged',
  'game.startCommand.type':type(game?.startCommand),'game.startCommand.matches':game?.startCommand==='node deployment/start.mjs',
  'game.preDeployCommand.type':type(game?.preDeployCommand),
  'game.preDeployCommand.matches':Array.isArray(game?.preDeployCommand)&&game.preDeployCommand.length===1&&game.preDeployCommand[0]==='node deployment/migrate.mjs',
  'game.healthcheckPath.type':type(game?.healthcheckPath),'game.healthcheckPath.matches':game?.healthcheckPath==='/healthz','game.numReplicas':safe(game?.numReplicas),
  'game.regionalReplicas.type':type(regions),'game.regionalReplicas.counts':counts,
  'game.source.type':type(game?.source),'game.source.repo.matches':game?.source?.repo==='catillatio/test','game.source.image.type':type(game?.source?.image),
  'game.activeDeployments.count':Array.isArray(game?.activeDeployments)?safe(game.activeDeployments.length):null,
  'inFlight.count':Array.isArray(data?.inFlight?.edges)?safe(data.inFlight.edges.length):null,
  ...deploymentFields('latest',game?.latestDeployment),...deploymentFields('active',game?.activeDeployments?.[0]),
  'pending.present':Object.hasOwn(data??{},'pending'),'pending.type':type(p),'pending.status':safe(p?.status),
  'pending.appliedAt.type':type(p?.appliedAt),'pending.lastAppliedError.type':type(p?.lastAppliedError),
  'pending.createdAt.valid':validDate(p?.createdAt),'pending.updatedAt.valid':validDate(p?.updatedAt),'pending.appliedAt.valid':validDate(p?.appliedAt),
  'pending.patch.type':type(p?.patch),
  'pending.patch.onlyEmptyContainers':p?.patch&&typeof p.patch==='object'&&!Array.isArray(p.patch)?containers.every(([key,v])=>['services','volumes','buckets','sharedVariables'].includes(key)&&v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===0):null
 };
}
export async function inspectImageTarget(env,{api}={}){
 const checks=[];let current=null,metadata={},reads=0;
 const observe=(field,expected,value)=>{if(current)checks.push({...current,passed:true});current={field,expected,actual:safeCheck(field,value)};};
 try{
  observe('inspection.request','PROTECTED_MANUAL_FIRST_ATTEMPT',env.GITHUB_REPOSITORY==='catillatio/test'&&env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_REF==='refs/heads/release/production'&&env.GITHUB_RUN_ATTEMPT==='1'&&env.KINGDOM_IMAGE_TARGET_INSPECTION==='true');
  assert.equal(env.GITHUB_REPOSITORY,'catillatio/test');assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(env.GITHUB_REF,'refs/heads/release/production');
  assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.equal(env.KINGDOM_IMAGE_TARGET_INSPECTION,'true');assert.notEqual(env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
  observe('inspection.credentials','OPAQUE_PROJECT_TOKEN',typeof env.RAILWAY_TOKEN==='string'&&/^[\x21-\x7e]+$/.test(env.RAILWAY_TOKEN)&&!env.RAILWAY_API_TOKEN);
  assert.ok(typeof env.RAILWAY_TOKEN==='string'&&/^[\x21-\x7e]+$/.test(env.RAILWAY_TOKEN));assert.ok(!env.RAILWAY_API_TOKEN);
  const target={projectId:env.RAILWAY_PROJECT_ID,environmentId:env.RAILWAY_ENVIRONMENT_ID,serviceId:env.RAILWAY_GAME_SERVICE_ID};
  observe('inspection.target','UUID_TARGETS',Object.values(target).every(value=>typeof value==='string'&&uuid.test(value)));
  for(const value of Object.values(target))assert.match(value??'',uuid);
  const client=api??railwayClient(env.RAILWAY_TOKEN);
  const read=async(query,variables)=>{
   // Even a future change to the shared validator cannot invoke a mutation here.
   assert.ok([imageInspectQuery,imageReceiptQuery].includes(query));assert.ok(++reads<=2);
   assert.equal(variables.projectId,target.projectId);assert.equal(variables.environmentId,target.environmentId);assert.equal(variables.serviceId,target.serviceId);
   observe('provider.query','AUTHENTICATED_RESPONSE',query===imageInspectQuery?'INSPECT':'RECEIPT');
   const data=await client(query,variables);
   if(query===imageInspectQuery)metadata=sanitizedTargetMetadata(data,target);
   return data;
  };
  await inspectImageTargetState({projectId:target.projectId,environmentId:target.environmentId,gameServiceId:target.serviceId,registrySetup:'install-read-only'},{api:read,observe});
  if(current)checks.push({...current,passed:true});
  return {kind:'READ_ONLY_FIRST_IMAGE_HANDOFF',result:'MATCH',firstRejected:null,checks,metadata,reads,authorizesRelease:false};
 }catch(error){
  // Never serialize an exception, assertion diff, provider body, URL or ID.
  const assertion=error?.code==='ERR_ASSERTION',category=failureCategory(error);
  const result=assertion&&current?'REJECTED':'UNVERIFIED';
  return {kind:'READ_ONLY_FIRST_IMAGE_HANDOFF',result,firstRejected:assertion&&current?current:null,checks,metadata,reads,
   failureCategory:category==='UNCLASSIFIED'?(assertion?'ASSERTION':'UNVERIFIED'):category,authorizesRelease:false};
 }
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 let result;
 try{result=await inspectImageTarget(process.env);}catch{result={result:'UNVERIFIED',authorizesRelease:false};}
 console.log('IMAGE_TARGET_INSPECTION: '+JSON.stringify({kind:result.kind,result:result.result,reads:result.reads,failureCategory:result.failureCategory,authorizesRelease:false}));
 console.log('IMAGE_TARGET_FIRST_REJECTION: '+JSON.stringify(result.firstRejected??null));
 for(const check of result.checks??[])console.log('IMAGE_TARGET_CHECK: '+JSON.stringify(check));
 for(const [field,actual]of Object.entries(result.metadata??{}))console.log('IMAGE_TARGET_FIELD: '+JSON.stringify({field,actual}));
 process.exitCode=result.result==='MATCH'?0:1;
}
