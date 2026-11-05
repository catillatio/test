import test from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {mkdtemp,chmod,rm,readFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {realm} from './helpers.js';import {createDatabase,transaction} from '../src/db.js';
import {sha256,type SignedRecord} from '../src/privacy/authorization.js';import {readJournal,appendIntent} from '../src/privacy/journal.js';
import {assertErasureFence} from '../src/privacy/erasure.js';
import {constructGraveyard,graveyardCapacity,assertGraveyardReceipts} from '../src/privacy/graveyard.js';
import {graveyardRoster,graveyardWorld,graveyardDefinitionDigest} from '../src/privacy/graveyard-roster.js';
import {authorizeConstruction} from '../src/privacy/graveyard-authorization.js';import {assertGraveyardOperator} from '../src/privacy/operator.js';
import {publicProfile} from '../src/profiles.js';import {getState,listOpponents} from '../src/game.js';import {createSession} from '../src/auth.js';import {executeCommand} from '../src/commands.js';
import {settleDueAbandonedIncome} from '../src/bot-income.js';import {humanVictoryLoot} from '../src/human-pvp-loot.js';
import {contentCatalog} from '../src/expansion-content.js';import {resolveArmyCapacity} from '../src/compatibility-rules.js';
const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({format:'pem',type:'spki'}).toString(),codeSha='a'.repeat(40),candidateDigest='b'.repeat(64);
const signed=(value:unknown):SignedRecord=>{const bytes=Buffer.from(JSON.stringify(value));return {payload:bytes.toString('base64url'),signature:sign(null,bytes,keys.privateKey).toString('base64url')};};
async function setup(){
 let now=new Date();const r=await realm({isolated:true,clock:()=>now}),directory=await mkdtemp(join(tmpdir(),'public-graveyard-'));await chmod(directory,0o700);
 const actor=await r.player('Synthetic Hunter'),live=(await r.db.query(`SELECT current_database() AS database,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,encode(sha256(convert_to((SELECT system_identifier::text FROM pg_control_system()),'UTF8')),'hex') AS cluster`)).rows[0]!;
 const scope={projectId:randomUUID(),environmentId:randomUUID(),gameServiceId:randomUUID(),database:live.database,clusterDigest:live.cluster};
 const policy=signed({protocol:'kingdom-erasure-policy-v3',policyId:randomUUID(),repository:'catillatio/test',approved:true,approvedAt:new Date(Date.now()-10*86400000).toISOString(),sharedRecords:'pseudonymous-integrity-anchors-until-service-closure',backupRecords:'suppress-on-restore-until-protected-backups-expire',journalRetention:'last-relevant-backup-destruction-plus-30-days',personalData:'delete-human-account-at-fulfillment',graveyard:'independent-public-roster-v1',worldStatePrivacyReview:'approved',minimumGraveyardCohort:24,minimumGraveyardHoldDays:7,formerWallet:'sealed-integrity-anchor-no-transfer',sharedRecordClosureGraceDays:30,routineBackupMaximumDays:30,protectedBackupReviewDays:30,erasureLedgerGraceDays:30,scope});
 const subjects:string[]=[];
 // Explicitly synthetic prior erasures, built only in this owned fixture. Signed
 // old approvals, immutable receipts, real private journal and full fence agree.
 // No production evidence is reconstructed or edited to bypass the hold.
 async function cohort(n:number,ageDays=8){
  for(let i=0;i<n;i++){
   const state=await readJournal(directory,publicKey),at=new Date(Date.now()-ageDays*86400000),accountId=randomUUID(),characterId=randomUUID(),requestId=randomUUID(),operationId=randomUUID();subjects.push(characterId,accountId);
   const intent=signed({protocol:'kingdom-erasure-intent-v3',operationId,accountId,characterId,requestId,policyDigest:sha256(policy.payload),sourceScope:scope,issuedAt:at.toISOString(),personalDataReviewCompleted:true});
   const permit=signed({protocol:'kingdom-erasure-execution-v1',mode:'fulfill',operationId,intentDigest:sha256(intent.payload),policyDigest:sha256(policy.payload),journalSequence:state.sequence,journalRoot:state.root,targetDatabase:live.database,targetOid:live.oid,targetClusterDigest:live.cluster,codeSha,candidateDigest,issuedAt:at.toISOString(),expiresAt:new Date(+at+600000).toISOString(),externalHoldsCleared:true,restoreGuardInstalled:true,independentRecoveryVerified:true,encryptedBackupSha256:'c'.repeat(64),recoveryEvidenceSha256:'d'.repeat(64),recoveryVerifiedAt:at.toISOString()});
   const next=await appendIntent(directory,publicKey,intent,policy,permit,state);
   await transaction(r.db,async sql=>{
    await sql.query("INSERT INTO characters(id,account_id,name,attained_level,max_health,health,attack_training,defense_training,created_at) VALUES($1,NULL,'Deleted Warrior',$2,703,351,$3,$3,$4)",[characterId,1+(i*17)%100,i%12,new Date(+at-86400000)]);
    await sql.query('INSERT INTO wallets(character_id,balance) VALUES($1,$2)',[characterId,1000+i*73]);await sql.query('INSERT INTO vault_accounts(character_id,balance) VALUES($1,$2)',[characterId,300+i]);
    await sql.query("INSERT INTO account_erasures(operation_id,account_id,character_id,request_id,intent_sha256,policy_id,execution_proof,source_scope_sha256,outcome,completed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'erased',$9)",[operationId,accountId,characterId,requestId,sha256(intent.payload),JSON.parse(Buffer.from(policy.payload,'base64url').toString()).policyId,permit,sha256(JSON.stringify(scope)),new Date(+at+1000)]);
    await sql.query('INSERT INTO account_erasure_checkpoints(sequence,root_sha256,source_scope_sha256) VALUES($1,$2,$3)',[next.sequence,next.root,sha256(JSON.stringify(scope))]);
   },{expansionLock:'exclusive'});
  }
  await assertErasureFence(r.db,{required:true,journalPath:directory,publicKey});
 }
 async function options(batchId=randomUUID()){
  const state=await graveyardCapacity(r.db);return {enabled:true,publicKey,policy,codeSha,candidateDigest,permit:signed({protocol:'kingdom-graveyard-construction-v1',batchId,policyDigest:sha256(policy.payload),definitionDigest:graveyardDefinitionDigest(),catalogId:state.catalog_id,sourceScope:scope,codeSha,candidateDigest,targetDatabase:live.database,targetOid:live.oid,targetClusterDigest:live.cluster,expectedMatureDeletions:state.mature_count,expectedBatchCount:state.batch_count,expectedErasureCount:state.receipt_count,creditCutoff:new Date(state.credit_cutoff).toISOString(),sourceErasureFenceVerified:true,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),externalHoldsCleared:true,restoreGuardInstalled:true,independentRecoveryVerified:true,encryptedBackupSha256:'e'.repeat(64),recoveryEvidenceSha256:'f'.repeat(64),recoveryVerifiedAt:new Date().toISOString()})};
 }
 return {r,actor,directory,scope,policy,subjects,cohort,options,advance:(at:Date)=>{now=at;},close:async()=>{await r.close();await rm(directory,{recursive:true,force:true});}};
}

