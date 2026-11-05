import test from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {realm} from './helpers.js';import {createDatabase,transaction} from '../src/db.js';
import {sha256,type SignedRecord} from '../src/privacy/authorization.js';
import {constructGraveyard,graveyardCapacity,assertGraveyardReceipts,assertGraveyardFence} from '../src/privacy/graveyard.js';
import {graveyardRoster,graveyardWorld,graveyardDefinitionDigest,graveyardTemplate,replenishmentSlots} from '../src/privacy/graveyard-roster.js';
import {authorizeConstruction} from '../src/privacy/graveyard-authorization.js';import {assertGraveyardOperator} from '../src/privacy/operator.js';
import {publicProfile} from '../src/profiles.js';import {getState,listOpponents} from '../src/game.js';import {createSession} from '../src/auth.js';import {executeCommand} from '../src/commands.js';
import {settleDueAbandonedIncome} from '../src/bot-income.js';import {humanVictoryLoot} from '../src/human-pvp-loot.js';
import {contentCatalog} from '../src/expansion-content.js';import {resolveArmyCapacity} from '../src/compatibility-rules.js';
import {setup,publicKey,codeSha,candidateDigest,signed} from './graveyard-fixture.js';

test('public independent population covers rival bands with bounded modest Land endowments and no personal inputs',()=>{
 for(const id of ['alpha-0.3','level100-content-1']){
  const roster=graveyardRoster(id),c=contentCatalog(id);assert.equal(roster.length,24);assert.ok(Object.isFrozen(roster));
  for(let level=1;level<=(id==='alpha-0.3'?50:100);level++)assert.ok(roster.slice(0,12).some(t=>Math.abs(t.level-level)<=Math.min(Math.max(2,Math.ceil(level*.2)),Math.max(2,Math.ceil(t.level*.2)))));
  assert.equal(roster.slice(0,12).reduce((n,t)=>{const p=c.properties.find(p=>p.id===t.property.id)!;assert.ok(p.level<=t.level);return n+(p.hourlyIncome-p.hourlyUpkeep)*t.property.quantity;},0),594);
  for(const t of roster){assert.ok(t.garrison<=resolveArmyCapacity(t.level,1,id==='alpha-0.3'?'army-legacy-1':'army-five-per-level-1'));assert.equal(t.equipment.length,3);}
  assert.ok(!/accountId|donor|username|sourceId|issuedAt|createdAt|deletion|cohort|holdDays/.test(JSON.stringify(roster)));
 }
 assert.deepEqual(graveyardWorld.recommended,{targetPopulation:12,maximumPopulation:12,maximumNewPerOperation:6});assert.equal(graveyardWorld.startingGold,0);
 assert.throws(()=>graveyardTemplate('alpha-0.3',96));assert.throws(()=>replenishmentSlots([],97,6));assert.throws(()=>graveyardRoster('unreviewed'));
});

test('zero-deletion construction needs its own fresh population approval; caps, exact vacant slots and malformed proofs fail closed',async()=>{
 const f=await setup();try{
  const original=await f.options();assert.equal((await f.r.db.query('SELECT 1 FROM account_erasures')).rowCount,0);
  await assert.rejects(constructGraveyard(f.r.db,{...original,enabled:false}),/disabled/);
  const v=JSON.parse(Buffer.from(original.permit.payload,'base64url').toString());
  for(const delta of [{targetOid:'1'},{catalogId:'level100-content-1'},{expectedPopulation:1},{expectedOperationCount:1},{slots:[1,2,3,4,5,6]},{slots:[0,0]},{expectedErasureCount:0},{creditCutoff:new Date().toISOString()},{sourceErasureFenceVerified:true},{donorAccountId:randomUUID()},{expiresAt:new Date(Date.now()-1000).toISOString()}])await assert.rejects(constructGraveyard(f.r.db,{...original,permit:signed({...v,...delta})}));
  for(const config of [{targetPopulation:13},{maximumPopulation:97},{maximumNewPerOperation:13}]){
   const p=JSON.parse(Buffer.from(original.policy.payload,'base64url').toString()),policy=signed({...p,...config});
   assert.throws(()=>authorizeConstruction(policy,signed({...v,policyDigest:sha256(policy.payload)}),publicKey));
  }
  assert.throws(()=>authorizeConstruction(original.policy,{...original.permit,signature:'a'.repeat(86)},publicKey));
  const p=JSON.parse(Buffer.from(original.policy.payload,'base64url').toString());assert.throws(()=>authorizeConstruction(signed({...p,protocol:'kingdom-erasure-policy-v5'}),original.permit,publicKey));
  assert.equal((await f.r.db.query('SELECT 1 FROM graveyard_operations')).rowCount,0);
  await constructGraveyard(f.r.db,original);assert.equal((await graveyardCapacity(f.r.db)).world_count,6);
  assert.equal((await f.r.db.query('SELECT 1 FROM account_erasures')).rowCount,0);
 }finally{await f.close();}
});

