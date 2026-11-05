import {erasedProfile} from '../src/privacy/minimization.js';
import {humanVictoryLoot} from '../src/human-pvp-loot.js';
import {alpha} from '../src/alpha-rules.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {mkdtemp,rm,readFile,writeFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {transaction} from '../src/db.js';
import {realm,type Player} from './helpers.js';
import {requestAccountDeletion} from '../src/account-safety.js';
import {fulfillErasure,assertErasureFence} from '../src/privacy/erasure.js';
import {sha256,authorize,type SignedRecord} from '../src/privacy/authorization.js';
import {emptyRoot,readJournal} from '../src/privacy/journal.js';
import {registerAccount,createSession,authenticate} from '../src/auth.js';
import {executeCommand} from '../src/commands.js';
import {publicProfile,recruitmentAvailability} from '../src/profiles.js';
import {settleDueAbandonedIncome} from '../src/bot-income.js';
import {listOpponents,getState} from '../src/game.js';
const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({format:'pem',type:'spki'}).toString();
const signed=(payload:unknown):SignedRecord=>{const bytes=Buffer.from(JSON.stringify(payload));return{payload:bytes.toString('base64url'),signature:sign(null,bytes,keys.privateKey).toString('base64url')};};
const codeSha='a'.repeat(40),candidateDigest='d'.repeat(64);
async function fixture(clock?:()=>Date){
 const r=await realm({isolated:true,clock}),directory=await mkdtemp(join(tmpdir(),'erasure-test-'));await chmod(directory,0o700);
 const a=await r.player('Erase Subject'),b=await r.player('Other Warrior');
 const live=(await r.db.query(`SELECT current_database() AS database,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,encode(sha256(convert_to((SELECT system_identifier::text FROM pg_control_system()),'UTF8')),'hex') AS cluster`)).rows[0]!;
 const scope={projectId:randomUUID(),environmentId:randomUUID(),gameServiceId:randomUUID(),database:live.database,clusterDigest:live.cluster};
 const policy=signed({protocol:'kingdom-erasure-policy-v5',policyId:randomUUID(),repository:'catillatio/test',approved:true,approvedAt:new Date().toISOString(),sharedRecords:'pseudonymous-integrity-anchors-until-service-closure',backupRecords:'suppress-on-restore-until-protected-backups-expire',journalRetention:'last-relevant-backup-destruction-plus-30-days',personalData:'erase-login-and-minimize-profile-v1',formerWallet:'sealed-integrity-anchor-no-transfer',sharedRecordClosureGraceDays:30,routineBackupMaximumDays:30,protectedBackupReviewDays:30,erasureLedgerGraceDays:30,scope});
 const request=await requestAccountDeletion(r.db,a.accountId),intent=signed({protocol:'kingdom-erasure-intent-v5',operationId:randomUUID(),accountId:a.accountId,characterId:a.id,requestId:request.id,policyDigest:sha256(policy.payload),sourceScope:scope,personalDataReviewCompleted:true,issuedAt:new Date().toISOString()});
 const permit=async(mode='fulfill')=>{const state=await readJournal(directory,publicKey);return signed({protocol:'kingdom-erasure-execution-v1',mode,operationId:JSON.parse(Buffer.from(intent.payload,'base64url').toString()).operationId,intentDigest:sha256(intent.payload),policyDigest:sha256(policy.payload),journalSequence:state.sequence,journalRoot:state.root,targetDatabase:live.database,targetOid:live.oid,targetClusterDigest:live.cluster,candidateDigest,codeSha,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),externalHoldsCleared:true,restoreGuardInstalled:true,independentRecoveryVerified:true,encryptedBackupSha256:'b'.repeat(64),recoveryEvidenceSha256:'c'.repeat(64),recoveryVerifiedAt:new Date().toISOString()});};
 const options=async(mode='fulfill')=>({enabled:true,publicKey,policy,intent,permit:await permit(mode),journalPath:directory,codeSha,candidateDigest});
 return{r,a,b,directory,policy,intent,options,close:async()=>{await r.close();await rm(directory,{recursive:true,force:true});}};
}
async function finances(r:Awaited<ReturnType<typeof realm>>){return JSON.stringify((await r.db.query(`SELECT (SELECT jsonb_agg(t ORDER BY character_id) FROM wallets t WHERE character_id NOT IN(SELECT character_id FROM abandoned_kingdoms)) AS wallets,(SELECT jsonb_agg(t ORDER BY id) FROM economy_entries t) AS ledger,(SELECT jsonb_agg(t ORDER BY character_id) FROM vault_accounts t WHERE character_id NOT IN(SELECT character_id FROM abandoned_kingdoms)) AS vault,(SELECT jsonb_agg(t ORDER BY id) FROM inventory_entries t WHERE character_id NOT IN(SELECT character_id FROM abandoned_kingdoms)) AS inventory,(SELECT jsonb_agg(t ORDER BY id) FROM land_holdings t WHERE character_id NOT IN(SELECT character_id FROM abandoned_kingdoms)) AS land`)).rows);}

