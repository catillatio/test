import {resolveBattle} from './combat.js';
import { createHash,randomInt,randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type Database,transaction } from './db.js';
import {restoreHealth} from './healing.js';
import {callingName} from './calling-presentation.js';
import {validateTradeQuote} from './trade.js';
import {syncExperience,tutorialAction,levelCelebration} from './experience.js';
import { GameError } from './errors.js';
import { rules } from './rules.js';
import { alpha,propertyById,itemById,questById,lootById,areRivals } from './alpha-rules.js';
import { clock,lockCharacters,materialize,stateFrom,type CharacterRow } from './game.js';
import { ledger,creditGold } from './economy.js';
import { purchaseItems,sellItem,readInventory } from './inventory.js';
import {propertyName} from './property-presentation.js';
import { grantExperience,awardMilestones,allocateSkill } from './progression.js';
import { refreshMaintenance,fundMaintenance,automaticallyFundMaintenance } from './maintenance.js';
import {ContentPolicyError,recordContentRejection} from './content-policy.js';
import { buyEstate,sellEstate } from './estate.js';
import {strategy} from './strategy-rules.js';
import {prepareBot} from './development.js';
import {community} from './community-rules.js';
import {refinements} from './refinement-rules.js';
import {progressionEconomy} from './progression-economy-rules.js';
import {pvp} from './pvp-rules.js';
import {vaultTransfer} from './pvp-economy.js';
import {postMessage,reportMessage,removeMessage,armyEvent,validateInvitation} from './community.js';
import {lockBountyEscrow,settleExpiredBounties,placeBounty,cancelBounty} from './bounties.js';

const uuid=z.string().uuid().transform(value=>value.toLowerCase());
const id=z.string().min(1).max(64).regex(/^[a-z0-9-]+$/);
const quantity=(max:number)=>z.union([z.number().int().min(1).max(max),z.string().max(16).regex(/^[1-9][0-9]*$/).transform(Number).pipe(z.number().int().min(1).max(max))]);
const intents={
  sound:z.object({enabled:z.enum(['0','1']),volume:z.coerce.number().int().min(0).max(100)}),
  heal:z.object({maxCost:z.coerce.number().int().min(0).max(2147483647).optional()}),
  tutorial:z.object({action:z.enum(['start','resume','skip','next','back','finish','replay'])}),
  quest:z.object({questId:id}),
  recruit:z.object({unitId:z.literal(rules.unit.id),quantity:quantity(alpha.limits.mercenaries)}),
  buy:z.object({itemId:id,quantity:quantity(alpha.limits.transaction).default(1)}),
  equip:z.object({inventoryEntryId:uuid}),
  attack:z.object({targetCharacterId:uuid}),
  land_buy:z.object({propertyId:id,quantity:quantity(alpha.limits.landTransaction),quoteId:uuid.optional()}),
  sell:z.object({itemId:id,quantity:quantity(alpha.limits.transaction).default(1)}),
  land_sell:z.object({propertyId:id,quantity:quantity(alpha.limits.landTransaction),quoteId:uuid.optional()}),
  skill:z.object({resource:z.enum(['health','mana','spirit','attack','defense'])}),
  maintain:z.object({}),
  vault_deposit:z.object({amount:quantity(pvp.vault.maximumBalance)}),
  vault_withdraw:z.object({amount:quantity(pvp.vault.maximumBalance)}),
  quest_buy:z.object({questId:id}),
  invite:z.object({targetCharacterId:uuid}),
  accept:z.object({targetCharacterId:uuid}),
  remove:z.object({targetCharacterId:uuid}),
  reject:z.object({targetCharacterId:uuid}),
  invite_code:z.object({code:z.string().trim().toUpperCase().regex(/^[A-F0-9]{12}$/, 'Enter the 12-character invitation code.')}),
  comment:z.object({profileId:uuid,body:z.string().min(1).max(1000)}),
  broadcast:z.object({body:z.string().min(1).max(1000)}),
  social_report:z.object({messageId:uuid,reason:z.enum(['spam','abuse','other'])}),
  social_remove:z.object({messageId:uuid}),
  profile:z.object({className:z.enum(['Freeblade','Warden','Spellward'])}),
  bounty_place:z.object({targetCharacterId:uuid,amount:quantity(refinements.bounties.maximum),quotedRulesetId:z.enum([pvp.id,refinements.id]).optional()}),
  bounty_cancel:z.object({bountyId:uuid}),
};
export type CommandKind=keyof typeof intents;
export interface CommandResult { commandId:string;kind:CommandKind;message:string;battleId?:string;inventoryEntryId?:string;holdingId?:string;data?:Record<string,unknown>; }
const fingerprint=(kind:string,intent:unknown)=>createHash('sha256').update(JSON.stringify({kind,intent})).digest('hex');

