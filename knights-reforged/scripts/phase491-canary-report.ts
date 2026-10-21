// Offline review material only. No database, network, runtime or provisioning I/O.
import {mkdir,writeFile} from 'node:fs/promises';
import {alpha,activeArmy,areRivals} from '../src/alpha-rules.js';
import {botVictoryRewards,botCombat} from '../src/bot-combat-rules.js';
import {blueprintSnapshot,humanReference,inventory,power,type Tier} from './experiments/bot-calibration-model.js';
import {canary,selectedSlots,slotKey,planCanary,applyCanarySnapshot,prepareManifest,digest,powers,winPercent,economicIntentDigest} from './experiments/bot-canary-model.js';
import {simulateBotCombat,type SimulationOptions} from './simulation/bot-combat.js';
const out='docs/phase491/canary';await mkdir(out,{recursive:true});
const bots=Array.from({length:50},(_,i)=>i+1).flatMap(level=>canary.tiers.flatMap(tier=>[0,1,2].map(variant=>{
  const s=blueprintSnapshot(level,tier,variant);return {...s,accountId:'synthetic-account:'+slotKey(s)};
})));
const manifest=prepareManifest(bots.filter(s=>selectedSlots.includes(slotKey(s))),new Date('2035-01-01T00:00:00Z'));
const entries=new Map(manifest.entries.map(e=>[e.slot,e]));
const afterBots=bots.map(s=>entries.get(slotKey(s))?.after??s);
const afterBySlot=new Map(afterBots.map(s=>[slotKey(s),s]));
const rows=[];
for(let i=0;i<bots.length;i++)for(const profile of['starter','ordinary','established','large'] as const){
  const b=bots[i]!,a=afterBots[i]!,h=humanReference(b.level,profile),before=powers(b),after=powers(a);
  const wb=winPercent(h.attack,before.defense),wa=winPercent(h.attack,after.defense);
  const rb=botVictoryRewards(b.gold,b.level,b.level,1,h.attack,before.defense),ra=botVictoryRewards(a.gold,a.level,a.level,1,h.attack,after.defense);
  rows.push({level:b.level,tier:b.tier,variant:b.variant,slot:slotKey(b),selected:entries.has(slotKey(b)),changed:entries.get(slotKey(b))?.plan.status==='purchase',profile,
    eligible:areRivals(b.level,b.level),humanArmy:h.participants,botArmy:entries.get(slotKey(b))?.plan.participants??b.militia+1,humanAttack:h.attack,beforeAttack:before.attack,afterAttack:after.attack,beforeDefense:before.defense,afterDefense:after.defense,
    beforeWinPercent:wb,afterWinPercent:wa,beforeGoldIfWin:wb?rb.loot.amount:null,afterGoldIfWin:wa?ra.loot.amount:null,beforeXpIfWin:wb?rb.xp.amount:null,afterXpIfWin:wa?ra.xp.amount:null,
    expectedGoldPerAttemptBefore:wb/100*rb.loot.amount,expectedGoldPerAttemptAfter:wa/100*ra.loot.amount});
}
const csvKeys=Object.keys(rows[0]!);await writeFile(out+'/matchups.csv',[csvKeys.join(','),...rows.map(row=>csvKeys.map(k=>(row as any)[k]).join(','))].join('\n')+'\n');
const costs=manifest.entries.reduce((n,e)=>n+e.plan.cost,0),extraUpkeep=manifest.entries.reduce((n,e)=>n+e.plan.newRate-e.plan.oldRate,0);
const summarize=(r:ReturnType<typeof simulateBotCombat>)=>({wins:r.wins,losses:r.losses,knockouts:r.knockouts,gold:r.goldTransferred,xp:r.xpAwarded,healingGold:r.healingGold,upkeepPaid:r.upkeepPaid,naturalSpirit:r.naturalSpirit,naturalHealth:r.naturalHealth,
  levelUps:r.levelUps,refillSpirit:r.refillSpirit,refillHealth:r.refillHealth,finalLevels:r.finalLevels,finalWallets:r.finalWallets,finalSpirit:r.finalSpirit,finalHealth:r.finalHealth,distinctTargets:r.distinctTargets,maximumPairVictories:r.maximumVictoriesInOnePair,
  blocked:r.blocked,initialCombined:r.initialCombined,endingCombined:r.endingCombined,generatedPropertyGold:r.generatedPropertyGold,conserved:r.conserved,vaultUnchanged:r.vaultUnchanged,activeHours:r.activeHours,calendarHours:r.calendarHours});
