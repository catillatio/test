import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {realm,testDatabaseUrl} from './helpers.js';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
import {botCombat,previousBotCombatV2,botVictoryRewards} from '../src/bot-combat-rules.js';
import {humanPvpLoot} from '../src/human-pvp-loot.js';
import {provisionBots} from '../src/development.js';
import {getState,lockCharacters} from '../src/game.js';
import {transaction} from '../src/db.js';
import {ledger} from '../src/economy.js';
import {grantExperience} from '../src/progression.js';
import {migrate,reconcileLevelMilestones} from '../src/migrate.js';
import {executeCommand,type CommandResult} from '../src/commands.js';

const skip=!testDatabaseUrl;
const xpFor=(level:number)=>Array.from({length:level-1},(_,i)=>levelRequirement(i+1)).reduce((a,b)=>a+b,0);

test('progressive bot payouts conserve real gold through concurrent combat, cutover, replay and rollback',{skip,timeout:120000},async t=>{
 const now=new Date('2049-05-01T00:00:00Z'),r=await realm({isolated:true,developmentBotsEnabled:true,clock:()=>now});
 try{
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
  async function hunter(name:string){
   const p=await r.player(name);await r.prepare(p,100000000,xpFor(50));await r.legacyArmy(p,20);
   for(const category of ['weapon','armor','spell']){
    const item=alpha.items.filter(i=>i.category===category&&i.level<=50).sort((a,b)=>b.attack-a.attack||b.defense-a.defense)[0]!;
    await r.ok(p,'/api/v1/inventory/purchases',{itemId:item.id,quantity:10});
   }
   return p;
  }
  const a=await hunter('Progressive First Hunter'),b=await hunter('Progressive Second Hunter'),other=await r.player('Unrelated Contract Target');
  await r.prepare(other,100000,xpFor(50));
  for(const player of [a,other])for(let n=0;n<5;n++)await r.ok(player,'/api/v1/quests/border-patrol/runs');
  await r.ok(a,'/api/v1/bounties/placements',{targetCharacterId:other.id,amount:1000});
  const target=(await r.db.query("SELECT c.id,c.account_id FROM characters c JOIN development_bots d ON d.character_id=c.id WHERE c.attained_level=50 AND d.tier='green' AND d.variant=0")).rows[0]!;
  const ready=async(ids:string[],level=50)=>r.db.query('UPDATE characters SET attained_level=$3,level_xp=0,health=5000,max_health=5000,spirit=100,max_spirit=100,health_updated_at=$2,spirit_updated_at=$2 WHERE id=ANY($1::uuid[])',[ids,now,level]);
  await ready([a.id,b.id,other.id,target.id]);
  const state=await r.me(a),defender=await getState(r.db,target.account_id);
  assert.ok(state.attack*90>defender.defense*110,'legal saved equipment guarantees the fixture victory at every random roll');
  const report=async(id:string)=>(await r.db.query('SELECT snapshot,result FROM battles WHERE id=$1',[id])).rows[0]!;
  const total=async()=>BigInt((await r.db.query('SELECT sum(w.balance::numeric+COALESCE(l.pending_gold,0))::text AS n FROM wallets w LEFT JOIN land_accounts l ON l.character_id=w.character_id')).rows[0]!.n);
  const protectedState=async()=>({vaults:(await r.db.query('SELECT * FROM vault_accounts ORDER BY character_id')).rows,bounties:(await r.db.query('SELECT * FROM bounties ORDER BY id')).rows,events:(await r.db.query('SELECT * FROM bounty_events ORDER BY id')).rows});
  const savedProtection=await protectedState();assert.ok(savedProtection.bounties.length>0);

  await t.test('adding only the v3 registry preserves synthetic v2 history, finance, pair windows and receipts',async()=>{
   // Explicit prior-version fixture. Its existing transfer/report are facts to
   // preserve, not records for the new reward calculator to reinterpret.
   await r.db.query('UPDATE wallets SET balance=1000000 WHERE character_id=$1',[target.id]);
   const key=randomUUID(),id=randomUUID(),intent={targetCharacterId:target.id};
   const oldResult:CommandResult={commandId:key,kind:'attack',battleId:id,message:'Saved bot v2 capped victory.'};
   await transaction(r.db,async sql=>{
    await lockCharacters(sql,[a.id,target.id]);
    await ledger(sql,key,'battle_loot',[{characterId:target.id,amount:-3000},{characterId:a.id,amount:3000}],previousBotCombatV2.id);
    await grantExperience(sql,a.id,1,now);
    await sql.query(`INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,rewarded,created_at)
     VALUES($1,$2,$3,'alpha-0.3','attacker_win',$4,$5,true,$6)`,[id,a.id,target.id,{attacker:{level:50},defender:{level:50,gold:1000000}},
     {id,commandId:key,outcome:'attacker_win',attackerId:a.id,defenderId:target.id,winnerId:a.id,attackerName:'Historical Hunter',defenderName:'Historical Wealthy Bot',loot:3000,attackerXp:1,temporaryRival:true,rewarded:true,botRewardEligibilityPolicy:previousBotCombatV2.id,pvpRulesetId:previousBotCombatV2.id,progressionRulesetId:previousBotCombatV2.id,lootDetails:{base:15000,multiplier:100,amount:3000,botCap:3000,rulesetId:previousBotCombatV2.id},xpDetails:{amount:1,repeatMultiplier:100,fullXpPercent:65},createdAt:now.toISOString()},now]);
    await sql.query('INSERT INTO command_receipts(account_id,command_id,kind,intent_hash,result) VALUES($1,$2,$3,$4,$5)',[a.accountId,key,'attack',createHash('sha256').update(JSON.stringify({kind:'attack',intent})).digest('hex'),oldResult]);
    await sql.query('INSERT INTO pvp_loot_sequences(attacker_id,defender_id,window_started_at,victories,ruleset_id) VALUES($1,$2,$3,4,$4)',[a.id,target.id,now,previousBotCombatV2.id]);
   });
   await transaction(r.db,reconcileLevelMilestones);
   await r.db.query('DELETE FROM rulesets WHERE id=$1',[botCombat.id]);
   async function snapshot(){
    const data:Record<string,string[]>={};
    for(const {table_name:table}of(await r.db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows){
     assert.match(table,/^[a-z_]+$/);data[table]=(await r.db.query('SELECT row_to_json(t)::text AS row FROM "'+table+'" t')).rows.map(x=>x.row).sort();
    }
    return data;
   }
   const before=await snapshot();await migrate(r.db);const after=await snapshot();
   for(const [table,rows]of Object.entries(before)){
    if(table==='rulesets'){assert.equal(after[table]!.length,rows.length+1);assert.ok(rows.every(x=>after[table]!.includes(x)));}
    else assert.deepEqual(after[table],rows,table+' must not change during policy registration');
   }
   assert.equal(after.development_bots!.length,450);await migrate(r.db);assert.deepEqual(await snapshot(),after);
   assert.deepEqual(await executeCommand(r.db,a.accountId,key,'attack',intent,{developmentBotsEnabled:true}),oldResult);
   assert.deepEqual(await snapshot(),after,'an old receipt returns its original transfer and report without recalculation');
  });

  await t.test('saved levels 50–100 pay below/at/above the threshold from exposed wallets only',async()=>{
   for(const level of [50,75,100])for(const [wallet,expected]of [[0,0],[33,0],[34,1],[666666,19999],[666667,20000],[1000000,26931],[3333334,41972]]){
    // Controlled fixture state, never a public healing, funding or level path.
    await ready([a.id,target.id],level);await r.db.query('UPDATE wallets SET balance=$2 WHERE character_id=$1',[target.id,wallet]);
    await r.db.query('DELETE FROM pvp_loot_sequences WHERE attacker_id=$1 AND defender_id=$2',[a.id,target.id]);
    const before=await total(),hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:target.id}),saved=await report(hit.battleId),battle=saved.result;
    assert.equal(battle.outcome,'attacker_win');assert.equal(battle.loot,expected);assert.equal(saved.snapshot.defender.level,level);assert.equal(saved.snapshot.defender.gold,wallet);
    assert.equal(battle.pvpRulesetId,botCombat.id);assert.equal(battle.lootDetails.botCap,null);assert.equal(battle.lootDetails.base,Number(BigInt(wallet!)*3n/100n));
    assert.equal((await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[target.id])).rows[0]!.balance,wallet!-expected!);
    assert.equal(await total(),before);assert.deepEqual(await protectedState(),savedProtection);
   }
  });

  await t.test('concurrent wealthy-bot attacks and duplicate command keys conserve wallet plus retained overflow',async()=>{
   await ready([a.id,b.id,target.id],100);
   await r.db.query('UPDATE wallets SET balance=2147483647 WHERE character_id=ANY($1::uuid[])',[[a.id,b.id,target.id]]);
   await r.db.query('DELETE FROM pvp_loot_sequences WHERE defender_id=$1',[target.id]);
   const before=await total(),key=randomUUID();
   const hits=await Promise.all([r.ok(a,'/api/v1/battles',{targetCharacterId:target.id},key),r.ok(a,'/api/v1/battles',{targetCharacterId:target.id},key),r.ok(b,'/api/v1/battles',{targetCharacterId:target.id})]);
   assert.equal(hits[0].battleId,hits[1].battleId);
   const rows=(await r.db.query('SELECT snapshot,result FROM battles WHERE id=ANY($1::uuid[])',[[hits[0].battleId,hits[2].battleId]])).rows;assert.equal(rows.length,2);
   let paid=0;for(const row of rows){const expected=botVictoryRewards(row.snapshot.defender.gold,100,100,1,row.snapshot.attacker.attack,row.snapshot.defender.defense);assert.equal(row.result.loot,expected.loot.amount);assert.ok(row.result.loot>3000);assert.equal(row.result.lootDetails.multiplier,100);paid+=row.result.loot;}
   assert.equal((await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[target.id])).rows[0]!.balance,2147483647-paid);
   assert.equal(await total(),before);assert.deepEqual(await protectedState(),savedProtection);
   const entries=(await r.db.query('SELECT sum(e.amount)::text n FROM economy_entries e JOIN economy_transactions t ON t.id=e.transaction_id WHERE t.command_id=ANY($1::uuid[])',[[key,hits[2].commandId]])).rows[0]!.n;
   const retained=(await r.db.query('SELECT sum(amount)::text n FROM treasury_retained_events WHERE command_id=ANY($1::uuid[])',[[key,hits[2].commandId]])).rows[0]!.n;
   assert.equal(BigInt(entries)+BigInt(retained),0n,'both financial journals reconcile the entire debit');
   assert.equal(Number((await r.db.query('SELECT count(*)::int n FROM pvp_loot_sequences WHERE defender_id=$1',[target.id])).rows[0]!.n),2);
  });

  await t.test('a failed retained credit rolls back gold, sequence, damage, XP and receipt, then the same key can succeed once',async()=>{
   await ready([a.id,target.id],100);
   const snapshot=async()=>({characters:(await r.db.query('SELECT id,health,spirit,xp,state_version FROM characters ORDER BY id')).rows,wallets:(await r.db.query('SELECT * FROM wallets ORDER BY character_id')).rows,treasury:(await r.db.query('SELECT * FROM land_accounts ORDER BY character_id')).rows,sequences:(await r.db.query('SELECT * FROM pvp_loot_sequences ORDER BY attacker_id,defender_id')).rows,counts:(await r.db.query('SELECT (SELECT count(*) FROM battles) battles,(SELECT count(*) FROM command_receipts) receipts,(SELECT count(*) FROM economy_entries) entries,(SELECT count(*) FROM treasury_retained_events) retained')).rows});
   const saved=await snapshot(),key=randomUUID();
   await r.db.query("CREATE FUNCTION fail_progressive_credit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason='battle_loot' THEN RAISE EXCEPTION 'synthetic progressive credit interruption';END IF;RETURN NEW;END $$;CREATE TRIGGER fail_progressive_credit BEFORE INSERT ON treasury_retained_events FOR EACH ROW EXECUTE FUNCTION fail_progressive_credit()");
   try{assert.equal((await r.command(a,'/api/v1/battles',{targetCharacterId:target.id},key)).statusCode,500);assert.deepEqual(await snapshot(),saved);}
   finally{await r.db.query('DROP TRIGGER fail_progressive_credit ON treasury_retained_events');}
   const totalBefore=await total(),hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:target.id},key),replayed=await r.ok(a,'/api/v1/battles',{targetCharacterId:target.id},key);
   assert.equal(hit.battleId,replayed.battleId);assert.equal(await total(),totalBefore);assert.deepEqual(await protectedState(),savedProtection);
  });

  await t.test('a human defender retains uncapped ordinary 3% instead of the new bot curve',async()=>{
   await ready([a.id,other.id],100);await r.db.query('UPDATE wallets SET balance=3333334 WHERE character_id=$1',[other.id]);
   const before=await total(),hit=await r.ok(a,'/api/v1/battles',{targetCharacterId:other.id}),saved=await report(hit.battleId);
   assert.equal(saved.result.outcome,'attacker_win');assert.equal(saved.result.loot,100000);assert.equal(saved.result.pvpRulesetId,humanPvpLoot.id);
   assert.equal((await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[other.id])).rows[0]!.balance,3233334);
   assert.equal(await total(),before);assert.deepEqual(await protectedState(),savedProtection);
  });
 }finally{await r.close();}
});
