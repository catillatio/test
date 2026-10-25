import {expansionBots,expansionBotEconomy,expansionBotIds,partitionBotSchedule,installedCohort,cohortMembers,botArmy} from './expansion-bot-rules.js';
import {expandedContent} from './expansion-content.js';
import {scheduledNumber as numberFor,scheduledCommand,scheduledCandidates,startScheduledBotWork} from './bot-schedule.js';
import {createHash} from 'node:crypto';
import {type Database,transaction} from './db.js';
import {clock,materialize,type CharacterRow} from './game.js';
import {alpha,activeArmy,propertyPrice,selectEquipment,type OwnedItem} from './alpha-rules.js';
import {refinements} from './refinement-rules.js';
import {readInventory,purchaseItems} from './inventory.js';
import {maintenanceAccount,refreshMaintenance} from './maintenance.js';
import {buyEstate} from './estate.js';

// Scheduling/purchase policy, not a combat multiplier. Change the version for
// future reviewed policies; never reinterpret an already committed receipt.
export const livingEconomy=Object.freeze({id:'living-bot-economy-1',intervalMs:300000,
 slotsPerDecision:144,maximumBotsPerTick:5,maximumPopulation:450,
 pursePercent:5,maximumCost:5000,incomeBudgetHours:2,cashUpkeepHours:4,
 maximumUpkeepPercent:35,maximumIncomeGrowthPercent:2});
export function economyWindow(now:Date){return Math.floor(+now/livingEconomy.intervalMs);}
export function decisionSlot(id:string){return numberFor(id)%livingEconomy.slotsPerDecision;}
export function economyCommand(id:string,window:number){return scheduledCommand(expansionBotIds.has(id)?expansionBotEconomy.id:livingEconomy.id,id,window);}
// Stable global candidates; do not replace a skipped bot with a sixth actor.
export function economyCandidates(ids:string[],window:number){
 const {legacy,added}=partitionBotSchedule(ids);return [...scheduledCandidates(legacy,window,{slots:144,maximum:5,population:450}),...scheduledCandidates(added,window,{slots:144,maximum:5,population:450,salt:expansionBotEconomy.id+':'})];
}
export interface EconomySnapshot {
 expandedBot?:boolean;gold:number;level:number;participants:number;propertyNet:number;rate:number;
 reserve:string;arrears:string;paused:boolean;inventory:OwnedItem[];holdings:Record<string,number>;
}
export type EconomyPlan={kind:'wait';reason:string}|{kind:'land'|'equipment';id:string;cost:number;topup:number;newRate:number;netIncrease:number};
export function planEconomy(s:EconomySnapshot,seed:string):EconomyPlan {
 const catalog=s.expandedBot?expandedContent:alpha,policy=s.expandedBot?{...livingEconomy,maximumCost:Math.max(5000,...catalog.items.filter(i=>i.level<=s.level&&i.acquisition!=='quest-exclusive').map(i=>i.price)),maximumUpkeepPercent:expansionBotEconomy.maximumUpkeepPercent}:livingEconomy;
 const net=s.propertyNet-s.rate;
 if(s.paused||BigInt(s.arrears)>0n)return {kind:'wait',reason:'upkeep_paused'};
 if(s.inventory.reduce((n,i)=>n+i.quantity*i.upkeep,0)!==s.rate)return {kind:'wait',reason:'upkeep_mismatch'};
 if(net<=0)return {kind:'wait',reason:'no_surplus'};
 if(numberFor(seed)%4===0)return {kind:'wait',reason:'saving'};
 const budget=Math.min(policy.maximumCost,Math.floor(s.gold*livingEconomy.pursePercent/100),net*livingEconomy.incomeBudgetHours);
 const affordable=(cost:number,topup:number,rate:number)=>cost+topup<=budget&&
  s.gold-cost-topup>=Math.max(Math.ceil(s.gold*.9),rate*livingEconomy.cashUpkeepHours);
 const land:Exclude<EconomyPlan,{kind:'wait'}>[]=[];
 for(const property of catalog.properties){
  const owned=s.holdings[property.id]??0,gain=property.hourlyIncome-property.hourlyUpkeep;
  if(s.expandedBot&&gain<Math.max(7,Math.floor(s.propertyNet*expansionBotEconomy.minimumLandGainPermille/1000)))continue;
  if(property.level>s.level||owned>=alpha.limits.property||gain<=0||gain>Math.max(7,Math.floor(s.propertyNet*livingEconomy.maximumIncomeGrowthPercent/100)))continue;
  let cost:number;try{cost=propertyPrice(property.price,owned);}catch{continue;}
  if(affordable(cost,0,s.rate))land.push({kind:'land',id:property.id,cost,topup:0,newRate:s.rate,netIncrease:gain});
 }
 land.sort((a,b)=>a.cost/a.netIncrease-b.cost/b.netIncrease||a.id.localeCompare(b.id));
 const selectionPolicy=s.expandedBot?'army-five-per-level-1':'army-legacy-1';
 const currentAttack=selectEquipment(s.inventory,s.participants,'attack',true,selectionPolicy).attack;
 const currentDefense=selectEquipment(s.inventory,s.participants,'defense',true,selectionPolicy).defense;
 const gear:(Exclude<EconomyPlan,{kind:'wait'}>&{gain:number})[]=[];
 for(const item of catalog.items){
  const owned=s.inventory.find(i=>i.id===item.id);
  if(item.acquisition==='quest-exclusive'||item.level>s.level||s.expandedBot&&item.level<Math.max(1,s.level-expansionBotEconomy.maximumEquipmentLevelLag)||(owned?.quantity??0)>=alpha.limits.inventory)continue;
  const rate=s.rate+item.upkeep,credit=BigInt(s.reserve);
  // Never release existing prepaid credit to finance an autonomous purchase.
  // Defer until ordinary upkeep consumes excess credit; Land remains possible.
  if(credit>BigInt(rate)||rate>Math.floor(s.propertyNet*policy.maximumUpkeepPercent/100)||rate>=s.propertyNet)continue;
  const topup=Number(BigInt(rate)>credit?BigInt(rate)-credit:0n);
  if(!affordable(item.price,topup,rate))continue;
  const after=s.inventory.filter(i=>i.id!==item.id).concat({...item,inventoryId:owned?.inventoryId??'planned',quantity:(owned?.quantity??0)+1});
  const gain=selectEquipment(after,s.participants,'attack',true,selectionPolicy).attack-currentAttack+selectEquipment(after,s.participants,'defense',true,selectionPolicy).defense-currentDefense;
  if(gain>0)gear.push({kind:'equipment',id:item.id,cost:item.price,topup,newRate:rate,netIncrease:-item.upkeep,gain});
 }
 gear.sort((a,b)=>b.gain/b.cost-a.gain/a.cost||a.id.localeCompare(b.id));
 // Three efficient choices keep fixed personalities varied without randomness,
 // attacker matching, free upgrades, sales, new members or hidden stat bonuses.
 const choose=<T>(choices:T[])=>choices.length?choices[numberFor(seed+':choice')%Math.min(3,choices.length)]:undefined;
 const preferred=numberFor(seed+':kind')%2?choose(gear):choose(land);
 const selected=preferred??choose(land)??choose(gear);
 if(!selected)return {kind:'wait',reason:'saving_for_affordable_upgrade'};
 const {kind,id,cost,topup,newRate,netIncrease}=selected;
 return {kind,id,cost,topup,newRate,netIncrease};
}

