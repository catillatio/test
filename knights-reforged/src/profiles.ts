import {type Database,transaction} from './db.js';
import {clock,lockCharacters,materialize,stateFrom,type CharacterState,type GameRuntime} from './game.js';
import {alpha,areRivals} from './alpha-rules.js';
import {community} from './community-rules.js';

export function ownedProperties(state:CharacterState){
  // Sum saved holding rates, not today's catalog rates. Legacy purchases retain
  // their actual economics even when the current catalog has different values.
  const groups=new Map<string,{id:string;name:string;quantity:number;grossIncome:number;upkeep:number;illustration?:{atlas:string;row:number;column:number};art:string}>();
  for(const holding of state.land.holdings){
    const catalog=alpha.properties.find(p=>p.id===holding.propertyId),old=groups.get(holding.propertyId);
    const entry=old??{id:holding.propertyId,name:holding.name,quantity:0,grossIncome:0,upkeep:0,illustration:catalog?.illustration,art:catalog?.art??'fields'};
    entry.quantity+=holding.quantity;entry.grossIncome+=holding.hourlyIncome;entry.upkeep+=holding.hourlyUpkeep;groups.set(holding.propertyId,entry);
  }
  return [...groups.values()].sort((a,b)=>a.grossIncome-b.grossIncome||a.name.localeCompare(b.name));
}
export async function publicProfile(db:Database,characterId:string,runtime:GameRuntime={}){
  return transaction(db,async sql=>{
    const [row]=await lockCharacters(sql,[characterId]);const now=await clock(sql);
    const state=await stateFrom(sql,await materialize(sql,row!,now),now,runtime);
    const bot=(await sql.query('SELECT tier,active FROM development_bots WHERE character_id=$1',[characterId])).rows[0];
    // Explicit allowlist: no wallet, account ID/name, sessions, invitation code,
    // inventory entry IDs, upkeep reserves, receipts, treasury or private reports.
    return {id:state.id,name:state.name,level:state.level,className:state.className,xp:state.xp,levelXp:state.levelXp,
      xpToNext:state.xpToNext,levelRequirement:state.levelRequirement,health:state.health,maxHealth:state.maxHealth,
      questsCompleted:state.questsCompleted,accountAgeDays:state.accountAgeDays,
      battleStats:state.battleStats,economy:state.economy,army:{participants:state.army.participants,capacity:state.army.capacity,total:state.army.total,allies:state.army.allies,mercenaries:state.army.mercenaries},
      inventory:state.inventory.filter(item=>item.quantity>0).map(({inventoryId,resaleSteps,maxSell,...item})=>item),
      properties:ownedProperties(state),temporaryRival:!!bot,botTier:bot?.tier??null,botActive:!!bot?.active,
      calling:{description:state.calling.description,attackPercent:state.calling.attackPercent,defensePercent:state.calling.defensePercent}};
  });
}
export type PublicProfile=Awaited<ReturnType<typeof publicProfile>>;
export function attackAvailability(actor:CharacterState,target:PublicProfile,developmentBotsEnabled:boolean){
  const reason=actor.id===target.id?'You cannot attack yourself.':target.temporaryRival&&(!developmentBotsEnabled||!target.botActive)?'This temporary rival is unavailable.':
    !areRivals(actor.level,target.level)?'Choose an opponent nearer your level.':target.health<community.combat.defenderMinimumHealth?'Opponent defeated — 0 Health. They must recover before another attack.':
    actor.health<alpha.combat.minimumHealth?'You need at least '+alpha.combat.minimumHealth+' Health to attack.':actor.spirit<alpha.combat.spiritCost?'Wait for Spirit to recover.':
    null;
  return {targetId:target.id,name:target.name,health:target.health,maxHealth:target.maxHealth,allowed:!reason,reason,
    eligible:actor.id!==target.id&&areRivals(actor.level,target.level)&&target.health>=community.combat.defenderMinimumHealth&&(!target.temporaryRival||(developmentBotsEnabled&&target.botActive))};
}

export async function recruitmentAvailability(db:Database,actor:CharacterState,target:PublicProfile,botRecruitmentEnabled:boolean){
 const pair=[actor.id,target.id].sort();
 const link=(await db.query('SELECT status,inviter_id FROM army_links WHERE low_id=$1 AND high_id=$2',pair)).rows[0];
 const reason=actor.id===target.id?'You cannot invite yourself.':link?.status==='accepted'?'Already in your army.':link?.status==='pending'?(link.inviter_id===actor.id?'Army request pending their acceptance.':'They invited you. Accept or reject in Recruit → My Army.'):
  target.temporaryRival&&(!botRecruitmentEnabled||!target.botActive)?'Temporary-rival recruitment is disabled.':
  target.temporaryRival&&actor.army.total>=actor.army.capacity?'Your active army is full. Increase your level or release a member first.':null;
 return {allowed:!reason,reason,status:link?.status??'none',automatic:target.temporaryRival&&botRecruitmentEnabled};
}