test('signed ordinary fulfillment erases credentials/content, preserves money and report numbers, rejects stale sessions and command replay',async()=>{
 const f=await fixture(),{r,a,b}=f;
 try{
  await r.ok(a,'/api/v1/comments',{profileId:b.id,body:'Personal subject content'});
  await r.ok(b,'/api/v1/comments',{profileId:a.id,body:'Wall personal content'});
  const message=(await r.db.query('SELECT id FROM realm_messages WHERE author_id=$1',[a.id])).rows[0]!.id;
  await r.db.query("INSERT INTO social_reports(id,message_id,reporter_id,reason,created_at) VALUES($1,$2,$3,'spam',now())",[randomUUID(),message,b.id]);
  await r.db.query("INSERT INTO social_moderation(id,message_id,character_id,actor_id,operator_label,action,reason,created_at) VALUES($1,$2,$3,$4,'synthetic','operator_hide','personal text',now())",[randomUUID(),message,a.id,b.id]);
  await r.db.query("INSERT INTO notification_reads(character_id,kind,event_id) VALUES($1,'comment',$2)",[b.id,message]);
  const battleId=randomUUID(),commandId=randomUUID(),result={attackerId:a.id,defenderId:b.id,attackerName:'Erase Subject',defenderName:'Other Warrior',winnerId:a.id,winnerName:'Erase Subject',gold:750,xp:11,attackEquipment:[{id:'sword',name:'Erase Subject'}]};
  await r.db.query(`INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,created_at) VALUES($1,$2,$3,'${alpha.id}','attacker_win',$4,$5,now())`,[battleId,a.id,b.id,{attacker:{id:a.id,name:'Erase Subject',accountId:a.accountId,invitationCode:'PRIVATE-CODE',accountCreatedAt:'1990-01-01',accountAgeDays:100},defender:{id:b.id,name:'Other Warrior'}},result]);
  await r.db.query(`INSERT INTO command_receipts(account_id,command_id,kind,intent_hash,result) VALUES($1,$2,'attack','fixture',$3)`,[b.accountId,commandId,{message:'Erase Subject won the battle.',data:{battle:result}}]);
  const third=await r.player('Third Warrior'),untouched=randomUUID();
  await r.db.query(`INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,created_at) VALUES($1,$2,$3,'${alpha.id}','attacker_win','{}','{}',now())`,[untouched,b.id,third.id]);
  await r.db.query(`CREATE FUNCTION reject_unrelated_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF OLD.id='${untouched}'::uuid THEN RAISE EXCEPTION 'unrelated rewrite'; END IF; RETURN NEW; END$$;CREATE TRIGGER unrelated_battle BEFORE UPDATE ON battles FOR EACH ROW EXECUTE FUNCTION reject_unrelated_rewrite()`);
  const before=await finances(r),username=(await r.db.query('SELECT username FROM accounts WHERE id=$1',[a.accountId])).rows[0]!.username;
  const completed=await fulfillErasure(r.db,await f.options());assert.equal(completed.result,'erased');assert.equal(await finances(r),before);
  assert.equal((await r.db.query('SELECT count(*)::int AS n FROM realm_messages')).rows[0]!.n,0);
  const report=(await r.db.query('SELECT snapshot,result FROM battles WHERE id=$1',[battleId])).rows[0]!;
  assert.equal(report.result.attackerName,'Deleted Warrior');assert.equal(report.result.winnerName,'Deleted Warrior');assert.equal(report.snapshot.attacker.name,'Deleted Warrior');
  assert.equal(report.result.defenderName,'Other Warrior');assert.deepEqual(report.result.attackEquipment,result.attackEquipment);assert.equal(report.snapshot.attacker.accountId,undefined);assert.equal(report.snapshot.attacker.invitationCode,undefined);assert.equal(report.snapshot.attacker.accountCreatedAt,undefined);assert.equal(report.snapshot.attacker.accountAgeDays,undefined);assert.equal(report.result.gold,750);assert.equal(report.result.xp,11);
  const receipt=(await r.db.query('SELECT result FROM command_receipts WHERE command_id=$1',[commandId])).rows[0]!.result;assert.equal(receipt.message,'Action recorded.');assert.equal(receipt.data.battle.attackerName,'Deleted Warrior');
  await assert.rejects(authenticate(r.db,username,'AlphaTest!2026'));
  await assert.rejects(createSession(r.db,a.accountId));await assert.rejects(getState(r.db,a.accountId));await assert.rejects(executeCommand(r.db,a.accountId,randomUUID(),'profile',{className:'Warden'}));
  const revoked=await r.app.inject({url:'/api/v1/me',headers:{cookie:a.cookie}});assert.notEqual(revoked.statusCode,200);assert.equal(revoked.headers['clear-site-data'],undefined,'Expiry/session loss must not erase a safe pending purchase');
  assert.equal((await r.me(b)).name,'Other Warrior');
  const logout=await r.app.inject({method:'POST',url:'/logout',headers:{cookie:b.cookie,origin:'http://localhost:3000'},payload:{csrf:b.csrf}});assert.equal(logout.statusCode,303);assert.equal(logout.headers['clear-site-data'],'"storage", "cache"');
  assert.equal((await r.db.query('SELECT 1 FROM account_deletion_requests WHERE account_id=$1',[a.accountId])).rowCount,0);
  assert.equal((await r.db.query('SELECT 1 FROM accounts WHERE id=$1',[a.accountId])).rowCount,0,'The login account is physically deleted');
  assert.equal((await fulfillErasure(r.db,await f.options())).result,'erased');
  await assertErasureFence(r.db,{required:true,journalPath:f.directory,publicKey});
  const audit=(await r.db.query('SELECT execution_proof FROM account_erasures')).rows[0]!.execution_proof;
  assert.equal(JSON.parse(Buffer.from(audit.payload,'base64url').toString()).encryptedBackupSha256,'b'.repeat(64));
  const durable=JSON.parse(await readFile(join(f.directory,'entry-000000000001.json'),'utf8'));
  assert.ok(durable.policy.signature&&durable.approval.signature,'Original signed policy and execution approval are independently retained');
  await assert.rejects(r.db.query('DELETE FROM account_erasures'),/append-only/);
  await assert.rejects(r.db.query('TRUNCATE account_erasures'),/append-only/);
  assert.equal((await r.db.query("UPDATE accounts SET login_disabled=false WHERE id=$1",[a.accountId])).rowCount,0);
  await assert.rejects(r.db.query("INSERT INTO accounts(id,username,password_hash) VALUES($1,'resurrection','fake')",[a.accountId]),/protected/);
  await assert.rejects(r.db.query("INSERT INTO sessions(token_hash,account_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",['f'.repeat(64),a.accountId,'e'.repeat(64)]),/protected/);
  await assert.rejects(r.db.query("INSERT INTO sound_preferences(character_id,enabled,volume) VALUES($1,true,20)",[a.id]),/protected/);
  await assert.rejects(r.db.query('UPDATE account_erasure_checkpoints SET sequence=2'),/append-only/);
 }finally{await f.close();}
});

