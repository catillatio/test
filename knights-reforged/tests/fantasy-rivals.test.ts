import {test} from 'node:test';
import assert from 'node:assert/strict';
import {realm,testDatabaseUrl} from './helpers.js';
import {registration} from '../src/auth.js';
import {botBlueprint,provisionBots} from '../src/development.js';
import {getState} from '../src/game.js';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
import {botCatalog} from '../src/strategy-rules.js';

test('all 150 fantasy names are distinct, valid, deterministic and cover every level/tier without oversized armies',()=>{
  const names=new Set<string>();
  for(let level=1;level<=50;level++)for(const tier of ['green','seasoned','elite']){
    const bp=botBlueprint(level,tier);assert.ok(!names.has(bp.name),bp.name);names.add(bp.name);
    assert.equal(registration.shape.name.parse(bp.name),bp.name);assert.equal(botBlueprint(level,tier).name,bp.name);
    assert.ok(bp.participants<=10);assert.ok(bp.participants>=1);
    assert.ok(Object.values(bp.quantities).every(q=>q>=0&&q<=bp.participants));
    assert.ok(bp.items.every(i=>i.level<=level));
    assert.ok(bp.properties.every(p=>alpha.properties.find(item=>item.id===p.id)!.level<=level));
    assert.ok(bp.gold<200000&&bp.bankedGold<2147483647);
    const economy=botCatalog.economy,percent=botCatalog.profiles[tier]!.goldPercent;
    assert.equal(bp.gold,Math.floor((economy.walletBase+Math.max(0,bp.netIncome)*economy.walletIncomeHours+bp.equipmentInvestment*economy.walletEquipmentPercent/100)*percent/100));
    assert.equal(bp.bankedGold,Math.floor((Math.max(0,bp.netIncome)*economy.vaultIncomeHours+bp.propertyInvestment*economy.vaultEstatePercent/100)*percent/100));
    if(level===1)assert.equal(bp.properties.length,0);
    if(level>=11)assert.ok(bp.properties.length>=2);
    if(level>=36)assert.equal(bp.properties.length,4);
    if(level===50)assert.ok(bp.items.every(i=>i.level>=(tier==='green'?30:40))); // Defensive specialists can keep an older, stronger ward.
  }
  assert.equal(names.size,150);assert.equal(botCatalog.id,'passive-rivals-4');
});
test('persistent rival estates, real saved costs, income and protected wealth survive provisioning and restart without touching humans',{skip:!testDatabaseUrl},async()=>{
  const r=await realm({isolated:true,developmentBotsEnabled:true,developmentBotBountiesEnabled:true});try{
    const human=await r.player('Human Landowner');await r.prepare(human,10000,30);
    await r.ok(human,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:2});
    await r.ok(human,'/api/v1/vault/deposits',{amount:500});
    const humanRows=async()=>({character:(await r.db.query('SELECT * FROM characters WHERE id=$1',[human.id])).rows,
      wallet:(await r.db.query('SELECT * FROM wallets WHERE character_id=$1',[human.id])).rows,
      vault:(await r.db.query('SELECT * FROM vault_accounts WHERE character_id=$1',[human.id])).rows,
      holdings:(await r.db.query('SELECT * FROM land_holdings WHERE character_id=$1 ORDER BY id',[human.id])).rows});
    const before=await humanRows();await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});assert.deepEqual(await humanRows(),before);
    const bots=(await r.db.query('SELECT b.character_id,c.account_id,c.attained_level,b.tier,c.name FROM development_bots b JOIN characters c ON c.id=b.character_id ORDER BY c.attained_level,b.tier')).rows;
    for(const bot of bots){
      const bp=botBlueprint(bot.attained_level,bot.tier),state=await getState(r.db,bot.account_id);
      assert.equal(state.name,bp.name);assert.equal(state.bankedGold,bp.bankedGold);assert.equal(state.gold,bp.gold);
      assert.equal(state.economy.grossHourlyIncome,bp.grossIncome);assert.equal(state.economy.netHourlyIncome,bp.netIncome);
      assert.equal(state.land.holdings.reduce((sum,h)=>sum+h.quantity,0),bp.properties.reduce((sum,h)=>sum+h.quantity,0));
      assert.ok(state.army.participants<=10);assert.ok(state.units<=9);assert.equal(state.maintenance.paused,false);
      for(const item of state.inventory.filter(i=>i.quantity>0))assert.ok(item.level<=state.level);
      const paid=(await r.db.query('SELECT COALESCE(sum(unit_cost*acquired_quantity),0)::int AS n FROM inventory_lots WHERE character_id=$1',[bot.character_id])).rows[0]!.n;
      assert.equal(paid,bp.equipmentInvestment);
    }
    const snapshot=async()=>({bots:(await r.db.query('SELECT * FROM development_bots ORDER BY character_id')).rows,
      events:(await r.db.query('SELECT * FROM development_bot_events ORDER BY id')).rows,
      entries:(await r.db.query('SELECT * FROM economy_entries ORDER BY id')).rows,
      lots:(await r.db.query('SELECT * FROM inventory_lots ORDER BY id')).rows,
      land:(await r.db.query('SELECT * FROM land_holdings ORDER BY id')).rows,
      vault:(await r.db.query('SELECT * FROM vault_entries ORDER BY id')).rows});
    const saved=await snapshot(),again=await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
    assert.equal(again.created,0);assert.equal(again.upgraded,0);assert.deepEqual(await snapshot(),saved);assert.deepEqual(await humanRows(),before);
    const elder=bots.find(b=>b.attained_level===50&&b.tier==='elite')!;
    const profile=await r.app.inject({method:'GET',url:'/api/v1/players/'+elder.character_id,headers:{cookie:human.cookie}});
    assert.equal(profile.statusCode,200,profile.body);assert.equal(profile.json().character.properties.length,4);
    assert.equal(profile.json().character.economy.grossHourlyIncome,botBlueprint(50,'elite').grossIncome);
    assert.ok(!profile.body.includes('bankedGold'));assert.ok(!profile.body.includes('attackPower'));assert.ok(!profile.body.includes('accountId'));
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM battles WHERE attacker_id IN(SELECT character_id FROM development_bots)')).rows[0]!.n,0);
  }finally{await r.close();}
});

