// Incident-scoped READ ONLY history inspection. No approval, recovery, registry,
// database, source update or deployment path is imported or invoked.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {railwayClient,failureCategory} from './registrar-config.mjs';
import {canonical} from './image-policy.mjs';
import {uuid} from './protocol.mjs';

export const release78HistoryContext=Object.freeze({
 projectId:'41a664f1-06bb-492e-90ef-cfd9635fc67f',environmentId:'8ced8aef-352e-4ea9-931d-8963ff352c1c',serviceId:'47a56e8e-aa72-40df-a5c4-0e5feb0f5cdd',
 message:'Protected exact-image release ec3e24d7cd1d0df4ec46f3279189d81cd23fa4fc',
 image:'ghcr.io/catillatio/kingdom-come-deploy-canary@sha256:e238cfa77b6d5e8eb5f9669aa933afa9762c35730fdf0f4561a749eb1dd253e2',
 stageAt:'2026-10-28T05:41:10.676Z',failureAt:'2026-10-28T05:41:14.048Z',finishedAt:'2026-10-28T05:41:26.000Z'
});
const meta='id environmentId status message createdAt updatedAt appliedAt';
const scope='project(id:$projectId){id name} environment(id:$environmentId,projectId:$projectId){id projectId name}';
export const commitHistoryQuery=`query Release78CommitHistory($projectId:String!,$environmentId:String!,$after:String){${scope}
 history:environmentPatches(environmentId:$environmentId,first:25,after:$after){edges{node{${meta}}} pageInfo{hasNextPage endCursor}}}`;
const receipt=`receipt:environmentPatch(id:$patchId){${meta} lastAppliedError patch(decryptVariables:false)}`;
export const commitSourceRecordQuery=`query Release78SourceRecord($patchId:String!){${receipt}}`;
export const commitReceiptQuery=`query Release78CommitReceipt($projectId:String!,$environmentId:String!,$serviceId:String!,$patchId:String!){
 project(id:$projectId){id name} environment(id:$environmentId,projectId:$projectId){id projectId name config(decryptVariables:false)}
 game:serviceInstance(environmentId:$environmentId,serviceId:$serviceId){serviceId environmentId source{repo image}}
 pending:environmentStagedChanges(environmentId:$environmentId){environmentId status patch(decryptVariables:false)} ${receipt}}`;
