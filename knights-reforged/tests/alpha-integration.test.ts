import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {alpha,propertyPrice} from '../src/alpha-rules.js';

describe('Phase 3 authoritative alpha systems',{skip:!testDatabaseUrl},()=>{
  let r:Awaited<ReturnType<typeof realm>>;
  before(async()=>{r=await realm();});after(async()=>{if(r)await r.close();});

  test('new characters start with 100 Health, 20 Mana, 3 Spirit and recover independent fractional clocks offline',async()=>{
    const p=await r.player();const fresh=await r.me(p);
    assert.deepEqual([fresh.health,fresh.maxHealth,fresh.mana,fresh.maxMana,fresh.spirit,fresh.maxSpirit],[100,100,20,20,3,3]);
    await r.db.query(`UPDATE characters SET health=50,mana=10,spirit=0,
      health_updated_at=clock_timestamp()-interval '200 seconds',mana_updated_at=clock_timestamp()-interval '320 seconds',
      spirit_updated_at=clock_timestamp()-interval '140 seconds' WHERE id=$1`,[p.id]);
    const recovered=await r.me(p);
    assert.deepEqual([recovered.health,recovered.mana,recovered.spirit],[60,11,1]);
    for(const [timer,seconds] of [[recovered.healthNextAt,160],[recovered.manaNextAt,280],[recovered.spiritNextAt,76]] as const){
      const remaining=Date.parse(timer!)-Date.parse(recovered.serverTime);assert.ok(remaining>seconds*1000-2000&&remaining<=seconds*1000);
    }
    const repeated=await Promise.all([r.me(p),r.me(p),r.me(p)]);
    repeated.forEach(state=>assert.deepEqual([state.health,state.mana,state.spirit],[60,11,1]));
    await r.db.query(`UPDATE characters SET health_updated_at=clock_timestamp()-interval '1 day',mana_updated_at=clock_timestamp()-interval '1 day',spirit_updated_at=clock_timestamp()-interval '1 day' WHERE id=$1`,[p.id]);
    const capped=await r.me(p);assert.deepEqual([capped.health,capped.mana,capped.spirit],[100,20,3]);
  });

  test('quest leveling restores resources, grants points once, and concurrent skill allocations cannot overspend',async()=>{
    const p=await r.player();
    for(let i=0;i<3;i++)await r.ok(p,'/api/v1/quests/border-patrol/runs');
    let state=await r.me(p);assert.equal(state.level,2);assert.equal(state.skillPoints,1);assert.equal(state.mana,20);
    const responses=await Promise.all([r.command(p,'/api/v1/skills',{resource:'mana'}),r.command(p,'/api/v1/skills',{resource:'health'})]);
    assert.deepEqual(responses.map(response=>response.statusCode).sort(),[200,409]);
    state=await r.me(p);assert.equal(state.skillPoints,0);
    assert.ok((state.maxMana===21&&state.maxHealth===100)||(state.maxMana===20&&state.maxHealth===110));
    assert.equal((await r.command(p,'/api/v1/skills',{resource:'spirit'})).statusCode,409);
    await r.prepare(p,0,48);state=await r.me(p);assert.equal(state.level,4);assert.equal(state.skillPoints,2);
    const key=randomUUID();const a=await r.ok(p,'/api/v1/skills',{resource:'spirit'},key);const b=await r.ok(p,'/api/v1/skills',{resource:'spirit'},key);
    assert.equal(a.state.maxSpirit,4);assert.equal(b.state.maxSpirit,4);assert.equal(b.state.skillPoints,0);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM skill_allocations WHERE character_id=$1 AND command_id=$2',[p.id,key])).rows[0]!.n,1);
  });

  test('quantity purchases preserve entry IDs, auto-select only available copies, and sales use actual FIFO costs',async()=>{
    const p=await r.player();await r.prepare(p,200);
    await r.ok(p,'/api/v1/army/recruitments',{unitId:'militia',quantity:2});
    const purchase=await r.ok(p,'/api/v1/inventory/purchases',{itemId:'ash-spear',quantity:'2',price:0,attack:99999});
    const id=purchase.inventoryEntryId;
    const second=await r.ok(p,'/api/v1/inventory/purchases',{itemId:'ash-spear',quantity:1});assert.equal(second.inventoryEntryId,id);
    await r.ok(p,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:1});
    let state=await r.me(p);assert.equal(state.army.participants,3);
    assert.deepEqual(state.attackEquipment.selected.filter(item=>item.category==='weapon').map(item=>[item.itemId,item.quantity]),[['iron-sword',1],['ash-spear',2]]);
    assert.equal(state.attackEquipment.attack,14);
    // A later catalog/cost history may differ: the recorded acquisition price,
    // rather than today's catalog price, controls each copy's resale value.
    await r.db.query(`UPDATE inventory_lots SET unit_cost=15 WHERE inventory_entry_id=$1 AND remaining_quantity=2`,[id]);
    const key=randomUUID();const sale=await r.ok(p,'/api/v1/inventory/sales',{itemId:'ash-spear',quantity:3,refund:999999},key);
    assert.equal(sale.data.goldReceived,2*7+6);
    assert.equal((await r.ok(p,'/api/v1/inventory/sales',{itemId:'ash-spear',quantity:3},key)).state.gold,sale.state.gold);
    assert.equal((await r.command(p,'/api/v1/inventory/sales',{itemId:'ash-spear',quantity:1})).statusCode,409);
    const boughtAgain=await r.ok(p,'/api/v1/inventory/purchases',{itemId:'ash-spear',quantity:1});assert.equal(boughtAgain.inventoryEntryId,id);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM inventory_lots WHERE inventory_entry_id=$1',[id])).rows[0]!.n,3);
  });

  test('malformed quantities, locked purchases and simultaneous sales cannot mutate inventory incorrectly',async()=>{
    const p=await r.player();
    for(const quantity of [0,-1,1.5,true,null,'','01','1e2',101]){
      assert.equal((await r.command(p,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity})).statusCode,422);
    }
    assert.equal((await r.command(p,'/api/v1/inventory/purchases',{itemId:'ransackers-axe',quantity:1})).statusCode,409);
    await r.ok(p,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:1});
    const results=await Promise.all([r.command(p,'/api/v1/inventory/sales',{itemId:'squires-blade',quantity:1}),r.command(p,'/api/v1/inventory/sales',{itemId:'squires-blade',quantity:1})]);
    assert.deepEqual(results.map(result=>result.statusCode).sort(),[200,409]);
    assert.equal((await r.me(p)).gold,57);
    const total=(await r.db.query('SELECT sum(amount)::int AS n FROM economy_entries WHERE character_id=$1',[p.id])).rows[0]!.n;assert.equal(total,57);
  });

  test('inventory ownership limits remain authoritative across quantity purchases',async()=>{
    const p=await r.player();await r.prepare(p,5000);
    for(let i=0;i<10;i++)await r.ok(p,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:100});
    const before=await r.me(p);assert.equal(before.inventory[0]!.quantity,1000);assert.equal(before.attackEquipment.selected[0]!.quantity,1);
    const rejected=await r.command(p,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:1});assert.equal(rejected.statusCode,409);assert.equal(rejected.json().error.code,'INVENTORY_LIMIT');
    assert.equal((await r.me(p)).gold,before.gold);
  });

  test('equipment can be purchased with no income or funding; maintenance safely pauses expensive gear and keeps free gear usable',async()=>{
    const p=await r.player();await r.prepare(p,20,30);
    await r.ok(p,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:1});
    const bought=await r.ok(p,'/api/v1/inventory/purchases',{itemId:'ransackers-axe',quantity:1});
    assert.equal(bought.state.gold,0);assert.equal(bought.state.land.hourlyIncome,0);assert.equal(bought.state.maintenance.paused,true);
    assert.equal(bought.state.inventory.find((item:{id:string})=>item.id==='ransackers-axe').quantity,1);
    assert.deepEqual(bought.state.attackEquipment.selected.map((item:{itemId:string})=>item.itemId),['squires-blade']);
    const armory=await r.app.inject({method:'GET',url:'/game/armory',headers:{cookie:p.cookie}});
    assert.equal(armory.statusCode,200,armory.body);assert.match(armory.body,/Resume upkeep/);
    assert.equal((await r.command(p,'/api/v1/maintenance')).statusCode,409);
    await r.prepare(p,1);const resumed=await r.ok(p,'/api/v1/maintenance');
    assert.equal(resumed.state.maintenance.paused,false);assert.equal(resumed.state.maintenance.reserveGold,'1');
    assert.equal(resumed.state.attackEquipment.selected[0].itemId,'ransackers-axe');
  });

  test('offline equipment upkeep bills once, caps arrears, waives excess and stops charging while suspended',async()=>{
    const p=await r.player();await r.prepare(p,1000,30);
    await r.ok(p,'/api/v1/inventory/purchases',{itemId:'ransackers-axe',quantity:3});
    const before=await r.me(p);assert.equal(before.maintenance.reserveGold,'3');
    await r.db.query("UPDATE maintenance_accounts SET settled_at=clock_timestamp()-interval '3 hours' WHERE character_id=$1",[p.id]);
    const results=await Promise.all([r.me(p),r.me(p),r.me(p)]);
    results.forEach(state=>{assert.equal(state.gold,before.gold-6);assert.equal(state.maintenance.reserveGold,'0');});
    await r.db.query('UPDATE wallets SET balance=0 WHERE character_id=$1',[p.id]);
    await r.db.query("UPDATE maintenance_accounts SET settled_at=clock_timestamp()-interval '1000 hours' WHERE character_id=$1",[p.id]);
    const paused=await r.me(p);assert.equal(paused.maintenance.paused,true);assert.equal(paused.maintenance.arrearsGold,'3');assert.equal(paused.gold,0);
    const event=(await r.db.query("SELECT waived_gold FROM maintenance_events WHERE character_id=$1 AND reason='accrual' ORDER BY period_end_at DESC LIMIT 1",[p.id])).rows[0]!;
    assert.ok(BigInt(event.waived_gold)>=2997n);
    await r.db.query("UPDATE maintenance_accounts SET settled_at=clock_timestamp()-interval '1000 hours' WHERE character_id=$1",[p.id]);
    assert.equal((await r.me(p)).maintenance.arrearsGold,'3');
    await r.prepare(p,6);const key=randomUUID();const resumed=await r.ok(p,'/api/v1/maintenance',{},key);
    assert.equal(resumed.state.gold,0);assert.equal(resumed.state.maintenance.arrearsGold,'0');assert.equal(resumed.state.maintenance.reserveGold,'3');
    assert.equal((await r.ok(p,'/api/v1/maintenance',{},key)).state.maintenance.reserveGold,'3');
    const sale=await r.ok(p,'/api/v1/inventory/sales',{itemId:'ransackers-axe',quantity:3});
    assert.equal(sale.state.gold,3*37+3);assert.equal(sale.state.maintenance.hourlyRate,0);
    const rates=(await r.db.query('SELECT previous_rate,hourly_rate,ruleset_id FROM maintenance_rate_events WHERE character_id=$1 ORDER BY created_at,id',[p.id])).rows;
    assert.deepEqual(rates.map(row=>[row.previous_rate,row.hourly_rate,row.ruleset_id]),[[0,3,alpha.id],[3,0,alpha.id]]);
    const accruals=(await r.db.query("SELECT hourly_rate,ruleset_id FROM maintenance_events WHERE character_id=$1 AND reason='accrual'",[p.id])).rows;
    accruals.forEach(row=>{assert.equal(row.hourly_rate,3);assert.equal(row.ruleset_id,alpha.id);});
  });

  test('negative passive income does not block purchases or property sales, and equipment upkeep is charged separately once',async()=>{
    const p=await r.player();await r.prepare(p,2000,30);
    await r.ok(p,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});
    await r.ok(p,'/api/v1/inventory/purchases',{itemId:'ransackers-axe',quantity:8});
    const before=await r.me(p);assert.equal(before.land.netHourlyIncome,-1);assert.equal(before.maintenance.reserveGold,'8');
    await r.db.query("UPDATE land_holdings SET acquired_at=clock_timestamp()-interval '1 hour',accrued_through=clock_timestamp()-interval '1 hour' WHERE character_id=$1",[p.id]);
    await r.db.query("UPDATE maintenance_accounts SET settled_at=clock_timestamp()-interval '1 hour',remainder=0 WHERE character_id=$1",[p.id]);
    const after=await r.me(p);assert.equal(after.gold,before.gold+7);assert.equal(after.maintenance.reserveGold,'0');
    const sold=await r.ok(p,'/api/v1/land/sales',{propertyId:'smallholding',quantity:1});
    assert.equal(sold.state.land.netHourlyIncome,-8);assert.equal(sold.state.maintenance.paused,false);
  });

  test('quest requirements buy separately, persist across runs and cannot be bypassed by client rewards or prerequisites',async()=>{
    const p=await r.player();let state=await r.me(p);
    assert.equal((await r.command(p,'/api/v1/quests/gather-timber/runs',{items:{'squires-blade':1},goldReward:9999})).statusCode,409);
    assert.equal((await r.me(p)).mana,state.mana);
    const bought=await r.ok(p,'/api/v1/quests/gather-timber/equipment');
    assert.equal(bought.state.gold,55);assert.equal(bought.state.mana,20);assert.equal(bought.state.questsCompleted,0);
    assert.equal((await r.command(p,'/api/v1/quests/gather-timber/equipment')).statusCode,409);
    const key=randomUUID();const run=await r.ok(p,'/api/v1/quests/gather-timber/runs',{gold:9999,xp:9999,mana:0},key);
    assert.ok(run.data.gold>=12&&run.data.gold<=18);assert.equal(run.state.xp,6);assert.equal(run.state.mana,17);
    const repeated=await r.ok(p,'/api/v1/quests/gather-timber/runs',{},key);assert.equal(repeated.state.questsCompleted,1);
    state=(await r.ok(p,'/api/v1/quests/gather-timber/runs')).state;assert.equal(state.level,2);
    assert.equal(state.inventory.find(item=>item.id==='squires-blade')!.quantity,1);
    const resultPage=await r.app.inject({method:'GET',url:'/game/quests?command='+key,headers:{cookie:p.cookie}});
    assert.equal(resultPage.statusCode,200,resultPage.body);assert.match(resultPage.body,/Do Again/);
  });

  test('quest loot, army gates and milestone awards are persistent and issued once',async()=>{
    const p=await r.player();await r.prepare(p,500,60);
    assert.equal((await r.command(p,'/api/v1/quests/take-watchtower/runs')).statusCode,409);
    await r.ok(p,'/api/v1/quests/take-watchtower/equipment');
    assert.equal((await r.command(p,'/api/v1/quests/take-watchtower/runs')).json().error.code,'LOOT_REQUIRED');
    await r.ok(p,'/api/v1/quests/search-ruins/equipment');
    const key=randomUUID();const found=await r.ok(p,'/api/v1/quests/search-ruins/runs',{},key);
    assert.equal(found.data.loot,'Watchtower Map');assert.equal(found.state.loot.length,1);
    await r.ok(p,'/api/v1/quests/search-ruins/runs',{},key);assert.equal((await r.me(p)).loot.length,1);
    assert.equal((await r.command(p,'/api/v1/quests/take-watchtower/runs')).json().error.code,'ARMY_REQUIRED');
    await r.ok(p,'/api/v1/army/recruitments',{unitId:'militia',quantity:1});await r.ok(p,'/api/v1/quests/take-watchtower/runs');
    for(let i=0;i<9;i++)await r.ok(p,'/api/v1/quests/border-patrol/runs');
    assert.equal((await r.db.query("SELECT count(*)::int AS n FROM progression_awards WHERE character_id=$1 AND award_id='quests-10'",[p.id])).rows[0]!.n,1);
    assert.equal((await r.me(p)).loot.length,1);
  });

  test('Land bulk prices and FIFO sales preserve full-hour payments, legacy batches and historical settlements',async()=>{
    const p=await r.player();await r.prepare(p,1000,105);
    const bought=await r.ok(p,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:2});
    assert.equal(bought.data.goldSpent,45+50);assert.equal(bought.state.land.properties[0].price,propertyPrice(45,2));
    await r.db.query("UPDATE land_holdings SET acquired_at=statement_timestamp()-interval '1 hour 30 minutes',accrued_through=statement_timestamp()-interval '1 hour 30 minutes' WHERE character_id=$1",[p.id]);
    const before=await r.me(p);const key=randomUUID();
    const sold=await r.ok(p,'/api/v1/land/sales',{propertyId:'smallholding',quantity:1,refund:999999},key);
    assert.equal(sold.data.goldReceived,22);assert.equal(sold.state.gold,before.gold+22);assert.equal(sold.state.land.properties[0].owned,1);
    assert.equal((await r.ok(p,'/api/v1/land/sales',{propertyId:'smallholding',quantity:1},key)).state.land.properties[0].owned,1);
    const final=await r.ok(p,'/api/v1/land/sales',{propertyId:'smallholding',quantity:1});assert.equal(final.data.goldReceived,25);
    assert.equal(final.state.land.holdings.length,0);assert.equal(final.state.land.nextPaymentAt,null);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM land_holdings WHERE character_id=$1 AND quantity=0 AND closed_at IS NOT NULL',[p.id])).rows[0]!.n,2);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM land_income_settlements s JOIN land_holdings h ON h.id=s.holding_id WHERE h.character_id=$1',[p.id])).rows[0]!.n,2);
    assert.equal((await r.command(p,'/api/v1/land/sales',{propertyId:'smallholding',quantity:1})).statusCode,409);
    const rebuy=await r.ok(p,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});assert.equal(rebuy.data.goldSpent,45);
  });

  test('a full treasury retains sale proceeds with a durable journal instead of losing gold',async()=>{
    const p=await r.player();await r.ok(p,'/api/v1/inventory/purchases',{itemId:'iron-sword'});
    await r.prepare(p,2147483647-20);
    const sold=await r.ok(p,'/api/v1/inventory/sales',{itemId:'iron-sword'});
    assert.equal(sold.state.gold,2147483647);assert.equal(sold.state.land.pendingGold,'20');
    const purchased=await r.ok(p,'/api/v1/inventory/purchases',{itemId:'squires-blade'});
    assert.equal(purchased.state.gold,2147483647);assert.equal(purchased.state.land.pendingGold,'15');
    const journal=(await r.db.query('SELECT sum(amount)::text AS n FROM treasury_retained_events WHERE character_id=$1',[p.id])).rows[0]!.n;
    assert.equal(journal,'15');
  });

  test('army invitations require recipient consent, preserve separate inventories and change both active rosters',async()=>{
    const a=await r.player('Ally A'),b=await r.player('Ally B'),outsider=await r.player();
    assert.equal((await r.command(a,'/api/v1/army/invitations',{targetCharacterId:a.id})).statusCode,422);
    await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:b.id});
    assert.equal((await r.command(a,'/api/v1/army/acceptances',{targetCharacterId:b.id})).statusCode,403);
    assert.equal((await r.command(outsider,'/api/v1/army/acceptances',{targetCharacterId:a.id})).statusCode,403);
    await r.ok(b,'/api/v1/army/acceptances',{targetCharacterId:a.id});
    assert.equal((await r.me(a)).army.participants,2);assert.equal((await r.me(b)).army.participants,2);
    await r.ok(a,'/api/v1/army/recruitments',{unitId:'militia',quantity:3});
    assert.equal((await r.me(a)).army.participants,3);assert.equal((await r.me(a)).army.total,5);
    await r.ok(a,'/api/v1/inventory/purchases',{itemId:'squires-blade',quantity:2});assert.equal((await r.me(b)).inventory.length,0);
    await r.ok(b,'/api/v1/army/removals',{targetCharacterId:a.id});assert.equal((await r.me(a)).army.allies,0);assert.equal((await r.me(b)).army.participants,1);
  });

  test('concurrent reversed attacks serialize without deadlock and conserve both wallets',async()=>{
    const a=await r.player(),b=await r.player();const beforeA=await r.me(a),beforeB=await r.me(b);
    const responses=await Promise.all([r.command(a,'/api/v1/battles',{targetCharacterId:b.id}),r.command(b,'/api/v1/battles',{targetCharacterId:a.id})]);
    responses.forEach(response=>assert.equal(response.statusCode,200,response.body));
    const afterA=await r.me(a),afterB=await r.me(b);assert.equal(afterA.gold+afterB.gold,beforeA.gold+beforeB.gold);
    assert.equal(afterA.spirit,2);assert.equal(afterB.spirit,2);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM battles WHERE attacker_id=ANY($1::uuid[])',[[a.id,b.id]])).rows[0]!.n,2);
  });

  test('combat spends Spirit, snapshots selected quantities, prevents repeated-reward farming and keeps reports private',async()=>{
    const a=await r.player('Attacking Knight'),b=await r.player('Defending Knight'),c=await r.player();
    await r.prepare(a,200);await r.ok(a,'/api/v1/army/recruitments',{unitId:'militia',quantity:2});
    await r.ok(a,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:2});
    await r.ok(a,'/api/v1/inventory/purchases',{itemId:'ash-spear',quantity:2});
    const original=await r.me(a);let last='';
    for(let i=0;i<4;i++){
      if(i)await r.db.query("UPDATE characters SET health=max_health,spirit=max_spirit,attack_ready_at=clock_timestamp() WHERE id=ANY($1::uuid[])",[[a.id,b.id]]);
      const result=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id,damage:99999,loot:99999});last=result.battleId;
      const report=await r.app.inject({method:'GET',url:'/api/v1/battles/'+last,headers:{cookie:a.cookie}});const battle=report.json().battle;
      assert.equal(battle.winnerId,a.id);assert.equal(battle.spiritSpent,1);assert.equal(battle.attackerArmy,3);
      assert.equal(battle.attackEquipment.reduce((n:number,item:{category:string;quantity:number})=>n+(item.category==='weapon'?item.quantity:0),0),3);
      assert.equal(battle.rewarded,i<3);if(i===3){assert.equal(battle.loot,0);assert.equal(battle.attackerXp,0);}
      const html=await r.app.inject({method:'GET',url:'/game/battles/'+last,headers:{cookie:b.cookie}});assert.equal(html.statusCode,200,html.body);
    }
    const state=await r.me(a);assert.equal(state.mana,original.mana);assert.equal(state.spirit,2);
    assert.equal((await r.app.inject({method:'GET',url:'/api/v1/battles/'+last,headers:{cookie:c.cookie}})).statusCode,404);
    assert.equal((await r.db.query("SELECT count(*)::int AS n FROM progression_awards WHERE character_id=$1 AND award_id='first-victory'",[a.id])).rows[0]!.n,1);
    assert.equal((await r.command(a,'/api/v1/battles',{targetCharacterId:b.id})).statusCode,409);
  });

  test('rival pagination has no repeats, includes class/army/Health and server rejects out-of-range direct attacks',async()=>{
    const a=await r.player();let cursor:string|undefined;const ids=new Set<string>();let pages=0;
    const added=[];for(let i=0;i<22;i++)added.push((await r.player('Paged Rival '+i)).id);
    // PostgreSQL timestamps have microseconds. Truncating a page cursor to JS
    // milliseconds would skip the tail of this deliberately tied group.
    await r.db.query(`WITH stamp AS MATERIALIZED (SELECT clock_timestamp()+interval '1 day' AS at)
      UPDATE characters SET created_at=stamp.at FROM stamp WHERE id=ANY($1::uuid[])`,[added]);
    do{
      const response=await r.app.inject({method:'GET',url:'/api/v1/opponents'+(cursor?'?after='+encodeURIComponent(cursor):''),headers:{cookie:a.cookie}});
      assert.equal(response.statusCode,200,response.body);
      for(const opponent of response.json().opponents){assert.ok(!ids.has(opponent.id));assert.notEqual(opponent.id,a.id);ids.add(opponent.id);assert.equal(typeof opponent.armySize,'number');assert.ok(opponent.className);}
      cursor=response.json().nextCursor;pages++;assert.ok(pages<100);
    }while(cursor);
    assert.ok(ids.size>20);
    added.forEach(id=>assert.ok(ids.has(id),'A tied timestamp rival was skipped.'));
    const b=await r.player();await r.prepare(b,0,650);
    const denied=await r.command(a,'/api/v1/battles',{targetCharacterId:b.id});assert.equal(denied.statusCode,409);assert.equal(denied.json().error.code,'RIVAL_LEVEL_RANGE');
    assert.equal((await r.app.inject({method:'GET',url:'/api/v1/opponents?after=invalid',headers:{cookie:a.cookie}})).statusCode,422);
  });

  test('pre-alpha one-copy buy receipts replay without adding inventory or charging again',async()=>{
    const a=await r.player(),key=randomUUID();
    const old={commandId:key,kind:'buy',message:'Historical purchase'};
    const hash=createHash('sha256').update(JSON.stringify({kind:'buy',intent:{itemId:'iron-sword'}})).digest('hex');
    await r.db.query("INSERT INTO command_receipts(account_id,command_id,kind,intent_hash,result) VALUES($1,$2,'buy',$3,$4)",[a.accountId,key,hash,old]);
    const result=await r.ok(a,'/api/v1/inventory/purchases',{itemId:'iron-sword'},key);assert.equal(result.message,old.message);assert.equal(result.state.gold,60);assert.equal(result.state.inventory.length,0);
    assert.equal((await r.command(a,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:2},key)).statusCode,409);
  });

  test('fresh-player multiplayer alpha loop reaches quests, trade, allies, PvP, property income and skills without administrative grants',async()=>{
    const a=await r.player('First Session'),b=await r.player('First Rival');
    for(let i=0;i<3;i++)await r.ok(a,'/api/v1/quests/border-patrol/runs');
    await r.ok(a,'/api/v1/skills',{resource:'mana'});
    await r.ok(a,'/api/v1/quests/clear-old-road/equipment');
    await r.ok(a,'/api/v1/quests/clear-old-road/runs');
    await r.ok(a,'/api/v1/army/invitations',{targetCharacterId:b.id});await r.ok(b,'/api/v1/army/acceptances',{targetCharacterId:a.id});
    await r.ok(a,'/api/v1/army/recruitments',{unitId:'militia',quantity:1});
    const fight=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});assert.ok(fight.battleId);
    const property=await r.ok(a,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});assert.equal(property.state.land.properties[0].owned,1);
    await r.ok(a,'/api/v1/inventory/sales',{itemId:'wicker-buckler',quantity:1});
    // Only the one-hour clock is advanced; all money/XP above came from play.
    await r.db.query("UPDATE land_holdings SET acquired_at=clock_timestamp()-interval '1 hour',accrued_through=clock_timestamp()-interval '1 hour' WHERE character_id=$1",[a.id]);
    const state=await r.me(a);assert.equal(state.questsCompleted,4);assert.ok(state.level>=2);assert.equal(state.maxMana,21);assert.equal(state.army.allies,1);
    assert.equal(state.land.hourlyIncome,8);assert.equal(state.land.equipmentUpkeep,0);assert.equal(state.land.netHourlyIncome,7);
    assert.ok(state.land.nextPaymentAt);assert.ok(state.gold>=0);assert.equal(state.rulesetId,alpha.id);
  });
});