test('unapproved policy, disabled execution, forged permit, active escrow and unknown columns stop before journal or account writes',async()=>{
 const f=await fixture(),{r,a}=f;try{
  const original=await finances(r),base=await f.options();
  await assert.rejects(fulfillErasure(r.db,{...base,enabled:false}),/disabled/);
  const payload=JSON.parse(Buffer.from(base.policy.payload,'base64url').toString());payload.approved=false;
  await assert.rejects(fulfillErasure(r.db,{...base,policy:signed(payload)}));
  await assert.rejects(fulfillErasure(r.db,{...base,permit:{...base.permit,signature:'a'.repeat(86)}}));
  const permitPayload=JSON.parse(Buffer.from(base.permit.payload,'base64url').toString());
  for(const change of [{targetOid:'1'},{targetDatabase:'wrong_test'},{targetClusterDigest:'0'.repeat(64)},{codeSha:'f'.repeat(40)},{expiresAt:new Date(Date.now()-1000).toISOString()},{externalHoldsCleared:false}])
   await assert.rejects(fulfillErasure(r.db,{...base,permit:signed({...permitPayload,...change})}));
  await r.db.query('ALTER TABLE accounts ADD COLUMN private_email text');await assert.rejects(fulfillErasure(r.db,base),/Unreviewed privacy schema/);await r.db.query('ALTER TABLE accounts DROP COLUMN private_email');
  await r.db.query(`INSERT INTO bounties(id,sponsor_id,target_id,amount,fee,status,ruleset_id,command_id,created_at,expires_at) VALUES($1,$2,$3,1000,100,'active','${alpha.id}',$4,now(),now()+interval '1 day')`,[randomUUID(),a.id,f.b.id,randomUUID()]);
  await assert.rejects(fulfillErasure(r.db,base),/hold/);
  assert.equal((await readJournal(f.directory,publicKey)).sequence,0);assert.equal(await finances(r),original);assert.equal((await r.db.query('SELECT count(*)::int AS n FROM account_erasures')).rows[0]!.n,0);
 }finally{await f.close();}
});

