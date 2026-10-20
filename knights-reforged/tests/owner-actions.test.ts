import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {realm,testDatabaseUrl,type Player} from './helpers.js';
import {hashPassword,createSession,authenticate} from '../src/auth.js';
import {rules} from '../src/rules.js';
import {provisionBots} from '../src/development.js';
import {migrate} from '../src/migrate.js';
import {createDatabase} from '../src/db.js';
import {installOwnerAudit,assertOwnerAudit,assertOperatorRuntime,operatorRoles} from '../src/owner-audit.js';
import {inspectName,inspectGray,inspectGrayRestore,verifyOwnerAction,readOnlyReview,applyOwnerAction,reviewDigest,nameTarget,grayTarget,oldName,newName,type OwnerAuthorization,type TargetReview} from '../src/owner-actions.js';
type Realm=Awaited<ReturnType<typeof realm>>;
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
const now=new Date('2026-10-20T21:00:00Z');
const setup={operator:'catillatio',sourceSha:'a'.repeat(40),runId:'123'};
async function finishOperatorRealm(r:Realm){
 const password=randomBytes(32).toString('base64url'),installed=await installOwnerAudit(r.db,setup,password);
 const schema=String((await r.db.query('SELECT current_schema() AS name')).rows[0]!.name),url=new URL(testDatabaseUrl!);url.username=installed.runtime;url.password=password;url.searchParams.set('options','-c search_path='+schema);
 const runtimeDb=createDatabase(url.href);await assertOperatorRuntime(runtimeDb);
 return {...r,runtimeDb,close:async()=>{await runtimeDb.end();await r.close();const admin=createDatabase(testDatabaseUrl!);try{for(const role of[installed.runtime,installed.owner]){await admin.query('DROP OWNED BY '+role);await admin.query('DROP ROLE '+role);}}finally{await admin.end();}}};
}
async function operatorRealm(options:Parameters<typeof realm>[0]){return finishOperatorRealm(await realm(options));}
async function target(r:Realm,id:string,username:string,name:string):Promise<Player>{
 const accountId=randomUUID();await r.db.query('INSERT INTO accounts(id,username,password_hash) VALUES($1,$2,$3)',[accountId,username,await hashPassword('OperatorFixture!2026')]);
 await r.db.query('INSERT INTO characters(id,account_id,name) VALUES($1,$2,$3)',[id,accountId,name]);await r.db.query('INSERT INTO wallets(character_id,balance) VALUES($1,0)',[id]);await r.db.query('INSERT INTO army_stacks(character_id,unit_definition_id,quantity) VALUES($1,$2,0)',[id,rules.unit.id]);
 const s=await createSession(r.db,accountId);return {id,accountId,cookie:'kr_session='+s.token,csrf:s.session.csrf_token};
}
function approval(review:TargetReview,id=randomUUID()):OwnerAuthorization{
 const context={id,sourceSha:'a'.repeat(40),projectId:randomUUID(),environmentId:randomUUID(),operatorServiceId:randomUUID(),sourceHost:'realm.railway.internal',sourceDatabase:'railway',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),operator:'catillatio'};
 const approved={...review,authorization:context};return {id,review:approved,digest:reviewDigest(approved),operator:'catillatio',sourceSha:context.sourceSha,runId:'123',runAttempt:1};
}
async function snapshot(r:Realm){
 const out:Record<string,string>={};for(const {table_name:t} of(await r.db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows){assert.match(t,/^[a-z_]+$/);const rows=(await r.db.query('SELECT row_to_json(t)::text row FROM '+t+' t')).rows.map(x=>x.row).sort();out[t]=digest(JSON.stringify(rows));}return out;
}
async function message(r:Realm,author:string,body:string,status='visible'){
 const id=randomUUID();await r.db.query("INSERT INTO realm_messages(id,author_id,channel,body,status,ruleset_id,command_id,created_at) VALUES($1,$2,'broadcast',$3,$4,'community-0.1',$5,$6)",[id,author,body,status,randomUUID(),now]);return id;
}
test('read-only reviews detect login versus public name, reject wrong/ambiguous targets and cannot write',{skip:!testDatabaseUrl},async()=>{
 const r=await operatorRealm({isolated:true,clock:()=>now});try{
  const a=await target(r,nameTarget,oldName,'Moss of the Vale');const before=await snapshot(r);
  const reviewed=await readOnlyReview(r.db,sql=>inspectName(sql));assert.equal(reviewed.review.field,'account_username');assert.equal(reviewed.details.username,oldName);assert.equal(reviewed.details.characterName,'Moss of the Vale');assert.equal(reviewed.details.applyEligible,true);assert.deepEqual(await snapshot(r),before);
  await assert.rejects(readOnlyReview(r.db,sql=>sql.query('UPDATE accounts SET username=username')));
  await r.db.query('UPDATE characters SET name=$2 WHERE id=$1',[a.id,oldName]);const ambiguous=await readOnlyReview(r.db,sql=>inspectName(sql));assert.equal(ambiguous.review.field,null);assert.equal(ambiguous.details.applyEligible,false);assert.deepEqual(ambiguous.details.matchingFields,['account_username','character_name']);
  assert.equal((await inspectName(r.db,'character_name')).review.field,'character_name');
  await r.db.query('UPDATE accounts SET username=$2 WHERE id=$1',[a.accountId,'safe_login']);assert.equal((await inspectName(r.db)).review.field,'character_name');
  await r.db.query('UPDATE characters SET name=$2 WHERE id=$1',[a.id,'Already Changed']);await assert.rejects(inspectName(r.db));
 }finally{await r.close();}
});
test('login correction is atomic, independently approved and idempotent; all 450 bots, sessions, credentials and unrelated business rows survive',{skip:!testDatabaseUrl},async()=>{
 const r=await operatorRealm({isolated:true,clock:()=>now,developmentBotsEnabled:true});try{
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});const a=await target(r,nameTarget,oldName,'Moss of the Vale'),b=await r.player('Preserved Friend');
  await r.prepare(a,30000,60);await r.prepare(b,1000,60);await r.legacyArmy(a,3);await r.ok(a,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:2});await r.ok(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:2});await r.ok(a,'/api/v1/vault/deposits',{amount:1000});await r.ok(a,'/api/v1/tutorial',{action:'start'});
  await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:b.id});await r.ok(b,'/api/v1/army/acceptances',{targetCharacterId:a.id});
  await message(r,a.id,'Preserved public history');await r.me(a);await r.me(b);
  const accountRows=(await r.db.query('SELECT row_to_json(a) AS row FROM accounts a ORDER BY id')).rows.map(x=>x.row);
  const reviewed=await readOnlyReview(r.db,sql=>inspectName(sql)),approved=approval(reviewed.review),before=await snapshot(r);
  const pair=await Promise.all([applyOwnerAction(r.runtimeDb,approved),applyOwnerAction(r.runtimeDb,approved)]);assert.equal(pair.filter(x=>x.applied).length,1);assert.equal(pair.filter(x=>x.alreadyApplied).length,1);
  const after=await snapshot(r);for(const [t,hash] of Object.entries(before))if(!['accounts','owner_operator_actions'].includes(t))assert.equal(after[t],hash,t);
  const accounts=(await r.db.query('SELECT id,username FROM accounts WHERE id=$1',[a.accountId])).rows;assert.equal(accounts[0]!.username,newName);assert.equal((await r.db.query('SELECT name FROM characters WHERE id=$1',[a.id])).rows[0]!.name,'Moss of the Vale');
  const expectedAccounts=accountRows.map(row=>row.id===a.accountId?{...row,username:newName}:row);
  assert.equal(digest(JSON.stringify((await r.db.query('SELECT row_to_json(a) AS row FROM accounts a ORDER BY id')).rows.map(x=>x.row))),digest(JSON.stringify(expectedAccounts)),'Every other account and all other account columns remain identical');
  assert.equal((await authenticate(r.db,newName,'OperatorFixture!2026')).accountId,a.accountId);await assert.rejects(authenticate(r.db,oldName,'OperatorFixture!2026'));
  assert.equal((await r.app.inject({url:'/api/v1/me',headers:{cookie:a.cookie}})).statusCode,200);
  const audit=(await r.db.query('SELECT * FROM owner_operator_actions')).rows;assert.equal(audit.length,1);assert.equal(audit[0]!.field,'account_username');assert.equal(audit[0]!.before_state.username,oldName);assert.equal(audit[0]!.after_state.username,newName);
  for(const sql of["UPDATE owner_operator_actions SET operator_label='changed'",'DELETE FROM owner_operator_actions','TRUNCATE owner_operator_actions'])await assert.rejects(r.db.query(sql));
  const stable=await snapshot(r);await assert.rejects(applyOwnerAction(r.runtimeDb,approval({...reviewed.review,accountId:b.accountId})));await assert.rejects(applyOwnerAction(r.runtimeDb,approval({...reviewed.review,characterId:b.id})));assert.deepEqual(await snapshot(r),stable);
  assert.equal((await r.db.query('SELECT count(*)::int n FROM development_bots')).rows[0]!.n,450);
  await mkdir('test-results',{recursive:true});await writeFile('test-results/owner-operator-preservation.json',JSON.stringify({passed:true,accounts:452,bots:450,tablesChecked:Object.keys(before).length,changedBusinessColumns:['accounts.username'],auditRowsAdded:1,passwordAndSessionPreserved:true,duplicateAppliesOnce:true,productionAccessed:false},null,2)+'\n');
 }finally{await r.close();}
});
test('public-name-only correction leaves login unchanged; duplicate usernames and failed audit insert roll back',{skip:!testDatabaseUrl},async()=>{
 const r=await operatorRealm({isolated:true,clock:()=>now});try{
  const a=await target(r,nameTarget,'safe_login',oldName),b=await r.player('Unrelated Name');await r.me(a);await r.me(b);
  const review=await inspectName(r.db);assert.equal(review.review.field,'character_name');const authorized=approval(review.review);
  const characters=(await r.db.query('SELECT row_to_json(c) AS row FROM characters c ORDER BY id')).rows.map(x=>x.row);
  const before=await snapshot(r);await applyOwnerAction(r.runtimeDb,authorized);const after=await snapshot(r);for(const t of Object.keys(before))if(!['characters','owner_operator_actions'].includes(t))assert.equal(after[t],before[t],t);
  assert.equal(digest(JSON.stringify((await r.db.query('SELECT row_to_json(c) AS row FROM characters c ORDER BY id')).rows.map(x=>x.row))),digest(JSON.stringify(characters.map(c=>c.id===a.id?{...c,name:newName}:c))),'Only the exact character name changes');
  assert.equal((await authenticate(r.db,'safe_login','OperatorFixture!2026')).accountId,a.accountId);
  // Separate synthetic starting state for rollback/collision, not an audit edit.
  await r.db.query('UPDATE accounts SET username=$2 WHERE id=$1',[a.accountId,oldName]);await r.db.query('UPDATE accounts SET username=$2 WHERE id=$1',[b.accountId,newName]);
  const blocked=await inspectName(r.db,'account_username');assert.equal(blocked.details.replacementAvailable,false);const blockedApproval=approval(blocked.review);const snap=await snapshot(r);await assert.rejects(applyOwnerAction(r.runtimeDb,blockedApproval));assert.deepEqual(await snapshot(r),snap);
  await r.db.query('UPDATE accounts SET username=$2 WHERE id=$1',[b.accountId,'other_login']);
  const next=approval((await inspectName(r.db,'account_username')).review);
  await r.db.query("CREATE FUNCTION fixture_reject_operator_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture rollback'; END $$");await r.db.query('CREATE TRIGGER fixture_reject_audit BEFORE INSERT ON owner_operator_actions FOR EACH ROW EXECUTE FUNCTION fixture_reject_operator_audit()');
  const stable=await snapshot(r);await assert.rejects(applyOwnerAction(r.runtimeDb,next));assert.deepEqual(await snapshot(r),stable);
 }finally{await r.close();}
});
test('Gray-only hide verifies immutable identity/body/time, retains Development Knight and other messages, rolls back audit failure and retries once',{skip:!testDatabaseUrl},async()=>{
 const r=await operatorRealm({isolated:true,clock:()=>now});try{
  const gray=await target(r,grayTarget,'gray','Gray'),other=await r.player('Development Knight');await r.prepare(gray,500,30);await r.prepare(other,500,30);
  const body=String.fromCharCode(70,97,103),id=await message(r,gray.id,body),unrelated=await message(r,gray.id,'Unrelated Gray message'),knight=await message(r,other.id,'Already removed fixture','hidden');await message(r,other.id,body);
  const read=await readOnlyReview(r.db,sql=>inspectGray(sql));assert.equal(read.review.messageId,id);assert.equal(read.details.applyEligible,true);const auth=approval(read.review);
  await assert.rejects(inspectGray(r.db,knight));
  const stale=approval({...read.review,createdAt:'2000-01-01T00:00:00.000000Z'});const before=await snapshot(r);await assert.rejects(applyOwnerAction(r.runtimeDb,stale));assert.deepEqual(await snapshot(r),before);
  await r.db.query("CREATE FUNCTION fixture_reject_gray_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture rollback'; END $$");await r.db.query('CREATE TRIGGER fixture_reject_gray_audit BEFORE INSERT ON owner_operator_actions FOR EACH ROW EXECUTE FUNCTION fixture_reject_gray_audit()');
  await assert.rejects(applyOwnerAction(r.runtimeDb,auth));assert.deepEqual(await snapshot(r),before,'Hide and social audit must roll back together if the operator receipt fails');await r.db.query('DROP TRIGGER fixture_reject_gray_audit ON owner_operator_actions');
  const pair=await Promise.all([applyOwnerAction(r.runtimeDb,auth),applyOwnerAction(r.runtimeDb,auth)]);assert.equal(pair.filter(x=>x.applied).length,1);
  assert.equal((await r.db.query('SELECT status FROM realm_messages WHERE id=$1',[id])).rows[0]!.status,'hidden');assert.equal((await r.db.query('SELECT status FROM realm_messages WHERE id=$1',[unrelated])).rows[0]!.status,'visible');assert.equal((await r.db.query('SELECT count(*)::int n FROM social_moderation WHERE message_id=$1',[knight])).rows[0]!.n,0);
  assert.equal((await r.db.query('SELECT count(*)::int n FROM social_moderation WHERE message_id=$1',[id])).rows[0]!.n,1);
  for(const category of['all','broadcasts']){const page=await r.app.inject({url:'/api/v1/feed?feed='+category,headers:{cookie:other.cookie}});assert.equal(page.statusCode,200);assert.ok(!page.json().entries.some((e:any)=>e.id===id));assert.ok(page.json().entries.some((e:any)=>e.id===unrelated));}
  const hidden=await inspectGray(r.db,id);assert.equal(hidden.details.applyEligible,false);
  const duplicate=await message(r,gray.id,body);await assert.rejects(inspectGray(r.db));assert.equal((await inspectGray(r.db,duplicate)).review.messageId,duplicate);
 }finally{await r.close();}
});
test('privileged bootstrap preserves populated data and all 450 bots; replay does not change credentials or grant more access',{skip:!testDatabaseUrl},async()=>{
 const base=await realm({isolated:true,clock:()=>now,developmentBotsEnabled:true});let hardened:Awaited<ReturnType<typeof finishOperatorRealm>>|undefined;
 try{
  await provisionBots(base.db,{nodeEnv:'test',allowProvisioning:true});const a=await base.player('Existing Realm Fixture');await base.prepare(a,10000,30);await base.ok(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:3});await base.me(a);
  await migrate(base.db);const before=await snapshot(base);hardened=await finishOperatorRealm(base);const after=await snapshot(base);
  for(const t of Object.keys(before))assert.equal(after[t],before[t],t);assert.equal(Object.keys(after).length,Object.keys(before).length+2);
  await installOwnerAudit(base.db,setup);assert.deepEqual(await snapshot(base),after);await assertOperatorRuntime(hardened.runtimeDb);
  await migrate(base.db);assert.deepEqual(await snapshot(base),after);assert.equal((await base.db.query('SELECT count(*)::int n FROM development_bots')).rows[0]!.n,450);
 }finally{await(hardened??base).close();}
});
test('a concurrent claimant of the login name cannot create duplicates or a partial correction; missing append-only guards stop writes',{skip:!testDatabaseUrl},async()=>{
 const r=await operatorRealm({isolated:true,clock:()=>now});try{
  const a=await target(r,nameTarget,oldName,'Moss of the Vale'),b=await r.player('Concurrent Rival Fixture');const approved=approval((await inspectName(r.db)).review);
  await r.db.query('ALTER TABLE owner_operator_actions DISABLE TRIGGER owner_operator_actions_immutable');const before=await snapshot(r);await assert.rejects(applyOwnerAction(r.runtimeDb,approved));assert.deepEqual(await snapshot(r),before);await r.db.query('ALTER TABLE owner_operator_actions ENABLE TRIGGER owner_operator_actions_immutable');
  const race=await Promise.allSettled([applyOwnerAction(r.runtimeDb,approved),r.db.query('UPDATE accounts SET username=$2 WHERE id=$1',[b.accountId,newName])]);
  assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal((await r.db.query('SELECT count(*)::int n FROM accounts WHERE username=$1',[newName])).rows[0]!.n,1);
  const audit=(await r.db.query('SELECT count(*)::int n FROM owner_operator_actions')).rows[0]!.n;assert.equal(audit,race[0]!.status==='fulfilled'?1:0);

 }finally{await r.close();}
});

