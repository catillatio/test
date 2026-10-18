import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {realm,testDatabaseUrl,type Player} from './helpers.js';
import {alpha,levelRequirement,areRivals} from '../src/alpha-rules.js';
import {gameplay,victoryExperience45,victoryLoot45} from '../src/gameplay-rules.js';
import {provisionBots,botBlueprint} from '../src/development.js';
import {getState} from '../src/game.js';
import {activeBountyCount,bountyBoard} from '../src/bounties.js';
const skip=!testDatabaseUrl;
const xpFor=(level:number)=>Array.from({length:level-1},(_,i)=>levelRequirement(i+1)).reduce((a,b)=>a+b,0);

test('actual poor, wealthy, high-bot and concurrent victories transfer only exposed gold, preserve Vault and award strength-aware XP once',{skip},async()=>{
 const r=await realm({isolated:true,developmentBotsEnabled:true,clock:()=>new Date('2046-04-01T00:00:00Z')});
 const examples:unknown[]=[];
 try{
  async function fighter(level:number,name:string,copies:number){
   const a=await r.player(name);await r.prepare(a,10000000,xpFor(level));await r.legacyArmy(a,9);
   for(const category of ['weapon','armor','spell']){
    const item=alpha.items.filter(i=>i.category===category&&i.level<=level).sort((a,b)=>(b.attack+b.defense)-(a.attack+a.defense))[0]!;
    await r.ok(a,'/api/v1/inventory/purchases',{itemId:item.id,quantity:copies});
   }
   await r.db.query('UPDATE characters SET health=1000,max_health=1000,spirit=100,max_spirit=100 WHERE id=$1',[a.id]);
   return a;
  }
  async function win(a:Player,b:Player,full=true){
   const beforeA=await r.me(a),beforeB=await r.me(b),key=randomUUID();
   // These are physical inventory/legacy-army fixtures, not a combat override.
   assert.ok(beforeA.attack*90>beforeB.defense*110,'Fixture must guarantee victory at every legal roll.');
   const hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id},key);
   const report=(await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result;
   assert.equal(report.outcome,'attacker_win');assert.equal(report.attackerXp,victoryExperience45(beforeA.level,beforeB.level,full,beforeA.attack,beforeB.defense).amount);
   const afterA=await r.me(a),afterB=await r.me(b);
   assert.equal(afterB.gold,beforeB.gold-report.loot);assert.equal(afterA.gold,beforeA.gold+report.loot);
   assert.equal(afterB.bankedGold,beforeB.bankedGold);assert.equal(afterA.spirit,beforeA.spirit-1);
   assert.equal(afterA.xp,beforeA.xp+report.attackerXp);
   const replay=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id},key);assert.equal(replay.battleId,hit.battleId);assert.equal((await r.me(a)).gold,afterA.gold);
   return {attackerLevel:beforeA.level,defenderLevel:beforeB.level,before:beforeB.gold,stolen:report.loot,remaining:afterB.gold,xp:report.attackerXp,loot:report.lootDetails,xpDetails:report.xpDetails};
  }
  for(const [level,exposed,label] of [[8,300,'poor'],[17,1000000,'wealthy']] as const){
   const a=await fighter(level,'Realm Challenger '+level,10),b=await fighter(level,'Realm Keeper '+level,8);
   await r.ok(b,'/api/v1/vault/deposits',{amount:100000});await r.db.query('UPDATE wallets SET balance=$2 WHERE character_id=$1',[b.id,exposed]);
   const example=await win(a,b);assert.equal(example.stolen,level===8?9:15000);examples.push({case:label,...example});
  }
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
  const a=await fighter(25,'Rival Challenger',5),bot=(await r.db.query("SELECT c.id,c.account_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=29 AND b.tier='green' AND b.variant=0")).rows[0]!;
  // Standard combat attributes are persistent test fixtures, not runtime multipliers.
  // Extra legal legacy troops guarantee the example; selection still uses ten copies.
  let attacker=await r.me(a),target=await getState(r.db,bot.account_id);
  if(attacker.attack*90<=target.defense*110){await r.db.query('UPDATE characters SET attack_training=20 WHERE id=$1',[a.id]);attacker=await r.me(a);}
  assert.ok(attacker.attack*90>target.defense*110);
  const vault=target.bankedGold,hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:bot.id}),report=(await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result;
  assert.equal(report.outcome,'attacker_win');assert.equal(report.loot,victoryLoot45(target.gold,1,true,true,29).amount);
  assert.equal(report.attackerXp,victoryExperience45(25,29,true,attacker.attack,target.defense).amount);
  const after=await getState(r.db,bot.account_id);assert.equal(after.gold,target.gold-report.loot);assert.equal(after.bankedGold,vault);
  examples.push({case:'level25-versus-level29-bot',attackerLevel:25,defenderLevel:29,before:target.gold,stolen:report.loot,remaining:after.gold,xp:report.attackerXp,loot:report.lootDetails,xpDetails:report.xpDetails});
  // Viewing, an obsolete daily-refresh marker and repeat attacks cannot refill gold.
  await r.db.query("UPDATE development_bots SET refilled_at='2000-01-01' WHERE character_id=$1",[bot.id]);
  const repeat=await r.ok(a,'/api/v1/battles',{targetCharacterId:bot.id}),again=(await r.db.query('SELECT result FROM battles WHERE id=$1',[repeat.battleId])).rows[0]!.result;
  assert.equal(again.loot,0);assert.equal(again.attackerXp,1);assert.equal((await getState(r.db,bot.account_id)).gold,after.gold);
  examples.push({case:'repeat-depleted-bot',before:after.gold,stolen:0,remaining:after.gold,xp:again.attackerXp,cap:'one full reward per bot / six bots per rolling 24h'});
  const x=await fighter(17,'Western Challenger',10),y=await fighter(17,'Eastern Challenger',10),d=await fighter(17,'Exposed Keeper',5);
  await r.db.query('UPDATE wallets SET balance=1000 WHERE character_id=$1',[d.id]);const total=(await r.me(x)).gold+(await r.me(y)).gold+1000;
  const keys=[randomUUID(),randomUUID()];const race=await Promise.all([r.ok(x,'/api/v1/battles',{targetCharacterId:d.id},keys[0]),r.ok(y,'/api/v1/battles',{targetCharacterId:d.id},keys[1])]);
  const reports=await Promise.all(race.map(async h=>(await r.db.query('SELECT result FROM battles WHERE id=$1',[h.battleId])).rows[0]!.result));
  assert.deepEqual(reports.map(b=>b.loot).sort((a,b)=>a-b),[29,30]);assert.equal((await r.me(d)).gold,941);
  assert.equal((await r.me(x)).gold+(await r.me(y)).gold+(await r.me(d)).gold,total);
  assert.equal((await r.db.query("SELECT sum(e.amount)::text AS n FROM economy_entries e JOIN economy_transactions t ON t.id=e.transaction_id WHERE t.reason='battle_loot'")).rows[0]!.n,'0');
  examples.push({case:'simultaneous-attacks',before:1000,transfers:reports.map(b=>({gold:b.loot,xp:b.attackerXp})),remaining:941,duplicatedTransfers:0});
  await mkdir('test-results',{recursive:true});await writeFile('test-results/phase45-combat-examples.json',JSON.stringify({ruleset:gameplay.id,examples},null,2)+'\n');
 }finally{await r.close();}
});

