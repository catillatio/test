// Reproducible arithmetic review, not a claim of human playtesting or Storm8 rules.
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {alpha,propertyPrice,selectEquipment,levelRequirement} from '../src/alpha-rules.js';
import {projectRoot} from '../src/config.js';

const maturePropertySpend=alpha.properties.reduce((sum,p)=>sum+Array.from({length:alpha.limits.property},(_,owned)=>propertyPrice(p.price,owned)).reduce((a,b)=>a+b,0),0);
const matureIncome=alpha.properties.reduce((sum,p)=>sum+p.hourlyIncome*alpha.limits.property,0);
const maturePropertyUpkeep=alpha.properties.reduce((sum,p)=>sum+p.hourlyUpkeep*alpha.limits.property,0);
const allOwnedGearUpkeep=alpha.items.reduce((sum,item)=>sum+item.upkeep*alpha.limits.inventory,0);
const best=selectEquipment(alpha.items.map(item=>({...item,quantity:alpha.limits.inventory,inventoryId:item.id})),alpha.limits.participants,'attack');
const report={ruleset:alpha.id,scope:'Catalog arithmetic, not observed human-session timing or recovered original formulas.',
  coverage:{equipment:alpha.items.length,categories:['weapon','armor','spell'].map(category=>({category,count:alpha.items.filter(item=>item.category===category).length})),properties:alpha.properties.length,quests:alpha.quests.length,regions:alpha.content?.areas.length,maxEquipmentLevel:Math.max(...alpha.items.map(item=>item.level)),maxPropertyLevel:Math.max(...alpha.properties.map(property=>property.level)),maxQuestLevel:Math.max(...alpha.quests.map(quest=>quest.level)),xpToLevel50:Array.from({length:49},(_,i)=>levelRequirement(i+1)).reduce((n,xp)=>n+xp,0)},
  tierLoadouts:[1,5,10,20,30,40,50].map(level=>{
    const eligible=alpha.items.filter(item=>item.level<=level).map(item=>({...item,quantity:1,inventoryId:item.id}));
    const attack=selectEquipment(eligible,1,'attack'),defense=selectEquipment(eligible,1,'defense');
    const budget=(selected:typeof attack.selected)=>({items:selected.map(item=>item.itemId),cost:selected.reduce((n,item)=>n+alpha.items.find(entry=>entry.id===item.itemId)!.price,0),hourlyUpkeep:selected.reduce((n,item)=>n+alpha.items.find(entry=>entry.id===item.itemId)!.upkeep,0)});
    return {level,attacking:{attack:attack.attack,defense:attack.defense,...budget(attack.selected)},defending:{attack:defense.attack,defense:defense.defense,...budget(defense.selected)}};
  }),
  questEfficiency:alpha.quests.map(q=>({id:q.id,level:q.level,mana:q.mana,xp:q.xp,goldMin:q.goldMin,goldMax:q.goldMax,xpPerMana:q.xp/q.mana,meanGoldPerMana:(q.goldMin+q.goldMax)/2/q.mana})),
  properties:alpha.properties.map(p=>({id:p.id,price:p.price,netPerHour:p.hourlyIncome-p.hourlyUpkeep,firstPaybackHours:p.price/(p.hourlyIncome-p.hourlyUpkeep),tenthPrice:propertyPrice(p.price,9)})),
  builds:[['ash-spear','wicker-buckler','ember-word'],['iron-sword','padded-coat','hearth-ward'],['ransackers-axe','warden-mail','thorn-hex'],['sunsteel-glaive','castellan-helm','storm-sigil']].map(ids=>{
    const items=alpha.items.filter(i=>ids.includes(i.id));return {items:ids,costPerMember:items.reduce((n,i)=>n+i.price,0),attack:items.reduce((n,i)=>n+i.attack,0),defense:items.reduce((n,i)=>n+i.defense,0),upkeepPerHour:items.reduce((n,i)=>n+i.upkeep,0)};
  }),
  matureEstate:{allPropertiesAtCap:alpha.limits.property,acquisitionSpend:maturePropertySpend,grossHourly:matureIncome,propertyUpkeep:maturePropertyUpkeep,everyItemAtInventoryCapUpkeep:allOwnedGearUpkeep,netWithMaximalInventory:matureIncome-maturePropertyUpkeep-allOwnedGearUpkeep,
    bestAttackEquipmentPower:best.attack,bestAttackEquipmentUses:best.selected.reduce((n,i)=>n+i.quantity,0)},
  pacing:{target:'Meaningful progression during a 10–20 minute human first session.',verified:'HTTP and browser playthroughs reach levels, three equipment categories, skills, recruitment, allies, PvP, property ownership and sale without granting gold or XP.',unverified:'Human session durations, long-term retention, competitive class/build balance and multi-day inflation require alpha playtesting.'}};
const out=join(projectRoot,'test-results');await mkdir(out,{recursive:true});await writeFile(join(out,'balance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