test('SQL failure rolls back rows but keeps durable intent; fresh approved resume is idempotent and stale approvals fail',async()=>{
 const f=await fixture(),{r,a}=f;try{
  await r.db.query(`CREATE FUNCTION fail_erasure_fixture() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic interruption'; END$$;CREATE TRIGGER erasure_fixture BEFORE DELETE ON accounts FOR EACH ROW EXECUTE FUNCTION fail_erasure_fixture()`);
  const permit=await f.options(),before=await finances(r);await assert.rejects(fulfillErasure(r.db,permit),/synthetic interruption/);
  assert.equal((await readJournal(f.directory,publicKey)).sequence,1);assert.equal((await r.db.query("SELECT 1 FROM abandoned_kingdoms")).rowCount,0,'An interrupted transition leaves no duplicate estate');assert.equal((await r.db.query('SELECT login_disabled FROM accounts WHERE id=$1',[a.accountId])).rows[0]!.login_disabled,false);assert.equal(await finances(r),before);
  await r.db.query('DROP TRIGGER erasure_fixture ON accounts');await assert.rejects(fulfillErasure(r.db,permit));
  await fulfillErasure(r.db,await f.options());assert.equal(await finances(r),before);
  assert.equal((await r.db.query("SELECT count(*)::int AS n FROM abandoned_kingdoms")).rows[0]!.n,0);
  await assert.rejects(assertErasureFence(r.db,{required:false}));
  const path=join(f.directory,'entry-000000000001.json'),bytes=await readFile(path);await writeFile(path,'{}');await assert.rejects(assertErasureFence(r.db,{required:true,journalPath:f.directory,publicKey}));await writeFile(path,bytes);
 }finally{await f.close();}
});

test('exclusive realm lock serializes an already-running command and deletion; stale concurrent commands cannot recreate sessions or spend',async()=>{
 const f=await fixture(),{r,a}=f;try{
  await Promise.all([fulfillErasure(r.db,await f.options()),createSession(r.db,a.accountId).catch(()=>null)]);
  assert.equal((await r.db.query('SELECT count(*)::int AS n FROM sessions WHERE account_id=$1',[a.accountId])).rows[0]!.n,0);
  await assert.rejects(executeCommand(r.db,a.accountId,randomUUID(),'profile',{className:'Warden'}));
 }finally{await f.close();}
});