test('public standardized rosters cover playable levels and meaningful strength/income ranges without a donor/profile input',()=>{
 for(const catalogId of ['alpha-0.3','level100-content-1']){
  const roster=graveyardRoster(catalogId),catalog=contentCatalog(catalogId);
  assert.equal(roster.length,24);assert.equal(roster[0]!.level,1);assert.equal(roster.at(-1)!.level,catalogId==='alpha-0.3'?50:100);
  assert.ok(new Set(roster.map(t=>t.garrison)).size>8);assert.ok(Object.isFrozen(roster));
  for(let level=1;level<=(catalogId==='alpha-0.3'?50:100);level++)assert.ok(roster.some(t=>Math.abs(t.level-level)<=Math.min(Math.max(2,Math.ceil(level*.2)),Math.max(2,Math.ceil(t.level*.2)))),'Every playable rival band remains covered');
  for(const t of roster){assert.ok(t.garrison<=resolveArmyCapacity(t.level,1,catalogId==='alpha-0.3'?'army-legacy-1':'army-five-per-level-1'));assert.ok(catalog.properties.find(p=>p.id===t.property.id)!.hourlyIncome>0);assert.equal(t.equipment.length,3);}
  const encoded=JSON.stringify(roster);assert.ok(!/accountId|donor|username|sourceId|issuedAt|createdAt|seed/.test(encoded));
 }
 assert.throws(()=>graveyardRoster('unreviewed'));assert.equal(graveyardWorld.startingGold,0);
});

