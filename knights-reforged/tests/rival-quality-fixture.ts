// Independent evidence uses saved server states and the real combat resolver;
// it deliberately does not import the recommendation scorer.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {alpha,areRivals,resolveAlphaCombat} from '../src/alpha-rules.js';
import {botVictoryRewards,botCombat} from '../src/bot-combat-rules.js';
import {victoryExperience47} from '../src/game-feel-rules.js';
import {equipmentCatalogFor,contentCatalog} from '../src/expansion-content.js';
import {transaction} from '../src/db.js';
import {stateFrom,listOpponents,type CharacterRow,type CharacterState} from '../src/game.js';
import {realm,type Player} from './helpers.js';
type Realm=Awaited<ReturnType<typeof realm>>;
async function fixtureWrite(r:Realm,q:string,args:unknown[]){return transaction(r.db,sql=>sql.query(q,args));}

export function independentCombat(actor:CharacterState,target:CharacterState,bot:boolean,victory=1,humanWins=0){
 const v=alpha.combat.variation;let wins=0;
 for(let a=-v;a<=v;a++)for(let d=-v;d<=v;d++)if(resolveAlphaCombat(actor,target,a,d,true).outcome==='attacker_win')wins++;
 const xp=bot?botVictoryRewards(target.gold,actor.level,target.level,victory,actor.attack,target.defense).xp.amount:victoryExperience47(actor.level,target.level,humanWins<alpha.combat.rewardedPerTarget,actor.attack,target.defense).amount;
 const eligible=actor.health>=alpha.combat.minimumHealth&&target.health>0;
 return {xpOnWin:xp,winningRolls:wins,totalRolls:(2*v+1)**2,winProbability:eligible?wins/(2*v+1)**2:0,expectedNumerator:eligible?wins*xp:0,expectedXp:eligible?wins*xp/(2*v+1)**2:0};
}
export async function savedState(r:Realm,id:string,now:Date){return transaction(r.db,async sql=>stateFrom(sql,(await sql.query<CharacterRow>('SELECT * FROM characters WHERE id=$1',[id])).rows[0]!,now,{developmentBotRecruitmentEnabled:true}));}
export async function buildCombatActor(r:Realm,name:string,level:number,qualityLevel=level-3,units=Math.min(20,level-1),training=Math.floor(level/10)){
 const actor=await r.player(name);await r.prepare(actor,1000000);
 // Explicit synthetic character input, not an account upgrade or a Gold grant to an NPC.
 await fixtureWrite(r,'UPDATE characters SET attained_level=$2,attack_training=$3,defense_training=$3 WHERE id=$1',[actor.id,level,training]);
 await r.legacyArmy(actor,units);
 const catalog=equipmentCatalogFor('level100-content-1');
 for(const category of ['weapon','armor','spell']){
  const item=contentCatalog('level100-content-1').items.filter(i=>i.category===category&&i.acquisition!=='quest-exclusive'&&catalog.canPurchase(i.id,qualityLevel)).sort((a,b)=>(b.attack+b.defense)-(a.attack+a.defense)||a.id.localeCompare(b.id))[0]!;
  await r.ok(actor,'/api/v1/inventory/purchases',{itemId:item.id,quantity:units+1});
 }
 return actor;
}
export async function meaningfulRivalPopulation(r:Realm,time:{now:()=>Date;advance:(seconds:number)=>void}){
 const actor=await buildCombatActor(r,'Quality Captain',20,14,19,3),profiles=[];
 for(let n=0;n<45;n++){
  const role=n<12?'weak':n<33?'matched':'unwinnable';
  const units=role==='weak'?2+n%3:role==='matched'?15+n%7:20;
  const level=18+n%5,gearLevel=role==='weak'?4:role==='matched'?12+n%5:20;
  const rival=await buildCombatActor(r,'Quality Rival '+n,level,Math.min(level,gearLevel),Math.min(units,20),role==='unwinnable'?25:1+n%5);
  profiles.push({id:rival.id,role,level,units,gearLevel,training:role==='unwinnable'?25:1+n%5});
 }
 // Actual committed victories provide diminished human rewards. Choose an
 // attainable saved opponent, rather than inserting fake battle history.
 let repeated:Player|undefined;
 for(const profile of profiles.filter(p=>p.role==='matched')){
  const target=await savedState(r,profile.id,time.now()),a=await r.me(actor);
  if(independentCombat(a,target,false).winProbability===1){
   const account=(await r.db.query('SELECT account_id FROM characters WHERE id=$1',[profile.id])).rows[0]!.account_id;
   repeated={id:profile.id,accountId:account,cookie:'',csrf:''};break;
  }
 }
 assert.ok(repeated,'Fixture must contain a guaranteed attainable repeated rival');
 const repeatBefore=independentCombat(await r.me(actor),await savedState(r,repeated.id,time.now()),false);
 for(let n=0;n<alpha.combat.rewardedPerTarget;n++){
  await fixtureWrite(r,'UPDATE characters SET health=max_health,spirit=max_spirit,health_updated_at=$2,spirit_updated_at=$2 WHERE id=ANY($1::uuid[])',[[actor.id,repeated.id],time.now()]);
  const battle=await r.ok(actor,'/api/v1/battles',{targetCharacterId:repeated.id});
  assert.equal((await r.db.query('SELECT result FROM battles WHERE id=$1',[battle.battleId])).rows[0]!.result.outcome,'attacker_win');time.advance(alpha.combat.cooldownSeconds+1);
 }
 await fixtureWrite(r,'UPDATE characters SET health=max_health,spirit=max_spirit,health_updated_at=$2,spirit_updated_at=$2 WHERE id=ANY($1::uuid[])',[[actor.id,repeated.id],time.now()]);
 async function reference(){
  const now=time.now(),a=await r.me(actor),rows=(await r.db.query('SELECT c.id,c.name,c.attained_level AS level,b.character_id IS NOT NULL AS bot,a.login_disabled,b.active FROM characters c JOIN accounts a ON a.id=c.account_id LEFT JOIN development_bots b ON b.character_id=c.id WHERE c.id<>$1',[actor.id])).rows.filter(t=>areRivals(a.level,t.level)&&(!t.login_disabled||t.bot&&t.active));
  const result=[];
  for(const row of rows){
   const target=await savedState(r,row.id,now);
   const pair=(await r.db.query('SELECT victories,window_started_at FROM pvp_loot_sequences WHERE attacker_id=$1 AND defender_id=$2',[actor.id,row.id])).rows[0];
   const victory=pair&&+new Date(pair.window_started_at)>+now-botCombat.windowSeconds*1000?Number(BigInt(pair.victories)+1n>5n?5n:BigInt(pair.victories)+1n):1;
   const wins=Number((await r.db.query("SELECT count(*)::int AS n FROM battles WHERE attacker_id=$1 AND defender_id=$2 AND outcome='attacker_win' AND rewarded AND created_at>$3",[actor.id,row.id,new Date(+now-alpha.combat.rewardWindowSeconds*1000)])).rows[0]!.n);
   result.push({id:row.id,name:row.name,level:row.level,bot:row.bot,army:target.army.participants,attack:target.attack,defense:target.defense,training:(await r.db.query('SELECT defense_training FROM characters WHERE id=$1',[row.id])).rows[0]!.defense_training,repeatWins:wins,...independentCombat(a,target,row.bot,victory,wins)});
  }
  return {actor:{id:actor.id,level:a.level,army:a.army.participants,attack:a.attack,health:a.health},targets:result};
 }
 async function verify(label:string){
  const ref=await reference();assert.ok(ref.targets.length>80,'Quality must cover more than an arbitrary 80-ID block');
  const positive=ref.targets.filter(t=>t.expectedNumerator>0),zero=ref.targets.filter(t=>t.expectedNumerator===0);
  assert.ok(positive.length>=20,'At least twenty meaningful positive-XP candidates are required');assert.ok(zero.length>=5,'Fixture includes non-viable/zero-value opponents');
  assert.ok(new Set(positive.map(t=>t.expectedNumerator)).size>=3,'Scores must genuinely differ');
  assert.ok(ref.targets.some(t=>t.winProbability>0&&t.winProbability<1),'Include contested practical win probabilities');assert.ok(ref.targets.some(t=>t.winProbability===0),'Include genuinely unwinnable opponents');
  const first80=[...ref.targets].sort((a,b)=>a.id.localeCompare(b.id)).slice(0,80);assert.ok(positive.some(t=>!first80.some(p=>p.id===t.id)),'Positive candidates exist beyond the old arbitrary candidate block');
  const rotation='7d21e987-98e0-4ce0-b80d-e7cc0caa47f3';
  async function pages(seed:string){const ids:string[]=[],boundaries=[];let cursor:string|undefined,firstCursor:string|undefined;
   do{const page=await listOpponents(r.db,actor.id,cursor,true,true,seed);if(!cursor)firstCursor=page.nextCursor??undefined;for(const p of page.opponents){assert.ok(!ids.includes(p.id));assert.ok(areRivals(ref.actor.level,p.level));assert.ok(!('expectedNumerator' in p)&&!('attack' in p)&&!('inventory' in p));ids.push(p.id);}boundaries.push(ids.length);cursor=page.nextCursor??undefined;}while(cursor);
   return {ids,boundaries,firstCursor};}
  const all=await pages(rotation);assert.deepEqual([...all.ids].sort(),ref.targets.map(t=>t.id).sort());
  const ranked=all.ids.map(id=>ref.targets.find(t=>t.id===id)!);
  for(let n=1;n<ranked.length;n++)assert.ok(ranked[n-1]!.expectedNumerator>=ranked[n]!.expectedNumerator,'A higher expected-XP candidate was hidden later: '+JSON.stringify({before:ranked[n-1],after:ranked[n]}));
  const first=ranked.slice(0,20),later=ranked.slice(20);assert.ok(first.every(t=>t.expectedNumerator>0));assert.ok(later.some(t=>t.expectedNumerator>0));assert.ok(first.reduce((s,t)=>s+t.expectedNumerator,0)>ranked.slice(20,40).reduce((s,t)=>s+t.expectedNumerator,0));
  assert.ok(Math.min(...first.map(t=>t.expectedNumerator))>=Math.max(...later.map(t=>t.expectedNumerator)));
  const saved=await listOpponents(r.db,actor.id,all.firstCursor!,true,true);assert.deepEqual(saved.opponents.map(o=>o.id),all.ids.slice(20,40),'Stable cursor reread');
  const refreshed=await pages(rotation);assert.deepEqual(refreshed.ids,all.ids,'Same refresh input produces the same complete ordering');
  const varied=await pages('e0d70f4c-c67f-4444-baa5-c523517b0f88');assert.deepEqual(varied.ids.map(id=>ref.targets.find(t=>t.id===id)!.expectedNumerator),ranked.map(t=>t.expectedNumerator),'Refresh may shuffle ties, never downgrade higher expected XP');
  const reduced=ref.targets.find(t=>t.id===repeated!.id)!;assert.ok(reduced.repeatWins>=alpha.combat.rewardedPerTarget);assert.ok(reduced.xpOnWin<repeatBefore.xpOnWin,'Real repeated victories diminish rewards');
  return {label,actor:ref.actor,population:ref.targets.length,positive:positive.length,zero:zero.length,positiveBeyondFirst80:positive.filter(t=>!first80.some(p=>p.id===t.id)).length,firstPage:first,secondPage:ranked.slice(20,40),laterMaximumExpectedXp:Math.max(...later.map(t=>t.expectedXp)),allOrdered:true,duplicateFree:true,stableCursor:true,deterministicRefresh:true,repeat:{before:repeatBefore,after:reduced},cursor:varied.firstCursor};
 }
 const before=await verify('before funded NPC corrections');
 return {actor,profiles,before,verify,async levelChange(){const fresh=await listOpponents(r.db,actor.id,undefined,true,true);const stale=fresh.nextCursor;assert.ok(stale);await listOpponents(r.db,actor.id,stale,true,true);await fixtureWrite(r,'UPDATE characters SET attained_level=21 WHERE id=$1',[actor.id]);await assert.rejects(()=>listOpponents(r.db,actor.id,stale!,true,true),/expired/);return verify('level 21 fresh recommendation');}};
}

