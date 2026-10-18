import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {realm,testDatabaseUrl} from './helpers.js';
import {provisionBots} from '../src/development.js';
import {auditBotEconomy} from '../src/bot-audit.js';
import {settleDueBotIncome} from '../src/bot-income.js';
const skip=!testDatabaseUrl;
test('450 existing bots earn real saved Land income offline without views, double payouts, human changes or Vault refills',{skip},async()=>{
 let now=new Date('2047-01-02T00:00:00Z');const r=await realm({isolated:true,developmentBotsEnabled:true,clock:()=>now});try{
  const human=await r.player('Untouched Human');await r.prepare(human,12345);const humanBefore=await r.me(human);
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});
  await settleDueBotIncome(r.db,true);const before=await auditBotEconomy(r.db);assert.equal(before.population,450);assert.deepEqual(before.insufficientPortfolios,[]);
  const identities=(await r.db.query('SELECT c.id,c.name,c.profile_class,c.xp,c.attained_level FROM characters c JOIN development_bots b ON b.character_id=c.id ORDER BY c.id')).rows;
  // A legacy fixture may have holdings but no shared-clock row yet. Adoption
  // must also work in the worker, without requiring the first profile visit.
  await r.db.query('DELETE FROM income_cycles WHERE character_id=$1',[before.bots[0]!.id]);
  now=new Date(+now+72*3600000);
  const passes=await Promise.all([settleDueBotIncome(r.db,true),settleDueBotIncome(r.db,true)]);assert.equal(passes.reduce((n,p)=>n+p.settled,0),450);
  const after=await auditBotEconomy(r.db);assert.equal(after.dueBots,0);
  for(const bot of before.bots){const later=after.bots.find(b=>b.id===bot.id)!;
   const propertyNet=BigInt(bot.gross)-BigInt(bot.property_upkeep),rate=BigInt(bot.equipment_upkeep);
   assert.equal(later.vault_gold,bot.vault_gold);assert.equal(later.plots,bot.plots);
   const totalChange=BigInt(later.exposed_gold)+BigInt(later.reserve_gold)-BigInt(bot.exposed_gold)-BigInt(bot.reserve_gold);
   assert.equal(totalChange,(propertyNet-rate)*72n,'actual wallet + prepaid reserve must agree with saved net rates');
   assert.ok(later.exposed_gold>bot.exposed_gold);
  }
  const settlementCount=(await r.db.query('SELECT count(*)::int n FROM land_income_settlements')).rows[0]!.n;
  for(let i=0;i<3;i++)assert.equal((await settleDueBotIncome(r.db,true)).settled,0);
  assert.equal((await r.db.query('SELECT count(*)::int n FROM land_income_settlements')).rows[0]!.n,settlementCount);
  assert.deepEqual((await auditBotEconomy(r.db)).bots,after.bots);
  assert.deepEqual((await r.db.query('SELECT c.id,c.name,c.profile_class,c.xp,c.attained_level FROM characters c JOIN development_bots b ON b.character_id=c.id ORDER BY c.id')).rows,identities);
  assert.equal((await r.me(human)).gold,humanBefore.gold);assert.equal((await r.me(human)).bankedGold,humanBefore.bankedGold);
  now=new Date(+now+3600000);assert.equal((await settleDueBotIncome(r.db,false)).settled,0);
  await settleDueBotIncome(r.db,true);assert.equal((await auditBotEconomy(r.db)).dueBots,0);
  await mkdir('test-results',{recursive:true});await writeFile('test-results/phase47-bot-economy.json',JSON.stringify({passed:true,population:450,offlineHours:72,humanBalancesChanged:false,capitalGranted:0,portfoliosChanged:0,samples:[5,8,17,25,40,50].map(level=>({level,before:before.bots.find(b=>b.level===level&&b.tier==='seasoned'&&b.variant===0),after:after.bots.find(b=>b.level===level&&b.tier==='seasoned'&&b.variant===0)}))},null,2)+'\n');
 }finally{await r.close();}
});