export async function executeCommand(db:Database,accountId:string,commandId:unknown,kind:CommandKind,raw:unknown,runtime:{developmentBotsEnabled?:boolean;developmentBotBountiesEnabled?:boolean;developmentBotRecruitmentEnabled?:boolean}={}):Promise<CommandResult> {
  const command=uuid.safeParse(commandId);if (!command.success) throw new GameError('INVALID_COMMAND_ID','Reload for a fresh action ID.');
  const parsed=intents[kind].safeParse(raw);
  if (!parsed.success) throw new GameError('INVALID_INTENT',parsed.error.issues[0]?.message??'Invalid action.');
  const intent=parsed.data as Record<string,unknown>,hash=fingerprint(kind,intent),key=command.data;
  return transaction(db,async sql=>{
    const inserted=await sql.query('INSERT INTO command_receipts(account_id,command_id,kind,intent_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING command_id',[accountId,key,kind,hash]);
    if (!inserted.rows.length) {
      const old=(await sql.query('SELECT intent_hash,result FROM command_receipts WHERE account_id=$1 AND command_id=$2',[accountId,key])).rows[0]!;
      // Pre-alpha buy receipts omitted quantity. Accept only the identical
      // one-copy intent, never a changed item or a larger replayed purchase.
      const legacy=kind==='buy'&&intent.quantity===1?fingerprint(kind,{itemId:intent.itemId}):hash;
      if (old.intent_hash!==hash&&old.intent_hash!==legacy) throw new GameError('COMMAND_CONFLICT','This action ID belongs to a different intent.',409);
      if (!old.result) throw new GameError('COMMAND_PENDING','The action is still processing.',409);
      return old.result as CommandResult;
    }
    if(kind==='recruit')throw new GameError('GOLD_RECRUITMENT_REMOVED','Invite allies through Recruit or a player profile. Existing army members are preserved.',410);
    const actorId=(await sql.query('SELECT c.id FROM characters c JOIN accounts a ON a.id=c.account_id WHERE c.account_id=$1 AND NOT a.login_disabled AND NOT EXISTS(SELECT 1 FROM development_bots b WHERE b.character_id=c.id)',[accountId])).rows[0]?.id as string|undefined;
    if (!actorId) throw new GameError('CHARACTER_NOT_FOUND','Your character was not found.',404);
    const membership=kind==='invite'||kind==='invite_code'||kind==='accept'||kind==='reject'||kind==='remove';
    let targetId=(kind==='attack'||kind==='bounty_place'||(membership&&kind!=='invite_code'))?intent.targetCharacterId as string:kind==='comment'?intent.profileId as string:null;
    if(kind==='invite_code'){
      targetId=(await sql.query('SELECT character_id FROM army_invitation_codes WHERE code=$1',[intent.code])).rows[0]?.character_id??null;
      if(!targetId)throw new GameError('INVITATION_CODE_NOT_FOUND','No warrior has that invitation code.',404);
    }
    if (targetId===actorId&&kind!=='comment') throw new GameError(kind==='attack'?'SELF_ATTACK':kind==='bounty_place'?'SELF_BOUNTY':'SELF_INVITE','Choose another warrior.');
    if(kind==='attack'||kind==='bounty_place'||kind==='bounty_cancel')await lockBountyEscrow(sql);
    const now=await clock(sql);
    if(kind==='attack'||kind==='bounty_place'||kind==='bounty_cancel'){
      await settleExpiredBounties(sql,now,targetId);
    }
    const locked=await lockCharacters(sql,targetId?[actorId,targetId]:[actorId]);
    let actor=locked.find(row=>row.id===actorId)!;
    actor=await materialize(sql,actor,now);
    let target=targetId?locked.find(row=>row.id===targetId)!:null;
    if(target&&kind==='attack'&&(await sql.query(`SELECT 1 FROM accounts a WHERE a.id=$1 AND a.login_disabled
      AND NOT EXISTS(SELECT 1 FROM development_bots b WHERE b.character_id=$2)`,[target.account_id,target.id])).rows.length)
      throw new GameError('OPPONENT_UNAVAILABLE','This opponent is no longer available for battle.',409);
    let targetIsBot=false;
    if(target&&kind==='attack'){
      targetIsBot=await prepareBot(sql,target.id,now,!!runtime.developmentBotsEnabled);
      if(targetIsBot)target=(await sql.query<CharacterRow>('SELECT * FROM characters WHERE id=$1',[target.id])).rows[0]!;
    }
    if(target&&membership){
      const bot=(await sql.query('SELECT active FROM development_bots WHERE character_id=$1',[target.id])).rows[0];
      targetIsBot=!!bot;
      if(bot&&(!bot.active||!runtime.developmentBotsEnabled||!runtime.developmentBotRecruitmentEnabled)&&kind!=='remove')
        throw new GameError('BOT_ARMY_LINK','Temporary-rival recruitment is disabled.',409);
    }
    if (target&&kind==='attack') target=await materialize(sql,target,now);
    const state=await stateFrom(sql,actor,now,runtime);
    if((kind==='land_buy'||kind==='land_sell')&&typeof intent.quoteId==='string')await validateTradeQuote(sql,intent.quoteId,accountId,actorId,kind,intent.propertyId as string,intent.quantity as number,now,state.gold,state.level,state.economy.netHourlyIncome,key);
    await syncExperience(sql,actorId,now);
    const result:CommandResult={commandId:key,kind,message:''};

    if(kind==='sound'){await sql.query('INSERT INTO sound_preferences(character_id,enabled,volume,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(character_id) DO UPDATE SET enabled=$2,volume=$3,updated_at=$4',[actorId,intent.enabled==='1',intent.volume,now]);result.message='Sound preferences saved.';}else if(kind==='heal'){result.data=await restoreHealth(sql,actor,state.gold,key,now,intent.maxCost as number|undefined);result.message=result.data.missing?'Health restored to maximum for '+result.data.cost+' gold.':'Your Health is already full. No gold was charged.';}else if(kind==='tutorial'){result.data={tutorialAction:intent.action};await tutorialAction(sql,actorId,intent.action as string,now);result.message=intent.action==='skip'?'Tutorial paused. Resume in Help or Profile.':intent.action==='finish'?'Tutorial complete! You are ready to build your kingdom.':'Your tutorial is ready.';}else if(kind==='vault_deposit'||kind==='vault_withdraw'){
      result.data=await vaultTransfer(sql,actorId,intent.amount as number,kind==='vault_deposit',key,now);
      result.message=String(intent.amount)+' gold '+(kind==='vault_deposit'?'deposited in your protected Vault.':'withdrawn into your unbanked purse.');
    }else if(kind==='comment'||kind==='broadcast'){
      const posted=await postMessage(sql,actorId,kind==='comment'?targetId:null,intent.body as string,key,now,actor.attained_level,state.questsCompleted);
      result.data=posted;result.message=kind==='comment'?'Comment posted.':'Broadcast sent to the realm.';
    }else if(kind==='social_report'){
      result.data=await reportMessage(sql,actorId,intent.messageId as string,intent.reason as string,now);result.message='Report received. Realm moderators can review it.';
    }else if(kind==='social_remove'){
      result.data=await removeMessage(sql,actorId,intent.messageId as string,now);result.message='Message removed from public feeds.';
    }else if (kind==='quest'||kind==='quest_buy') {
      const quest=questById.get(intent.questId as string);
      if (!quest) throw new GameError('QUEST_NOT_FOUND','That quest is not available.',404);
      if (actor.attained_level<quest.level) throw new GameError('LEVEL_REQUIRED','Reach level '+quest.level+' first.',409);
      const projected=state.quests.find(entry=>entry.id===quest.id)!;
      if (kind==='quest_buy') {
        const purchase=await purchaseItems(sql,actorId,actor.attained_level,projected.missing,key,now);
        await refreshMaintenance(sql,actorId,key,now);
        result.message='Required equipment purchased for '+purchase.cost+' gold. Run the quest separately when all requirements are met.';
        result.data={goldSpent:purchase.cost,items:projected.missing,questId:quest.id};
      } else {
        if (Object.keys(projected.missing).length) throw new GameError('MISSING_EQUIPMENT','Buy the required equipment before attempting this quest.',409);
        if (quest.requiresLoot&&!state.loot.some(loot=>loot.id===quest.requiresLoot)) throw new GameError('LOOT_REQUIRED','Discover the '+lootById.get(quest.requiresLoot)!.name+' before attempting this quest.',409);
        if (state.army.participants<quest.army) throw new GameError('ARMY_REQUIRED','This quest needs '+quest.army+' participating army members.',409);
        if (actor.mana<quest.mana) throw new GameError('INSUFFICIENT_MANA','Wait for Mana to recover or complete a cheaper quest.',409);
        const gold=randomInt(quest.goldMin,quest.goldMax+1);
        await sql.query('UPDATE characters SET mana=mana-$2,mana_updated_at=CASE WHEN mana=max_mana THEN $3 ELSE mana_updated_at END WHERE id=$1',[actorId,quest.mana,now]);
        await creditGold(sql,actorId,BigInt(gold),key,'quest_reward',alpha.id);
        const progression=await grantExperience(sql,actorId,quest.xp,now);
        let lootName:string|null=null;
        if (quest.loot&&!state.loot.some(loot=>loot.id===quest.loot!.id)&&((quest.loot.firstGuaranteed&&projected.completions===0)||randomInt(100)<quest.loot.chance)) {
          const insertedLoot=await sql.query('INSERT INTO character_loot(character_id,loot_id,name,source_quest,ruleset_id,acquired_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING loot_id',
            [actorId,quest.loot.id,quest.loot.name,quest.id,alpha.id,now]);
          if (insertedLoot.rows.length) lootName=quest.loot.name;
        }
        const details={gold,xp:progression.xpAwarded,mana:quest.mana,levelGained:progression.gained,loot:lootName,questId:quest.id,questName:quest.name};
        await sql.query('INSERT INTO quest_runs(id,character_id,quest_id,ruleset_id,energy_spent,gold_reward,xp_reward,reward_details,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [randomUUID(),actorId,quest.id,alpha.id,quest.mana,gold,progression.xpAwarded,details,now]);
        await sql.query('INSERT INTO character_quest_progress(character_id,quest_id,completions) VALUES($1,$2,1) ON CONFLICT(character_id,quest_id) DO UPDATE SET completions=character_quest_progress.completions+1',[actorId,quest.id]);
        const milestones=await awardMilestones(sql,actorId);
        result.data={...details,milestones};result.message='Quest complete: '+gold+' gold, '+progression.xpAwarded+' XP; '+quest.mana+' Mana used.'+(progression.gained?' Level '+progression.level+' reached!':'')+(lootName?' Loot: '+lootName+'.':'');
      }
    } else if (kind==='buy') {
      const purchase=await purchaseItems(sql,actorId,actor.attained_level,{[intent.itemId as string]:intent.quantity as number},key,now);
      result.inventoryEntryId=purchase.acquired[intent.itemId as string];await refreshMaintenance(sql,actorId,key,now);
      result.message='Purchased '+intent.quantity+' '+itemById.get(intent.itemId as string)!.name+' for '+purchase.cost+' gold. Your army selects its best equipment automatically.';
      result.data={goldSpent:purchase.cost,quantity:intent.quantity,itemId:intent.itemId,category:itemById.get(intent.itemId as string)!.category};
    } else if (kind==='sell') {
      const refund=await sellItem(sql,actorId,intent.itemId as string,intent.quantity as number,key);
      await refreshMaintenance(sql,actorId,key,now);
      result.message='Sold '+intent.quantity+' copies for '+refund+' gold.';result.data={goldReceived:refund,category:itemById.get(intent.itemId as string)!.category};
    } else if (kind==='equip') {
      const item=(await readInventory(sql,actorId)).find(entry=>entry.inventoryId===intent.inventoryEntryId&&entry.quantity>0);
      if (!item) throw new GameError('ITEM_NOT_OWNED','You can only use your own equipment.',403);
      if (item.category==='weapon') await sql.query("INSERT INTO equipment_slots(character_id,slot,inventory_entry_id) VALUES($1,'weapon',$2) ON CONFLICT(character_id,slot) DO UPDATE SET inventory_entry_id=EXCLUDED.inventory_entry_id",[actorId,item.inventoryId]);
      result.message='Equipment available to your army. Best attack and defense equipment are selected automatically.';
    } else if (kind==='land_buy') {
      const purchase=await buyEstate(sql,actorId,actor.attained_level,intent.propertyId as string,intent.quantity as number,key,now);
      result.holdingId=purchase.holdingId;result.message=intent.quantity+' '+propertyName(intent.propertyId as string,propertyById.get(intent.propertyId as string)!.name)+' purchased for '+purchase.cost+' gold. Income joins your shared hourly cycle; the first partial period is prorated.';
      result.data={goldSpent:purchase.cost,propertyId:intent.propertyId,quantity:intent.quantity,itemName:propertyName(intent.propertyId as string,propertyById.get(intent.propertyId as string)!.name)};
    } else if (kind==='land_sell') {
      const refund=await sellEstate(sql,actorId,intent.propertyId as string,intent.quantity as number,key,now);
      result.message='Sold '+intent.quantity+' properties for '+refund+' gold. Earned time was settled first; the shared payment clock is unchanged.';result.data={goldReceived:refund};
    } else if (kind==='skill') {
      const allocation=await allocateSkill(sql,actorId,intent.resource as 'health'|'mana'|'spirit'|'attack'|'defense',key,now);
      result.message=intent.resource==='attack'||intent.resource==='defense'?intent.resource+' training increased to '+allocation.capacity+' (+ '+allocation.capacity+'%).':'Maximum '+(intent.resource==='spirit'?'Stamina':intent.resource)+' increased by '+allocation.delta+'.';result.data=allocation;
    } else if (kind==='maintain') {
      await fundMaintenance(sql,actorId,key,now);
      result.message='Upkeep is funded. Maintained equipment is available to your army.';
    } else if (kind==='profile') {
      if(actor.profile_class===intent.className){result.message='You already follow the '+callingName(String(intent.className))+' Calling.';}
      else{
        if(actor.calling_changed_at&&+now<+new Date(actor.calling_changed_at)+strategy.callingChange.cooldownSeconds*1000)
          throw new GameError('CALLING_COOLDOWN','You may change your Calling once every 24 hours.',409);
        const cost=actor.calling_changed_at?strategy.callingChange.laterCost:0;
        if(cost)await ledger(sql,key,'calling_change',[{characterId:actorId,amount:-cost}],strategy.id);
        await sql.query('UPDATE characters SET profile_class=$2,calling_changed_at=$3,health_updated_at=$3,mana_updated_at=$3,spirit_updated_at=$3 WHERE id=$1',[actorId,intent.className,now]);
        await sql.query('INSERT INTO calling_changes(id,character_id,old_calling,new_calling,gold_cost,command_id,ruleset_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),actorId,actor.profile_class,intent.className,cost,key,strategy.id,now]);
        result.message='Your Calling is now '+callingName(String(intent.className))+'. Recovery starts a fresh interval; your skill allocations are preserved.';
      }
    } else if(kind==='bounty_place'&&target){
      if(!areRivals(actor.attained_level,target.attained_level))throw new GameError('RIVAL_LEVEL_RANGE','Place a bounty on a rival near your own level.',409);
      const placed=await placeBounty(sql,actorId,target.id,intent.amount as number,key,now,!!runtime.developmentBotsEnabled&&!!runtime.developmentBotBountiesEnabled);
      result.data=placed;result.message='Bounty placed: '+placed.amount+' gold held in escrow; '+placed.fee+' gold placement fee.';
    } else if(kind==='bounty_cancel'){
      const canceled=await cancelBounty(sql,actorId,intent.bountyId as string,key,now);
      result.data=canceled;result.message='Bounty canceled. '+canceled.refund+' escrowed gold returned; the placement fee is retained.';
    } else if (membership&&target) {
      const pair=[actorId,target.id].sort();
      const link=(await sql.query('SELECT * FROM army_links WHERE low_id=$1 AND high_id=$2',pair)).rows[0];
      let eventKind:string;
      if (kind==='invite'||kind==='invite_code') {
        if (link&&link.status!=='declined') throw new GameError('INVITATION_EXISTS','You already have an invitation or army link with that player.',409);
        await validateInvitation(sql,actorId,target.id,now);
        if(targetIsBot&&state.army.total>=state.army.capacity)throw new GameError('ARMY_FULL','Your active army is full. Increase your level or release a member first.',409);
        for (const member of (targetIsBot?[actorId]:pair)) {
          const count=(await sql.query("SELECT count(*)::int AS n FROM army_links WHERE $1 IN (low_id,high_id) AND status<>'declined'",[member])).rows[0]!.n;
          if (count>=100) throw new GameError('ROSTER_LIMIT','That army roster is full.',409);
        }
        await sql.query("INSERT INTO army_links(low_id,high_id,inviter_id,status) VALUES($1,$2,$3,'pending') ON CONFLICT(low_id,high_id) DO UPDATE SET inviter_id=EXCLUDED.inviter_id,status='pending',updated_at=$4",
          [pair[0],pair[1],actorId,now]);
        if(targetIsBot)await sql.query("UPDATE army_links SET status='accepted',updated_at=$3 WHERE low_id=$1 AND high_id=$2",[pair[0],pair[1],now]);
        result.message='Invitation sent to '+target.name+'. Waiting for their acceptance.';eventKind='invited';
        if(targetIsBot){result.message=target.name+' immediately accepted and joined your army. Passive rivals never recruit or attack players.';eventKind='accepted';}
      } else if (kind==='accept') {
        if (!link||link.status!=='pending'||link.inviter_id===actorId) throw new GameError('INVITATION_UNAVAILABLE','Only the invited player can accept a pending invitation.',403);
        await sql.query("UPDATE army_links SET status='accepted',updated_at=$3 WHERE low_id=$1 AND high_id=$2",[pair[0],pair[1],now]);
        result.message=target.name+' is now an ally. Each leader equips their own participating army.';eventKind='accepted';
      } else {
        if(kind==='reject'&&(!link||link.status!=='pending'||link.inviter_id===actorId))throw new GameError('INVITATION_UNAVAILABLE','Only the invited player can reject a pending invitation.',403);
        if (!link||link.status==='declined') throw new GameError('INVITATION_UNAVAILABLE','That army link is unavailable.',404);
        await sql.query("UPDATE army_links SET status='declined',updated_at=$3 WHERE low_id=$1 AND high_id=$2",[pair[0],pair[1],now]);
        eventKind=link.status==='accepted'?'removed':link.inviter_id===actorId?'canceled':'rejected';
        result.message=eventKind==='rejected'?'Invitation rejected.':eventKind==='canceled'?'Invitation canceled.':'Army link removed.';
      }
      result.data={armyEvent:eventKind};
      await armyEvent(sql,actorId,target.id,eventKind,key,now,targetIsBot?progressionEconomy.id:undefined);
      await sql.query('UPDATE characters SET state_version=state_version+1 WHERE id=$1',[target.id]);
    } else if (kind==='attack'&&target) {
      await resolveBattle(sql,{actor,target,state,now,key,targetIsBot,runtime,result});
    }
    // A quest, sale or other legitimate wallet credit can recover paused human
    // equipment in this same transaction. Bot command paths are separate.
    await automaticallyFundMaintenance(sql,actorId,now);
    const experience=await syncExperience(sql,actorId,now,'gameplay');
    const final=(await sql.query('SELECT attained_level,skill_points FROM characters WHERE id=$1',[actorId])).rows[0]!;
    result.data={...result.data,newAchievements:experience.awarded,celebration:levelCelebration(state.level,final.attained_level,final.skill_points-state.skillPoints),...(experience.tutorialCompleted?{tutorialCompleted:true}:{})};
    if(kind==='attack'&&result.battleId){
      let defenderExperience=null;
      if(target&&!targetIsBot){const gained=await syncExperience(sql,target.id,now,'gameplay');const finalDefender=(await sql.query('SELECT attained_level,skill_points FROM characters WHERE id=$1',[target.id])).rows[0]!;defenderExperience={newAchievements:gained.awarded,celebration:levelCelebration(target.attained_level,finalDefender.attained_level,finalDefender.skill_points-target.skill_points)};}
      await sql.query("UPDATE battles SET result=result||jsonb_build_object('playerExperience',jsonb_build_object($2::text,$3::jsonb)||CASE WHEN $4::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object($4::text,$5::jsonb) END) WHERE id=$1",[result.battleId,actorId,JSON.stringify(result.data),target&&!targetIsBot?target.id:null,JSON.stringify(defenderExperience)]);
    }
    await sql.query('UPDATE characters SET state_version=state_version+1 WHERE id=$1',[actorId]);
    await sql.query('UPDATE command_receipts SET result=$3 WHERE account_id=$1 AND command_id=$2',[accountId,key,result]);
    return result;
  }).catch(async error=>{
    if(error instanceof ContentPolicyError){
      const actor=(await db.query('SELECT id FROM characters WHERE account_id=$1',[accountId])).rows[0];
      await recordContentRejection(db,actor?.id??null,error,key);
    }
    throw error;
  });
}
