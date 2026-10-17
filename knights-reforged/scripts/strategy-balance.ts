// Exact enumeration of the existing 21x21 combat rolls. Arithmetic evidence,
// not human playtesting or a claim of recovered original game formulas.
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {alpha,activeArmy,selectEquipment,trainedPower,resolveAlphaCombat} from '../src/alpha-rules.js';
import {strategy,botCatalog,callingFor,callingPower} from '../src/strategy-rules.js';
import {botBlueprint} from '../src/development.js';
import {rules} from '../src/rules.js';
import {projectRoot} from '../src/config.js';

function power(level:number,participants:number,quantity:number,items:typeof alpha.items,training:number,calling:string,mode:'attack'|'defense',quantities?:Record<string,number>){
  const gear=selectEquipment(items.map(item=>({...item,inventoryId:item.id,quantity:quantities?.[item.id]??quantity})),participants,mode);
  const base=(mode==='attack'?rules.baseAttack:rules.baseDefense)+(level-1)*(mode==='attack'?rules.attackPerLevel:rules.defensePerLevel)+(participants-1)*rules.unit[mode]+gear[mode];
  return callingPower(trainedPower(base,training),mode==='attack'?callingFor(calling).attackPercent:callingFor(calling).defensePercent);
}
const rows=Array.from({length:50},(_,index)=>{
  const level=index+1,rule=botCatalog.benchmark,capacity=activeArmy(level,alpha.limits.mercenaries,0).participants;const reference={participants:Math.max(1,Math.round(capacity*rule.armyPercent/100)),quantity:0,training:Math.floor(level/rule.levelsPerTraining)};reference.quantity=Math.ceil(reference.participants*rule.equipmentPercent/100);
  const items=(['weapon','armor','spell'] as const).map(category=>alpha.items.filter(item=>item.category===category&&item.level<=Math.max(1,level-2)).sort((a,b)=>b.attack-a.attack||b.defense-a.defense)[0]!);
  const attack=power(level,reference.participants,reference.quantity,items,reference.training,'Freeblade','attack');
  const rivals=strategy.bots.tiers.map(tier=>{
    const bot=botBlueprint(level,tier),defense=power(level,bot.participants,bot.quantity,bot.items,bot.training,bot.calling,'defense',bot.quantities);let wins=0,rolls=0;
    for(let a=-alpha.combat.variation;a<=alpha.combat.variation;a++)for(let d=-alpha.combat.variation;d<=alpha.combat.variation;d++){
      if(resolveAlphaCombat({attack,health:100,maxHealth:100,gold:1000},{defense,health:bot.health,maxHealth:bot.health,gold:bot.gold},a,d).outcome==='attacker_win')wins++;rolls++;
    }
    return {tier,participants:bot.participants,itemQuantities:bot.quantities,defense,calling:bot.calling,winPercent:Math.round(wins/rolls*1000)/10,lootAtFullAllowance:Math.min(alpha.combat.lootCap,Math.floor(bot.gold*alpha.combat.lootPercent/100))};
  });return {level,benchmarkAttack:attack,benchmarkParticipants:reference.participants,rivals};
});
const report={ruleset:strategy.id,population:botCatalog.id,reference:'Mercenary-led Freeblade with 70% army capacity, 80% equipment coverage, attack-selected equipment two levels below current level and one training rating per six levels. No player allies.',
  scope:'All 50 levels; all 441 equally likely roll pairs per rival. Results describe this one build, not universal balance.',
  ceilings:{rewardedBotEncountersPerDay:6,rewardedPerBotPerDay:1,goldPerDay:6*alpha.combat.lootCap,xpPerDay:6*alpha.combat.xp,questAndLandBonuses:0},rows};
const out=join(projectRoot,'test-results');await mkdir(out,{recursive:true});await writeFile(join(out,'strategy-balance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ruleset:strategy.id,population:botCatalog.id,ceilings:report.ceilings,checkpoints:rows.filter(row=>[1,10,20,30,40,50].includes(row.level))},null,2));