test('a real custom-format backup restored to an isolated database is blocked until its signed erasure is replayed', {timeout:120000},async()=>{
 const {execFileSync}=await import('node:child_process');const{createDatabase}=await import('../src/db.js');
 const url=new URL(process.env.TEST_DATABASE_URL!),r=await realm(),directory=await mkdtemp(join(tmpdir(),'erasure-restore-test-'));await chmod(directory,0o700);
 assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname.endsWith('_test'));
 const restoredName='privacy_'+randomUUID().replaceAll('-','')+'_test',admin=createDatabase(url.href);let restored:ReturnType<typeof createDatabase>|undefined,created=false;
 const environment={...process.env};for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete environment[name];
 const pgEnv={PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1))};
 function tool(command:string,database:string,input?:Buffer){return execFileSync('docker',['--host=unix:///var/run/docker.sock','run','--rm','-i','--network=host',...Object.keys(pgEnv).flatMap(k=>['--env',k]),'--entrypoint',command,'postgres:18-bookworm',...(command==='pg_dump'?['--format=custom','--no-owner','--no-acl']:['--single-transaction','--exit-on-error','--no-owner','--no-acl','--dbname='+database])],{env:{...environment,...pgEnv,PGDATABASE:database},input,timeout:30000,maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe']});}
 try{
  const a=await r.player('Restored Subject'),b=await r.player('Restored Other');await r.ok(a,'/api/v1/comments',{profileId:b.id,body:'Restorable private text'});
  const request=await requestAccountDeletion(r.db,a.accountId),live=(await r.db.query(`SELECT current_database() AS database,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,encode(sha256(convert_to((SELECT system_identifier::text FROM pg_control_system()),'UTF8')),'hex') AS cluster`)).rows[0]!;
  const scope={projectId:randomUUID(),environmentId:randomUUID(),gameServiceId:randomUUID(),database:live.database,clusterDigest:live.cluster};
  const policy=signed({protocol:'kingdom-erasure-policy-v5',policyId:randomUUID(),repository:'catillatio/test',approved:true,approvedAt:new Date().toISOString(),sharedRecords:'pseudonymous-integrity-anchors-until-service-closure',backupRecords:'suppress-on-restore-until-protected-backups-expire',journalRetention:'last-relevant-backup-destruction-plus-30-days',personalData:'erase-login-and-minimize-profile-v1',formerWallet:'sealed-integrity-anchor-no-transfer',sharedRecordClosureGraceDays:30,routineBackupMaximumDays:30,protectedBackupReviewDays:30,erasureLedgerGraceDays:30,scope});
  const intent=signed({protocol:'kingdom-erasure-intent-v5',operationId:randomUUID(),accountId:a.accountId,characterId:a.id,requestId:request.id,policyDigest:sha256(policy.payload),sourceScope:scope,personalDataReviewCompleted:true,issuedAt:new Date().toISOString()});
  async function options(mode:'fulfill'|'restore',database=live.database,oid=live.oid){
   const state=await readJournal(directory,publicKey);return {enabled:true,publicKey,policy,intent,journalPath:directory,codeSha,candidateDigest,permit:signed({protocol:'kingdom-erasure-execution-v1',mode,operationId:JSON.parse(Buffer.from(intent.payload,'base64url').toString()).operationId,intentDigest:sha256(intent.payload),policyDigest:sha256(policy.payload),journalSequence:state.sequence,journalRoot:state.root,targetDatabase:database,targetOid:oid,targetClusterDigest:live.cluster,candidateDigest,codeSha,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),externalHoldsCleared:true,restoreGuardInstalled:true,independentRecoveryVerified:true,encryptedBackupSha256:'b'.repeat(64),recoveryEvidenceSha256:'c'.repeat(64),recoveryVerifiedAt:new Date().toISOString()})};
  }
  const backup=tool('pg_dump',live.database),archiveDigest=createHash('sha256').update(backup).digest('hex'),before=await finances(r);
  await fulfillErasure(r.db,await options('fulfill'));
  await admin.query('CREATE DATABASE "'+restoredName+'" TEMPLATE template0');created=true;tool('pg_restore',restoredName,backup);
  const restoreUrl=new URL(url);restoreUrl.pathname='/'+restoredName;restored=createDatabase(restoreUrl.href);
  await assert.rejects(assertErasureFence(restored,{required:true,journalPath:directory,publicKey}),/blocked/);
  assert.equal((await restored.query("SELECT count(*)::int AS n FROM abandoned_kingdoms")).rows[0]!.n,0);
  const oid=(await admin.query('SELECT oid::text FROM pg_database WHERE datname=$1',[restoredName])).rows[0]!.oid;
  const approved=await options('restore',restoredName,oid);
  await fulfillErasure(restored,approved);assert.equal((await restored.query("SELECT count(*)::int AS n FROM abandoned_kingdoms")).rows[0]!.n,0);await assertErasureFence(restored,{required:true,journalPath:directory,publicKey});
  assert.equal(JSON.stringify((await restored.query(`SELECT (SELECT jsonb_agg(t ORDER BY character_id) FROM wallets t WHERE character_id NOT IN(SELECT character_id FROM abandoned_kingdoms)) AS wallets,(SELECT jsonb_agg(t ORDER BY id) FROM economy_entries t) AS ledger,(SELECT jsonb_agg(t ORDER BY character_id) FROM vault_accounts t WHERE character_id NOT IN(SELECT character_id FROM abandoned_kingdoms)) AS vault,(SELECT jsonb_agg(t ORDER BY id) FROM inventory_entries t WHERE character_id NOT IN(SELECT character_id FROM abandoned_kingdoms)) AS inventory,(SELECT jsonb_agg(t ORDER BY id) FROM land_holdings t WHERE character_id NOT IN(SELECT character_id FROM abandoned_kingdoms)) AS land`)).rows),before);
  assert.equal((await restored.query('SELECT count(*)::int AS n FROM realm_messages WHERE author_id=$1',[a.id])).rows[0]!.n,0);
  assert.equal(createHash('sha256').update(backup).digest('hex'),archiveDigest,'The original recovery artifact remains immutable');
  assert.equal((await fulfillErasure(restored,await options('restore',restoredName,oid))).result,'erased');
  assert.equal((await restored.query("SELECT count(*)::int AS n FROM abandoned_kingdoms")).rows[0]!.n,0);
  assert.equal((await restored.query('SELECT 1 FROM accounts WHERE id=$1',[a.accountId])).rowCount,0);
 }finally{await restored?.end();if(created)await admin.query('DROP DATABASE "'+restoredName+'"');await admin.end();await r.close();await rm(directory,{recursive:true,force:true});}
});