test('daily rival preparation settles real offline Land and maintenance before any synthetic allowance, without touching banked savings',{skip:!testDatabaseUrl},async()=>{
  let now=new Date('2043-03-01T00:00:00Z');
  const r=await realm({isolated:true,developmentBotsEnabled:true,clock:()=>now});try{
    await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});const human=await r.player('Land Auditor');
    await r.prepare(human,0,Array.from({length:49},(_,i)=>levelRequirement(i+1)).reduce((a,b)=>a+b,0));
    const bot=(await r.db.query("SELECT c.account_id,c.id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=50 AND b.tier='elite'")).rows[0]!;
    const before=await getState(r.db,bot.account_id);now=new Date(+now+86400000);
    const fight=await r.ok(human,'/api/v1/battles',{targetCharacterId:bot.id});
    const saved=(await r.db.query('SELECT snapshot,result FROM battles WHERE id=$1',[fight.battleId])).rows[0]!;
    assert.equal(saved.result.outcome,'defender_win');assert.equal(saved.result.loot,0);
    assert.equal(saved.snapshot.defender.gold,before.gold+24*(before.economy.grossHourlyIncome-before.economy.propertyUpkeep));
    assert.equal(saved.snapshot.defender.bankedGold,before.bankedGold);
    const charge=(await r.db.query("SELECT sum(charged_gold)::text AS amount FROM maintenance_events WHERE character_id=$1 AND reason='accrual'",[bot.id])).rows[0]!.amount;
    assert.equal(BigInt(charge),BigInt(24*before.economy.equipmentUpkeep));
    const refill=(await r.db.query("SELECT details FROM development_bot_events WHERE character_id=$1 AND kind='refresh'",[bot.id])).rows[0]!.details;
    assert.equal(refill.goldAdded,0);assert.equal(refill.maintenanceReserveAdded,24*before.economy.equipmentUpkeep);
  }finally{await r.close();}
});
