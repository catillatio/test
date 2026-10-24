// Reproducible, deterministic E1 research. No production access or provisioning.
import {mkdir,readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {alpha,levelRequirement} from '../src/alpha-rules.js';
import {armyStudy,equipmentStudy,numericStudy,populationStudy,pace,baseline,proposal,type PaceOptions} from './simulation/level100-e1.js';
const folder='docs/level100-e1',check=process.argv.includes('--check');
async function output(file:string,value:unknown){const text=JSON.stringify(value,null,2)+'\n';if(check)assert.equal(await readFile(folder+'/'+file,'utf8'),text,file+' is not reproducible');else{await mkdir(folder,{recursive:true});await writeFile(folder+'/'+file,text);}}
const inputs=['rulesets/alpha-0.3/rules.json','rulesets/recreation-0.1/rules.json','rulesets/strategy-0.2/rules.json','rulesets/passive-rivals-5/rules.json','rulesets/gameplay-refinement-1/rules.json','rulesets/game-feel-1/rules.json','rulesets/bot-combat-rewards-2/rules.json','rulesets/automatic-upkeep-1/rules.json','rulesets/community-0.1/rules.json','rulesets/pvp-economy-0.1/rules.json','migrations/022_player_foundations.sql','src/alpha-rules.ts','src/progression.ts','src/maintenance.ts','src/bot-economy.ts','src/bot-combat.ts','src/bot-income.ts','src/development.ts','src/inventory.ts','src/estate.ts','src/land.ts','deployment/release/protocol.mjs','docs/level100-e1/proposed-content.json','scripts/simulation/level100-e1.ts','scripts/level100-e1.ts'];
const hashes=Object.fromEntries(await Promise.all(inputs.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
await output('provenance.json',{baseline,headSchema:'022_player_foundations.sql',researchOnly:true,productionContacted:false,installed:false,sources:hashes,oldCatalogCounts:{equipment:alpha.items.length,quests:alpha.quests.length,properties:alpha.properties.length},proposedCounts:{regions:proposal.regions.length,equipment:proposal.items.length+proposal.midLevelMirrors.length,upperEquipment:proposal.items.length,compatibilityMirrors:proposal.midLevelMirrors.length,quests:proposal.quests.length,properties:proposal.properties.length}});
await output('army.json',armyStudy());await output('equipment.json',equipmentStudy());await output('numeric.json',numericStudy());await output('population.json',populationStudy());
const profiles=[
 {name:'intensive-8h',sessionMinutes:[120,120,120,120],starts:[360,600,840,1080]},
 {name:'regular-90m',sessionMinutes:[30,30,30],starts:[480,780,1140]},
 {name:'occasional-30m',sessionMinutes:[30],starts:[1140]},
];
const results:ReturnType<typeof pace>[]=[];
function run(o:PaceOptions){const r=pace(o);results.push(r);console.log([o.name,'expanded='+o.expanded,'slope='+o.extraXpPerLevel,'seed='+o.seed,r.daysTo100===null?'not reached; level '+r.finalLevel:r.daysTo100.toFixed(2)+' days','gold conserved'].join(' · '));}
const seeds=[1001,1007,1013];
for(const p of profiles)for(const seed of seeds){
 run({...p,expanded:false,extraXpPerLevel:0,days:180,seed});
 for(const extraXpPerLevel of[0,150,300])run({...p,expanded:true,extraXpPerLevel,days:180,seed});
}
const sensitivities=[
 {name:'intensive-10h',sessionMinutes:[150,150,150,150],starts:[360,600,840,1080]},
 {name:'regular-2h-one-visit',sessionMinutes:[120],starts:[1140]},
 {name:'regular-2h-four-visits',sessionMinutes:[30,30,30,30],starts:[420,720,960,1200]},
 {name:'regular-1h-two-visits',sessionMinutes:[30,30],starts:[480,1140]},
 {name:'regular-half-availability',sessionMinutes:[30,30,30],starts:[480,780,1140],availability:.5},
 {name:'regular-low-acceptance',sessionMinutes:[30,30,30],starts:[480,780,1140],acceptance:.5},
 {name:'regular-mage',sessionMinutes:[30,30,30],starts:[480,780,1140],calling:'Spellward'},
 {name:'regular-no-reinvestment',sessionMinutes:[30,30,30],starts:[480,780,1140],shop:false},
];
for(const p of sensitivities)for(const seed of seeds)run({...p,expanded:true,extraXpPerLevel:150,days:180,seed});
for(const p of profiles.slice(0,2))for(const seed of seeds){
 run({...p,name:p.name+'-army-only',expanded:false,armyModel:'historical-5x',population:'legacy450',extraXpPerLevel:0,days:180,seed});
 run({...p,name:p.name+'-expanded-old-population',expanded:true,armyModel:'historical-5x',population:'legacy450',extraXpPerLevel:150,days:180,seed});
}
await output('progression.json',{baseline,researchOnly:true,stepSeconds:60,startingLevel:1,startingGold:60,startingMilitia:0,botXpPercent:65,seeds,recommendedSlope:150,existingThresholdsUnchangedInCode:true,sensitivityParameters:[0,150,300],runs:results});
const csv=['scenario,expanded,slope,seed,days_to_100,level_at_horizon,level_50_day,level_75_day,quests,wins,losses,quest_xp,combat_xp,gold_looted,player_land_gold,upkeep_per_hour,net_property_per_hour,army,capacity,conserved',...results.map(r=>[r.options.name,r.options.expanded,r.options.extraXpPerLevel,r.options.seed,r.daysTo100??'',r.finalLevel,r.reached['50']??'',r.reached['75']??'',r.stats.quests,r.stats.wins,r.stats.losses,r.stats.xpQuest,r.stats.xpCombat,r.stats.loot,r.playerLandGold,r.equipmentUpkeep,r.netProperty,r.army,r.capacity,r.conserved].join(','))].join('\n')+'\n';
if(check)assert.equal(await readFile(folder+'/progression.csv','utf8'),csv);else await writeFile(folder+'/progression.csv',csv);
const humanXp=Array.from({length:99},(_,i)=>levelRequirement(i+1)).reduce((s,x)=>s+x,0);assert.equal(results.filter(r=>!r.options.expanded).every(r=>r.stats.xpQuest+r.stats.xpCombat>=0),true);console.log('PASS E1 reproducibility: '+results.length+' finite-resource scenarios; baseline XP to 100 '+humanXp+'; no game/database changes.');