test('restricted constructor preserves old accounts/finances; concurrent replenishment cannot exceed the configured cap or reset permanent NPCs',async()=>{
 const f=await setup(),role='graveyard_'+randomUUID().replaceAll('-','');let builder:ReturnType<typeof createDatabase>|undefined;
 try{
  const schema=(await f.r.db.query('SELECT current_schema() AS s')).rows[0]!.s;
  await f.r.db.query('CREATE ROLE '+role+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
  const grants=(await readFile(new URL('../deployment/privacy/GRAVEYARD_ROLE_REVIEW.sql',import.meta.url),'utf8')).replaceAll('kc_graveyard_builder',role).replaceAll('SCHEMA public','SCHEMA '+schema);await f.r.db.query(grants);
  const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema+' -c role='+role);builder=createDatabase(url.href);await assertGraveyardOperator(builder,role,schema);
  for(const table of ['accounts','characters','wallets','inventory_entries','land_holdings','account_erasures'])await assert.rejects(builder.query('SELECT * FROM '+table),/permission denied/);
  await assert.rejects(builder.query('SELECT detach_erased_identity($1,$2)',[randomUUID(),randomUUID()]),/permission denied/);
  const old=async()=>JSON.stringify((await f.r.db.query("SELECT (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM accounts t) AS accounts,(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM characters t WHERE id NOT IN(SELECT character_id FROM abandoned_kingdoms)) AS characters,(SELECT jsonb_agg(to_jsonb(t) ORDER BY character_id) FROM wallets t WHERE character_id NOT IN(SELECT character_id FROM abandoned_kingdoms)) AS wallets,(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM economy_entries t) AS ledger")).rows);
  const before=await old(),first=await f.options();assert.equal((await constructGraveyard(builder,first)).count,6);
  assert.equal((await constructGraveyard(builder,first)).result,'already_recorded');
  const competing=await Promise.all([f.options(),f.options()]),results=await Promise.allSettled(competing.map(o=>constructGraveyard(builder!,o)));
  assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.equal(results.filter(v=>v.status==='rejected').length,1);
  assert.equal(await old(),before);const state=await graveyardCapacity(builder);assert.equal(state.world_count,12);assert.equal(state.operation_count,2);
  assert.deepEqual(replenishmentSlots(state.occupied_slots,12,6),[]);await assert.rejects(constructGraveyard(builder,await f.options()));
  await assert.rejects(constructGraveyard(builder,await f.options({targetPopulation:6,maximumPopulation:6})));
  assert.equal((await graveyardCapacity(builder)).world_count,12,'Reducing a target never deletes or replaces existing kingdoms');
  const bytes=JSON.stringify(state.operations);assert.ok(!bytes.includes(f.actor.id)&&!bytes.includes(f.actor.accountId));assert.ok(!/erasure|journal|cohort|cutoff|carry|deleted/i.test(bytes));
  await assertGraveyardReceipts(builder,publicKey,f.scope);
  await assert.rejects(f.r.db.query('DELETE FROM graveyard_operations'),/append-only/);await assert.rejects(f.r.db.query('TRUNCATE abandoned_kingdoms'),/append-only/);
  const id=(await f.r.db.query('SELECT character_id FROM abandoned_kingdoms WHERE slot=0')).rows[0]!.character_id;
  await assert.rejects(transaction(f.r.db,async sql=>{await sql.query('UPDATE characters SET attack_training=attack_training+1 WHERE id=$1',[id]);await assertGraveyardReceipts(sql,publicKey,f.scope);}),/Expected values/);
  await assertGraveyardFence(f.r.db,{publicKey});await assert.rejects(assertGraveyardFence(f.r.db,{}),/blocked/);
  await f.r.db.query('GRANT SELECT ON characters TO '+role);await assert.rejects(assertGraveyardOperator(builder,role,schema),/must not access/);
 }finally{await builder?.end();await f.r.db.query('DROP OWNED BY '+role);await f.r.db.query('DROP ROLE '+role);await f.close();}
});

