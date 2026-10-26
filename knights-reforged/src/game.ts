import {presentationCatalog} from './equipment-presentation.js';
import {cohortMembers,botArmy} from './expansion-bot-rules.js';
import {createHash} from 'node:crypto';
import {callingDescription} from './calling-presentation.js';
import {upcomingPayment} from './payment.js';
import {healingQuote} from './gameplay-rules.js';
import {settleBotFinance} from './bot-finance.js';
import { type Database, transaction, type Sql } from './db.js';
import { GameError } from './errors.js';
import { rules, regenerate } from './rules.js';
import { alpha,selectEquipment,activeArmy,areRivals,lootById,trainedPower,type QuestDefinition,type OwnedItem } from './alpha-rules.js';
import {progressionEconomy} from './progression-economy-rules.js';
import { settleLand } from './land.js';
import { estateState,type EstateState } from './estate.js';
import {propertyName} from './property-presentation.js';
import { readInventory } from './inventory.js';
import { settleMaintenance,maintenanceAccount,automaticallyFundMaintenance } from './maintenance.js';
import {lockBountyEscrow,settleExpiredBounties} from './bounties.js';
import {refinements} from './refinement-rules.js';
import {invitationCode} from './community.js';
import {strategy,callingFor,callingPower,recoverySeconds} from './strategy-rules.js';
import {readArmyRoster,type ArmyLink} from './army-roster.js';
import {activeEquipmentCatalog} from './catalog-compatibility.js';
import {requirementForEpoch,readProgressionEpoch} from './progression-policy.js';
import {realmPolicy} from './realm-policy.js';
import {contentCatalog,equipmentCatalogFor} from './expansion-content.js';
import {resolveArmy} from './compatibility-rules.js';

