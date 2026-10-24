// Research only. Never imported by src/, never opens a database or installs a
// reward policy. Inputs are illustrative purses/power ratios, not future items.
import {mkdir,writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {alpha,areRivals,levelRequirement,resolveAlphaCombat,advanceLevel} from '../src/alpha-rules.js';
import {gameplay} from '../src/gameplay-rules.js';import {victoryExperience47} from '../src/game-feel-rules.js';
import {finalizedBountyFee,bountyRules} from '../src/refinement-rules.js';
import {recoverySeconds} from '../src/strategy-rules.js';
export function proposedDefense(gold:number,defenderLevel:number,attackerLevel:number,victory:number,ratio=1,allied=false){
 const eligible=areRivals(defenderLevel,attackerLevel)&&ratio>=gameplay.victoryXp.minimumStrengthRatio&&!allied;
 const repeat=gameplay.loot.victoryPercentages[Math.min(victory-1,4)]!;
 const amount=eligible?Math.floor(Math.min(Math.floor(gameplay.loot.maximum/3),Math.floor(gold/100))*repeat/100):0;
 const xp=areRivals(defenderLevel,attackerLevel)?victoryExperience47(defenderLevel,attackerLevel,victory<=gameplay.victoryXp.humanFullVictoriesPerTarget,100,100*ratio).amount:0;
 return {amount,xp,eligible,repeat,attackerAfter:gold-amount};
}
export function defenseFarm(level:number,hours:number,alts:number,healing:boolean){
 const attackers=Array.from({length:alts},()=>({wallet:100000,health:100,spirit:3,healthAt:0,spiritAt:0,wins:0}));
 let defenderWallet=0,defenderHealth=100,defenderHealthAt=0,defenderLevel=level,progress=0,battles=0,spent=0,xp=0;
 const spiritSeconds=recoverySeconds('Freeblade','spirit',alpha.resources.spiritSeconds);
 for(let time=0;time<hours*3600;time+=30){
  const hpTicks=Math.floor((time-defenderHealthAt)/alpha.resources.healthSeconds);if(hpTicks){defenderHealth=Math.min(100,defenderHealth+hpTicks*alpha.resources.healthAmount);defenderHealthAt+=hpTicks*alpha.resources.healthSeconds;}
  for(const a of attackers){
   const ht=Math.floor((time-a.healthAt)/alpha.resources.healthSeconds);if(ht){a.health=Math.min(100,a.health+ht*alpha.resources.healthAmount);a.healthAt+=ht*alpha.resources.healthSeconds;}
   const st=Math.floor((time-a.spiritAt)/spiritSeconds);if(st){a.spirit=Math.min(3,a.spirit+st);a.spiritAt+=st*spiritSeconds;}
   if(!areRivals(level,defenderLevel)||a.spirit<1||defenderHealth<=0)continue;
   if(a.health<alpha.combat.minimumHealth&&healing){const cost=(100-a.health)*Math.ceil(level/10);if(a.wallet>=cost){a.wallet-=cost;spent+=cost;a.health=100;a.healthAt=time;}}
   if(a.health<alpha.combat.minimumHealth)continue;
   // Equal, unmodified rolls tie in the defender's favor. Equal normalized
   // powers are held constant as a favorable-outcome collusion stress model.
   const result=resolveAlphaCombat({attack:100,health:a.health,maxHealth:100,gold:a.wallet},{defense:100,health:defenderHealth,maxHealth:100,gold:defenderWallet},0,0);
   if(result.outcome!=='defender_win')throw new Error('Invalid research outcome.');
   const reward=proposedDefense(a.wallet,defenderLevel,level,++a.wins);a.wallet=reward.attackerAfter;defenderWallet+=reward.amount;xp+=reward.xp;
   const advanced=advanceLevel(defenderLevel,progress,reward.xp);defenderLevel=advanced.level;progress=advanced.progress;
   // Existing defensive XP never refills resources, including on level-up.
   a.health=result.attackerHealthAfter;defenderHealth=result.defenderHealthAfter;a.spirit--;battles++;
  }
 }
 const remaining=attackers.reduce((sum,a)=>sum+a.wallet,0);if(remaining+defenderWallet+spent!==100000*alts)throw new Error('Research gold conservation failed.');
 return {level,hours,alts,healing,battles,xp,defenderLevel,defenderWallet,attackerWallets:remaining,healingSink:spent,initialGold:100000*alts,defenderHealth};
}
export async function writeReview(){
 const examples=[];for(const level of [8,17,25,50,100,200])for(const purse of [0,1000,100000,1000000])for(const ratio of [0.2,1,1.2]){
  const reward=proposedDefense(purse,level,level,1,ratio);examples.push({level,purse,ratio,...reward,requirement:levelRequirement(level)});
 }
 const paced=[];for(const level of [8,17,50,100,200])for(const hours of [1,6])for(const alts of [1,5])for(const healing of [false,true])paced.push(defenseFarm(level,hours,alts,healing));
 const probabilities=[0.2,0.75,1,1.2,2].map(ratio=>{let wins=0,total=0;for(let a=-alpha.combat.variation;a<=alpha.combat.variation;a++)for(let d=-alpha.combat.variation;d<=alpha.combat.variation;d++){
  total++;if(resolveAlphaCombat({attack:100*ratio,health:100,maxHealth:100,gold:0},{defense:100,health:100,maxHealth:100,gold:0},a,d).outcome==='defender_win')wins++;}
  return {attackerToDefenderPower:ratio,defensiveWins:wins,outcomes:total};});
 const bountyExamples=[1,1000,10000].map(principal=>{const fee=finalizedBountyFee(principal);return {principal,fee,initialSponsor:20000,sponsorAfterPlacement:20000-principal-fee,escrow:principal,claimed:principal,expiredRefund:principal,burnedFee:fee};});
 const output={researchOnly:true,runtimePolicyInstalled:false,baseGoldPercent:1,goldCap:5000,xpPolicy:'existing defensive XP; no additional award',examples,paced,probabilities,bountyExamples};
 await mkdir('docs/phase51d',{recursive:true});await writeFile('docs/phase51d/combat-bounty-model.json',JSON.stringify(output,null,2)+'\n');
 const sampleRows=[8,17,25,50,100,200].map(level=>{const poor=proposedDefense(1000,level,level,1),rich=proposedDefense(1000000,level,level,1),repeat=proposedDefense(1000000,level,level,6),weak=proposedDefense(1000000,level,level,1,0.2);
  return `| ${level} | ${levelRequirement(level)} | ${poor.amount} | ${rich.amount} | ${repeat.amount} | ${poor.xp} | ${weak.amount} / ${weak.xp} |`;}).join('\n');
 const pacedRows=paced.filter(p=>p.level===17||p.level===100||p.level===200).map(p=>`| ${p.level} | ${p.hours} | ${p.alts} | ${p.healing?'yes':'no'} | ${p.battles} | ${p.defenderWallet} | ${p.xp} | ${p.defenderLevel} | ${p.attackerWallets} | ${p.healingSink} |`).join('\n');
 const text=`# Combat and bounty decisions — research only

No combat, rewards, bounty rules, catalogs, bot flags or production data were changed. Reproduce with \`npx tsx scripts/phase51d-review.ts\`; detailed numeric cases are in [the generated model](docs/phase51d/combat-bounty-model.json).

## Current implementation

[Combat](src/combat.ts) already gives a successful **human defender XP**, using \`victoryExperience47(defenderLevel,attackerLevel,fullWins<3,defenderDefense,attackerAttack)\`. Three full defensive rewards per attacker in a rolling 24-hour window are followed by 1 XP. Defensive level-ups do **not** refill resources. Gold goes only to an attacking winner; defensive gold is currently zero. Attacker victories take 3% of exposed gold, capped at 15,000 before fixed-pair 100/75/50/25/10% reductions. Bot attackers/targets retain the approved bot policy: 65% difficulty XP and 100/85/70/55/40 repeats; this report does not replace it.

Stored wallets and saved combat identities are authoritative. Vault and maintenance reserves/retained treasury are not loot. Normal level range, positive defender Health, at least 20 attacker Health and 1 Stamina remain mandatory; no bot may initiate an attack on a human. Equal rolled powers favor the defender. Exact variation outcomes: ${probabilities.map(p=>p.attackerToDefenderPower+': '+p.defensiveWins+'/'+p.outcomes).join('; ')}.

## Recommended future defense model — needs separate approval

Keep existing defensive XP; **do not add a second XP award**. For ordinary eligible human-versus-human defensive victories only, consider gold = floor(min(5,000, floor(attacker exposed wallet / 100)) × pairMultiplier / 100). This is one third of the ordinary attack percentage/cap because defending costs no Stamina. Use the existing fixed pair-window percentages, counting wins by the actual winner against the loser in either battle orientation. Never mutate historical sequence rows. Zero gold, ineligible levels, allies or a trivial challenger (attack/defense < 0.35) produce zero proposed defensive gold. Keep existing legitimate zero-gold defensive XP; do not make XP depend on wealth.

Every gold unit must be debited from the locked attacker's actual post-upkeep wallet and credited through existing overflow-safe creditGold in the same transaction/receipt as the saved outcome. No minting, Vault access, reserve raid, refund, extra fee or bounty duplication. Continue to award Kills/Deaths only on valid bounty claims. Do not grant a passive defender an automatic bounty claim: current rules require the claimant's finishing attack. Exclude bots from an initial rollout; reviewing bot-versus-bot transfers or future bot-versus-human combat is a separate decision. Bot-initiated human attacks remain prohibited.

| Level | Current next-level XP | Poor purse 1,000: gold | Wealthy purse 1,000,000: gold | Sixth win: gold | Existing matched defensive XP | Trivial challenger: gold / XP |
|---|---:|---:|---:|---:|---:|---:|
${sampleRows}

Example: a 100,000-gold attacker loses the first matched battle: proposed transfer 1,000; attacker retains 99,000; a defender carrying 500 reaches 1,500. Total remains 100,500. Vault balances are unchanged. At zero carried gold the transfer is zero. A level-8 versus level-100 attack remains forbidden regardless of any bounty or either purse. The 10% repeat gold floor conserves currency but still permits voluntary feeding; existing per-pair XP limits, real Stamina/Health costs and eligibility matter. Multiple accounts multiply independent XP budgets: do not mistake gold conservation for complete collusion prevention.

## Paced collusion stress model

Synthetic equal-power/tied-roll losses (a deliberately favorable defensive-farming stress case), 30-second opportunities, existing Barbarian Stamina recovery, Health recovery, starting Health 100/Stamina 3, optional real-cost healing and unchanged defensive level progression. Each attacker starts with 100,000 exposed gold; no Land income or Vault movement is generated. Attackers gain no XP from losses. Defender level-ups never refill Health. Normal level gaps eventually stop stale-level attackers. Power/Health maxima are held constant rather than inventing level-100/200 equipment. These are stress-model assumptions, **not a live progression forecast**.

| Start level | Hours | Attacker accounts | Paid healing | Battles | Defender gold | Existing XP | Defender level | Attackers' remaining gold | Healing sink |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|
${pacedRows}

Each row verifies attacker wallets + defender wallet + healing sink = initial money. Repeated/allied/trivial/disabled-account/replay and multi-account cases need a reviewed immutable reward policy before any implementation. IP/device fingerprinting, new daily global caps or an automatic collusion penalty are not introduced. Land stays the source of sustainable new gold: defense redistributes existing purses and cannot replace it as an inflation source. New upkeep automation may earmark legitimate earnings before a battle, so proposal inputs must use actual settled purses.

## Level-independent bounty placement

[Current placement](src/bounties.ts) and [finalized bounds](src/refinement-rules.ts): sponsor level ${bountyRules.minimumLevel} plus ${bountyRules.minimumQuests} quests; human targets have the same progress floor, targets must currently be in the sponsor's normal rival range, no self/ally targets, one active contract per target, 50 placed contracts per target/rolling day, 1–10,000 principal, 10% fee (minimum 1), 24-hour expiry and sponsor cancellation after one hour. Bot targets require the existing separate flag and active identity. Already-zero-Health targets can be listed but old damage/history never claims a new contract.

Recommendation: remove **only the sponsor-to-target relative-level comparison for placement**, after separate approval. Keep sponsor qualification and target onboarding protection (level 3/five quests), all escrow/fee/visibility/anti-ally rules, durations and limits. This means any *progress-eligible* target level, not exposing level-1 beginners. A truly unrestricted target floor is a separate owner decision. A level-8 sponsor could fund a level-100 target, but only a qualified, appropriately matched level-100-range claimant could attack/claim; a level-200 sponsor cannot gain permission to attack a level-3 target by paying.

Claiming stays unchanged: qualifying claimant, normal claimant/target rival range, no sponsor/self/ally claim, newly resolved attacking finisher with saved positive-before/zero-after Health and spent Stamina, inside contract creation/expiry, and one atomic active-to-claimed transition. Preserve the advisory escrow lock, deterministic character locks, target row lock, command idempotency and overflow-safe credits. Never turn a prior knockout into a retroactive claim. Canceled/expired contracts return principal once, not the placement fee. Simultaneous claims/refunds cannot both win the same status transition.

| Principal | Fee burned | Sponsor after placement (start 20,000) | Escrow | Claimant payout OR sponsor expiry refund |
|---|---:|---:|---:|---:|
${bountyExamples.map(b=>`| ${b.principal} | ${b.fee} | ${b.sponsorAfterPlacement} | ${b.escrow} | ${b.principal} |`).join('\n')}

For 1,000 principal: sponsor 20,000 → 18,900; escrow 1,000; fee sink 100. Claim releases exactly 1,000 to claimant; expiry/cancellation releases exactly 1,000 to sponsor. Those alternatives are mutually exclusive. Saved historical bounties/events keep original rulesets and amounts. No policy change is implemented here.

## Level-100/200 and 900-bot readiness

The existing uncapped XP requirement supports the numeric levels above; the 300 base-XP cap makes defense a diminishing fraction of high-level progression. Do not invent final expansion equipment/Land stats from this normalized model. Gold caps/percentages must remain bounded against larger wallets and overflow must stay retained rather than lost. Current human participation cap 101 and bot cap 10 remain unchanged; larger/stronger armies need their own reviewed balance work.

Moving from 450 to up to 900 bots would require a separately approved population migration, preserved old IDs, scheduling/load checks and strict release-count updates. Do not relax 450-bot verification now. Keep bounded batch processing/indexed event queries; do not simulate all N² rival pairs in ordinary requests. Placement range removal must not alter combat eligibility, reveal private balances, notify global bot activity or allow autonomous human targeting.

Owner decisions before future implementation: accept/reject the optional 1%/5,000 defense gold model, assess multi-account XP budgets, choose whether target onboarding protection stays, and explicitly approve any bot-defense participation. Required future tests: concurrent loser-wallet races, receipt replay, zero/overflow wallets, Vault/reserve invariance, pair-window boundaries, allied/alt farming, resource/level-up accounting, cross-level placement with unchanged attack restrictions, finishing-proof age, zero-Health targets, duplicate claim/refund races and 450/900-population compatibility. This Phase 5.1D PR installs none of these combat/bounty proposals.
`;
 await writeFile('COMBAT_BOUNTY_DECISIONS.md',text);
 console.log('Research model written; no database, gameplay policy or production operation performed.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))await writeReview();
