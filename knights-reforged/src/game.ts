import { type Database, transaction, type Sql } from './db.js';
import { GameError } from './errors.js';
import { rules, regenerate } from './rules.js';
import { alpha,levelRequirement,selectEquipment,activeArmy,areRivals,lootById,trainedPower,type QuestDefinition,type OwnedItem } from './alpha-rules.js';
import { settleLand } from './land.js';
import { estateState,type EstateState } from './estate.js';
import { readInventory } from './inventory.js';
import { settleMaintenance,maintenanceAccount } from './maintenance.js';
import {lockBountyEscrow,settleExpiredBounties} from './bounties.js';
import {refinements} from './refinement-rules.js';
import {invitationCode} from './community.js';
import {strategy,callingFor,callingPower,recoverySeconds} from './strategy-rules.js';

export interface CharacterRow {
  id:string;account_id:string;name:string;xp:number;health:number;energy:number;
  health_updated_at:Date;energy_updated_at:Date;attack_ready_at:Date;state_version:number;
  max_health:number;mana:number;max_mana:number;spirit:number;max_spirit:number;
  mana_updated_at:Date;spirit_updated_at:Date;attained_level:number;level_xp:number;
  skill_points:number;legacy_army_floor:number;profile_class:string;
  attack_training:number;defense_training:number;
  calling_changed_at:Date|null;
}
export interface ArmyLink { characterId:string;name:string;level:number;className:string;status:string;incoming:boolean; }
export interface CharacterState {
  invitationCode:string;id:string;name:string;xp:number;level:number;levelXp:number;levelRequirement:number;xpToNext:number;
  health:number;maxHealth:number;mana:number;maxMana:number;spirit:number;maxSpirit:number;energy:number;
  bankedGold:number;gold:number;units:number;attack:number;defense:number;equipped:boolean;inventoryId:string|null;
  inventory:OwnedItem[];questsCompleted:number;stateVersion:number;skillPoints:number;className:string;
  attackReadyAt:string;serverTime:string;energyNextAt:string|null;manaNextAt:string|null;spiritNextAt:string|null;healthNextAt:string|null;
  land:EstateState;rulesetId:string;
  economy:{grossHourlyIncome:number;propertyUpkeep:number;equipmentUpkeep:number;scheduledEquipmentUpkeep:number;otherUpkeep:number;totalUpkeep:number;netHourlyIncome:number;maintenancePaused:boolean};
  battleStats:{wins:number;losses:number;total:number;kills:number;deaths:number;legacyKnockouts:number};
  accountCreatedAt:string;accountAgeDays:number;
  training:{attack:number;defense:number;attackBonusPercent:number;defenseBonusPercent:number;untrainedAttack:number;untrainedDefense:number};
  calling:{rulesetId:string;attackPercent:number;defensePercent:number;description:string;healthSeconds:number;manaSeconds:number;spiritSeconds:number;changeReadyAt:string|null;changeCost:number};
  maintenance:{hourlyRate:number;reserveGold:string;arrearsGold:string;paused:boolean;resumeCost:number};
  army:ReturnType<typeof activeArmy>&{allies:number;mercenaries:number;links:ArmyLink[]};
  attackEquipment:ReturnType<typeof selectEquipment>;defenseEquipment:ReturnType<typeof selectEquipment>;
  quests:(QuestDefinition&{completions:number;missing:Record<string,number>;missingCost:number;ready:boolean;lockReason:string|null;requiresLootName:string|null})[];
  loot:{id:string;name:string}[];awards:{id:string;points:number}[];
}
export async function clock(sql:Sql) { return new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now); }
export async function lockCharacters(sql:Sql,ids:string[]) {
  const rows=(await sql.query<CharacterRow>('SELECT * FROM characters WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[ids])).rows;
  if (rows.length!==new Set(ids).size) throw new GameError('CHARACTER_NOT_FOUND','That warrior could not be found.',404);
  return rows;
}
export async function materialize(sql:Sql,row:CharacterRow,now:Date):Promise<CharacterRow> {
  const landChanged=await settleLand(sql,row.id,now,alpha.id);
  const upkeepChanged=await settleMaintenance(sql,row.id,now);
  const hp=regenerate(row.health,row.max_health,new Date(row.health_updated_at),now,recoverySeconds(row.profile_class,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount);
  const mana=regenerate(row.mana,row.max_mana,new Date(row.mana_updated_at),now,recoverySeconds(row.profile_class,'mana',alpha.resources.manaSeconds));
  const spirit=regenerate(row.spirit,row.max_spirit,new Date(row.spirit_updated_at),now,recoverySeconds(row.profile_class,'spirit',alpha.resources.spiritSeconds));
  const changed=landChanged||upkeepChanged||hp.value!==row.health||mana.value!==row.mana||spirit.value!==row.spirit;
  return (await sql.query<CharacterRow>(`UPDATE characters SET health=$2,mana=$3,spirit=$4,health_updated_at=$5,mana_updated_at=$6,spirit_updated_at=$7,
    state_version=state_version+$8 WHERE id=$1 RETURNING *`,[row.id,hp.value,mana.value,spirit.value,hp.updated,mana.updated,spirit.updated,changed?1:0])).rows[0]!;
}
export async function armyLinks(sql:Sql,characterId:string):Promise<ArmyLink[]> {
  return (await sql.query(`SELECT c.id,c.name,c.attained_level,c.profile_class,l.status,l.inviter_id FROM army_links l
    JOIN characters c ON c.id=CASE WHEN l.low_id=$1 THEN l.high_id ELSE l.low_id END
    WHERE $1 IN (l.low_id,l.high_id) AND l.status<>'declined' ORDER BY l.status,c.name,c.id`,[characterId])).rows
    .map(row=>({characterId:row.id,name:row.name,level:row.attained_level,className:row.profile_class,status:row.status,incoming:row.inviter_id!==characterId}));
}
export async function stateFrom(sql:Sql,row:CharacterRow,now:Date):Promise<CharacterState> {
  const wallet=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1',[row.id])).rows[0]!;
  const units=(await sql.query('SELECT COALESCE(SUM(quantity),0)::int AS quantity FROM army_stacks WHERE character_id=$1',[row.id])).rows[0]!.quantity as number;
  const links=await armyLinks(sql,row.id);const allies=links.filter(link=>link.status==='accepted').length;
  const isBot=!!(await sql.query('SELECT 1 FROM development_bots WHERE character_id=$1',[row.id])).rows.length;
  const projection=activeArmy(row.attained_level,isBot?Math.min(units,refinements.bots.armyCap-1):units,isBot?0:allies,isBot?Math.min(row.legacy_army_floor,refinements.bots.armyCap):row.legacy_army_floor);
  if(isBot){projection.participants=Math.min(refinements.bots.armyCap,projection.participants);projection.capacity=Math.min(refinements.bots.armyCap,projection.capacity);projection.total=Math.min(refinements.bots.armyCap,projection.total);}
  const army={...projection,allies,mercenaries:units,links};
  const inventory=await readInventory(sql,row.id);const upkeep=await maintenanceAccount(sql,row.id,now);
  const attackEquipment=selectEquipment(inventory,army.participants,'attack',!upkeep.paused);
  const defenseEquipment=selectEquipment(inventory,army.participants,'defense',!upkeep.paused);
  const progress=(await sql.query('SELECT quest_id,completions FROM character_quest_progress WHERE character_id=$1',[row.id])).rows;
  const loot=(await sql.query('SELECT loot_id AS id,name FROM character_loot WHERE character_id=$1 ORDER BY acquired_at,loot_id',[row.id])).rows as {id:string;name:string}[];
  const awards=(await sql.query('SELECT award_id AS id,points FROM progression_awards WHERE character_id=$1 ORDER BY created_at,award_id',[row.id])).rows as {id:string;points:number}[];
  const quests=alpha.quests.map(quest=>{
    const missing=Object.fromEntries(Object.entries(quest.items).map(([id,n])=>[id,Math.max(0,n-(inventory.find(i=>i.id===id)?.quantity??0))]).filter(([,n])=>Number(n)>0)) as Record<string,number>;
    const missingCost=Object.entries(missing).reduce((n,[id,q])=>n+alpha.items.find(i=>i.id===id)!.price*q,0);
    const requiresLootName=quest.requiresLoot?lootById.get(quest.requiresLoot)!.name:null;
    const lockReason=row.attained_level<quest.level?'Level '+quest.level+' required':Object.keys(missing).length?'Equipment required':quest.requiresLoot&&!loot.some(l=>l.id===quest.requiresLoot)?requiresLootName+' required':army.participants<quest.army?'Army of '+quest.army+' required':row.mana<quest.mana?'More Mana required':null;
    return {...quest,missing,missingCost,completions:progress.find(p=>p.quest_id===quest.id)?.completions??0,ready:!lockReason,lockReason,requiresLootName};
  });
  const next=(value:number,max:number,updated:Date,seconds:number)=>value<max?new Date(new Date(updated).getTime()+seconds*1000).toISOString():null;
  const calling=callingFor(row.profile_class);
  const healthSeconds=recoverySeconds(row.profile_class,'health',alpha.resources.healthSeconds),manaSeconds=recoverySeconds(row.profile_class,'mana',alpha.resources.manaSeconds),spiritSeconds=recoverySeconds(row.profile_class,'spirit',alpha.resources.spiritSeconds);
  const manaNextAt=next(row.mana,row.max_mana,row.mana_updated_at,manaSeconds);
  const sword=inventory.find(i=>i.id===rules.weapon.id&&i.quantity>0);
  const land=await estateState(sql,row.id,wallet.balance,upkeep.hourly_rate,row.attained_level);
  const activeEquipmentUpkeep=upkeep.paused?0:upkeep.hourly_rate;
  const economy={grossHourlyIncome:land.hourlyIncome,propertyUpkeep:land.hourlyUpkeep,equipmentUpkeep:activeEquipmentUpkeep,
    scheduledEquipmentUpkeep:upkeep.hourly_rate,otherUpkeep:0,totalUpkeep:land.hourlyUpkeep+activeEquipmentUpkeep,
    netHourlyIncome:land.hourlyIncome-land.hourlyUpkeep-activeEquipmentUpkeep,maintenancePaused:upkeep.paused};
  const battleStats=(await sql.query(`SELECT count(*)::int AS total,
    count(*) FILTER(WHERE (attacker_id=$1 AND outcome='attacker_win') OR (defender_id=$1 AND outcome='defender_win'))::int AS wins,
    count(*) FILTER(WHERE (attacker_id=$1 AND outcome='defender_win') OR (defender_id=$1 AND outcome='attacker_win'))::int AS losses,
    (SELECT count(*)::int FROM bounty_kills WHERE claimant_id=$1) AS kills,
    COALESCE((SELECT health_knockouts FROM legacy_field_statistics WHERE character_id=$1),0)::int AS "legacyKnockouts",
    count(*) FILTER(WHERE (defender_id=$1 AND result->'defenderHealthAfter'='0'::jsonb) OR
      (attacker_id=$1 AND COALESCE(result->'attackerHealthAfterDamage',result->'attackerHealthAfter')='0'::jsonb))::int AS deaths
    FROM battles WHERE attacker_id=$1 OR defender_id=$1`,[row.id])).rows[0] as CharacterState['battleStats'];
  const accountCreated=new Date((await sql.query('SELECT created_at FROM accounts WHERE id=$1',[row.account_id])).rows[0]!.created_at);
  const untrainedAttack=rules.baseAttack+(row.attained_level-1)*rules.attackPerLevel+(army.participants-1)*rules.unit.attack+attackEquipment.attack;
  const untrainedDefense=rules.baseDefense+(row.attained_level-1)*rules.defensePerLevel+(army.participants-1)*rules.unit.defense+defenseEquipment.defense;
  return {invitationCode:await invitationCode(sql,row.id),id:row.id,name:row.name,xp:row.xp,level:row.attained_level,levelXp:row.level_xp,levelRequirement:levelRequirement(row.attained_level),xpToNext:levelRequirement(row.attained_level)-row.level_xp,
    health:row.health,maxHealth:row.max_health,mana:row.mana,maxMana:row.max_mana,spirit:row.spirit,maxSpirit:row.max_spirit,energy:row.mana,
    bankedGold:(await sql.query('SELECT balance FROM vault_accounts WHERE character_id=$1',[row.id])).rows[0]?.balance??0,gold:wallet.balance,units,attack:callingPower(trainedPower(untrainedAttack,row.attack_training),calling.attackPercent),defense:callingPower(trainedPower(untrainedDefense,row.defense_training),calling.defensePercent),
    equipped:Boolean(sword),inventoryId:sword?.inventoryId??null,inventory,questsCompleted:progress.reduce((n,p)=>n+p.completions,0),quests,loot,awards,
    stateVersion:row.state_version,skillPoints:row.skill_points,className:row.profile_class,
    attackReadyAt:now.toISOString(),serverTime:now.toISOString(),energyNextAt:manaNextAt,manaNextAt,
    spiritNextAt:next(row.spirit,row.max_spirit,row.spirit_updated_at,spiritSeconds),
    healthNextAt:next(row.health,row.max_health,row.health_updated_at,healthSeconds),
    calling:{rulesetId:strategy.id,description:calling.description,attackPercent:calling.attackPercent,defensePercent:calling.defensePercent,healthSeconds,manaSeconds,spiritSeconds,
      changeReadyAt:row.calling_changed_at?new Date(+new Date(row.calling_changed_at)+strategy.callingChange.cooldownSeconds*1000).toISOString():null,changeCost:row.calling_changed_at?strategy.callingChange.laterCost:0},
    land,economy,battleStats,rulesetId:alpha.id,army,attackEquipment,defenseEquipment,
    accountCreatedAt:accountCreated.toISOString(),accountAgeDays:Math.max(0,Math.floor((+now-+accountCreated)/86400000)),
    training:{attack:row.attack_training,defense:row.defense_training,attackBonusPercent:row.attack_training*alpha.combatSkills.percentPerRating,defenseBonusPercent:row.defense_training*alpha.combatSkills.percentPerRating,untrainedAttack,untrainedDefense},
    maintenance:{hourlyRate:upkeep.hourly_rate,reserveGold:upkeep.reserve_gold,arrearsGold:upkeep.arrears_gold,paused:upkeep.paused,
      resumeCost:Number(BigInt(upkeep.arrears_gold)+(BigInt(upkeep.reserve_gold)<BigInt(upkeep.hourly_rate)?BigInt(upkeep.hourly_rate)-BigInt(upkeep.reserve_gold):0n))}};
}
export async function getState(db:Database,accountId:string):Promise<CharacterState> {
  return transaction(db,async client=>{
    const requestedAt=await clock(client);
    const overdue=(await client.query("SELECT sponsor_id FROM bounties WHERE sponsor_id=(SELECT id FROM characters WHERE account_id=$1) AND status='active' AND expires_at<=$2 LIMIT 1",[accountId,requestedAt])).rows[0];
    if(overdue){await lockBountyEscrow(client);await settleExpiredBounties(client,await clock(client),null,overdue.sponsor_id);}
    const row=(await client.query<CharacterRow>('SELECT * FROM characters WHERE account_id=$1 FOR UPDATE',[accountId])).rows[0];
    if (!row) throw new GameError('CHARACTER_NOT_FOUND','Your character could not be found.',404);
    const now=await clock(client);return stateFrom(client,await materialize(client,row,now),now);
  });
}
export async function listOpponents(db:Database,characterId:string,cursor?:string,developmentBotsEnabled=false) {
  let after:string|null=null,afterId:string|null=null;
  if (cursor!==undefined) {
    if(typeof cursor!=='string') throw new GameError('INVALID_CURSOR','Invalid rival page.');
    const parts=cursor.split('~');after=parts[0]??'';afterId=parts[1]??null;
    if (parts.length!==2||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(after)||!Number.isFinite(Date.parse(after))||!afterId||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(afterId)) throw new GameError('INVALID_CURSOR','Invalid rival page.');
  }
  const actor=(await db.query('SELECT attained_level FROM characters WHERE id=$1',[characterId])).rows[0]!;
  const range=Math.max(2,Math.ceil(actor.attained_level*0.2));
  const rows=(await db.query(`SELECT c.*,b.tier AS bot_tier,b.recovered_at AS bot_recovered_at,to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,
    (SELECT COALESCE(SUM(quantity),0)::int FROM army_stacks WHERE character_id=c.id) AS units,
    (SELECT count(*)::int FROM army_links l WHERE c.id IN (l.low_id,l.high_id) AND l.status='accepted') AS allies
    FROM characters c LEFT JOIN development_bots b ON b.character_id=c.id WHERE c.id<>$1 AND c.attained_level BETWEEN $2 AND $3 AND ABS(c.attained_level-$6)<=GREATEST(2,CEIL(c.attained_level*0.2))
    AND (b.character_id IS NULL OR ($7 AND b.active))
    AND ($4::timestamptz IS NULL OR (c.created_at,c.id)<($4::timestamptz,$5::uuid))
    ORDER BY c.created_at DESC,c.id DESC LIMIT 21`,[characterId,actor.attained_level-range,actor.attained_level+range,after,afterId,actor.attained_level,developmentBotsEnabled])).rows;
  const eligible=rows.filter(row=>areRivals(actor.attained_level,row.attained_level));const more=eligible.length>20;
  const now=await clock(db);
  const opponents=eligible.slice(0,20).map(row=>({id:row.id as string,name:row.name as string,level:row.attained_level as number,className:row.profile_class as string,
    units:row.units as number,armySize:Math.min(row.bot_tier?refinements.bots.armyCap:Number.MAX_SAFE_INTEGER,activeArmy(row.attained_level,row.units,row.allies,row.legacy_army_floor).participants),maxHealth:row.max_health as number,
    health:regenerate(row.health,row.max_health,new Date(row.health_updated_at),now,recoverySeconds(row.profile_class,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount).value,
    botTier:row.bot_tier as string|null,
    cursor:row.cursor_at+'~'+row.id}));
  return {opponents,nextCursor:more?opponents.at(-1)!.cursor:null};
}
export async function recentBattles(db:Database,characterId:string) {
  return (await db.query(`SELECT id,result||jsonb_build_object('attackerId',attacker_id,'defenderId',defender_id,'winnerId',CASE WHEN outcome='attacker_win' THEN attacker_id ELSE defender_id END) AS result,created_at FROM battles WHERE attacker_id=$1 OR defender_id=$1 ORDER BY created_at DESC,id DESC LIMIT 10`,[characterId])).rows;
}
export async function getBattle(db:Database,accountId:string,battleId:string) {
  const row=(await db.query(`SELECT b.id,b.result,b.ruleset_id,b.created_at,b.attacker_id,b.defender_id,b.outcome FROM battles b JOIN characters c ON c.account_id=$1
    WHERE b.id=$2 AND (b.attacker_id=c.id OR b.defender_id=c.id)`,[accountId,battleId])).rows[0];
  if (!row) throw new GameError('BATTLE_NOT_FOUND','This battle is unavailable to your character.',404);return row;
}
