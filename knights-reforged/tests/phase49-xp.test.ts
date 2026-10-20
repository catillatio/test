import test from 'node:test';
import assert from 'node:assert/strict';
import {scaleBotExperience} from '../src/bot-experience.js';
import {simulateBotCombat} from '../scripts/simulation/bot-combat.js';
test('XP candidate scaling floors before pair reduction and retains the victory minimum at every boundary',()=>{
 for(const full of[1,2,3,4,5,7,47,105,186,240,300])for(const percent of[100,65,40])for(const pair of[100,85,70,55,40]){
  const scaled=Math.max(1,Math.floor(full*percent/100));
  assert.deepEqual(scaleBotExperience(full,percent,pair),{scaledFullAmount:scaled,amount:Math.max(1,Math.floor(scaled*pair/100))});
 }
 assert.deepEqual(scaleBotExperience(47,65,85),{scaledFullAmount:30,amount:25});
 assert.equal(scaleBotExperience(7,65,85).amount,3,'policy scaling is floored before the pair floor, rather than after a combined percentage');
 for(const args of[[0,65,100],[NaN,65,100],[47,66,100],[47,65,10]])assert.throws(()=>scaleBotExperience(args[0]!,args[1]!,args[2]!),RangeError);
});
test('candidate comparisons preserve the identical first battle, gold transfer and difficulty while changing only XP',()=>{
 const runs=([100,65,40] as const).map(botXpPercent=>simulateBotCombat({level:17,hours:1,mode:'varied',policy:'phase49',botXpPercent,heal:true}));
 for(const s of runs){const first=s.samples[0]!;assert.equal(first.gold,runs[0]!.samples[0]!.gold);assert.equal(first.target,runs[0]!.samples[0]!.target);assert.equal(first.attack,runs[0]!.samples[0]!.attack);assert.equal(first.defense,runs[0]!.samples[0]!.defense);assert.ok(s.conserved&&s.vaultUnchanged);assert.equal(s.wins+s.losses,3+s.naturalSpirit+s.refillSpirit-s.finalSpirit[0]!);}
 assert.ok(Number(runs[0]!.samples[0]!.xp)>Number(runs[1]!.samples[0]!.xp));assert.ok(Number(runs[1]!.samples[0]!.xp)>Number(runs[2]!.samples[0]!.xp));
});
test('daily sessions stop actions offline, naturally recover resources, and preserve finances and pair state across reconstruction',()=>{
 const options={level:17,hours:25,dailySessionHours:1,mode:'varied' as const,policy:'phase49' as const,botXpPercent:65 as const,heal:true};
 const daily=simulateBotCombat(options),restart=simulateBotCombat({...options,restartAtHour:12});
 assert.equal(daily.activeHours,2);assert.equal(daily.sessionStarts.length,2);assert.equal(daily.sessionStarts[1]!.hour,24);assert.equal(daily.sessionStarts[1]!.health,100);assert.equal(daily.sessionStarts[1]!.spirit,3);
 assert.equal(daily.wins+daily.losses,3+daily.naturalSpirit+daily.refillSpirit-daily.finalSpirit[0]!);
 for(const key of['goldTransferred','xpAwarded','wins','losses','generatedPropertyGold','upkeepPaid','endingCombined','naturalSpirit','refillSpirit'] as const)assert.equal(daily[key],restart[key],key);
 assert.deepEqual(daily.sessionStarts,restart.sessionStarts);assert.ok(daily.conserved);
 for(const sample of[...daily.samples,...daily.lastSamples])assert.ok(Number(sample.minute)%1440<60);
 assert.throws(()=>simulateBotCombat({...options,dailySessionHours:25}));
});
