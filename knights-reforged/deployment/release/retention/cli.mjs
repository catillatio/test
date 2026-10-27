// Independent owner-operated command. Never imported by the game or release.
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile,writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {checkEnvironment,hash} from './protocol.mjs';
import {reconcileInterrupted} from './reconcile.mjs';
import {uuid} from '../protocol.mjs';
import {liveGuards} from './guards.mjs';
import {lockCluster,inspect,cleanup} from './retention.mjs';
import {writeBaseline} from './journal.mjs';
import {verifyAdoption} from './verification.mjs';
const read=async path=>{const text=await readFile(path,'utf8');assert.ok(Buffer.byteLength(text)<=2000000);return JSON.parse(text);};
let client,disconnected=false,failureStage='INPUT',failurePath;
try{
 process.umask(0o077);
 const {values,positionals}=parseArgs({allowPositionals:true,options:{scope:{type:'string'},state:{type:'string'},plan:{type:'string'},approval:{type:'string'},out:{type:'string'},keep:{type:'string'},'min-age-hours':{type:'string'},'prior-approval':{type:'string'},before:{type:'string'},manifest:{type:'string'}}});
 assert.equal(positionals.length,1);assert.ok(['dry-run','cleanup','reconcile','verify-adoption'].includes(positionals[0]));assert.ok(values.out);
 failurePath=values.out+'.failure.json';failureStage='ENVIRONMENT';
 const scope=await read(values.scope),state=await read(values.state);
 const url=checkEnvironment(process.env,scope);
 const guards=liveGuards(scope,{githubToken:process.env.GH_TOKEN});
 failureStage='LIVE_HEALTH';assert.equal(await guards.health(),state.activeSha);
 failureStage='DATABASE_CONNECTION';client=new pg.Client({connectionString:url,connectionTimeoutMillis:5000,application_name:'kingdom-copy-retention'});client.on('error',()=>{disconnected=true;});await client.connect();
 failureStage='CATALOG_AND_LOCK';await lockCluster(client,scope);failureStage='OPERATION';
 let report;
 if(positionals[0]==='dry-run'){
  assert.ok(!values.plan&&!values.approval&&!values['prior-approval']&&!values.before&&!values.manifest);
  const limits={};if(values.keep!==undefined)limits.keep=Number(values.keep);if(values['min-age-hours']!==undefined)limits.minAgeHours=Number(values['min-age-hours']);
  const plan=await inspect(client,state,scope,limits);
  let walBytes=null;try{walBytes=(await client.query('SELECT coalesce(sum(size),0)::text AS bytes FROM pg_ls_waldir()')).rows[0].bytes;}catch{/* Optional monitor privilege; do not expand runtime permissions. */}
  report={plan,planSha256:hash(plan),storage:{databaseBytes:plan.rows.reduce((n,row)=>n+BigInt(row.bytes),0n).toString(),walBytes,
   otherManagedBytes:null,volumeBytes:null,note:'Database sizes are measured logical storage; WAL, logs, shared files, free space and filesystem accounting may differ.'}};
 }else if(positionals[0]==='verify-adoption'){
  assert.ok(values.manifest&&!values.plan&&!values.approval&&!values['prior-approval']&&!values.before&&!values.keep&&!values['min-age-hours']);
  await guards.coordinated(state,process.env);
  report=await verifyAdoption(client,await read(values.manifest),scope);
 }else if(positionals[0]==='reconcile'){
  assert.ok(!values.plan&&!values.approval&&!values.keep&&!values['min-age-hours']&&!values.manifest);assert.match(values['prior-approval']??'',uuid);
  await guards.coordinated(state,process.env);
  report=await reconcileInterrupted(client,{scope,approvalId:values['prior-approval'],verifyKey:process.env.KINGDOM_RETENTION_VERIFY_KEY,before:values.before?await read(values.before):undefined});
 }else{
  assert.ok(!values['prior-approval']&&!values.before&&!values.manifest);
  assert.ok(values.plan&&values.approval&&!values.keep&&!values['min-age-hours']);
  await guards.coordinated(state,process.env);
  report=await cleanup(client,{scope,state,plan:await read(values.plan),approval:(await readFile(values.approval,'utf8')).trim(),verifyKey:process.env.KINGDOM_RETENTION_VERIFY_KEY,beforeDelete:async(...args)=>{failureStage='LIVE_COORDINATION';await guards.beforeDelete(...args);failureStage='OPERATION';},
   recordBaseline:async baseline=>{failureStage='JOURNAL';await writeBaseline(values.out+'.before.json',baseline);failureStage='OPERATION';}});
 }
 assert.equal(disconnected,false);
 failureStage='RESULT';await writeFile(values.out,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log('COPY_RETENTION: PASS');
}catch{if(failurePath)await writeBaseline(failurePath,{kind:'retention-fixed-failure',category:failureStage}).catch(()=>{});console.error('COPY_RETENTION: FAIL');process.exitCode=1;}
finally{if(client)await client.end().catch(()=>{});}
