import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {alpha,phase35Catalog,trainedPower,resolveAlphaCombat} from '../src/alpha-rules.js';
import {realm,testDatabaseUrl} from './helpers.js';
import {callingPower} from '../src/strategy-rules.js';

test('renamed rules retain every level-50 contract and resource rule from alpha-0.2',()=>{
  assert.equal(alpha.id,'alpha-0.3');
  for(const key of ['items','properties','quests','resources','progression','limits','combat','maintenance'] as const)assert.deepEqual(alpha[key],phase35Catalog[key],key);
});
test('training has bounded effects, preserves zero-rating power and retains small early-game gains',()=>{
  for(const base of [5,32,163,1000,24442]){assert.equal(trainedPower(base,0),base);assert.equal(trainedPower(base,25),base*1.25);assert.ok(trainedPower(base,1)>base);}
  assert.equal(trainedPower(5,1),5.05);assert.equal(trainedPower(163,10),179.3);
  for(const rating of [-1,26,1.5,NaN])assert.throws(()=>trainedPower(100,rating),/training/);
});
test('Attack and Defense training affect deterministic combat without changing damage or reward bounds',()=>{
  const a={attack:100,health:100,maxHealth:100,gold:1000},b={defense:100,health:100,maxHealth:100,gold:1000};
  assert.equal(resolveAlphaCombat(a,b,0,0).outcome,'defender_win');
  const attacking=resolveAlphaCombat({...a,attack:trainedPower(100,1)},b,0,0);assert.equal(attacking.outcome,'attacker_win');assert.equal(attacking.attackPower,10100);
  const defending=resolveAlphaCombat({...a,attack:110},{...b,defense:trainedPower(100,25)},0,0);assert.equal(defending.outcome,'defender_win');assert.equal(defending.defensePower,12500);
  assert.ok(defending.attackerDamage<=30);assert.ok(defending.loot<=50);
});

