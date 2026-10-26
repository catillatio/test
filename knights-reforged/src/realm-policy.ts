import {equipmentPresentation,presentationDigest} from './equipment-presentation.js';
import {readRarityAuthorization} from './rarity-activation.js';
import {knownArtworkDigest} from './expansion-artwork.js';
import type {Sql} from './db.js';import {transactionMemo,clearTransactionMemo} from './db.js';
import {compatibility,type ArmyPolicy,type InventoryPolicy,type ProgressionPolicy} from './compatibility-rules.js';
import {alpha} from './alpha-rules.js';import {expandedContent,expansionEngine,definitionDigest,questRarities} from './expansion-content.js';
export interface RealmPolicy {expanded:boolean;presentationId?:string;catalogId:string;armyPolicy:ArmyPolicy;inventoryPolicy:InventoryPolicy;progressionPolicy:ProgressionPolicy;rareDrops:boolean;rareEnabledAt?:string;rareAuthorizationId?:string;activationId:string|null;}
export const legacyRealm:Readonly<RealmPolicy>=Object.freeze({expanded:false,catalogId:alpha.id,armyPolicy:compatibility.active.army,inventoryPolicy:compatibility.active.inventory,progressionPolicy:compatibility.active.progression,rareDrops:false,activationId:null});
const key=Symbol('realm-policy');
export function invalidateRealmPolicy(sql:Sql){clearTransactionMemo(sql,key);}
export function realmPolicy(sql:Sql):Promise<Readonly<RealmPolicy>>{return transactionMemo(sql,key,async()=>{
 // Historical migration fixtures and pre-install readers remain legacy. Normal
 // startup separately requires the installed immutable definitions/schema.
 const installed=(await sql.query("SELECT to_regclass('realm_expansion_state') AS installed")).rows[0]?.installed;if(!installed)return legacyRealm;
 const row=(await sql.query('SELECT * FROM realm_expansion_state WHERE singleton=true')).rows[0];if(!row)return legacyRealm;
 if(row.policy_id!==expansionEngine.id||row.catalog_id!==expandedContent.id||row.catalog_digest!==definitionDigest(expandedContent)||row.writer_version!==expansionEngine.writer||!knownArtworkDigest(row.artwork_digest))throw new Error('Invalid expansion activation identity.');
 if(row.rarity_policy_id!==null&&row.rarity_policy_id!==questRarities.id)throw new Error('Invalid rare reward activation.');
 const evidence=(await sql.query("SELECT details,manifest_id,approval_digest FROM realm_expansion_events WHERE id=$1 AND kind='activate'",[row.id])).rows[0];
 const presentation=evidence?.details?.equipmentPresentation;
 if(presentation&&(evidence.manifest_id!==row.policy_id||evidence.approval_digest!==row.approval_digest||presentation.id!==equipmentPresentation.id||presentation.digest!==presentationDigest()||presentation.reviewed!==true))throw new Error('Invalid equipment presentation authorization.');
 const rarity=await readRarityAuthorization(sql);
 return Object.freeze({...(presentation?{presentationId:equipmentPresentation.id}:{}),expanded:true,catalogId:expandedContent.id,armyPolicy:expansionEngine.armyPolicy,inventoryPolicy:expansionEngine.inventoryPolicy,progressionPolicy:expansionEngine.progressionPolicy,rareDrops:rarity?rarity.enabled:row.rarity_policy_id===questRarities.id,rareAuthorizationId:rarity?.id,rareEnabledAt:rarity?.effectiveAt??new Date(row.activated_at).toISOString(),activationId:row.id});
});}