test('interruption, schema drift and financial side effects roll back; real income, battles and replay never replenish the population',async()=>{
 const f=await setup();try{
  const original=await f.options();await f.r.db.query('ALTER TABLE characters ADD COLUMN unknown_private text');
  await assert.rejects(constructGraveyard(f.r.db,original),/Unreviewed privacy schema/);await f.r.db.query('ALTER TABLE characters DROP COLUMN unknown_private');
  await f.r.db.query("CREATE FUNCTION interrupt_graveyard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.name='Abandoned Kingdom' AND NEW.attained_level=10 THEN RAISE EXCEPTION 'synthetic interruption'; END IF; RETURN NEW; END$$;CREATE TRIGGER interrupt_world BEFORE INSERT ON characters FOR EACH ROW EXECUTE FUNCTION interrupt_graveyard()");
  await assert.rejects(constructGraveyard(f.r.db,original),/synthetic interruption/);assert.equal((await graveyardCapacity(f.r.db)).world_count,0);await f.r.db.query('DROP TRIGGER interrupt_world ON characters');
  const saved=(await f.r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[f.actor.id])).rows[0]!.balance;
  await f.r.db.query(`CREATE FUNCTION unexpected_financial_side_effect() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE wallets SET balance=balance+1 WHERE character_id='${f.actor.id}'::uuid; RETURN NEW; END$$;CREATE TRIGGER corrupt_world AFTER INSERT ON abandoned_kingdoms FOR EACH ROW EXECUTE FUNCTION unexpected_financial_side_effect()`);
  await assert.rejects(constructGraveyard(f.r.db,original),/preservation mismatch/);assert.equal((await f.r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[f.actor.id])).rows[0]!.balance,saved);assert.equal((await graveyardCapacity(f.r.db)).operation_count,0);await f.r.db.query('DROP TRIGGER corrupt_world ON abandoned_kingdoms');
  await constructGraveyard(f.r.db,original);const npc=(await f.r.db.query('SELECT k.character_id AS id,i.next_payment_at FROM abandoned_kingdoms k JOIN income_cycles i ON i.character_id=k.character_id WHERE k.slot=0')).rows[0]!;
  const profile=await publicProfile(f.r.db,npc.id);assert.equal(profile.abandonedKingdom,true);assert.equal(profile.temporaryRival,false);assert.ok((await listOpponents(f.r.db,f.actor.id)).opponents.some(o=>o.id===npc.id));
  await assert.rejects(createSession(f.r.db,npc.id));await assert.rejects(getState(f.r.db,npc.id));await assert.rejects(executeCommand(f.r.db,f.actor.accountId,randomUUID(),'invite',{targetCharacterId:npc.id}),/battles only|battles/);
  f.advance(new Date(+new Date(npc.next_payment_at)+23*3600000+10));const sweep=await Promise.all([settleDueAbandonedIncome(f.r.db),settleDueAbandonedIncome(f.r.db)]);assert.equal(sweep.reduce((n,s)=>n+s.settled,0),6);
  assert.equal((await f.r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[npc.id])).rows[0]!.balance,profile.economy.netHourlyIncome*24);
  await f.r.prepare(f.actor,10000);await f.r.legacyArmy(f.actor,20);await f.r.ok(f.actor,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:20});
  const total=async()=>BigInt((await f.r.db.query('SELECT sum(balance)::text AS n FROM wallets')).rows[0]!.n)+BigInt((await f.r.db.query('SELECT coalesce(sum(pending_gold),0)::text AS n FROM land_accounts')).rows[0]!.n);
  for(let victory=1;victory<=4;victory++){
   f.advance(new Date(+new Date(npc.next_payment_at)+23*3600000+10+(victory-1)*180000));
   const carried=(await f.r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[npc.id])).rows[0]!.balance,before=await total(),key=randomUUID();
   const hit=await f.r.ok(f.actor,'/api/v1/battles',{targetCharacterId:npc.id},key),report=(await f.r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result;
   assert.equal(report.outcome,'attacker_win');assert.equal(report.loot,humanVictoryLoot(carried,victory).amount);assert.equal(await total(),before);
   await f.r.ok(f.actor,'/api/v1/battles',{targetCharacterId:npc.id},key);assert.equal(await total(),before);
  }
  assert.equal((await graveyardCapacity(f.r.db)).world_count,6);assert.equal((await graveyardCapacity(f.r.db)).operation_count,1);await assertGraveyardFence(f.r.db,{publicKey});
 }finally{await f.close();}
});