export async function npcCombatComparison(r:Realm,time:{now:()=>Date;advance:(seconds:number)=>void},bots:{id:string;account_id:string;level:number;tier:string;population_version:string}[],expandedId:string){
 const probes:{npc:typeof bots[number];beforeActor:Player;afterActor:Player}[]=[];
 for(const level of [15,20,30])for(const tier of ['green','seasoned','elite']){
  const npc=bots.find(b=>b.level===level&&b.tier===tier&&b.population_version!==expandedId)!;assert.ok(npc);
  probes.push({npc,beforeActor:await buildCombatActor(r,'Before L'+level+' '+tier,level),afterActor:await buildCombatActor(r,'After L'+level+' '+tier,level)});
 }
 return async function probe(side:'before'|'after'){
  const evidence=[];
  for(const p of probes){
   const now=time.now(),actor=side==='before'?p.beforeActor:p.afterActor;
   await fixtureWrite(r,'UPDATE characters SET health=max_health,spirit=max_spirit,health_updated_at=$2,spirit_updated_at=$2 WHERE id=ANY($1::uuid[])',[[actor.id,p.npc.id],now]);
   const a=await r.me(actor),d=await stateFromAccount(p.npc.account_id),projection=independentCombat(a,d,true);
   const money=(await r.db.query('SELECT sum(balance)::bigint AS n FROM wallets WHERE character_id=ANY($1::uuid[])',[[actor.id,p.npc.id]])).rows[0]!.n;
   const fight=await r.ok(actor,'/api/v1/battles',{targetCharacterId:p.npc.id}),record=(await r.db.query('SELECT snapshot,result FROM battles WHERE id=$1',[fight.battleId])).rows[0]!;
   assert.equal(record.snapshot.defender.army.participants,d.army.participants);assert.equal(record.result.attackerXp,record.result.outcome==='attacker_win'?projection.xpOnWin:0);
   assert.equal((await r.db.query('SELECT sum(balance)::bigint AS n FROM wallets WHERE character_id=ANY($1::uuid[])',[[actor.id,p.npc.id]])).rows[0]!.n,money);
   evidence.push({level:p.npc.level,tier:p.npc.tier,npc:p.npc.id,battleId:fight.battleId,army:d.army.participants,defense:d.defense,actorAttack:a.attack,actorArmy:a.army.participants,...projection,outcome:record.result.outcome,actualXp:record.result.attackerXp,actualGold:record.result.loot,walletConserved:true});
   time.advance(alpha.combat.cooldownSeconds+1);
  }
  return evidence;
 };
 async function stateFromAccount(id:string){const {getState}=await import('../src/game.js');return getState(r.db,id,{developmentBotRecruitmentEnabled:true});}
}
