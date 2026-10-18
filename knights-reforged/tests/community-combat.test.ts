import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {provisionBots} from '../src/development.js';
import {bountyBoard} from '../src/bounties.js';
const skip=!testDatabaseUrl;
async function setup(bots=false){
  let now=new Date('2036-01-01T00:00:00Z');const r=await realm({isolated:true,clock:()=>now,developmentBotsEnabled:bots,logger:process.env.TEST_LOGGER==='1'});
  return {...r,advance:(seconds:number)=>{now=new Date(+now+seconds*1000);},now:()=>now,
    report:async(id:string)=>(await r.db.query('SELECT result FROM battles WHERE id=$1',[id])).rows[0]!.result};
}
test('Attack Again finishes a positive-Health defender at zero, keeps exact snapshots and blocks another attack',{skip},async()=>{
  const r=await setup();try{
    const a=await r.player('Finishing Knight'),b=await r.player('Wounded Rival');await r.prepare(a,1000);await r.ok(a,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:1});
    await r.db.query('UPDATE characters SET health=25,health_updated_at=$2 WHERE id=$1',[b.id,r.now()]);
    const total=(await r.me(a)).gold+(await r.me(b)).gold;
    const first=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id}),one=await r.report(first.battleId);assert.ok(one.defenderHealthAfter<20&&one.defenderHealthAfter>0);
    const second=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id}),two=await r.report(second.battleId);assert.equal(two.defenderHealthAfter,0);
    assert.equal((await r.me(a)).spirit,1);assert.equal((await r.me(a)).gold+(await r.me(b)).gold,total);
    const html=await r.app.inject({method:'GET',url:'/game/battles/'+second.battleId,headers:{cookie:a.cookie}});assert.equal(html.statusCode,200,html.body);
    assert.match(html.body,/Opponent defeated/);assert.match(html.body,/data-attack-ready="false" disabled/);assert.ok(html.body.includes('/game/players/'+a.id)&&html.body.includes('/game/players/'+b.id));
    r.advance(10);const blocked=await r.command(a,'/api/v1/battles',{targetCharacterId:b.id});assert.equal(blocked.statusCode,409);assert.equal(blocked.json().error.code,'OPPONENT_DEFEATED');
    assert.equal((await r.me(a)).spirit,1);assert.deepEqual(await r.report(first.battleId),one);
    assert.equal((await r.me(a)).battleStats.kills,0);assert.equal((await r.me(b)).battleStats.deaths,0);
    r.advance(170);assert.ok((await r.me(b)).health>0); // ordinary recovery can re-open combat
  }finally{await r.close();}
});
test('concurrent finishing attacks produce one death and consume resources only once; identical retries replay',{skip},async()=>{
  const r=await setup();try{
    const a=await r.player(),b=await r.player(),target=await r.player();
    await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]);
    const responses=await Promise.all([r.command(a,'/api/v1/battles',{targetCharacterId:target.id}),r.command(b,'/api/v1/battles',{targetCharacterId:target.id})]);
    assert.deepEqual(responses.map(x=>x.statusCode).sort(),[200,409]);assert.equal((await r.me(target)).battleStats.deaths,0);
    assert.equal((await r.me(a)).spirit+(await r.me(b)).spirit,5);
    r.advance(10);const other=await r.player(),key=randomUUID();
    const repeated=await Promise.all([r.ok(a,'/api/v1/battles',{targetCharacterId:other.id},key),r.ok(a,'/api/v1/battles',{targetCharacterId:other.id},key)]);assert.equal(repeated[0].battleId,repeated[1].battleId);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM battles WHERE attacker_id=$1 AND defender_id=$2',[a.id,other.id])).rows[0]!.n,1);
  }finally{await r.close();}
});
test('repeating reports cannot bypass Spirit, attacker recovery, level range or private report authorization',{skip},async()=>{
  const r=await setup();try{
    const a=await r.player(),b=await r.player(),outsider=await r.player();
    const fight=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id});
    assert.equal((await r.app.inject({method:'GET',url:'/game/battles/'+fight.battleId,headers:{cookie:outsider.cookie}})).statusCode,404);
    await r.db.query('UPDATE characters SET spirit=0 WHERE id=$1',[a.id]);r.advance(10);
    assert.equal((await r.command(a,'/api/v1/battles',{targetCharacterId:b.id})).json().error.code,'INSUFFICIENT_SPIRIT');
    await r.db.query('UPDATE characters SET spirit=3,health=19 WHERE id=$1',[a.id]);
    assert.equal((await r.command(a,'/api/v1/battles',{targetCharacterId:b.id})).json().error.code,'NEEDS_RECOVERY');
    await r.db.query('UPDATE characters SET health=100 WHERE id=$1',[a.id]);await r.prepare(b,0,1000);
    assert.equal((await r.command(a,'/api/v1/battles',{targetCharacterId:b.id})).json().error.code,'RIVAL_LEVEL_RANGE');
  }finally{await r.close();}
});
test('repeat bot attacks use the same engine and preserve the one-per-bot reward cap after a recovery',{skip},async()=>{
  const r=await setup(true);try{
    await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});const a=await r.player();
    const bot=(await r.db.query("SELECT c.id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=1 AND b.tier='green' AND b.variant=0")).rows[0]!.id;
    await r.ok(a,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:1});
    const first=await r.ok(a,'/api/v1/battles',{targetCharacterId:bot});assert.equal((await r.report(first.battleId)).rewarded,true);assert.equal((await r.report(first.battleId)).outcome,'attacker_win');
    r.advance(600);const before=await r.me(a),second=await r.ok(a,'/api/v1/battles',{targetCharacterId:bot}),report=await r.report(second.battleId);
    assert.equal(report.rewarded,false);assert.equal(report.loot,0);assert.equal(report.attackerXp,1);assert.equal(second.state.gold,before.gold);assert.equal(second.state.spirit,before.spirit-1);
    const profile=await r.app.inject({method:'GET',url:'/game/players/'+bot,headers:{cookie:a.cookie}});assert.equal(profile.statusCode,200,profile.body);assert.match(profile.body,/Temporary computer-controlled rival/);
  }finally{await r.close();}
});

