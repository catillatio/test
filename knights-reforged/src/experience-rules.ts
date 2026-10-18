import {alpha} from './alpha-rules.js';
export type AchievementMetric='level'|'wins'|'bounties'|'quests'|'landPurchased'|'landOwned'|'netIncome'|'recruits';
export interface AchievementDefinition{id:string;name:string;category:string;metric:AchievementMetric;threshold:number;rank:number;emblem:string;description:string;}
const entry=(id:string,name:string,category:string,metric:AchievementMetric,threshold:number,rank:number,emblem:string,description:string):AchievementDefinition=>({id,name,category,metric,threshold,rank,emblem,description});
export const experienceRules={id:'player-experience-1',provenance:'Kingdom Come cosmetic achievements and tutorial; reference-inspired presentation, not recovered Storm8 rules.',
 achievements:[
 ...[5,10,25,50].map((level,index)=>entry('level-'+level,['First Ascendant','Knight of Renown','Realm Veteran','Legend of the Realm'][index]!,'Character','level',level,index+1,'crown','Reach character level '+level+'.')),
 entry('content-summit','Crown of the Current Age','Character','level',alpha.content!.maxContentLevel,5,'crown','Reach the current authored content summit, level '+alpha.content!.maxContentLevel+'. Character progression has no hard level cap.'),
 ...[1,10,100,1000].map((n,i)=>entry('victories-'+n,['First Triumph','Proven in Battle','Field Commander','Thousandfold Victor'][i]!,'Combat','wins',n,i+1,'swords','Win '+n+' battle'+(n===1?'':'s')+'.')),
 ...[1,10].map((n,i)=>entry('bounties-'+n,i?'Royal Bounty Hunter':'The Finishing Blade','Combat','bounties',n,i+1,'shield','Successfully claim '+n+' funded bount'+(n===1?'y':'ies')+'.')),
 ...[1,25,100,500].map((n,i)=>entry('quests-'+n,['A First Deed','Village Champion','Tireless Adventurer','Keeper of Legends'][i]!,'Quests','quests',n,i+1,'scroll','Complete '+n+' repeatable quest'+(n===1?'':'s')+'.')),
 entry('first-land','Roots in the Realm','Economy','landPurchased',1,1,'castle','Purchase your first property. Verified purchases still count after a sale.'),
 ...[10,100].map((n,i)=>entry('land-'+n,i?'Sovereign Estate':'Growing Domain','Economy','landOwned',n,i+2,'castle','Own '+n+' plots of Land at the same time.')),
 ...[1000,10000].map((n,i)=>entry('income-'+n,i?'Golden Kingdom':'Prosperous Realm','Economy','netIncome',n,i+3,'castle','Reach '+n.toLocaleString('en')+' net gold per hour after active upkeep.')),
 ...[1,5,10].map((n,i)=>entry('army-'+n,['First Companion','Banner of Fellowship','A United Company'][i]!,'Social','recruits',n,i+1,'shield','Retain '+n+' recruited mercenar'+(n===1?'y or accepted ally':'ies or accepted allies')+'.')),
 ],tutorial:[
 {id:'quest',name:'Your first deed',help:'Complete Patrol the border in Quests. It costs Mana and can be repeated.',href:'/game/quests'},
 {id:'rewards',name:'Gold and experience',help:'Quest rewards enter your purse and advance your level. Review the reward panel after a quest.',href:'/game/quests'},
 {id:'equipment',name:'Arm your company',help:'Buy a weapon, armor piece or spell. Owned quantities determine how many soldiers can use it.',href:'/game/armory'},
 {id:'automatic',name:'Your best equipment, automatically',help:'There is no manual loadout to maintain. Your army chooses the best available attack gear when attacking and defense gear when defending.',href:'/game/armory'},
 {id:'attack',name:'Challenge a rival',help:'Choose an eligible nearby-level rival. Each attack spends Spirit; check their Health, army and equipment.',href:'/game/battle'},
 {id:'victory',name:'Savour a victory',help:'Win a battle and review gold, XP and damage. Vault savings cannot be stolen; repeated victories have reduced rewards.',href:'/game/battle'},
 {id:'land',name:'Put down roots',help:'Open Land from Home. Properties earn income every hour, including offline; upkeep and a partial first period are shown separately.',href:'/game/home'},
 {id:'skills',name:'Shape your character',help:'Level up and spend a skill point in Profile → Skills. Health, Mana, Spirit, Attack and Defense support different strategies.',href:'/game/profile?tab=skills'},
 ]};