const metaKeys=['id','environmentId','status','message','createdAt','updatedAt','appliedAt'];
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const when=p=>Date.parse(p.appliedAt??p.updatedAt);
const summaryMeta=p=>Object.fromEntries(metaKeys.map(k=>[k,p[k]]));
const status=p=>['STAGED','APPLYING','COMMITTED'].includes(p)?p:'OTHER';
function targetCheck(d,t){
 assert.equal(d.project?.id,t.projectId);assert.equal(d.project.name,'merry-patience');
 assert.equal(d.environment?.id,t.environmentId);assert.equal(d.environment.projectId,t.projectId);assert.equal(d.environment.name,'production');
}
function metadata(p,t){
 // GraphQL ID is opaque; only the independently fetched record and incident
 // binding establish identity. Never infer a UUID contract from past examples.
 assert.ok(object(p));assert.ok(typeof p.id==='string'&&p.id.length>0&&p.id.length<=500);assert.equal(p.environmentId,t.environmentId);
 assert.ok(typeof p.status==='string');assert.ok(p.message===null||typeof p.message==='string');
 assert.ok(date(p.createdAt)&&date(p.updatedAt));assert.ok(Date.parse(p.updatedAt)>=Date.parse(p.createdAt));
 assert.ok(Object.hasOwn(p,'appliedAt')&&(p.appliedAt===null||date(p.appliedAt)));
}
export function commitHistoryErrorSummary(value){
 if(value===null)return {presence:'NONE',code:'NONE',mentions:[]};
 if(typeof value!=='string')return {presence:'INVALID_TYPE',code:'UNCLASSIFIED',mentions:[]};
 let code='UNCLASSIFIED';
 const codes=new Set(['UNAUTHORIZED','FORBIDDEN','BAD_USER_INPUT','BAD_REQUEST','NOT_FOUND','CONFLICT','INTERNAL_SERVER_ERROR','TIMEOUT','UNPROCESSABLE_CONTENT']);
 try{const p=JSON.parse(value),c=p?.extensions?.code??p?.code;if(codes.has(c))code=c;}catch{}
 // Closed vocabulary observations only, never a provider message or an inferred
 // root cause. Unknown text (including secret-looking "codes") is not printed.
 const terms={IMAGE_SOURCE:/\b(?:image|docker|sourceImage)\b/i,REPOSITORY_SOURCE:/\b(?:repo|repository|github|serviceRepoId)\b/i,
  REGISTRY_CREDENTIALS:/\b(?:registry(?:Credentials?)?|credentials|authentication|ghcr)\b/i,AUTHORIZATION:/\b(?:unauthorized|forbidden|permission|authorized)\b/i,
  VALIDATION:/\b(?:invalid|validation|conflict)\b/i,TIMEOUT:/\b(?:timeout|timed out)\b/i,INTERNAL_NULL_REFERENCE:/cannot read properties of null|cannot read properties of undefined/i};
 return {presence:value===''?'EMPTY_STRING':'PRESENT',code,mentions:Object.entries(terms).filter(([,re])=>re.test(value)).map(([name])=>name)};
}
function sourceSummary(source,c){
 if(source===undefined)return {shape:'NOT_CONFIGURED',image:'NOT_CHANGED',repo:'NOT_CHANGED'};
 if(source===null)return {shape:'CLEARED',image:'NOT_CHANGED',repo:'NOT_CHANGED'};
 if(!object(source))return {shape:'OTHER',image:'UNVERIFIED',repo:'UNVERIFIED'};
 const image=!Object.hasOwn(source,'image')?'NOT_CHANGED':source.image===c.image?'EXACT_PIN':source.image===null?'NULL':typeof source.image==='string'?'OTHER_IMAGE':'OTHER_TYPE';
 const repo=!Object.hasOwn(source,'repo')?'NOT_CHANGED':source.repo===null?'NULL':source.repo==='catillatio/test'?'EXPECTED_GITHUB':typeof source.repo==='string'?'OTHER_REPOSITORY':'OTHER_TYPE';
 return {shape:'OBJECT',image,repo};
}
function patchSource(p,t){
 assert.ok(object(p.patch));const services=p.patch.services;
 assert.ok(services===undefined||object(services));const service=services?.[t.serviceId];
 assert.ok(service===undefined||object(service));return service?.source;
}
function pendingSummary(p,t){
 if(p===null)return 'EMPTY';
 assert.ok(object(p)&&p.environmentId===t.environmentId&&object(p.patch));
 if(p.status==='COMMITTED')return 'COMMITTED_RECORD_RETURNED';
 if(p.status==='APPLYING')return 'APPLYING';
 assert.equal(p.status,'STAGED');
 const entries=Object.entries(p.patch),empty=entries.every(([key,v])=>['services','volumes','buckets','sharedVariables'].includes(key)&&object(v)&&Object.keys(v).length===0);
 if(empty){assert.equal(p.status,'STAGED');return 'EMPTY';}return 'NONEMPTY';
}
function currentState(d,t,c){
 targetCheck(d,t);assert.equal(d.game?.serviceId,t.serviceId);assert.equal(d.game.environmentId,t.environmentId);
 assert.ok(Object.hasOwn(d.game,'source')&&(d.game.source===null||object(d.game.source)));
 assert.ok(object(d.environment.config)&&object(d.environment.config.services?.[t.serviceId]));
 assert.ok(Object.hasOwn(d,'pending'));
 const rawConfigSource=d.environment.config?.services?.[t.serviceId]?.source;
 return {instance:d.game.source,config:rawConfigSource,pending:pendingSummary(d.pending,t),
  report:{serviceInstance:sourceSummary(d.game.source,c),environmentConfig:sourceSummary(rawConfigSource,c)}};
}
export async function inspectImageCommitHistory(env,{api,context=release78HistoryContext}={}){
 let phase='HISTORY_REQUEST';
 try{
  assert.equal(env.GITHUB_REPOSITORY,'catillatio/test');assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(env.GITHUB_REF,'refs/heads/release/production');
  assert.equal(env.GITHUB_JOB,'diagnostic');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.equal(env.KINGDOM_IMAGE_COMMIT_HISTORY_INSPECTION,'true');
  assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);assert.notEqual(env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
  phase='HISTORY_CREDENTIAL';assert.ok(typeof env.RAILWAY_TOKEN==='string'&&/^[\x21-\x7e]+$/.test(env.RAILWAY_TOKEN)&&!env.RAILWAY_API_TOKEN);
  const t={projectId:env.RAILWAY_PROJECT_ID,environmentId:env.RAILWAY_ENVIRONMENT_ID,serviceId:env.RAILWAY_GAME_SERVICE_ID};
  phase='HISTORY_TARGET';for(const k of Object.keys(t)){assert.match(t[k]??'',uuid);assert.equal(t[k],context[k]);}
  const client=api??railwayClient(env.RAILWAY_TOKEN),known=new Set();let calls=0;
  const read=async(q,v)=>{
   assert.ok([commitHistoryQuery,commitReceiptQuery,commitSourceRecordQuery].includes(q));assert.ok(++calls<=18);
   if(q!==commitSourceRecordQuery){assert.equal(v.projectId,t.projectId);assert.equal(v.environmentId,t.environmentId);}
   if(q===commitReceiptQuery)assert.equal(v.serviceId,t.serviceId);
   if(q!==commitHistoryQuery)assert.ok(known.has(v.patchId));
   return client(q,v);
  };
  const nodes=[],cursors=new Set();let after=null,complete=false;
  for(let page=0;page<8;page++){
   phase='HISTORY_READ';const d=await read(commitHistoryQuery,{projectId:t.projectId,environmentId:t.environmentId,after});
   phase='HISTORY_RESPONSE';targetCheck(d,t);const h=d.history;
   assert.ok(Array.isArray(h?.edges)&&h.edges.length<=25&&typeof h.pageInfo?.hasNextPage==='boolean');
   for(const {node}of h.edges){metadata(node,t);assert.ok(!known.has(node.id));known.add(node.id);nodes.push(node);}
   if(!h.pageInfo.hasNextPage){complete=true;break;}
   const cursor=h.pageInfo.endCursor;assert.ok(typeof cursor==='string'&&cursor&&cursor.length<=2048&&!cursors.has(cursor));cursors.add(cursor);after=cursor;
  }
  phase='HISTORY_BOUND_EXCEEDED';assert.ok(complete);
  // Source SHA alone is not sufficient: require the unique exact message and
  // the observed promotion window, with the existing 60s clock allowance.
  const matches=nodes.filter(p=>p.message===context.message&&when(p)>=Date.parse(context.stageAt)-60000&&when(p)<=Date.parse(context.finishedAt)+60000);
  phase=matches.length===0?'HISTORY_NOT_FOUND':'HISTORY_AMBIGUOUS';assert.equal(matches.length,1);const selected=matches[0];
  phase='RECEIPT_READ';const vars={...t,patchId:selected.id},first=await read(commitReceiptQuery,vars);
  phase='RECEIPT_BINDING';metadata(first.receipt,t);assert.equal(canonical(summaryMeta(first.receipt)),canonical(summaryMeta(selected)));
  assert.ok(Object.hasOwn(first.receipt,'lastAppliedError'));const error=commitHistoryErrorSummary(first.receipt.lastAppliedError);assert.notEqual(error.presence,'INVALID_TYPE');
  const source=sourceSummary(patchSource(first.receipt,t),context),current=currentState(first,t,context);
  const later=nodes.filter(p=>p.id!==selected.id&&when(p)>when(selected)).sort((a,b)=>when(a)-when(b));const laterSources=[];
  for(const row of later.slice(0,8)){
   phase='LATER_SOURCE_READ';const d=await read(commitSourceRecordQuery,{patchId:row.id});
   phase='LATER_SOURCE_BINDING';metadata(d.receipt,t);assert.equal(canonical(summaryMeta(d.receipt)),canonical(summaryMeta(row)));
   const changed=patchSource(d.receipt,t);
   if(changed!==undefined)laterSources.push({status:status(d.receipt.status),appliedAt:d.receipt.appliedAt===null?'NULL':'VALID_TIMESTAMP',source:sourceSummary(changed,context)});
  }
  phase='RECEIPT_READBACK';const last=await read(commitReceiptQuery,vars);
  phase='RECEIPT_CHANGED';assert.equal(canonical(last.receipt),canonical(first.receipt));
  phase='CURRENT_SOURCE_CHANGED';assert.equal(canonical(currentState(last,t,context)),canonical(current));
  return {result:'INSPECTED',failure:'NONE',record:'EXACT_MESSAGE_AND_WINDOW',status:status(first.receipt.status),
   appliedAt:first.receipt.appliedAt===null?'NULL':Date.parse(first.receipt.appliedAt)<=Date.parse(context.failureAt)?'VALID_AT_OR_BEFORE_FAILURE':'VALID_AFTER_FAILURE',
   lastAppliedError:error,recordedSource:source,currentSource:current.report,pending:current.pending,
   laterSourceHistory:later.length>8?'LIMITED':'COMPLETE_WITHIN_RETRIEVED_HISTORY',laterSourceChanges:laterSources,
   rollbackConclusion:'NOT_AUTOMATICALLY_INFERRED',firstOriginalAssertion:'NOT_RETAINED',authorizesRelease:false};
 }catch(error){
  const provider=failureCategory(error);
  return {result:'UNVERIFIED',failure:provider==='UNCLASSIFIED'?phase:provider,authorizesRelease:false};
 }
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 let r;try{r=await inspectImageCommitHistory(process.env);}catch{r={result:'UNVERIFIED',failure:'UNVERIFIED',authorizesRelease:false};}
 console.log('IMAGE_COMMIT_HISTORY_INSPECTION: '+JSON.stringify(r));process.exitCode=r.result==='INSPECTED'?0:1;
}