const override:SimulationOptions['botLoadout']=(level,tier,variant)=>{const a=afterBySlot.get(`${level}:${tier}:${variant}`)!;return {militia:a.militia,training:a.defenseTraining,inventory:inventory(a),wallet:a.gold,reserve:BigInt(a.reserve)};};
function pair(options:SimulationOptions){
  const b=simulateBotCombat(options),a=simulateBotCombat({...options,botLoadout:override});
  return {options,before:summarize(b),after:summarize(a)};
}
const paced=[];
for(let level=1;level<=50;level++)for(const hours of[1,2,6])for(const loadout of['natural','established'] as const)paced.push(pair({level,hours,loadout,policy:'phase49',mode:'varied',heal:true,seed:49101}));
const targeted=[];
for(const e of manifest.entries.filter(e=>e.plan.status==='purchase'||e.before.level===15&&e.before.tier==='elite'))for(const players of[1,10])targeted.push(pair({level:e.before.level,hours:6,players,policy:'phase49',mode:'same',targetSlot:e.slot,heal:true,seed:49101,decisionSeconds:6,spiritCapacity:e.before.level>=15?10:3}));
const daily=[];
for(const level of[5,15,25,40,50])for(const dailySessionHours of[1,2])daily.push(pair({level,hours:168,dailySessionHours,policy:'phase49',mode:'varied',heal:true,seed:49101}));
const stress=[];
for(const level of[100,200])for(const ownedArmy of[1,10,21,101,1000])for(const tier of canary.tiers){
  const e=manifest.entries.find(e=>e.before.level===50&&e.before.tier===tier)!,profile=ownedArmy===1?'starter':ownedArmy<=10?'ordinary':ownedArmy<=21?'established':'large';
  const h=humanReference(level,profile),p=activeArmy(level,0,ownedArmy-1).participants,gear=h.inventory.map(i=>({...i,quantity:Math.min(alpha.limits.inventory,ownedArmy)}));
  const attack=power(level,p,gear,h.training,'Freeblade','attack'),beforeDefense=power(level,e.plan.participants,inventory(e.before),e.before.defenseTraining,e.before.calling,'defense'),afterDefense=power(level,e.plan.participants,inventory(e.after),e.after.defenseTraining,e.after.calling,'defense');
  stress.push({level,ownedArmy,participants:p,botParticipants:e.plan.participants,tier,attack,beforeDefense,afterDefense,beforeWin:winPercent(attack,beforeDefense),afterWin:winPercent(attack,afterDefense),ownedGearUpkeep:gear.reduce((n,i)=>n+i.quantity*i.upkeep,0),eligibleAgainstActualLevel50:areRivals(level,50),actualGold:null,actualXp:null,maximumCatalogLevel:50});
}
const funding=[];
for(const e of manifest.entries)for(const pursePercent of[100,50,10,0])for(const keepReserve of[true,false]){const s={...e.before,gold:Math.floor(e.before.gold*pursePercent/100),reserve:keepReserve?e.before.reserve:0},p=planCanary(s);funding.push({slot:e.slot,pursePercent,keepReserve,status:p.status,cost:p.cost,reserveTopup:p.reserveTopup,reason:p.reason});}
const pairs=[...paced,...targeted,...daily];
const maximumLootChangePercent=Math.max(...pairs.filter(s=>s.before.gold>0).map(s=>Math.abs(s.after.gold/s.before.gold-1)*100));
const maximumXpChangePercentAtLeast100=Math.max(...pairs.filter(s=>s.before.xp>=100).map(s=>Math.abs(s.after.xp/s.before.xp-1)*100));
const maximumSessionLevelDifference=Math.max(...pairs.flatMap(s=>s.after.finalLevels.map((v,i)=>Math.abs(v-s.before.finalLevels[i]!))));
const summary={policy:canary.id,adopted:false,productionContacted:false,manifestDigest:digest(manifest),economicIntentDigest:economicIntentDigest(manifest),selected:18,purchases:manifest.entries.filter(e=>e.plan.status==='purchase').length,
  controls:manifest.entries.filter(e=>e.plan.status==='control').length,costs,extraUpkeep,exposedGoldCredit:0,reserveRefunds:0,sales:0,pointsSpent:0,membersAdded:0,matchupRows:rows.length,
  pacedSessions:paced.length*2,targetedSessions:targeted.length*2,dailySessions:daily.length*2,stressCases:stress.length,
  maximumLootChangePercent,maximumXpChangePercentAtLeast100,maximumSessionLevelDifference,
  maximumPowerGrowthPercent:Math.max(...manifest.entries.flatMap(e=>[100*(e.plan.after.attack/e.plan.before.attack-1),100*(e.plan.after.defense/e.plan.before.defense-1)])),
  maximumWinRateDropPoints:Math.max(...rows.map(r=>r.beforeWinPercent-r.afterWinPercent)),
  assumptions:['Only five purchased loadouts in eighteen predetermined slots; all other445 bots retain the baseline. No all-population application or progression loop.','Static human profiles use original formulas and current legal gear. A starter retaining level1 gear at level50 is a deliberate under-equipment stress case.','Pacing uses the accepted fixed human equipment/army fixture, ordinary losses, resource recovery, paid healing and level-up refills. Equipped10 is distinct from the static21/101-member profiles.','Changed gear is initial paid state, not combat-generated income. Every session conserves finite purses plus reserves, generated existing Land income, actual upkeep and healing sinks; Vault totals remain unchanged.','One seed is deterministic evidence, not a population confidence interval. Targeted10-account ordering is adversarial sequential pressure, not fair scheduling.','Hypothetical100/200 cases freeze the level50 catalog and existing members/training; actual level50 bots are ineligible and actual reward forecasts are null. No future content or entitlements are invented.']};
