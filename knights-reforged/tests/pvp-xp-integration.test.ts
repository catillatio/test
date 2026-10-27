import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {competitionFixture} from './phase6-fixtures.js';
import {testDatabaseUrl,type Player} from './helpers.js';
import {transaction} from '../src/db.js';
import {lockCharacters} from '../src/game.js';
import {prepareVictoryXp,recordVictoryXp} from '../src/pvp-xp.js';
import {humanVictoryLoot} from '../src/human-pvp-loot.js';
const skip=!testDatabaseUrl;

test('real attacks keep gold, costs, three-win quota, immutable reports, retry and rollback',{skip},async()=>{
 const r=await competitionFixture();try{
  const a=await r.player('Strong Attacker',50),b=await r.player('Easy Rival',50);
  await r.legacyArmy(a,20);await r.ok(a,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:20});
  await r.db.query('UPDATE characters SET max_health=1000,health=1000,max_spirit=100,spirit=100,level_xp=0');
  const state=await r.me(a),target=await r.me(b);assert.ok(target.defense/state.attack<.35);
  const old=(await r.db.query('SELECT xp FROM characters WHERE id=$1',[a.id])).rows[0]!.xp;
  const records=[];
  for(let n=1;n<=4;n++){
   const before=await r.me(a),other=await r.me(b),key=randomUUID(),hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id},key);
   const row=(await r.db.query('SELECT * FROM battles WHERE id=$1',[hit.battleId])).rows[0]!,d=row.result;
   assert.equal(d.outcome,'attacker_win');assert.equal(d.loot,humanVictoryLoot(other.gold,n).amount);
   assert.equal(d.spiritSpent,1);assert.equal(hit.state.spirit,before.spirit-1);assert.equal(hit.state.health,d.attackerHealthAfterDamage);
   assert.equal(d.rewarded,n<=3);assert.equal(d.xpDetails.reason,n===4?'repeat_budget':d.xpDetails.reason);
   if(n===1)assert.ok(d.attackerXp>1);if(n===4)assert.equal(d.attackerXp,1);
   assert.equal((await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id},key)).battleId,hit.battleId);
   records.push(row);
  }
  assert.equal((await r.db.query('SELECT count(*)::int n FROM pvp_xp_events')).rows[0]!.n,4);
  assert.equal((await r.me(a)).xp,old+records.reduce((s,b)=>s+b.result.attackerXp,0));
  const saved=(await r.db.query('SELECT * FROM battles ORDER BY id')).rows;
  await r.db.query('UPDATE characters SET spirit=0 WHERE id=$1',[a.id]);
  assert.equal((await r.command(a,'/api/v1/battles',{targetCharacterId:b.id})).statusCode,409);
  assert.deepEqual((await r.db.query('SELECT * FROM battles ORDER BY id')).rows,saved);
  assert.equal((await r.db.query('SELECT count(*)::int n FROM pvp_xp_events')).rows[0]!.n,4);
  // Existing lifetime XP is never re-derived. Only the one remaining integer
  // slot can be credited, and an uncredited nominal bonus must spend no budget.
  r.advance(86400);
  await r.db.query('UPDATE characters SET xp=2147483646 WHERE id=$1',[a.id]);
  const capped=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});
  const capBattle=(await r.db.query('SELECT result FROM battles WHERE id=$1',[capped.battleId])).rows[0]!.result;
  const capEvent=(await r.db.query('SELECT bonus_xp,budget_units FROM pvp_xp_events WHERE battle_id=$1',[capped.battleId])).rows[0]!;
  assert.ok(capBattle.xpDetails.amount>1);assert.equal(capBattle.attackerXp,1);assert.equal(capped.state.xp,2147483647);
  assert.deepEqual(capEvent,{bonus_xp:0,budget_units:0});
 }finally{await r.close();}
});

test('durable account budget serializes fresh targets and both roles, rolls back and expires exactly at 24h',{skip},async()=>{
 const r=await competitionFixture();try{
  const a=await r.player('Bonus Recipient',50),b=await r.player('Cooperator One',50),c=await r.player('Cooperator Two',50);
  const award=(target:Player,role:'attacker'|'defender',fail=false)=>transaction(r.db,async sql=>{
   const rows=await lockCharacters(sql,[a.id,target.id]),recipient=rows.find(x=>x.id===a.id)!,opponent=rows.find(x=>x.id===target.id)!,id=randomUUID();
   const d=await prepareVictoryXp(sql,recipient,opponent,{level:50,opponentLevel:50,power:10000,opponentPower:3499,eligible:true},r.now());
   await recordVictoryXp(sql,id,recipient,opponent,role,d,d.amount,r.now());
   if(fail)throw Error('fixture rollback');
   await sql.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,rewarded,created_at) VALUES($1,$2,$3,'alpha-0.3',$4,'{}','{}',true,$5)",[id,role==='attacker'?a.id:target.id,role==='attacker'?target.id:a.id,role==='attacker'?'attacker_win':'defender_win',r.now()]);
   return d;
  });
  await assert.rejects(award(b,'attacker',true),/fixture rollback/);
  assert.equal((await r.db.query('SELECT count(*)::int n FROM pvp_xp_events')).rows[0]!.n,0);
  const d=await Promise.all([award(b,'attacker'),award(c,'defender')]);
  assert.ok(d.reduce((s,x)=>s+x.bonusAmount,0)<=200);assert.equal(d.reduce((s,x)=>s+x.bonusAmount,0),200);
  assert.equal((await award(b,'defender')).bonusAmount,0);
  r.advance(86399.999);assert.equal((await award(c,'attacker')).bonusAmount,0);
  r.advance(.001);assert.ok((await award(b,'defender')).bonusAmount>0);
 }finally{await r.close();}
});

test('coordinated attacking losses give zero XP and no defender resource refill',{skip},async()=>{
 const r=await competitionFixture();try{
  const a=await r.player('Cooperating Attacker',50),b=await r.player('Defensive Victor',50);
  await r.legacyArmy(b,20);await r.ok(b,'/api/v1/inventory/purchases',{itemId:'frostweave-mantle',quantity:20});
  await r.db.query('UPDATE characters SET max_health=1000,health=800,max_spirit=100,spirit=90,level_xp=0');
  const before=await r.me(b),hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});
  const saved=(await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result;
  assert.equal(saved.outcome,'defender_win');assert.equal(saved.attackerXp,0);assert.equal(saved.loot,0);
  assert.equal((await r.me(b)).spirit,before.spirit);assert.equal((await r.me(b)).health,saved.defenderHealthAfter);
  assert.ok(saved.defenderXpDetails.budgetUnits>0,JSON.stringify(saved.defenderXpDetails));assert.equal(saved.defenderFullXp,true);
  for(let n=2;n<=4;n++){
   const next=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});
   const d=(await r.db.query('SELECT result FROM battles WHERE id=$1',[next.battleId])).rows[0]!.result;
   assert.equal(d.attackerXp,0);assert.equal(d.defenderFullXp,n<=3);
   if(n===4){assert.equal(d.defenderXp,1);assert.equal(d.defenderXpDetails.reason,'repeat_budget');}
  }
 }finally{await r.close();}
});
