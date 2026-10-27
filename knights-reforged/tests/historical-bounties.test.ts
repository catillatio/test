import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {competitionFixture} from './phase6-fixtures.js';
import {testDatabaseUrl,type Player} from './helpers.js';
import {historicalPlacements} from './bounty-history-fixture.js';
import {bountyBoard,bountyPlacementStatus,bountyPlacementAvailability,bountyQuote,claimBounty,lockBountyEscrow} from '../src/bounties.js';
import {transaction} from '../src/db.js';
import {activityFeed} from '../src/feeds.js';
type Realm=Awaited<ReturnType<typeof competitionFixture>>;
const skip=!testDatabaseUrl;
async function snapshot(r:Realm){return JSON.stringify((await r.db.query(`SELECT
 (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM characters c) characters,
 (SELECT jsonb_agg(to_jsonb(w) ORDER BY character_id) FROM wallets w) wallets,
 (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM bounties b) bounties,
 (SELECT count(*) FROM economy_entries) entries,(SELECT count(*) FROM economy_transactions) transactions,
 (SELECT count(*) FROM command_receipts) receipts,(SELECT count(*) FROM battles) battles,
 (SELECT count(*) FROM bounty_events) events,(SELECT count(*) FROM bounty_kills) kills,
 (SELECT count(*) FROM competitive_deaths) deaths`)).rows[0]);}