await writeFile(out+'/manifest.json',JSON.stringify({syntheticOnly:true,canary,manifestDigest:digest(manifest),manifest},null,2)+'\n');
await writeFile(out+'/summary.json',JSON.stringify(summary,null,2)+'\n');
await writeFile(out+'/sessions.json',JSON.stringify({syntheticOnly:true,paced,targeted,daily},null,0)+'\n');
await writeFile(out+'/stress.json',JSON.stringify(stress,null,2)+'\n');
await writeFile(out+'/funding.json',JSON.stringify(funding,null,2)+'\n');
const gates={productionPromotionAuthorized:false,thresholdsAreProposedForOwnerReview:true,
  checks:[
    {name:'SELECTION_AND_REPRESENTATION',pass:manifest.entries.length===18&&canary.tiers.every(t=>manifest.entries.filter(e=>e.before.tier===t).length===6)},
    {name:'EXPOSED_PURSE_ONLY',pass:manifest.entries.every(e=>e.after.gold<=e.before.gold&&e.after.reserve>=e.before.reserve&&e.before.gold-e.after.gold===e.plan.cost+e.plan.reserveTopup)},
    {name:'TOTAL_SPEND_CEILING',pass:costs<=canary.maximumTotalPurchaseGold,observed:costs,ceiling:canary.maximumTotalPurchaseGold},
    {name:'EXTRA_UPKEEP_CEILING',pass:extraUpkeep<=canary.maximumTotalExtraUpkeepPerHour,observed:extraUpkeep,ceiling:canary.maximumTotalExtraUpkeepPerHour},
    {name:'EACH_POWER_INCREASE',pass:summary.maximumPowerGrowthPercent<=canary.maximumPowerIncreasePercent,observed:summary.maximumPowerGrowthPercent,ceiling:canary.maximumPowerIncreasePercent},
    {name:'MATCHUP_WIN_RATE_CHANGE',pass:summary.maximumWinRateDropPoints<=canary.maximumWinRateDropPoints,observed:summary.maximumWinRateDropPoints,ceiling:canary.maximumWinRateDropPoints},
    {name:'PACED_GOLD_CHANGE',pass:maximumLootChangePercent<=10,observed:maximumLootChangePercent,ceiling:10},
    {name:'PACED_XP_CHANGE_WITH_AT_LEAST_100_BASELINE',pass:maximumXpChangePercentAtLeast100<=15,observed:maximumXpChangePercentAtLeast100,ceiling:15},
    {name:'PACED_LEVEL_CHANGE',pass:maximumSessionLevelDifference<=1,observed:maximumSessionLevelDifference,ceiling:1},
    {name:'CONSERVATION_AND_VAULTS',pass:pairs.every(s=>s.before.conserved&&s.after.conserved&&s.before.vaultUnchanged&&s.after.vaultUnchanged)}],
  outstanding:['Independent owner review/selection of this experiment and thresholds','Authorized fresh saved-state inspection and exact live UUID manifest (not performed)','Fresh verified backup and actual-data isolated rehearsal','Separately reviewed scoped operator mechanism and exact-target mutation approval; no production executor exists here','Physical-phone navigation audio verification remains separate']};
