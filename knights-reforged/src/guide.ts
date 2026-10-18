// Presentation only: preserve the installed player-experience-1 ruleset and all
// old completion evidence. These eight familiar lessons grant no game rewards.
export const guideSteps=[
 {id:'quest',name:'Complete Your First Quest',help:'Quests earn gold and experience. Tap Show Me, then Do It on Patrol the border.',href:'/game/quests?area=all#quest-border-patrol',screen:'quests',target:'quest-border-patrol'},
 {id:'rewards',name:'See What You Earned',help:'After a quest, look for your gold and experience rewards. Experience helps you reach the next level.',href:'/game/quests?area=all#quest-border-patrol',screen:'quests',target:'quest-border-patrol'},
 {id:'equipment',name:'Buy Equipment',help:'Better equipment makes your army stronger. Tap Show Me, then Buy on Squire\'s Blade if you need a weapon.',href:'/game/armory?category=weapon#item-squires-blade',screen:'armory',target:'item-squires-blade'},
 {id:'automatic',name:'Your Army Uses Your Equipment',help:'You do not need to equip items by hand. Your army automatically uses its best weapons, armor and spells.',href:'/game/armory#automatic-loadout',screen:'armory',target:'automatic-loadout'},
 {id:'attack',name:'Challenge a Rival',help:'Each attack uses Spirit. Choose a nearby-level rival, check their Health and equipment, then tap Attack.',href:'/game/battle#rival-list',screen:'battle',target:'rival-list'},
 {id:'victory',name:'Enjoy Your Victory',help:'A win can earn gold and experience. Open the battle report to see your rewards and each army\'s equipment.',href:'/game/profile?tab=battles#battle-tales',screen:'profile',target:'battle-tales'},
 {id:'land',name:'Put Down Roots',help:'Land earns gold over time, even while you are away. Tap Show Me, then Buy on Smallholding if you need your first property.',href:'/game/land#property-smallholding',screen:'land',target:'property-smallholding'},
 {id:'skills',name:'Make Your Character Stronger',help:'Leveling up gives you skill points. Tap Show Me to choose an improvement. You can save points and spend them later.',href:'/game/profile?tab=skills#skills',screen:'profile',target:'skills'},
] as const;
