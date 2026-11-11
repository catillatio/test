import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {syntheticCutover} from './level100-e2b-fixture.js';
import {competitionFixture} from './phase6-fixtures.js';
import {transaction} from '../src/db.js';
import {experienceView,syncExperience} from '../src/experience.js';
import {achievementGold,achievementGoldPolicy} from '../src/achievement-gold-policy.js';
import {reconcileAchievementGold} from '../src/achievement-gold.js';
import {callingChangePolicy} from '../src/calling-change-policy.js';
import {prepareReadBatch,applyReadBatch,acknowledgeNotifications,notificationSummary,unreadNotificationPage} from '../src/notifications.js';
import {crownsView,crownLedgerModel} from '../src/crowns.js';
import {postingRestriction,moderateMessage} from '../src/community.js';
import {realm} from './helpers.js';
import {migrate} from '../src/migrate.js';
import {profileBusinessSnapshot} from './classic-profile-fixture.js';
import {alpha} from '../src/alpha-rules.js';
test('populated approved-schema upgrade preserves every existing business row and historical receipt',async()=>{
 const r=await realm({isolated:true,clock:()=>new Date('2032-02-01T12:00:00Z'),migrationThrough:'026_living_competition.sql'});
 try{const a=await r.player('Preserved Knight'),b=await r.player('Preserved Rival');await r.prepare(a,50000);await r.prepare(b,50000);
  await r.ok(a,'/api/v1/quests/border-patrol/runs');await r.ok(a,'/api/v1/inventory/purchases',{itemId:alpha.items[0]!.id,quantity:1});await r.ok(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});
  const key=randomUUID(),old=await r.ok(a,'/api/v1/profile',{className:'Warden'},key),before=await profileBusinessSnapshot(r.db);
  await migrate(r.db);assert.deepEqual(await profileBusinessSnapshot(r.db),before);
  assert.equal((await r.db.query('SELECT enabled FROM achievement_gold_state')).rows[0]!.enabled,false);
  for(const table of ['achievement_gold_receipts','crown_wallets','crown_transactions','notification_read_batches','rival_recommendation_snapshots','npc_army_adjustments','npc_army_memberships','npc_sponsorship_windows','npc_sponsored_bounties'])assert.equal((await r.db.query('SELECT count(*)::int AS n FROM '+table)).rows[0]!.n,0,table+' starts empty');
  const replay=await r.ok(a,'/api/v1/profile',{className:'Warden'},key);assert.equal(replay.commandId,old.commandId);assert.deepEqual(await profileBusinessSnapshot(r.db),before);await migrate(r.db);assert.deepEqual(await profileBusinessSnapshot(r.db),before);
 }finally{await r.close();}
});
test('rank policy is conservative, complete and separate from historic achievements',()=>{
 assert.deepEqual(achievementGoldPolicy.ranks,[500,2500,10000,50000,100000,150000]);assert.equal(achievementGold(6),150000);assert.throws(()=>achievementGold(0));assert.throws(()=>achievementGold(7));
});
test('existing milestones pay exactly once under concurrent reads and preserve original evidence',async()=>{
 const r=await competitionFixture();try{const p=await r.player('Milestone Veteran',50);await experienceView(r.db,p.id);const original=(await r.db.query('SELECT * FROM character_achievements WHERE character_id=$1 ORDER BY achievement_id',[p.id])).rows;assert.ok(original.length);
  const before=(await r.me(p)).gold;await r.db.query('UPDATE achievement_gold_state SET enabled=true');
  const results=await Promise.all(Array.from({length:6},()=>experienceView(r.db,p.id)));const paid=results.at(-1)!;const amount=paid.achievements.filter(a=>a.earnedAt).reduce((n,a)=>n+a.rewardGold,0);
  assert.equal((await r.me(p)).gold,before+amount);assert.equal((await reconcileAchievementGold(r.db,p.id)).length,original.length);assert.deepEqual((await r.db.query('SELECT * FROM character_achievements WHERE character_id=$1 ORDER BY achievement_id',[p.id])).rows,original);
  await Promise.all(Array.from({length:4},()=>experienceView(r.db,p.id)));assert.equal((await r.me(p)).gold,before+amount);
 }finally{await r.close();}
});
test('achievement payment rollback, treasury overflow and disabled identity exclusion',async()=>{
 const r=await competitionFixture();try{const p=await r.player('Rollback Veteran',10);await r.db.query('UPDATE achievement_gold_state SET enabled=true');
  const before=(await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[p.id])).rows[0]!.balance;
  await r.db.query("CREATE FUNCTION reject_reward_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture interruption'; END $$; CREATE TRIGGER reject_reward_fixture BEFORE INSERT ON achievement_gold_receipts FOR EACH ROW EXECUTE FUNCTION reject_reward_fixture()");
  await assert.rejects(()=>experienceView(r.db,p.id),/fixture interruption/);assert.equal((await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[p.id])).rows[0]!.balance,before);assert.equal((await r.db.query('SELECT count(*)::int AS n FROM achievement_gold_receipts')).rows[0]!.n,0);
  await r.db.query('DROP TRIGGER reject_reward_fixture ON achievement_gold_receipts');await r.prepare(p,2147483647-before);await experienceView(r.db,p.id);const receipts=await reconcileAchievementGold(r.db,p.id);assert.ok(receipts.length);assert.ok(receipts.every(x=>Number(x.credited_gold)===0&&Number(x.retained_gold)===Number(x.amount)));assert.equal((await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[p.id])).rows[0]!.balance,2147483647);
  await r.db.query('UPDATE achievement_gold_state SET enabled=false');const excluded=await r.player('Inaccessible Identity',50);await r.db.query('UPDATE accounts SET login_disabled=true WHERE id=$1',[excluded.accountId]);await r.db.query('UPDATE achievement_gold_state SET enabled=true');await transaction(r.db,sql=>syncExperience(sql,excluded.id,r.now()));assert.equal((await r.db.query('SELECT 1 FROM achievement_gold_receipts WHERE character_id=$1',[excluded.id])).rowCount,0);
 }finally{await r.close();}
});
test('first Calling switch costs one million, same-class is free, retries and cooldown boundary are exact',async()=>{
 const r=await competitionFixture();try{const p=await r.player('Calling Seeker',20);const original=await r.me(p);assert.equal(original.calling.changeCost,1000000);
  const denied=await r.command(p,'/api/v1/profile',{className:'Warden'});assert.equal(denied.statusCode,409);assert.equal((await r.me(p)).gold,original.gold);
  await r.prepare(p,2000000);const before=await r.me(p),key=randomUUID();const paid=await r.ok(p,'/api/v1/profile',{className:'Warden'},key);assert.equal(paid.state.gold,before.gold-1000000);assert.equal(paid.state.calling.changeReadyAt,new Date(+r.now()+604800000).toISOString());
  assert.equal((await r.ok(p,'/api/v1/profile',{className:'Warden'},key)).commandId,key);assert.equal((await r.me(p)).gold,paid.state.gold);
  const same=await r.ok(p,'/api/v1/profile',{className:'Warden'});assert.equal(same.state.gold,paid.state.gold);assert.equal(same.state.calling.changeReadyAt,paid.state.calling.changeReadyAt);
  const blocked=await r.command(p,'/api/v1/profile',{className:'Spellward'});assert.equal(blocked.json().error.code,'CALLING_COOLDOWN');r.advance(604799.999);assert.equal((await r.command(p,'/api/v1/profile',{className:'Spellward'})).statusCode,409);r.advance(.001);await r.ok(p,'/api/v1/profile',{className:'Spellward'});
 }finally{await r.close();}
});
test('Calling concurrent switches charge once and failed ledger writes roll back',async()=>{
 const r=await competitionFixture();try{const p=await r.player('One Calling',20);await r.prepare(p,3000000);const gold=(await r.me(p)).gold;
  await r.db.query("CREATE FUNCTION reject_calling_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture calling interruption'; END $$; CREATE TRIGGER reject_calling_fixture BEFORE INSERT ON calling_changes FOR EACH ROW EXECUTE FUNCTION reject_calling_fixture()");
  assert.equal((await r.command(p,'/api/v1/profile',{className:'Warden'})).statusCode,500);
  assert.equal((await r.me(p)).gold,gold);assert.equal((await r.me(p)).className,'Freeblade');assert.equal((await r.me(p)).calling.changeReadyAt,null);
  await r.db.query('DROP TRIGGER reject_calling_fixture ON calling_changes');
  const responses=await Promise.all([r.command(p,'/api/v1/profile',{className:'Warden'}),r.command(p,'/api/v1/profile',{className:'Spellward'})]);assert.deepEqual(responses.map(x=>x.statusCode).sort(),[200,409]);assert.equal((await r.me(p)).gold,gold-1000000);
  assert.equal((await r.db.query('SELECT count(*)::int AS n FROM calling_changes WHERE character_id=$1 AND ruleset_id=$2',[p.id,callingChangePolicy.id])).rows[0]!.n,1);
 }finally{await r.close();}
});
test('late uncommitted notification with a duplicate timestamp survives a fixed read batch',async()=>{
 const r=await competitionFixture();let client:Awaited<ReturnType<typeof r.db.connect>>|undefined;
 try{const a=await r.player('Late Commit Reader'),b=await r.player('Late Commit Writer');
  await r.ok(b,'/api/v1/comments',{profileId:a.id,body:'Already committed'});
  client=await r.db.connect();await client.query('BEGIN');const id=randomUUID();
  await client.query("INSERT INTO realm_messages(id,author_id,profile_id,channel,body,ruleset_id,command_id,created_at) VALUES($1,$2,$3,'comment','Late commit','community-0.1',$4,$5)",[id,b.id,a.id,randomUUID(),r.now()]);
  const batch=await prepareReadBatch(r.db,a.id);await client.query('COMMIT');
  await applyReadBatch(r.db,a.id,batch);assert.equal((await notificationSummary(r.db,a.id)).home,1);
  await applyReadBatch(r.db,a.id,batch);assert.equal((await notificationSummary(r.db,a.id)).home,1);
  await acknowledgeNotifications(r.db,a.id,[{kind:'comment',id}]);assert.equal((await notificationSummary(r.db,a.id)).home,0);
 }finally{await client?.query('ROLLBACK');client?.release();await r.close();}
});
test('Crowns ledger rejects duplicate providers, invalid signs and history edits',async()=>{
 const r=await competitionFixture();try{const p=await r.player('Ledger Preview');await crownsView(r.db,p.id);const id=randomUUID(),token='b'.repeat(64);
  await r.db.query("INSERT INTO crown_transactions(id,character_id,kind,amount,balance_after,provider,provider_token_digest,idempotency_key) VALUES($1,$2,'purchase',10,10,'synthetic',$3,$4)",[id,p.id,token,randomUUID()]);
  await assert.rejects(()=>r.db.query("INSERT INTO crown_transactions(id,character_id,kind,amount,balance_after,provider,provider_token_digest,idempotency_key) VALUES($1,$2,'purchase',10,20,'synthetic',$3,$4)",[randomUUID(),p.id,token,randomUUID()]),/unique/);
  await assert.rejects(()=>r.db.query("INSERT INTO crown_transactions(id,character_id,kind,amount,balance_after,idempotency_key) VALUES($1,$2,'consume',10,10,$3)",[randomUUID(),p.id,randomUUID()]),/check constraint/);
  await assert.rejects(()=>r.db.query('UPDATE crown_transactions SET amount=20 WHERE id=$1',[id]),/immutable/);await assert.rejects(()=>r.db.query('DELETE FROM crown_transactions WHERE id=$1',[id]),/immutable/);
  assert.equal((await crownsView(r.db,p.id)).balance,'0','Synthetic ledger-contract probes cannot grant a wallet balance');
 }finally{await r.close();}
});
test('original 24-hour Calling promise is honored, only a new-policy success starts seven days',async()=>{
 const r=await competitionFixture();try{const p=await r.player('Historic Calling',20);await r.db.query('DELETE FROM calling_policy_epochs');const historic=await r.ok(p,'/api/v1/profile',{className:'Warden'});const rows=(await r.db.query('SELECT * FROM calling_changes WHERE character_id=$1',[p.id])).rows;
  await r.db.query('INSERT INTO calling_policy_epochs(id) VALUES($1)',[callingChangePolicy.id]);assert.equal((await r.me(p)).calling.changeReadyAt,new Date(+r.now()+86400000).toISOString());r.advance(86400);await r.prepare(p,1000000);const current=await r.ok(p,'/api/v1/profile',{className:'Freeblade'});assert.equal(current.state.calling.changeReadyAt,new Date(+r.now()+604800000).toISOString());assert.deepEqual((await r.db.query('SELECT * FROM calling_changes WHERE id=$1',[rows[0]!.id])).rows,rows);assert.equal(historic.state.className,'Warden');
 }finally{await r.close();}
});
test('Crowns preview has a real zero balance and all purchase/grant/use endpoints reject without charge',async()=>{
 const r=await competitionFixture();try{const p=await r.player('Unopened Market',5),before=await r.me(p);assert.equal((await crownsView(r.db,p.id)).balance,'0');
  for(const path of ['/api/v1/crowns/purchases','/api/v1/crowns/consumptions','/api/v1/crowns/grants','/api/v1/crowns/refunds'])assert.equal((await r.command(p,path,{amount:999,providerToken:'synthetic-forged-token'})).json().error.code,'CROWNS_DISABLED');
  const html=await r.app.inject({method:'GET',url:'/game/crowns',headers:{cookie:p.cookie}});assert.equal(html.statusCode,200,html.body);assert.match(html.body,/Mana restoration/);assert.match(html.body,/Unavailable/);assert.equal((await r.me(p)).gold,before.gold);assert.equal((await r.db.query('SELECT count(*)::int AS n FROM crown_transactions')).rows[0]!.n,0);
  assert.equal(crownLedgerModel(0n,100n,'purchase'),100n);assert.equal(crownLedgerModel(100n,-30n,'consume'),70n);assert.equal(crownLedgerModel(70n,-20n,'refund',{amount:100n,remaining:100n}),50n);assert.throws(()=>crownLedgerModel(0n,-1n,'consume'));assert.throws(()=>crownLedgerModel(70n,-101n,'reversal',{amount:100n,remaining:100n}));
 }finally{await r.close();}
});
test('fixed mark-all snapshot excludes late and foreign events, retries never swallow future notifications',async()=>{
 const r=await competitionFixture();try{const owner=await r.player('Unread Owner'),other=await r.player('Letter Writer');await r.ok(other,'/api/v1/comments',{profileId:owner.id,body:'First personal event'});const batch=await prepareReadBatch(r.db,owner.id);r.advance(61);await r.ok(other,'/api/v1/comments',{profileId:owner.id,body:'Later personal event'});
  assert.equal((await notificationSummary(r.db,owner.id)).home,2);await applyReadBatch(r.db,owner.id,batch);assert.equal((await notificationSummary(r.db,owner.id)).home,1);await applyReadBatch(r.db,owner.id,batch);assert.equal((await notificationSummary(r.db,owner.id)).home,1);await assert.rejects(()=>applyReadBatch(r.db,other.id,batch));
  const events=(await r.db.query("SELECT id FROM realm_messages WHERE profile_id=$1 AND body='Later personal event'",[owner.id])).rows;await acknowledgeNotifications(r.db,other.id,[{kind:'comment',id:events[0]!.id}]);assert.equal((await notificationSummary(r.db,owner.id)).home,1);await acknowledgeNotifications(r.db,owner.id,[{kind:'comment',id:events[0]!.id}]);assert.equal((await notificationSummary(r.db,owner.id)).home,0);
 }finally{await r.close();}
});
test('Land rates change immediately, the shared payment boundary and financial conservation do not',async()=>{
 const r=await competitionFixture();try{const p=await r.player('Immediate Land',10),before=await r.me(p);await r.ok(p,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});const first=await r.me(p),boundary=first.land.nextPaymentAt;r.advance(120);const gold=first.gold;const bought=await r.ok(p,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});assert.equal(bought.state.economy.netHourlyIncome,14);assert.equal(bought.state.land.nextPaymentAt,boundary);assert.equal(bought.state.gold,gold-bought.data.goldSpent);
  const html=await r.app.inject({method:'GET',url:'/game/home',headers:{cookie:p.cookie}});assert.match(html.body,/data-hourly-income[^>]*>\+14</);assert.equal((await r.db.query('SELECT count(*)::int AS n FROM land_income_settlements s JOIN land_holdings h ON h.id=s.holding_id WHERE h.character_id=$1',[p.id])).rows[0]!.n,0);
  const holding=bought.state.land.holdings[0];assert.ok(holding);await r.ok(p,'/api/v1/land/sales',{propertyId:'smallholding',quantity:1});assert.equal((await r.me(p)).economy.netHourlyIncome,7);assert.equal(before.economy.grossHourlyIncome,0);
 }finally{await r.close();}
});
test('mute hours, composer, blocked attempt and exact expiry preserve unrelated play',async()=>{
 const r=await competitionFixture();try{const p=await r.player('Muted Voice',5);await moderateMessage(r.db,{action:'mute',characterId:p.id,operator:'synthetic-review',reason:'private fixture moderator note',hours:1});r.advance(1799);
  assert.equal((await postingRestriction(r.db,p.id,r.now()))!.hours,1);const html=await r.app.inject({method:'GET',url:'/game/home?feed=broadcasts',headers:{cookie:p.cookie}});assert.equal(html.statusCode,200,html.body);assert.match(html.body,/MUTED — 1 HOURS REMAINING/);assert.doesNotMatch(html.body,/private fixture moderator note/);assert.match(html.body,/<textarea disabled/);
  const blocked=await r.command(p,'/api/v1/broadcasts',{body:'A direct blocked attempt'});assert.equal(blocked.statusCode,403);assert.match(blocked.json().error.message,/Contact administration/);await r.ok(p,'/api/v1/quests/border-patrol/runs');r.advance(1801);assert.equal(await postingRestriction(r.db,p.id,r.now()),null);await r.ok(p,'/api/v1/broadcasts',{body:'The restriction has expired.'});
 }finally{await r.close();}
});

