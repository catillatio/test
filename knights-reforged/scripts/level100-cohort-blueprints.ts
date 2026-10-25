// Offline authoring only. Does not connect to PostgreSQL or provision accounts.
import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {expandedContent,definitionDigest} from '../src/expansion-content.js';import {propertyPrice,alpha} from '../src/alpha-rules.js';
export const cohortId='level100-rivals-1';
function uuid(key:string){const b=createHash('sha256').update(cohortId+':'+key).digest().subarray(0,16);b[6]=(b[6]!&15)|80;b[8]=(b[8]!&63)|128;const s=b.toString('hex');return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');}
const names=['Aldric','Brenna','Corwin','Delyth','Edric','Fenna','Garrick','Helvi','Ivar','Jorun','Kael','Liora','Merek','Nerys','Osric','Petra','Quillan','Ragna','Soren','Tamsin'];
export function buildCohort(multiplier=1.5){
 const levels=[...Array.from({length:50},(_,i)=>Array(8).fill(i+51)).flat(),...[10,15,20,25,30,35,40,45,48,50].flatMap(l=>Array(5).fill(l))];
 const entries=levels.map((level,index)=>{
  const slot=index<400?index%8:[3,4,5,6,7][index%5]!,tier=slot<3?'green':slot<6?'seasoned':'elite';
  const strength=tier==='green'?.12:tier==='seasoned'?.22:.35,lag=tier==='green'?12:tier==='seasoned'?5:0;
  const participants=Math.max(2,Math.floor(5*level*strength*multiplier)),coverage=tier==='green'?.6:tier==='seasoned'?.85:1;
  const equipment=(['weapon','armor','spell'] as const).map(category=>{const item=expandedContent.items.filter(i=>i.category===category&&i.level<=Math.max(1,level-lag)&&i.acquisition!=='quest-exclusive').sort((a,b)=>(slot%2?b.defense-a.defense:b.attack-a.attack)||b.attack-a.attack||a.id.localeCompare(b.id))[0]!;return {itemId:item.id,quantity:Math.max(1,Math.ceil(participants*coverage)),unitCost:item.price};});
  const upkeep=equipment.reduce((n,i)=>n+expandedContent.items.find(e=>e.id===i.itemId)!.upkeep*i.quantity,0);
  // Compare a bounded set of ordinary saved portfolios. Low lot count avoids
  // multiplying the hourly per-holding journal footprint for marginal ROI.
  const choices=expandedContent.properties.filter(p=>p.level<=level).flatMap(p=>{const gain=p.hourlyIncome-p.hourlyUpkeep,quantity=Math.max(3,Math.ceil(upkeep*1.6/gain));if(quantity>25)return [];const prices=Array.from({length:quantity},(_,n)=>propertyPrice(p.price,n));return [{propertyId:p.id,quantity,prices,cost:prices.reduce((a,b)=>a+b,0),net:gain*quantity}];}).sort((a,b)=>a.cost-b.cost||a.quantity-b.quantity||a.propertyId.localeCompare(b.propertyId));
  const land=choices[0];if(!land)throw new Error('No sustainable bounded portfolio.');
  const equipmentCost=equipment.reduce((n,i)=>n+i.quantity*i.unitCost,0),reserve=upkeep,wallet=Math.max(2000,(land.net-upkeep)*4),capital=equipmentCost+land.cost+reserve+wallet;
  assert.ok(Number.isSafeInteger(capital)&&capital<=2147483647&&participants<=5*level&&land.net>upkeep);
  return {characterId:uuid('character:'+index),accountId:uuid('account:'+index),populationKey:cohortId+':'+index,username:'_exp100_'+index,name:names[index%names.length]+' of '+['Iron March','Crownward','Riverwatch','Stonegate','Ashen Vale','Eclipse Reach'][Math.floor(index/names.length)%6]+' '+(index+1),level,tier,variant:slot%3,calling:['Freeblade','Warden','Spellward'][index%3]!,members:participants-1,training:Math.min(25,Math.floor(level/4)),health:100+Math.floor(level/5)*10,mana:20+Math.floor(level/10),spirit:3+Math.floor(level/15),skillPoints:(level-1)*alpha.progression.pointsPerLevel-2*Math.min(25,Math.floor(level/4))-Math.floor(level/5)-Math.floor(level/10)-2*Math.floor(level/15),equipment,land:{propertyId:land.propertyId,prices:land.prices},equipmentCost,landCost:land.cost,upkeep,propertyNet:land.net,reserve,wallet,capital};
 });
 return {id:cohortId,strengthMultiplier:multiplier,reviewStatus:'pending',activationDefault:false,catalogId:expandedContent.id,expectedOriginalBots:450,expectedAddedBots:450,expectedTotalBots:900,entries};
}
