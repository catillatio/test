import {readFile} from 'node:fs/promises';
import {meaningfulRivalPopulation,independentCombat,npcCombatComparison} from './rival-quality-fixture.js';
import {execFileSync} from 'node:child_process';
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {mkdir,writeFile} from 'node:fs/promises';
import {realm,testDatabaseUrl} from './helpers.js';import {transaction,type Database} from '../src/db.js';
import {npcLoopbackFixture} from './npc-loopback-fixture.js';
import {provisionBots} from '../src/development.js';import {inspectPopulation,provisionExpansionBots} from '../src/expansion-population.js';import {inspectExpansion,activateExpansion} from '../src/expansion-activation.js';
import {definitionDigest} from '../src/expansion-content.js';import {expansionBots,botArmy,cohortMembers} from '../src/expansion-bot-rules.js';
import {listOpponents,getState,stateFrom,type CharacterRow} from '../src/game.js';import {areRivals} from '../src/alpha-rules.js';import {scoreRival,rivalRepeatStage} from '../src/rival-recommendations.js';
import {proposedNpcArmy,planNpcArmy,applyLocalNpcArmy,npcArmyPolicy,previousNpcArmyPolicy} from '../src/npc-army.js';
import {runNpcSponsorship,npcSponsorshipSelected,expireBounties,cancelBounty,lockBountyEscrow} from '../src/bounties.js';
import {experienceView} from '../src/experience.js';
import {contentCatalog} from '../src/expansion-content.js';
import {botVictoryRewards} from '../src/bot-combat-rules.js';
import {provisionFutureLocalNpcs} from '../src/future-local-npcs.js';
let fixture:Awaited<ReturnType<typeof npcLoopbackFixture>>;
before(async()=>{fixture=await npcLoopbackFixture(testDatabaseUrl!);});
after(async()=>{await fixture?.close();});
test('NPC fixture bootstrap rejects remote, non-test and overridden targets before opening a connection',async()=>{
 for(const url of ['postgres://fixture:disposable@database.railway.internal/realm_test','postgres://fixture:disposable@127.0.0.1/Railway','postgres://fixture:disposable@127.0.0.1/realm_test?options=unsafe','https://127.0.0.1/realm_test'])await assert.rejects(()=>npcLoopbackFixture(url),/Only an existing local disposable test URL/);
});
test('attainable XP ranks plausible wins above unwinnable power and repeat-target farming',()=>{
 const a={level:20,attack:400,health:100};const match=scoreRival(a,{level:20,defense:350,health:100,bot:true,pairVictory:1,rewardedWins:0});
 const impossible=scoreRival(a,{level:24,defense:2000,health:100,bot:true,pairVictory:1,rewardedWins:0});assert.equal(impossible.expectedNumerator,0);assert.ok(match.expectedNumerator>impossible.expectedNumerator);
 const repeat=scoreRival(a,{level:20,defense:350,health:100,bot:true,pairVictory:5,rewardedWins:0});assert.ok(match.expectedNumerator>repeat.expectedNumerator);assert.equal(scoreRival(a,{level:20,defense:350,health:0,bot:false,pairVictory:1,rewardedWins:0}).expectedNumerator,0);
});
test('PostgreSQL bigint repeat counters preserve exact brackets, the boundary and historical values',()=>{
 const now=new Date('2032-02-02T00:00:00Z'),active=new Date(+now-1000);
 for(const [count,expected] of [['1',2],['4',5],['5',5],['9223372036854775807',5]] as const)assert.equal(rivalRepeatStage({victories:count,window_started_at:active},now),expected);
 assert.equal(rivalRepeatStage({victories:'999',window_started_at:new Date(+now-86400000)},now),1);
 assert.equal(rivalRepeatStage({victories:'999',window_started_at:new Date(+now-86399999)},now),5);
 assert.equal(rivalRepeatStage(undefined,now),1);
 for(const count of ['0','-1','not-a-counter'])assert.throws(()=>rivalRepeatStage({victories:count,window_started_at:active},now));
});
test('future NPC defaults vary deterministically, preserve legacy caps and grow across 15–30 and 50',()=>{
 const counts={weak:0,matched:0,elite:0};for(let n=0;n<1000;n++)counts[proposedNpcArmy(20,'synthetic-'+n).band]++;assert.ok(counts.weak>140&&counts.weak<260);assert.ok(counts.matched>590&&counts.matched<710);assert.ok(counts.elite>100&&counts.elite<210);
 for(let n=0;n<100;n++){const id='synthetic-'+n;assert.ok(proposedNpcArmy(30,id).participants>=proposedNpcArmy(15,id).participants);assert.ok(proposedNpcArmy(50,id).participants>1);assert.ok(proposedNpcArmy(50,id).participants<=10);assert.deepEqual(proposedNpcArmy(20,id,true),proposedNpcArmy(20,id,true));}
 for(const level of [15,20,30,50])for(const [tier,band] of [['green','weak'],['seasoned','matched'],['elite','elite']] as const){assert.equal(proposedNpcArmy(level,'saved-tier',false,tier).band,band);assert.equal(proposedNpcArmy(level,'saved-tier',true,tier).band,band);}
 assert.deepEqual(previousNpcArmyPolicy,{id:'funded-npc-armies-1',weakPercent:20,matchedPercent:65,elitePercent:15,membershipUnitCost:12,legacyMaximum:10,maximumPaidMilitia:20,upkeepIncomePercent:70});assert.notEqual(npcArmyPolicy.id,previousNpcArmyPolicy.id);
});
test('explicit future local generation funds its defaults and never reapplies them to existing identities',{timeout:120000},async()=>{
 const r=await realm({fixtureDatabaseUrl:fixture.url,isolated:true,clock:()=>new Date('2032-02-01T12:00:00Z'),developmentBotsEnabled:true});
 try{const created=await provisionFutureLocalNpcs(r.db,{nodeEnv:'test',allowProvisioning:true});assert.equal(created.created,450);assert.equal(created.newIdentityAdjustments.length,450);assert.ok(created.newIdentityAdjustments.some(p=>p.additionalMembers>0));
  const before=(await r.db.query('SELECT character_id,balance FROM wallets ORDER BY character_id')).rows,roster=(await r.db.query('SELECT * FROM army_stacks ORDER BY character_id')).rows;
  const repeated=await provisionFutureLocalNpcs(r.db,{nodeEnv:'test',allowProvisioning:true});assert.equal(repeated.created,0);assert.equal(repeated.newIdentityAdjustments.length,0);assert.deepEqual((await r.db.query('SELECT character_id,balance FROM wallets ORDER BY character_id')).rows,before);assert.deepEqual((await r.db.query('SELECT * FROM army_stacks ORDER BY character_id')).rows,roster);
  for(const plan of created.newIdentityAdjustments){assert.equal(plan.fundingShortfall,0);assert.ok(plan.totalCost<=plan.currentGold);assert.equal((await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[plan.characterId])).rows[0]!.balance,plan.currentGold-plan.totalCost+plan.reserveReturned);}
 }finally{await r.close();}
});
test('900 saved NPCs: complete ranked pages, indexed bounded reads, funded adjustments and authentic bounty postings',{timeout:240000},async()=>{
 let start=Math.floor(Date.parse('2032-02-01T12:00:00Z')/3600000),dense:number[]=[];for(let w=start;w<start+100000;w++){const found=Array.from({length:24},(_,i)=>w+i).filter(npcSponsorshipSelected);if(found.length>=5){dense=found.slice(0,5);break;}}assert.equal(dense.length,5);let now=new Date((dense[0]!-1)*3600000);const r=await realm({fixtureDatabaseUrl:fixture.url,isolated:true,clock:()=>now,developmentBotsEnabled:true,developmentBotRecruitmentEnabled:true});
 const evidence:Record<string,unknown>={source:'Real PostgreSQL synthetic population; not production observations',sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()};
 try{
  const human=await r.player('Measured Human');await r.prepare(human,1000000);for(let i=0;i<5;i++){await r.ok(human,'/api/v1/quests/border-patrol/runs');now=new Date(+now+1000);}
  await provisionBots(r.db,{nodeEnv:'test',allowProvisioning:true});const inspected=await inspectPopulation(r.db),plan={...inspected,capitalReviewed:true,storageReviewed:true,recoveryArtifactId:'123456',encryptedSha256:'a'.repeat(64)};await provisionExpansionBots(r.db,plan,definitionDigest(plan));
  const initial=await inspectExpansion(r.db,{storageReviewed:true,recoveryReviewed:true,opponentPlanReviewed:true,rareDrops:false});const cutover={...initial,temporaryBetaArtworkReviewed:true,presentationReviewed:true,botPoliciesReviewed:true};await activateExpansion(r.db,cutover,definitionDigest(cutover));
  assert.equal((await r.db.query('SELECT count(*)::int AS n FROM development_bots WHERE active')).rows[0]!.n,900);
  const all=(await r.db.query<{id:string;account_id:string;name:string;level:number;population_version:string;tier:string}>('SELECT c.id,c.account_id,c.name,c.attained_level AS level,b.population_version,b.tier FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE b.active')).rows;
  // A recruited NPC counts in its human recruiter's roster, never reciprocally
  // in the NPC's own combat army. Expanded cohorts must follow this same rule.
  const recruitedNpc=all.find(b=>b.level===20&&b.population_version===expansionBots.id)!;assert.ok(recruitedNpc);await r.ok(human,'/api/v1/army/invitations',{targetCharacterId:recruitedNpc.id});
  const recruitedState=await getState(r.db,recruitedNpc.account_id,{developmentBotRecruitmentEnabled:true});assert.equal(recruitedState.army.allies,0);assert.equal((await r.me(human)).army.allies,1);let recruitedListingChecked=false;
  const pagination=[];for(const level of [1,10,15,20,30,50,100]){
   await transaction(r.db,sql=>sql.query('UPDATE characters SET attained_level=$2 WHERE id=$1',[human.id,level]));
   const seen=new Set<string>();let cursor:string|undefined,pages=0,queries=0;
   const counted:Database={...r.db,query:r.db.query.bind(r.db),connect:async()=>{const c=await r.db.connect();return {release:()=>c.release(),query:async(q,v)=>{queries++;return c.query(q,v);}}},end:async()=>{}};
   const start=performance.now();do{const page=await listOpponents(counted,human.id,cursor,true,true);for(const o of page.opponents){assert.ok(!seen.has(o.id),'Duplicate ranked target');seen.add(o.id);assert.ok(areRivals(level,o.level));assert.ok(!('attack' in o)&&!('inventory' in o)&&!('expectedNumerator' in o));if(o.id===recruitedNpc.id){assert.equal(o.armySize,recruitedState.army.participants,'A recruited expanded NPC listing equals its authoritative combat roster');recruitedListingChecked=true;}}cursor=page.nextCursor??undefined;pages++;assert.ok(pages<50);}while(cursor);
   assert.deepEqual([...seen].sort(),all.filter(b=>areRivals(level,b.level)).map(b=>b.id).sort());assert.ok(queries<=40+pages*20,'Bounded setup and independently authenticated pages: '+JSON.stringify({level,queries,pages,targets:seen.size}));pagination.push({level,targets:seen.size,pages,queries,milliseconds:Math.round(performance.now()-start)});
  }assert.ok(recruitedListingChecked);evidence.recruitedNpcRoster={name:recruitedNpc.name,actualParticipants:recruitedState.army.participants,listedParticipants:recruitedState.army.participants,npcAcceptedAllies:0,humanReceivedAlly:true};evidence.pagination=pagination;
  await transaction(r.db,sql=>sql.query('UPDATE characters SET attained_level=20 WHERE id=$1',[human.id]));const first=await listOpponents(r.db,human.id,undefined,true,true);const firstAgain=await listOpponents(r.db,human.id,undefined,true,true);assert.deepEqual(firstAgain.opponents.map(o=>o.id),first.opponents.map(o=>o.id));
  if(first.nextCursor){await assert.rejects(()=>listOpponents(r.db,(all[0]!).id,first.nextCursor!,true,true));const a=await listOpponents(r.db,human.id,first.nextCursor!,true,true),b=await listOpponents(r.db,human.id,first.nextCursor!,true,true);assert.deepEqual(a,b);}
  await assert.rejects(()=>listOpponents(r.db,human.id,'r2~malformed~1',true,true));await assert.rejects(()=>listOpponents(r.db,human.id,undefined,true,true,'forged rotation'));
  const time={now:()=>now,advance:(seconds:number)=>{now=new Date(+now+seconds*1000);}};
  const quality=await meaningfulRivalPopulation(r,time);
  async function roster(){const members=await cohortMembers(r.db,all.map(b=>b.id));return (await r.db.query('SELECT c.id,c.name,c.attained_level AS level,c.legacy_army_floor,coalesce(sum(s.quantity),0)::int AS militia FROM development_bots b JOIN characters c ON c.id=b.character_id LEFT JOIN army_stacks s ON s.character_id=c.id WHERE c.attained_level BETWEEN 15 AND 30 OR c.attained_level=50 GROUP BY c.id')).rows.map(v=>({id:v.id,name:v.name,level:v.level,participants:botArmy(v.level,v.militia,0,v.legacy_army_floor,members.get(v.id)).participants}));}
  const compareCombat=await npcCombatComparison(r,time,all,expansionBots.id),combatBefore=await compareCombat('before');
  const before=await roster(),identities=(await r.db.query('SELECT character_id,population_key,population_version FROM development_bots ORDER BY character_id')).rows;
  const moneyBefore=(await r.db.query('SELECT character_id,balance FROM wallets WHERE character_id IN(SELECT character_id FROM development_bots) ORDER BY character_id')).rows;
  let rollbackChecked=false;const plans=[];for(const bot of before){const p=await planNpcArmy(r.db,bot.id);if(p.totalCost===0){plans.push({id:bot.id,participants:p.targetParticipants,paid:0,band:p.band,quote:p,actualWalletBefore:p.currentGold,actualWalletAfter:p.currentGold,unchanged:true});continue;}if(p.fundingShortfall){plans.push({id:bot.id,shortfall:p.fundingShortfall});continue;}const key=randomUUID();const original=(await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[bot.id])).rows[0]!.balance;if(!rollbackChecked){await r.db.query("CREATE FUNCTION reject_npc_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic NPC interruption'; END $$; CREATE TRIGGER reject_npc_fixture BEFORE INSERT ON npc_army_adjustments FOR EACH ROW EXECUTE FUNCTION reject_npc_fixture()");await assert.rejects(()=>applyLocalNpcArmy(r.db,p,key),/synthetic NPC interruption/);assert.equal((await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[bot.id])).rows[0]!.balance,original);await r.db.query('DROP TRIGGER reject_npc_fixture ON npc_army_adjustments');rollbackChecked=true;}await Promise.all([applyLocalNpcArmy(r.db,p,key),applyLocalNpcArmy(r.db,p,key)]);const after=(await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[bot.id])).rows[0]!.balance;assert.equal(after,original-p.totalCost+p.reserveReturned);plans.push({id:bot.id,participants:p.targetParticipants,paid:p.totalCost,band:p.band,quote:p,actualWalletBefore:original,actualWalletAfter:after,actualUpkeep:(await r.db.query('SELECT hourly_rate,reserve_gold,arrears_gold,paused FROM maintenance_accounts WHERE character_id=$1',[bot.id])).rows[0]});}
  const after=await roster();assert.deepEqual((await r.db.query('SELECT character_id,population_key,population_version FROM development_bots ORDER BY character_id')).rows,identities);assert.ok(after.every(a=>a.participants>=before.find(b=>b.id===a.id)!.participants));assert.ok(plans.some(p=>'paid' in p&&(p.paid??0)>0));
  const actualCatalog=contentCatalog('level100-content-1');
  for(const result of plans){if(!result.quote)continue;const p=result.quote;assert.equal(p.memberCost,p.additionalMembers*12);assert.ok(p.additionalMembers+p.currentPaidMilitia<=20);assert.equal(p.equipmentCost,Object.entries(p.gear).reduce((n,[id,quantity])=>n+actualCatalog.items.find(i=>i.id===id)!.price*quantity,0));assert.equal(p.projectedUpkeepHourly,p.previousUpkeepHourly+Object.entries(p.gear).reduce((n,[id,quantity])=>n+actualCatalog.items.find(i=>i.id===id)!.upkeep*quantity,0));assert.ok(p.totalCost<=p.currentGold);assert.ok(p.projectedUpkeepHourly<=p.upkeepBudgetHourly);}
  evidence.npcArmies={before,after,plans,policy:npcArmyPolicy,legacyCapPreserved:true,identitiesPreserved:true};
  const reviewed=JSON.parse(await readFile(new URL('./fixtures/npc-army-reviewed-536fb2d.json',import.meta.url),'utf8')) as {reviewedCommit:string;rows:{id:string;name:string;level:number;participants:number}[]};
  const median=(values:number[])=>{const a=[...values].sort((a,b)=>a-b);return (a[Math.floor((a.length-1)/2)]!+a[Math.ceil((a.length-1)/2)]!)/2;};
  const distributions=[];
  for(const [lo,hi] of [[15,19],[20,24],[25,30],[15,30],[50,50]]){
   const initial=before.filter(b=>b.level>=lo!&&b.level<=hi!),old=reviewed.rows.filter(b=>b.level>=lo!&&b.level<=hi!),current=after.filter(b=>b.level>=lo!&&b.level<=hi!);
   // Historical provisioning generates fresh UUIDs for legacy NPCs. Match the
   // same public named/level blueprints; retain old UUIDs as historical evidence.
   const blueprint=(b:{name:string;level:number})=>b.level+':'+b.name;
   assert.equal(new Set(current.map(blueprint)).size,current.length);
   assert.deepEqual(old.map(blueprint).sort(),current.map(blueprint).sort(),'Compare exactly the reviewed public NPC blueprints');
   const describe=(rows:typeof current)=>({count:rows.length,minimum:Math.min(...rows.map(b=>b.participants)),median:median(rows.map(b=>b.participants)),mean:rows.reduce((n,b)=>n+b.participants,0)/rows.length,maximum:Math.max(...rows.map(b=>b.participants)),atMost5:rows.filter(b=>b.participants<=5).length,atMost10:rows.filter(b=>b.participants<=10).length});
   distributions.push({levels:[lo,hi],unadjusted:describe(initial),reviewedV1:describe(old),fundedV2:describe(current),legacy:current.filter(b=>!all.find(a=>a.id===b.id)!.population_version.startsWith(expansionBots.id)).length});
  }
  const sample=distributions.find(x=>x.levels[0]===15&&x.levels[1]===30)!;assert.equal(sample.fundedV2.count,164);assert.equal(sample.legacy,144);assert.equal(sample.fundedV2.atMost10,144,'The current legacy policy makes this limitation unavoidable');assert.ok(sample.fundedV2.median>sample.reviewedV1.median);assert.ok(sample.fundedV2.atMost5<sample.reviewedV1.atMost5);
  const capForecast=plans.flatMap(p=>{if(!p.quote||!p.quote.legacyCap||p.quote.level<15||p.quote.level>30)return [];const target=Math.max(p.quote.currentParticipants,Math.min(p.quote.levelComparableTarget,21)),units=Math.max(0,target-1-p.quote.currentPaidMilitia),cost=units*12;return [{id:p.id,from:p.quote.currentParticipants,hypotheticalParticipants:target,membershipOnlyCost:cost,savedPurseBeforeAdjustments:p.quote.currentGold,membershipOnlyShortfall:Math.max(0,cost-p.quote.currentGold),applied:false}];});
  evidence.armyDistributions={reviewedCommit:reviewed.reviewedCommit,distributions,unresolved:'144/164 are hard-capped legacy NPCs. This correction does not authorize lifting that cap.',capDecision:'Opt legacy NPCs into the active level-based army projection, retaining the existing 20 paid-militia limit, actual unit prices and funding/upkeep requirements.',hypotheticalMembershipOnly:capForecast};

  const combatAfter=await compareCombat('after');assert.ok(combatAfter.some(c=>c.expectedXp>0));evidence.combatComparisons={before:combatBefore,after:combatAfter};
  evidence.xpQuality={before:quality.before,after:await quality.verify('after funded NPC corrections'),levelChange:await quality.levelChange()};
  // No bot may acquire achievement Gold, even when the new policy is enabled.
  await r.db.query('UPDATE achievement_gold_state SET enabled=true');await experienceView(r.db,all[0]!.id);assert.equal((await r.db.query('SELECT 1 FROM achievement_gold_receipts WHERE character_id=$1',[all[0]!.id])).rowCount,0);await r.db.query('UPDATE achievement_gold_state SET enabled=false');
  // Actual combat reads the paid saved roster, not a projection-only army.
  await r.legacyArmy(human,20);
  for(const category of ['weapon','armor','spell']){const item=contentCatalog('level100-content-1').items.filter(i=>i.category===category&&i.level<=20&&i.acquisition!=='quest-exclusive').sort((a,b)=>b.attack-a.attack||b.defense-a.defense)[0]!;await r.ok(human,'/api/v1/inventory/purchases',{itemId:item.id,quantity:21});}
  const recommendation=await listOpponents(r.db,human.id,undefined,true,true);assert.ok(recommendation.opponents.length);
  const actorForBot=await r.me(human);let target:typeof recommendation.opponents[number]|undefined;
  for(const bot of all.filter(b=>areRivals(actorForBot.level,b.level)&&b.population_version!==expansionBots.id)){
   const state=await getState(r.db,bot.account_id,{developmentBotRecruitmentEnabled:true});
   if(independentCombat(actorForBot,state,true).winProbability===1){target={id:bot.id} as typeof recommendation.opponents[number];break;}
  }
  assert.ok(target,'Saved-counter regression uses a guaranteed legal NPC victory');
  const targetAccount=(await r.db.query('SELECT account_id FROM characters WHERE id=$1',[target.id])).rows[0]!.account_id;await getState(r.db,targetAccount,{developmentBotRecruitmentEnabled:true});await r.me(human);
  const pairBefore=(await r.db.query('SELECT character_id,balance FROM wallets WHERE character_id=ANY($1::uuid[])',[[human.id,target.id]])).rows;
  const fight=await r.ok(human,'/api/v1/battles',{targetCharacterId:target.id}),record=(await r.db.query('SELECT snapshot,result FROM battles WHERE id=$1',[fight.battleId])).rows[0]!;
  assert.equal(record.snapshot.defender.army.participants,after.find(b=>b.id===target.id)!.participants);
  const expected=botVictoryRewards(record.snapshot.defender.gold,record.snapshot.attacker.level,record.snapshot.defender.level,1,record.snapshot.attacker.attack,record.snapshot.defender.defense);
  assert.equal(record.result.attackerXp,record.result.outcome==='attacker_win'?expected.xp.amount:0);assert.equal(record.result.loot,record.result.outcome==='attacker_win'?expected.loot.amount:0);
  const pairAfter=(await r.db.query('SELECT character_id,balance FROM wallets WHERE character_id=ANY($1::uuid[])',[[human.id,target.id]])).rows;assert.equal(pairAfter.reduce((n,r)=>n+r.balance,0),pairBefore.reduce((n,r)=>n+r.balance,0));
  evidence.postAdjustmentCombat={battleId:fight.battleId,targetName:target.name,savedDefendingEquipment:record.result.defenseEquipment,participants:record.snapshot.defender.army.participants,outcome:record.result.outcome,xp:record.result.attackerXp,gold:record.result.loot,exactCurrentRewards:true,walletConserved:true};
  // A real saved victory is read back as a PostgreSQL bigint string. Refresh
  // through both the ranker and HTTP renderer without losing its repeat bracket.
  const sequence=(await r.db.query<{victories:string;window_started_at:Date}>('SELECT victories,window_started_at FROM pvp_loot_sequences WHERE attacker_id=$1 AND defender_id=$2',[human.id,target.id])).rows[0]!;assert.equal(typeof sequence.victories,'string');assert.equal(sequence.victories,'1');assert.equal(rivalRepeatStage(sequence,now),2);
  const repeatPage=await listOpponents(r.db,human.id,undefined,true,true);assert.ok(repeatPage.opponents.length>0);const refreshed=await r.app.inject({url:'/game/battle',headers:{cookie:human.cookie}});assert.equal(refreshed.statusCode,200,'Actual Rivals refresh after a saved bot victory');
  assert.equal((await r.db.query('SELECT victories FROM pvp_loot_sequences WHERE attacker_id=$1 AND defender_id=$2',[human.id,target.id])).rows[0]!.victories,'1','Recommendation reads preserve the historical counter');evidence.postVictoryRivals={pgCounterType:'string',storedCounter:'1',nextRewardBracket:2,httpStatus:refreshed.statusCode};
  // Disabled is a true no-op, even with no usable database connection.
  await runNpcSponsorship({query:async()=>{throw new Error('Disabled worker queried SQL');},connect:async()=>{throw new Error('Disabled worker connected');},end:async()=>{}},false);
  const targets=[];for(let i=0;i<5;i++){const t=await r.player('Eligible Target '+i);await r.prepare(t,1000);for(let j=0;j<5;j++)await r.ok(t,'/api/v1/quests/border-patrol/runs');await transaction(r.db,sql=>sql.query('UPDATE characters SET attained_level=20 WHERE id=$1',[t.id]));targets.push(t);}
  function nextSelected(){do{now=new Date((Math.floor(+now/3600000)+1)*3600000);}while(!npcSponsorshipSelected(Math.floor(+now/3600000)));}
  nextSelected();const balances=(await r.db.query('SELECT character_id,balance FROM wallets ORDER BY character_id')).rows;const ledgerBefore=(await r.db.query('SELECT e.character_id,coalesce(sum(e.amount),0)::text AS total FROM economy_entries e GROUP BY e.character_id')).rows;const placed=await runNpcSponsorship(r.db,true);assert.equal(placed.status,'placed');const rows=(await r.db.query('SELECT b.*,n.policy_id FROM bounties b JOIN npc_sponsored_bounties n ON n.bounty_id=b.id')).rows;assert.equal(rows.length,1);const contract=rows[0]!;assert.ok(contract.amount>=250&&contract.amount<=2000);const sponsorBefore=balances.find(x=>x.character_id===contract.sponsor_id)!.balance;const ledgerAfter=Number((await r.db.query('SELECT coalesce(sum(amount),0)::text AS total FROM economy_entries WHERE character_id=$1',[contract.sponsor_id])).rows[0]!.total),ledgerStart=Number(ledgerBefore.find(x=>x.character_id===contract.sponsor_id)?.total??0);assert.equal((await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[contract.sponsor_id])).rows[0]!.balance,sponsorBefore+ledgerAfter-ledgerStart);assert.equal((await r.db.query("SELECT sum(e.amount)::int AS paid FROM economy_transactions t JOIN economy_entries e ON e.transaction_id=t.id WHERE t.command_id=(SELECT command_id FROM bounties WHERE id=$1) AND t.reason IN('bounty_escrow','bounty_fee')",[contract.id])).rows[0]!.paid,-contract.amount-contract.fee);
  const count=await r.db.query('SELECT count(*)::int AS n FROM npc_sponsored_bounties');await Promise.all([runNpcSponsorship(r.db,true),runNpcSponsorship(r.db,true)]);assert.equal((await r.db.query('SELECT count(*)::int AS n FROM npc_sponsored_bounties')).rows[0]!.n,count.rows[0]!.n);
  now=new Date(dense[1]!*3600000);assert.equal((await runNpcSponsorship(r.db,true)).status,'placed');
  now=new Date(dense[2]!*3600000);assert.equal((await runNpcSponsorship(r.db,true)).status,'at-limit');
  // A real finishing attack claims the existing NPC-funded escrow, without an NPC attack.
  const hunter=targets.find(t=>t.id!==contract.target_id)!;await transaction(r.db,sql=>sql.query('UPDATE characters SET health=1,health_updated_at=$2 WHERE id=$1',[contract.target_id,now]));
  const claim=await r.ok(hunter,'/api/v1/battles',{targetCharacterId:contract.target_id,bountyId:contract.id});assert.equal((await r.db.query('SELECT result FROM battles WHERE id=$1',[claim.battleId])).rows[0]!.result.bountyClaim.reward,contract.amount);assert.equal((await r.db.query('SELECT status FROM bounties WHERE id=$1',[contract.id])).rows[0]!.status,'claimed');
  now=new Date(dense[3]!*3600000);assert.equal((await runNpcSponsorship(r.db,true)).status,'placed');
  const second=(await r.db.query("SELECT b.* FROM bounties b JOIN npc_sponsored_bounties n ON n.bounty_id=b.id WHERE b.status='active' ORDER BY b.created_at LIMIT 1")).rows[0]!;
  await transaction(r.db,async sql=>{await lockBountyEscrow(sql);await sql.query('SELECT id FROM characters WHERE id=$1 FOR UPDATE',[second.sponsor_id]);await cancelBounty(sql,second.sponsor_id,second.id,randomUUID(),now);});
  now=new Date(dense[4]!*3600000);const recent=(await r.db.query('SELECT count(*)::int AS n FROM npc_sponsored_bounties WHERE created_at>$1',[new Date(+now-86400000)])).rows[0]!.n;assert.equal(recent,3);assert.equal((await runNpcSponsorship(r.db,true)).status,'at-limit');
  assert.equal((await r.db.query('SELECT count(DISTINCT target_id)::int AS n FROM npc_sponsored_bounties')).rows[0]!.n,3,'72-hour target hold excludes earlier recipients');
  const active=(await r.db.query("SELECT * FROM bounties WHERE status='active' AND id IN(SELECT bounty_id FROM npc_sponsored_bounties)")).rows;
  now=new Date(+now+86400000);for(const b of active){const beforeRefund=(await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[b.sponsor_id])).rows[0]!.balance;await transaction(r.db,async sql=>{await lockBountyEscrow(sql);await expireBounties(sql,now,null,b.sponsor_id);});assert.ok((await r.db.query('SELECT balance FROM wallets WHERE character_id=$1',[b.sponsor_id])).rows[0]!.balance>=beforeRefund+b.amount);assert.equal((await r.db.query("SELECT count(*)::int AS n FROM bounty_events WHERE bounty_id=$1 AND kind='expired'",[b.id])).rows[0]!.n,1);}
  const finalContracts=(await r.db.query('SELECT b.*,n.policy_id FROM bounties b JOIN npc_sponsored_bounties n ON n.bounty_id=b.id ORDER BY b.created_at')).rows;assert.equal(finalContracts.length,3);evidence.npcBounties={placed:finalContracts.map(v=>({id:v.id,sponsorId:v.sponsor_id,targetId:v.target_id,amount:v.amount,fee:v.fee,policy:v.policy_id,status:v.status})),sameWindowRetryNoDuplicate:true,disabledNoDatabaseWork:true,activeCapVerified:true,rollingDayCapVerified:true,targetCooldownVerified:true,finishingClaimVerified:true,expiryRefundsVerified:true};
  await mkdir('/dev/shm/kc-rebuild-review',{recursive:true});await writeFile('/dev/shm/kc-rebuild-review/npc-evidence.json',JSON.stringify(evidence,null,2)+'\n');
 }finally{await r.close();}
});
