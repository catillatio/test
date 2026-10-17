import {randomUUID} from 'node:crypto';
import type {Database,Sql} from './db.js';
import {transaction} from './db.js';
import {GameError} from './errors.js';
import {regenerate} from './rules.js';
import {recoverySeconds} from './strategy-rules.js';
import {ledger,creditGold} from './economy.js';
import {areRivals,activeArmy,alpha} from './alpha-rules.js';

import {refinements,bountyRules as rule,finalizedBountyFee} from './refinement-rules.js';
interface BountyRecord extends Record<string,any>{id:string;sponsor_id:string;target_id:string;amount:number;fee:number;status:string;created_at:Date;expires_at:Date;claimant_id:string|null;}
// Alpha deliberately serializes escrow operations before taking character
// locks. This one ordering covers attacks, claims, cancellation and refunds.
// It avoids transferring gold under a different wallet-lock ordering.
export async function lockBountyEscrow(sql:Sql){await sql.query('SELECT pg_advisory_xact_lock(61824005)');}
const cutoff=(now:Date,seconds:number)=>new Date(+now-seconds*1000);
async function allies(sql:Sql,a:string,b:string){return (await sql.query("SELECT 1 FROM army_links WHERE low_id=LEAST($1::uuid,$2::uuid) AND high_id=GREATEST($1::uuid,$2::uuid) AND status='accepted'",[a,b])).rows.length>0;}
async function qualified(sql:Sql,id:string){
  const row=(await sql.query(`SELECT c.attained_level,EXISTS(SELECT 1 FROM development_bots WHERE character_id=c.id) AS bot,
    COALESCE((SELECT sum(completions) FROM character_quest_progress WHERE character_id=c.id),0)::int AS quests
    FROM characters c WHERE c.id=$1`,[id])).rows[0];
  return !!row&&!row.bot&&row.attained_level>=rule.minimumLevel&&row.quests>=rule.minimumQuests;
}
export async function expireBounties(sql:Sql,now:Date,priorityTarget:string|null=null,onlySponsor:string|null=null){
  const expired=(await sql.query("SELECT * FROM bounties WHERE status='active' AND expires_at<=$1 AND ($3::uuid IS NULL OR sponsor_id=$3) ORDER BY CASE WHEN target_id=$2::uuid THEN 0 ELSE 1 END,expires_at,id LIMIT 100 FOR UPDATE",[now,priorityTarget,onlySponsor])).rows;
  if(!expired.length)return 0;
  await sql.query('SELECT id FROM characters WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[expired.map(row=>row.sponsor_id)]);
  for(const row of expired){
    await sql.query("UPDATE bounties SET status='expired',settled_at=$2 WHERE id=$1 AND status='active'",[row.id,now]);
    await creditGold(sql,row.sponsor_id,BigInt(row.amount),null,'bounty_expiry_refund',row.ruleset_id);
    await sql.query("INSERT INTO bounty_events(id,bounty_id,kind,character_id,amount,created_at) VALUES($1,$2,'expired',$3,$4,$5)",[randomUUID(),row.id,row.sponsor_id,row.amount,now]);
  }
  await sql.query('UPDATE characters SET state_version=state_version+1 WHERE id=ANY($1::uuid[])',[expired.map(row=>row.sponsor_id)]);
  return expired.length;
}
// Hold the escrow advisory lock across all batches. Removing sponsor limits
// must not leave their 101st expired principal absent from the returned wallet.
export async function settleExpiredBounties(sql:Sql,now:Date,priorityTarget:string|null=null,onlySponsor:string|null=null){
  let total=0,count:number;
  do{count=await expireBounties(sql,now,priorityTarget,onlySponsor);total+=count;}while(count===100);
  return total;
}
async function placementAvailable(sql:Sql,sponsorId:string,targetId:string,now:Date){
  const count=(await sql.query(`SELECT
    count(*) FILTER(WHERE status='active' AND expires_at>$2)::int AS occupied,
    count(*) FILTER(WHERE created_at>$3)::int AS daily FROM bounties WHERE target_id=$1`,[targetId,now,cutoff(now,86400)])).rows[0]!;
  if(count.occupied)throw new GameError('BOUNTY_EXISTS','That player already has an active bounty. No funds were charged.',409);
  if(count.daily>=rule.targetDailyLimit)throw new GameError('BOUNTY_LIMIT','This target has received 50 successfully placed bounties in the previous rolling 24 hours. No funds were charged.',409);
}
export async function bountyQuote(sql:Sql,sponsorId:string,targetId:string,amount:number,now:Date){
  if(sponsorId===targetId)throw new GameError('SELF_BOUNTY','You cannot place a bounty on yourself.',409);
  if(!Number.isSafeInteger(amount)||amount<rule.minimum||amount>rule.maximum)throw new GameError('BOUNTY_AMOUNT','Choose a whole bounty amount from 1 to 10,000 gold.',409);
  if(!await qualified(sql,sponsorId)||!await qualified(sql,targetId))throw new GameError('BOUNTY_ELIGIBILITY','Bounties require real players at level 3 with five completed quests.',409);
  const levels=(await sql.query('SELECT attained_level FROM characters WHERE id=ANY($1::uuid[]) ORDER BY id',[[sponsorId,targetId]])).rows;
  if(levels.length!==2||!areRivals(levels[0]!.attained_level,levels[1]!.attained_level))throw new GameError('RIVAL_LEVEL_RANGE','Choose a rival near your level.',409);
  if(await allies(sql,sponsorId,targetId))throw new GameError('BOUNTY_ALLY','You cannot place a bounty on an army ally.',409);
  await placementAvailable(sql,sponsorId,targetId,now);
  const target=(await sql.query('SELECT name FROM characters WHERE id=$1',[targetId])).rows[0]!;
  const fee=finalizedBountyFee(amount);
  return {targetId,targetName:target.name,amount,fee,total:amount+fee,rulesetId:refinements.id};
}
export async function placeBounty(sql:Sql,sponsorId:string,targetId:string,amount:number,commandId:string,now:Date){
  if(sponsorId===targetId)throw new GameError('SELF_BOUNTY','You cannot place a bounty on yourself.',409);
  if(!Number.isSafeInteger(amount)||amount<rule.minimum||amount>rule.maximum)throw new GameError('BOUNTY_AMOUNT',`Bounties must be ${rule.minimum}–${rule.maximum} gold.`,409);
  if(!await qualified(sql,sponsorId)||!await qualified(sql,targetId))throw new GameError('BOUNTY_ELIGIBILITY',`Bounties require real players at level ${rule.minimumLevel} with ${rule.minimumQuests} completed quests. Temporary rivals are excluded.`,409);
  if(await allies(sql,sponsorId,targetId))throw new GameError('BOUNTY_ALLY','You cannot place a bounty on an army ally.',409);
  await placementAvailable(sql,sponsorId,targetId,now);
  const fee=finalizedBountyFee(amount),id=randomUUID();
  await ledger(sql,commandId,'bounty_escrow',[{characterId:sponsorId,amount:-amount}],refinements.id);
  await ledger(sql,commandId,'bounty_fee',[{characterId:sponsorId,amount:-fee}],refinements.id);
  await sql.query(`INSERT INTO bounties(id,sponsor_id,target_id,amount,fee,status,ruleset_id,command_id,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5,'active',$6,$7,$8,$9)`,[id,sponsorId,targetId,amount,fee,refinements.id,commandId,now,new Date(+now+rule.durationSeconds*1000)]);
  await sql.query("INSERT INTO bounty_events(id,bounty_id,kind,character_id,amount,command_id,created_at) VALUES($1,$2,'placed',$3,$4,$5,$6)",[randomUUID(),id,sponsorId,amount,commandId,now]);
  return {bountyId:id,amount,fee,expiresAt:new Date(+now+rule.durationSeconds*1000).toISOString()};
}
export async function cancelBounty(sql:Sql,sponsorId:string,bountyId:string,commandId:string,now:Date){
  const row=(await sql.query('SELECT * FROM bounties WHERE id=$1 FOR UPDATE',[bountyId])).rows[0];
  if(!row||row.sponsor_id!==sponsorId)throw new GameError('BOUNTY_NOT_FOUND','That bounty is not yours to cancel.',404);
  if(row.status!=='active')throw new GameError('BOUNTY_CLOSED','That bounty has already settled.',409);
  if(+now<+new Date(row.created_at)+rule.cancelAfterSeconds*1000)throw new GameError('BOUNTY_CANCEL_COOLDOWN','A bounty must remain available for one hour before cancellation.',409);
  await sql.query("UPDATE bounties SET status='canceled',settled_at=$2 WHERE id=$1 AND status='active'",[bountyId,now]);
  await creditGold(sql,sponsorId,BigInt(row.amount),commandId,'bounty_cancel_refund',row.ruleset_id);
  await sql.query("INSERT INTO bounty_events(id,bounty_id,kind,character_id,amount,command_id,created_at) VALUES($1,$2,'canceled',$3,$4,$5,$6)",[randomUUID(),bountyId,sponsorId,row.amount,commandId,now]);
  return {bountyId,refund:row.amount as number};
}
async function claimBlockedReason(sql:Sql,claimantId:string,row:Record<string,any>,now:Date,battleLevels?:[number,number]):Promise<string|null>{
  if(row.sponsor_id===claimantId)return 'Sponsors cannot claim their own contracts.';
  if(row.target_id===claimantId)return 'You are this contract’s target.';
  if((battleLevels&&battleLevels[0]<rule.minimumLevel)||!await qualified(sql,claimantId))return 'Reach level 3 and complete five quests.';
  const levels=battleLevels??(await sql.query('SELECT attained_level FROM characters WHERE id=ANY($1::uuid[]) ORDER BY id',[[claimantId,row.target_id]])).rows.map(r=>r.attained_level);
  if(levels.length!==2||!areRivals(levels[0]!,levels[1]!))return 'Target is outside your rival level range.';
  if(await allies(sql,claimantId,row.target_id)||await allies(sql,claimantId,row.sponsor_id))return 'Army allies of the sponsor or target cannot claim.';
  return null;
}
export async function claimBounty(sql:Sql,claimantId:string,targetId:string,battleId:string,commandId:string,now:Date){
  const row=(await sql.query("SELECT * FROM bounties WHERE target_id=$1 AND status='active' AND expires_at>$2 FOR UPDATE",[targetId,now])).rows[0];
  if(!row)return null;
  // Prove the finishing action from the server's saved combat result. A prior
  // damaging hit or a client-supplied outcome can never become a claim.
  const battle=(await sql.query(`SELECT (snapshot->'attacker'->>'level')::int AS attacker_level,(snapshot->'defender'->>'level')::int AS defender_level
    FROM battles WHERE id=$1 AND attacker_id=$2 AND defender_id=$3
    AND created_at>=$4 AND created_at<$5 AND result->'defenderHealthAfter'='0'::jsonb
    AND (result->>'defenderHealthBefore')::int>0 AND (result->>'spiritSpent')::int>0`,[battleId,claimantId,targetId,row.created_at,row.expires_at])).rows[0];
  if(!battle||!Number.isInteger(battle.attacker_level)||!Number.isInteger(battle.defender_level)||
    await claimBlockedReason(sql,claimantId,row,now,[battle.attacker_level,battle.defender_level]))return null;
  const claimed=await sql.query("UPDATE bounties SET status='claimed',claimant_id=$2,battle_id=$3,settled_at=$4 WHERE id=$1 AND status='active' RETURNING id",[row.id,claimantId,battleId,now]);
  if(!claimed.rows.length)return null;
  await creditGold(sql,claimantId,BigInt(row.amount),commandId,'bounty_reward',row.ruleset_id);
  await sql.query("INSERT INTO bounty_events(id,bounty_id,kind,character_id,amount,command_id,created_at) VALUES($1,$2,'claimed',$3,$4,$5,$6)",[randomUUID(),row.id,claimantId,row.amount,commandId,now]);
  await sql.query("INSERT INTO bounty_kills(bounty_id,battle_id,claimant_id,target_id,ruleset_id,source,awarded_at) VALUES($1,$2,$3,$4,$5,'finishing_claim',$6)",[row.id,battleId,claimantId,targetId,refinements.id,now]);
  return {id:row.id as string,reward:row.amount as number,rulesetId:row.ruleset_id as string,claimRulesetId:refinements.id};
}
export async function bountyBoard(db:Database,characterId:string){
  return transaction(db,async sql=>{
    await lockBountyEscrow(sql);const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
    await settleExpiredBounties(sql,now);
    const active=(await sql.query<BountyRecord>(`SELECT b.*,c.name,c.attained_level AS level,c.profile_class,c.health,c.health_updated_at,c.max_health,c.legacy_army_floor,
      (SELECT COALESCE(sum(quantity),0)::int FROM army_stacks WHERE character_id=c.id) AS units,
      (SELECT count(*)::int FROM army_links l WHERE c.id IN (l.low_id,l.high_id) AND l.status='accepted') AS allies,
      sponsor.name AS sponsor_name FROM bounties b JOIN characters c ON c.id=b.target_id JOIN characters sponsor ON sponsor.id=b.sponsor_id
      WHERE b.status='active' AND b.expires_at>$1 ORDER BY b.amount DESC,b.created_at,b.id LIMIT 100`,[now])).rows;
    const history=(await sql.query(`SELECT b.*,c.name AS target_name,s.name AS sponsor_name FROM bounties b
      JOIN characters c ON c.id=b.target_id JOIN characters s ON s.id=b.sponsor_id
      WHERE b.sponsor_id=$1 OR b.target_id=$1 OR b.claimant_id=$1 ORDER BY b.created_at DESC,b.id DESC LIMIT 50`,[characterId])).rows;
    const listings=await Promise.all(active.map(async row=>{
      const health=regenerate(row.health,row.max_health,new Date(row.health_updated_at),now,recoverySeconds(row.profile_class,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount).value;
      // Board presentation only. Claim eligibility must still allow a winning
      // attack that has just reduced the defender to zero Health.
      return {...row,health,armySize:activeArmy(row.level,row.units,row.allies,row.legacy_army_floor).participants,
        attackBlockedReason:health===0?'Opponent defeated — 0 Health. Wait for their recovery.':null,claimBlockedReason:await claimBlockedReason(sql,characterId,row,now)};
    }));
    return {active:listings,history,eligible:await qualified(sql,characterId),serverTime:now.toISOString(),rulesetId:refinements.id};
  });
}
