import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {provisionBots,botBlueprint,botGoldAllowance} from '../src/development.js';
import {battleTales} from '../src/feeds.js';
import {transaction} from '../src/db.js';
import {lockBountyEscrow,expireBounties,bountyBoard} from '../src/bounties.js';
import {botCatalog} from '../src/strategy-rules.js';
import {ledger} from '../src/economy.js';
import {levelRequirement} from '../src/alpha-rules.js';
const skip=!testDatabaseUrl;
async function setup(){
  let now=new Date('2038-02-01T23:00:00Z');const r=await realm({isolated:true,clock:()=>now,developmentBotsEnabled:true});
  async function veteran(name='Contract Knight'){
    const p=await r.player(name);await r.prepare(p,25000,30);
    for(let i=0;i<5;i++)await r.ok(p,'/api/v1/quests/border-patrol/runs');return p;
  }
  return {...r,veteran,now:()=>now,advance:(seconds:number)=>{now=new Date(+now+seconds*1000);}};
}
test('an expiry/finishing race refunds exactly once and cannot pay either a bounty reward or a kill at the deadline',{skip},async()=>{
  const r=await setup();try{
    const sponsor=await r.veteran(),target=await r.veteran(),hunter=await r.veteran();
    const initial=(await r.me(sponsor)).gold,placed=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1});
    r.advance(86400);await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]);
    const [fight]=await Promise.all([r.ok(hunter,'/api/v1/battles',{targetCharacterId:target.id}),bountyBoard(r.db,sponsor.id),r.me(sponsor)]);
    const saved=(await r.db.query('SELECT result FROM battles WHERE id=$1',[fight.battleId])).rows[0]!.result;
    assert.equal(saved.defenderHealthAfter,0);assert.equal(saved.bountyClaim,null);assert.equal((await r.me(hunter)).battleStats.kills,0);
    assert.equal((await r.me(sponsor)).gold,initial-1); // only the disclosed 1-gold fee
    assert.equal((await r.db.query("SELECT count(*)::int AS n FROM bounty_events WHERE bounty_id=$1 AND kind='expired'",[placed.data.bountyId])).rows[0]!.n,1);
    const relisted=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:10000});
    assert.ok(relisted.data.bountyId);assert.equal((await r.me(target)).health,0);
  }finally{await r.close();}
});
test('a finishing attack can claim even when the wounded defender wins the army contest; wins and kills stay distinct',{skip},async()=>{
  const r=await setup();try{
    const sponsor=await r.veteran(),target=await r.veteran(),hunter=await r.veteran();
    await r.ok(target,'/api/v1/army/recruitments',{unitId:'militia',quantity:20});
    const state=await r.me(target);
    const {alpha}=await import('../src/alpha-rules.js');
    for(const category of ['weapon','armor','spell']){
      const item=alpha.items.filter(i=>i.category===category&&i.level<=state.level).sort((a,b)=>b.defense-a.defense)[0]!;
      await r.ok(target,'/api/v1/inventory/purchases',{itemId:item.id,quantity:10});
    }
    await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:10});
    await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]);
    const hit=await r.ok(hunter,'/api/v1/battles',{targetCharacterId:target.id});
    const report=(await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result;
    assert.equal(report.outcome,'defender_win');assert.equal(report.defenderHealthAfter,0);assert.equal(report.bountyClaim.reward,10);
    assert.equal((await r.me(hunter)).battleStats.kills,1);assert.equal((await r.me(hunter)).battleStats.wins,0);
  }finally{await r.close();}
});
test('the database rejects duplicate active targets even outside the application; ordinary page returns settle expired refunds',{skip},async()=>{
  const r=await setup();try{
    const a=await r.veteran(),b=await r.veteran(),target=await r.veteran();
    const placed=await r.ok(a,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1}),before=(await r.me(a)).gold,version=(await r.me(a)).stateVersion;
    await assert.rejects(r.db.query(`INSERT INTO bounties(id,sponsor_id,target_id,amount,fee,status,ruleset_id,command_id,created_at,expires_at)
      VALUES($1,$2,$3,1,1,'active','refinements-0.1',$4,$5,$6)`,[randomUUID(),b.id,target.id,randomUUID(),r.now(),new Date(+r.now()+86400000)]),(e:any)=>e.code==='23505');
    r.advance(86400);const page=await r.app.inject({method:'GET',url:'/game/home',headers:{cookie:a.cookie}});assert.equal(page.statusCode,200,page.body);
    assert.equal((await r.me(a)).gold,before+1);assert.ok((await r.me(a)).stateVersion>version);assert.equal((await r.db.query('SELECT status FROM bounties WHERE id=$1',[placed.data.bountyId])).rows[0]!.status,'expired');
    await transaction(r.db,async sql=>{await lockBountyEscrow(sql);assert.equal(await expireBounties(sql,r.now()),0);});
    assert.equal((await r.me(a)).gold,before+1);
  }finally{await r.close();}
});
test('public Tales From the Field paginate real encounters without leaking saved snapshots or private report access',{skip},async()=>{
  const r=await setup();try{
    const a=await r.player('Fabled Archer'),b=await r.player('Bronze Defender'),viewer=await r.player('Passing Visitor');
    const first=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});
    // Persistent historical fixture: timestamps intentionally include microseconds.
    const existing=(await r.db.query('SELECT * FROM battles WHERE id=$1',[first.battleId])).rows[0]!;
    for(let i=0;i<24;i++)await r.db.query(`INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,rewarded,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,false,$8::timestamptz+$9::int*interval '1 microsecond')`,[randomUUID(),a.id,b.id,existing.ruleset_id,existing.outcome,existing.snapshot,existing.result,r.now(),i+1]);
    await r.db.query("UPDATE battles SET result='{}' WHERE id=$1",[first.battleId]);
    const one=await battleTales(r.db,a.id,viewer.id);assert.equal(one.entries.length,20);assert.ok(one.nextCursor);
    const two=await battleTales(r.db,a.id,viewer.id,one.nextCursor!);assert.equal(two.entries.length,5);assert.equal(two.nextCursor,null);
    assert.equal(two.entries.find(e=>e.id===first.battleId)!.loot,null);assert.equal(two.entries.find(e=>e.id===first.battleId)!.attackerXp,null);
    assert.equal(new Set([...one.entries,...two.entries].map(e=>e.id)).size,25);assert.ok(one.entries.every(e=>!e.canViewReport));
    const api=await r.app.inject({method:'GET',url:'/api/v1/players/'+a.id+'/tales',headers:{cookie:viewer.cookie}});assert.equal(api.statusCode,200);
    for(const forbidden of ['snapshot','attackPower','defensePower','accountId','spiritSpent','inventoryId','maintenance'])assert.ok(!api.body.includes(forbidden),forbidden);
    for(const actor of [a,viewer]){
      const html=await r.app.inject({method:'GET',url:'/game/players/'+b.id+'?tab=battles',headers:{cookie:actor.cookie}});assert.equal(html.statusCode,200,html.body);
      assert.match(html.body,/Tales From the Field/);assert.match(html.body,/Older battles/);assert.ok(html.body.includes('/game/players/'+a.id));
      assert.equal(html.body.includes('/game/battles/'+one.entries[0]!.id),actor.id===a.id);
    }
    assert.equal((await r.app.inject({method:'GET',url:'/api/v1/battles/'+first.battleId,headers:{cookie:viewer.cookie}})).statusCode,404);
    assert.equal((await r.app.inject({method:'GET',url:'/api/v1/players/'+a.id+'/tales?after=invalid',headers:{cookie:viewer.cookie}})).statusCode,422);
  }finally{await r.close();}
});
test('all normal navigation keeps Land in Home only and profile pages hide aggregate combat ratings',{skip},async()=>{
  const r=await setup();try{
    const p=await r.player(),other=await r.player();
    for(const screen of ['home','quests','battle','bounties','armory','army','army?tab=army','army?tab=dashboard','land','profile','profile?tab=skills','profile?tab=battles','profile?tab=comments','players/'+other.id,'players/'+other.id+'?tab=battles','settings']){
      const html=await r.app.inject({method:'GET',url:'/game/'+screen,headers:{cookie:p.cookie}});assert.equal(html.statusCode,200,screen);
      assert.equal((html.body.match(/href="\/game\/land"/g)||[]).length,screen==='home'?1:0,screen);
      assert.equal((/aria-label="Primary navigation">([\s\S]*?)<\/nav>/.exec(html.body)![1]!.match(/<a /g)||[]).length,5);
      if(screen.startsWith('profile')||screen.startsWith('players/'))assert.ok(!/Attack power<|Defense power<|Untrained attack|untrainedDefense/.test(html.body),screen);
      assert.ok(!html.body.includes('Refresh income'));
    }
    await r.ok(p,'/api/v1/land/purchases',{propertyId:'smallholding',quantity:1});const before=await r.me(p);r.advance(3600);
    const reads=await Promise.all([r.me(p),r.me(p),r.me(p)]);assert.ok(reads.every(s=>s.gold===before.gold+7));
  }finally{await r.close();}
});
test('bot catalog upgrade caps armies at ten, scales real loadouts and gold, and preserves human records, identities and defeated Health',{skip},async()=>{
  const r=await setup();try{
    await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
    const human=await r.veteran(),before=(await r.db.query('SELECT * FROM characters WHERE id=$1',[human.id])).rows;
    const old=(await r.db.query("SELECT b.character_id,c.account_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=50 AND b.tier='elite'")).rows[0]!;
    await r.db.query("UPDATE development_bots SET population_version='passive-rivals-2',population_key='passive-rivals-2:50:elite' WHERE character_id=$1",[old.character_id]);
    await r.db.query('UPDATE characters SET health=0,health_updated_at=$2,legacy_army_floor=21 WHERE id=$1',[old.character_id,r.now()]);
    await r.db.query('UPDATE army_stacks SET quantity=20 WHERE character_id=$1',[old.character_id]);
    const upgraded=await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});assert.equal(upgraded.upgraded,1);
    const after=(await r.db.query('SELECT * FROM characters WHERE id=$1',[old.character_id])).rows[0]!;
    assert.equal(after.account_id,old.account_id);assert.equal(after.health,0);assert.equal(+new Date(after.health_updated_at),+r.now());
    assert.deepEqual((await r.db.query('SELECT * FROM characters WHERE id=$1',[human.id])).rows,before);
    for(const tier of ['green','seasoned','elite'])for(let level=1;level<=50;level++){
      const bp=botBlueprint(level,tier);assert.ok(bp.participants<=10);assert.ok(Object.values(bp.quantities).every(n=>n<=10));
      assert.ok(bp.gold>=0&&bp.bankedGold>=0);
      if([10,20,35,50].includes(level))assert.ok(bp.gold>botGoldAllowance(Math.max(1,level-10),tier));
      for(const item of bp.items)assert.ok(item.level<=level);
    }
    assert.equal(botCatalog.id,'passive-rivals-5');
    assert.equal((await r.db.query('SELECT max(quantity+1)::int AS n FROM army_stacks WHERE character_id IN(SELECT character_id FROM development_bots)')).rows[0]!.n,10);
    const hp=await r.app.inject({method:'GET',url:'/api/v1/players/'+old.character_id,headers:{cookie:human.cookie}});assert.equal(hp.json().character.health,0);r.advance(162);
    assert.equal((await r.app.inject({method:'GET',url:'/api/v1/players/'+old.character_id,headers:{cookie:human.cookie}})).json().character.health,10);
  }finally{await r.close();}
});

