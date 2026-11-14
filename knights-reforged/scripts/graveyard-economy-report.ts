import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {contentCatalog} from '../src/expansion-content.js';
import {graveyardWorld,graveyardDefinitionDigest} from '../src/privacy/graveyard-roster.js';
import {populationHourlyIncome,simulatePopulation} from '../src/privacy/graveyard-simulation.js';
const started=performance.now(),old=JSON.parse(readFileSync(new URL('../rulesets/graveyard-world-1/rules.json',import.meta.url),'utf8'));
const previous=old.rosters['level100-content-1'].map((t:any)=>{const p=contentCatalog('level100-content-1').properties.find(p=>p.id===t.property.id)!;return (p.hourlyIncome-p.hourlyUpkeep)*t.property.quantity;});
const report={kind:'synthetic-independent-population-economy-v1',worldDefinitionDigest:graveyardDefinitionDigest(),modelSha256:createHash('sha256').update(readFileSync(new URL('../src/privacy/graveyard-simulation.ts',import.meta.url))).digest('hex'),recommended:graveyardWorld.recommended,
 assumptions:['No real player data or wallets. No database writes.','All initial wallets zero; hourly actual catalog net Land income, exact existing integer credit and retained overflow.','Scheduled successful eligible victories per attacker-target pair; existing human PvP anchored 24-hour gold sequence and integer loot.','Farmers are eligible attackers per NPC, not a claimed realm population. No missed attacks, defeats, HP/Stamina or discovery friction: optimistic loot-access sensitivity.','No XP, bounties, dev bots, player purchases, sinks, behavioral response or real-money economy modeled. Transfers do not burn gold.'],
 populations:[6,12,24,48,96].map(n=>({population:n,hourlyGold:populationHourlyIncome('level100-content-1',n).reduce((a,b)=>a+b,0),
  scenarios:[0,1,3].flatMap(farmers=>(farmers?[1,5,20]:[1]).flatMap(wins=>[30,365,1095].map(days=>simulatePopulation(populationHourlyIncome('level100-content-1',n),days,farmers,wins))))})),
 previousProposal:{population:24,hourlyGold:previous.reduce((a:number,b:number)=>a+b,0),oneYear:simulatePopulation(previous,365,0,1),threeYears:simulatePopulation(previous,1095,0,1)},
 elapsedMs:0};report.elapsedMs=Math.round(performance.now()-started);
const text=JSON.stringify(report,null,2)+'\n';if(process.argv[2])writeFileSync(process.argv[2],text);else console.log(text);
