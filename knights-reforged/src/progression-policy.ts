import {alpha,levelRequirement} from './alpha-rules.js';
import {compatibility,safeCount,type ProgressionPolicy} from './compatibility-rules.js';
import type {Sql} from './db.js';
import {realmPolicy} from './realm-policy.js';

export interface ProgressionEpoch {policyId:ProgressionPolicy;boundaryLevel:number;boundaryRequirement:number;startingProgress:number;}
export function progressionRequirement(level:number,id:ProgressionPolicy=compatibility.active.progression){
 if(!Object.hasOwn(compatibility.progression,id))throw new RangeError('Unknown progression policy.');
 const rule=compatibility.progression[id];return safeCount(levelRequirement(level)+Math.max(0,level-rule.afterLevel)*rule.increment,1,2147483647);
}
// Pure preparation only. E2a neither creates epochs nor activates a policy.
export function prepareProgressionEpoch(level:number,progress:number,policyId:ProgressionPolicy):ProgressionEpoch {
 const boundaryRequirement=levelRequirement(level);safeCount(progress,0,boundaryRequirement-1);progressionRequirement(level,policyId);
 return Object.freeze({policyId,boundaryLevel:level,boundaryRequirement,startingProgress:progress});
}
export function requirementForEpoch(level:number,epoch?:ProgressionEpoch){
 if(!epoch)return progressionRequirement(level);
 progressionRequirement(epoch.boundaryLevel,epoch.policyId);
 if(epoch.boundaryRequirement!==levelRequirement(epoch.boundaryLevel))throw new RangeError('Invalid frozen XP entitlement.');
 safeCount(epoch.startingProgress,0,epoch.boundaryRequirement-1);if(level<epoch.boundaryLevel)throw new RangeError('Progression epoch precedes attained level.');
 return level===epoch.boundaryLevel?epoch.boundaryRequirement:progressionRequirement(level,epoch.policyId);
}
export async function readProgressionEpoch(sql:Sql,characterId:string,policy?:ProgressionPolicy):Promise<ProgressionEpoch|undefined>{
 if(!policy){const world=await realmPolicy(sql);policy=world.progressionPolicy;if(world.expanded&&(await sql.query('SELECT 1 FROM development_bots WHERE character_id=$1',[characterId])).rows.length)policy='xp-legacy-1';}
 progressionRequirement(1,policy);
 // Legacy execution never initializes or consumes a future epoch. Compatible
 // binaries can read explicit future metadata, but no runtime switch is exposed.
 if(policy==='xp-legacy-1')return undefined;
 const row=(await sql.query(`SELECT policy_id AS "policyId",boundary_level AS "boundaryLevel",boundary_requirement AS "boundaryRequirement",starting_progress AS "startingProgress"
  FROM character_progression_epochs WHERE character_id=$1`,[characterId])).rows[0] as ProgressionEpoch|undefined;
 if(!row||row.policyId!==policy)throw new Error('A compatible progression cutover is required.');
 requirementForEpoch(row.boundaryLevel,row);return row;
}
export function advanceProgression(level:number,progress:number,award:number,epoch?:ProgressionEpoch){
 safeCount(progress,0,requirementForEpoch(level,epoch)-1);safeCount(award,0,1000000);let remaining=progress+award;const before=level;
 while(remaining>=requirementForEpoch(level,epoch)){remaining-=requirementForEpoch(level,epoch);level++;}
 return {level,progress:remaining,points:(level-before)*alpha.progression.pointsPerLevel,gained:level-before};
}