async function finish(r:Realm,hunter:Player,target:Player,bountyId:string){
 await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]);
 const hit=await r.ok(hunter,'/api/v1/battles',{targetCharacterId:target.id,bountyId});
 return (await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result;
}
test('25th sponsor-target placement is allowed; 26th is denied across mixed legacy settlements and missing placed events',{skip},async()=>{
 const r=await competitionFixture();try{
  const sponsor=await r.player('Historical Patron',5),target=await r.player('Historical Mark',100),hunter=await r.player('Finishing Hunter',100),other=await r.player('Independent Patron',5);
  const old=await historicalPlacements(r.db,[sponsor.id],target.id,24,r.now(),{missingPlacedEvents:true,claimant:hunter.id});
  const history=JSON.stringify((await r.db.query('SELECT * FROM bounties WHERE id=ANY($1::uuid[]) ORDER BY id',[old.map(b=>b.id)])).rows);
  const quote=await bountyQuote(r.db,sponsor.id,target.id,1,r.now());assert.equal(quote.quotas.sponsorTarget.used,24);assert.equal(quote.quotas.sponsorTarget.remaining,1);assert.equal(quote.quotas.target.remaining,226);
  const before=(await r.me(sponsor)).gold,key=randomUUID(),payload={targetCharacterId:target.id,amount:1};
  const placed=await r.ok(sponsor,'/api/v1/bounties/placements',payload,key);
  assert.equal(placed.data.quotas.sponsorTarget.remaining,0);assert.ok(placed.data.quotas.sponsorTarget.nextAvailableAt);assert.equal((await r.me(sponsor)).gold,before-2);
  assert.equal((await r.ok(sponsor,'/api/v1/bounties/placements',payload,key)).data.bountyId,placed.data.bountyId);
  await finish(r,hunter,target,placed.data.bountyId);
  const saved=await snapshot(r),denied=await r.command(sponsor,'/api/v1/bounties/placements',payload);
  assert.equal(denied.json().error.code,'BOUNTY_SPONSOR_TARGET_LIMIT');assert.match(denied.json().error.message,/25.*rolling 24 hours/);assert.equal(await snapshot(r),saved);
  assert.equal((await bountyPlacementAvailability(r.db,sponsor.id,target.id,r.now())).quotas.sponsorTarget.remaining,0);
  await r.ok(other,'/api/v1/bounties/placements',payload);assert.equal((await r.me(target)).health,0,'relisting never heals');
  assert.equal(JSON.stringify((await r.db.query('SELECT * FROM bounties WHERE id=ANY($1::uuid[]) ORDER BY id',[old.map(b=>b.id)])).rows),history,'legacy settlements remain byte-equivalent');
 }finally{await r.close();}
});
test('250th target-wide placement is allowed, then the 251st is denied even for a fresh sponsor',{skip},async()=>{
 const r=await competitionFixture();try{
  const sponsors=[];for(let i=0;i<11;i++)sponsors.push(await r.player('Target Patron '+i));
  const target=await r.player('Popular Target'),hunter=await r.player('Target Finisher',100);
  await historicalPlacements(r.db,sponsors.slice(0,10).map(s=>s.id),target.id,249,r.now(),{missingPlacedEvents:true,claimant:hunter.id});
  const sponsor=sponsors[9]!,payload={targetCharacterId:target.id,amount:1},quote=await bountyQuote(r.db,sponsor.id,target.id,1,r.now());
  assert.equal(quote.quotas.target.used,249);assert.equal(quote.quotas.sponsorTarget.used,24);
  const placed=await r.ok(sponsor,'/api/v1/bounties/placements',payload);assert.equal(placed.data.quotas.target.remaining,0);
  await finish(r,hunter,target,placed.data.bountyId);
  const saved=await snapshot(r),denied=await r.command(sponsors[10]!,'/api/v1/bounties/placements',payload);
  assert.equal(denied.json().error.code,'BOUNTY_TARGET_LIMIT');assert.match(denied.json().error.message,/250.*all sponsors/);assert.equal(await snapshot(r),saved);
  const status=await bountyPlacementStatus(r.db,sponsors[10]!.id,target.id,r.now());assert.equal(status.quotas.sponsorTarget.remaining,25);assert.equal(status.quotas.target.used,250);
 }finally{await r.close();}
});
test('concurrent sponsors at target placement 249 serialize escrow, unique active listing, fee, idempotency and final target cap',{skip},async()=>{
 const r=await competitionFixture();try{
  const old=[];for(let i=0;i<10;i++)old.push(await r.player('Prior Sponsor '+i));
  const a=await r.player('Racing Patron A'),b=await r.player('Racing Patron B'),target=await r.player('Racing Target'),hunter=await r.player('Racing Hunter',100);
  await historicalPlacements(r.db,old.map(s=>s.id),target.id,249,r.now(),{claimant:hunter.id});
  const sponsors=[a,b],keys=[randomUUID(),randomUUID()],gold=await Promise.all(sponsors.map(s=>r.me(s))),payload={targetCharacterId:target.id,amount:100};
  const attempts=await Promise.all(sponsors.map((s,i)=>r.command(s,'/api/v1/bounties/placements',payload,keys[i])));
  assert.deepEqual(attempts.map(a=>a.statusCode).sort(),[200,409]);const winner=attempts.findIndex(a=>a.statusCode===200),loser=1-winner,placed=attempts[winner]!.json();
  assert.equal((await r.me(sponsors[winner]!)).gold,gold[winner]!.gold-110);assert.equal((await r.me(sponsors[loser]!)).gold,gold[loser]!.gold);
  assert.equal((await r.ok(sponsors[winner]!,'/api/v1/bounties/placements',payload,keys[winner])).data.bountyId,placed.data.bountyId);
  assert.equal((await r.db.query("SELECT count(*)::int n FROM bounties WHERE target_id=$1 AND status='active'",[target.id])).rows[0]!.n,1);
  await finish(r,hunter,target,placed.data.bountyId);
  const saved=await snapshot(r);assert.equal((await r.command(sponsors[loser]!,'/api/v1/bounties/placements',payload,keys[loser])).json().error.code,'BOUNTY_TARGET_LIMIT');assert.equal(await snapshot(r),saved);
 }finally{await r.close();}
});
test('true rolling boundaries release exactly the right pair and target slots without erasing historical rows',{skip},async()=>{
 const r=await competitionFixture();try{
  const sponsor=await r.player('Boundary Patron'),other=await r.player('Boundary Other'),target=await r.player('Boundary Target'),hunter=await r.player('Boundary Hunter');
  const boundary=new Date(+r.now()-86400000);
  await historicalPlacements(r.db,[sponsor.id],target.id,24,r.now(),{at:new Date(+r.now()-3600000),claimant:hunter.id});
  await historicalPlacements(r.db,[sponsor.id],target.id,1,r.now(),{at:boundary,claimant:hunter.id});
  await historicalPlacements(r.db,[other.id],target.id,1,r.now(),{at:new Date(+boundary+1),claimant:hunter.id});
  let q=(await bountyPlacementStatus(r.db,sponsor.id,target.id,r.now())).quotas;assert.equal(q.sponsorTarget.used,24);assert.equal(q.target.used,25);
  assert.equal(q.target.nextReleaseAt,new Date(+r.now()+1).toISOString());r.advance(.001);
  q=(await bountyPlacementStatus(r.db,sponsor.id,target.id,r.now())).quotas;assert.equal(q.sponsorTarget.remaining,1);assert.equal(q.target.used,24);
  assert.equal((await r.db.query('SELECT count(*)::int n FROM bounties WHERE target_id=$1',[target.id])).rows[0]!.n,26);
  // A trustworthy historical row can retain PostgreSQL microsecond precision,
  // even though modern command timestamps use JS milliseconds.
  const microTarget=await r.player('Microsecond Mark'),microAt=new Date(+r.now()-86400000).toISOString().replace('001Z','0015Z');
  await historicalPlacements(r.db,[sponsor.id],microTarget.id,24,r.now(),{at:new Date(+r.now()-3600000),claimant:hunter.id});
  await r.db.query(`INSERT INTO bounties(id,sponsor_id,target_id,amount,fee,status,ruleset_id,command_id,created_at,expires_at,settled_at)
   VALUES($1,$2,$3,1,1,'canceled','pvp-economy-0.1',$4,$5::timestamptz,$5::timestamptz+interval '24 hours',$5::timestamptz+interval '1 hour')`,[randomUUID(),sponsor.id,microTarget.id,randomUUID(),microAt]);
  let precise=(await bountyPlacementStatus(r.db,sponsor.id,microTarget.id,r.now())).quotas;assert.equal(precise.sponsorTarget.used,25);assert.equal(precise.sponsorTarget.nextAvailableAt,new Date(+r.now()+1).toISOString());
  assert.equal((await r.command(sponsor,'/api/v1/bounties/placements',{targetCharacterId:microTarget.id,amount:1})).json().error.code,'BOUNTY_SPONSOR_TARGET_LIMIT');r.advance(.001);
  precise=(await bountyPlacementStatus(r.db,sponsor.id,microTarget.id,r.now())).quotas;assert.equal(precise.sponsorTarget.remaining,1);
 }finally{await r.close();}
});
test('same-sponsor concurrent 25th requests and cancelled/expired placements cannot create a 26th slot or double fee',{skip},async()=>{
 const r=await competitionFixture();try{
  const sponsor=await r.player('Last Pair Slot'),target=await r.player('Last Pair Target'),hunter=await r.player('Prior Finisher');
  await historicalPlacements(r.db,[sponsor.id],target.id,24,r.now(),{claimant:hunter.id});
  const before=(await r.me(sponsor)).gold,payload={targetCharacterId:target.id,amount:1},key=randomUUID();
  const attempts=await Promise.all([r.command(sponsor,'/api/v1/bounties/placements',payload,key),r.command(sponsor,'/api/v1/bounties/placements',payload)]);
  assert.deepEqual(attempts.map(a=>a.statusCode).sort(),[200,409]);const placed=attempts.find(a=>a.statusCode===200)!.json();assert.equal((await r.me(sponsor)).gold,before-2);
  r.advance(3600);await r.ok(sponsor,'/api/v1/bounties/cancellations',{bountyId:placed.data.bountyId});assert.equal((await r.me(sponsor)).gold,before-1);
  const saved=await snapshot(r);assert.equal((await r.command(sponsor,'/api/v1/bounties/placements',payload)).json().error.code,'BOUNTY_SPONSOR_TARGET_LIMIT');assert.equal(await snapshot(r),saved);
  r.advance(86400);const next=await r.ok(sponsor,'/api/v1/bounties/placements',payload);assert.equal(next.data.quotas.sponsorTarget.used,1);
  r.advance(86400);await bountyBoard(r.db,sponsor.id);assert.equal((await r.db.query('SELECT status FROM bounties WHERE id=$1',[next.data.bountyId])).rows[0]!.status,'expired');
  assert.equal((await r.db.query('SELECT count(*)::int n FROM bounties WHERE target_id=$1',[target.id])).rows[0]!.n,26);
 }finally{await r.close();}
});
test('losing low-Health finishes, immediate zero-Health relisting, natural recovery and a second claim preserve XP, gold and K/D',{skip},async()=>{
 const r=await competitionFixture();try{
  const sponsor=await r.player('Low Health Patron',5),target=await r.player('Mighty Defender',100),hunter=await r.player('Weak Hunter',5);
  await r.legacyArmy(target,20);await r.ok(target,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:20});
  await r.db.query('UPDATE characters SET max_health=1000,health=1000,max_spirit=20,spirit=20 WHERE id=$1',[hunter.id]);
  const gold=(await r.me(hunter)).gold,targetGold=(await r.me(target)).gold,first=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100});
  const battle=await finish(r,hunter,target,first.data.bountyId);assert.equal(battle.outcome,'defender_win');assert.equal(battle.attackerXp,0);assert.equal(battle.loot,0);assert.equal(battle.bountyContractId,first.data.bountyId);assert.equal(battle.bountyClaim.reward,100);
  const second=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100});assert.equal((await r.me(target)).health,0);
  for(const payload of[{targetCharacterId:target.id},{targetCharacterId:target.id,bountyId:second.data.bountyId}]){
   const saved=await snapshot(r);const response=await r.command(hunter,'/api/v1/battles',payload);assert.equal(response.json().error.code,payload.bountyId?'OPPONENT_DEFEATED':'RIVAL_LEVEL_RANGE');assert.equal(await snapshot(r),saved);
  }
  r.advance(180);assert.equal((await r.me(target)).health,10);
  let health=10,attacks=0;while(health>0){const hit=await r.ok(hunter,'/api/v1/battles',{targetCharacterId:target.id,bountyId:second.data.bountyId}),report=(await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result;
   assert.equal(report.outcome,'defender_win');assert.equal(report.attackerXp,0);assert.equal(report.loot,0);assert.equal(report.defenderHealthBefore,health);assert.ok(report.defenderHealthAfter<health);health=report.defenderHealthAfter;attacks++;
   assert.equal(report.bountyClaim?.id??null,health===0?second.data.bountyId:null);assert.ok(attacks<10);
  }
  const after=await r.me(hunter);assert.equal(after.gold,gold+200);assert.equal(after.battleStats.kills,2);assert.equal(after.battleStats.wins,0);assert.equal((await r.me(target)).battleStats.deaths,2);assert.equal((await r.me(target)).gold,targetGold);assert.equal((await r.me(target)).health,0);
  assert.equal((await r.db.query('SELECT count(*)::int n FROM pvp_loot_sequences WHERE attacker_id=$1',[hunter.id])).rows[0]!.n,0);
  assert.equal((await r.db.query('SELECT count(*)::int n FROM competitive_deaths WHERE victim_id=$1',[target.id])).rows[0]!.n,2);
  assert.ok((await activityFeed(r.db,sponsor.id,'all')).entries.some(e=>e.kind==='bounty'));
 }finally{await r.close();}
});
test('competing claims, replay and a stale contract after immediate relisting cannot spend twice or settle the new contract',{skip},async()=>{
 const r=await competitionFixture();try{
  const sponsor=await r.player('Claim Patron'),target=await r.player('Claim Mark'),a=await r.player('First Claimant',100),b=await r.player('Second Claimant',100);
  const first=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100});await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]);
  const hunters=[a,b],keys=[randomUUID(),randomUUID()],payload={targetCharacterId:target.id,bountyId:first.data.bountyId};
  const attempts=await Promise.all(hunters.map((h,i)=>r.command(h,'/api/v1/battles',payload,keys[i])));assert.deepEqual(attempts.map(x=>x.statusCode).sort(),[200,409]);const winner=attempts.findIndex(x=>x.statusCode===200),hit=attempts[winner]!.json();
  const second=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100}),saved=await snapshot(r);
  assert.equal((await r.ok(hunters[winner]!,'/api/v1/battles',payload,keys[winner])).battleId,hit.battleId);assert.equal(await snapshot(r),saved);
  assert.equal((await r.command(hunters[winner]!,'/api/v1/battles',payload)).json().error.code,'BOUNTY_HUNT_UNAVAILABLE');assert.equal(await snapshot(r),saved);
  await transaction(r.db,async sql=>{await lockBountyEscrow(sql);assert.equal(await claimBounty(sql,hunters[winner]!.id,target.id,hit.battleId,keys[winner]!,r.now()),null);});
  assert.equal(await snapshot(r),saved);assert.equal((await r.db.query('SELECT status FROM bounties WHERE id=$1',[second.data.bountyId])).rows[0]!.status,'active');
 }finally{await r.close();}
});
test('ordinary attack-versus-placement races bind the saved hit to only the contract present before the attack',{skip},async()=>{
 const r=await competitionFixture();try{
  for(let attempt=0;attempt<4;attempt++){
   const sponsor=await r.player('Race Sponsor '+attempt),target=await r.player('Race Mark '+attempt),hunter=await r.player('Race Attacker '+attempt);
   await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]);const key=randomUUID();
   const [attack,placement]=await Promise.all([r.ok(hunter,'/api/v1/battles',{targetCharacterId:target.id},key),r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100})]);
   const report=(await r.db.query('SELECT result FROM battles WHERE id=$1',[attack.battleId])).rows[0]!.result,row=(await r.db.query('SELECT * FROM bounties WHERE id=$1',[placement.data.bountyId])).rows[0]!;
   if(report.bountyContractId){assert.equal(report.bountyContractId,row.id);assert.equal(report.bountyClaim.id,row.id);assert.equal(row.status,'claimed');}
   else{assert.equal(report.bountyClaim,null);assert.equal(row.status,'active');const saved=await snapshot(r);
    await transaction(r.db,async sql=>{await lockBountyEscrow(sql);assert.equal(await claimBounty(sql,hunter.id,target.id,attack.battleId,key,r.now()),null);});assert.equal(await snapshot(r),saved);
   }
  }
 }finally{await r.close();}
});
test('profile, placement page, API quote, HTML confirmation, board and help share independent quota meanings',{skip},async()=>{
 const r=await competitionFixture();try{
  const sponsor=await r.player('UI Patron',5),target=await r.player('UI Target',100),hunter=await r.player('UI Hunter');
  await historicalPlacements(r.db,[sponsor.id],target.id,24,r.now(),{claimant:hunter.id});
  for(const path of['/game/players/'+target.id,'/game/bounties/new?target='+target.id]){
   const page=await r.app.inject({url:path,headers:{cookie:sponsor.cookie}});assert.equal(page.statusCode,200,page.body);assert.match(page.body,/1 \/ 25 remaining/);assert.match(page.body,/226 \/ 250 remaining/);
  }
  const quote=await r.app.inject({url:'/api/v1/bounties/quote?targetCharacterId='+target.id+'&amount=101',headers:{cookie:sponsor.cookie}});assert.equal(quote.statusCode,200);assert.equal(quote.json().quote.total,112);assert.equal(quote.json().quote.quotas.sponsorTarget.remaining,1);
  const confirmation=await r.command(sponsor,'/game/bounties/preview',{targetCharacterId:target.id,amount:101});assert.equal(confirmation.statusCode,200,confirmation.body);assert.match(confirmation.body,/1 \/ 25 remaining/);assert.match(confirmation.body,/Confirm bounty — 112 gold/);
  await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1});
  for(const path of['/game/players/'+target.id,'/game/bounties/new?target='+target.id]){const page=await r.app.inject({url:path,headers:{cookie:sponsor.cookie}});assert.equal(page.statusCode,200,page.body);assert.match(page.body,/0 \/ 25 remaining/);assert.match(page.body,/225 \/ 250 remaining/);assert.match(page.body,/already has an active bounty/);}
  const board=await r.app.inject({url:'/game/bounties',headers:{cookie:sponsor.cookie}});assert.equal(board.statusCode,200,board.body);
  const row=/<article class="bounty-row"[\s\S]*?<\/article>/.exec(board.body)![0];
  assert.match(row,/UI Target/);assert.match(row,/Level 100 Freeblade/);assert.match(row,/>1 gold</);assert.match(row,/>Attack</);
  assert.ok(!row.includes('data-bounty-quotas'));assert.ok(!row.includes('Posted by'));assert.ok(!row.includes('field-hint'));
  assert.match(row,/disabled title="Sponsors cannot claim their own contracts/);
  assert.match(board.body,/<details class="panel bounty-records">/);assert.match(board.body,/<details class="panel bounty-rules">/);
  const current=await bountyPlacementStatus(r.db,sponsor.id,target.id,r.now());assert.equal(current.quotas.sponsorTarget.remaining,0);assert.equal(current.quotas.target.remaining,225,'removing visible counters never removes backend limits');
  const rules=await r.app.inject({url:'/rules',headers:{cookie:sponsor.cookie}});assert.match(rules.body,/at most 25 bounties on the same target/);assert.match(rules.body,/at most 250 placements/);assert.ok(!rules.body.includes('50 successful placements'));
 }finally{await r.close();}
});