test('runtime cannot perform DDL, assume ownership, read credentials or alter audits; real guard replacement and excess grants fail closed',{skip:!testDatabaseUrl},async()=>{
 const r=await operatorRealm({isolated:true});try{
  const roles=await assertOperatorRuntime(r.runtimeDb);
  for(const query of[
   'CREATE TABLE forbidden_ddl(id int)','CREATE TEMP TABLE forbidden_temp(id int)','CREATE SCHEMA forbidden_schema',
   'ALTER SCHEMA '+roles.schema+' OWNER TO '+roles.runtime,'ALTER TABLE owner_operator_actions OWNER TO '+roles.runtime,'ALTER FUNCTION preserve_owner_operator_audit() OWNER TO '+roles.runtime,'ALTER TABLE owner_operator_actions ADD COLUMN bad int','DROP TABLE owner_operator_actions',
   'ALTER TABLE owner_operator_actions DISABLE TRIGGER owner_operator_actions_immutable',
   "CREATE OR REPLACE FUNCTION preserve_owner_operator_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$",
   "UPDATE owner_operator_schema SET github_run_id='999'","UPDATE owner_operator_actions SET operator_label='forged'",'DELETE FROM owner_operator_actions','TRUNCATE owner_operator_actions',
   'SET ROLE '+roles.owner,"SET session_replication_role='replica'",'SELECT password_hash FROM accounts','SELECT * FROM sessions','SELECT * FROM wallets'
  ])await assert.rejects(r.runtimeDb.query(query),query);
  await assert.rejects(installOwnerAudit(r.runtimeDb,setup));await assert.rejects(applyOwnerAction(r.db,approval((await inspectNameAfterTarget()).review)));
  async function inspectNameAfterTarget(){await target(r,nameTarget,oldName,'Permission Fixture');return inspectName(r.db);}
  const original=(await r.db.query("SELECT prosrc FROM pg_proc WHERE oid='preserve_owner_operator_audit()'::regprocedure")).rows[0]!.prosrc;
  await r.db.query("CREATE OR REPLACE FUNCTION preserve_owner_operator_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$");await assert.rejects(assertOwnerAudit(r.runtimeDb));
  await r.db.query('CREATE OR REPLACE FUNCTION preserve_owner_operator_audit() RETURNS trigger LANGUAGE plpgsql AS $body$'+original+'$body$');await assertOperatorRuntime(r.runtimeDb);
  const trigger=(await r.db.query("SELECT pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid='owner_operator_actions'::regclass AND tgname='owner_operator_actions_immutable'")).rows[0]!.definition;
  await r.db.query('DROP TRIGGER owner_operator_actions_immutable ON owner_operator_actions');await r.db.query('CREATE TRIGGER owner_operator_actions_immutable AFTER UPDATE OR DELETE ON owner_operator_actions FOR EACH ROW EXECUTE FUNCTION preserve_owner_operator_audit()');await assert.rejects(assertOwnerAudit(r.runtimeDb));await r.db.query('DROP TRIGGER owner_operator_actions_immutable ON owner_operator_actions');await r.db.query(trigger);await assertOperatorRuntime(r.runtimeDb);
  await r.db.query('DROP TRIGGER owner_operator_actions_immutable ON owner_operator_actions');await r.db.query('CREATE TRIGGER owner_operator_actions_immutable BEFORE UPDATE OR DELETE ON owner_operator_schema FOR EACH ROW EXECUTE FUNCTION preserve_owner_operator_audit()');await assert.rejects(assertOwnerAudit(r.runtimeDb));await r.db.query('DROP TRIGGER owner_operator_actions_immutable ON owner_operator_schema');await r.db.query(trigger);await assertOperatorRuntime(r.runtimeDb);
  await r.db.query('GRANT UPDATE(operator_label) ON owner_operator_actions TO '+roles.runtime);await assert.rejects(assertOperatorRuntime(r.runtimeDb));await r.db.query('REVOKE UPDATE(operator_label) ON owner_operator_actions FROM '+roles.runtime);
  await r.db.query('GRANT CREATE ON SCHEMA '+roles.schema+' TO '+roles.runtime);await assert.rejects(assertOperatorRuntime(r.runtimeDb));await r.db.query('REVOKE CREATE ON SCHEMA '+roles.schema+' FROM '+roles.runtime);
  await assertOperatorRuntime(r.runtimeDb);
  await r.db.query('GRANT pg_read_all_data TO '+roles.runtime);await assert.rejects(assertOperatorRuntime(r.runtimeDb));await r.db.query('REVOKE pg_read_all_data FROM '+roles.runtime);await assertOperatorRuntime(r.runtimeDb);
 }finally{await r.close();}
});
test('Gray restoration requires its exact original hide, separate review and new receipt; retries restore once and preserve other messages',{skip:!testDatabaseUrl},async()=>{
 const r=await operatorRealm({isolated:true});try{
  await target(r,grayTarget,'gray','Gray');const id=await message(r,grayTarget,String.fromCharCode(70,97,103));
  const hide=approval((await inspectGray(r.db,id)).review);await applyOwnerAction(r.runtimeDb,hide);
  await assert.rejects(inspectGrayRestore(r.runtimeDb,id,randomUUID()));
  const read=await readOnlyReview(r.runtimeDb,sql=>inspectGrayRestore(sql,id,hide.id));const restore=approval(read.review);
  const results=await Promise.all([applyOwnerAction(r.runtimeDb,restore),applyOwnerAction(r.runtimeDb,restore)]);assert.equal(results.filter(r=>r.applied).length,1);
  assert.equal((await r.db.query('SELECT status FROM realm_messages WHERE id=$1',[id])).rows[0]!.status,'visible');
  assert.equal((await r.db.query('SELECT count(*)::int n FROM owner_operator_actions')).rows[0]!.n,2);await verifyOwnerAction(r.runtimeDb,restore.review);
  assert.equal((await r.db.query("SELECT count(*)::int n FROM social_moderation WHERE action='operator_restore'")).rows[0]!.n,1);
  await assert.rejects(inspectGrayRestore(r.runtimeDb,id,hide.id));
 }finally{await r.close();}
});

