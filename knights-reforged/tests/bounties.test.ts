import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl,type Player} from './helpers.js';
import {bountyBoard} from '../src/bounties.js';
import {provisionBots} from '../src/development.js';

const skip=!testDatabaseUrl?'Use a disposable TEST_DATABASE_URL ending in _test.':false;
async function setup(){
  let now=new Date('2032-01-01T00:00:00Z');const r=await realm({isolated:true,clock:()=>now});
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
    for(const [id,amount] of [[sponsor.id,100],[novice.id,100],[target.id,99],[target.id,10001],[target.id,'1.5']] as const){
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
test('simultaneous winning battles can claim escrow once; reports distinguish bounty from ordinary loot',{skip},async()=>{
  const r=await setup();try{
    const sponsor=await r.veteran(),target=await r.veteran(),a=await r.hunter(),b=await r.hunter();
    const total=await r.total([sponsor,target,a,b]);const placed=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1000});
    const fights=await Promise.all([r.ok(a,'/api/v1/battles',{targetCharacterId:target.id}),r.ok(b,'/api/v1/battles',{targetCharacterId:target.id})]);
    const reports=await Promise.all(fights.map(async f=>(await r.db.query('SELECT result FROM battles WHERE id=$1',[f.battleId])).rows[0]!.result));
    assert.equal(reports.filter(report=>report.bountyClaim).length,1);assert.ok(reports.every(report=>report.outcome==='attacker_win'));
    const contract=(await r.db.query('SELECT * FROM bounties WHERE id=$1',[placed.data.bountyId])).rows[0]!;assert.equal(contract.status,'claimed');assert.ok([a.id,b.id].includes(contract.claimant_id));
    assert.equal((await r.db.query("SELECT count(*)::int AS n FROM bounty_events WHERE bounty_id=$1 AND kind='claimed'",[contract.id])).rows[0]!.n,1);
    assert.equal((await r.db.query("SELECT count(*)::int AS n FROM economy_entries e JOIN economy_transactions t ON t.id=e.transaction_id WHERE e.character_id=ANY($1::uuid[]) AND t.reason='bounty_reward'",[[a.id,b.id]])).rows[0]!.n,1);
    assert.equal(await r.total([sponsor,target,a,b]),total-100n);
    const winningIndex=reports.findIndex(report=>report.bountyClaim);const actor=winningIndex===0?a:b;
    const page=await r.app.inject({method:'GET',url:'/game/battles/'+fights[winningIndex].battleId,headers:{cookie:actor.cookie}});assert.equal(page.statusCode,200,page.body);assert.match(page.body,/Bounty claimed/);assert.match(page.body,/separate from the ordinary battle loot/);
    assert.equal((await r.app.inject({method:'GET',url:'/api/v1/battles/'+fights[winningIndex].battleId,headers:{cookie:sponsor.cookie}})).statusCode,404);
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
    assert.equal((await r.command(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1000})).statusCode,409);
    const nextTarget=await r.veteran();const second=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:nextTarget.id,amount:500});r.advance(86400);
    const [board,fight]=await Promise.all([bountyBoard(r.db,sponsor.id),r.ok(hunter,'/api/v1/battles',{targetCharacterId:nextTarget.id})]);
    assert.ok(!board.active.some(row=>row.id===second.data.bountyId));assert.equal((await r.db.query('SELECT result FROM battles WHERE id=$1',[fight.battleId])).rows[0]!.result.bountyClaim,null);
    await bountyBoard(r.db,sponsor.id);assert.equal((await r.me(sponsor)).gold,before-150);
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
test('concurrent placements cannot overspend and the target-wide 24-hour placement cap counts canceled records',{skip},async()=>{
  const r=await setup();try{
    const sponsor=await r.veteran(),a=await r.veteran(),b=await r.veteran();await r.db.query('UPDATE wallets SET balance=110 WHERE character_id=$1',[sponsor.id]);
    const attempts=await Promise.all([r.command(sponsor,'/api/v1/bounties/placements',{targetCharacterId:a.id,amount:100}),r.command(sponsor,'/api/v1/bounties/placements',{targetCharacterId:b.id,amount:100})]);
    assert.deepEqual(attempts.map(x=>x.statusCode).sort(),[200,409]);assert.equal((await r.me(sponsor)).gold,0);
    const target=await r.veteran();
    for(let i=0;i<3;i++){
      const payer=await r.veteran();const contract=await r.ok(payer,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100});r.advance(3600);
      await r.ok(payer,'/api/v1/bounties/cancellations',{bountyId:contract.data.bountyId});
    }
    const fourth=await r.veteran();const rejected=await r.command(fourth,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:100});assert.equal(rejected.statusCode,409);assert.equal(rejected.json().error.code,'BOUNTY_LIMIT');
  }finally{await r.close();}
});
test('hunter daily count and gold ceilings keep additional winning contracts funded and unclaimed',{skip},async()=>{
  for(const amounts of [[100,100,100,100],[10000,10000,100]]){
    const r=await setup();try{
      const hunter=await r.hunter();let finalContract='';
      for(let index=0;index<amounts.length;index++){
        const sponsor=await r.veteran(),target=await r.veteran();const placed=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:amounts[index]});
        r.advance(130);const fight=await r.ok(hunter,'/api/v1/battles',{targetCharacterId:target.id});
        const report=(await r.db.query('SELECT result FROM battles WHERE id=$1',[fight.battleId])).rows[0]!.result;assert.equal(report.outcome,'attacker_win');
        if(index===amounts.length-1){assert.equal(report.bountyClaim,null);finalContract=placed.data.bountyId;}
        else assert.equal(report.bountyClaim.reward,amounts[index]);
      }
      assert.equal((await r.db.query('SELECT status FROM bounties WHERE id=$1',[finalContract])).rows[0]!.status,'active');
      const board=await bountyBoard(r.db,hunter.id);assert.match(board.active.find(row=>row.id===finalContract)!.claimBlockedReason!,/daily/);
    }finally{await r.close();}
  }
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
