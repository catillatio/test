import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
import {botCombat,previousBotCombat,botVictoryRewards} from '../src/bot-combat-rules.js';
import {battleRewardNotes} from '../src/battle-reward-notes.js';
import {victoryLoot45} from '../src/gameplay-rules.js';
import {victoryExperience47} from '../src/game-feel-rules.js';
import {getState} from '../src/game.js';
import {provisionBots} from '../src/development.js';
import {realm,testDatabaseUrl} from './helpers.js';
const skip=!testDatabaseUrl;
const xpFor=(level:number)=>Array.from({length:level-1},(_,i)=>levelRequirement(i+1)).reduce((s,x)=>s+x,0);

test('bot v2 preserves gold, scales difficulty XP to 65% before pair reductions and floors both awards',()=>{
 for(const level of [1,8,17,25,40,50])for(const gold of [0,20,33,34,300,5946,100000,2147483647]){
  const first=botVictoryRewards(gold,level,level,1,100,100);
  assert.equal(first.loot.amount,victoryLoot45(gold,1,true,true,level).amount);
  assert.equal(first.xp.amount,Math.max(1,Math.floor(victoryExperience47(level,level).amount*.65)));
  assert.equal(first.xp.unreducedAmount,victoryExperience47(level,level).amount);assert.equal(first.xp.fullXpPercent,65);assert.equal(first.xp.scaledFullAmount,first.xp.amount);
  for(const n of [2,3,4,5,6,100]){const r=botVictoryRewards(gold,level,level,n,100,100),m=[100,85,70,55,40][Math.min(n-1,4)]!;
   assert.equal(r.loot.amount,Math.floor(first.loot.amount*m/100));assert.equal(r.xp.amount,Math.max(1,Math.floor(first.xp.amount*m/100)));
   assert.ok(r.loot.amount<=gold);assert.equal(r.loot.multiplier,m);assert.equal(r.xp.rulesetId,botCombat.id);
  }
 }
 assert.deepEqual([1,2,3,4,5,6].map(n=>botVictoryRewards(100000,17,17,n,100,100).loot.amount),[411,349,287,226,164,164]);
 for(const n of [0,-1,1.1,NaN,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>botVictoryRewards(100,17,17,n,100,100),RangeError);
});
test('empty wallets do not suppress difficulty XP, and trivial victories never gain XP for looking decisive',()=>{
 assert.equal(botVictoryRewards(0,25,25,1,100,100).xp.amount,68);
 assert.equal(botVictoryRewards(100000,25,25,1,100,34).xp.amount,1);
 assert.equal(botVictoryRewards(100000,25,25,1,100,35).xp.amount,33);
 assert.deepEqual(botVictoryRewards(1000,17,17,2,100,34).xp.reductionReasons,['repeat_opponent','overwhelming_advantage']);
 assert.equal(botVictoryRewards(1000,25,29,1,100,80).xp.amount,76);
 // The original human formulas and sequence are preserved.
 assert.deepEqual([1,2,3,4,5].map(n=>victoryLoot45(100000,n).multiplier),[100,75,50,25,10]);
 assert.equal(victoryExperience47(17,17,false).amount,1);
});
test('report notes distinguish repeat, low strength and purse poverty without internal calculations',()=>{
 const base={botRewardEligibilityPolicy:botCombat.id,outcome:'attacker_win',loot:20,lootDetails:{multiplier:100},xpDetails:{trivial:false}};
 assert.deepEqual(battleRewardNotes(base,true),[]);
 assert.deepEqual(battleRewardNotes({...base,botRewardEligibilityPolicy:previousBotCombat.id,lootDetails:{multiplier:85}},true),['Reduced rewards from repeated battles with this rival.']);
 assert.deepEqual(battleRewardNotes({...base,xpDetails:{trivial:true}},true),['Less experience against a much weaker opponent.']);
 assert.deepEqual(battleRewardNotes({...base,lootDetails:{multiplier:85}},true),['Reduced rewards from repeated battles with this rival.']);
 assert.equal(battleRewardNotes({...base,loot:0,lootDetails:{multiplier:40},xpDetails:{trivial:true}},true).length,3);
 assert.deepEqual(battleRewardNotes({...base,outcome:'defender_win',rewarded:false},true),[]);
 assert.deepEqual(battleRewardNotes(base,false),[]);
 assert.deepEqual(battleRewardNotes({rewarded:false},true),['Reduced rewards from repeated battles.']);
 assert.deepEqual(battleRewardNotes({rewarded:true,xpDetails:{trivial:true}},true),['Less experience against a much weaker opponent.']);
 assert.deepEqual(battleRewardNotes({defenderXpDetails:{trivial:true}},false),['Less experience against a much weaker opponent.']);
});

async function fighter(r:Awaited<ReturnType<typeof realm>>,name:string){
 const a=await r.player(name);await r.prepare(a,250000,xpFor(17));await r.legacyArmy(a,3);
 for(const category of ['weapon','armor','spell']){const item=alpha.items.filter(i=>i.category===category&&i.level<=17).sort((a,b)=>b.attack-a.attack||b.defense-a.defense)[0]!;await r.ok(a,'/api/v1/inventory/purchases',{itemId:item.id,quantity:4});}
 await r.db.query('UPDATE characters SET health=1000,max_health=1000,spirit=100,max_spirit=100 WHERE id=$1',[a.id]);return a;
}
test('more than six different meaningful rivals pay, repeated XP/gold match snapshots, exact boundary resets and old receipts replay',{skip},async()=>{
 let now=new Date('2049-01-01T00:00:00Z');const r=await realm({isolated:true,developmentBotsEnabled:true,clock:()=>now});try{
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});const a=await fighter(r,'Meaningful Challenger'),start=await r.me(a);
  const bots=(await r.db.query('SELECT c.id,c.account_id FROM characters c JOIN development_bots b ON b.character_id=c.id WHERE c.attained_level BETWEEN 16 AND 18 ORDER BY c.id')).rows;
  const candidates:{id:string}[]=[];for(const bot of bots){const s=await getState(r.db,bot.account_id);if(start.attack*90>s.defense*110&&s.defense/start.attack>=.35)candidates.push({id:bot.id});}
  assert.ok(candidates.length>=9,'nine distinct nontrivial guaranteed-win fixtures');
  async function hit(id:string,key=randomUUID()){
   const before=await r.me(a),result=await r.ok(a,'/api/v1/battles',{targetCharacterId:id},key),row=(await r.db.query('SELECT * FROM battles WHERE id=$1',[result.battleId])).rows[0]!,b=row.result;
   const expected=botVictoryRewards(row.snapshot.defender.gold,row.snapshot.attacker.level,row.snapshot.defender.level,b.lootDetails.victory,row.snapshot.attacker.attack,row.snapshot.defender.defense);
   assert.equal(b.outcome,'attacker_win');assert.equal(row.rewarded,true);assert.equal(b.loot,expected.loot.amount);assert.equal(b.attackerXp,expected.xp.amount);
   assert.equal(result.state.xp,before.xp+b.attackerXp);assert.equal(result.state.gold,before.gold+b.loot);assert.equal(b.botRewardEligibilityPolicy,botCombat.id);
   assert.equal(result.state.spirit,b.levelGained?result.state.maxSpirit:before.spirit-1);
   return {row,b,result,key};
  }
  const records=[];for(const bot of candidates.slice(0,9)){const h=await hit(bot.id);assert.ok(h.b.loot>0);assert.ok(h.b.attackerXp>1);assert.equal(h.b.lootDetails.multiplier,100);records.push(h);}
  const target=candidates[0]!.id;await r.db.query('UPDATE characters SET health=1000,max_health=1000 WHERE id=$1',[target]);
  await r.db.query('UPDATE pvp_loot_sequences SET ruleset_id=$3 WHERE attacker_id=$1 AND defender_id=$2',[a.id,target,previousBotCombat.id]);
  for(const m of [85,70,55,40,40,40])assert.equal((await hit(target)).b.lootDetails.multiplier,m);
  await r.db.query("UPDATE characters SET name='Renamed Rival' WHERE id=$1",[target]);
  now=new Date('2049-01-01T23:59:59.999Z');assert.equal((await hit(target)).b.lootDetails.multiplier,40);
  now=new Date('2049-01-02T00:00:00Z');const reset=await hit(target);assert.equal(reset.b.lootDetails.victory,1);assert.equal(reset.b.lootDetails.multiplier,100);
  const historical=records[0]!,saved=JSON.stringify(historical.row),beforeReplay=await r.me(a);
  const replay=await r.ok(a,'/api/v1/battles',{targetCharacterId:historical.row.defender_id},historical.key);
  assert.equal(replay.battleId,historical.b.id);assert.equal((await r.me(a)).xp,beforeReplay.xp);assert.equal((await r.me(a)).gold,beforeReplay.gold);
  assert.equal(JSON.stringify((await r.db.query('SELECT * FROM battles WHERE id=$1',[historical.b.id])).rows[0]),saved);
  const page=await r.app.inject({url:'/game/battles/'+reset.b.id,headers:{cookie:a.cookie}});
  assert.equal(page.statusCode,200);assert.ok(!page.body.includes('Reduced rewards from repeated battles with this rival.'));
  assert.match(page.body,new RegExp('data-reward-count="'+reset.b.attackerXp+'"'));
  await r.db.query('UPDATE wallets SET balance=0 WHERE character_id=$1',[target]);
  const empty=await hit(target);assert.equal(empty.b.loot,0);assert.ok(empty.b.attackerXp>1);
  const emptyPage=await r.app.inject({url:'/game/battles/'+empty.b.id,headers:{cookie:a.cookie}});
  assert.equal(emptyPage.statusCode,200);assert.match(emptyPage.body,/This rival had too little unprotected gold to steal/);
  assert.match(emptyPage.body,/Reduced rewards from repeated battles with this rival/);assert.ok(!emptyPage.body.includes('Less experience against a much weaker opponent.'));
  const publicRules=await r.app.inject({url:'/rules'});assert.equal(publicRules.statusCode,200);assert.match(publicRules.body,/Bot ordinary gold uses/);assert.ok(!publicRules.body.includes('once per rival and six times total'));
  const rivals=await r.app.inject({url:'/game/battle',headers:{cookie:a.cookie}});assert.equal(rivals.statusCode,200);assert.match(rivals.body,/Different rivals do not share a daily reward limit/);assert.ok(!rivals.body.includes('At most six rewarded bot victories'));
 }finally{await r.close();}
});
test('two accounts serialize the real purse; duplicate keys and insufficient-Spirit races cannot duplicate transfer, XP or sequence',{skip},async()=>{
 const now=new Date('2049-02-01T00:00:00Z'),r=await realm({isolated:true,developmentBotsEnabled:true,clock:()=>now});try{
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});const a=await fighter(r,'West Challenger'),b=await fighter(r,'East Challenger');
  const target=(await r.db.query("SELECT c.id FROM characters c JOIN development_bots d ON d.character_id=c.id WHERE c.attained_level=17 AND d.tier='seasoned' AND d.variant=0")).rows[0]!.id;
  await r.db.query('UPDATE wallets SET balance=1000 WHERE character_id=$1',[target]);await r.db.query('UPDATE characters SET health=1000,max_health=1000 WHERE id=$1',[target]);
  const protectedBefore=(await r.db.query('SELECT balance FROM vault_accounts WHERE character_id=$1',[target])).rows[0]!.balance;
  const beforeA=await r.me(a),beforeB=await r.me(b),key=randomUUID();
  const responses=await Promise.all([r.ok(a,'/api/v1/battles',{targetCharacterId:target},key),r.ok(a,'/api/v1/battles',{targetCharacterId:target},key),r.ok(b,'/api/v1/battles',{targetCharacterId:target})]);
  assert.equal(responses[0].battleId,responses[1].battleId);
  const rows=(await r.db.query('SELECT result FROM battles WHERE defender_id=$1 ORDER BY created_at,id',[target])).rows.map(x=>x.result);
  assert.equal(rows.length,2);assert.deepEqual(rows.map(x=>x.loot).sort((x,y)=>x-y),[29,30]);assert.ok(rows.every(x=>x.lootDetails.multiplier===100&&x.attackerXp>1));
  assert.equal((await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[target])).rows[0]!.balance,941);
  const afterA=await r.me(a),afterB=await r.me(b);assert.equal(afterA.gold+afterB.gold-beforeA.gold-beforeB.gold,59);
  assert.equal(afterA.spirit,beforeA.spirit-1);assert.equal(afterB.spirit,beforeB.spirit-1);
  assert.equal((await r.db.query('SELECT balance FROM vault_accounts WHERE character_id=$1',[target])).rows[0]!.balance,protectedBefore);
  await r.db.query('UPDATE characters SET spirit=1 WHERE id=$1',[a.id]);
  const race=await Promise.all([r.command(a,'/api/v1/battles',{targetCharacterId:target}),r.command(a,'/api/v1/battles',{targetCharacterId:target})]);
  assert.deepEqual(race.map(x=>x.statusCode).sort(),[200,409]);assert.equal(race.find(x=>x.statusCode===409)!.json().error.code,'INSUFFICIENT_SPIRIT');
  assert.equal(Number((await r.db.query('SELECT victories FROM pvp_loot_sequences WHERE attacker_id=$1 AND defender_id=$2',[a.id,target])).rows[0]!.victories),2);
  // A real level-up may refill Spirit, but it must not revive the defeated bot
  // or let client-supplied reward fields influence its award.
  const current=await r.me(a),progress=levelRequirement(current.level)-1;
  await r.db.query('UPDATE characters SET xp=$2,level_xp=$3,spirit=1,health=20 WHERE id=$1',[a.id,xpFor(current.level)+progress,progress]);
  await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target,now]);
  const hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:target,gold:999999,xp:999999,multiplier:100}),battle=(await r.db.query('SELECT snapshot,result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!;
  const expected=botVictoryRewards(battle.snapshot.defender.gold,current.level,battle.snapshot.defender.level,battle.result.lootDetails.victory,battle.snapshot.attacker.attack,battle.snapshot.defender.defense);
  assert.equal(battle.result.attackerXp,expected.xp.amount);assert.equal(battle.result.loot,expected.loot.amount);assert.equal(hit.state.level,current.level+1);
  assert.equal(hit.state.spirit,hit.state.maxSpirit);assert.equal(hit.state.health,hit.state.maxHealth);assert.equal(battle.result.defenderHealthAfter,0);
  assert.equal((await r.command(a,'/api/v1/battles',{targetCharacterId:target})).json().error.code,'OPPONENT_DEFEATED');
 }finally{await r.close();}
});
