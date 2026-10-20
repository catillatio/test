import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {provisionBots} from '../src/development.js';
import {strategy} from '../src/strategy-rules.js';
const skip=!testDatabaseUrl;

test('bot losses preserve the unchanged victory allowance, including immutable legacy loss receipts',{skip},async()=>{
 let now=new Date('2048-01-01T00:00:00Z');
 const r=await realm({isolated:true,developmentBotsEnabled:true,clock:()=>now});try{
  const actor=await r.player('Determined Learner');await r.prepare(actor,100000,30);
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
  const bots=(await r.db.query("SELECT c.id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=3 ORDER BY b.tier,b.variant")).rows;
  const target=bots[0]!.id;
  const report=async(id:string)=>(await r.db.query('SELECT * FROM battles WHERE id=$1',[id])).rows[0]!;
  const first=await r.ok(actor,'/api/v1/battles',{targetCharacterId:target}),loss=await report(first.battleId);
  assert.equal(loss.outcome,'defender_win');assert.equal(loss.rewarded,false);assert.equal(loss.result.loot,0);assert.equal(loss.result.attackerXp,0);
  // Emulate the prior release's immutable rewarded=true loss. The command
  // must ignore its allowance flag without rewriting that historical record.
  await r.db.query('UPDATE battles SET rewarded=true,result=jsonb_set(result,\'{rewarded}\',\'true\') WHERE id=$1',[loss.id]);
  const historical=await report(loss.id);
  // Explicit test-only strength/resource fixture. No production grant path.
  await r.legacyArmy(actor,9);
  for(const itemId of ['iron-sword','padded-coat','hearth-ward'])await r.ok(actor,'/api/v1/inventory/purchases',{itemId,quantity:10});
  await r.db.query('UPDATE characters SET attack_training=25,max_spirit=100,spirit=100,health=max_health WHERE id=$1',[actor.id]);
  const key=randomUUID(),before=(await r.me(actor)).gold;
  const race=await Promise.all([r.ok(actor,'/api/v1/battles',{targetCharacterId:target},key),r.ok(actor,'/api/v1/battles',{targetCharacterId:target},key)]);
  assert.equal(race[0].battleId,race[1].battleId);
  const win=await report(race[0].battleId);assert.equal(win.outcome,'attacker_win');assert.equal(win.rewarded,true);assert.ok(win.result.loot>0);
  assert.equal((await r.me(actor)).gold,before+win.result.loot);
  assert.deepEqual(await report(loss.id),historical,'no historical outcome or receipt is rewritten');
  const again=await report((await r.ok(actor,'/api/v1/battles',{targetCharacterId:target})).battleId);
  assert.equal(again.rewarded,false);assert.equal(again.result.loot,0);assert.equal(again.result.attackerXp,1);
  // Distinct simultaneous wins share the same actor-locked rolling budget.
  const results=await Promise.all(bots.slice(1,8).map(bot=>r.ok(actor,'/api/v1/battles',{targetCharacterId:bot.id})));
  const wins=await Promise.all(results.map(result=>report(result.battleId)));
  assert.equal(1+wins.filter(b=>b.rewarded).length,strategy.bots.dailyRewardedBattles);
  assert.equal(strategy.bots.dailyRewardedBattles,6);assert.equal(strategy.bots.perTargetRewardedBattles,1);
  for(const battle of wins.filter(b=>!b.rewarded)){assert.equal(battle.result.loot,0);assert.equal(battle.result.attackerXp,1);}
  const resetTarget=bots[8]!.id;
  const exhausted=await report((await r.ok(actor,'/api/v1/battles',{targetCharacterId:resetTarget})).battleId);
  assert.equal(exhausted.rewarded,false);assert.equal(exhausted.result.loot,0);
  now=new Date(+now+86400001);
  const fresh=await report((await r.ok(actor,'/api/v1/battles',{targetCharacterId:resetTarget})).battleId);
  assert.equal(fresh.rewarded,true);assert.ok(fresh.result.loot>0);
  assert.equal((await r.db.query("SELECT count(*)::int n FROM economy_entries e JOIN economy_transactions t ON t.id=e.transaction_id WHERE t.reason='battle_loot' AND e.character_id=$1 AND e.amount<0",[actor.id])).rows[0]!.n,0);
 }finally{await r.close();}
});