export interface CharacterRow {
  development_bot?:boolean;id:string;account_id:string;name:string;xp:number;health:number;energy:number;
  health_updated_at:Date;energy_updated_at:Date;attack_ready_at:Date;state_version:number;
  max_health:number;mana:number;max_mana:number;spirit:number;max_spirit:number;
  mana_updated_at:Date;spirit_updated_at:Date;attained_level:number;level_xp:number;
  skill_points:number;legacy_army_floor:number;profile_class:string;
  attack_training:number;defense_training:number;
  calling_changed_at:Date|null;
}
export interface GameRuntime{developmentBotRecruitmentEnabled?:boolean;}
export type {ArmyLink} from './army-roster.js';
export interface CharacterState {
  rareEquipmentEnabled?:boolean;equipmentDiscoveries?:{itemId:string;name:string;quantity:number;createdAt:string}[];incomeReceipt:{id:string;gold:number;createdAt:string}|null;healing:ReturnType<typeof healingQuote>;payment:ReturnType<typeof upcomingPayment>;nextUnlock:{level:number;names:string[]}|null;invitationCode:string;id:string;name:string;xp:number;level:number;levelXp:number;levelRequirement:number;xpToNext:number;
  health:number;maxHealth:number;mana:number;maxMana:number;spirit:number;maxSpirit:number;energy:number;
  bankedGold:number;gold:number;units:number;attack:number;defense:number;equipped:boolean;inventoryId:string|null;
  inventory:OwnedItem[];questsCompleted:number;stateVersion:number;skillPoints:number;className:string;
  attackReadyAt:string;serverTime:string;energyNextAt:string|null;manaNextAt:string|null;spiritNextAt:string|null;healthNextAt:string|null;
  land:EstateState;rulesetId:string;presentationId?:string;
  economy:{grossHourlyIncome:number;propertyUpkeep:number;equipmentUpkeep:number;scheduledEquipmentUpkeep:number;otherUpkeep:number;totalUpkeep:number;netHourlyIncome:number;maintenancePaused:boolean};
  battleStats:{wins:number;losses:number;total:number;kills:number;deaths:number;legacyKnockouts:number};
  accountCreatedAt:string;accountAgeDays:number;
  training:{attack:number;defense:number;attackBonusPercent:number;defenseBonusPercent:number;untrainedAttack:number;untrainedDefense:number};
  calling:{rulesetId:string;attackPercent:number;defensePercent:number;description:string;healthSeconds:number;manaSeconds:number;spiritSeconds:number;changeReadyAt:string|null;changeCost:number};
  maintenance:{hourlyRate:number;reserveGold:string;arrearsGold:string;paused:boolean;resumeCost:number};
  army:ReturnType<typeof activeArmy>&{allies:number;mercenaries:number;links:ArmyLink[];incoming:number;outgoing:number;nextCursor:string|null};
  attackEquipment:ReturnType<typeof selectEquipment>;defenseEquipment:ReturnType<typeof selectEquipment>;
  quests:(QuestDefinition&{completions:number;missing:Record<string,number>;missingCost:number;ready:boolean;lockReason:string|null;requiresLootName:string|null})[];
  loot:{id:string;name:string}[];awards:{id:string;points:number}[];
}
export async function clock(sql:Sql) { return new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now); }
export async function lockCharacters(sql:Sql,ids:string[]) {
  const rows=(await sql.query<CharacterRow>('SELECT c.*,EXISTS(SELECT 1 FROM development_bots b WHERE b.character_id=c.id) AS development_bot FROM characters c WHERE c.id=ANY($1::uuid[]) ORDER BY c.id FOR UPDATE OF c',[ids])).rows;
  if (rows.length!==new Set(ids).size) throw new GameError('CHARACTER_NOT_FOUND','That warrior could not be found.',404);
  return rows;
}
export async function materialize(sql:Sql,row:CharacterRow,now:Date):Promise<CharacterRow> {
  const landChanged=await settleLand(sql,row.id,now,progressionEconomy.id);
  const upkeepChanged=await settleMaintenance(sql,row.id,now);
  const isBot=row.development_bot??!!(await sql.query('SELECT 1 FROM development_bots WHERE character_id=$1',[row.id])).rows.length;
  const automaticallyFunded=!isBot&&await automaticallyFundMaintenance(sql,row.id,now,landChanged);
  const botChanged=isBot?await settleBotFinance(sql,row.id,now):false;
  const hp=regenerate(row.health,row.max_health,new Date(row.health_updated_at),now,recoverySeconds(row.profile_class,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount);
  const mana=regenerate(row.mana,row.max_mana,new Date(row.mana_updated_at),now,recoverySeconds(row.profile_class,'mana',alpha.resources.manaSeconds));
  const spirit=regenerate(row.spirit,row.max_spirit,new Date(row.spirit_updated_at),now,recoverySeconds(row.profile_class,'spirit',alpha.resources.spiritSeconds));
  const changed=landChanged||upkeepChanged||automaticallyFunded||botChanged||hp.value!==row.health||mana.value!==row.mana||spirit.value!==row.spirit;
  const updated=(await sql.query<CharacterRow>(`UPDATE characters SET health=$2,mana=$3,spirit=$4,health_updated_at=$5,mana_updated_at=$6,spirit_updated_at=$7,
    state_version=state_version+$8 WHERE id=$1 RETURNING *`,[row.id,hp.value,mana.value,spirit.value,hp.updated,mana.updated,spirit.updated,changed?1:0])).rows[0]!;
  return {...updated,development_bot:isBot};
}
export async function armyLinks(sql:Sql,characterId:string,runtime:GameRuntime={}):Promise<ArmyLink[]> {
  return (await readArmyRoster(sql,characterId,runtime)).links;
}
export async function stateFrom(sql:Sql,row:CharacterRow,now:Date,runtime:GameRuntime={}):Promise<CharacterState> {
  const world=await realmPolicy(sql),alpha=presentationCatalog(contentCatalog(world.catalogId),world.presentationId),equipmentCatalog=equipmentCatalogFor(world.catalogId);
  const lootById=new Map(alpha.quests.filter(q=>q.loot).map(q=>[q.loot!.id,q.loot!]));
  const wallet=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[row.id])).rows[0]!;
  const units=(await sql.query('SELECT COALESCE(SUM(quantity),0)::int AS quantity FROM army_stacks WHERE character_id=$1',[row.id])).rows[0]!.quantity as number;
  const roster=await readArmyRoster(sql,row.id,runtime),links=roster.links,allies=roster.accepted;
  const isBot=row.development_bot??!!(await sql.query('SELECT 1 FROM development_bots WHERE character_id=$1',[row.id])).rows.length;
  const contingent=world.expanded&&isBot?(await cohortMembers(sql,[row.id])).get(row.id):undefined;
  const projection=isBot?botArmy(row.attained_level,units,allies,row.legacy_army_floor,contingent):resolveArmy(row.attained_level,units,allies,row.legacy_army_floor,world.armyPolicy);
  const army={...projection,allies,mercenaries:units+(contingent??0),links,incoming:roster.incoming,outgoing:roster.outgoing,nextCursor:roster.nextCursor};
  const inventory=await readInventory(sql,row.id);const upkeep=await maintenanceAccount(sql,row.id,now);
  const attackEquipment=selectEquipment(inventory,army.participants,'attack',!upkeep.paused,isBot&&contingent===undefined?'army-legacy-1':world.armyPolicy);
  const defenseEquipment=selectEquipment(inventory,army.participants,'defense',!upkeep.paused,isBot&&contingent===undefined?'army-legacy-1':world.armyPolicy);
  const progress=(await sql.query('SELECT quest_id,completions FROM character_quest_progress WHERE character_id=$1',[row.id])).rows;
  const loot=(await sql.query('SELECT loot_id AS id,name FROM character_loot WHERE character_id=$1 ORDER BY acquired_at,loot_id',[row.id])).rows as {id:string;name:string}[];
  const awards=(await sql.query('SELECT award_id AS id,points FROM progression_awards WHERE character_id=$1 ORDER BY created_at,award_id',[row.id])).rows as {id:string;points:number}[];
  const quests=alpha.quests.map(quest=>{
    const {missing,missingCost}=equipmentCatalog.requirements(quest.items,inventory,row.attained_level);
    const requiresLootName=quest.requiresLoot?lootById.get(quest.requiresLoot)!.name:null;
    const lockReason=row.attained_level<quest.level?'Level '+quest.level+' required':Object.keys(missing).length?'Equipment required':quest.requiresLoot&&!loot.some(l=>l.id===quest.requiresLoot)?requiresLootName+' required':army.participants<quest.army?'Army of '+quest.army+' required':row.mana<quest.mana?'More Mana required':null;
    return {...quest,missing,missingCost,completions:progress.find(p=>p.quest_id===quest.id)?.completions??0,ready:!lockReason,lockReason,requiresLootName};
  });
  const next=(value:number,max:number,updated:Date,seconds:number)=>value<max?new Date(new Date(updated).getTime()+seconds*1000).toISOString():null;
  const calling=callingFor(row.profile_class);
  const healthSeconds=recoverySeconds(row.profile_class,'health',alpha.resources.healthSeconds),manaSeconds=recoverySeconds(row.profile_class,'mana',alpha.resources.manaSeconds),spiritSeconds=recoverySeconds(row.profile_class,'spirit',alpha.resources.spiritSeconds);
  const manaNextAt=next(row.mana,row.max_mana,row.mana_updated_at,manaSeconds);
  const sword=inventory.find(i=>i.id===rules.weapon.id&&i.quantity>0);
  const land=await estateState(sql,row.id,wallet.balance,upkeep.paused?0:upkeep.hourly_rate,row.attained_level);
  const activeEquipmentUpkeep=upkeep.paused?0:upkeep.hourly_rate;
  const economy={grossHourlyIncome:land.hourlyIncome,propertyUpkeep:land.hourlyUpkeep,equipmentUpkeep:activeEquipmentUpkeep,
    scheduledEquipmentUpkeep:upkeep.hourly_rate,otherUpkeep:0,totalUpkeep:land.hourlyUpkeep+activeEquipmentUpkeep,
    netHourlyIncome:land.hourlyIncome-land.hourlyUpkeep-activeEquipmentUpkeep,maintenancePaused:upkeep.paused};
  const battleStats=(await sql.query(`SELECT (battle_victories+battle_defeats)::int AS total,
    battle_victories::int AS wins,battle_defeats::int AS losses,bounty_claims::int AS kills,bounty_deaths::int AS deaths,
    COALESCE((SELECT health_knockouts FROM legacy_field_statistics WHERE character_id=$1),0)::int AS "legacyKnockouts"
    FROM champion_standings WHERE character_id=$1`,[row.id])).rows[0] as CharacterState['battleStats'];
  const accountCreated=new Date((await sql.query('SELECT created_at FROM accounts WHERE id=$1',[row.account_id])).rows[0]!.created_at);
  const untrainedAttack=rules.baseAttack+(row.attained_level-1)*rules.attackPerLevel+(army.participants-1)*rules.unit.attack+attackEquipment.attack;
  const untrainedDefense=rules.baseDefense+(row.attained_level-1)*rules.defensePerLevel+(army.participants-1)*rules.unit.defense+defenseEquipment.defense;
  const nextLevel=[...alpha.items,...alpha.quests,...alpha.properties].filter(item=>item.level>row.attained_level).reduce((n,item)=>Math.min(n,item.level),Infinity);
  const nextUnlock=Number.isFinite(nextLevel)?{level:nextLevel,names:[...alpha.items,...alpha.quests,...alpha.properties].filter(item=>item.level===nextLevel).map(item=>propertyName(item.id,item.name))}:null;
  const incomeReceipt=(await sql.query('SELECT transaction_id AS id,gold,created_at AS "createdAt" FROM character_income_feedback WHERE character_id=$1',[row.id])).rows[0] as {id:string;gold:number;createdAt:string}|undefined;
  const requirement=requirementForEpoch(row.attained_level,await readProgressionEpoch(sql,row.id));
  const equipmentDiscoveries=world.expanded?(await sql.query(`SELECT e.item_id,e.quantity,e.created_at FROM inventory_acquisition_events e WHERE e.character_id=$1 AND e.source_kind='quest_drop' ORDER BY e.created_at DESC,e.id DESC LIMIT 8`,[row.id])).rows.map(e=>({itemId:e.item_id,name:equipmentCatalog.definition(e.item_id)!.name,quantity:e.quantity,createdAt:new Date(e.created_at).toISOString()})):[];
  return {...(world.expanded?{equipmentDiscoveries,rareEquipmentEnabled:world.rareDrops}:{}),incomeReceipt:incomeReceipt??null,healing:healingQuote(row.health,row.max_health,row.attained_level,wallet.balance),payment:upcomingPayment(land,upkeep,wallet.balance,now,!isBot),nextUnlock,invitationCode:await invitationCode(sql,row.id),id:row.id,name:row.name,xp:row.xp,level:row.attained_level,levelXp:row.level_xp,levelRequirement:requirement,xpToNext:requirement-row.level_xp,
    health:row.health,maxHealth:row.max_health,mana:row.mana,maxMana:row.max_mana,spirit:row.spirit,maxSpirit:row.max_spirit,energy:row.mana,
    bankedGold:(await sql.query('SELECT balance FROM vault_accounts WHERE character_id=$1',[row.id])).rows[0]?.balance??0,gold:wallet.balance,units,attack:callingPower(trainedPower(untrainedAttack,row.attack_training),calling.attackPercent),defense:callingPower(trainedPower(untrainedDefense,row.defense_training),calling.defensePercent),
    equipped:Boolean(sword),inventoryId:sword?.inventoryId??null,inventory,questsCompleted:progress.reduce((n,p)=>n+p.completions,0),quests,loot,awards,
    stateVersion:row.state_version,skillPoints:row.skill_points,className:row.profile_class,
    attackReadyAt:now.toISOString(),serverTime:now.toISOString(),energyNextAt:manaNextAt,manaNextAt,
    spiritNextAt:next(row.spirit,row.max_spirit,row.spirit_updated_at,spiritSeconds),
    healthNextAt:next(row.health,row.max_health,row.health_updated_at,healthSeconds),
    calling:{rulesetId:strategy.id,description:callingDescription(row.profile_class),attackPercent:calling.attackPercent,defensePercent:calling.defensePercent,healthSeconds,manaSeconds,spiritSeconds,
      changeReadyAt:row.calling_changed_at?new Date(+new Date(row.calling_changed_at)+strategy.callingChange.cooldownSeconds*1000).toISOString():null,changeCost:row.calling_changed_at?strategy.callingChange.laterCost:0},
    land,economy,battleStats,...(world.presentationId?{presentationId:world.presentationId}:{}),rulesetId:alpha.id,army,attackEquipment,defenseEquipment,
    accountCreatedAt:accountCreated.toISOString(),accountAgeDays:Math.max(0,Math.floor((+now-+accountCreated)/86400000)),
    training:{attack:row.attack_training,defense:row.defense_training,attackBonusPercent:row.attack_training*alpha.combatSkills.percentPerRating,defenseBonusPercent:row.defense_training*alpha.combatSkills.percentPerRating,untrainedAttack,untrainedDefense},
    maintenance:{hourlyRate:upkeep.hourly_rate,reserveGold:upkeep.reserve_gold,arrearsGold:upkeep.arrears_gold,paused:upkeep.paused,
      resumeCost:Number(BigInt(upkeep.arrears_gold)+(BigInt(upkeep.reserve_gold)<BigInt(upkeep.hourly_rate)?BigInt(upkeep.hourly_rate)-BigInt(upkeep.reserve_gold):0n))}};
}
export async function getState(db:Database,accountId:string,runtime:GameRuntime={}):Promise<CharacterState> {
  return transaction(db,async client=>{
    const requestedAt=await clock(client);
    const overdue=(await client.query("SELECT sponsor_id FROM bounties WHERE sponsor_id=(SELECT id FROM characters WHERE account_id=$1) AND status='active' AND expires_at<=$2 LIMIT 1",[accountId,requestedAt])).rows[0];
    if(overdue){await lockBountyEscrow(client);await settleExpiredBounties(client,await clock(client),null,overdue.sponsor_id);}
    const row=(await client.query<CharacterRow>('SELECT c.*,EXISTS(SELECT 1 FROM development_bots b WHERE b.character_id=c.id) AS development_bot FROM characters c WHERE c.account_id=$1 FOR UPDATE OF c',[accountId])).rows[0];
    if (!row) throw new GameError('CHARACTER_NOT_FOUND','Your character could not be found.',404);
    const now=await clock(client);return stateFrom(client,await materialize(client,row,now),now,runtime);
  });
}
async function chronologicalOpponents(db:Database,characterId:string,cursor?:string,developmentBotsEnabled=false,developmentBotRecruitmentEnabled=false) {
  let after:string|null=null,afterId:string|null=null;
  if (cursor!==undefined) {
    if(typeof cursor!=='string') throw new GameError('INVALID_CURSOR','Invalid rival page.');
    const parts=cursor.split('~');after=parts[0]??'';afterId=parts[1]??null;
    if (parts.length!==2||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(after)||!Number.isFinite(Date.parse(after))||!afterId||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(afterId)) throw new GameError('INVALID_CURSOR','Invalid rival page.');
  }
  const world=await realmPolicy(db);
 const actor=(await db.query('SELECT attained_level FROM characters WHERE id=$1',[characterId])).rows[0]!;
  const range=Math.max(2,Math.ceil(actor.attained_level*0.2));
  const rows=(await db.query(`SELECT c.*,b.tier AS bot_tier,b.recovered_at AS bot_recovered_at,to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,
    (SELECT COALESCE(SUM(quantity),0)::int FROM army_stacks WHERE character_id=c.id) AS units,
    (SELECT count(*)::int FROM army_links l WHERE c.id IN (l.low_id,l.high_id) AND l.status='accepted' AND (NOT EXISTS(SELECT 1 FROM development_bots d WHERE d.character_id=CASE WHEN l.low_id=c.id THEN l.high_id ELSE l.low_id END) OR ($8 AND EXISTS(SELECT 1 FROM development_bots d WHERE d.character_id=CASE WHEN l.low_id=c.id THEN l.high_id ELSE l.low_id END AND d.active)))) AS allies
    FROM characters c JOIN accounts a ON a.id=c.account_id LEFT JOIN development_bots b ON b.character_id=c.id WHERE c.id<>$1 AND (NOT a.login_disabled OR b.character_id IS NOT NULL) AND c.attained_level BETWEEN $2 AND $3 AND ABS(c.attained_level-$6)<=GREATEST(2,CEIL(c.attained_level*0.2))
    AND (b.character_id IS NULL OR ($7 AND b.active))
    AND ($4::timestamptz IS NULL OR (c.created_at,c.id)<($4::timestamptz,$5::uuid))
    ORDER BY c.created_at DESC,c.id DESC LIMIT 21`,[characterId,actor.attained_level-range,actor.attained_level+range,after,afterId,actor.attained_level,developmentBotsEnabled,developmentBotRecruitmentEnabled])).rows;
  const eligible=rows.filter(row=>areRivals(actor.attained_level,row.attained_level));const more=eligible.length>20;
  const now=await clock(db);
  const contingents=world.expanded?await cohortMembers(db,eligible.map(r=>r.id)):new Map<string,number>();
  const opponents=eligible.slice(0,20).map(row=>({id:row.id as string,name:row.name as string,level:row.attained_level as number,className:row.profile_class as string,
    units:row.units as number,armySize:(row.bot_tier?botArmy(row.attained_level,row.units,row.allies,row.legacy_army_floor,contingents.get(row.id)):resolveArmy(row.attained_level,row.units,row.allies,row.legacy_army_floor,world.armyPolicy)).participants,maxHealth:row.max_health as number,
    health:regenerate(row.health,row.max_health,new Date(row.health_updated_at),now,recoverySeconds(row.profile_class,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount).value,
    botTier:row.bot_tier as string|null,
    cursor:row.cursor_at+'~'+row.id}));
  return {opponents,nextCursor:more?opponents.at(-1)!.cursor:null};
}
/** Cyclic indexed UUID seeks. Cursors bind the pivot and half for a complete,
 * duplicate-free traversal, even when another attack changes the next-page seed.
 * Old timestamp cursors remain valid for clients using chronological pagination. */
export async function listOpponents(db:Database,characterId:string,cursor?:string,developmentBotsEnabled=false,developmentBotRecruitmentEnabled=false,rotation?:unknown){
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 if(cursor!==undefined&&typeof cursor!=='string')throw new GameError('INVALID_CURSOR','Invalid rival page.');
 if(cursor!==undefined&&cursor.split('~').length===2)return chronologicalOpponents(db,characterId,cursor,developmentBotsEnabled,developmentBotRecruitmentEnabled);
 if(rotation!==undefined&&(typeof rotation!=='string'||!uuid.test(rotation)))throw new GameError('INVALID_CURSOR','Invalid rival refresh.');
 const world=await realmPolicy(db);
 const actor=(await db.query('SELECT attained_level FROM characters WHERE id=$1',[characterId])).rows[0]!;
 const now=await clock(db);let pivot:string,after:string|null=null,phase=0,lastTarget:string|null=null;
 if(cursor!==undefined){const parts=cursor.split('~');if(parts.length!==4||parts[0]!=='r1'||!uuid.test(parts[1]!)||!['0','1'].includes(parts[2]!)||!uuid.test(parts[3]!))throw new GameError('INVALID_CURSOR','Invalid rival page.');pivot=parts[1]!.toLowerCase();phase=Number(parts[2]);after=parts[3]!.toLowerCase();
  if(phase===0&&after<=pivot||phase===1&&after>pivot)throw new GameError('INVALID_CURSOR','Invalid rival page.');
 }else{
  const latest=(await db.query('SELECT id,defender_id FROM battles WHERE attacker_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[characterId])).rows[0];lastTarget=latest?.defender_id??null;
  const hex=createHash('sha256').update(characterId+'|'+(latest?.id??'new')+'|'+now.toISOString().slice(0,10)+'|'+(rotation??'default')).digest('hex').slice(0,32);
  pivot=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
 }
 const range=Math.max(2,Math.ceil(actor.attained_level*0.2));
 const seek=async(half:number,last:string|null,limit:number)=>(await db.query(`SELECT c.*,b.tier AS bot_tier,$9::int AS rotation_phase,
  (SELECT COALESCE(SUM(quantity),0)::int FROM army_stacks WHERE character_id=c.id) AS units,
  (SELECT count(*)::int FROM army_links l WHERE c.id IN (l.low_id,l.high_id) AND l.status='accepted' AND (NOT EXISTS(SELECT 1 FROM development_bots d WHERE d.character_id=CASE WHEN l.low_id=c.id THEN l.high_id ELSE l.low_id END) OR ($8 AND EXISTS(SELECT 1 FROM development_bots d WHERE d.character_id=CASE WHEN l.low_id=c.id THEN l.high_id ELSE l.low_id END AND d.active)))) AS allies
  FROM characters c JOIN accounts a ON a.id=c.account_id LEFT JOIN development_bots b ON b.character_id=c.id
  WHERE c.id<>$1 AND (NOT a.login_disabled OR b.character_id IS NOT NULL)
  AND c.attained_level BETWEEN $2 AND $3 AND ABS(c.attained_level-$6)<=GREATEST(2,CEIL(c.attained_level*0.2))
  AND (b.character_id IS NULL OR ($7 AND b.active))
  AND (($9=0 AND c.id>$4::uuid) OR ($9=1 AND c.id<=$4::uuid)) AND ($5::uuid IS NULL OR c.id>$5::uuid)
  ORDER BY c.id LIMIT $10`,[characterId,actor.attained_level-range,actor.attained_level+range,pivot, last,actor.attained_level,developmentBotsEnabled,developmentBotRecruitmentEnabled,half,limit])).rows;
 const rows=await seek(phase,after,21);if(phase===0&&rows.length<21)rows.push(...await seek(1,null,21-rows.length));
 const contingents=world.expanded?await cohortMembers(db,rows.map(r=>r.id)):new Map<string,number>();
 const opponents=rows.slice(0,20).map(row=>({id:row.id as string,name:row.name as string,level:row.attained_level as number,className:row.profile_class as string,
  units:row.units as number,armySize:(row.bot_tier?botArmy(row.attained_level,row.units,row.allies,row.legacy_army_floor,contingents.get(row.id)):resolveArmy(row.attained_level,row.units,row.allies,row.legacy_army_floor,world.armyPolicy)).participants,maxHealth:row.max_health as number,
  health:regenerate(row.health,row.max_health,new Date(row.health_updated_at),now,recoverySeconds(row.profile_class,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount).value,
  botTier:row.bot_tier as string|null,cursor:'r1~'+pivot+'~'+row.rotation_phase+'~'+row.id}));
 const nextCursor=rows.length>20?opponents.at(-1)!.cursor:null;
 if(cursor===undefined&&opponents.length>1&&opponents[0]!.id===lastTarget)[opponents[0],opponents[1]]=[opponents[1]!,opponents[0]!];
 return {opponents,nextCursor};
}
export async function recentBattles(db:Database,characterId:string) {
  return (await db.query(`SELECT id,result||jsonb_build_object('attackerId',attacker_id,'defenderId',defender_id,'winnerId',CASE WHEN outcome='attacker_win' THEN attacker_id ELSE defender_id END) AS result,created_at FROM battles WHERE attacker_id=$1 OR defender_id=$1 ORDER BY created_at DESC,id DESC LIMIT 10`,[characterId])).rows;
}
export async function getBattle(db:Database,accountId:string,battleId:string) {
  const row=(await db.query(`SELECT b.id,b.result,b.ruleset_id,b.created_at,b.attacker_id,b.defender_id,b.outcome FROM battles b JOIN characters c ON c.account_id=$1
    WHERE b.id=$2 AND (b.attacker_id=c.id OR b.defender_id=c.id)`,[accountId,battleId])).rows[0];
  if (!row) throw new GameError('BATTLE_NOT_FOUND','This battle is unavailable to your character.',404);return row;
}
