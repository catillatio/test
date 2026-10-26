// Nonproduction analysis only. Reuses the installed planner, XP epoch and Mana
// recovery; these functions neither change policy nor connect to a database.
import {alpha,selectEquipment,type QuestDefinition} from '../../src/alpha-rules.js';
import {expandedContent,questRarities} from '../../src/expansion-content.js';
import {livingEconomy,planEconomy,type EconomySnapshot} from '../../src/bot-economy.js';
import {expansionBotEconomy} from '../../src/expansion-bot-rules.js';
import {regenerate} from '../../src/rules.js';import {recoverySeconds} from '../../src/strategy-rules.js';
import {advanceProgression,type ProgressionEpoch} from '../../src/progression-policy.js';
import {levelRequirement} from '../../src/alpha-rules.js';
export function explainStalledEquipment(s:EconomySnapshot){
 const currentA=selectEquipment(s.inventory,s.participants,'attack',true,'army-five-per-level-1').attack,currentD=selectEquipment(s.inventory,s.participants,'defense',true,'army-five-per-level-1').defense;
 const eligible=expandedContent.items.filter(i=>i.acquisition!=='quest-exclusive'&&i.level<=s.level&&i.level>=Math.max(1,s.level-expansionBotEconomy.maximumEquipmentLevelLag)&&(s.inventory.find(e=>e.id===i.id)?.quantity??0)<alpha.limits.inventory);
 const budget=Math.min(Math.max(5000,...expandedContent.items.filter(i=>i.level<=s.level&&i.acquisition!=='quest-exclusive').map(i=>i.price)),Math.floor(s.gold*livingEconomy.pursePercent/100),(s.propertyNet-s.rate)*livingEconomy.incomeBudgetHours);
 const reasons:Record<string,number>={};let improvements=0,affordable=0;
 for(const item of eligible){const owned=s.inventory.find(i=>i.id===item.id),next=s.inventory.filter(i=>i.id!==item.id).concat({...item,inventoryId:owned?.inventoryId??'analysis',quantity:(owned?.quantity??0)+1});
  const gain=selectEquipment(next,s.participants,'attack',true,'army-five-per-level-1').attack-currentA+selectEquipment(next,s.participants,'defense',true,'army-five-per-level-1').defense-currentD;
  if(gain<=0){reasons.noCombatGain=(reasons.noCombatGain??0)+1;continue;}improvements++;
  const rate=s.rate+item.upkeep,credit=BigInt(s.reserve),topup=Number(BigInt(rate)>credit?BigInt(rate)-credit:0n);
  const reason=credit>BigInt(rate)?'prepaidCreditNotReleasable':rate>Math.floor(s.propertyNet*expansionBotEconomy.maximumUpkeepPercent/100)||rate>=s.propertyNet?'upkeepCeiling':item.price+topup>budget?'conservativePurchaseBudget':s.gold-item.price-topup<Math.max(Math.ceil(s.gold*.9),rate*livingEconomy.cashUpkeepHours)?'cashReserve':'available';
  reasons[reason]=(reasons[reason]??0)+1;if(reason==='available')affordable++;
 }
 const actual=Array.from({length:144},(_,i)=>planEconomy(s,'phase6-audit-'+i));
 return {candidateImprovements:improvements,affordableImprovements:affordable,policyBudget:budget,reasons,plannerProbeEquipmentChoices:actual.filter(p=>p.kind==='equipment').length};
}
export const questSessions=[
 {id:'casual-15m',minutes:15,visits:1,mana:40,calling:'Freeblade'},
 {id:'regular-1h',minutes:60,visits:2,mana:70,calling:'Freeblade'},
 {id:'regular-2h',minutes:120,visits:2,mana:90,calling:'Spellward'},
 {id:'intensive-4h',minutes:240,visits:3,mana:110,calling:'Spellward'},
] as const;
export function raritySchedule(startLevel:number,session:typeof questSessions[number],days=90){
 if(startLevel<71||startLevel>100)throw new RangeError('Rare study starts at 71–100.');
 const maxMana=Math.min(session.mana,alpha.resources.mana+startLevel-1);
 let level=startLevel,progress=0,mana:number=maxMana,updated=0,completions=0,levelups=0,xpEarned=0;
 const epoch:ProgressionEpoch={policyId:'xp-post50-150-1',boundaryLevel:1,boundaryRequirement:levelRequirement(1),startingProgress:0};
 const counts:Record<string,number>=Object.fromEntries(expandedContent.items.filter(i=>i.acquisition==='quest-exclusive').map(i=>[i.id,0]));
 const checkpoints=[];const seconds=recoverySeconds(session.calling,'mana',alpha.resources.manaSeconds);
 for(let day=0;day<days;day++){
  for(let visit=0;visit<session.visits;visit++)for(let tick=0;tick<session.minutes*2/session.visits;tick++){
   const at=day*86400000+(7+Math.floor(visit*14/session.visits))*3600000+tick*30000;
   const recovered=regenerate(mana,maxMana,new Date(updated),new Date(at),seconds);mana=recovered.value;updated=+recovered.updated;
   // Mature eligible quester: required army, equipment and prior region seals
   // are already legitimately earned. No invented unlocks or free equipment.
   const quest:QuestDefinition|undefined=expandedContent.quests.filter(q=>q.level<=level&&questRarities.quests[q.id]).sort((a,b)=>b.level-a.level||a.id.localeCompare(b.id))[0];
   if(!quest||mana<quest.mana)continue;
   if(mana===maxMana)updated=at;mana-=quest.mana;completions++;xpEarned+=quest.xp;
   for(const id of questRarities.quests[quest.id]!)counts[id]=(counts[id]??0)+1;
   const next=advanceProgression(level,progress,quest.xp,epoch);level=next.level;progress=next.progress;
   if(next.gained){levelups+=next.gained;mana=maxMana;updated=at;}
  }
  if([30,60,90].includes(day+1))checkpoints.push({day:day+1,completions,level,levelups,xpEarned,opportunities:{...counts},rates:[250,500,1000].map(ppm=>({ppm,items:Object.fromEntries(Object.entries(counts).map(([id,n])=>[id,{opportunities:n,expectedCopies:n*ppm/1000000,chanceAtLeastOne:1-(1-ppm/1000000)**n,expectedHourlyUpkeep:n*ppm/1000000*expandedContent.items.find(i=>i.id===id)!.upkeep}])),anyChance:1-(1-ppm/1000000)**Object.values(counts).reduce((a,b)=>a+b,0)}))});
 }
 return {startLevel,session,actualMaximumMana:maxMana,manaRecoverySeconds:seconds,maximumManaFixed:true,resourceRefills:'Only actual XP level-ups refill Mana. No paid refill or artificial resource grant.',prerequisites:'Mature qualified quester; all actual quest army/equipment/region-seal prerequisites must already be earned.',noEligibleQuest:startLevel<74,checkpoints};
}