test('unread pagination retains exact PostgreSQL microseconds and duplicate timestamps',async()=>{
 const r=await competitionFixture();try{const a=await r.player('Microsecond Reader'),b=await r.player('Microsecond Writer');
  for(let i=0;i<45;i++)await r.db.query("INSERT INTO realm_messages(id,author_id,profile_id,channel,body,ruleset_id,command_id,created_at) VALUES($1,$2,$3,'comment',$4,'community-0.1',$5,'2032-02-01T12:00:00.123456Z')",[randomUUID(),b.id,a.id,'Letter '+i,randomUUID()]);
  const ids=new Set<string>();let cursor:string|undefined;do{const page=await unreadNotificationPage(r.db,a.id,cursor);for(const e of page.entries){assert.ok(!ids.has(e.id));ids.add(e.id);}cursor=page.nextCursor??undefined;}while(cursor);assert.equal(ids.size,45);
 }finally{await r.close();}
});

test('expanded level-100 rank VI has one reconciled lifetime receipt and newly earned milestones pay',async()=>{
 const r=await competitionFixture();try{await syntheticCutover(r.db,false);const p=await r.player('Endgame Veteran',100);await r.db.query('UPDATE achievement_gold_state SET enabled=true');
  const initial=await experienceView(r.db,p.id);const receipt=(await reconcileAchievementGold(r.db,p.id)).find(x=>x.achievement_id==='level100-summit');assert.ok(receipt);assert.equal(Number(receipt.amount),150000);const gold=(await r.me(p)).gold;await experienceView(r.db,p.id);assert.equal((await r.me(p)).gold,gold);
  const novice=await r.player('Newly Earned',4);await experienceView(r.db,novice.id);const before=(await r.me(novice)).gold;await transaction(r.db,sql=>sql.query('UPDATE characters SET attained_level=5 WHERE id=$1',[novice.id]));await experienceView(r.db,novice.id);assert.equal((await r.me(novice)).gold,before+500);assert.equal((await reconcileAchievementGold(r.db,novice.id)).filter(x=>x.achievement_id==='level-5').length,1);assert.ok(initial.achievements.some(x=>x.id==='level100-summit'&&x.rewardPaid));
 }finally{await r.close();}
});
