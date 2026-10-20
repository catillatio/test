interface RewardSummary {
 botRewardEligibilityPolicy?:string|null;outcome?:string;loot?:number;rewarded?:boolean;
 lootDetails?:{multiplier?:number}|null;xpDetails?:{trivial?:boolean;reason?:string}|null;defenderXpDetails?:{trivial?:boolean;reason?:string}|null;
}
// Presentation is pinned to the recorded policy, not current financial rules.
// Historical/human repetition summaries stay compatible. Where recorded, weak
// opponent XP is explained separately; no current inventory or hidden numbers.
export function battleRewardNotes(battle:RewardSummary,viewerAttacking:boolean){
 if(battle.botRewardEligibilityPolicy==='bot-combat-rewards-1'){
  if(!viewerAttacking||battle.outcome!=='attacker_win')return [];
  const notes:string[]=[];
  if((battle.lootDetails?.multiplier??100)<100)notes.push('Reduced rewards from repeated battles with this rival.');
  if(battle.xpDetails?.trivial)notes.push('Less experience against a much weaker opponent.');
  if(battle.loot===0)notes.push('This rival had too little unprotected gold to steal.');
  return notes;
 }
 const reduced=viewerAttacking?(battle.rewarded===false||(battle.lootDetails?.multiplier??100)<100||battle.xpDetails?.reason==='repeat_budget'):battle.defenderXpDetails?.reason==='repeat_budget';
 const notes=reduced?['Reduced rewards from repeated battles.']:[];
 if((viewerAttacking?battle.xpDetails:battle.defenderXpDetails)?.trivial)notes.push('Less experience against a much weaker opponent.');
 return notes;
}