test('less than 24 mature deletions, recent completions, disabled execution and stale/forged approvals cannot construct NPCs',async()=>{
 const f=await setup();try{
  await f.cohort(23);const original=await f.options();await assert.rejects(constructGraveyard(f.r.db,{...original,enabled:false}),/disabled/);
  await assert.rejects(constructGraveyard(f.r.db,original),/cohort/);await f.cohort(1,0);
  assert.equal((await graveyardCapacity(f.r.db)).receipt_count,24);assert.equal((await graveyardCapacity(f.r.db)).mature_count,23);
  const v=await f.options(),decoded=JSON.parse(Buffer.from(v.permit.payload,'base64url').toString());
  await assert.rejects(constructGraveyard(f.r.db,v),/cohort/);
  for(const delta of [{targetOid:'1'},{catalogId:'level100-content-1'},{expectedMatureDeletions:24},{expectedErasureCount:25},{sourceErasureFenceVerified:false},{donorAccountId:randomUUID()},{expiresAt:new Date(Date.now()-1000).toISOString()}])await assert.rejects(constructGraveyard(f.r.db,{...v,permit:signed({...decoded,...delta})}));
  assert.throws(()=>authorizeConstruction(v.policy,{...v.permit,signature:'a'.repeat(86)},publicKey));
  assert.equal((await f.r.db.query('SELECT 1 FROM graveyard_batches')).rowCount,0);assert.equal((await f.r.db.query('SELECT 1 FROM abandoned_kingdoms')).rowCount,0);
 }finally{await f.close();}
});

