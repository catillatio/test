import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl,type Player} from './helpers.js';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
import {rules} from '../src/rules.js';
import {callingPower} from '../src/strategy-rules.js';

const xpFor=(level:number)=>Array.from({length:level-1},(_,index)=>levelRequirement(index+1)).reduce((n,xp)=>n+xp,0);
describe('Fantasy tiers, transactions and persistent progression',{skip:!testDatabaseUrl},()=>{
  let r:Awaited<ReturnType<typeof realm>>;before(async()=>{r=await realm();});after(async()=>{if(r)await r.close();});
  async function tierPlayer(level:number){const p=await r.player('Tier '+level+' Knight');await r.prepare(p,1000000,xpFor(level));return p;}
  test('equipment and properties at levels 1, 10, 20, 30, 40 and 50 are functional, not decorative',async()=>{
    for(const level of [1,10,20,30,40,50]){
      const p=await tierPlayer(level);await r.legacyArmy(p,2);
      const chosen=['weapon','armor','spell'].map(category=>alpha.items.filter(item=>item.category===category&&item.level<=level).sort((a,b)=>b.level-a.level||b.price-a.price)[0]!);
      for(const item of chosen)await r.ok(p,'/api/v1/inventory/purchases',{itemId:item.id,quantity:3});
      const before=await r.me(p);assert.equal(before.level,level);assert.equal(before.army.participants,3);
      assert.equal(before.attack,callingPower(rules.baseAttack+(level-1)*rules.attackPerLevel+2*rules.unit.attack+chosen.reduce((n,item)=>n+3*item.attack,0),before.calling.attackPercent));
      assert.equal(before.defense,callingPower(rules.baseDefense+(level-1)*rules.defensePerLevel+2*rules.unit.defense+chosen.reduce((n,item)=>n+3*item.defense,0),before.calling.defensePercent));
      for(const item of chosen){const sale=await r.ok(p,'/api/v1/inventory/sales',{itemId:item.id,quantity:1});assert.equal(sale.data.goldReceived,Math.floor(item.price*2/3));assert.equal(sale.state.inventory.find((owned:{id:string})=>owned.id===item.id).quantity,2);}
      const property=alpha.properties.filter(p=>p.level<=level).at(-1)!;
      await r.ok(p,'/api/v1/land/purchases',{propertyId:property.id,quantity:2});
      const balance=await r.me(p);
      await r.db.query("UPDATE land_holdings SET acquired_at=statement_timestamp()-interval '1 hour',accrued_through=statement_timestamp()-interval '1 hour' WHERE character_id=$1",[p.id]);
      await r.db.query("UPDATE maintenance_accounts SET settled_at=clock_timestamp()-interval '1 hour',remainder=0 WHERE character_id=$1",[p.id]);
      await r.db.query('DELETE FROM income_cycles WHERE character_id=$1',[p.id]); // Re-adopt the explicitly aged fixture clock.
      const paid=await r.me(p),wealth=(state:typeof paid)=>BigInt(state.gold)+BigInt(state.maintenance.reserveGold);
      assert.equal(wealth(paid)-wealth(balance),BigInt(2*(property.hourlyIncome-property.hourlyUpkeep)-balance.maintenance.hourlyRate));
      // Same-instant bulk contracts now preserve their actual purchase order.
      const firstContract=(await r.db.query('SELECT id,unit_price FROM land_holdings WHERE character_id=$1 AND property_id=$2 AND quantity>0 ORDER BY acquired_at,purchase_order,id LIMIT 1',[p.id,property.id])).rows[0]!;
      assert.equal(firstContract.unit_price,property.price);
      const sale=await r.ok(p,'/api/v1/land/sales',{propertyId:property.id,quantity:1});assert.equal(sale.data.goldReceived,Math.floor(firstContract.unit_price/2));
      assert.equal((await r.db.query('SELECT quantity FROM land_holdings WHERE id=$1',[firstContract.id])).rows[0]!.quantity,0);
      assert.equal(sale.state.land.properties.find((owned:{id:string})=>owned.id===property.id).owned,1);
    }
  });
  test('quantity-gated quests buy only missing copies and story loot is earned in a separate action',async()=>{
    const p=await tierPlayer(14);await r.legacyArmy(p,4);
    await r.ok(p,'/api/v1/inventory/purchases',{itemId:'argent-sentinel-plate',quantity:1});
    let rejected=await r.command(p,'/api/v1/quests/stand-argent-gate/runs');assert.equal(rejected.json().error.code,'MISSING_EQUIPMENT');
    const bought=await r.ok(p,'/api/v1/quests/stand-argent-gate/equipment');assert.equal(bought.data.goldSpent,480);assert.equal(bought.state.questsCompleted,0);
    rejected=await r.command(p,'/api/v1/quests/stand-argent-gate/runs');assert.equal(rejected.json().error.code,'LOOT_REQUIRED');assert.match(rejected.json().error.message,/Rune Prism/);
    await r.ok(p,'/api/v1/quests/decode-first-runes/equipment');const found=await r.ok(p,'/api/v1/quests/decode-first-runes/runs');assert.equal(found.data.loot,'Rune Prism');
    const run=await r.ok(p,'/api/v1/quests/stand-argent-gate/runs');assert.equal(run.data.xp,42);assert.ok(run.data.gold>=130&&run.data.gold<=180);assert.equal(run.state.inventory.find((item:{id:string})=>item.id==='argent-sentinel-plate').quantity,2);
  });
  test('the level-50 finale enforces its discovery, equipment, army and Mana requirements and persists rewards',async()=>{
    const p=await tierPlayer(50);await r.legacyArmy(p,17);
    assert.equal((await r.command(p,'/api/v1/quests/defy-eclipsed-sovereign/runs')).json().error.code,'MISSING_EQUIPMENT');
    await r.ok(p,'/api/v1/quests/defy-eclipsed-sovereign/equipment');
    assert.equal((await r.command(p,'/api/v1/quests/defy-eclipsed-sovereign/runs')).json().error.code,'LOOT_REQUIRED');
    await r.ok(p,'/api/v1/quests/hold-last-meridian/equipment');await r.ok(p,'/api/v1/quests/hold-last-meridian/runs');
    assert.equal((await r.command(p,'/api/v1/quests/defy-eclipsed-sovereign/runs')).json().error.code,'INSUFFICIENT_MANA');
    await r.db.query("UPDATE characters SET mana_updated_at=clock_timestamp()-interval '2 hours' WHERE id=$1",[p.id]);
    const key=randomUUID(),result=await r.ok(p,'/api/v1/quests/defy-eclipsed-sovereign/runs',{},key);
    assert.equal(result.data.xp,230);assert.ok(result.data.gold>=1450&&result.data.gold<=1950);assert.equal(result.state.level,50);
    assert.ok(result.state.loot.some((loot:{id:string})=>loot.id==='eclipse-key'));
    assert.equal((await r.ok(p,'/api/v1/quests/defy-eclipsed-sovereign/runs',{},key)).state.questsCompleted,2);
    const row=(await r.db.query("SELECT * FROM quest_runs WHERE character_id=$1 AND quest_id='defy-eclipsed-sovereign'",[p.id])).rows[0]!;assert.equal(row.ruleset_id,alpha.id);assert.equal(row.gold_reward,result.data.gold);
  });
  test('new level milestones grant once, preserve spent points and the level-55 estate remains gated',async()=>{
    const p=await tierPlayer(50);let state=await r.me(p);const points=state.skillPoints;
    const {migrate}=await import('../src/migrate.js');await migrate(r.db);state=await r.me(p);assert.equal(state.skillPoints,points+8);
    await r.ok(p,'/api/v1/skills',{resource:'mana'});const spent=(await r.me(p)).skillPoints;await migrate(r.db);assert.equal((await r.me(p)).skillPoints,spent);
    assert.equal((await r.command(p,'/api/v1/land/purchases',{propertyId:'worldroot-bastion',quantity:1})).json().error.code,'LEVEL_REQUIRED');
    await r.prepare(p,0,xpFor(55)-xpFor(50));await r.ok(p,'/api/v1/land/purchases',{propertyId:'worldroot-bastion',quantity:1});assert.equal((await r.me(p)).land.hourlyIncome,3400);
  });
  test('extreme legitimate property batches reject with a transaction error, not SQL overflow',async()=>{
    const p=await tierPlayer(55);await r.ok(p,'/api/v1/land/purchases',{propertyId:'worldroot-bastion',quantity:1});
    await r.db.query('UPDATE land_holdings SET quantity=75,original_quantity=75 WHERE character_id=$1',[p.id]);
    const before=await r.me(p),rejected=await r.command(p,'/api/v1/land/purchases',{propertyId:'worldroot-bastion',quantity:25});
    assert.equal(rejected.statusCode,409);assert.equal(rejected.json().error.code,'TRANSACTION_LIMIT');assert.equal((await r.me(p)).gold,before.gold);
  });
  test('selling maintained gear returns excess reserve immediately and cannot shield a surplus reserve indefinitely',async()=>{
    const p=await tierPlayer(50);await r.ok(p,'/api/v1/inventory/purchases',{itemId:'eclipse-greatsword',quantity:3});
    const before=await r.me(p);assert.equal(before.maintenance.reserveGold,'180');
    const sale=await r.ok(p,'/api/v1/inventory/sales',{itemId:'eclipse-greatsword',quantity:2});
    assert.equal(sale.state.maintenance.reserveGold,'60');assert.equal(sale.state.gold,before.gold+12000+120);
  });
  test('distinct purchases can fund upkeep at the same server instant while a receipt retry still pays once',async()=>{
    const fixed=await realm({clock:()=>new Date('2027-01-01T00:00:00Z')});
    try{
      const p=await fixed.player();await fixed.prepare(p,1000,30);
      const key=randomUUID();await fixed.ok(p,'/api/v1/inventory/purchases',{itemId:'ransackers-axe',quantity:1},key);
      await fixed.ok(p,'/api/v1/inventory/purchases',{itemId:'warden-mail',quantity:1});
      await fixed.ok(p,'/api/v1/inventory/purchases',{itemId:'ransackers-axe',quantity:1},key);
      const state=await fixed.me(p);assert.equal(state.gold,60+1000-75-65-2);assert.equal(state.maintenance.reserveGold,'2');
      assert.equal((await fixed.db.query("SELECT count(*)::int AS n FROM maintenance_events WHERE character_id=$1 AND reason='fund'",[p.id])).rows[0]!.n,2);
    }finally{await fixed.close();}
  });
  test('region navigation exposes real level-50 content and safe catalog illustrations',async()=>{
    const p=await r.player();const response=await r.app.inject({method:'GET',url:'/game/quests?area=eclipse-crown',headers:{cookie:p.cookie}});
    assert.equal(response.statusCode,200,response.body);assert.match(response.body,/Defy the Eclipsed Sovereign/);assert.match(response.body,/Level 50/);assert.match(response.body,/data-art-atlas=/);
    const invalid=await r.app.inject({method:'GET',url:'/game/quests?area=%3Cscript%3E',headers:{cookie:p.cookie}});assert.equal(invalid.statusCode,200);assert.ok(!invalid.body.includes('<script>'));
  });
  test('late-game two-player combat records the quantity-limited fantasy equipment actually used',async()=>{
    const a=await tierPlayer(50),b=await tierPlayer(49);
    for(const player of [a,b])await r.legacyArmy(player,20);
    for(const itemId of ['eclipse-greatsword','seraphic-vestment','eclipse-invocation'])await r.ok(a,'/api/v1/inventory/purchases',{itemId,quantity:3});
    for(const itemId of ['astral-conductor','sovereigns-bastion','seraphs-rebuke'])await r.ok(b,'/api/v1/inventory/purchases',{itemId,quantity:4});
    const fight=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id,damage:99999});
    const aReport=await r.app.inject({method:'GET',url:'/api/v1/battles/'+fight.battleId,headers:{cookie:a.cookie}}),bReport=await r.app.inject({method:'GET',url:'/api/v1/battles/'+fight.battleId,headers:{cookie:b.cookie}});
    assert.deepEqual(aReport.json(),bReport.json());const battle=aReport.json().battle;
    assert.equal(battle.rulesetId,alpha.id);assert.equal(battle.attackerArmy,21);assert.equal(battle.defenderArmy,21);
    assert.equal(battle.attackEquipment.reduce((n:number,item:{quantity:number})=>n+item.quantity,0),9);
    assert.equal(battle.defenseEquipment.reduce((n:number,item:{quantity:number})=>n+item.quantity,0),12);assert.ok(battle.defenderDamage<=30);
    const transfer=(await r.db.query("SELECT COALESCE(sum(e.amount),0)::int AS amount FROM economy_entries e JOIN economy_transactions t ON t.id=e.transaction_id WHERE t.command_id=$1 AND t.reason='battle_loot'",[fight.commandId])).rows[0]!;assert.equal(transfer.amount,0);
  });
});