test('all 450 unchanged bot estates are solvent; ordinary offline income and real-cost maintenance fund once per saved cycle',{skip},async()=>{
 let now=new Date('2046-04-02T00:00:00Z');const r=await realm({isolated:true,developmentBotsEnabled:true,clock:()=>now});try{
  for(let level=1;level<=50;level++)for(const tier of ['green','seasoned','elite'])for(let variant=0;variant<3;variant++){
   const b=botBlueprint(level,tier,variant);assert.ok(b.netIncome>0);assert.ok(b.participants<=10);assert.ok(b.properties.reduce((n,p)=>n+p.quantity,0)>=3);
  }
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});const human=await r.player('Preserved Human');const humanBefore=await r.me(human);
  const bot=(await r.db.query("SELECT c.id,c.account_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=40 AND b.tier='seasoned' AND b.variant=0")).rows[0]!;
  const before=await getState(r.db,bot.account_id),reserve=Number(before.maintenance.reserveGold);now=new Date(+now+7*3600000);
  const values=await Promise.all([getState(r.db,bot.account_id),getState(r.db,bot.account_id),getState(r.db,bot.account_id)]),after=values[0]!;
  assert.ok(values.every(s=>s.gold===after.gold));assert.equal(after.bankedGold,before.bankedGold);
  assert.equal(after.gold+Number(after.maintenance.reserveGold)-before.gold-reserve,7*before.economy.netHourlyIncome);
  assert.equal((await r.db.query('SELECT count(*)::int AS n FROM bot_finance_events WHERE character_id=$1',[bot.id])).rows[0]!.n,1);
  const saved=await r.db.query('SELECT * FROM land_holdings WHERE character_id=$1 ORDER BY id',[bot.id]);
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});assert.deepEqual((await r.db.query('SELECT * FROM land_holdings WHERE character_id=$1 ORDER BY id',[bot.id])).rows,saved.rows);
  assert.equal((await getState(r.db,bot.account_id)).gold,after.gold);assert.equal((await r.me(human)).gold,humanBefore.gold);
  assert.equal((await r.db.query("SELECT count(*)::int AS n FROM development_bot_events WHERE kind='refresh'")).rows[0]!.n,0);
 }finally{await r.close();}
});

