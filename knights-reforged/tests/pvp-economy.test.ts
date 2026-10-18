import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl,type Player} from './helpers.js';
import {pvp,victoryLoot} from '../src/pvp-rules.js';
import {loadConfig} from '../src/config.js';
import {createApp} from '../src/app.js';
import {createSession} from '../src/auth.js';
import {executeCommand} from '../src/commands.js';
import {bountyBoard} from '../src/bounties.js';
import {provisionBots} from '../src/development.js';

const skip=!testDatabaseUrl;
async function setup(bots=false){
  let now=new Date('2041-01-01T23:00:00Z');
  const r=await realm({isolated:true,clock:()=>now,developmentBotsEnabled:bots,developmentBotBountiesEnabled:bots});
  async function veteran(name='Realm Hunter',strong=false){
    const actor=await r.player(name);await r.prepare(actor,200000,30);
    for(let i=0;i<5;i++)await r.ok(actor,'/api/v1/quests/border-patrol/runs');
    if(strong){await r.legacyArmy(actor,10);await r.ok(actor,'/api/v1/inventory/purchases',{itemId:'iron-sword',quantity:10});}
    return actor;
  }
  const battle=async(id:string)=>(await r.db.query('SELECT result FROM battles WHERE id=$1',[id])).rows[0]!.result;
  // Isolated explicit combat fixtures keep enough Health/Spirit to examine
  // economic windows without waiting days or altering production mechanics.
  const ready=async(...players:Player[])=>r.db.query('UPDATE characters SET level_xp=0,max_health=1000,health=1000,max_spirit=100,spirit=100,health_updated_at=$2,spirit_updated_at=$2 WHERE id=ANY($1::uuid[])',[players.map(p=>p.id),now]);
  return {...r,veteran,battle,ready,now:()=>now,advance:(s:number)=>{now=new Date(+now+s*1000);}};
}

test('approved loot arithmetic uses current unbanked gold, two floors, cap and all diminishing percentages',()=>{
  let gold=100000;const stolen=[];
  for(let victory=1;victory<=6;victory++){const loot=victoryLoot(gold,victory);stolen.push(loot.amount);gold-=loot.amount;}
  assert.deepEqual(stolen,[3000,2182,1422,700,278,277]);
  assert.equal(victoryLoot(2147483647,1).amount,5000);
  assert.equal(victoryLoot(33,1).amount,0);assert.equal(victoryLoot(34,1).amount,1);
  assert.equal(victoryLoot(100000,2,true).amount,50);
  assert.equal(victoryLoot(100,2,true).amount,2);
  assert.equal(victoryLoot(100000,1,true,false).amount,0);
  for(const bad of [-1,NaN,1.5])assert.throws(()=>victoryLoot(bad,1));
});
test('bot bounty configuration is opt-in, requires enabled rivals and is always prohibited in production',()=>{
  for(const env of [
    {NODE_ENV:'development',ENABLE_DEV_BOT_BOUNTIES:'1'},
    {NODE_ENV:'test',ENABLE_DEV_BOTS:'1'},
    {NODE_ENV:'production',APP_ORIGIN:'https://realm.example',ENABLE_DEV_BOTS:'1',ENABLE_DEV_BOT_BOUNTIES:'1'},
    {NODE_ENV:'staging',ENABLE_DEV_BOTS:'1',ENABLE_DEV_BOT_BOUNTIES:'1'},
  ])assert.equal(loadConfig(env).developmentBotBountiesEnabled,false);
  assert.equal(loadConfig({NODE_ENV:'development',ENABLE_DEV_BOTS:'1',ENABLE_DEV_BOT_BOUNTIES:'1'}).developmentBotBountiesEnabled,true);
});

