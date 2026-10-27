import {randomInt,randomUUID} from 'node:crypto';
import type {Sql} from './db.js';
import type {CommandResult} from './commands.js';
import {GameError} from './errors.js';
import {alpha,areRivals,resolveAlphaCombat} from './alpha-rules.js';
import {gameplay} from './gameplay-rules.js';
import {humanPvpLoot,humanVictoryLoot} from './human-pvp-loot.js';
import {gameFeel,victoryExperience47} from './game-feel-rules.js';
import {botCombat,botVictoryRewards} from './bot-combat-rules.js';
import {battleRewardNotes} from './battle-reward-notes.js';
import {stateFrom,type CharacterRow,type CharacterState} from './game.js';
import {syncExperience} from './experience.js';
import {grantExperience,awardMilestones} from './progression.js';
import {recordVictory} from './pvp-economy.js';
import {ledger,creditGold} from './economy.js';
import {claimBounty,authorizeBountyHunt} from './bounties.js';
import {strategy} from './strategy-rules.js';
import {community} from './community-rules.js';
import {refinements} from './refinement-rules.js';

export interface BattleRuntime {developmentBotsEnabled?:boolean;developmentBotBountiesEnabled?:boolean;developmentBotRecruitmentEnabled?:boolean;}
// One authoritative normal-battle path. Callers own the transaction, escrow
// ordering and both character locks, and have materialized the saved resources.
// The autonomous wrapper separately verifies both registered bot identities.
export async function resolveBattle(sql:Sql,context:{actor:CharacterRow;target:CharacterRow;state:CharacterState;now:Date;key:string;targetIsBot:boolean;runtime:BattleRuntime;result:CommandResult;autonomousPolicy?:string;bountyId?:string}){
 const {actor,target,state,now,key,targetIsBot,runtime,result,autonomousPolicy,bountyId}=context,actorId=actor.id;
 if(autonomousPolicy&&(!actor.development_bot||!target.development_bot||!targetIsBot))throw new Error('Invalid autonomous combat identities.');
      if(bountyId){
        if(autonomousPolicy)throw new Error('Autonomous bounty hunting is not authorized.');
        await authorizeBountyHunt(sql,actorId,target.id,bountyId,now,!!runtime.developmentBotsEnabled&&!!runtime.developmentBotBountiesEnabled);
      }else if (!areRivals(actor.attained_level,target.attained_level)) throw new GameError('RIVAL_LEVEL_RANGE','Choose an opponent nearer your level.',409);
      if(actor.health<alpha.combat.minimumHealth)throw new GameError('NEEDS_RECOVERY','You need at least '+alpha.combat.minimumHealth+' Health to attack.',409);
      if(target.health<community.combat.defenderMinimumHealth)throw new GameError('OPPONENT_DEFEATED','This opponent has been defeated (0 Health). They must recover before another attack.',409);
      if (actor.spirit<alpha.combat.spiritCost) throw new GameError('INSUFFICIENT_SPIRIT','Wait for Stamina to recover before attacking.',409);
      // Bind even an ordinary in-range attack to the contract present before
      // its rolls/costs. A saved hit can never settle a later same-timestamp listing.
      const bountyContractId=(await sql.query("SELECT id FROM bounties WHERE target_id=$1 AND status='active' AND expires_at>$2 FOR UPDATE",[target.id,now])).rows[0]?.id as string|undefined;
      const targetState=await stateFrom(sql,target,now,runtime);
      if(!targetIsBot)await syncExperience(sql,target.id,now);
      // Bot rewards depend on this pair and the real purse, never on victories
      // against other bots. Human full rewards are limited by successful wins,
      // not failed attempts. Existing character locks serialize this pair.
      let rewarded=true;
      if(!targetIsBot){
        const count=(await sql.query("SELECT count(*)::int AS n FROM battles WHERE attacker_id=$1 AND defender_id=$2 AND rewarded AND outcome='attacker_win' AND created_at>$3",[actorId,target.id,new Date(+now-alpha.combat.rewardWindowSeconds*1000)])).rows[0]!.n;
        rewarded=count<alpha.combat.rewardedPerTarget;
      }
      const variation=alpha.combat.variation;
      const combat=resolveAlphaCombat(state,targetState,randomInt(-variation,variation+1),randomInt(-variation,variation+1),rewarded);
      if(targetIsBot&&combat.outcome!=='attacker_win')rewarded=false;
      const rewardRulesetId=targetIsBot?botCombat.id:humanPvpLoot.id;
      const sequence=combat.outcome==='attacker_win'?await recordVictory(sql,actorId,target.id,now,rewardRulesetId):null;
      const botRewards=targetIsBot&&sequence?botVictoryRewards(targetState.gold,actor.attained_level,target.attained_level,sequence.victory,state.attack,targetState.defense):null;
      const lootDetails=sequence?{...(botRewards?.loot??humanVictoryLoot(targetState.gold,sequence.victory)),...sequence}:null;
      // Damage remains alpha-0.3. Only attacking victories transfer carried
      // gold; defensive wins never remove gold from the attacker. XP still
      // obeys the existing human budget or the bot-only pair reduction.
      combat.loot=lootDetails?.amount??0;
      const xpDetails=combat.outcome==='attacker_win'?botRewards?.xp??victoryExperience47(actor.attained_level,target.attained_level,rewarded,state.attack,targetState.defense):null;
      combat.attackerXp=xpDetails?.amount??0;
      const winnerId=combat.outcome==='attacker_win'?actorId:target.id;
      if (combat.loot) {
        await ledger(sql,key,'battle_loot',[{characterId:target.id,amount:-combat.loot}],rewardRulesetId);
        await creditGold(sql,actorId,BigInt(combat.loot),key,'battle_loot',rewardRulesetId);
      }
      await sql.query(`UPDATE characters SET health=$2,health_updated_at=CASE WHEN health=max_health THEN $3 ELSE health_updated_at END,
        spirit=spirit-$4,spirit_updated_at=CASE WHEN spirit=max_spirit THEN $3 ELSE spirit_updated_at END,attack_ready_at=$5 WHERE id=$1`,
        [actorId,combat.attackerHealthAfter,now,alpha.combat.spiritCost,now]);
      await sql.query('UPDATE characters SET health=$2,health_updated_at=CASE WHEN health=max_health THEN $3 ELSE health_updated_at END,state_version=state_version+1 WHERE id=$1',[target.id,combat.defenderHealthAfter,now]);
      const progression=await grantExperience(sql,actorId,combat.attackerXp,now);
      let defenderXpDetails:ReturnType<typeof victoryExperience47>|null=null;
      let defenderProgression:{xpAwarded:number;gained:number;level:number}|null=null;
      if(combat.outcome==='defender_win'&&!targetIsBot){
        const fullWins=(await sql.query(`SELECT count(*)::int AS n FROM battles WHERE defender_id=$1 AND attacker_id=$2
          AND outcome='defender_win' AND result->'defenderFullXp'='true'::jsonb AND created_at>$3`,[target.id,actorId,new Date(+now-86400000)])).rows[0]!.n;
        defenderXpDetails=victoryExperience47(target.attained_level,actor.attained_level,fullWins<gameplay.victoryXp.humanFullVictoriesPerTarget,targetState.defense,state.attack);
        // Defense must never refill Health on a knockout or reset combat costs.
        defenderProgression=await grantExperience(sql,target.id,defenderXpDetails.amount,now,false);
      }
      const after=(await sql.query<CharacterRow>('SELECT * FROM characters WHERE id=$1',[actorId])).rows[0]!;
      result.battleId=randomUUID();
      const battle={...combat,bountyContractId:bountyContractId??null,...(bountyId?{bountyHuntId:bountyId}:{}),...(autonomousPolicy?{botDuelPolicyId:autonomousPolicy}:{}),id:result.battleId,rulesetId:alpha.id,attackerId:actorId,defenderId:target.id,attackerName:actor.name,defenderName:target.name,
        winnerId,winnerName:winnerId===actorId?actor.name:target.name,attackerHealthBefore:actor.health,defenderHealthBefore:target.health,
        attackerHealthAfterDamage:combat.attackerHealthAfter,attackerHealthAfter:after.health,attackerMaxHealth:actor.max_health,defenderMaxHealth:target.max_health,
        defenderXp:defenderProgression?.xpAwarded??0,defenderXpDetails,defenderFullXp:defenderXpDetails?!defenderXpDetails.reduced:false,defenderLevelGained:defenderProgression?.gained??0,defenderLevelAfter:defenderProgression?.level??target.attained_level,attackerXp:progression.xpAwarded,levelGained:progression.gained,attackerLevelAfter:after.attained_level,rewarded,spiritSpent:alpha.combat.spiritCost,
        attackEquipment:state.attackEquipment.selected,defenseEquipment:targetState.defenseEquipment.selected,attackerArmy:state.army.participants,defenderArmy:targetState.army.participants,
        attackerTraining:{...state.training},defenderTraining:{...targetState.training},attackerCalling:{name:state.className,...state.calling},defenderCalling:{name:targetState.className,...targetState.calling},
        commandId:key,victoryStyle:combat.outcome==='attacker_win'?(combat.attackPower>=combat.defensePower*1.5?'decisive':'hard-fought'):'defeat',progressionRulesetId:targetIsBot?botCombat.id:gameFeel.id,xpDetails,pvpRulesetId:rewardRulesetId,lootDetails,strategyRulesetId:strategy.id,communityRulesetId:community.id,refinementRulesetId:refinements.id,temporaryRival:targetIsBot,botRewardEligibilityPolicy:targetIsBot?botCombat.id:null,botPopulationVersion:targetIsBot?(await sql.query('SELECT population_version FROM development_bots WHERE character_id=$1',[target.id])).rows[0]!.population_version:null,bountyClaim:null as {id:string;reward:number;rulesetId:string}|null,createdAt:now.toISOString()};
      await sql.query('INSERT INTO battles(id,attacker_id,defender_id,ruleset_id,outcome,snapshot,result,rewarded,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [result.battleId,actorId,target.id,alpha.id,combat.outcome,{attacker:state,defender:targetState},battle,rewarded,now]);
      if(!autonomousPolicy&&combat.defenderHealthAfter===0){
        battle.bountyClaim=await claimBounty(sql,actorId,target.id,result.battleId,key,now,!!runtime.developmentBotsEnabled&&!!runtime.developmentBotBountiesEnabled);
        if(battle.bountyClaim)await sql.query('UPDATE battles SET result=$2 WHERE id=$1',[result.battleId,battle]);
      }
      await awardMilestones(sql,actorId);
      if(defenderProgression)await awardMilestones(sql,target.id);
      result.message=battle.winnerName+' won the battle.'+battleRewardNotes(battle,true).map(note=>' '+note).join('')+(battle.bountyClaim?' Bounty claimed: '+battle.bountyClaim.reward+' gold, separate from battle loot.':'');
}