// No public route or player-controlled intent reaches this worker. All prices,
// funds and eligibility are read again while holding the ordinary character lock.
export async function runBotEconomy(db:Database,enabled:boolean){
 const result={considered:0,purchased:0,waiting:0,replayed:0,busy:0};
 if(!enabled)return result;
 const now=await clock(db),window=economyWindow(now);
 // The population is small and fixed. Read only IDs, not growing battle/ledger
 // history. Receipt lookup uses its existing (account_id, command_id) PK.
 const bots=(await db.query<{id:string}>(`SELECT c.id FROM development_bots b JOIN characters c ON c.id=b.character_id
  ORDER BY c.id LIMIT $1`,[901])).rows;
 const cohort=bots.length>450?await installedCohort(db):null;
 if(bots.length>450&&(!cohort||bots.length!==900))throw new Error('Unexpected rival population.');
 for(const id of economyCandidates(bots.map(b=>b.id),window)){
  const outcome=await transaction(db,async sql=>{
   const current=await clock(sql);if(economyWindow(current)!==window)return 'busy';
   const raw=(await sql.query<CharacterRow>(`SELECT c.*,true AS development_bot FROM characters c
    JOIN development_bots b ON b.character_id=c.id JOIN accounts a ON a.id=c.account_id
    WHERE c.id=$1 AND b.active AND a.login_disabled FOR UPDATE OF c,b,a SKIP LOCKED`,[id])).rows[0];
   if(!raw)return 'busy';
   // Re-read under the transaction's shared expansion lock. A pause committed
   // after the outer population read must stop this new-cohort purchase too.
   if(expansionBotIds.has(id)){const currentCohort=await installedCohort(sql);if(!currentCohort?.active||currentCohort.autonomyMode==='paused')return 'busy';}
   const policyId=expansionBotIds.has(id)?expansionBotEconomy.id:livingEconomy.id;
   const key=economyCommand(id,window),hash=createHash('sha256').update(policyId+':'+id+':'+window).digest('hex');
   const inserted=await sql.query(`INSERT INTO command_receipts(account_id,command_id,kind,intent_hash,created_at)
    VALUES($1,$2,'bot_economy',$3,$4) ON CONFLICT DO NOTHING RETURNING command_id`,[raw.account_id,key,hash,current]);
   if(!inserted.rows.length){
    const old=(await sql.query('SELECT kind,intent_hash,result FROM command_receipts WHERE account_id=$1 AND command_id=$2',[raw.account_id,key])).rows[0];
    if(old?.kind!=='bot_economy'||old.intent_hash!==hash||old.result?.policy!==policyId)throw new Error('Autonomous decision identity mismatch.');
    return 'replayed';
   }
   const row=await materialize(sql,raw,current); // Exactly the normal saved-income/upkeep path.
   const gold=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[id])).rows[0]!.balance as number;
   const maintenance=await maintenanceAccount(sql,id,current),inventory=await readInventory(sql,id);
   const holdings=(await sql.query(`SELECT property_id,sum(quantity)::int AS quantity,
    sum(quantity*(hourly_income-hourly_upkeep))::text AS net FROM land_holdings WHERE character_id=$1 AND quantity>0 GROUP BY property_id`,[id])).rows;
   const units=(await sql.query('SELECT COALESCE(sum(quantity),0)::int AS n FROM army_stacks WHERE character_id=$1',[id])).rows[0]!.n as number;
   const contingent=expansionBotIds.has(id)?(await cohortMembers(sql,[id])).get(id):undefined;
   const allies=contingent===undefined?0:Number((await sql.query("SELECT count(*)::int AS n FROM army_links WHERE $1 IN(low_id,high_id) AND status='accepted'",[id])).rows[0]!.n);
   const participants=botArmy(row.attained_level,units,allies,row.legacy_army_floor,contingent).participants;
   const snapshot:EconomySnapshot={expandedBot:contingent!==undefined,gold,level:row.attained_level,participants,propertyNet:holdings.reduce((n,h)=>n+Number(h.net),0),rate:maintenance.hourly_rate,
    reserve:maintenance.reserve_gold,arrears:maintenance.arrears_gold,paused:maintenance.paused,inventory,holdings:Object.fromEntries(holdings.map(h=>[h.property_id,h.quantity]))};
   const plan=planEconomy(snapshot,key);
   let acquiredId:string|null=null;
   if(plan.kind==='land'){
    const purchase=await buyEstate(sql,id,row.attained_level,plan.id,1,key,current);
    if(purchase.cost!==plan.cost)throw new Error('Autonomous property price changed.');acquiredId=purchase.holdingId;
   }else if(plan.kind==='equipment'){
    const purchase=await purchaseItems(sql,id,row.attained_level,{[plan.id]:1},key,current);
    if(purchase.cost!==plan.cost)throw new Error('Autonomous item price changed.');
    await refreshMaintenance(sql,id,key,current);acquiredId=purchase.acquired[plan.id]!;
   }
   const after=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[id])).rows[0]!.balance as number;
   const maintained=await maintenanceAccount(sql,id,current);
   const cost=plan.kind==='wait'?0:plan.cost+plan.topup;
   if(after!==gold-cost)throw new Error('Autonomous purchase funding did not reconcile.');
   if(plan.kind==='equipment'&&(maintained.hourly_rate!==plan.newRate||maintained.paused||BigInt(maintained.reserve_gold)!==BigInt(maintenance.reserve_gold)+BigInt(plan.topup)))throw new Error('Autonomous upkeep did not reconcile.');
   if(plan.kind!=='wait')await sql.query('UPDATE characters SET state_version=state_version+1 WHERE id=$1',[id]);
   await sql.query('UPDATE command_receipts SET result=$3 WHERE account_id=$1 AND command_id=$2',[row.account_id,key,{
    policy:policyId,botId:id,window,plan,acquiredId,goldBefore:gold,goldAfter:after,
    reserveBefore:maintenance.reserve_gold,reserveAfter:maintained.reserve_gold,upkeepBefore:maintenance.hourly_rate,upkeepAfter:maintained.hourly_rate,
    propertyNetBefore:snapshot.propertyNet,nextDecisionAt:new Date((window+livingEconomy.slotsPerDecision)*livingEconomy.intervalMs).toISOString()}]);
   return plan.kind==='wait'?'waiting':'purchased';
  });
  result.considered++;result[outcome]++;
 }
 return result;
}
export function startBotEconomy(db:Database,enabled:boolean,onError:(error:unknown)=>void){
 return startScheduledBotWork(()=>runBotEconomy(db,true),enabled,livingEconomy.intervalMs,onError);
}