test('fixed-window victory sequence transfers exact gold through fifth+ hits, survives app restart, protects Vault and never rewards replays',{skip},async()=>{
  const r=await setup();try{
    const a=await r.veteran('Storm Hunter',true),b=await r.veteran('Gold Keeper');await r.ready(a,b);
    await r.ok(b,'/api/v1/vault/deposits',{amount:100000});
    await r.db.query('UPDATE wallets SET balance=100000 WHERE character_id=$1',[b.id]);
    const savedBank=(await r.me(b)).bankedGold,initialA=(await r.me(a)).gold;
    let expected=100000,total=0;
    for(let i=1;i<=6;i++){
      const key=randomUUID(),before=await r.me(a),expectedLoot=victoryLoot(expected,i).amount;
      const hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id},key),report=await r.battle(hit.battleId);
      assert.equal(report.outcome,'attacker_win');assert.equal(report.loot,expectedLoot);assert.equal(report.lootDetails.victory,i);
      assert.equal(report.lootDetails.windowStartedAt,'2041-01-01T23:00:00.000Z');
      assert.equal(report.lootDetails.resetsAt,'2041-01-02T23:00:00.000Z');
      assert.equal(hit.state.spirit,before.spirit-1);if(i>3)assert.equal(report.attackerXp,1);
      const replay=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id},key);assert.equal(replay.battleId,hit.battleId);
      assert.equal((await r.me(a)).spirit,hit.state.spirit);expected-=expectedLoot;total+=expectedLoot;
      assert.equal((await r.me(b)).gold,expected);assert.equal((await r.me(b)).bankedGold,savedBank);
      if(i===2)r.advance(3600);
    }
    assert.equal((await r.me(a)).gold,initialA+total);
    const journal=(await r.db.query("SELECT sum(e.amount)::text AS total FROM economy_entries e JOIN economy_transactions t ON t.id=e.transaction_id WHERE t.reason='battle_loot'")).rows[0]!;
    assert.equal(journal.total,'0');assert.equal((await r.me(a)).battleStats.kills,0);
    const restarted=await createApp({db:r.db,config:loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000'})});
    try{
      const response=await restarted.inject({method:'POST',url:'/api/v1/battles',headers:{cookie:a.cookie,origin:'http://localhost:3000','x-csrf-token':a.csrf,'idempotency-key':randomUUID()},payload:{targetCharacterId:b.id}});
      assert.equal(response.statusCode,200,response.body);assert.equal((await r.battle(response.json().battleId)).lootDetails.victory,7);
    }finally{await restarted.close();}
    // Exactly 24h from the first victory, not from the last hit or midnight.
    r.advance(86400-3600-1);await r.ready(a,b);
    assert.equal((await r.battle((await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id})).battleId)).lootDetails.victory,8);
    r.advance(1);await r.ready(a,b);
    const reset=await r.battle((await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id})).battleId);
    assert.equal(reset.lootDetails.victory,1);assert.equal(reset.lootDetails.multiplier,100);
    assert.equal(reset.lootDetails.windowStartedAt,'2041-01-02T23:00:00.000Z');
  }finally{await r.close();}
});
test('defeats transfer no gold and never create or advance a victory sequence',{skip},async()=>{
  const r=await setup();try{
    const a=await r.veteran('Brave Novice'),b=await r.veteran('Iron Defender',true);await r.ready(a,b);
    await r.ok(b,'/api/v1/inventory/purchases',{itemId:'padded-coat',quantity:10});
    const beforeA=await r.me(a),beforeB=await r.me(b),hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:b.id}),report=await r.battle(hit.battleId);
    assert.equal(report.outcome,'defender_win');assert.equal(report.loot,0);assert.equal(report.lootDetails,null);
    assert.equal(hit.state.gold,beforeA.gold);assert.equal((await r.me(b)).gold,beforeB.gold);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM pvp_loot_sequences')).rows[0]!.n,0);
    assert.equal(hit.state.battleStats.kills,0);
  }finally{await r.close();}
});
test('concurrent victories serialize remaining-wallet formulas and retries cannot duplicate transfers or Spirit',{skip},async()=>{
  const r=await setup();try{
    const a=await r.veteran('First Hunter',true),b=await r.veteran('Second Hunter',true),target=await r.veteran('Wealthy Defender');await r.ready(a,b,target);
    await r.db.query('UPDATE wallets SET balance=100000 WHERE character_id=$1',[target.id]);
    const sumBefore=(await r.me(a)).gold+(await r.me(b)).gold+100000;
    const key=randomUUID(),responses=await Promise.all([
      r.ok(a,'/api/v1/battles',{targetCharacterId:target.id},key),r.ok(a,'/api/v1/battles',{targetCharacterId:target.id},key),
      r.ok(a,'/api/v1/battles',{targetCharacterId:target.id}),r.ok(b,'/api/v1/battles',{targetCharacterId:target.id}),
    ]);
    assert.equal(responses[0].battleId,responses[1].battleId);
    const reports=(await r.db.query('SELECT snapshot,result FROM battles ORDER BY created_at,id')).rows;
    assert.equal(reports.length,3);
    let amount=0;for(const row of reports){const result=row.result;assert.equal(result.loot,victoryLoot(row.snapshot.defender.gold,result.lootDetails.victory).amount);amount+=result.loot;}
    assert.equal((await r.me(target)).gold,100000-amount);
    assert.equal((await r.me(a)).gold+(await r.me(b)).gold+(await r.me(target)).gold,sumBefore);
    assert.equal((await r.me(a)).spirit,98);assert.equal((await r.me(b)).spirit,99);
    assert.equal((await r.db.query('SELECT sum(victories)::int AS n FROM pvp_loot_sequences')).rows[0]!.n,3);
  }finally{await r.close();}
});
test('Vault transfers persist, conserve gold, reject overspending/overflow and never fund bounties implicitly',{skip},async()=>{
  const r=await setup();try{
    const a=await r.veteran(),target=await r.veteran();const before=(await r.me(a)).gold,key=randomUUID();
    await Promise.all([r.ok(a,'/api/v1/vault/deposits',{amount:before},key),r.ok(a,'/api/v1/vault/deposits',{amount:before},key)]);
    assert.equal((await r.me(a)).gold,0);assert.equal((await r.me(a)).bankedGold,before);
    assert.equal((await r.command(a,'/api/v1/bounties/placements',{targetCharacterId:target.id,amount:1})).statusCode,409);
    const race=await Promise.all([r.command(a,'/api/v1/vault/withdrawals',{amount:before}),r.command(a,'/api/v1/vault/withdrawals',{amount:before})]);
    assert.deepEqual(race.map(r=>r.statusCode).sort(),[200,409]);assert.equal((await r.me(a)).bankedGold,0);assert.equal((await r.me(a)).gold,before);
    assert.equal((await r.command(a,'/api/v1/vault/withdrawals',{amount:1})).statusCode,409);
    assert.equal((await r.command(a,'/api/v1/vault/deposits',{amount:1.5})).statusCode,422);
    await r.ok(a,'/api/v1/vault/deposits',{amount:100});
    await r.db.query('UPDATE wallets SET balance=2147483647 WHERE character_id=$1',[a.id]);
    assert.equal((await r.command(a,'/api/v1/vault/withdrawals',{amount:100})).json().error.code,'VAULT_LIMIT');assert.equal((await r.me(a)).bankedGold,100);
    const publicData=await r.app.inject({method:'GET',url:'/api/v1/players/'+a.id,headers:{cookie:target.cookie}});
    assert.ok(!publicData.body.includes('bankedGold'));assert.ok(!publicData.body.includes('account_id'));
    const view=await r.app.inject({method:'GET',url:'/game/vault',headers:{cookie:a.cookie}});assert.equal(view.statusCode,200,view.body);assert.match(view.body,/Protected Vault balance/);
  }finally{await r.close();}
});
test('profile actions are prominent for humans and bots, placement shows exact fees and unavailable reasons',{skip},async()=>{
  const r=await setup(true);try{
    await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});const sponsor=await r.veteran(),target=await r.veteran();
    const bot=(await r.db.query("SELECT b.character_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=3 AND b.tier='green'")).rows[0]!.character_id;
    for(const id of [target.id,bot]){
      const profile=await r.app.inject({method:'GET',url:'/game/players/'+id,headers:{cookie:sponsor.cookie}});assert.equal(profile.statusCode,200,profile.body);
      assert.ok(profile.body.indexOf('Add to Bounty List')<profile.body.indexOf('id="player"'));
      assert.match(profile.body,/class="opponent-actions"/);assert.ok(profile.body.includes('/game/bounties/new?target='+id));
      const placement=await r.app.inject({method:'GET',url:'/game/bounties/new?target='+id,headers:{cookie:sponsor.cookie}});
      assert.equal(placement.statusCode,200,placement.body);assert.match(placement.body,/Eligible for a new bounty/);assert.match(placement.body,/1–10,000/);
      const live=await r.app.inject({method:'GET',url:'/api/v1/bounties/quote?targetCharacterId='+id+'&amount=101',headers:{cookie:sponsor.cookie}});assert.equal(live.statusCode,200);assert.equal(live.json().quote.total,112);
      const quote=await r.command(sponsor,'/game/bounties/preview',{targetCharacterId:id,amount:101});assert.equal(quote.statusCode,200,quote.body);assert.match(quote.body,/Confirm bounty — 112 gold/);
    }
    await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:bot,amount:1});
    const blocked=await r.app.inject({method:'GET',url:'/game/bounties/new?target='+bot,headers:{cookie:sponsor.cookie}});assert.equal(blocked.statusCode,200,blocked.body);assert.match(blocked.body,/already has an active bounty/);
    const disabled=await createApp({db:r.db,config:loadConfig({NODE_ENV:'test',APP_ORIGIN:'http://localhost:3000',ENABLE_DEV_BOTS:'1'})});
    try{
      const profile=await disabled.inject({method:'GET',url:'/game/players/'+bot,headers:{cookie:sponsor.cookie}});assert.equal(profile.statusCode,200);assert.match(profile.body,/Add to Bounty List/);assert.match(profile.body,/development bounty flag/);
    }finally{await disabled.close();}
  }finally{await r.close();}
});
test('bot bounties use real escrow, eligible finishing attackers, one kill and unchanged bot reward caps',{skip},async()=>{
  const r=await setup(true);try{
    await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
    const sponsor=await r.veteran('Contract Sponsor',true),hunter=await r.veteran('Bounty Finisher',true),other=await r.veteran('Other Finisher',true);await r.ready(sponsor,hunter,other);
    const bot=(await r.db.query("SELECT b.character_id,c.account_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=3 AND b.tier='green'")).rows[0]!;
    await r.ok(hunter,'/api/v1/battles',{targetCharacterId:bot.character_id}); // Spend normal bot allowance first.
    const sponsorBefore=(await r.me(sponsor)).gold,first=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:bot.character_id,amount:1000});
    await r.db.query('UPDATE characters SET health=35,health_updated_at=$2 WHERE id=$1',[bot.character_id,r.now()]);
    const firstHit=await r.ok(hunter,'/api/v1/battles',{targetCharacterId:bot.character_id});assert.equal((await r.battle(firstHit.battleId)).bountyClaim,null);
    const before=(await r.me(hunter)).gold,key=randomUUID();
    const race=await Promise.all([r.command(hunter,'/api/v1/battles',{targetCharacterId:bot.character_id},key),r.command(hunter,'/api/v1/battles',{targetCharacterId:bot.character_id},key),r.command(other,'/api/v1/battles',{targetCharacterId:bot.character_id})]);
    assert.ok(race.some(x=>x.statusCode===409));
    const claimed=(await r.db.query('SELECT * FROM bounties WHERE id=$1',[first.data.bountyId])).rows[0]!;
    assert.equal(claimed.status,'claimed');const report=await r.battle(claimed.battle_id);
    assert.equal(report.defenderHealthAfter,0);assert.equal(report.bountyClaim.reward,1000);assert.equal((await r.db.query('SELECT count(*)::int AS n FROM bounty_kills')).rows[0]!.n,1);
    if(claimed.claimant_id===hunter.id){assert.equal(report.loot,0);assert.equal(report.attackerXp,1);assert.equal((await r.me(hunter)).gold,before+1000);}
    assert.equal((await r.me(sponsor)).gold,sponsorBefore-1100);
    assert.equal((await r.db.query('SELECT health FROM characters WHERE id=$1',[bot.character_id])).rows[0]!.health,0);
    assert.equal((await r.command(hunter,'/api/v1/battles',{targetCharacterId:bot.character_id})).json().error.code,'OPPONENT_DEFEATED');
    // Immediate relisting is legal even at zero Health; sponsor still cannot claim.
    const relisted=await r.ok(sponsor,'/api/v1/bounties/placements',{targetCharacterId:bot.character_id,amount:1});
    r.advance(180);const ownHit=await r.ok(sponsor,'/api/v1/battles',{targetCharacterId:bot.character_id});assert.equal((await r.battle(ownHit.battleId)).bountyClaim,null);
    assert.equal((await r.me(sponsor)).battleStats.kills,0);
    r.advance(86400);const refundBefore=(await r.me(sponsor)).gold;
    await Promise.all([bountyBoard(r.db,sponsor.id,true),bountyBoard(r.db,sponsor.id,true)]);
    assert.equal((await r.db.query('SELECT status FROM bounties WHERE id=$1',[relisted.data.bountyId])).rows[0]!.status,'expired');
    // me() already settled the expired principal; no second refund follows.
    assert.equal((await r.me(sponsor)).gold,refundBefore);
    assert.equal((await r.db.query("SELECT count(*)::int AS n FROM bounty_events WHERE bounty_id=$1 AND kind='expired'",[relisted.data.bountyId])).rows[0]!.n,1);
    await assert.rejects(executeCommand(r.db,bot.account_id,randomUUID(),'bounty_place',{targetCharacterId:hunter.id,amount:1},{developmentBotsEnabled:true,developmentBotBountiesEnabled:true}),/not found/);
    const forged=await createSession(r.db,bot.account_id);assert.equal((await r.app.inject({method:'GET',url:'/api/v1/me',headers:{cookie:'kr_session='+forged.token}})).statusCode,401);
    assert.equal((await r.db.query('SELECT count(*)::int AS n FROM bounties WHERE sponsor_id=$1 OR claimant_id=$1',[bot.character_id])).rows[0]!.n,0);
  }finally{await r.close();}
});