test('expanded public population reaches level 100 with modest actual Land income and does not create development bots',async()=>{
 const f=await setup();try{
  const {syntheticCutover}=await import('./level100-e2b-fixture.js');await syntheticCutover(f.r.db,false);await f.populate();
  const highId=(await f.r.db.query('SELECT character_id FROM abandoned_kingdoms WHERE slot=11')).rows[0]!.character_id,profile=await publicProfile(f.r.db,highId);
  assert.equal(profile.level,100);assert.equal(profile.army.participants,200);assert.equal(profile.economy.netHourlyIncome,55);
  const next=(await f.r.db.query('SELECT max(next_payment_at) AS at FROM income_cycles WHERE character_id IN(SELECT character_id FROM abandoned_kingdoms)')).rows[0]!.at;
  f.advance(new Date(+new Date(next)+1));assert.equal((await settleDueAbandonedIncome(f.r.db)).settled,12);
  assert.equal((await f.r.db.query('SELECT sum(w.balance)::text AS gold FROM wallets w JOIN abandoned_kingdoms k ON k.character_id=w.character_id')).rows[0]!.gold,'594');
  assert.equal((await f.r.db.query('SELECT 1 FROM development_bots')).rowCount,0);await assertGraveyardFence(f.r.db,{publicKey});
 }finally{await f.close();}
});

