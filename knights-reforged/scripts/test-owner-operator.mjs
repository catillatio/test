// Isolated synthetic Docker/PostgreSQL test. No Railway calls, token or live DB.
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync,createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {createDatabase} from '../dist/db.js';
import {migrate} from '../dist/migrate.js';
import {provisionBots} from '../dist/development.js';
import {bundle} from '../deployment/operator/controller.mjs';
import {protocol,signedRequest,checkReport,framePrefix,confirmation,setupConfirmation,nameTarget,grayTarget,digest} from '../deployment/operator/protocol.mjs';
assert.ok(!process.env.RAILWAY_TOKEN&&!process.env.RAILWAY_API_TOKEN&&!process.env.DATABASE_URL,'Run synthetic container tests without production credentials.');
const image=process.env.KINGDOM_OPERATOR_TEST_IMAGE??'kingdom-come:owner-operator-test';
const suffix=randomUUID().slice(0,8),network='owner-test-'+suffix,postgres='owner-pg-'+suffix,root=resolve('.');
const temp=await mkdtemp(join(tmpdir(),'owner-test-')),cleanEnv={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete cleanEnv[key];
function command(binary,args,{env=cleanEnv,allowFail=false}={}){return new Promise((resolve,reject)=>{const p=spawn(binary,args,{env,stdio:['ignore','pipe','pipe']}),parts=[],errors=[];let size=0,errorSize=0;p.stdout.on('data',b=>{size+=b.length;if(size>200000){p.kill();reject(new Error('Fixture output exceeded limit'));}else parts.push(b);});p.stderr.on('data',b=>{errorSize+=b.length;if(errorSize>200000){p.kill();reject(new Error('Fixture error output exceeded limit'));}else errors.push(b);});p.on('error',()=>reject(new Error('Fixture process failed')));p.on('close',code=>code===0||allowFail?resolve({code,out:Buffer.concat(parts).toString(),err:Buffer.concat(errors).toString()}):reject(new Error('Fixture command failed')));});}
const docker=(args,options)=>command('docker',['--host=unix:///var/run/docker.sock',...args],options);
let db;const checks=[];
const sourceSha='f'.repeat(40),context={projectId:randomUUID(),environmentId:randomUUID(),gameServiceId:randomUUID(),pgServiceId:randomUUID(),releaseServiceId:randomUUID(),verifyPgServiceId:randomUUID(),operatorServiceId:randomUUID(),sourceHost:'operator-source.railway.internal',sourceDatabase:'owner_operator_test'};
const keys=generateKeyPairSync('ed25519'),privateKey=keys.privateKey.export({type:'pkcs8',format:'pem'}),publicKey=keys.publicKey.export({type:'spki',format:'pem'});
async function snapshots(){const out={};for(const {table_name:t} of(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows){assert.match(t,/^[a-z_]+$/);const rows=(await db.query('SELECT row_to_json(t)::text row FROM '+t+' t')).rows.map(x=>x.row).sort();out[t]=createHash('sha256').update(JSON.stringify(rows)).digest('hex');}return out;}
try{
 const built=await bundle(temp,sourceSha);
 if(process.env.KINGDOM_OPERATOR_SKIP_BUILD!=='1'){
  const buildArgs=process.env.KINGDOM_OPERATOR_TEST_NODE_IMAGE?['--build-arg','NODE_IMAGE='+process.env.KINGDOM_OPERATOR_TEST_NODE_IMAGE]:[];
  await docker(['build','--build-arg','HTTP_PROXY','--build-arg','HTTPS_PROXY','--build-arg','NO_PROXY',...buildArgs,'-t',image,built.destination]);
 }
 console.log('PASS dedicated operator image built or explicitly supplied locally');
 await docker(['network','create',network]);await docker(['run','-d','--name',postgres,'--network',network,'--network-alias',context.sourceHost,'-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB='+context.sourceDatabase,'-p','127.0.0.1::5432','postgres:18-bookworm']);
 const port=(await docker(['inspect','--format','{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',postgres])).out.trim();assert.match(port,/^\d+$/);
 const url='postgresql://postgres@127.0.0.1:'+port+'/'+context.sourceDatabase;db=createDatabase(url);
 let connected=false;for(let i=0;i<60;i++){try{await db.query('SELECT 1');connected=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}assert.ok(connected);
 await migrate(db);await provisionBots(db,{nodeEnv:'test',allowProvisioning:true});await migrate(db);
 const account=randomUUID(),grayAccount=randomUUID(),knightAccount=randomUUID(),knight=randomUUID(),grayMessage=randomUUID(),unrelated=randomUUID(),alreadyRemoved=randomUUID();
 for(const [a,id,username,name] of [[account,nameTarget,'mosslikesbbc','Moss of the Vale'],[grayAccount,grayTarget,'gray','Gray'],[knightAccount,knight,'fixture_knight','Development Knight']]){await db.query("INSERT INTO accounts(id,username,password_hash) VALUES($1,$2,'synthetic-non-login-hash')",[a,username]);await db.query('INSERT INTO characters(id,account_id,name) VALUES($1,$2,$3)',[id,a,name]);await db.query('INSERT INTO wallets(character_id,balance) VALUES($1,10000)',[id]);}
 const body=String.fromCharCode(70,97,103);
 for(const [id,author,text,status] of [[grayMessage,grayTarget,body,'visible'],[unrelated,grayTarget,'Unrelated fixture','visible'],[alreadyRemoved,knight,'Previously removed fixture','hidden']])await db.query("INSERT INTO realm_messages(id,author_id,channel,body,status,command_id,ruleset_id,created_at) VALUES($1,$2,'broadcast',$3,$4,$5,'community-0.1',clock_timestamp())",[id,author,text,status,randomUUID()]);
 const identity=(await docker(['run','--rm','--network','none','--entrypoint','age-keygen',image])).out;assert.ok(identity.includes('AGE-SECRET-KEY-'));await writeFile(join(temp,'owner.agekey'),identity,{mode:0o600});
 const recipient=(await docker(['run','--rm','--network','none','--user','0','--mount','type=bind,src='+join(temp,'owner.agekey')+',dst=/owner.agekey,readonly','--entrypoint','age-keygen',image,'-y','/owner.agekey'])).out.trim();
 function request(mode='review',action='name_correction',review=null){const now=new Date();return {protocol,kind:'request',mode,action,jobId:'op_123_1_'+randomUUID().replaceAll('-',''),authorizationId:review?.authorization.id??randomUUID(),sourceSha,bundleDigest:built.digest,context,owner:'catillatio',createdAt:now.toISOString(),expiresAt:new Date(+now+900000).toISOString(),recipient,field:review?.field??(action==='gray_broadcast_hide'?'message_status':'auto'),messageId:review?.messageId??null,review,confirmation:mode==='setup'?setupConfirmation(context,sourceSha):mode==='apply'?confirmation(review):null};}
 async function job(r,overrides={},expectFailure=false){
  const deploymentId=randomUUID(),variables={NODE_ENV:'production',KINGDOM_OPERATOR_WORKER:'1',KINGDOM_PRIVATE_ALPHA:'1',RAILWAY_PROJECT_ID:context.projectId,RAILWAY_ENVIRONMENT_ID:context.environmentId,RAILWAY_SERVICE_ID:context.operatorServiceId,RAILWAY_DEPLOYMENT_ID:deploymentId,RAILWAY_TOKEN:'synthetic-token',DATABASE_URL:'postgresql://postgres@'+context.sourceHost+'/'+context.sourceDatabase,KINGDOM_OPERATOR_VERIFY_KEY:publicKey,KINGDOM_OPERATOR_REQUEST:signedRequest(r,privateKey),...overrides};
  const result=await docker(['run','--rm','--network',network,'--mount','type=bind,src='+join(root,'scripts/fixtures/owner-worker-harness.mjs')+',dst=/fixture.mjs,readonly',...Object.keys(variables).flatMap(k=>['--env',k]),'--entrypoint','node',image,'/fixture.mjs'],{env:{...cleanEnv,...variables},allowFail:true});
  if(expectFailure){assert.notEqual(result.code,0);assert.equal(result.out,'');assert.match(result.err,/^OWNER_OPERATOR_[A-Z_]+: FAIL\n$/);return result.err;}
  assert.equal(result.code,0,'Synthetic private worker must succeed');const frames=result.out.split('\n').filter(l=>l.startsWith(framePrefix));assert.equal(frames.length,1);return checkReport(JSON.parse(Buffer.from(frames[0].slice(framePrefix.length),'base64url').toString()),r,deploymentId);
 }
 const before=await snapshots(),nameReview=await job(request());assert.equal(nameReview.review.field,'account_username');assert.deepEqual(await snapshots(),before,'Review must not alter any table');
 const missing=await job(request('apply','name_correction',nameReview.review),{},true);assert.match(missing,/EXACT_APPROVED_ACTION/);assert.deepEqual(await snapshots(),before);
 const setup=request('setup','audit_setup');await job(setup);const installed=await snapshots();for(const t of Object.keys(before))assert.equal(installed[t],before[t],t);assert.equal(Object.keys(installed).length,Object.keys(before).length+2);
 assert.equal((await job(request('setup','audit_setup'))).outcome,'already-installed');assert.deepEqual(await snapshots(),installed);
 const concurrent=await Promise.all([job(request('apply','name_correction',nameReview.review)),job(request('apply','name_correction',nameReview.review))]);assert.deepEqual(concurrent.map(r=>r.outcome).sort(),['already-applied','applied']);
 const afterName=await snapshots();for(const t of Object.keys(installed))if(!['accounts','owner_operator_actions'].includes(t))assert.equal(afterName[t],installed[t],t);assert.equal((await db.query('SELECT username FROM accounts WHERE id=$1',[account])).rows[0].username,'mosslikesbb');
 const verifyName=await job(request('verify','name_correction',nameReview.review));assert.equal(verifyName.outcome,'verified');assert.deepEqual(await snapshots(),afterName);
 const messagesBefore=(await db.query('SELECT row_to_json(m) AS row FROM realm_messages m ORDER BY id')).rows.map(x=>x.row);
 const grayReview=await job(request('review','gray_broadcast_hide'));assert.equal(grayReview.review.messageId,grayMessage);await job(request('apply','gray_broadcast_hide',grayReview.review));await job(request('verify','gray_broadcast_hide',grayReview.review));
 assert.equal((await db.query('SELECT status FROM realm_messages WHERE id=$1',[grayMessage])).rows[0].status,'hidden');assert.equal((await db.query('SELECT status FROM realm_messages WHERE id=$1',[unrelated])).rows[0].status,'visible');assert.equal((await db.query('SELECT count(*)::int n FROM social_moderation WHERE message_id=$1',[alreadyRemoved])).rows[0].n,0);
 const afterGray=await snapshots();for(const t of Object.keys(afterName))if(!['realm_messages','social_moderation','owner_operator_actions'].includes(t))assert.equal(afterGray[t],afterName[t],t);
 assert.equal(digest((await db.query('SELECT row_to_json(m) AS row FROM realm_messages m ORDER BY id')).rows.map(x=>x.row)),digest(messagesBefore.map(m=>m.id===grayMessage?{...m,status:'hidden'}:m)));
 const ageFile=join(temp,'review.age');await writeFile(ageFile,Buffer.from(grayReview.encrypted,'base64'),{mode:0o600});
 const decrypted=(await docker(['run','--rm','--network','none','--user','0','--mount','type=bind,src='+temp+',dst=/review,readonly','--entrypoint','age',image,'--decrypt','--identity','/review/owner.agekey','/review/review.age'])).out;const details=JSON.parse(decrypted);assert.equal(details.details.body,body);assert.equal(details.confirmation,confirmation(grayReview.review));
 const stable=await snapshots();const failure=await job(request('verify','name_correction',nameReview.review),{FIXTURE_METADATA_FAIL:'1'},true);assert.match(failure,/RAILWAY_IDENTITY/);assert.deepEqual(await snapshots(),stable);
 assert.equal((await db.query('SELECT count(*)::int n FROM development_bots')).rows[0].n,450);assert.equal((await db.query('SELECT count(*)::int n FROM owner_operator_actions')).rows[0].n,2);assert.equal((await db.query('SELECT max(name) AS head FROM schema_migrations')).rows[0].head,'020_game_feel.sql');
 await docker(['exec',postgres,'pg_dump','-U','postgres','--format=custom','--no-owner','--no-acl','--file=/tmp/owner-fixture.dump',context.sourceDatabase]);await docker(['exec',postgres,'createdb','-U','postgres','owner_restored_test']);await docker(['exec',postgres,'pg_restore','-U','postgres','--single-transaction','--exit-on-error','--no-owner','--no-acl','--dbname=owner_restored_test','/tmp/owner-fixture.dump']);
 const restored=createDatabase(url.replace('/'+context.sourceDatabase,'/owner_restored_test'));try{assert.equal((await restored.query('SELECT count(*)::int n FROM owner_operator_actions')).rows[0].n,2);assert.equal((await restored.query('SELECT count(*)::int n FROM development_bots')).rows[0].n,450);await assert.rejects(restored.query('DELETE FROM owner_operator_actions'));}finally{await restored.end();}
 checks.push('Private image, actual age encryption/decryption and exact owner confirmation','Read-only inspection before audit setup leaves every table unchanged','Explicit isolated setup/replay preserves game schema head 020 and every business row','Two concurrent private workers correct the name exactly once','Gray-only audited hide and read-only post-verification; Development Knight untouched','Authenticated metadata denial fails before DB mutation','450 bots preserved and both operator audit records restore with append-only protections');
 await mkdir('test-results',{recursive:true});await writeFile('test-results/owner-operator-container.json',JSON.stringify({passed:true,checks,bots:450,operatorReceipts:2,gameSchemaHead:'020_game_feel.sql',actualRailwayOperations:0,productionAccessed:false},null,2)+'\n');for(const c of checks)console.log('PASS '+c);
}finally{if(db)await db.end();await docker(['rm','-f',postgres],{allowFail:true});await docker(['network','rm',network],{allowFail:true});await rm(temp,{recursive:true,force:true});}