test('bot placement races, cancellation, expiry and fifty finishing claims obey the shared target limit without creating reward funds',{skip},async()=>{
  const r=await setup(true);try{
    await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
    const sponsors=[await r.veteran('West Sponsor'),await r.veteran('East Sponsor')],hunter=await r.veteran('Contract Hunter',true);await r.ready(hunter);
    const target=(await r.db.query("SELECT b.character_id FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE c.attained_level=3 AND b.tier='green'")).rows[0]!.character_id;
    const before=await Promise.all(sponsors.map(s=>r.me(s)));
    const race=await Promise.all(sponsors.map(s=>r.command(s,'/api/v1/bounties/placements',{targetCharacterId:target,amount:10000})));
    assert.deepEqual(race.map(r=>r.statusCode).sort(),[200,409]);
    const winner=race[0]!.statusCode===200?0:1,loser=1-winner,contract=race[winner]!.json().data.bountyId;
    assert.equal((await r.me(sponsors[loser]!)).gold,before[loser]!.gold);
    assert.equal((await r.me(sponsors[winner]!)).gold,before[winner]!.gold-11000);
    assert.equal((await r.command(sponsors[loser]!,'/api/v1/bounties/placements',{targetCharacterId:target,amount:10001})).statusCode,422);
    r.advance(3600);const cancelKey=randomUUID();
    await Promise.all([r.ok(sponsors[winner]!,'/api/v1/bounties/cancellations',{bountyId:contract},cancelKey),r.ok(sponsors[winner]!,'/api/v1/bounties/cancellations',{bountyId:contract},cancelKey)]);
    assert.equal((await r.me(sponsors[winner]!)).gold,before[winner]!.gold-1000);
    const expiring=await r.ok(sponsors[loser]!,'/api/v1/bounties/placements',{targetCharacterId:target,amount:1});r.advance(86400);
    await Promise.all([bountyBoard(r.db,sponsors[loser]!.id,true),bountyBoard(r.db,sponsors[loser]!.id,true)]);
    assert.equal((await r.me(sponsors[loser]!)).gold,before[loser]!.gold-1);
    assert.equal((await r.db.query('SELECT status FROM bounties WHERE id=$1',[expiring.data.bountyId])).rows[0]!.status,'expired');
    const initial=(await r.me(hunter)).gold+(await r.me(sponsors[0]!)).gold+(await r.me(sponsors[1]!)).gold;
    let ordinaryLoot=0;
    for(let i=0;i<50;i++){
      await r.ok(sponsors[i%2]!,'/api/v1/bounties/placements',{targetCharacterId:target,amount:1});
      // The first explicit wound is a test fixture; subsequent revivals are
      // entirely natural Health ticks, with no timer/reset endpoint.
      if(i===0)await r.db.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[target,r.now()]);
      const report=await r.battle((await r.ok(hunter,'/api/v1/battles',{targetCharacterId:target})).battleId);
      assert.equal(report.defenderHealthAfter,0);assert.equal(report.bountyClaim.reward,1);ordinaryLoot+=report.loot;
      if(i>0){assert.equal(report.loot,0);assert.equal(report.attackerXp,1);}
      r.advance(180);
    }
    assert.ok(ordinaryLoot<=61);assert.equal((await r.me(hunter)).battleStats.kills,50);
    assert.equal((await r.me(hunter)).gold+(await r.me(sponsors[0]!)).gold+(await r.me(sponsors[1]!)).gold,initial+ordinaryLoot-50);
    const rejected=await r.command(sponsors[0]!,'/api/v1/bounties/placements',{targetCharacterId:target,amount:1});assert.equal(rejected.json().error.code,'BOUNTY_LIMIT');
    assert.equal((await r.db.query("SELECT count(*)::int AS n FROM bounties WHERE target_id=$1 AND status='active'",[target])).rows[0]!.n,0);
    const first=(await r.db.query("SELECT min(created_at) AS at FROM bounties WHERE target_id=$1 AND status='claimed'",[target])).rows[0]!.at;
    r.advance((+new Date(first)+86400000-+r.now())/1000);
    assert.equal((await r.command(sponsors[0]!,'/api/v1/bounties/placements',{targetCharacterId:target,amount:1})).statusCode,200);
  }finally{await r.close();}
});