test('bounty boards disable a defeated target, recover accurately, and still pay a legitimate finishing victory',{skip},async()=>{
  const r=await setup();try{
    const sponsor=await r.player(),target=await r.player(),hunter=await r.player();
    for(const player of [sponsor,target,hunter]){await r.prepare(player,10000,30);for(let i=0;i<5;i++)await r.ok(player,'/api/v1/quests/border-patrol/runs');}
    await r.legacyArmy(hunter,20);await r.ok(hunter,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:20});
    const contract=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1000});
    await r.db.query('UPDATE characters SET health=0,health_updated_at=$2 WHERE id=$1',[target.id,r.now()]);
    const board=await bountyBoard(r.db,hunter.id);assert.match(board.active[0]!.attackBlockedReason!,/Opponent defeated/);assert.equal(board.active[0]!.claimBlockedReason,null);
    const page=await r.app.inject({method:'GET',url:'/game/bounties',headers:{cookie:hunter.cookie}});assert.equal(page.statusCode,200);assert.match(page.body,/data-attack-ready="false" disabled/);
    r.advance(180);assert.equal((await bountyBoard(r.db,hunter.id)).active[0]!.attackBlockedReason,null);
    const fight=await r.ok(hunter,'/api/v1/battles',{targetCharacterId:target.id}),report=await r.report(fight.battleId);assert.equal(report.defenderHealthAfter,0);assert.equal(report.bountyClaim.id,contract.data.bountyId);assert.equal(report.bountyClaim.reward,1000);
  }finally{await r.close();}
});
