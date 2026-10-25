// Private, typed, new-identity-only operation. Never called by startup/migrate.
import {randomUUID} from 'node:crypto';import {transaction,type Database,type Sql} from './db.js';
import {expansionBots,expansionBotEconomy,expansionBotCombat} from './expansion-bot-rules.js';
import {expandedContent,definitionDigest} from './expansion-content.js';import {expansionTarget} from './expansion-target.js';
import {ledger} from './economy.js';import {fundMaintenance} from './maintenance.js';import {alpha,levelRequirement,propertyPrice} from './alpha-rules.js';
type Identity={characterId:string;accountId:string;populationKey:string};
export async function legacyBotIdentities(sql:Sql):Promise<Identity[]>{return (await sql.query(`SELECT b.character_id AS "characterId",c.account_id AS "accountId",b.population_key AS "populationKey" FROM development_bots b JOIN characters c ON c.id=b.character_id WHERE b.population_version<>$1 ORDER BY b.character_id`,[expansionBots.id])).rows as Identity[];}
export interface PopulationPlan {kind:'level100-population';id:string;target:Awaited<ReturnType<typeof expansionTarget>>;manifestDigest:string;legacyDigest:string;capital:number;createdAt:string;expiresAt:string;capitalReviewed:boolean;storageReviewed:boolean;recoveryArtifactId:string|null;encryptedSha256:string|null;}
const totalCapital=()=>expansionBots.entries.reduce((n,e)=>n+e.capital,0);
export function validateExpansionPopulationDefinition(m:typeof expansionBots=expansionBots){
 if(m.id!=='level100-rivals-1'||m.catalogId!==expandedContent.id||m.activationDefault!==false||m.expectedOriginalBots!==450||m.expectedAddedBots!==450||m.expectedTotalBots!==900||m.entries.length!==450||new Set(m.entries.flatMap(e=>[e.characterId,e.accountId])).size!==900||new Set(m.entries.map(e=>e.populationKey)).size!==450||new Set(m.entries.map(e=>e.username)).size!==450)throw new Error('Invalid population definition.');
 for(const e of m.entries){
  if(![e.level,e.members,e.training,e.health,e.mana,e.spirit,e.skillPoints,e.wallet,e.reserve,e.upkeep,e.propertyNet,e.capital].every(Number.isSafeInteger)||e.level<1||e.level>100||e.members<1||e.members>=5*e.level||e.training<0||e.training>25||e.health<alpha.resources.health||e.health>alpha.resources.maxHealth||e.mana<alpha.resources.mana||e.mana>alpha.resources.maxMana||e.spirit<alpha.resources.spirit||e.spirit>alpha.resources.maxSpirit||e.wallet<0||e.reserve!==e.upkeep||e.capital>2147483647||e.equipment.length!==3)throw new Error('Invalid initial bot resources.');
  const allocated=2*e.training+(e.health-alpha.resources.health)/10+(e.mana-alpha.resources.mana)+2*(e.spirit-alpha.resources.spirit);if(!Number.isInteger(allocated)||e.skillPoints!==(e.level-1)*alpha.progression.pointsPerLevel-allocated||e.skillPoints<0)throw new Error('Initial skill budget mismatch.');
  const categories=new Set<string>();let cost=0,upkeep=0;for(const g of e.equipment){const i=expandedContent.items.find(i=>i.id===g.itemId);if(!i||i.acquisition==='quest-exclusive'||i.level>e.level||g.unitCost!==i.price||!Number.isSafeInteger(g.quantity)||g.quantity<1||g.quantity>e.members+1)throw new Error('Invalid authored inventory.');categories.add(i.category);cost+=g.quantity*i.price;upkeep+=g.quantity*i.upkeep;}
  const p=expandedContent.properties.find(p=>p.id===e.land.propertyId);if(categories.size!==3||cost!==e.equipmentCost||upkeep!==e.upkeep||!p||p.level>e.level||e.land.prices.length<3||e.land.prices.length>25||e.land.prices.some((price,n)=>price!==propertyPrice(p.price,n))||e.landCost!==e.land.prices.reduce((a,b)=>a+b,0)||e.propertyNet!==(p.hourlyIncome-p.hourlyUpkeep)*e.land.prices.length||e.propertyNet<=e.upkeep||e.capital!==e.wallet+e.reserve+e.equipmentCost+e.landCost)throw new Error('Authored capital or upkeep mismatch.');
 }
}
export async function inspectPopulation(db:Database):Promise<PopulationPlan>{return transaction(db,async sql=>{const identities=await legacyBotIdentities(sql);if(identities.length!==450)throw new Error('Original population identity is incomplete.');const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);return {kind:'level100-population',id:randomUUID(),target:await expansionTarget(sql),manifestDigest:definitionDigest(expansionBots),legacyDigest:definitionDigest(identities),capital:totalCapital(),createdAt:now.toISOString(),expiresAt:new Date(+now+3600000).toISOString(),capitalReviewed:false,storageReviewed:false,recoveryArtifactId:null,encryptedSha256:null};},{mode:'repeatable-read-only'});}
export async function populationEvidence(sql:Sql){
 if(!(await sql.query("SELECT to_regclass('expansion_bot_cohorts') AS installed")).rows[0]?.installed)return null;
 const cohort=(await sql.query('SELECT * FROM expansion_bot_cohorts')).rows[0];if(!cohort)return null;
 const identities=await legacyBotIdentities(sql);if(identities.length!==450||cohort.manifest_id!==expansionBots.id||cohort.manifest_digest!==definitionDigest(expansionBots)||cohort.legacy_digest!==definitionDigest(identities)||definitionDigest(cohort.legacy_identities)!==cohort.legacy_digest||Number(cohort.capital)!==totalCapital())throw new Error('Population provenance mismatch.');
 const rows=(await sql.query(`SELECT b.character_id,c.account_id,b.population_key,b.population_version,b.tier,b.variant,a.username,a.login_disabled,b.active,m.members,m.initial_capital,m.manifest_id FROM development_bots b JOIN characters c ON c.id=b.character_id JOIN accounts a ON a.id=c.account_id LEFT JOIN expansion_bot_members m ON m.character_id=b.character_id WHERE b.population_version=$1 ORDER BY b.character_id`,[expansionBots.id])).rows;
 if(rows.length!==450)throw new Error('Incomplete expansion cohort.');
 const active=(await sql.query('SELECT * FROM expansion_bot_activations')).rows[0];
 if(active&&!(await sql.query('SELECT 1 FROM realm_expansion_state')).rows.length)throw new Error('Publication without expansion is invalid.');
 if(active&&(active.manifest_id!==expansionBots.id||active.economy_policy!==expansionBotEconomy.id||active.combat_policy!==expansionBotCombat.id))throw new Error('Unknown cohort activation.');
 const expected=new Map(expansionBots.entries.map(e=>[e.characterId,e]));
 for(const r of rows){const e=expected.get(r.character_id);if(!e||r.account_id!==e.accountId||r.population_key!==e.populationKey||r.tier!==e.tier||r.variant!==e.variant||r.username!==e.username||!r.login_disabled||r.members!==e.members||r.initial_capital!==e.capital||r.manifest_id!==expansionBots.id||r.active!==!!active)throw new Error('Expansion identity mismatch.');}
 const autonomy=(await sql.query('SELECT mode,policy_digest FROM expansion_bot_autonomy_events ORDER BY sequence DESC LIMIT 1')).rows[0];
 if(autonomy&&(!active||!['paused','purchases-only','enabled'].includes(autonomy.mode)||autonomy.policy_digest!==definitionDigest([expansionBotEconomy,expansionBotCombat])))throw new Error('Autonomy evidence mismatch.');
 return {autonomyMode:autonomy?.mode??'paused',manifestId:expansionBots.id,manifestDigest:definitionDigest(expansionBots),legacyDigest:cohort.legacy_digest,originalBots:450,addedBots:450,totalBots:900,activeAddedBots:active?450:0};
}
export async function provisionExpansionBots(db:Database,plan:PopulationPlan,approvedDigest:string,afterInsert?:(index:number)=>void){
 validateExpansionPopulationDefinition();
 if(plan.kind!=='level100-population'||approvedDigest!==definitionDigest(plan)||plan.manifestDigest!==definitionDigest(expansionBots)||plan.capital!==totalCapital()||plan.capitalReviewed!==true||plan.storageReviewed!==true||!/^\d+$/.test(plan.recoveryArtifactId??'')||!/^[a-f0-9]{64}$/.test(plan.encryptedSha256??''))throw new Error('Exact population financial/recovery authorization required.');
 return transaction(db,async sql=>{
  if(definitionDigest(await expansionTarget(sql))!==definitionDigest(plan.target))throw new Error('Population database identity mismatch.');
  const old=(await sql.query('SELECT * FROM expansion_bot_cohorts')).rows[0];if(old){if(old.approval_digest!==approvedDigest||old.legacy_digest!==plan.legacyDigest)throw new Error('Another population authorization exists.');await populationEvidence(sql);return {created:0,replayed:true};}
  const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now),issued=Date.parse(plan.createdAt),expires=Date.parse(plan.expiresAt);
  if(!Number.isFinite(issued)||issued>+now||expires<=+now||expires-issued!==3600000)throw new Error('Population approval expired.');
  if((await sql.query('SELECT 1 FROM realm_expansion_state')).rows.length)throw new Error('Prepare the cohort before the coordinated expansion cutover.');
  const legacy=await legacyBotIdentities(sql);if(legacy.length!==450||definitionDigest(legacy)!==plan.legacyDigest||Number((await sql.query('SELECT count(*)::int AS n FROM development_bots')).rows[0]!.n)!==450)throw new Error('Unexpected original bot identity set.');
  const ids=expansionBots.entries.flatMap(e=>[e.characterId,e.accountId]),names=expansionBots.entries.map(e=>e.username);
  if((await sql.query('SELECT 1 FROM accounts WHERE id=ANY($1::uuid[]) OR username=ANY($2::text[]) UNION ALL SELECT 1 FROM characters WHERE id=ANY($1::uuid[]) LIMIT 1',[ids,names])).rows.length)throw new Error('New identity collision.');
  await sql.query('INSERT INTO expansion_bot_cohorts(manifest_id,manifest_digest,approval_digest,legacy_digest,legacy_identities,capital) VALUES($1,$2,$3,$4,$5,$6)',[expansionBots.id,definitionDigest(expansionBots),approvedDigest,plan.legacyDigest,JSON.stringify(legacy),plan.capital]);
  for(const [index,e]of expansionBots.entries.entries()){
   await sql.query('INSERT INTO accounts(id,username,password_hash,login_disabled) VALUES($1,$2,$3,true)',[e.accountId,e.username,'!disabled-expansion-npc-'+e.accountId]);
   const xp=Array.from({length:e.level-1},(_,i)=>levelRequirement(i+1)).reduce((a,b)=>a+b,0);
   await sql.query('INSERT INTO characters(id,account_id,name,attained_level,xp,profile_class,max_health,health,attack_training,defense_training,max_mana,mana,max_spirit,spirit) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$8,$9,$9,$10,$10)',[e.characterId,e.accountId,e.name,e.level,xp,e.calling,e.health,e.training,e.mana,e.spirit]);
   await sql.query('UPDATE characters SET skill_points=$2 WHERE id=$1',[e.characterId,e.skillPoints]);
   for(const award of alpha.progression.milestones??[])if(e.level>=award.level){await sql.query('INSERT INTO progression_awards(character_id,award_id,points) VALUES($1,$2,$3)',[e.characterId,award.id,award.points]);await sql.query('UPDATE characters SET skill_points=skill_points+$2 WHERE id=$1',[e.characterId,award.points]);}
   await sql.query('INSERT INTO wallets(character_id,balance) VALUES($1,0)',[e.characterId]);
   await sql.query('INSERT INTO vault_accounts(character_id,balance) VALUES($1,0)',[e.characterId]);
   await sql.query("INSERT INTO army_stacks(character_id,unit_definition_id,quantity) VALUES($1,'militia',0)",[e.characterId]);
   await sql.query('INSERT INTO development_bots(character_id,population_key,population_version,tier,active,refilled_at,recovered_at,ruleset_id,variant) VALUES($1,$2,$3,$4,false,$5,$5,$6,$7)',[e.characterId,e.populationKey,expansionBots.id,e.tier,now,expandedContent.id,e.variant]);
   await sql.query('INSERT INTO expansion_bot_members(character_id,manifest_id,account_id,members,initial_capital) VALUES($1,$2,$3,$4,$5)',[e.characterId,expansionBots.id,e.accountId,e.members,e.capital]);
   await ledger(sql,plan.id,'expansion_declared_capital',[{characterId:e.characterId,amount:e.capital}],expansionBots.id);
   let equipmentCost=0;
   for(const gear of e.equipment){const item=expandedContent.items.find(i=>i.id===gear.itemId);if(!item||item.acquisition==='quest-exclusive'||item.level>e.level||item.price!==gear.unitCost)throw new Error('Invalid initial equipment.');equipmentCost+=gear.unitCost*gear.quantity;
    const id=randomUUID();await sql.query('INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id,quantity,acquired_at) VALUES($1,$2,$3,$4,$5,$6)',[id,e.characterId,item.id,expandedContent.id,gear.quantity,now]);
    await sql.query('INSERT INTO inventory_lots(id,inventory_entry_id,character_id,ruleset_id,acquired_quantity,remaining_quantity,unit_cost,command_id,acquired_at) VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8)',[randomUUID(),id,e.characterId,expandedContent.id,gear.quantity,item.price,plan.id,now]);
    await sql.query("INSERT INTO inventory_transactions(id,character_id,item_id,kind,quantity,gold_amount,ruleset_id,command_id) VALUES($1,$2,$3,'buy',$4,$5,$6,$7)",[randomUUID(),e.characterId,item.id,gear.quantity,gear.quantity*item.price,expandedContent.id,plan.id]);
   }
   const p=expandedContent.properties.find(p=>p.id===e.land.propertyId);if(!p||p.level>e.level)throw new Error('Invalid initial Land.');let landCost=0;
   for(const [n,price]of e.land.prices.entries()){if(price!==propertyPrice(p.price,n))throw new Error('Invalid saved property price.');landCost+=price;await sql.query('INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through) VALUES($1,$2,$3,$4,$5,1,1,$6,$7,$8,3600,$9,$9)',[randomUUID(),e.characterId,p.id,p.name,expandedContent.id,price,p.hourlyIncome,p.hourlyUpkeep,now]);}
   if(equipmentCost!==e.equipmentCost||landCost!==e.landCost||e.capital!==equipmentCost+landCost+e.wallet+e.reserve)throw new Error('Capital did not reconcile.');
   await ledger(sql,plan.id,'expansion_equipment_purchase',[{characterId:e.characterId,amount:-equipmentCost}],expansionBots.id);
   await ledger(sql,plan.id,'expansion_land_purchase',[{characterId:e.characterId,amount:-landCost}],expansionBots.id);
   await sql.query('INSERT INTO maintenance_accounts(character_id,hourly_rate,reserve_gold,settled_at) VALUES($1,$2,$3,$4)',[e.characterId,e.upkeep,'0',now]);
   if(e.reserve!==e.upkeep)throw new Error('Initial upkeep reserve mismatch.');await fundMaintenance(sql,e.characterId,plan.id,now);
   await sql.query('INSERT INTO income_cycles(character_id,next_payment_at) VALUES($1,$2)',[e.characterId,new Date(+now+3600000)]);
   afterInsert?.(index);
  }
  await populationEvidence(sql);return {created:450,replayed:false};
 },{expansionLock:'exclusive'});
}