test('a separate no-table-access constructor builds one delayed public roster, preserves all old finances and cannot erase or identify players',async()=>{
 const f=await setup(),role='graveyard_'+randomUUID().replaceAll('-','');let builder:ReturnType<typeof createDatabase>|undefined;
 try{
  await f.cohort(48);const schema=(await f.r.db.query('SELECT current_schema() AS s')).rows[0]!.s;
  await f.r.db.query('CREATE ROLE '+role+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
  const grants=(await readFile(new URL('../deployment/privacy/GRAVEYARD_ROLE_REVIEW.sql',import.meta.url),'utf8')).replaceAll('kc_graveyard_builder',role).replaceAll('SCHEMA public','SCHEMA '+schema);await f.r.db.query(grants);
  const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema+' -c role='+role+' -c timezone=America/New_York');builder=createDatabase(url.href);await assertGraveyardOperator(builder,role,schema);
  for(const table of ['accounts','characters','wallets','inventory_entries','land_holdings','account_erasures'])await assert.rejects(builder.query('SELECT * FROM '+table),/permission denied/);
  await assert.rejects(builder.query('SELECT detach_erased_identity($1,$2)',[randomUUID(),randomUUID()]),/permission denied/);
  const before=JSON.stringify((await f.r.db.query("SELECT (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM characters t) AS characters,(SELECT jsonb_agg(to_jsonb(t) ORDER BY character_id) FROM wallets t) AS wallets,(SELECT jsonb_agg(to_jsonb(t) ORDER BY character_id) FROM vault_accounts t) AS vault,(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM economy_entries t) AS ledger")).rows);
  const total=async()=>BigInt((await f.r.db.query('SELECT sum(balance)::text AS n FROM wallets')).rows[0]!.n),money=await total(),options=await f.options();
  assert.equal((await constructGraveyard(builder,options)).result,'constructed');assert.equal(await total(),money);
  const after=JSON.stringify((await f.r.db.query("SELECT (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM characters t WHERE id NOT IN(SELECT character_id FROM abandoned_kingdoms)) AS characters,(SELECT jsonb_agg(to_jsonb(t) ORDER BY character_id) FROM wallets t WHERE character_id NOT IN(SELECT character_id FROM abandoned_kingdoms)) AS wallets,(SELECT jsonb_agg(to_jsonb(t) ORDER BY character_id) FROM vault_accounts t WHERE character_id NOT IN(SELECT character_id FROM abandoned_kingdoms)) AS vault,(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM economy_entries t) AS ledger")).rows);assert.equal(after,before);
  const entities=(await f.r.db.query('SELECT c.*,k.template_id FROM abandoned_kingdoms k JOIN characters c ON c.id=k.character_id ORDER BY k.slot')).rows;
  assert.equal(entities.length,24);const roster=graveyardRoster('alpha-0.3');
  for(let i=0;i<24;i++){const n=entities[i]!;assert.equal(n.account_id,null);assert.equal(n.name,'Abandoned Kingdom');assert.equal(n.attained_level,roster[i]!.level);assert.equal(n.max_health,roster[i]!.health);assert.ok(!f.subjects.includes(n.id));assert.notEqual(n.max_health,703);}
  const receipt=(await f.r.db.query('SELECT * FROM graveyard_batches')).rows[0]!,permit=JSON.parse(Buffer.from(receipt.approval_record.payload,'base64url').toString());
  for(const key of ['accountId','characterId','operationId','intent','journalPath','journalRoot','donor'])assert.equal(permit[key],undefined);
  assert.ok(f.subjects.every(id=>!JSON.stringify(receipt).includes(id)));
  assert.ok((await f.r.db.query("SELECT min(extract(epoch FROM b.created_at-e.completed_at)) AS delay FROM graveyard_batches b CROSS JOIN account_erasures e")).rows[0]!.delay>=7*86400);
  assert.equal((await constructGraveyard(builder,options)).result,'already_recorded');assert.equal((await f.r.db.query('SELECT count(*)::int AS n FROM abandoned_kingdoms')).rows[0]!.n,24);
  const carried=await graveyardCapacity(builder);assert.equal(carried.mature_count,24);
  assert.equal(carried.batches[0].carry_after,24);
  await assertGraveyardReceipts(builder,publicKey,f.scope);
  const competing=await Promise.all([f.options(),f.options()]);
  const attempts=await Promise.allSettled(competing.map(o=>constructGraveyard(builder!,o)));
  assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1,'One batch may consume the remaining credits');
  assert.equal(attempts.filter(a=>a.status==='rejected').length,1,'The competing approval must fail closed');
  const spent=await graveyardCapacity(builder);assert.equal(spent.mature_count,0);
  assert.equal(spent.batches[1].carry_after,0);assert.equal(spent.world_count,48);
  assert.equal(spent.batches[1].credit_cutoff,spent.batches[0].credit_cutoff);
  await assertGraveyardReceipts(builder,publicKey,f.scope);
  await assert.rejects(constructGraveyard(builder,await f.options()),/cohort/);
  await assert.rejects(f.r.db.query('DELETE FROM graveyard_batches'),/append-only/);await assert.rejects(f.r.db.query('TRUNCATE abandoned_kingdoms'),/append-only/);
  await assertErasureFence(f.r.db,{required:true,journalPath:f.directory,publicKey});
  await assert.rejects(transaction(f.r.db,async sql=>{
   await sql.query('UPDATE characters SET attack_training=attack_training+1 WHERE id=$1',[entities[0]!.id]);
   await assertGraveyardReceipts(sql,publicKey,f.scope);
  }),/Expected values to be strictly equal/);
  await assertGraveyardReceipts(builder,publicKey,f.scope);
  await f.r.db.query('GRANT SELECT ON characters TO '+role);await assert.rejects(assertGraveyardOperator(builder,role,schema),/must not access/);
 }finally{await builder?.end();await f.r.db.query('DROP OWNED BY '+role);await f.r.db.query('DROP ROLE '+role);await f.close();}
});