test('bounty badges count only active visible listings across placement, cancellation and exact expiry without historical inflation',{skip},async()=>{
 let now=new Date('2046-04-03T00:00:00Z');const r=await realm({isolated:true,clock:()=>now});try{
  const sponsor=await r.player('Bounty Patron'),target=await r.player('Bounty Subject');for(const p of [sponsor,target]){await r.prepare(p,20000,30);for(let i=0;i<5;i++)await r.ok(p,'/api/v1/quests/border-patrol/runs');}
  const count=()=>activeBountyCount(r.db,now,false);assert.equal((await count()).count,0);
  const listing=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100});assert.equal((await count()).count,1);
  let page=await r.app.inject({method:'GET',url:'/game/battle',headers:{cookie:sponsor.cookie}});assert.match(page.body,/Bounty List \(<span[^>]*>1<\/span>\)/);
  const board=await bountyBoard(r.db,sponsor.id);assert.equal(board.activeCount,1);
  const api=await r.app.inject({method:'GET',url:'/api/v1/me?bounties=1',headers:{cookie:sponsor.cookie}});assert.equal(api.json().bounties.count,1);
  await r.db.query('UPDATE accounts SET login_disabled=true WHERE id=$1',[target.accountId]);assert.equal((await count()).count,0);await r.db.query('UPDATE accounts SET login_disabled=false WHERE id=$1',[target.accountId]);
  const hunter=await r.player('Finishing Hunter');await r.prepare(hunter,20000,30);for(let i=0;i<5;i++)await r.ok(hunter,'/api/v1/quests/border-patrol/runs');await r.legacyArmy(hunter,10);await r.ok(hunter,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:10});
  await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,now]);
  const claimed=await r.ok(hunter,'/api/v1/battles',{targetCharacterId:target.id});assert.equal((await count()).count,0);
  assert.equal((await r.me(hunter)).battleStats.kills,1);assert.equal((await r.me(target)).battleStats.deaths,1);
  const report=(await r.db.query('SELECT result FROM battles WHERE id=$1',[claimed.battleId])).rows[0]!.result;assert.equal(report.bountyClaim.reward,100);
  const cancel=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100});assert.equal((await count()).count,1);
  now=new Date(+now+3600000);await r.ok(sponsor,'/api/v1/bounties/cancellations',{bountyId:cancel.data.bountyId});assert.equal((await count()).count,0);
  await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1});assert.equal((await count()).count,1);now=new Date(+now+86400000);assert.equal((await count()).count,0);
  await Promise.all([bountyBoard(r.db,sponsor.id),bountyBoard(r.db,sponsor.id)]);assert.equal((await count()).count,0);
  page=await r.app.inject({method:'GET',url:'/game/bounties',headers:{cookie:sponsor.cookie}});assert.match(page.body,/Bounty List \(<span[^>]*>0<\/span>\)/);
 }finally{await r.close();}
});

test('bounty count covers more than the display page and disabled rivals; all expiry batches refund principal once',{skip},async()=>{
 let now=new Date('2046-04-04T00:00:00Z');const r=await realm({isolated:true,clock:()=>now,developmentBotsEnabled:true,developmentBotBountiesEnabled:true});try{
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});const a=await r.player('Realm Patron');await r.prepare(a,100000,xpFor(40));for(let i=0;i<5;i++)await r.ok(a,'/api/v1/quests/border-patrol/runs');
  const targets=(await r.db.query('SELECT c.id,c.attained_level AS level FROM development_bots d JOIN characters c ON c.id=d.character_id ORDER BY c.attained_level,c.id')).rows.filter(c=>areRivals(40,c.level)).slice(0,101);assert.equal(targets.length,101);
  const before=(await r.me(a)).gold;for(const target of targets)await r.ok(a,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1});
  assert.equal((await activeBountyCount(r.db,now,true)).count,101);assert.equal((await activeBountyCount(r.db,now,false)).count,0);
  const board=await bountyBoard(r.db,a.id,true);assert.equal(board.active.length,100);assert.equal(board.activeCount,101);assert.equal((await r.me(a)).gold,before-202);
  await r.db.query('UPDATE development_bots SET active=false WHERE character_id=$1',[targets[0]!.id]);assert.equal((await activeBountyCount(r.db,now,true)).count,100);
  now=new Date(+now+86400000);assert.equal((await activeBountyCount(r.db,now,true)).count,0);
  await Promise.all([bountyBoard(r.db,a.id,true),bountyBoard(r.db,a.id,true)]);assert.equal((await r.me(a)).gold,before-101);
  assert.equal((await r.db.query("SELECT count(*)::int AS n FROM bounties WHERE sponsor_id=$1 AND status='expired'",[a.id])).rows[0]!.n,101);
 }finally{await r.close();}
});