test('column-restricted non-owner eraser can fulfill but cannot read other password hashes or change money',async()=>{
 const {assertErasureOperator}=await import('../src/privacy/operator.js');const {createDatabase}=await import('../src/db.js');
 const f=await fixture(),{r}=f,role='privacy_'+randomUUID().replaceAll('-','');let operator:ReturnType<typeof createDatabase>|undefined;
 try{
  const schema=(await r.db.query('SELECT current_schema() AS name')).rows[0]!.name;
  await r.db.query('CREATE ROLE '+role+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
  const grants=(await readFile(new URL('../deployment/privacy/ROLE_REVIEW.sql',import.meta.url),'utf8')).replaceAll('kc_account_eraser',role).replaceAll('SCHEMA public','SCHEMA '+schema);
  await r.db.query(grants);const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema+' -c role='+role);operator=createDatabase(url.href);
  await assertErasureOperator(operator,role,schema);await assert.rejects(operator.query('SELECT password_hash FROM accounts'),/permission denied/);await assert.rejects(operator.query('UPDATE wallets SET balance=0'),/permission denied/);
  const shadow=await operator.connect();
  try{await shadow.query('CREATE TEMP TABLE accounts(id uuid,password_hash text,login_disabled boolean)');await shadow.query("INSERT INTO pg_temp.accounts VALUES($1,'!erased',true)",[f.a.accountId]);
   assert.equal((await shadow.query('SELECT account_erasure_credentials_removed($1) AS removed',[f.a.accountId])).rows[0]!.removed,false,'SECURITY DEFINER must read the qualified real account, never a caller temporary table');
  }finally{await shadow.query('DROP TABLE IF EXISTS pg_temp.accounts');shadow.release();}
  await fulfillErasure(operator,await f.options());
  const pinned=await r.db.connect();try{await pinned.query('CREATE TEMP TABLE account_erasures(character_id uuid,account_id uuid)');await assert.rejects(pinned.query("UPDATE characters SET name='Reclaimed' WHERE id=$1",[f.a.id]),/protected/);}finally{await pinned.query('DROP TABLE pg_temp.account_erasures');pinned.release();}
  const attempt=await operator.connect();try{await attempt.query('CREATE TEMP TABLE account_erasures(account_id uuid,character_id uuid)');await assert.rejects(attempt.query('UPDATE accounts SET login_disabled=false WHERE id=$1',[f.a.accountId]),/permission denied/);}
  finally{await attempt.query('DROP TABLE IF EXISTS pg_temp.account_erasures');attempt.release();}
  await r.db.query('GRANT UPDATE ON wallets TO '+role);await assert.rejects(assertErasureOperator(operator,role,schema),/privilege/);
 }finally{await operator?.end();await r.db.query('DROP OWNED BY '+role);await r.db.query('DROP ROLE '+role);await f.close();}
});