test('bootstrap preserves existing TEMP access; unexpected PUBLIC CREATE rolls back roles, audit objects and database ACL',{skip:!testDatabaseUrl},async()=>{
 const base=await realm({isolated:true});let hardened:Awaited<ReturnType<typeof finishOperatorRealm>>|undefined;
 const existing='fixture_existing_'+randomUUID().replaceAll('-',''),database=String((await base.db.query('SELECT current_database() AS name')).rows[0]!.name);
 assert.match(database,/^[a-z_][a-z0-9_]*$/);
 try{
  await base.db.query('CREATE ROLE '+existing+' NOLOGIN');await base.db.query('GRANT TEMPORARY ON DATABASE '+database+' TO '+existing);
  hardened=await finishOperatorRealm(base);
  assert.equal((await base.db.query("SELECT has_database_privilege($1,current_database(),'TEMP') AS ok",[existing])).rows[0]!.ok,true);
  const roles=await assertOperatorRuntime(hardened.runtimeDb);
  assert.equal((await base.db.query("SELECT has_database_privilege($1,current_database(),'TEMP') AS ok",[roles.runtime])).rows[0]!.ok,false);
 }finally{await(hardened??base).close();const admin=createDatabase(testDatabaseUrl!);try{await admin.query('DROP OWNED BY '+existing);await admin.query('DROP ROLE '+existing);}finally{await admin.end();}}
 const rejected=await realm({isolated:true});try{
  const roles=await operatorRoles(rejected.db),before=await snapshot(rejected);
  const acl=()=>rejected.db.query('SELECT datacl::text AS acl FROM pg_database WHERE datname=current_database()');
  const previousAcl=(await acl()).rows[0]!.acl;
  await rejected.db.query('GRANT CREATE ON SCHEMA '+roles.schema+' TO PUBLIC');
  await assert.rejects(installOwnerAudit(rejected.db,setup,randomBytes(32).toString('base64url')));
  assert.deepEqual(await snapshot(rejected),before);assert.equal((await acl()).rows[0]!.acl,previousAcl);
  assert.equal((await rejected.db.query('SELECT count(*)::int n FROM pg_roles WHERE rolname IN ($1,$2)',[roles.owner,roles.runtime])).rows[0]!.n,0);
 }finally{await rejected.close();}
});
