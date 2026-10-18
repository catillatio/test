import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl,type Player} from './helpers.js';
import {hallOfChampions,rivalryHistory,recentHumanRivals} from '../src/competition.js';
const skip=!testDatabaseUrl;
async function recorded(r:Awaited<ReturnType<typeof realm>>,a:Player,b:Player,outcome='attacker_win',loot=0,modern=true){
 const id=randomUUID();await r.db.query(`INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result) VALUES($1,$2,$3,'alpha-0.3',$4,'{}',$5)`,
  [id,a.id,b.id,outcome,{id,attackerName:'Saved Old Name',defenderName:'Saved Old Rival',loot,attackerXp:1,...modern?{pvpRulesetId:'gameplay-refinement-1'}:{}}]);return id;
}
async function bot(r:Awaited<ReturnType<typeof realm>>,player:Player){
 await r.db.query('UPDATE accounts SET login_disabled=true WHERE id=$1',[player.accountId]);
 await r.db.query(`INSERT INTO development_bots(character_id,population_key,population_version,tier,refilled_at,recovered_at,ruleset_id)
 VALUES($1,$2,'passive-rivals-5','green',now(),now(),'gameplay-refinement-1')`,[player.id,'phase46-fixture-'+player.id]);
}
test('Hall ranks exactly top twenty qualifying humans, handles ties, accurate own rank and all four lifetime categories',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const viewer=await r.player('Patient Champion'),npc=await r.player('Passive Bot');await bot(r,npc);
  const humans:Player[]=[];for(let i=0;i<25;i++)humans.push(await r.player('Knight '+String.fromCharCode(65+i)));
  await recorded(r,viewer,npc);
  for(const h of humans){await recorded(r,h,npc);await recorded(r,h,npc);}
  const hidden=humans[0]!;await r.db.query('UPDATE accounts SET login_disabled=true WHERE id=$1',[hidden.accountId]);
  const hall=await hallOfChampions(r.db,viewer.id,'victories');assert.equal(hall.entries.length,20);assert.equal(hall.own!.rank,'25');assert.equal(hall.own!.score,'1');
  assert.ok(hall.entries.every(row=>row.id!==npc.id&&row.id!==hidden.id));assert.ok(hall.entries.every(row=>row.score==='2'));
  const expected=(await r.db.query(`SELECT c.id FROM characters c JOIN accounts a ON a.id=c.account_id WHERE NOT a.login_disabled AND c.id<>$1 ORDER BY c.created_at,c.id LIMIT 20`,[viewer.id])).rows.map(row=>row.id);
  assert.deepEqual(hall.entries.map(row=>row.id),expected);
  await r.db.query('UPDATE accounts SET login_disabled=false WHERE id=$1',[hidden.accountId]);assert.equal((await hallOfChampions(r.db,viewer.id)).own!.rank,'26');
  assert.equal((await hallOfChampions(r.db,viewer.id,'bounties')).entries.length,0);
  const land=await hallOfChampions(r.db,viewer.id,'land');assert.equal(land.entries.length,0);assert.equal(land.own,null);
  await r.prepare(viewer,2000);await r.ok(viewer,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:2});
  const value=(await r.db.query('SELECT sum(quantity*unit_price)::text AS value FROM land_holdings WHERE character_id=$1',[viewer.id])).rows[0]!.value;
  assert.equal((await hallOfChampions(r.db,viewer.id,'land')).own!.score,value);
  await r.ok(viewer,'/api/v1/land/sales',{propertyId:'smallholding',quantity:1});
  assert.equal((await hallOfChampions(r.db,viewer.id,'land')).own!.score,'50');
  const before=await hallOfChampions(r.db,viewer.id,'level');assert.equal(before.entries.length,20);
  await r.prepare(viewer,0,2000);const level=await hallOfChampions(r.db,viewer.id,'level');assert.equal(level.entries[0]!.id,viewer.id);assert.equal(level.own!.rank,'1');
  const page=await r.app.inject({url:'/game/champions?category=land',headers:{cookie:viewer.cookie}});assert.equal(page.statusCode,200,page.body);assert.match(page.body,/Your place/);assert.doesNotMatch(page.body,/balance_after|password_hash|account_id/);
  const api=await r.app.inject({url:'/api/v1/champions?category=land',headers:{cookie:viewer.cookie}});assert.equal(api.statusCode,200);assert.doesNotMatch(api.body,/bankedGold|balance|csrf|accountId/);
  assert.equal((await r.command(viewer,'/api/v1/champions',{score:999999})).statusCode,404);
 }finally{await r.close();}
});
test('Hall handles empty, fewer-than-twenty and uncapped highest-level records; display names are safely escaped',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('New Human'),b=await r.player('Other Human');
  assert.equal((await hallOfChampions(r.db,a.id)).entries.length,0);
  await recorded(r,a,b,'defender_win');assert.equal((await hallOfChampions(r.db,a.id)).entries[0]!.id,b.id);
  await r.db.query('UPDATE characters SET attained_level=75,xp=90000 WHERE id=$1',[a.id]);
  await r.db.query('UPDATE characters SET attained_level=75,xp=91000 WHERE id=$1',[b.id]);
  const hall=await hallOfChampions(r.db,a.id,'level');assert.equal(hall.entries.length,2);assert.equal(hall.entries[0]!.id,b.id);assert.equal(hall.own!.rank,'2');
  await r.db.query('UPDATE characters SET name=$2 WHERE id=$1',[b.id,'<script>alert(1)</script>']);
  const page=await r.app.inject({url:'/game/champions?category=level',headers:{cookie:a.cookie}});assert.equal(page.statusCode,200);assert.ok(!page.body.includes('<script>alert(1)'));assert.match(page.body,/&lt;script&gt;/);
  const anon=await r.app.inject({url:'/api/v1/champions'});assert.equal(anon.statusCode,401);
 }finally{await r.close();}
});
test('historical rivalry totals use stable identities, actual ordinary transfers, separate claims and only five recent human encounters',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Dawn Knight'),b=await r.player('Dusk Knight'),npc=await r.player('Silent Bot');await bot(r,npc);
  await recorded(r,a,b,'attacker_win',100);await recorded(r,b,a,'attacker_win',30);await recorded(r,a,b,'defender_win',0);
  await recorded(r,a,b,'attacker_win',800,false);for(let i=0;i<4;i++)await recorded(r,a,b,'attacker_win',2);
  await recorded(r,a,npc,'attacker_win',50);
  await r.db.query('UPDATE characters SET name=$2 WHERE id=$1',[b.id,'Dusk Renamed']);
  const rivalry=(await rivalryHistory(r.db,a.id,b.id))!;
  assert.equal(rivalry.wins,'6');assert.equal(rivalry.losses,'2');assert.equal(rivalry.goldTaken,'108');assert.equal(rivalry.goldLost,'30');assert.equal(rivalry.unrecordedGold,'1');assert.equal(rivalry.battles.length,5);assert.deepEqual(await rivalryHistory(r.db,a.id.toUpperCase(),b.id.toUpperCase()),rivalry);
  assert.ok(rivalry.battles.every(battle=>battle.attackerName==='Dusk Renamed'||battle.defenderName==='Dusk Renamed'));
  const inverse=(await rivalryHistory(r.db,b.id,a.id))!;assert.equal(inverse.goldTaken,'30');assert.equal(inverse.goldLost,'108');
  assert.equal(await rivalryHistory(r.db,a.id,npc.id),null);assert.equal(await rivalryHistory(r.db,a.id,a.id),null);
  const recent=await recentHumanRivals(r.db,await r.me(a));assert.equal(recent.length,1);assert.equal(recent[0]!.id,b.id);assert.equal(recent[0]!.wins,'6');
  const page=await r.app.inject({url:'/game/players/'+b.id,headers:{cookie:a.cookie}});assert.equal(page.statusCode,200,page.body);assert.match(page.body,/Your Rivalry/);assert.equal((await r.app.inject({url:'/game/players/'+a.id.toUpperCase(),headers:{cookie:a.cookie}})).statusCode,302);assert.match(page.body,/older encounter/);
  const botPage=await r.app.inject({url:'/game/players/'+npc.id,headers:{cookie:a.cookie}});assert.equal(botPage.statusCode,200);assert.doesNotMatch(botPage.body,/Your Rivalry/);
  await r.db.query('UPDATE accounts SET login_disabled=true WHERE id=$1',[b.accountId]);assert.equal(await rivalryHistory(r.db,a.id,b.id),null);assert.equal((await recentHumanRivals(r.db,await r.me(a))).length,0);
  assert.equal((await r.app.inject({url:'/game/players/'+b.id,headers:{cookie:a.cookie}})).statusCode,404);
 }finally{await r.close();}
});
test('actual concurrent and retried combat updates rankings and rivalries once, conserves gold and does not change rewards',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Iron Challenger'),b=await r.player('Moss Defender');await r.prepare(a,30000,2000);await r.prepare(b,10000,2000);
  await r.legacyArmy(a,10);await r.ok(a,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:10});
  await r.db.query('UPDATE characters SET health=1000,max_health=1000,spirit=50,max_spirit=50 WHERE id=ANY($1::uuid[])',[[a.id,b.id]]);
  const beforeA=await r.me(a),beforeB=await r.me(b),key=randomUUID();
  const hits=await Promise.all([r.ok(a,'/api/v1/battles',{targetCharacterId:b.id},key),r.ok(a,'/api/v1/battles',{targetCharacterId:b.id},key)]);assert.equal(hits[0].battleId,hits[1].battleId);
  const result=(await r.db.query('SELECT result FROM battles WHERE id=$1',[hits[0].battleId])).rows[0]!.result;assert.equal(result.outcome,'attacker_win');
  const rivalry=(await rivalryHistory(r.db,a.id,b.id))!;assert.equal(rivalry.wins,'1');assert.equal(rivalry.goldTaken,String(result.loot));
  assert.equal((await hallOfChampions(r.db,a.id)).own!.score,'1');assert.equal((await r.me(a)).gold-beforeA.gold,beforeB.gold-(await r.me(b)).gold);assert.equal((await r.me(a)).spirit,beforeA.spirit-1);
  const changed=await r.command(a,'/api/v1/battles',{targetCharacterId:a.id},key);assert.equal(changed.statusCode,409);
  assert.equal((await r.app.inject({url:'/game/battles/'+hits[0].battleId,headers:{cookie:b.cookie}})).statusCode,200);
 }finally{await r.close();}
});
test('Revenge uses ordinary attack protections and reports preserve equipment snapshots rather than present inventory',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const a=await r.player('Red Attacker'),b=await r.player('Blue Defender'),outsider=await r.player('Third Observer');await r.prepare(a,2000);await r.prepare(b,2000);
  await r.ok(a,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:1});await r.ok(b,'/api/v1/inventory/purchases',{itemId:'padded-coat',quantity:1});
  const hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});const report='/game/battles/'+hit.battleId;
  await r.ok(b,'/api/v1/inventory/sales',{itemId:'padded-coat',quantity:1});
  const incoming=await r.app.inject({url:report,headers:{cookie:b.cookie}});assert.equal(incoming.statusCode,200,incoming.body);assert.match(incoming.body,/>Revenge<\/button>/);
  const outgoing=await r.app.inject({url:report,headers:{cookie:a.cookie}});assert.equal(outgoing.statusCode,200);assert.match(outgoing.body,/Enemy Equipment/);assert.match(outgoing.body,/Padded Coat/);
  assert.doesNotMatch(outgoing.body,/fixed 24-hour sequence|% loot|full-XP budget|botCap|windowStartedAt|rolling day|power modifier|Resolved power/);
  const forged=await r.app.inject({method:'POST',url:'/game/battle/attack',headers:{cookie:b.cookie,origin:'https://evil.invalid'},payload:{csrf:b.csrf,commandId:randomUUID(),targetCharacterId:a.id}});assert.equal(forged.statusCode,403);
  const missing=await r.app.inject({method:'POST',url:'/game/battle/attack',headers:{cookie:b.cookie,origin:'http://localhost:3000'},payload:{targetCharacterId:a.id}});assert.equal(missing.statusCode,403);
  await r.db.query('UPDATE characters SET spirit=0,spirit_updated_at=clock_timestamp() WHERE id=$1',[b.id]);assert.equal((await r.command(b,'/api/v1/battles',{targetCharacterId:a.id})).json().error.code,'INSUFFICIENT_SPIRIT');
  await r.db.query('UPDATE characters SET spirit=3 WHERE id=$1',[b.id]);await r.db.query('UPDATE characters SET health=0,health_updated_at=clock_timestamp() WHERE id=$1',[a.id]);assert.equal((await r.command(b,'/api/v1/battles',{targetCharacterId:a.id})).json().error.code,'OPPONENT_DEFEATED');
  await r.db.query('UPDATE accounts SET login_disabled=true WHERE id=$1',[a.accountId]);const unavailable=await r.app.inject({url:report,headers:{cookie:b.cookie}});assert.equal(unavailable.statusCode,200,unavailable.body);assert.match(unavailable.body,/no longer available/);assert.match(unavailable.body,/disabled[^>]*>Revenge/);
  assert.equal((await r.command(b,'/api/v1/battles',{targetCharacterId:a.id})).json().error.code,'OPPONENT_UNAVAILABLE');
  assert.equal((await r.app.inject({url:report,headers:{cookie:outsider.cookie}})).statusCode,404);
  const legacy=await recorded(r,b,outsider,'attacker_win',0,false);const old=await r.app.inject({url:'/game/battles/'+legacy,headers:{cookie:b.cookie}});assert.equal(old.statusCode,200);assert.match(old.body,/Equipment quantities were not recorded/);
 }finally{await r.close();}
});
test('a committed finishing bounty claim updates one champion claim and one pair claim under concurrent attackers and receipt replay',{skip},async()=>{
 const r=await realm({isolated:true});try{
  const sponsor=await r.player('Banner Sponsor'),hunter=await r.player('Finishing Hunter'),other=await r.player('Second Hunter'),target=await r.player('Bounty Rival');
  for(const player of [sponsor,hunter,other,target]){await r.prepare(player,100000,1000);for(let i=0;i<5;i++)await r.ok(player,'/api/v1/quests/border-patrol/runs');}
  for(const player of [hunter,other]){await r.legacyArmy(player,9);await r.ok(player,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:10});}
  const listing=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100});
  await r.db.query('UPDATE characters SET health=1,health_updated_at=clock_timestamp() WHERE id=$1',[target.id]);
  const keys=[randomUUID(),randomUUID()];const attempts=await Promise.all([r.command(hunter,'/api/v1/battles',{targetCharacterId:target.id},keys[0]),r.command(other,'/api/v1/battles',{targetCharacterId:target.id},keys[1])]);
  assert.deepEqual(attempts.map(result=>result.statusCode).sort(),[200,409]);const index=attempts.findIndex(response=>response.statusCode===200),claimant=index===0?hunter:other;
  await r.ok(claimant,'/api/v1/battles',{targetCharacterId:target.id},keys[index]);
  const hall=await hallOfChampions(r.db,claimant.id,'bounties');assert.equal(hall.own!.score,'1');assert.equal(hall.entries.length,1);
  const pair=(await rivalryHistory(r.db,claimant.id,target.id))!;assert.equal(pair.bountiesClaimed,'1');assert.equal(pair.wins,'1');
  const combat=(await r.db.query('SELECT result FROM battles WHERE id=$1',[attempts[index]!.json().battleId])).rows[0]!.result;
  assert.equal(pair.goldTaken,String(combat.loot));assert.notEqual(pair.goldTaken,String(combat.loot+100));
  assert.equal((await r.me(claimant)).battleStats.kills,1);assert.equal((await r.me(target)).battleStats.deaths,1);
  assert.equal((await r.db.query('SELECT count(*)::int AS n FROM bounty_kills WHERE bounty_id=$1',[listing.data.bountyId])).rows[0]!.n,1);
 }finally{await r.close();}
});