test('interruptions roll back the entire cohort and immutable audit; successful NPCs earn real Land income and obey existing attack/replay rules',async()=>{
 const f=await setup();try{
  await f.cohort(24);
  await f.r.db.query("CREATE FUNCTION interrupt_graveyard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.name='Abandoned Kingdom' AND NEW.attained_level=10 THEN RAISE EXCEPTION 'synthetic interruption'; END IF; RETURN NEW; END$$;CREATE TRIGGER interrupt_world BEFORE INSERT ON characters FOR EACH ROW EXECUTE FUNCTION interrupt_graveyard()");
  const request=await f.options();await assert.rejects(constructGraveyard(f.r.db,request),/synthetic interruption/);
  assert.equal((await f.r.db.query('SELECT 1 FROM graveyard_batches')).rowCount,0);assert.equal((await f.r.db.query('SELECT 1 FROM abandoned_kingdoms')).rowCount,0);
  await f.r.db.query('DROP TRIGGER interrupt_world ON characters');
  const saved=(await f.r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[f.actor.id])).rows[0]!.balance;
  await f.r.db.query(`CREATE FUNCTION unexpected_financial_side_effect() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE wallets SET balance=balance+1 WHERE character_id='${f.actor.id}'::uuid; RETURN NEW; END$$;CREATE TRIGGER corrupt_world AFTER INSERT ON abandoned_kingdoms FOR EACH ROW EXECUTE FUNCTION unexpected_financial_side_effect()`);
  await assert.rejects(constructGraveyard(f.r.db,await f.options()),/preservation mismatch/);
  assert.equal((await f.r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[f.actor.id])).rows[0]!.balance,saved);
  assert.equal((await f.r.db.query('SELECT 1 FROM graveyard_batches')).rowCount,0);
  await f.r.db.query('DROP TRIGGER corrupt_world ON abandoned_kingdoms');await constructGraveyard(f.r.db,await f.options());
  const npc=(await f.r.db.query('SELECT k.character_id AS id,i.next_payment_at FROM abandoned_kingdoms k JOIN income_cycles i ON i.character_id=k.character_id WHERE k.slot=0')).rows[0]!;
  const profile=await publicProfile(f.r.db,npc.id);assert.equal(profile.abandonedKingdom,true);assert.equal(profile.temporaryRival,false);assert.equal(profile.accountAgeDays,0);
  assert.ok((await listOpponents(f.r.db,f.actor.id)).opponents.some(o=>o.id===npc.id));
  await assert.rejects(createSession(f.r.db,npc.id));await assert.rejects(getState(f.r.db,npc.id));await assert.rejects(executeCommand(f.r.db,f.actor.accountId,randomUUID(),'invite',{targetCharacterId:npc.id}),/battles only/);
  const page=await f.r.app.inject({url:'/game/players/'+npc.id,headers:{cookie:f.actor.cookie}});assert.equal(page.statusCode,200);assert.match(page.body,/permanent NPC/);assert.ok(!page.body.includes('action="/game/army/invite"'));
  f.advance(new Date(+new Date(npc.next_payment_at)+10));const sweep=await Promise.all([settleDueAbandonedIncome(f.r.db),settleDueAbandonedIncome(f.r.db)]);assert.equal(sweep.reduce((n,s)=>n+s.settled,0),24);
  const wallet=(await f.r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[npc.id])).rows[0]!.balance;assert.equal(wallet,profile.economy.netHourlyIncome);
  await f.r.prepare(f.actor,10000);await f.r.legacyArmy(f.actor,20);await f.r.ok(f.actor,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:20});
  const total=async()=>BigInt((await f.r.db.query('SELECT sum(balance)::text AS n FROM wallets')).rows[0]!.n)+BigInt((await f.r.db.query('SELECT coalesce(sum(pending_gold),0)::text AS n FROM land_accounts')).rows[0]!.n);
  for(let victory=1;victory<=4;victory++){
   if(victory>1)f.advance(new Date(+new Date(npc.next_payment_at)+10+(victory-1)*180000));
   const carried=(await f.r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[npc.id])).rows[0]!.balance,before=await total(),key=randomUUID();
   const hit=await f.r.ok(f.actor,'/api/v1/battles',{targetCharacterId:npc.id},key),report=(await f.r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result;
   assert.equal(report.outcome,'attacker_win');assert.equal(report.loot,humanVictoryLoot(carried,victory).amount);assert.equal(report.abandonedKingdom,true);assert.equal(report.temporaryRival,false);assert.equal(await total(),before);
   await f.r.ok(f.actor,'/api/v1/battles',{targetCharacterId:npc.id},key);assert.equal(await total(),before);
  }
  await assertErasureFence(f.r.db,{required:true,journalPath:f.directory,publicKey});
 }finally{await f.close();}
});