test('independent population backups restore without duplication; world verification never requires a personal suppression journal', {timeout:120000},async()=>{
 const {execFileSync}=await import('node:child_process'),{createHash}=await import('node:crypto');
 const f=await setup(),url=new URL(process.env.TEST_DATABASE_URL!),admin=createDatabase(url.href),copies:{name:string;db:ReturnType<typeof createDatabase>}[]=[];
 const schema=(await f.r.db.query('SELECT current_schema() AS s')).rows[0]!.s;
 const env={...process.env};for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[k];
 const pgEnv={PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1))};
 function tool(command:string,database:string,input?:Buffer){return execFileSync('docker',['--host=unix:///var/run/docker.sock','run','--rm','-i','--network=host',...Object.keys(pgEnv).flatMap(k=>['--env',k]),'--entrypoint',command,'postgres:18-bookworm',...(command==='pg_dump'?['--format=custom','--no-owner','--no-acl']:['--single-transaction','--exit-on-error','--no-owner','--no-acl','--dbname='+database])],{env:{...env,...pgEnv,PGDATABASE:database},input,timeout:30000,maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe']});}
 try{
  const before=tool('pg_dump',pgEnv.PGDATABASE),request=await f.options();await constructGraveyard(f.r.db,request);const after=tool('pg_dump',pgEnv.PGDATABASE);
  const hashes=[before,after].map(b=>createHash('sha256').update(b).digest('hex'));
  for(const [index,archive] of [before,after].entries()){
   const name='graveyard_'+randomUUID().replaceAll('-','')+'_restore_test';await admin.query('CREATE DATABASE "'+name+'" TEMPLATE template0');
   const target=new URL(url);target.pathname='/'+name;target.searchParams.set('options','-c search_path='+schema);const db=createDatabase(target.href);copies.push({name,db});tool('pg_restore',name,archive);
   await assertGraveyardFence(db,index===0?{}:{publicKey});
   const {assertErasureFence}=await import('../src/privacy/erasure.js');await assertErasureFence(db,{required:false});
   assert.equal((await db.query('SELECT count(*)::int AS n FROM abandoned_kingdoms')).rows[0]!.n,index===0?0:6);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM graveyard_operations')).rows[0]!.n,index===0?0:1);
   await assert.rejects(constructGraveyard(db,request),'The source permit cannot authorize construction in a recovery-copy database');
  }
  await assert.rejects(assertGraveyardFence(copies[1]!.db,{}),/blocked/);
  const wrong=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString();
  await assert.rejects(assertGraveyardFence(copies[1]!.db,{publicKey:wrong}),/blocked/);
  await assertGraveyardFence(copies[1]!.db,{publicKey});
  assert.deepEqual([before,after].map(b=>createHash('sha256').update(b).digest('hex')),hashes,'Original archives remain immutable');
 }finally{for(const copy of copies){await copy.db.end();await admin.query('DROP DATABASE "'+copy.name+'"');}await admin.end();await f.close();}
});

test('real account fulfillment neither triggers nor counts toward population management; separate keys and restore fences remain independent',async()=>{
 const {mkdtemp,chmod,rm,writeFile}=await import('node:fs/promises'),{join}=await import('node:path'),{tmpdir}=await import('node:os');
 const {requestAccountDeletion}=await import('../src/account-safety.js'),{fulfillErasure,assertErasureFence}=await import('../src/privacy/erasure.js');
 const f=await setup(),dir=await mkdtemp(join(tmpdir(),'independent-erasure-'));await chmod(dir,0o700);
 const eraseKeys=generateKeyPairSync('ed25519'),erasePublic=eraseKeys.publicKey.export({type:'spki',format:'pem'}).toString();
 const erasureSigned=(v:unknown)=>{const b=Buffer.from(JSON.stringify(v));return {payload:b.toString('base64url'),signature:sign(null,b,eraseKeys.privateKey).toString('base64url')};};
 try{
  await f.populate();const worldBefore=await graveyardCapacity(f.r.db),now=new Date().toISOString();
  const policy=erasureSigned({protocol:'kingdom-erasure-policy-v5',policyId:randomUUID(),repository:'catillatio/test',approved:true,approvedAt:now,scope:f.scope,sharedRecords:'pseudonymous-integrity-anchors-until-service-closure',backupRecords:'suppress-on-restore-until-protected-backups-expire',journalRetention:'last-relevant-backup-destruction-plus-30-days',personalData:'erase-login-and-minimize-profile-v1',formerWallet:'sealed-integrity-anchor-no-transfer',sharedRecordClosureGraceDays:30,routineBackupMaximumDays:30,protectedBackupReviewDays:30,erasureLedgerGraceDays:30});
  const request=await requestAccountDeletion(f.r.db,f.actor.accountId),operationId=randomUUID(),intent=erasureSigned({protocol:'kingdom-erasure-intent-v5',operationId,accountId:f.actor.accountId,characterId:f.actor.id,requestId:request.id,policyDigest:sha256(policy.payload),sourceScope:f.scope,issuedAt:now,personalDataReviewCompleted:true});
  const {emptyRoot}=await import('../src/privacy/journal.js');
  const permit=erasureSigned({protocol:'kingdom-erasure-execution-v1',mode:'fulfill',operationId,intentDigest:sha256(intent.payload),policyDigest:sha256(policy.payload),journalSequence:0,journalRoot:emptyRoot,targetDatabase:f.live.database,targetOid:f.live.oid,targetClusterDigest:f.live.cluster,candidateDigest,codeSha,issuedAt:now,expiresAt:new Date(Date.now()+600000).toISOString(),externalHoldsCleared:true,restoreGuardInstalled:true,independentRecoveryVerified:true,encryptedBackupSha256:'c'.repeat(64),recoveryEvidenceSha256:'d'.repeat(64),recoveryVerifiedAt:now});
  await fulfillErasure(f.r.db,{enabled:true,codeSha,candidateDigest,publicKey:erasePublic,journalPath:dir,policy,intent,permit});
  assert.equal((await f.r.db.query('SELECT 1 FROM accounts WHERE id=$1',[f.actor.accountId])).rowCount,0);
  assert.deepEqual(await graveyardCapacity(f.r.db),worldBefore,'Erasure has no population state, credit, schedule or operation side effects');
  await assertErasureFence(f.r.db,{required:true,journalPath:dir,publicKey:erasePublic});await assertGraveyardFence(f.r.db,{publicKey});
  const path=join(dir,'entry-000000000001.json'),bytes=await readFile(path);await writeFile(path,'{}');
  await assert.rejects(assertErasureFence(f.r.db,{required:true,journalPath:dir,publicKey:erasePublic}),/blocked/);
  await assertGraveyardFence(f.r.db,{publicKey});await writeFile(path,bytes);await assertErasureFence(f.r.db,{required:true,journalPath:dir,publicKey:erasePublic});
 }finally{await f.close();await rm(dir,{recursive:true,force:true});}
});