describe('Persistent combat training and reference-inspired Profile',{skip:!testDatabaseUrl},()=>{
  let r:Awaited<ReturnType<typeof realm>>;before(async()=>{r=await realm();});after(async()=>{if(r)await r.close();});
  test('concurrent allocations cannot overspend; identical retries do not allocate twice',async()=>{
    const p=await r.player();await r.prepare(p,0,12);const before=await r.me(p);assert.equal(before.skillPoints,1);
    const responses=await Promise.all([r.command(p,'/api/v1/skills',{resource:'attack'}),r.command(p,'/api/v1/skills',{resource:'defense'})]);
    assert.deepEqual(responses.map(response=>response.statusCode).sort(),[200,409]);
    const after=await r.me(p);assert.equal(after.skillPoints,0);assert.equal(after.training.attack+after.training.defense,1);
    assert.equal(after.maxHealth,before.maxHealth);assert.equal(after.maxMana,before.maxMana);assert.equal(after.maxSpirit,before.maxSpirit);
    const q=await r.player();await r.prepare(q,0,12);const key=randomUUID();await r.ok(q,'/api/v1/skills',{resource:'attack'},key);await r.ok(q,'/api/v1/skills',{resource:'attack'},key);
    assert.equal((await r.me(q)).training.attack,1);assert.equal((await r.me(q)).skillPoints,0);
    const changed=await r.command(q,'/api/v1/skills',{resource:'defense'},key);assert.equal(changed.statusCode,409);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM skill_allocations WHERE character_id=$1',[q.id])).rows[0]!.n,1);
  });
  test('training stops at its documented cap and rejects invented attributes or client-supplied bonus values',async()=>{
    const p=await r.player();await r.prepare(p,0,12000);
    for(let i=0;i<25;i++)await r.ok(p,'/api/v1/skills',{resource:'defense',bonusPercent:999999});
    const before=await r.me(p);assert.equal(before.training.defenseBonusPercent,25);assert.equal(before.defense,callingPower(trainedPower(before.training.untrainedDefense,25),before.calling.defensePercent));
    assert.equal((await r.command(p,'/api/v1/skills',{resource:'defense'})).statusCode,409);assert.equal((await r.me(p)).skillPoints,before.skillPoints);
    assert.equal((await r.command(p,'/api/v1/skills',{resource:'skill_points'})).statusCode,422);
    assert.equal((await r.db.query("SELECT count(*)::int AS n FROM skill_allocations WHERE character_id=$1 AND ruleset_id=$2",[p.id,alpha.id])).rows[0]!.n,25);
  });
  test('four compact Profile tabs preserve account age, illustrated owned quantities, income and private battle history',async()=>{
    const p=await r.player();await r.prepare(p,500,30);await r.ok(p,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:2});
    await r.db.query("UPDATE accounts SET created_at=clock_timestamp()-interval '73 days 1 hour' WHERE id=$1",[p.accountId]);
    const state=await r.me(p);assert.equal(state.accountAgeDays,73);
    for(const tab of ['player','skills','battles']){
      const response=await r.app.inject({method:'GET',url:'/game/profile?tab='+tab,headers:{cookie:p.cookie}});assert.equal(response.statusCode,200,response.body);
      assert.match(response.body,/Kingdom Come/);assert.ok(!response.body.includes('Knights Reforged'));assert.ok(!response.body.includes('Post Comment'));
      assert.equal((/aria-label="Character sections">([\s\S]*?)<\/nav>/.exec(response.body)![1]!.match(/<a /g)??[]).length,4);
      assert.match(response.body,/73 days/);assert.match(response.body,/action="\/logout"/);
      if(tab==='player'){assert.match(response.body,/Owned Weapons/);assert.match(response.body,/Iron sword, owned 2/);assert.match(response.body,/Gross hourly income/);assert.match(response.body,/data-art-atlas="weapons"/);assert.ok(!response.body.includes('name="resource"'));}
      if(tab==='skills'){for(const name of ['Mana','Health','Spirit','Attack','Defense'])assert.ok(response.body.includes('Increase '+name));assert.match(response.body,/up to 25%/);}
      if(tab==='battles')assert.match(response.body,/Recent battles/);
    }
    const invalid=await r.app.inject({method:'GET',url:'/game/profile?tab=%3Cscript%3E',headers:{cookie:p.cookie}});assert.equal(invalid.statusCode,200);assert.ok(!invalid.body.includes('<script>'));
  });
  test('zero-Health statistics and illustrated report quantities use persistent records and each viewer’s perspective',async()=>{
    const a=await r.player(),b=await r.player(),outsider=await r.player();await r.prepare(a,5000,650);await r.prepare(b,2000,650);
    await r.ok(a,'/api/v1/army/recruitments',{unitId:'militia',quantity:20});await r.ok(a,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:3});
    await r.ok(a,'/api/v1/skills',{resource:'attack'});
    await r.db.query('UPDATE characters SET health=20,health_updated_at=clock_timestamp() WHERE id=$1',[b.id]);
    const key=randomUUID(),fight=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id,attack:999999},key);await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id},key);
    const saved=(await r.app.inject({method:'GET',url:'/api/v1/battles/'+fight.battleId,headers:{cookie:a.cookie}})).json().battle;
    assert.equal(saved.defenderHealthAfter,0);assert.equal(saved.attackerTraining.attack,1);assert.equal(saved.defenderTraining.defense,0);
    assert.equal((await r.me(a)).battleStats.kills,1);assert.equal((await r.me(b)).battleStats.deaths,1);
    await r.ok(a,'/api/v1/inventory/sales',{itemId:'iron-sword',quantity:3});await r.ok(a,'/api/v1/skills',{resource:'attack'});
    for(const [viewer,dealt,received,gold,xp] of [[a,saved.defenderDamage,saved.attackerDamage,'+50','+5'],[b,saved.attackerDamage,saved.defenderDamage,'-50','+0']] as const){
      const page=await r.app.inject({method:'GET',url:'/game/battles/'+fight.battleId,headers:{cookie:viewer.cookie}});assert.equal(page.statusCode,200,page.body);
      assert.ok(page.body.includes('Damage dealt</dt><dd>'+dealt));assert.ok(page.body.includes('Damage received</dt><dd>'+received));assert.ok(page.body.includes('>'+gold+'</dd>'));assert.ok(page.body.includes('XP gained</dt><dd>'+xp));
      assert.match(page.body,/×3/);assert.match(page.body,/data-art-atlas="weapons"/);assert.match(page.body,/Your army/);assert.match(page.body,/Their army/);
    }
    const rejected=await r.app.inject({method:'GET',url:'/game/battles/'+fight.battleId,headers:{cookie:outsider.cookie}});assert.equal(rejected.statusCode,404);
    assert.deepEqual((await r.app.inject({method:'GET',url:'/api/v1/battles/'+fight.battleId,headers:{cookie:b.cookie}})).json().battle,saved);
    // Unknown historical health must not invent kills or deaths.
    await r.db.query("INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result) VALUES($1,$2,$3,'alpha-0.2','attacker_win','{}','{}')",[randomUUID(),a.id,b.id]);
    assert.equal((await r.me(a)).battleStats.kills,1);assert.equal((await r.me(b)).battleStats.deaths,1);
  });
});