test('expanded-world construction uses the independent level-100 public roster and its actual catalog income envelope',async()=>{
 const f=await setup();try{
  const {syntheticCutover}=await import('./level100-e2b-fixture.js');await syntheticCutover(f.r.db,false);
  await f.cohort(24);const options=await f.options();await constructGraveyard(f.r.db,options);
  const worlds=(await f.r.db.query('SELECT c.id,c.attained_level,k.garrison,i.next_payment_at FROM abandoned_kingdoms k JOIN characters c ON c.id=k.character_id JOIN income_cycles i ON i.character_id=c.id ORDER BY k.slot')).rows;
  assert.equal(worlds.length,24);assert.equal(worlds.at(-1)!.attained_level,100);assert.equal(worlds.at(-1)!.garrison,500);
  const high=await publicProfile(f.r.db,worlds.at(-1)!.id);assert.equal(high.army.participants,500);assert.equal(high.economy.netHourlyIncome,133200);
  assert.equal(high.abandonedKingdom,true);assert.equal(high.temporaryRival,false);
  f.advance(new Date(+new Date(worlds[0]!.next_payment_at)+1));assert.equal((await settleDueAbandonedIncome(f.r.db)).settled,24);
  const total=(await f.r.db.query('SELECT sum(w.balance)::text AS gold FROM wallets w JOIN abandoned_kingdoms k ON k.character_id=w.character_id')).rows[0]!.gold;
  assert.equal(total,'442576','Only actual future public-catalog Land income is credited');
  assert.equal((await f.r.db.query('SELECT count(*)::int AS n FROM development_bots')).rows[0]!.n,0);
  await assertErasureFence(f.r.db,{required:true,journalPath:f.directory,publicKey});
 }finally{await f.close();}
});

test('real backups before/after a cohort restore without minting successors; missing private erasure evidence fences both copies', {timeout:120000},async()=>{
 const {execFileSync}=await import('node:child_process'),{createHash}=await import('node:crypto'),{writeFile}=await import('node:fs/promises');
 const f=await setup(),url=new URL(process.env.TEST_DATABASE_URL!),admin=createDatabase(url.href),copies:{name:string;db:ReturnType<typeof createDatabase>}[]=[];
 const schema=(await f.r.db.query('SELECT current_schema() AS s')).rows[0]!.s;
 const env={...process.env};for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[k];
 const pgEnv={PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1))};
 function tool(command:string,database:string,input?:Buffer){return execFileSync('docker',['--host=unix:///var/run/docker.sock','run','--rm','-i','--network=host',...Object.keys(pgEnv).flatMap(k=>['--env',k]),'--entrypoint',command,'postgres:18-bookworm',...(command==='pg_dump'?['--format=custom','--no-owner','--no-acl']:['--single-transaction','--exit-on-error','--no-owner','--no-acl','--dbname='+database])],{env:{...env,...pgEnv,PGDATABASE:database},input,timeout:30000,maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe']});}
 try{
  await f.cohort(24);const before=tool('pg_dump',pgEnv.PGDATABASE),request=await f.options();await constructGraveyard(f.r.db,request);const after=tool('pg_dump',pgEnv.PGDATABASE);
  const hashes=[before,after].map(b=>createHash('sha256').update(b).digest('hex'));
  for(const [index,archive] of [before,after].entries()){
   const name='graveyard_'+randomUUID().replaceAll('-','')+'_restore_test';await admin.query('CREATE DATABASE "'+name+'" TEMPLATE template0');
   const target=new URL(url);target.pathname='/'+name;target.searchParams.set('options','-c search_path='+schema);const db=createDatabase(target.href);copies.push({name,db});tool('pg_restore',name,archive);
   await assertErasureFence(db,{required:true,journalPath:f.directory,publicKey});
   assert.equal((await db.query('SELECT count(*)::int AS n FROM abandoned_kingdoms')).rows[0]!.n,index===0?0:24);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM graveyard_batches')).rows[0]!.n,index===0?0:1);
   await assert.rejects(constructGraveyard(db,request),'The source permit cannot authorize construction in a recovery-copy database');
  }
  const path=join(f.directory,'entry-000000000001.json'),bytes=await readFile(path);await writeFile(path,'{}');
  for(const copy of copies)await assert.rejects(assertErasureFence(copy.db,{required:true,journalPath:f.directory,publicKey}),/blocked/);
  await writeFile(path,bytes);for(const copy of copies)await assertErasureFence(copy.db,{required:true,journalPath:f.directory,publicKey});
  assert.deepEqual([before,after].map(b=>createHash('sha256').update(b).digest('hex')),hashes,'Original archives remain immutable');
 }finally{for(const copy of copies){await copy.db.end();await admin.query('DROP DATABASE "'+copy.name+'"');}await admin.end();await f.close();}
});