test('returning creators receive every expired principal across multiple settlement batches, never just the first hundred',{skip},async()=>{
  const r=await setup();try{
    const sponsor=await r.veteran(),prefix='expiry_'+randomUUID().replaceAll('-','').slice(0,8);
    // Large existing-realm fixture. Keep exact SQL numeric/timestamp types and
    // fund the old escrow/fee journal explicitly, without authentication bypasses.
    await transaction(r.db,async sql=>{
      await sql.query(`WITH new_accounts AS (
        INSERT INTO accounts(id,username,password_hash)
        SELECT gen_random_uuid(),$2||'_'||n,password_hash FROM accounts CROSS JOIN generate_series(1,110) n WHERE id=$1 RETURNING id
      ),new_characters AS (
        INSERT INTO characters(id,account_id,name,attained_level,xp) SELECT gen_random_uuid(),id,'Archived Rival',3,30 FROM new_accounts RETURNING id
      ) INSERT INTO bounties(id,sponsor_id,target_id,amount,fee,status,ruleset_id,command_id,created_at,expires_at)
      SELECT gen_random_uuid(),$3,id,1,1,'active','refinements-0.1',gen_random_uuid(),$4::timestamptz,$4::timestamptz+interval '24 hours' FROM new_characters`,[sponsor.accountId,prefix,sponsor.id,r.now()]);
      await ledger(sql,null,'bounty_escrow',[{characterId:sponsor.id,amount:-110}],'refinements-0.1');
      await ledger(sql,null,'bounty_fee',[{characterId:sponsor.id,amount:-110}],'refinements-0.1');
    });
    const before=(await r.me(sponsor)).gold;r.advance(86400);
    const reads=await Promise.all([r.me(sponsor),r.me(sponsor),bountyBoard(r.db,sponsor.id)]);assert.equal((reads[0] as any).gold,before+110);assert.equal((reads[1] as any).gold,before+110);
    assert.equal((await r.db.query("SELECT count(*)::int AS n FROM bounties WHERE sponsor_id=$1 AND status='expired'",[sponsor.id])).rows[0]!.n,110);
    assert.equal((await r.db.query("SELECT count(*)::int AS n FROM bounty_events WHERE character_id=$1 AND kind='expired'",[sponsor.id])).rows[0]!.n,110);
  }finally{await r.close();}
});

test('finishing-attack bounty eligibility uses pre-combat levels when the reward crosses a rival-range boundary',{skip},async()=>{
  const r=await setup();try{
    const sponsor=await r.veteran(),target=await r.veteran(),hunter=await r.veteran();
    const desired=Array.from({length:5},(_,i)=>levelRequirement(i+1)).reduce((a,b)=>a+b,0)-1;
    await r.prepare(hunter,0,desired-(await r.me(hunter)).xp);assert.equal((await r.me(hunter)).level,5);
    await r.ok(hunter,'/api/v1/army/recruitments',{unitId:'militia',quantity:20});
    await r.ok(hunter,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:10});
    await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1});
    await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]);
    const hit=await r.ok(hunter,'/api/v1/battles',{targetCharacterId:target.id});assert.equal(hit.state.level,6);
    const result=(await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result;
    assert.equal(result.bountyClaim.reward,1);assert.equal(hit.state.battleStats.kills,1);
  }finally{await r.close();}
});
