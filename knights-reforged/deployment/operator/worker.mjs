// One-shot private operator entrypoint. No HTTP, release, migration or seed path.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {protocol,verifiedRequest,checkReport,digest,framePrefix,confirmation,expectedService} from './protocol.mjs';
import {verifyToken,verifyDeployment,verifyService} from './railway.mjs';
let gate='REQUEST';
for(const event of ['uncaughtException','unhandledRejection'])process.on(event,()=>{console.error('OWNER_OPERATOR_RUNTIME: FAIL');process.exit(1);});
function encrypt(bytes,recipient){return new Promise((resolve,reject)=>{
 const child=spawn('age',['--encrypt','--recipient',recipient],{stdio:['pipe','pipe','pipe']}),chunks=[];let size=0;
 child.stdout.on('data',b=>{size+=b.length;if(size>10000){child.kill();reject(new Error());}else chunks.push(b);});
 child.stderr.resume();child.on('error',()=>reject(new Error()));child.on('close',code=>code===0?resolve(Buffer.concat(chunks).toString('base64')):reject(new Error()));child.stdin.on('error',()=>{});child.stdin.end(bytes);
});}
async function main(){
 const env=process.env,request=verifiedRequest(env.KINGDOM_OPERATOR_REQUEST,env.KINGDOM_OPERATOR_VERIFY_KEY);
 assert.equal(env.NODE_ENV,'production');assert.equal(env.KINGDOM_OPERATOR_WORKER,'1');assert.equal(env.KINGDOM_PRIVATE_ALPHA,'1');assert.notEqual(env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 for(const key of ['KINGDOM_ALPHA_INITIALIZE','KINGDOM_DEV_PASSWORD','ALLOW_DEV_PROVISIONING','RUN_MIGRATIONS','KINGDOM_RELEASE_JOB','KINGDOM_RELEASE_WORKER','KINGDOM_AUTOMATED_RELEASES','KINGDOM_RELEASE_SIGNING_KEY','KINGDOM_RELEASE_BACKUP_PROOF','KINGDOM_RESTORE_DATABASE_URL','KINGDOM_BACKUP_ACCESS_KEY_ID','KINGDOM_BACKUP_SECRET_ACCESS_KEY'])assert.ok(!env[key]);
 assert.equal(env.RAILWAY_PROJECT_ID,request.context.projectId);assert.equal(env.RAILWAY_ENVIRONMENT_ID,request.context.environmentId);assert.equal(env.RAILWAY_SERVICE_ID,expectedService(request));
 assert.equal(env.KINGDOM_OPERATOR_RAILWAY_SCOPE_ACKNOWLEDGED,'1');assert.ok(!env.PGOPTIONS&&!env.PGSERVICE&&!env.PGSERVICEFILE);
 if(request.mode==='setup'){assert.equal(env.KINGDOM_OPERATOR_BOOTSTRAP,'1');assert.ok(env.KINGDOM_OPERATOR_RUNTIME_PASSWORD);}else{assert.ok(!env.KINGDOM_OPERATOR_BOOTSTRAP&&!env.KINGDOM_OPERATOR_RUNTIME_PASSWORD&&!env.KINGDOM_OPERATOR_BOOTSTRAP_DATABASE_URL);}
 const url=new URL(env.DATABASE_URL);assert.ok(['postgres:','postgresql:'].includes(url.protocol));assert.equal(url.hostname,request.context.sourceHost);assert.equal(decodeURIComponent(url.pathname.slice(1)),request.context.sourceDatabase);assert.ok(!url.port||url.port==='5432');assert.equal(url.search,'');
 gate='CODE_IDENTITY';const manifest=JSON.parse(await readFile('/app/source/operator-build.json','utf8'));assert.equal(manifest.sourceSha,request.sourceSha);assert.equal(digest(manifest),request.bundleDigest);
 for(const entry of manifest.files){assert.match(entry.path,/^(?:src|rulesets|deployment\/operator)\/[A-Za-z0-9_./-]+$|^(?:package(?:-lock)?\.json|tsconfig\.json|Dockerfile)$/);assert.ok(!entry.path.split('/').includes('..'));assert.equal(createHash('sha256').update(await readFile('/app/source/'+entry.path)).digest('hex'),entry.sha256);}
 gate='RAILWAY_IDENTITY';await verifyToken(request.context,env.RAILWAY_TOKEN);await verifyDeployment(env.RAILWAY_DEPLOYMENT_ID,request.context,env.RAILWAY_TOKEN,undefined,expectedService(request));gate='SERVICE_POSTURE';await verifyService(request.context,env.RAILWAY_TOKEN,{serviceId:expectedService(request)});
 gate='ENCRYPTION_PREFLIGHT';await encrypt(Buffer.from('kingdom-owner-operator encryption preflight'),request.recipient);
 gate='DATABASE';const {createOperatorDatabase:createDatabase}=await import('../../dist/owner-database.js'),{inspectName,inspectGray,inspectGrayRestore,readOnlyReview,applyOwnerAction,verifyOwnerAction}=await import('../../dist/owner-actions.js'),{installOwnerAudit,assertOperatorRuntime}=await import('../../dist/owner-audit.js');const db=createDatabase(env.DATABASE_URL);
 try{
  let review=null,details,outcome=null,eligible;
  if(request.mode!=='setup'){gate='RUNTIME_PRIVILEGES';await assertOperatorRuntime(db);}
  // Recheck job expiry after provider operations, immediately before DB work.
  assert.ok(Date.parse(request.expiresAt)>Date.now());
  if(request.mode==='setup'){
   gate='AUDIT_SETUP';const counts=(await db.query("SELECT current_schema() AS schema,(SELECT count(*) FROM accounts)::int AS accounts,(SELECT count(*) FROM development_bots)::int AS bots,(SELECT max(name) FROM schema_migrations) AS head")).rows[0];assert.equal(counts.schema,'public');assert.ok(counts.accounts>=451);assert.equal(counts.bots,450);assert.equal(counts.head,'020_game_feel.sql');
   details=await installOwnerAudit(db,{operator:request.owner,sourceSha:request.sourceSha,runId:request.jobId.split('_')[1]},env.KINGDOM_OPERATOR_RUNTIME_PASSWORD);
   const runtimeUrl=new URL(env.DATABASE_URL);runtimeUrl.username=details.runtime;runtimeUrl.password=env.KINGDOM_OPERATOR_RUNTIME_PASSWORD;
   const runtimeDb=createDatabase(runtimeUrl.href);try{await assertOperatorRuntime(runtimeDb);}finally{await runtimeDb.end();}
   outcome=details.installed?'installed':'already-installed';eligible=true;
  }else if(request.mode==='review'){
   gate='READ_ONLY_REVIEW';const read=await readOnlyReview(db,sql=>request.action==='name_correction'?inspectName(sql,request.field==='auto'?undefined:request.field):request.action==='gray_broadcast_restore'?inspectGrayRestore(sql,request.messageId,request.reversesAuthorizationId):inspectGray(sql,request.messageId??undefined));
   review={...read.review,authorization:{id:request.authorizationId,sourceSha:request.sourceSha,...Object.fromEntries(['projectId','environmentId','operatorServiceId','sourceHost','sourceDatabase'].map(k=>[k,request.context[k]])),createdAt:request.createdAt,expiresAt:new Date(Date.parse(request.createdAt)+86400000).toISOString(),operator:request.owner}};
   details=read.details;eligible=read.details.applyEligible;
  }else if(request.mode==='verify'){
   gate='READ_ONLY_VERIFICATION';review=request.review;details=await readOnlyReview(db,sql=>verifyOwnerAction(sql,review));outcome='verified';eligible=true;
  }else{
   gate='EXACT_APPROVED_ACTION';review=request.review;
   const result=await applyOwnerAction(db,{id:request.authorizationId,review,digest:digest(review),operator:request.owner,sourceSha:request.sourceSha,runId:request.jobId.split('_')[1],runAttempt:Number(request.jobId.split('_')[2])});
   outcome=result.applied?'applied':'already-applied';details=result;eligible=true;
  }
  gate='ENCRYPTED_REPORT';const encrypted=await encrypt(Buffer.from(JSON.stringify({protocol,kind:'owner-review-details',review,reviewSha256:review?digest(review):null,eligible,details,outcome,confirmation:review&&eligible?confirmation(review):null},null,2)),request.recipient);
  const report={protocol,kind:'report',jobId:request.jobId,sourceSha:request.sourceSha,bundleDigest:request.bundleDigest,context:request.context,deploymentId:env.RAILWAY_DEPLOYMENT_ID,mode:request.mode,action:request.action,passed:true,review,reviewSha256:review?digest(review):null,eligible,encrypted,outcome};
  checkReport(report,request,env.RAILWAY_DEPLOYMENT_ID);
  console.log(framePrefix+Buffer.from(JSON.stringify(report)).toString('base64url'));
 }finally{await db.end();}
}
main().then(()=>console.log('OWNER_OPERATOR: PASS')).catch(()=>{console.error('OWNER_OPERATOR_'+gate+': FAIL');process.exitCode=1;});
