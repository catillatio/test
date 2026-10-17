// Deterministic arithmetic and catalog evidence, not a claim of human playtesting.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {botBlueprint} from '../src/development.js';
import {botCatalog} from '../src/strategy-rules.js';
import {levelRequirement,alpha} from '../src/alpha-rules.js';
import {progressionEconomy,victoryExperience} from '../src/progression-economy-rules.js';
import {projectRoot} from '../src/config.js';
const population:{level:number;tier:string;variant:number;name:string;calling:string;army:number;unbanked:number;vault:number;plots:number;gross:number;net:number;equipmentInvestment:number;propertyInvestment:number}[]=[];
for(let level=1;level<=50;level++)for(const tier of ['green','seasoned','elite'])for(let variant=0;variant<3;variant++){
 const b=botBlueprint(level,tier,variant);const plots=b.properties.reduce((n,p)=>n+p.quantity,0);
 assert.ok(plots>=3&&b.gold>=2500&&b.participants<=10);assert.ok(b.items.every(item=>item.level<=level));
 population.push({level,tier,variant,name:b.name,calling:b.calling,army:b.participants,unbanked:b.gold,vault:b.bankedGold,plots,gross:b.grossIncome,net:b.netIncome,equipmentInvestment:b.equipmentInvestment,propertyInvestment:b.propertyInvestment});
}
assert.equal(population.length,450);assert.equal(new Set(population.map(b=>b.name)).size,450);
const progression=[1,10,25,40,50].map(level=>{
 const requirement=levelRequirement(level),even=victoryExperience(level,level).amount,spiritSeconds=108;
 const quests=alpha.quests.filter(q=>q.level<=level).sort((a,b)=>b.level-a.level||b.xp-a.xp);
 return {level,requirement,weaker:victoryExperience(level,Math.max(1,level-Math.max(2,Math.ceil(level*.2)))).amount,even,stronger:level===50?null:victoryExperience(level,Math.min(50,level+Math.max(2,Math.ceil(level*.2)))).amount,
  fullRewardVictoriesPerLevel:Math.ceil(requirement/even),diminishedVictoryXp:1,
  secondsToRecoverSpiritForFullVictories:Math.ceil(requirement/even)*spiritSeconds,
  dailyFullBotXpAtEqualLevel:6*even,relevantQuest:quests[0]?.name,questXp:quests[0]?.xp};
});
const ranges=[1,10,25,40,50].map(level=>{const bots=population.filter(b=>b.level===level);return {level,unbanked:[Math.min(...bots.map(b=>b.unbanked)),Math.max(...bots.map(b=>b.unbanked))],vault:[Math.min(...bots.map(b=>b.vault)),Math.max(...bots.map(b=>b.vault))],plots:[Math.min(...bots.map(b=>b.plots)),Math.max(...bots.map(b=>b.plots))],gross:[Math.min(...bots.map(b=>b.gross)),Math.max(...bots.map(b=>b.gross))]};});
const out=join(projectRoot,'test-results');await mkdir(out,{recursive:true});
await writeFile(join(out,'phase43-balance.json'),JSON.stringify({passed:true,ruleset:progressionEconomy.id,populationVersion:botCatalog.id,population:450,perLevel:9,progression,ranges,limitations:['Expected wins assume appropriate equipment and actual victory; rewards are not guaranteed.','Recovery estimates exclude starting Spirit, level-up refills, skill upgrades and Calling variation.','Existing level-50 content is supported; no new cap or XP curve is introduced.']},null,2)+'\n');
console.log(JSON.stringify({population:population.length,perLevel:9,progression,ranges}));
