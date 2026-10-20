import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl,type Player} from './helpers.js';
import {strategy,botCatalog,callingPower,recoverySeconds,bountyFee} from '../src/strategy-rules.js';
import {provisionBots,provisionDevelopmentAccount,botBlueprint,benchmarkAttack,requireDevelopment} from '../src/development.js';
import {authenticate,createSession} from '../src/auth.js';
import {getState} from '../src/game.js';
import {resolveAlphaCombat} from '../src/alpha-rules.js';
import {migrate} from '../src/migrate.js';
import {executeCommand} from '../src/commands.js';
import {loadConfig} from '../src/config.js';
import {createApp} from '../src/app.js';
import {victoryExperience45,victoryLoot45} from '../src/gameplay-rules.js';
import {victoryExperience} from '../src/progression-economy-rules.js';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
import {botVictoryRewards} from '../src/bot-combat-rules.js';

const enabled={nodeEnv:'test',allowProvisioning:true};
const skip=!testDatabaseUrl?'Use a disposable TEST_DATABASE_URL ending in _test.':false;
test('Calling bonuses remain modest, distinct and compatible with both small and level-50 powers',()=>{
  assert.equal(strategy.id,'strategy-0.2');
  for(const base of [5,50,1000,24000])for(const calling of Object.values(strategy.callings)){
    assert.ok(callingPower(base,calling.attackPercent)<=base*1.041);assert.ok(callingPower(base,calling.defensePercent)<=base*1.041);
    assert.ok(callingPower(base,calling.attackPercent)>=base*.979);
  }
  assert.equal(recoverySeconds('Freeblade','spirit',120),108);assert.equal(recoverySeconds('Warden','health',180),162);assert.equal(recoverySeconds('Spellward','mana',300),270);
  assert.equal(bountyFee(100),10);assert.equal(bountyFee(101),11);assert.equal(bountyFee(10000),1000);
  assert.equal(loadConfig({ENABLE_DEV_BOTS:'1',NODE_ENV:'production',APP_ORIGIN:'https://realm.example'}).developmentBotsEnabled,false);
  for(const nodeEnv of ['production','staging',''])assert.throws(()=>requireDevelopment({nodeEnv,allowProvisioning:true}),/prohibited/);
  assert.throws(()=>requireDevelopment({nodeEnv:'development',allowProvisioning:false}),/prohibited/);
});
test('Calling changes persist, serialize concurrent requests and cannot backdate faster recovery',{skip},async()=>{
  let now=new Date('2030-01-01T00:00:00Z');const r=await realm({isolated:true,clock:()=>now});
  try{
    const p=await r.player();await r.prepare(p,500,30);const before=await r.me(p),key=randomUUID();
    await r.db.query('UPDATE characters SET mana=0,mana_updated_at=$2 WHERE id=$1',[p.id,new Date(+now-269000)]);
    const responses=await Promise.all([r.command(p,'/api/v1/profile',{className:'Spellward'},key),r.command(p,'/api/v1/profile',{className:'Warden'})]);
    assert.deepEqual(responses.map(x=>x.statusCode).sort(),[200,409]);
    const selected=await r.me(p);assert.equal(selected.gold,before.gold);assert.equal(selected.mana,0);assert.equal(selected.maxMana,before.maxMana);assert.equal(selected.skillPoints,before.skillPoints);
    const repeat=await r.command(p,'/api/v1/profile',{className:'Spellward'},key);if(responses[0]!.statusCode===200)assert.equal(repeat.statusCode,200);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM calling_changes WHERE character_id=$1',[p.id])).rows[0]!.n,1);
    now=new Date(+now+86400000);
    const destination=selected.className==='Spellward'?'Warden':'Spellward';await r.ok(p,'/api/v1/profile',{className:destination});
    const after=await r.me(p);assert.equal(after.gold,before.gold-100);assert.equal(after.training.attack,before.training.attack);
    assert.equal(after.attack,callingPower(after.training.untrainedAttack,strategy.callings[destination].attackPercent));
    const page=await r.app.inject({method:'GET',url:'/game/home?calling=1',headers:{cookie:p.cookie}});assert.equal(page.statusCode,200,page.body);assert.match(page.body,/>Calling<\/h2>/);assert.ok(!page.body.includes('cosmetic'));
  }finally{await r.close();}
});
test('each Calling applies its own offline recovery interval and preserves fractional ticks',{skip},async()=>{
  let now=new Date('2030-02-01T00:00:00Z');const r=await realm({isolated:true,clock:()=>now});
  try{for(const name of ['Freeblade','Warden','Spellward'] as const){
    const p=await r.player();await r.db.query('UPDATE characters SET profile_class=$2,health=50,mana=0,spirit=0,health_updated_at=$3,mana_updated_at=$3,spirit_updated_at=$3 WHERE id=$1',[p.id,name,now]);
    const start=+now;now=new Date(start+540000);const state=await r.me(p);
    assert.equal(state.health,50+10*Math.floor(540/recoverySeconds(name,'health',180)));
    assert.equal(state.mana,Math.floor(540/recoverySeconds(name,'mana',300)));assert.equal(state.spirit,3);
    assert.equal(Date.parse(state.manaNextAt!),start+(Math.floor(540/state.calling.manaSeconds)+1)*state.calling.manaSeconds*1000);
  }}finally{await r.close();}
});
test('450 passive rivals span levels 1–50 with real quantity-limited equipment and increasing difficulty',{skip},async()=>{
  const r=await realm({isolated:true,developmentBotsEnabled:true});
  try{
    const seeded=await provisionBots(r.db,enabled);assert.equal(seeded.active,450);assert.equal((await provisionBots(r.db,enabled)).created,0);
    const levels=(await r.db.query('SELECT c.attained_level,count(*)::int AS n FROM development_bots b JOIN characters c ON c.id=b.character_id GROUP BY c.attained_level ORDER BY c.attained_level')).rows;
    assert.equal(levels.length,50);levels.forEach((row,index)=>{assert.equal(row.attained_level,index+1);assert.equal(row.n,9);});
    for(let level=1;level<=50;level++){
      const powers=[];
      for(const tier of strategy.bots.tiers){
        const row=(await r.db.query('SELECT c.account_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=$1 AND b.tier=$2 AND b.variant=0',[level,tier])).rows[0]!;
        const state=await getState(r.db,row.account_id);powers.push(state.defense);
        assert.equal(state.level,level);assert.equal(state.maintenance.paused,false);assert.ok(state.army.participants<=10);assert.ok(state.defenseEquipment.selected.length>0);
        assert.equal(state.maxMana,20+Math.floor(level/5));assert.equal(state.maxSpirit,3+Math.floor(level/10));
        for(const item of state.defenseEquipment.selected)assert.ok(item.quantity<=state.army.participants);
        assert.ok(state.defenseEquipment.selected.every(item=>item.quantity===botBlueprint(level,tier).quantities[item.itemId]));
        assert.equal(state.army.participants,botBlueprint(level,tier).participants);
        const mirror={attack:state.attack,health:100,maxHealth:100,gold:1000};
        assert.ok(['attacker_win','defender_win'].includes(resolveAlphaCombat(mirror,state,0,0).outcome));
      }
      assert.ok(powers[0]!<powers[1]!&&powers[1]!<powers[2]!,'difficulty at level '+level+': '+powers.join(','));
    }
    const p=await r.player();const page=await r.app.inject({method:'GET',url:'/game/battle',headers:{cookie:p.cookie}});assert.match(page.body,/Temporary rival/);
    for(const level of [1,10,20,30,40,50]){
      const player=await r.player('Tier Hunter '+level);await r.prepare(player,1000000,Array.from({length:level-1},(_,i)=>levelRequirement(i+1)).reduce((a,b)=>a+b,0));
      await r.legacyArmy(player,20);
      for(const category of ['weapon','armor','spell']){
        const item=alpha.items.filter(item=>item.category===category&&item.level<=level).sort((a,b)=>b.attack-a.attack||b.defense-a.defense)[0]!;
        await r.ok(player,'/api/v1/inventory/purchases',{itemId:item.id,quantity:21});
      }
      const opponent=(await r.db.query("SELECT b.character_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=$1 AND b.tier='green' AND b.variant=0",[level])).rows[0]!;
      const before=await r.me(player);const fight=await r.ok(player,'/api/v1/battles',{targetCharacterId:opponent.character_id});
      const report=(await r.db.query('SELECT result FROM battles WHERE id=$1',[fight.battleId])).rows[0]!.result;
      assert.equal(report.outcome,'attacker_win');assert.equal(report.attackPower,Math.round(before.attack*(100+report.attackRoll)));assert.equal(report.botPopulationVersion,botCatalog.id);
      assert.equal(fight.state.spirit,before.spirit-1);assert.ok(report.loot<=victoryLoot45(1000000,1,true,true,level).botCap!);const snap=(await r.db.query('SELECT snapshot FROM battles WHERE id=$1',[fight.battleId])).rows[0]!.snapshot;assert.equal(report.attackerXp,botVictoryRewards(snap.defender.gold,level,level,1,before.attack,snap.defender.defense).xp.amount);
    }
    const unprepared=await r.player('Unprepared Challenger');await r.prepare(unprepared,1000,Array.from({length:49},(_,i)=>levelRequirement(i+1)).reduce((a,b)=>a+b,0));
    const elite=(await r.db.query("SELECT b.character_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=50 AND b.tier='elite' AND b.variant=0")).rows[0]!;
    const defeat=await r.ok(unprepared,'/api/v1/battles',{targetCharacterId:elite.character_id});assert.equal((await r.db.query('SELECT outcome FROM battles WHERE id=$1',[defeat.battleId])).rows[0]!.outcome,'defender_win');
    const oldBot=(await r.db.query("SELECT b.character_id,c.account_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=1 AND b.tier='green' AND b.variant=0")).rows[0]!;
    const history=(await r.db.query('SELECT * FROM battles ORDER BY id')).rows;
    const realPlayers=(await r.db.query('SELECT c.* FROM characters c JOIN accounts a ON a.id=c.account_id WHERE NOT a.login_disabled ORDER BY c.id')).rows;
    await r.db.query("UPDATE development_bots SET population_version='passive-rivals-1',population_key='passive-rivals-1:1:green',ruleset_id='strategy-0.1' WHERE character_id=$1",[oldBot.character_id]);
    assert.equal((await provisionBots(r.db,enabled)).upgraded,1);
    assert.equal((await r.db.query('SELECT account_id FROM characters WHERE id=$1',[oldBot.character_id])).rows[0]!.account_id,oldBot.account_id);
    assert.deepEqual((await r.db.query('SELECT * FROM battles ORDER BY id')).rows,history);
    assert.deepEqual((await r.db.query('SELECT c.* FROM characters c JOIN accounts a ON a.id=c.account_id WHERE NOT a.login_disabled ORDER BY c.id')).rows,realPlayers);
    const bot=(await r.db.query('SELECT a.username,a.id,c.id AS character_id FROM development_bots b JOIN characters c ON c.id=b.character_id JOIN accounts a ON a.id=c.account_id LIMIT 1')).rows[0]!;
    await assert.rejects(authenticate(r.db,bot.username,randomUUID()),/incorrect/);
    const forged=await createSession(r.db,bot.id);assert.equal((await r.app.inject({method:'GET',url:'/api/v1/me',headers:{cookie:'kr_session='+forged.token}})).statusCode,401);
    await assert.rejects(executeCommand(r.db,bot.id,randomUUID(),'attack',{targetCharacterId:p.id},{developmentBotsEnabled:true}),/not found/);
  }finally{await r.close();}
});
test('bot pair rewards, disabled availability, replay and passive behavior use the normal battle engine',{skip},async()=>{
  let now=new Date('2031-01-01T00:00:00Z');const r=await realm({isolated:true,clock:()=>now,developmentBotsEnabled:true});
  try{
    await provisionBots(r.db,enabled);const p=await r.player();await r.prepare(p,5000,30);
    await r.legacyArmy(p,10);await r.ok(p,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:10});
    const bots=(await r.db.query("SELECT b.character_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level BETWEEN 1 AND 4 ORDER BY c.attained_level,b.tier")).rows;
    for(let i=0;i<7;i++){
      now=new Date(+now+130000);const key=randomUUID();
      const result=await r.ok(p,'/api/v1/battles',{targetCharacterId:bots[i]!.character_id},key);
      const replay=await r.ok(p,'/api/v1/battles',{targetCharacterId:bots[i]!.character_id},key);assert.equal(result.battleId,replay.battleId);
      const report=(await r.app.inject({method:'GET',url:'/api/v1/battles/'+result.battleId,headers:{cookie:p.cookie}})).json().battle;
      assert.equal(report.temporaryRival,true);assert.equal(report.rewarded,true);assert.ok(report.loot>0);assert.equal(report.lootDetails.multiplier,100);
      assert.equal(report.bountyClaim,null);assert.ok(report.attackEquipment.length>0);
      if(i===0){
        now=new Date(+now+130000);const same=await r.ok(p,'/api/v1/battles',{targetCharacterId:bots[i]!.character_id});
        const repeated=(await r.db.query('SELECT rewarded,result FROM battles WHERE id=$1',[same.battleId])).rows[0]!;
        assert.equal(repeated.rewarded,true);assert.equal(repeated.result.lootDetails.multiplier,85);assert.ok(repeated.result.loot>0);
      }
    }
    now=new Date(+now+130000);const repeated=await r.ok(p,'/api/v1/battles',{targetCharacterId:bots[6]!.character_id});
    assert.equal((await r.db.query('SELECT rewarded FROM battles WHERE id=$1',[repeated.battleId])).rows[0]!.rewarded,true);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM battles WHERE attacker_id=ANY(SELECT character_id FROM development_bots)')).rows[0]!.n,0);
    const hidden=await createApp({db:r.db,config:loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000'})});try{
      const list=await hidden.inject({method:'GET',url:'/api/v1/opponents',headers:{cookie:p.cookie}});assert.equal(list.statusCode,200);assert.ok(list.json().opponents.every((x:{botTier:string|null})=>!x.botTier));
      assert.equal((await hidden.inject({method:'POST',url:'/api/v1/battles',headers:{cookie:p.cookie,origin:'http://localhost:3000','x-csrf-token':p.csrf,'idempotency-key':randomUUID()},payload:{targetCharacterId:bots[6]!.character_id}})).statusCode,409);
    }finally{await hidden.close();}
  }finally{await r.close();}
});
test('persistent dev initialization is idempotent, version-aware, isolated and never production-authorized',{skip},async()=>{
  const r=await realm({isolated:true});
  try{
    const other=await r.player();await r.prepare(other,777,30);const normalBefore=(await r.db.query('SELECT * FROM characters WHERE id=$1',[other.id])).rows;
    const password=randomUUID()+'Aa1!';const first=await provisionDevelopmentAccount(r.db,enabled,password,true);
    const dev=await getState(r.db,(await authenticate(r.db,'dev',password)).accountId);assert.equal(dev.id,first.characterId);assert.equal(dev.gold,50000);assert.equal(dev.army.participants,10);
    await executeCommand(r.db,first.accountId,randomUUID(),'buy',{itemId:'squires-blade',quantity:1});
    const spent=await getState(r.db,first.accountId);await provisionDevelopmentAccount(r.db,enabled,password);assert.equal((await getState(r.db,first.accountId)).gold,spent.gold);
    await migrate(r.db);assert.equal((await getState(r.db,first.accountId)).id,first.characterId);
    await r.db.query("UPDATE development_accounts SET baseline_version='test-previous-version' WHERE account_id=$1",[first.accountId]);
    const reset=await provisionDevelopmentAccount(r.db,enabled,password);assert.equal(reset.reset,true);assert.equal(reset.characterId,first.characterId);
    const after=await getState(r.db,first.accountId);assert.equal(after.gold,50000);assert.ok(after.inventory.some(item=>item.id==='squires-blade'&&item.quantity>=1));
    assert.deepEqual((await r.db.query('SELECT * FROM characters WHERE id=$1',[other.id])).rows,normalBefore);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM development_accounts')).rows[0]!.n,1);
    await assert.rejects(provisionDevelopmentAccount(r.db,{nodeEnv:'production',allowProvisioning:true},password,true),/prohibited/);
    await assert.rejects(provisionBots(r.db,{nodeEnv:'production',allowProvisioning:true}),/prohibited/);
    assert.equal((await r.db.query('SELECT password_hash FROM accounts WHERE id=$1',[first.accountId])).rows[0]!.password_hash.startsWith('$argon2id$'),true);
  }finally{await r.close();}
});
test('development baseline settles old upkeep before restoring gold and preserves existing equipment and Land',{skip},async()=>{
  const r=await realm({isolated:true});try{
    const password=randomUUID()+'Aa1!',account=await provisionDevelopmentAccount(r.db,enabled,password,true);
    const session=await createSession(r.db,account.accountId);
    const actor:Player={id:account.characterId,accountId:account.accountId,cookie:'kr_session='+session.token,csrf:session.session.csrf_token};
    const item=alpha.items.filter(item=>item.upkeep>0).sort((a,b)=>a.level-b.level||a.price-b.price)[0]!;
    const before=await r.me(actor);if(before.level<item.level)await r.prepare(actor,0,Array.from({length:item.level-1},(_,i)=>levelRequirement(i+1)).reduce((a,b)=>a+b,0));
    await r.ok(actor,'/api/v1/inventory/purchases',{itemId:item.id,quantity:2});await r.ok(actor,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});
    const owned=await r.me(actor);
    await r.db.query("UPDATE maintenance_accounts SET settled_at=clock_timestamp()-interval '24 hours',remainder=0 WHERE character_id=$1",[actor.id]);
    await provisionDevelopmentAccount(r.db,enabled,password,true);
    const after=await getState(r.db,account.accountId);assert.equal(after.gold,50000);assert.deepEqual(after.inventory,owned.inventory);assert.deepEqual(after.land.holdings,owned.land.holdings);assert.equal(after.level,owned.level);assert.equal(after.skillPoints,owned.skillPoints);
    assert.ok((await r.db.query("SELECT 1 FROM maintenance_events WHERE character_id=$1 AND reason='accrual'",[actor.id])).rows.length>0);
  }finally{await r.close();}
});