test('restore predating account creation records absence without inventing users; missing or partial privacy schema fails closed',async()=>{
 const f=await fixture();let old:Awaited<ReturnType<typeof realm>>|undefined;
 try{
  await fulfillErasure(f.r.db,await f.options());old=await realm({isolated:true});
  await assert.rejects(assertErasureFence(old.db,{required:true,journalPath:f.directory,publicKey}));
  const before=(await old.db.query('SELECT count(*)::int AS n FROM accounts')).rows[0]!.n;
  assert.equal((await fulfillErasure(old.db,await f.options('restore'))).result,'absent_in_restore');
  assert.equal((await old.db.query('SELECT count(*)::int AS n FROM accounts')).rows[0]!.n,before);
  await assertErasureFence(old.db,{required:true,journalPath:f.directory,publicKey});
  await old.db.query('DROP TABLE account_erasure_checkpoints');
  await assert.rejects(assertErasureFence(old.db,{required:true,journalPath:f.directory,publicKey}));
 }finally{await old?.close();await f.close();}
});


test('human deletion has no NPC construction, donor assignment or synchronous creation-timing side effect',async()=>{
 const f=await fixture();try{
  await f.r.prepare(f.a,100000,30);await f.r.ok(f.a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:3});
  await f.r.ok(f.a,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:2});
  const before=await finances(f.r);await fulfillErasure(f.r.db,await f.options());
  assert.equal(await finances(f.r),before);assert.equal((await f.r.db.query('SELECT 1 FROM abandoned_kingdoms')).rowCount,0);
  assert.equal((await f.r.db.query('SELECT 1 FROM graveyard_operations')).rowCount,0);
  await assert.rejects(publicProfile(f.r.db,f.a.id));await assert.rejects(createSession(f.r.db,f.a.accountId));
  await assert.rejects(executeCommand(f.r.db,f.a.accountId,randomUUID(),'profile',{className:'Warden'}));
  const username='replacement_human',replacement=await registerAccount(f.r.db,{username,password:'Replacement!2026',name:'New Human'});
  assert.notEqual(replacement.accountId,f.a.accountId);assert.notEqual(replacement.characterId,f.a.id);
  await fulfillErasure(f.r.db,await f.options());assert.equal((await f.r.db.query('SELECT 1 FROM abandoned_kingdoms')).rowCount,0);
  await assertErasureFence(f.r.db,{required:true,journalPath:f.directory,publicKey});
 }finally{await f.close();}
});

test('personal-data review remains mandatory; population approval cannot authorize deletion',async()=>{
 const f=await fixture();try{
  const base=await f.options(),intent=JSON.parse(Buffer.from(base.intent.payload,'base64url').toString()),policy=JSON.parse(Buffer.from(base.policy.payload,'base64url').toString());
  await assert.rejects(fulfillErasure(f.r.db,{...base,intent:signed({...intent,personalDataReviewCompleted:false})}));
  await assert.rejects(fulfillErasure(f.r.db,{...base,policy:signed({...policy,protocol:'kingdom-erasure-policy-v3'})}));
  await assert.rejects(fulfillErasure(f.r.db,{...base,policy:signed({...policy,protocol:'kingdom-erasure-policy-v1'})}));
  assert.equal((await readJournal(f.directory,publicKey)).sequence,0);
  assert.equal((await f.r.db.query("SELECT 1 FROM abandoned_kingdoms")).rowCount,0);
 }finally{await f.close();}
});


