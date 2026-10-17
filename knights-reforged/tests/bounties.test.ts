import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl,type Player} from './helpers.js';
import {bountyBoard} from '../src/bounties.js';
import {provisionBots} from '../src/development.js';

const skip=!testDatabaseUrl?'Use a disposable TEST_DATABASE_URL ending in _test.':false;
async function setup(){
  let now=new Date('2032-01-01T23:00:00Z');const r=await realm({isolated:true,clock:()=>now});
  const advance=(seconds:number)=>{now=new Date(+now+seconds*1000);};
  async function veteran(name='Bounty Knight'){
    const p=await r.player(name);await r.prepare(p,25000,30);
    for(let i=0;i<5;i++)await r.ok(p,'/api/v1/quests/border-patrol/runs');
    return p;
  }
  async function hunter(){const p=await veteran('Bounty Hunter');await r.ok(p,'/api/v1/army/recruitments',{unitId:'militia',quantity:20});await r.ok(p,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:20});return p;}
  async function total(players:Player[]){
    const ids=players.map(p=>p.id);
    const row=(await r.db.query(`SELECT (SELECT COALESCE(sum(balance),0) FROM wallets WHERE character_id=ANY($1::uuid[]))+
      (SELECT COALESCE(sum(pending_gold),0) FROM land_accounts WHERE character_id=ANY($1::uuid[]))+
      (SELECT COALESCE(sum(amount),0) FROM bounties WHERE sponsor_id=ANY($1::uuid[]) AND status='active') AS gold`,[ids])).rows[0]!;
    return BigInt(row.gold);
  }
  return {...r,veteran,hunter,total,advance,now:()=>now};
}
test('bounty placement escrows real funds; retries cannot duplicate escrow or fees',{skip},async()=>{
  const r=await setup();try{
    const sponsor=await r.veteran(),target=await r.veteran();const before=await r.me(sponsor),total=await r.total([sponsor,target]);
    const key=randomUUID();const results=await Promise.all([r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1000},key),r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1000},key)]);
    assert.equal(results[0].data.bountyId,results[1].data.bountyId);assert.equal((await r.me(sponsor)).gold,before.gold-1100);
    assert.equal(await r.total([sponsor,target]),total-100n);
    const board=await bountyBoard(r.db,sponsor.id);assert.ok(board.active.some(b=>b.id===results[0].data.bountyId));
    assert.equal((await r.command(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:2000},key)).statusCode,409);
  }finally{await r.close();}
});
test('self, novice, ally, unfunded, malformed and duplicate-target bounties are rejected atomically',{skip},async()=>{
  const r=await setup();try{
    const sponsor=await r.veteran(),target=await r.veteran(),novice=await r.player();
    const gold=(await r.me(sponsor)).gold;
    for(const [id,amount] of [[sponsor.id,100],[novice.id,100],[target.id,0],[target.id,10001],[target.id,'1.5']] as const){
      const response=await r.command(sponsor,'/api/v1/bounties/placements',{targetCharacterId:id,amount});assert.ok(response.statusCode>=400,response.body);
    }
    assert.equal((await r.command(novice,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100})).statusCode,409);
    await r.ok(sponsor,'/api/v1/army/invitations',{targetCharacterId:target.id});await r.ok(target,'/api/v1/army/acceptances',{targetCharacterId:sponsor.id});
    assert.equal((await r.command(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100})).statusCode,409);
    await r.ok(sponsor,'/api/v1/army/removals',{targetCharacterId:target.id});
    assert.equal((await r.me(sponsor)).gold,gold);
    const poor=await r.veteran();await r.db.query('UPDATE wallets SET balance=100 WHERE character_id=$1',[poor.id]);
    assert.equal((await r.command(poor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100})).statusCode,409);
    assert.equal((await r.me(poor)).gold,100);
    await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100});
    assert.equal((await r.command(poor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100})).statusCode,409);
    const other=await r.veteran();const page=await r.app.inject({method:'POST',url:'/game/bounties/cancel',headers:{cookie:other.cookie,origin:'http://localhost:3000',accept:'application/json'},payload:{csrf:other.csrf,bountyId:randomUUID(),commandId:randomUUID()}});assert.equal(page.statusCode,404);
  }finally{await r.close();}
});
test('simultaneous finishing battles can claim escrow once; reports distinguish bounty from ordinary loot',{skip},async()=>{
  const r=await setup();try{
    const sponsor=await r.veteran(),target=await r.veteran(),a=await r.hunter(),b=await r.hunter();
    const total=await r.total([sponsor,target,a,b]);const placed=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1000});
    await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]);
    const attempts=await Promise.all([r.command(a,'/api/v1/battles',{targetCharacterId:target.id}),r.command(b,'/api/v1/battles',{targetCharacterId:target.id})]);
    assert.deepEqual(attempts.map(f=>f.statusCode).sort(),[200,409]);
    const winningIndex=attempts.findIndex(f=>f.statusCode===200),actor=winningIndex===0?a:b;
    const fight=attempts[winningIndex]!.json();const report=(await r.db.query('SELECT result FROM battles WHERE id=$1',[fight.battleId])).rows[0]!.result;
    assert.equal(report.bountyClaim.reward,1000);assert.equal((await r.me(actor)).battleStats.kills,1);assert.equal((await r.me(target)).health,0);
    const contract=(await r.db.query('SELECT * FROM bounties WHERE id=$1',[placed.data.bountyId])).rows[0]!;assert.equal(contract.status,'claimed');assert.ok([a.id,b.id].includes(contract.claimant_id));
    assert.equal((await r.db.query("SELECT count(*)::int AS n FROM bounty_events WHERE bounty_id=$1 AND kind='claimed'",[contract.id])).rows[0]!.n,1);
    assert.equal((await r.db.query("SELECT count(*)::int AS n FROM economy_entries e JOIN economy_transactions t ON t.id=e.transaction_id WHERE e.character_id=ANY($1::uuid[]) AND t.reason='bounty_reward'",[[a.id,b.id]])).rows[0]!.n,1);
    assert.equal(await r.total([sponsor,target,a,b]),total-100n);
    const page=await r.app.inject({method:'GET',url:'/game/battles/'+fight.battleId,headers:{cookie:actor.cookie}});assert.equal(page.statusCode,200,page.body);assert.match(page.body,/Bounty claimed/);assert.match(page.body,/separate from the ordinary battle loot/);
    assert.equal((await r.app.inject({method:'GET',url:'/api/v1/battles/'+fight.battleId,headers:{cookie:sponsor.cookie}})).statusCode,404);
  }finally{await r.close();}
});
test('cancellation and exact-deadline expiry refund principal once, retain fees and block late claims',{skip},async()=>{
  const r=await setup();try{
    const sponsor=await r.veteran(),target=await r.veteran(),other=await r.veteran(),hunter=await r.hunter();const before=(await r.me(sponsor)).gold;
    const first=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1000});
    assert.equal((await r.command(sponsor,'/api/v1/bounties/cancellations',{bountyId:first.data.bountyId})).statusCode,409);
    assert.equal((await r.command(other,'/api/v1/bounties/cancellations',{bountyId:first.data.bountyId})).statusCode,404);
    r.advance(3600);const key=randomUUID();await Promise.all([r.ok(sponsor,'/api/v1/bounties/cancellations',{bountyId:first.data.bountyId},key),r.ok(sponsor,'/api/v1/bounties/cancellations',{bountyId:first.data.bountyId},key)]);
    assert.equal((await r.me(sponsor)).gold,before-100);
    const relisted=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1000});
    assert.notEqual(relisted.data.bountyId,first.data.bountyId);
    const nextTarget=await r.veteran();const second=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:nextTarget.id,amount:500});r.advance(86400);
    const [board,fight]=await Promise.all([bountyBoard(r.db,sponsor.id),r.ok(hunter,'/api/v1/battles',{targetCharacterId:nextTarget.id})]);
    assert.ok(!board.active.some(row=>row.id===second.data.bountyId));assert.equal((await r.db.query('SELECT result FROM battles WHERE id=$1',[fight.battleId])).rows[0]!.result.bountyClaim,null);
    await bountyBoard(r.db,sponsor.id);assert.equal((await r.me(sponsor)).gold,before-250);
    assert.equal((await r.db.query("SELECT count(*)::int AS n FROM bounty_events WHERE bounty_id=$1 AND kind='expired'",[second.data.bountyId])).rows[0]!.n,1);
  }finally{await r.close();}
});
test('refund overflow is retained exactly instead of destroyed or duplicated',{skip},async()=>{
  const r=await setup();try{
    const sponsor=await r.veteran(),target=await r.veteran();const placed=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1000});
    await r.db.query('UPDATE wallets SET balance=2147483647 WHERE character_id=$1',[sponsor.id]);r.advance(86400);await bountyBoard(r.db,sponsor.id);await bountyBoard(r.db,sponsor.id);
    const state=await r.me(sponsor);assert.equal(state.gold,2147483647);assert.equal(state.land.pendingGold,'1000');
    assert.equal((await r.db.query('SELECT status FROM bounties WHERE id=$1',[placed.data.bountyId])).rows[0]!.status,'expired');
  }finally{await r.close();}
});
test('sponsor cannot collect its own contract, and accepted ally claims leave the contract available',{skip},async()=>{
  const r=await setup();try{
    const sponsor=await r.hunter(),target=await r.veteran(),ally=await r.hunter();
    await r.ok(sponsor,'/api/v1/army/invitations',{targetCharacterId:ally.id});await r.ok(ally,'/api/v1/army/acceptances',{targetCharacterId:sponsor.id});
    const placed=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1000});
    for(const actor of [sponsor,ally]){
      const fight=await r.ok(actor,'/api/v1/battles',{targetCharacterId:target.id});assert.equal((await r.db.query('SELECT result FROM battles WHERE id=$1',[fight.battleId])).rows[0]!.result.bountyClaim,null);
    }
    assert.equal((await r.db.query('SELECT status FROM bounties WHERE id=$1',[placed.data.bountyId])).rows[0]!.status,'active');
  }finally{await r.close();}
});
test('concurrent placements cannot overspend or charge a losing sponsor for the same target',{skip},async()=>{
  const r=await setup();try{
    const sponsor=await r.veteran(),a=await r.veteran(),b=await r.veteran();await r.db.query('UPDATE wallets SET balance=110 WHERE character_id=$1',[sponsor.id]);
    const attempts=await Promise.all([r.command(sponsor,'/api/v1/bounties/placements',{targetCharacterId:a.id,amount:100}),r.command(sponsor,'/api/v1/bounties/placements',{targetCharacterId:b.id,amount:100})]);
    assert.deepEqual(attempts.map(x=>x.statusCode).sort(),[200,409]);assert.equal((await r.me(sponsor)).gold,0);
    const target=await r.veteran(),payers=[await r.veteran(),await r.veteran()];const before=await Promise.all(payers.map(p=>r.me(p)));
    const raced=await Promise.all(payers.map(p=>r.command(p,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1})));
    assert.deepEqual(raced.map(x=>x.statusCode).sort(),[200,409]);const loser=raced.findIndex(x=>x.statusCode===409);
    assert.equal((await r.me(payers[loser]!)).gold,before[loser]!.gold);
    assert.equal((await r.db.query("SELECT count(*)::int AS n FROM bounties WHERE target_id=$1 AND status='active'",[target.id])).rows[0]!.n,1);
  }finally{await r.close();}
});
test('only the finishing attacker receives the bounty; prior hits and ordinary knockouts award no kills',{skip},async()=>{
  const r=await setup();try{
    const sponsor=await r.veteran(),target=await r.veteran(),earlier=await r.hunter(),finisher=await r.hunter();
    const contract=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:10000});
    const first=await r.ok(earlier,'/api/v1/battles',{targetCharacterId:target.id});
    assert.equal((await r.db.query('SELECT result FROM battles WHERE id=$1',[first.battleId])).rows[0]!.result.bountyClaim,null);
    assert.equal((await r.me(earlier)).battleStats.kills,0);
    // Explicit resource fixture shortens this finishing test, not the production recovery rules.
    await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]);
    const key=randomUUID(),final=await r.ok(finisher,'/api/v1/battles',{targetCharacterId:target.id},key);
    await r.ok(finisher,'/api/v1/battles',{targetCharacterId:target.id},key);
    const saved=(await r.db.query('SELECT result FROM battles WHERE id=$1',[final.battleId])).rows[0]!.result;
    assert.equal(saved.bountyClaim.id,contract.data.bountyId);assert.equal(saved.bountyClaim.reward,10000);
    assert.equal((await r.me(finisher)).battleStats.kills,1);assert.equal((await r.me(earlier)).battleStats.kills,0);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM bounty_kills')).rows[0]!.n,1);
    assert.equal((await r.me(target)).health,0);r.advance(179);assert.equal((await r.me(target)).health,0);r.advance(1);assert.equal((await r.me(target)).health,10);
    const ordinary=await r.ok(finisher,'/api/v1/battles',{targetCharacterId:target.id});assert.equal((await r.db.query('SELECT result FROM battles WHERE id=$1',[ordinary.battleId])).rows[0]!.result.bountyClaim,null);
    assert.equal((await r.me(finisher)).battleStats.kills,1);
  }finally{await r.close();}
});
test('ended placements share a 50-per-target rolling limit and relist immediately without sponsor or midnight resets',{skip},async()=>{
  const r=await setup();try{
    const sponsors=[await r.veteran(),await r.veteran()],target=await r.veteran(),hunter=await r.hunter();const start=+r.now(),total=await r.total([...sponsors,target,hunter]);
    await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]);
    for(let i=0;i<50;i++){
      if(i)r.advance(180);
      let placed;
      if(i===49){
        const race=await Promise.all(sponsors.map(p=>r.command(p,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1})));
        assert.deepEqual(race.map(x=>x.statusCode).sort(),[200,409]);placed=race.find(x=>x.statusCode===200)!.json();
      }else placed=await r.ok(sponsors[i%2]!,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1});
      if(i===1){const failed=await r.command(sponsors[0]!,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1});assert.equal(failed.json().error.code,'BOUNTY_EXISTS');}
      const hit=await r.ok(hunter,'/api/v1/battles',{targetCharacterId:target.id});
      assert.equal((await r.db.query('SELECT result FROM battles WHERE id=$1',[hit.battleId])).rows[0]!.result.bountyClaim.id,placed.data.bountyId);
      assert.equal((await r.me(target)).health,0);
    }
    assert.equal((await r.me(hunter)).battleStats.kills,50);assert.equal(await r.total([...sponsors,target,hunter]),total-50n);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM bounties WHERE target_id=$1',[target.id])).rows[0]!.n,50);
    const before=(await r.me(sponsors[0]!)).gold;
    assert.equal((await r.command(sponsors[0]!,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1})).json().error.code,'BOUNTY_LIMIT');
    assert.equal((await r.me(sponsors[0]!)).gold,before);
    r.advance((start+86400000-+r.now())/1000-1);
    assert.equal((await r.command(sponsors[1]!,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1})).json().error.code,'BOUNTY_LIMIT');
    r.advance(1);const next=await r.ok(sponsors[1]!,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1});assert.ok(next.data.bountyId);
  }finally{await r.close();}
});
test('a public-profile bounty preview discloses the exact fee and confirmation rechecks availability',{skip},async()=>{
  const r=await setup();try{
    const a=await r.veteran(),b=await r.veteran(),target=await r.veteran(),before=(await r.me(a)).gold;
    const preview=await r.command(a,'/game/bounties/preview',{targetCharacterId:target.id,amount:'1'});assert.equal(preview.statusCode,200,preview.body);
    assert.match(preview.body,/Nonrefundable listing fee/);assert.match(preview.body,/Confirm bounty — 2 gold/);assert.equal((await r.me(a)).gold,before);
    const profile=await r.app.inject({method:'GET',url:'/game/players/'+target.id,headers:{cookie:a.cookie}});assert.match(profile.body,/action="\/game\/bounties\/preview"/);
    await r.ok(b,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1});
    const rejected=await r.command(a,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1,quotedRulesetId:'refinements-0.1'});assert.equal(rejected.json().error.code,'BOUNTY_EXISTS');assert.equal((await r.me(a)).gold,before);
    assert.equal((await r.command(a,'/game/bounties/preview',{targetCharacterId:target.id,amount:1.5})).statusCode,422);
  }finally{await r.close();}
});
test('temporary rivals cannot receive bounties or become player allies',{skip},async()=>{
  const r=await setup();try{
    await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
    const actor=await r.veteran();const bot=(await r.db.query("SELECT b.character_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=3 LIMIT 1")).rows[0]!;
    const before=(await r.me(actor)).gold;
    const response=await r.command(actor,'/api/v1/bounties/placements',{targetCharacterId:bot.character_id,amount:1000});assert.equal(response.statusCode,409);assert.equal(response.json().error.code,'BOUNTY_ELIGIBILITY');
    assert.equal((await r.command(actor,'/api/v1/army/invitations',{targetCharacterId:bot.character_id})).json().error.code,'BOT_ARMY_LINK');
    assert.equal((await r.me(actor)).gold,before);
  }finally{await r.close();}
});
