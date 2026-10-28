import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectImageCommitHistory,commitHistoryErrorSummary,release78HistoryContext,commitHistoryQuery,commitReceiptQuery,commitSourceRecordQuery} from '../deployment/release/inspect-image-commit-history.mjs';
import {ids} from './fixtures/release-image.mjs';

const privateValue='ghp_private_fixture_DO_NOT_PRINT https://user:password@private.invalid/?token=secret\n::error::private';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const fields=['id','environmentId','status','message','createdAt','updatedAt','appliedAt'];
const meta=p=>Object.fromEntries(fields.map(k=>[k,p[k]]));
function fixture({realContext=false,edit,readErrorAt}={}){
 const context=realContext?release78HistoryContext:{...release78HistoryContext,projectId:ids[0],environmentId:ids[1],serviceId:ids[2]};
 const t={projectId:context.projectId,environmentId:context.environmentId,serviceId:context.serviceId};
 const env={GITHUB_REPOSITORY:'catillatio/test',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/release/production',GITHUB_SHA:'a'.repeat(40),GITHUB_JOB:'diagnostic',GITHUB_RUN_ATTEMPT:'1',
  KINGDOM_IMAGE_COMMIT_HISTORY_INSPECTION:'true',RAILWAY_TOKEN:'synthetic-project-token',RAILWAY_PROJECT_ID:t.projectId,RAILWAY_ENVIRONMENT_ID:t.environmentId,RAILWAY_GAME_SERVICE_ID:t.serviceId};
 const original={id:id(1),environmentId:t.environmentId,status:'COMMITTED',message:context.message,createdAt:'2026-10-27T01:53:46.217Z',updatedAt:'2026-10-28T05:41:12.000Z',appliedAt:'2026-10-28T05:41:12.000Z',lastAppliedError:null,
  patch:{services:{[t.serviceId]:{source:{image:context.image,repo:null},variables:{KINGDOM_RELEASE_BACKUP_PROOF:{value:privateValue}},deploy:{registryCredentials:{username:privateValue,password:privateValue}}}}}};
 const records=[original],calls=[];let pages;
 const state={project:{id:t.projectId,name:'merry-patience'},environment:{id:t.environmentId,projectId:t.projectId,name:'production',config:{services:{[t.serviceId]:{
  source:{repo:'catillatio/test',branch:'private-branch',rootDirectory:'/knights-reforged'},variables:{DATABASE_URL:{value:privateValue}},deploy:{registryCredentials:{password:privateValue}}}}}},
  game:{serviceId:t.serviceId,environmentId:t.environmentId,source:{repo:'catillatio/test',image:null}},pending:null};
 const api=async(q,v)=>{
  assert.ok([commitHistoryQuery,commitReceiptQuery,commitSourceRecordQuery].includes(q));assert.match(q,/^query /);assert.doesNotMatch(q,/mutation|subscription/);
  calls.push({q,v});if(calls.length===readErrorAt)throw Error(privateValue);
  let result;
  if(q===commitHistoryQuery){
   const page=v.after===null?0:Number(v.after.slice('cursor-'.length));const batches=pages??[records.map(meta)];
   result={project:structuredClone(state.project),environment:{...structuredClone(state.environment),config:undefined},history:{edges:(batches[page]??[]).map(node=>({node:structuredClone(node)})),pageInfo:{hasNextPage:page+1<batches.length,endCursor:page+1<batches.length?'cursor-'+(page+1):null}}};
  }else{
   const receipt=structuredClone(records.find(p=>p.id===v.patchId));
   result=q===commitReceiptQuery?{...structuredClone(state),receipt}:{receipt};
  }
  edit?.(result,{q,v,call:calls.length});return result;
 };
 const run=override=>inspectImageCommitHistory({...env,...override},{api,context});
 const later=(n,source,{status='COMMITTED',applied=true}={})=>{
  const time=new Date(Date.parse(original.updatedAt)+n*1000).toISOString();
  const p={...structuredClone(original),id:id(n+1),message:'private unrelated message '+n,createdAt:time,updatedAt:time,appliedAt:applied?time:null,status,patch:{services:{[t.serviceId]:{variables:{PRIVATE:{value:privateValue}},...(source===undefined?{}:{source})}}}};records.push(p);return p;
 };
 return {run,api,context,t,env,state,records,original,calls,later,setPages:value=>{pages=value;}};
}
test('exact record is independently bound and both current source views are reported without authorizing release',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.result,'INSPECTED');assert.equal(r.failure,'NONE');assert.equal(r.record,'EXACT_MESSAGE_AND_WINDOW');assert.equal(r.status,'COMMITTED');
 assert.equal(r.appliedAt,'VALID_AT_OR_BEFORE_FAILURE');assert.equal(r.lastAppliedError.presence,'NONE');assert.equal(r.recordedSource.image,'EXACT_PIN');assert.equal(r.recordedSource.repo,'NULL');
 assert.equal(r.currentSource.serviceInstance.image,'NULL');assert.equal(r.currentSource.serviceInstance.repo,'EXPECTED_GITHUB');assert.equal(r.currentSource.environmentConfig.repo,'EXPECTED_GITHUB');
 assert.equal(r.pending,'EMPTY');assert.equal(r.authorizesRelease,false);assert.equal(r.rollbackConclusion,'NOT_AUTOMATICALLY_INFERRED');assert.equal(r.firstOriginalAssertion,'NOT_RETAINED');
 assert.deepEqual(f.calls.map(c=>c.q),[commitHistoryQuery,commitReceiptQuery,commitReceiptQuery]);
 assert.doesNotMatch(JSON.stringify(r),/ghp_|https?:|private|sha256:|ec3e24|[a-f0-9]{8}-[a-f0-9]{4}-/);
});
for(const [mode,source]of [['pin',{image:release78HistoryContext.image,repo:null}],['missing',undefined],['cleared',null],['other',{image:privateValue,repo:privateValue}],['invalid',privateValue]])test('current environment source is distinguished from service-instance source: '+mode,async()=>{
 const f=fixture();f.state.environment.config.services[f.t.serviceId].source=source;
 const r=await f.run();assert.equal(r.result,'INSPECTED');assert.equal(r.currentSource.serviceInstance.repo,'EXPECTED_GITHUB');
 assert.equal(r.currentSource.environmentConfig.shape,mode==='missing'?'NOT_CONFIGURED':mode==='cleared'?'CLEARED':mode==='invalid'?'OTHER':'OBJECT');
 if(mode==='pin')assert.equal(r.currentSource.environmentConfig.image,'EXACT_PIN');
 assert.equal(r.authorizesRelease,false);assert.ok(!JSON.stringify(r).includes(privateValue));
});
for(const [state,applied]of [['STAGED',false],['APPLYING',false],['COMMITTED',true],['hostile-'+privateValue,true]])test('receipt status is observed without being equated with deployment permission: '+state.split('-')[0],async()=>{
 const f=fixture();f.original.status=state;f.original.appliedAt=applied?f.original.updatedAt:null;
 const r=await f.run();assert.equal(r.result,'INSPECTED');assert.equal(r.status,state.startsWith('hostile')?'OTHER':state);assert.equal(r.appliedAt,applied?'VALID_AT_OR_BEFORE_FAILURE':'NULL');assert.equal(r.authorizesRelease,false);assert.ok(!JSON.stringify(r).includes(privateValue));
});
test('late application is distinguished from application before the failed job stopped',async()=>{
 const f=fixture();f.original.appliedAt=f.original.updatedAt='2026-10-28T05:41:20Z';
 const r=await f.run();assert.equal(r.result,'INSPECTED');assert.equal(r.appliedAt,'VALID_AFTER_FAILURE');assert.equal(r.authorizesRelease,false);
});
test('private lastAppliedError is inspected using a closed vocabulary, including unclassified errors',async()=>{
 for(const value of [null,'',privateValue,'{"extensions":{"code":"FORBIDDEN"},"message":"'+privateValue.replaceAll('\n','')+'"}',JSON.stringify({code:privateValue}), 'Cannot read properties of null while changing sourceImage repository credentials: '+privateValue]){
  const summary=commitHistoryErrorSummary(value);assert.ok(!JSON.stringify(summary).includes(privateValue));assert.doesNotMatch(JSON.stringify(summary),/ghp_|https?:|password|token=|DO_NOT_PRINT/);
 }
 assert.equal(commitHistoryErrorSummary(JSON.stringify({code:'FORBIDDEN'})).code,'FORBIDDEN');assert.equal(commitHistoryErrorSummary(privateValue).code,'UNCLASSIFIED');
 assert.deepEqual(commitHistoryErrorSummary('Cannot read properties of null'),{presence:'PRESENT',code:'UNCLASSIFIED',mentions:['INTERNAL_NULL_REFERENCE']});
 const f=fixture();f.original.lastAppliedError='Invalid docker image repository credentials '+privateValue;
 const r=await f.run();assert.equal(r.result,'INSPECTED');assert.equal(r.lastAppliedError.presence,'PRESENT');assert.deepEqual(r.lastAppliedError.mentions,['IMAGE_SOURCE','REPOSITORY_SOURCE','REGISTRY_CREDENTIALS','VALIDATION']);assert.equal(r.authorizesRelease,false);
});
test('absent/nonstring error evidence is never treated as a null success receipt',async()=>{
 for(const value of [undefined,{},[],123]){const f=fixture();f.original.lastAppliedError=value;const r=await f.run();assert.equal(r.result,'UNVERIFIED');assert.equal(r.failure,'RECEIPT_BINDING');}
});
test('metadata-only pagination locates the unique record without relying on provider sort order',async()=>{
 const f=fixture(),newer=f.later(20,undefined),older={...meta(f.original),id:id(99),message:null,appliedAt:'2026-10-28T04:00:00Z',updatedAt:'2026-10-28T04:00:00Z'};
 f.setPages([[meta(newer),older],[meta(f.original)]]);const r=await f.run();assert.equal(r.result,'INSPECTED');assert.equal(f.calls.filter(c=>c.q===commitHistoryQuery).length,2);
 assert.doesNotMatch(commitHistoryQuery,/patch\(|lastAppliedError|config\(/);
});
for(const kind of ['missing','duplicate','outside-window'])test('exact incident selection rejects '+kind+' matches instead of choosing an arbitrary latest',async()=>{
 const f=fixture();
 if(kind==='missing')f.original.message='other protected release';
 if(kind==='duplicate')f.records.push({...structuredClone(f.original),id:id(2)});
 if(kind==='outside-window')f.original.appliedAt=f.original.updatedAt='2026-10-28T06:00:00Z';
 const r=await f.run();assert.equal(r.result,'UNVERIFIED');assert.equal(r.failure,kind==='duplicate'?'HISTORY_AMBIGUOUS':'HISTORY_NOT_FOUND');assert.equal(f.calls.length,1);
});
test('same commit message at another time does not impersonate the incident',async()=>{
 const f=fixture();f.records.push({...structuredClone(f.original),id:id(2),appliedAt:'2026-10-28T06:00:00Z',updatedAt:'2026-10-28T06:00:00Z'});
 assert.equal((await f.run()).result,'INSPECTED');
});
test('stored GraphQL receipt IDs are opaque and still bind exactly across reads',async()=>{
 const f=fixture();f.original.id='opaque-committed-history-record';const r=await f.run();assert.equal(r.result,'INSPECTED');
 assert.equal(f.calls[1].v.patchId,'opaque-committed-history-record');assert.equal(f.calls[2].v.patchId,'opaque-committed-history-record');assert.ok(!JSON.stringify(r).includes('opaque-committed'));
});
test('bounded history is not silently declared complete or unique',async()=>{
 const f=fixture();f.setPages(Array.from({length:9},()=>[]));const r=await f.run();assert.equal(r.result,'UNVERIFIED');assert.equal(r.failure,'HISTORY_BOUND_EXCEEDED');assert.equal(f.calls.length,8);
});
for(const kind of ['cursor','duplicate-id','wrong-environment','wrong-project','missing-appliedAt'])test('invalid history metadata fails closed: '+kind,async()=>{
 const f=fixture({edit:(d,{q})=>{if(q!==commitHistoryQuery)return;
  if(kind==='cursor'){d.history.pageInfo={hasNextPage:true,endCursor:null};}
  if(kind==='duplicate-id')d.history.edges.push(structuredClone(d.history.edges[0]));
  if(kind==='wrong-environment')d.history.edges[0].node.environmentId=ids[4];
  if(kind==='wrong-project')d.environment.projectId=ids[4];
  if(kind==='missing-appliedAt')delete d.history.edges[0].node.appliedAt;
 }});const r=await f.run();assert.equal(r.result,'UNVERIFIED');assert.equal(r.failure,'HISTORY_RESPONSE');
});
test('later source operations are distinguished from variable-only records and staged edits',async()=>{
 const f=fixture();f.later(1,undefined);f.later(2,{image:null,repo:'catillatio/test'});f.later(3,{image:privateValue},{status:'STAGED',applied:false});
 const r=await f.run();assert.equal(r.result,'INSPECTED');assert.equal(r.laterSourceChanges.length,2);
 assert.equal(r.laterSourceChanges[0].status,'COMMITTED');assert.equal(r.laterSourceChanges[0].source.repo,'EXPECTED_GITHUB');
 assert.equal(r.laterSourceChanges[1].status,'STAGED');assert.equal(r.laterSourceChanges[1].appliedAt,'NULL');assert.equal(r.rollbackConclusion,'NOT_AUTOMATICALLY_INFERRED');
 assert.doesNotMatch(JSON.stringify(r),/private|ghp_|https?:/);
});
test('later record limit cannot become an assertion that no later reversal exists',async()=>{
 const f=fixture();for(let n=1;n<=9;n++)f.later(n,undefined);
 const r=await f.run();assert.equal(r.result,'INSPECTED');assert.equal(r.laterSourceHistory,'LIMITED');assert.equal(r.rollbackConclusion,'NOT_AUTOMATICALLY_INFERRED');assert.equal(f.calls.filter(c=>c.q===commitSourceRecordQuery).length,8);
});
for(const where of ['receipt-meta','receipt-source','receipt-variable','receipt-error','service-source','config-source','pending'])test('changed evidence cannot yield a stable result: '+where,async()=>{
 let receiptReads=0;
 const f=fixture({edit:(d,{q})=>{if(q!==commitReceiptQuery||++receiptReads!==2)return;
  if(where==='receipt-meta')d.receipt.status='APPLYING';
  if(where==='receipt-source')d.receipt.patch.services[f.t.serviceId].source.image=privateValue;
  if(where==='receipt-variable')d.receipt.patch.services[f.t.serviceId].variables.KINGDOM_RELEASE_BACKUP_PROOF.value='changed';
  if(where==='receipt-error')d.receipt.lastAppliedError=privateValue;
  if(where==='service-source')d.game.source.image=f.context.image;
  if(where==='config-source')d.environment.config.services[f.t.serviceId].source.image=f.context.image;
  if(where==='pending')d.pending={environmentId:f.t.environmentId,status:'STAGED',patch:{services:{[f.t.serviceId]:{source:{image:privateValue}}}}};
 }});const r=await f.run();assert.equal(r.result,'UNVERIFIED');assert.equal(r.failure,where.startsWith('receipt')?'RECEIPT_CHANGED':'CURRENT_SOURCE_CHANGED');assert.ok(!JSON.stringify(r).includes(privateValue));
});
test('synthetic empty placeholders may vary, while no new staging is authorized',async()=>{
 const f=fixture({edit:(d,{q,call})=>{if(q===commitReceiptQuery)d.pending={id:'opaque-'+call,environmentId:f.t.environmentId,status:'STAGED',patch:{services:{},volumes:{}}};}});
 const r=await f.run();assert.equal(r.result,'INSPECTED');assert.equal(r.pending,'EMPTY');assert.equal(r.authorizesRelease,false);
});
for(const field of ['id','environmentId','message','updatedAt'])test('independent receipt metadata cannot substitute another record: '+field,async()=>{
 const f=fixture({edit:(d,{q})=>{if(q!==commitReceiptQuery)return;d.receipt[field]=field==='updatedAt'?'2026-10-28T05:41:13Z':field==='message'?privateValue:ids[5];}});
 const r=await f.run();assert.equal(r.result,'UNVERIFIED');assert.equal(r.failure,'RECEIPT_BINDING');assert.equal(r.authorizesRelease,false);
});
test('missing current pending/config identity data is not treated as clean state',async()=>{
 for(const field of ['pending','source','config']){
  const f=fixture({edit:(d,{q})=>{if(q!==commitReceiptQuery)return;if(field==='pending')delete d.pending;if(field==='source')delete d.game.source;if(field==='config')delete d.environment.config;}}),r=await f.run();assert.equal(r.result,'UNVERIFIED');assert.equal(r.failure,'RECEIPT_BINDING');
 }
});
for(const state of ['COMMITTED','APPLYING'])test('a returned committed record/applying operation is not mislabeled as uncommitted staging: '+state,async()=>{
 const f=fixture();f.state.pending={environmentId:f.t.environmentId,status:state,patch:structuredClone(f.original.patch)};
 const r=await f.run();assert.equal(r.result,'INSPECTED');assert.equal(r.pending,state==='COMMITTED'?'COMMITTED_RECORD_RETURNED':'APPLYING');assert.equal(r.authorizesRelease,false);
});
test('later source record must match its independently selected metadata',async()=>{
 const f=fixture({edit:(d,{q})=>{if(q===commitSourceRecordQuery)d.receipt.message=privateValue;}});f.later(1,{repo:'catillatio/test',image:null});
 const r=await f.run();assert.equal(r.result,'UNVERIFIED');assert.equal(r.failure,'LATER_SOURCE_BINDING');
});
for(const at of [1,2,3])test('lost read acknowledgment stops without retry: '+at,async()=>{
 const f=fixture({readErrorAt:at}),r=await f.run();assert.equal(r.result,'UNVERIFIED');assert.equal(f.calls.length,at);assert.equal(r.authorizesRelease,false);assert.ok(!JSON.stringify(r).includes(privateValue));
});
for(const change of [{GITHUB_REF:'refs/heads/unmerged'},{GITHUB_EVENT_NAME:'push'},{GITHUB_JOB:'release'},{GITHUB_RUN_ATTEMPT:'2'},{KINGDOM_IMAGE_COMMIT_HISTORY_INSPECTION:'false'},{RAILWAY_API_TOKEN:privateValue},{RAILWAY_TOKEN:''},{RAILWAY_ENVIRONMENT_ID:ids[5]}])test('unapproved inspection request never accesses Railway: '+Object.keys(change)[0],async()=>{
 const f=fixture(),r=await f.run(change);assert.equal(r.result,'UNVERIFIED');assert.equal(f.calls.length,0);assert.equal(r.authorizesRelease,false);
});
test('workflow modes are exclusive for all input combinations and credentials remain confined to the approved read-only step',()=>{
 const s=readFileSync(new URL('../../.github/workflows/railway-authorization-diagnostic.yml',import.meta.url),'utf8'),names=['image_target_inspection','image_handoff_inspection','image_commit_history_inspection'];
 const steps=s.split(/\n      - name: /).slice(1).map(block=>({name:block.split('\n')[0],condition:block.match(/\n        if: (.+)/)?.[1].replace(/^'|'$/g,'')}));
 for(let bits=0;bits<8;bits++){
  const inputs=Object.fromEntries(names.map((name,i)=>[name,!!(bits&(1<<i))]));
  const selected=steps.filter(step=>Function('inputs','return ('+step.condition+');')(inputs));
  assert.equal(selected.length,1);assert.equal(selected[0].name.includes('Reject ambiguous'),Object.values(inputs).filter(Boolean).length>1);
 }
 assert.match(s,/github.ref == 'refs\/heads\/release\/production'/);assert.match(s,/environment: production/);assert.match(s,/ref: \$\{\{ github.sha \}\}/);assert.match(s,/cancel-in-progress: false/);
 assert.match(s,/inputs.image_commit_history_inspection\) && 'kingdom-come-production'/);
 const block=s.split('- name: Inspect only the exact release 78 commit history and current source')[1].split('- name:')[0];
 assert.match(block,/secrets.RAILWAY_TOKEN/);assert.equal((block.match(/secrets\./g)||[]).length,1);assert.doesNotMatch(block,/SIGNING|VERIFY_KEY|REGISTRY_READ|DATABASE_URL|BACKUP_|npm |railway up/);
 const source=readFileSync(new URL('../deployment/release/inspect-image-commit-history.mjs',import.meta.url),'utf8');
 assert.match(source,/\[commitHistoryQuery,commitReceiptQuery,commitSourceRecordQuery\]\.includes\(q\)/);assert.match(source,/\+\+calls<=18/);
 assert.doesNotMatch(source,/child_process|writeFile|createHash|signProof|createPrivateKey|variablesForServiceDeployment|error\.(message|stack)|console\.(error|warn)/);
 for(const q of [commitHistoryQuery,commitReceiptQuery,commitSourceRecordQuery])assert.doesNotMatch(q,/mutation|subscription|decryptVariables:true/);
});
test('CLI prints only its category report, never hostile provider content or private receipt values',()=>{
 const folder=mkdtempSync(join(tmpdir(),'commit-history-private-'));
 try{for(const fail of [false,true]){
  const f=fixture({realContext:true}),preload=join(folder,'provider.mjs');
  const scope={project:f.state.project,environment:{...f.state.environment,config:undefined},history:{edges:[{node:meta(f.original)}],pageInfo:{hasNextPage:false,endCursor:null}}};
  const receipt={...f.state,receipt:f.original};
  writeFileSync(preload,'globalThis.fetch=async(_url,opts)=>{const q=JSON.parse(opts.body).query;if(!q.startsWith("query "))throw Error("write forbidden");'+(fail?'throw Error('+JSON.stringify(privateValue)+');':'return {ok:true,status:200,text:async()=>JSON.stringify({data:q.includes("query Release78CommitHistory(")?'+JSON.stringify(scope)+':'+JSON.stringify(receipt)+'})};')+'};');
  const r=spawnSync(process.execPath,['--import',preload,new URL('../deployment/release/inspect-image-commit-history.mjs',import.meta.url).pathname],{env:{PATH:process.env.PATH,...f.env},encoding:'utf8',timeout:5000});
  assert.equal(r.status,fail?1:0);assert.equal(r.stderr,'');const prefix='IMAGE_COMMIT_HISTORY_INSPECTION: ';assert.ok(r.stdout.startsWith(prefix));
  const parsed=JSON.parse(r.stdout.slice(prefix.length));assert.equal(parsed.authorizesRelease,false);
  assert.doesNotMatch(r.stdout,/ghp_|https?:|private|password|sha256:|ec3e24|[a-f0-9]{8}-[a-f0-9]{4}-/);
 }}finally{rmSync(folder,{recursive:true,force:true});}
});
