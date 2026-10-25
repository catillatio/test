import {readFileSync} from 'node:fs';import {deepFreeze} from './compatibility-rules.js';import type {Sql} from './db.js';import {transactionMemo} from './db.js';
import {definitionDigest} from './expansion-content.js';
import {activeArmy} from './alpha-rules.js';import {resolveArmy} from './compatibility-rules.js';
export interface ExpansionBot {characterId:string;accountId:string;populationKey:string;username:string;name:string;level:number;tier:string;variant:number;calling:string;members:number;skillPoints:number;training:number;health:number;mana:number;spirit:number;equipment:{itemId:string;quantity:number;unitCost:number}[];land:{propertyId:string;prices:number[]};equipmentCost:number;landCost:number;upkeep:number;propertyNet:number;reserve:number;wallet:number;capital:number;}
export const expansionBots=deepFreeze(JSON.parse(readFileSync(new URL('../rulesets/level100-rivals-1/rules.json',import.meta.url),'utf8')) as {id:string;strengthMultiplier:number;reviewStatus:string;activationDefault:false;catalogId:string;expectedOriginalBots:number;expectedAddedBots:number;expectedTotalBots:number;entries:ExpansionBot[]});
export const expansionBotEconomy=deepFreeze({id:'living-expansion-economy-1',reviewStatus:'pending',maximumPopulation:900,maximumBotsPerTick:10,maximumCostMode:'highest-unlocked-shop-price',pursePercent:5,maximumUpkeepPercent:70,maximumEquipmentLevelLag:20,minimumLandGainPermille:5,slotsPerDecision:144});
export const expansionBotCombat=deepFreeze({id:'living-expansion-duels-1',reviewStatus:'pending',maximumPopulation:900,maximumBotsPerTick:10,slotsPerDecision:144,initiationsPerUtcDay:2,incomingPerUtcDay:4,incomingPerHour:1});
const key=Symbol('expansion-cohort');
export function installedCohort(sql:Sql):Promise<{active:boolean;autonomyMode:'paused'|'purchases-only'|'enabled';manifestId:string;manifestDigest:string;legacyDigest:string}|null>{return transactionMemo(sql,key,async()=>{
 if(!(await sql.query("SELECT to_regclass('expansion_bot_cohorts') AS installed")).rows[0]?.installed)return null;
 const row=(await sql.query("SELECT c.manifest_id,c.manifest_digest,c.legacy_digest,EXISTS(SELECT 1 FROM expansion_bot_activations a WHERE a.manifest_id=c.manifest_id) AS active,COALESCE((SELECT mode FROM expansion_bot_autonomy_events e WHERE e.manifest_id=c.manifest_id ORDER BY sequence DESC LIMIT 1),'paused') AS autonomy_mode FROM expansion_bot_cohorts c")).rows[0];
 if(!row)return null;if(row.manifest_id!==expansionBots.id||row.manifest_digest!==definitionDigest(expansionBots))throw new Error('Unknown population manifest.');
 if(!['paused','purchases-only','enabled'].includes(row.autonomy_mode))throw new Error('Unknown autonomy policy.');
 return {active:row.active,autonomyMode:row.autonomy_mode,manifestId:row.manifest_id,manifestDigest:row.manifest_digest,legacyDigest:row.legacy_digest};
});}
export async function cohortMembers(sql:Sql,ids:string[]){const cohort=await installedCohort(sql);if(!cohort?.active)return new Map<string,number>();return new Map((await sql.query('SELECT character_id,members FROM expansion_bot_members WHERE character_id=ANY($1::uuid[]) AND manifest_id=$2',[ids,expansionBots.id])).rows.map(r=>[String(r.character_id),Number(r.members)]));}
export const expansionBotIds=new Set(expansionBots.entries.map(e=>e.characterId));
export function botArmy(level:number,units:number,allies:number,legacyFloor:number,contingent?:number){
 if(contingent!==undefined)return resolveArmy(level,units+contingent,allies,legacyFloor,'army-five-per-level-1');
 const p=activeArmy(level,Math.min(units,9),0,Math.min(legacyFloor,10));return {capacity:Math.min(10,p.capacity),participants:Math.min(10,p.participants),total:Math.min(10,p.total)};
}
// Old actors retain their original salts, five-actor budget and receipt IDs.
export function partitionBotSchedule(ids:string[]){const legacy=ids.filter(id=>!expansionBotIds.has(id)),added=ids.filter(id=>expansionBotIds.has(id));if(new Set(ids).size!==ids.length||legacy.length>450||added.length&&(added.length!==450||legacy.length!==450))throw new Error('Unexpected scheduled population.');return {legacy,added};}