test('high-level deletion erases personal progress without inheriting a distinctive player configuration',async()=>{
 for(const level of [50,75,100]){
  const f=await fixture();try{
   await f.r.db.query('UPDATE characters SET attained_level=$2,xp=123456,level_xp=7,max_health=703,health=351,attack_training=4,defense_training=5 WHERE id=$1',[f.a.id,level]);
   await fulfillErasure(f.r.db,await f.options());const {migrate}=await import('../src/migrate.js');await migrate(f.r.db);
   const minimized=(await f.r.db.query('SELECT * FROM characters WHERE id=$1',[f.a.id])).rows[0]!;
   for(const [key,value] of Object.entries(erasedProfile)){if(typeof value==='string'&&value.startsWith('1970-'))assert.equal(new Date(minimized[key]).toISOString(),value);else assert.equal(minimized[key],value);}
   await assert.rejects(f.r.db.query('UPDATE characters SET attained_level=75 WHERE id=$1',[f.a.id]),/protected/);
   assert.equal((await f.r.db.query('SELECT 1 FROM abandoned_kingdoms')).rowCount,0);
   assert.equal((await f.r.db.query('SELECT 1 FROM accounts WHERE id=$1',[f.a.accountId])).rowCount,0);
   assert.equal((await f.r.db.query('SELECT 1 FROM progression_awards WHERE character_id=$1',[f.a.id])).rowCount,0);
   await assert.rejects(publicProfile(f.r.db,f.a.id));await assertErasureFence(f.r.db,{required:true,journalPath:f.directory,publicKey});
  }finally{await f.close();}
 }
});

test('installing the disabled graveyard registry preserves complete existing character rows and rejects unclassified accountless identities',async()=>{
 const {createDatabase}=await import('../src/db.js');const {migrate}=await import('../src/migrate.js');
 const admin=createDatabase(process.env.TEST_DATABASE_URL!),schema='privacy_migration_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);
 let db:ReturnType<typeof createDatabase>|undefined;
 try{
  await admin.query('CREATE SCHEMA '+schema);db=createDatabase(url.href);
  await migrate(db,{through:'027_play_account_safety.sql'});
  const human=await registerAccount(db,{username:'migration_subject',password:'Synthetic!2026',name:'Original Subject'});
  const tables=['accounts','characters','wallets','inventory_entries','land_holdings','economy_entries','economy_transactions'];
  const snapshot=async()=>{const value:Record<string,unknown>={};for(const table of tables)value[table]=(await db!.query('SELECT row_to_json(t)::text AS row FROM '+table+' t ORDER BY row_to_json(t)::text')).rows;return value;};
  const before=await snapshot();await migrate(db);assert.deepEqual(await snapshot(),before,'No identity column/default may change existing full-row data');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM abandoned_kingdoms')).rows[0]!.n,0);
  await migrate(db);assert.deepEqual(await snapshot(),before,'Replay must remain exact');
  await assert.rejects(db.query("INSERT INTO characters(id,account_id,name) VALUES($1,NULL,'Orphan')",[randomUUID()]),/Invalid accountless identity/);
  await assert.rejects(transaction(db,async sql=>{
   const batch=randomUUID();
   await sql.query("INSERT INTO graveyard_operations(id,catalog_id,definition_digest,policy_record,approval_record,population_before,previous_operations,slots,members) VALUES($1,'alpha-0.3',$2,'{}','{}',0,0,ARRAY[0],$3)",[batch,'a'.repeat(64),[randomUUID()]]);
   await sql.query("INSERT INTO abandoned_kingdoms(character_id,operation_id,slot,template_id,garrison) VALUES($1,$2,0,'invalid-human',1)",[human.characterId,batch]);
  }),/Invalid accountless identity/);
  assert.equal((await db.query('SELECT 1 FROM graveyard_operations')).rowCount,0);
  assert.equal((await db.query('SELECT 1 FROM abandoned_kingdoms')).rowCount,0);
 }finally{await db?.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});