await writeFile(out+'/gates.json',JSON.stringify(gates,null,2)+'\n');
const lines=['# Exact proposed synthetic canary','','These are logical existing blueprint slots, not production UUIDs or execution approval. Copy-manifest.json separately records the immutable IDs and audit transactions from the disposable PostgreSQL rehearsal. All18 slots are selected before considering the result;13 remain unchanged controls.','','|Slot|Name|Action|Members|Attack before → after|Defense before → after|Purchase|Purse before → after|Reserve before → after|Upkeep/hour before → after|Net/hour before → after|','|---|---|---|---:|---|---|---|---|---|---|---|'];
for(const e of manifest.entries){const p=e.plan,buys=p.purchases.map(b=>`${b.quantity}× ${alpha.items.find(i=>i.id===b.itemId)!.name} (${b.gold})`).join(', ')||'None';lines.push(`|${e.slot}|${e.before.name}|${p.status}|${p.participants}|${p.before.attack.toFixed(2)} → ${p.after.attack.toFixed(2)}|${p.before.defense.toFixed(2)} → ${p.after.defense.toFixed(2)}|${buys}|${e.before.gold} → ${e.after.gold}|${e.before.reserve} → ${e.after.reserve}|${p.oldRate} → ${p.newRate}|${p.propertyNet-p.oldRate} → ${p.netHourly}|`);}
await writeFile(out+'/MANIFEST.md',lines.join('\n')+'\n');
const evidence=['# Per-bot owned equipment and eligible scenarios','','All old paid items remain owned; no sales or skill allocations. Scenario rewards are conditional on an eligible win. A dash means no enumerated winning outcome; there is no fabricated reward. All441 roll pairs per matchup are enumerated. Routine pair percentages remain100/85/70/55/40.'];
for(const e of manifest.entries){
  const gear=(s:typeof e.before)=>s.inventory.map(i=>`${alpha.items.find(a=>a.id===i.itemId)!.name} ×${i.quantity}`).join('; ');
  evidence.push('',`## ${e.slot} — ${e.before.name}`,'',e.plan.reason+'.','',`Owned before: ${gear(e.before)}.`,`Owned after: ${gear(e.after)}.`,'',`Funding: ${e.plan.cost} purchase + ${e.plan.reserveTopup} maintenance top-up, from the existing exposed purse only. Land gross ${e.before.grossIncome}/hour, property upkeep ${e.before.propertyUpkeep}/hour, both unchanged.`,'','|Human profile|Human/bot members|Win % before → after|Gold if won before → after|XP if won before → after|','|---|---|---|---|---|');
  for(const r of rows.filter(r=>r.slot===e.slot))evidence.push(`|${r.profile}|${r.humanArmy}/${r.botArmy}|${r.beforeWinPercent.toFixed(1)} → ${r.afterWinPercent.toFixed(1)}|${r.beforeGoldIfWin??'—'} → ${r.afterGoldIfWin??'—'}|${r.beforeXpIfWin??'—'} → ${r.afterXpIfWin??'—'}|`);
}
await writeFile(out+'/BOT_EVIDENCE.md',evidence.join('\n')+'\n');
const paceLines=['# Pacing at every level1–50','','Two-hour natural-fixture excerpt; all1/2/6-hour natural/equipped10 sessions are in sessions.json. Gold is actual ordinary loot, before healing/upkeep. All purchases belong to the five bot initial conditions only; human formulas and reward policy remain unchanged.','','|Start|Wins/losses before → after|Gold before → after|XP before → after|End level before → after|Paid healing before → after|','|---:|---|---|---|---|---|'];
for(const s of paced.filter(s=>s.options.hours===2&&s.options.loadout==='natural'))paceLines.push(`|${s.options.level}|${s.before.wins}/${s.before.losses} → ${s.after.wins}/${s.after.losses}|${s.before.gold} → ${s.after.gold}|${s.before.xp} → ${s.after.xp}|${s.before.finalLevels[0]} → ${s.after.finalLevels[0]}|${s.before.healingGold} → ${s.after.healingGold}|`);
paceLines.push('','## Six-hour targeted shared-purse pressure','','|Target|Players|Wins/losses|Gold transferred|XP|Health-blocked attempts|End levels|','|---|---:|---|---|---|---|---|');
for(const s of targeted)paceLines.push(`|${s.options.targetSlot}|${s.options.players}|${s.before.wins}/${s.before.losses} → ${s.after.wins}/${s.after.losses}|${s.before.gold} → ${s.after.gold}|${s.before.xp} → ${s.after.xp}|${s.before.blocked.targetHealth} → ${s.after.blocked.targetHealth}|${s.before.finalLevels.join(',')} → ${s.after.finalLevels.join(',')}|`);
paceLines.push('','## Seven calendar days, one/two active hours daily','','|Start|Hours/day|Active hours|Gold before → after|XP before → after|End level before → after|','|---:|---:|---|---|---|---|');
for(const s of daily)paceLines.push(`|${s.options.level}|${s.options.dailySessionHours}|${s.before.activeHours}|${s.before.gold} → ${s.after.gold}|${s.before.xp} → ${s.after.xp}|${s.before.finalLevels[0]} → ${s.after.finalLevels[0]}|`);
await writeFile(out+'/PACING.md',paceLines.join('\n')+'\n');
console.log(JSON.stringify(summary));
