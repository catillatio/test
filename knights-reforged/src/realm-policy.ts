import type {Sql} from './db.js';import {transactionMemo,clearTransactionMemo} from './db.js';
import {compatibility,type ArmyPolicy,type InventoryPolicy,type ProgressionPolicy} from './compatibility-rules.js';
import {alpha} from './alpha-rules.js';import {expandedContent,expansionEngine,definitionDigest,questRarities,expansionArtwork} from './expansion-content.js';
export interface RealmPolicy {expanded:boolean;catalogId:string;armyPolicy:ArmyPolicy;inventoryPolicy:InventoryPolicy;progressionPolicy:ProgressionPolicy;rareDrops:boolean;activationId:string|null;}
export const legacyRealm:Readonly<RealmPolicy>=Object.freeze({expanded:false,catalogId:alpha.id,armyPolicy:compatibility.active.army,inventoryPolicy:compatibility.active.inventory,progressionPolicy:compatibility.active.progression,rareDrops:false,activationId:null});
const key=Symbol('realm-policy');
export function invalidateRealmPolicy(sql:Sql){clearTransactionMemo(sql,key);}
export function realmPolicy(sql:Sql):Promise<Readonly<RealmPolicy>>{return transactionMemo(sql,key,async()=>{
 // Historical migration fixtures and pre-install readers remain legacy. Normal
 // startup separately requires the installed immutable definitions/schema.
 const installed=(await sql.query("SELECT to_regclass('realm_expansion_state') AS installed")).rows[0]?.installed;if(!installed)return legacyRealm;
 const row=(await sql.query('SELECT * FROM realm_expansion_state WHERE singleton=true')).rows[0];if(!row)return legacyRealm;
 if(row.policy_id!==expansionEngine.id||row.catalog_id!==expandedContent.id||row.catalog_digest!==definitionDigest(expandedContent)||row.writer_version!==expansionEngine.writer||row.artwork_digest!==definitionDigest(expansionArtwork))throw new Error('Invalid expansion activation identity.');
 if(row.rarity_policy_id!==null&&row.rarity_policy_id!==questRarities.id)throw new Error('Invalid rare reward activation.');
 return Object.freeze({expanded:true,catalogId:expandedContent.id,armyPolicy:expansionEngine.armyPolicy,inventoryPolicy:expansionEngine.inventoryPolicy,progressionPolicy:expansionEngine.progressionPolicy,rareDrops:row.rarity_policy_id===questRarities.id,activationId:row.id});
});}
