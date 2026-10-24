import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {resolve,sep} from 'node:path';
import {transaction,type Database,type Sql} from './db.js';import {realmPolicy,invalidateRealmPolicy} from './realm-policy.js';
import {expandedContent,expansionEngine,expansionArtwork,questRarities,definitionDigest} from './expansion-content.js';
import {prepareProgressionEpoch} from './progression-policy.js';import {projectRoot} from './config.js';
export async function initializeProgressionEpoch(sql:Sql,id:string){
 const world=await realmPolicy(sql);if(!world.expanded)return;
 const c=(await sql.query('SELECT attained_level,level_xp FROM characters WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!c)throw new Error('Missing progression target.');
 const epoch=prepareProgressionEpoch(c.attained_level,c.level_xp,expansionEngine.progressionPolicy);
 await sql.query('INSERT INTO character_progression_epochs(character_id,policy_id,boundary_level,boundary_requirement,starting_progress) VALUES($1,$2,$3,$4,$5)',[id,epoch.policyId,epoch.boundaryLevel,epoch.boundaryRequirement,epoch.startingProgress]);
}
export async function expansionAssetReadiness(){
 const failures:string[]=[];const root=resolve(projectRoot,'public')+sep;
 for(const e of expansionArtwork.entries){
  if(e.status!=='approved'||!e.license||!e.provenanceEvidence||!e.framingApproval||!e.ownerApproval||!e.path||!e.sha256||!/^\/assets\/[a-z0-9/_.-]+$/.test(e.path)||!/^[a-f0-9]{64}$/.test(e.sha256)||!e.fullBleedRequired){failures.push(e.id);continue;}
  const path=resolve(projectRoot,'public','.'+e.path);if(!path.startsWith(root)){failures.push(e.id);continue;}
  try{const bytes=await readFile(path);const {createHash}=await import('node:crypto');if(createHash('sha256').update(bytes).digest('hex')!==e.sha256)failures.push(e.id);}catch{failures.push(e.id);}
 }
 return {ready:failures.length===0,missing:failures,digest:definitionDigest(expansionArtwork)};
}
export async function expansionTarget(sql:Sql){
 const row=(await sql.query(`SELECT current_database() AS database,d.oid::text AS "databaseOid",s.system_identifier::text AS cluster FROM pg_database d CROSS JOIN pg_control_system() s WHERE d.datname=current_database()`)).rows[0];
 if(!row||!/^\d+$/.test(row.cluster)||!/^\d+$/.test(row.databaseOid))throw new Error('Database identity unavailable.');return {database:String(row.database),databaseOid:String(row.databaseOid),cluster:String(row.cluster)};
}
export async function expansionSnapshot(sql:Sql){
 const humans=(await sql.query(`SELECT c.id,c.account_id,c.attained_level,c.level_xp FROM characters c WHERE NOT EXISTS(SELECT 1 FROM development_bots b WHERE b.character_id=c.id) ORDER BY c.id`)).rows;
 const bots=Number((await sql.query('SELECT count(*)::int AS n FROM development_bots')).rows[0]!.n);
 const bands=[];for(const level of expansionEngine.opponentLevels){const count=Number((await sql.query(`SELECT count(*)::int AS n FROM characters c JOIN accounts a ON a.id=c.account_id LEFT JOIN development_bots b ON b.character_id=c.id WHERE c.attained_level BETWEEN $1-5 AND $1+5 AND c.health>=20 AND ((b.active=true) OR (b.character_id IS NULL AND NOT a.login_disabled))`,[level])).rows[0]!.n);bands.push({level,count});}
 return {humans,botCount:bots,bands};
}
export interface ExpansionPlan {kind:'level100-cutover';id:string;target:Awaited<ReturnType<typeof expansionTarget>>;policyDigest:string;catalogDigest:string;artworkDigest:string;humanDigest:string;botCount:number;bands:{level:number;count:number}[];rareDrops:boolean;createdAt:string;expiresAt:string;storageReviewed:boolean;recoveryReviewed:boolean;opponentPlanReviewed:boolean;}
export async function inspectExpansion(db:Database,review:{storageReviewed:boolean;recoveryReviewed:boolean;opponentPlanReviewed:boolean;rareDrops:boolean}):Promise<ExpansionPlan>{
 return transaction(db,async sql=>{const snapshot=await expansionSnapshot(sql),now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);return {kind:'level100-cutover',id:randomUUID(),target:await expansionTarget(sql),policyDigest:definitionDigest(expansionEngine),catalogDigest:definitionDigest(expandedContent),artworkDigest:definitionDigest(expansionArtwork),humanDigest:definitionDigest(snapshot.humans),botCount:snapshot.botCount,bands:snapshot.bands,...review,createdAt:now.toISOString(),expiresAt:new Date(+now+3600000).toISOString()};});
}
export async function activateExpansion(db:Database,plan:ExpansionPlan,approvedDigest:string){
 if(approvedDigest!==definitionDigest(plan)||plan.kind!=='level100-cutover'||!plan.storageReviewed||!plan.recoveryReviewed||!plan.opponentPlanReviewed)throw new Error('Exact reviewed activation plan required.');
 return transaction(db,async sql=>{
  const old=(await sql.query('SELECT id,approval_digest FROM realm_expansion_state WHERE singleton=true')).rows[0];
  if(old){if(old.id!==plan.id||old.approval_digest!==approvedDigest)throw new Error('Another activation already exists.');await realmPolicy(sql);return {id:old.id,replayed:true};}
  const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
  if(!Number.isFinite(Date.parse(plan.createdAt))||!Number.isFinite(Date.parse(plan.expiresAt))||Date.parse(plan.createdAt)>+now||Date.parse(plan.expiresAt)<=+now||Date.parse(plan.expiresAt)-Date.parse(plan.createdAt)!==3600000)throw new Error('Activation approval expired.');
  if(definitionDigest(await expansionTarget(sql))!==definitionDigest(plan.target)||plan.policyDigest!==definitionDigest(expansionEngine)||plan.catalogDigest!==definitionDigest(expandedContent)||plan.artworkDigest!==definitionDigest(expansionArtwork))throw new Error('Activation identity mismatch.');
  if(!(await expansionAssetReadiness()).ready)throw new Error('Approved expansion assets are required.');
  if(plan.rareDrops&&questRarities.reviewStatus!=='approved')throw new Error('Rare probability review is required.');
  await sql.query('SELECT id FROM characters ORDER BY id FOR UPDATE');
  const snapshot=await expansionSnapshot(sql);
  if(snapshot.botCount!==expansionEngine.expectedBots||snapshot.botCount!==plan.botCount||definitionDigest(snapshot.humans)!==plan.humanDigest||snapshot.bands.some(b=>b.count<expansionEngine.minimumOpponentsPerBand))throw new Error('Population or progression changed; review a new plan.');
  if((await sql.query('SELECT 1 FROM character_progression_epochs LIMIT 1')).rows.length)throw new Error('Unexpected prior progression metadata.');
  for(const c of snapshot.humans){const e=prepareProgressionEpoch(c.attained_level,c.level_xp,expansionEngine.progressionPolicy);await sql.query('INSERT INTO character_progression_epochs(character_id,policy_id,boundary_level,boundary_requirement,starting_progress) VALUES($1,$2,$3,$4,$5)',[c.id,e.policyId,e.boundaryLevel,e.boundaryRequirement,e.startingProgress]);}
  await sql.query(`INSERT INTO realm_expansion_state(id,policy_id,catalog_id,catalog_digest,writer_version,rarity_policy_id,artwork_digest,approval_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[plan.id,expansionEngine.id,expandedContent.id,definitionDigest(expandedContent),expansionEngine.writer,plan.rareDrops?questRarities.id:null,definitionDigest(expansionArtwork),approvedDigest]);
  await sql.query('INSERT INTO realm_expansion_events(id,kind,manifest_id,approval_digest,details) VALUES($1,\'activate\',$2,$3,$4)',[plan.id,expansionEngine.id,approvedDigest,{target:plan.target,humanCount:snapshot.humans.length,botCount:snapshot.botCount,bands:snapshot.bands}]);
  invalidateRealmPolicy(sql);await realmPolicy(sql);return {id:plan.id,replayed:false};
 },{expansionLock:'exclusive'});
}
