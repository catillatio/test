// Synthetic economic sensitivity model. Never connects to a realm or changes a rule.
import assert from 'node:assert/strict';
import {humanVictoryLoot,humanPvpLoot} from '../human-pvp-loot.js';
import {landCreditAmount} from '../land-rules.js';
import {contentCatalog} from '../expansion-content.js';
import {graveyardTemplate,graveyardWorld} from './graveyard-roster.js';
export function populationHourlyIncome(catalogId:string,population:number){
 assert.ok(Number.isSafeInteger(population)&&population>=0&&population<=graveyardWorld.limits.maximumPopulation);
 const catalog=contentCatalog(catalogId);
 return Array.from({length:population},(_,slot)=>{const t=graveyardTemplate(catalogId,slot),p=catalog.properties.find(p=>p.id===t.property.id)!;return (p.hourlyIncome-p.hourlyUpkeep)*t.property.quantity;});
}
export function simulatePopulation(incomes:number[],days:number,farmersPerNpc:number,winsPerDay:number){
 assert.ok(incomes.length<=96&&incomes.every(i=>Number.isSafeInteger(i)&&i>=0));
 assert.ok(Number.isSafeInteger(days)&&days>0&&days<=3650);assert.ok(Number.isSafeInteger(farmersPerNpc)&&farmersPerNpc>=0&&farmersPerNpc<=10);
 assert.ok(Number.isSafeInteger(winsPerDay)&&winsPerDay>=1&&winsPerDay<=24);
 const purses=incomes.map(()=>({wallet:0,pending:0n,loot:0n,attacks:0,pairs:Array.from({length:farmersPerNpc},()=>({startedAt:-Infinity,victories:0}))}));
 const hours=new Set(Array.from({length:winsPerDay},(_,i)=>Math.floor(i*24/winsPerDay)));
 for(let hour=1;hour<=days*24;hour++)for(let i=0;i<purses.length;i++){
  const p=purses[i]!;p.pending+=BigInt(incomes[i]!);const credit=landCreditAmount(p.wallet,p.pending);p.wallet+=credit;p.pending-=BigInt(credit);
  if(!hours.has((hour-1)%24))continue;
  for(const pair of p.pairs){if(pair.startedAt<=hour-humanPvpLoot.windowSeconds/3600){pair.startedAt=hour;pair.victories=0;}const amount=humanVictoryLoot(p.wallet,++pair.victories).amount;p.wallet-=amount;p.loot+=BigInt(amount);p.attacks++;}
 }
 const generated=incomes.reduce((n,i)=>n+BigInt(i)*BigInt(days*24),0n),wallet=purses.reduce((n,p)=>n+BigInt(p.wallet),0n),retained=purses.reduce((n,p)=>n+p.pending,0n),loot=purses.reduce((n,p)=>n+p.loot,0n);
 assert.equal(generated,wallet+retained+loot,'Loot transfers cannot change total world gold');
 const payouts=purses.map(p=>humanVictoryLoot(p.wallet,1).amount);
 return {days,population:incomes.length,farmersPerNpc,winsPerDay,generatedGold:generated.toString(),npcWalletGold:wallet.toString(),retainedGold:retained.toString(),playerLootGold:loot.toString(),successfulAttacks:purses.reduce((n,p)=>n+p.attacks,0),nextFirstVictoryGold:{minimum:payouts.length?Math.min(...payouts):0,maximum:Math.max(0,...payouts)},conservation:true};
}
