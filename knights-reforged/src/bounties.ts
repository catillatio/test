import {randomUUID} from 'node:crypto';
import type {Database,Sql} from './db.js';
import {transaction} from './db.js';
import {GameError} from './errors.js';
import {regenerate} from './rules.js';
import {recoverySeconds} from './strategy-rules.js';
import {ledger,creditGold} from './economy.js';
import {activeArmy,alpha} from './alpha-rules.js';

import {pvp,bountyRules as rule,bountyFee as finalizedBountyFee} from './pvp-rules.js';
interface BountyRecord extends Record<string,any>{id:string;sponsor_id:string;target_id:string;amount:number;fee:number;status:string;created_at:Date;expires_at:Date;claimant_id:string|null;}
// Alpha deliberately serializes escrow operations before taking character
// locks. This one ordering covers attacks, claims, cancellation and refunds.
// It avoids transferring gold under a different wallet-lock ordering.
export async function lockBountyEscrow(sql:Sql){await sql.query('SELECT pg_advisory_xact_lock(61824005)');}
// Autonomous work yields immediately to any existing escrow/gameplay operation.
export async function tryLockBountyEscrow(sql:Sql){return !!(await sql.query('SELECT pg_try_advisory_xact_lock(61824005) AS locked')).rows[0]!.locked;}
const cutoff=(now:Date,seconds:number)=>new Date(+now-seconds*1000);
async function allies(sql:Sql,a:string,b:string){return (await sql.query("SELECT 1 FROM army_links WHERE low_id=LEAST($1::uuid,$2::uuid) AND high_id=GREATEST($1::uuid,$2::uuid) AND status='accepted'",[a,b])).rows.length>0;}
async function qualified(sql:Sql,id:string){
  const row=(await sql.query(`SELECT c.attained_level,EXISTS(SELECT 1 FROM development_bots WHERE character_id=c.id) AS bot,
    COALESCE((SELECT sum(completions) FROM character_quest_progress WHERE character_id=c.id),0)::int AS quests
    FROM characters c WHERE c.id=$1`,[id])).rows[0];
  return !!row&&!row.bot&&row.attained_level>=rule.minimumLevel&&row.quests>=rule.minimumQuests;
}
async function targetQualified(sql:Sql,id:string,botTargetsEnabled:boolean){
  const bot=(await sql.query('SELECT active FROM development_bots WHERE character_id=$1',[id])).rows[0];
  return bot?botTargetsEnabled&&bot.active:qualified(sql,id);
}
export async function bountyPlacementAvailability(sql:Sql,sponsorId:string,targetId:string,now:Date,botTargetsEnabled=false){
  try{await bountyQuote(sql,sponsorId,targetId,rule.minimum,now,botTargetsEnabled);return {allowed:true,reason:null};}
  catch(error){if(error instanceof GameError)return {allowed:false,reason:error.message};throw error;}
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
export async function bountyQuote(sql:Sql,sponsorId:string,targetId:string,amount:number,now:Date,botTargetsEnabled=false){
  if(sponsorId===targetId)throw new GameError('SELF_BOUNTY','You cannot place a bounty on yourself.',409);
  if(!Number.isSafeInteger(amount)||amount<rule.minimum||amount>rule.maximum)throw new GameError('BOUNTY_AMOUNT','Choose a whole bounty amount from 1 to 10,000 gold.',409);
  if(!await qualified(sql,sponsorId)||!await targetQualified(sql,targetId,botTargetsEnabled))throw new GameError('BOUNTY_ELIGIBILITY','Posting requires level 3 and five quests. Real targets need the same progress; temporary targets require the development bounty flag.',409);
  // Sponsorship is independent of ordinary PvP matchmaking. Both identities
  // still pass the existing progress, bot, ally, escrow and placement guards.
  const accounts=(await sql.query(`SELECT c.id FROM characters c JOIN accounts a ON a.id=c.account_id
    WHERE c.id=ANY($1::uuid[]) AND (NOT a.login_disabled OR EXISTS(
      SELECT 1 FROM development_bots b WHERE b.character_id=c.id AND b.active AND $2))`,[[sponsorId,targetId],botTargetsEnabled])).rows;
  if(accounts.length!==2)throw new GameError('BOUNTY_ELIGIBILITY','That account is not available for bounty placement.',409);
  if(await allies(sql,sponsorId,targetId))throw new GameError('BOUNTY_ALLY','You cannot place a bounty on an army ally.',409);
  await placementAvailable(sql,sponsorId,targetId,now);
  const target=(await sql.query('SELECT name,attained_level FROM characters WHERE id=$1',[targetId])).rows[0]!;
  const fee=finalizedBountyFee(amount);
  return {targetId,targetName:target.name,targetLevel:target.attained_level,amount,fee,total:amount+fee,rulesetId:pvp.id};
}
export async function placeBounty(sql:Sql,sponsorId:string,targetId:string,amount:number,commandId:string,now:Date,botTargetsEnabled=false){
  if(sponsorId===targetId)throw new GameError('SELF_BOUNTY','You cannot place a bounty on yourself.',409);
  if(!Number.isSafeInteger(amount)||amount<rule.minimum||amount>rule.maximum)throw new GameError('BOUNTY_AMOUNT',`Bounties must be ${rule.minimum}–${rule.maximum} gold.`,409);
  await bountyQuote(sql,sponsorId,targetId,amount,now,botTargetsEnabled);
  const fee=finalizedBountyFee(amount),id=randomUUID();
  await ledger(sql,commandId,'bounty_escrow',[{characterId:sponsorId,amount:-amount}],pvp.id);
  await ledger(sql,commandId,'bounty_fee',[{characterId:sponsorId,amount:-fee}],pvp.id);
  await sql.query(`INSERT INTO bounties(id,sponsor_id,target_id,amount,fee,status,ruleset_id,command_id,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5,'active',$6,$7,$8,$9)`,[id,sponsorId,targetId,amount,fee,pvp.id,commandId,now,new Date(+now+rule.durationSeconds*1000)]);
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
async function claimBlockedReason(sql:Sql,claimantId:string,row:Record<string,any>,now:Date,battleLevels?:[number,number],botTargetsEnabled=false):Promise<string|null>{
  if(row.sponsor_id===claimantId)return 'Sponsors cannot claim their own contracts.';
  if(row.target_id===claimantId)return 'You are this contract’s target.';
  const bot=(await sql.query('SELECT active FROM development_bots WHERE character_id=$1',[row.target_id])).rows[0];
  if(bot&&(!botTargetsEnabled||!bot.active))return 'Temporary-target bounties require the development bounty flag.';
  if((battleLevels&&battleLevels[0]<rule.minimumLevel)||!await qualified(sql,claimantId))return 'Reach level 3 and complete five quests.';
  // A bounty is an independently authorized hunt, never normal matchmaking.
  // Level affects combat power, not contract eligibility.
  // An accepted army relationship does not disqualify an eligible hunter.
  // Sponsor/self restrictions and authoritative finishing evidence still apply.
  return null;
}
export async function bountyHuntAvailability(sql:Sql,claimantId:string,targetId:string,bountyId:string,now:Date,botTargetsEnabled=false){
 const row=(await sql.query("SELECT * FROM bounties WHERE id=$1 AND target_id=$2 AND status='active' AND expires_at>$3",[bountyId,targetId,now])).rows[0];
 if(!row)return {allowed:false,reason:'That exact bounty is no longer active.',bountyId};
 const reason=await claimBlockedReason(sql,claimantId,row,now,undefined,botTargetsEnabled);
 return {allowed:!reason,reason,bountyId};
}
// Caller holds the established escrow lock and both character locks. A supplied
// closed/mismatched contract fails; it never falls back to an ordinary attack.
export async function authorizeBountyHunt(sql:Sql,claimantId:string,targetId:string,bountyId:string,now:Date,botTargetsEnabled=false){
 const eligibility=await bountyHuntAvailability(sql,claimantId,targetId,bountyId,now,botTargetsEnabled);
 if(!eligibility.allowed)throw new GameError('BOUNTY_HUNT_UNAVAILABLE',eligibility.reason!,409);
}
export async function claimBounty(sql:Sql,claimantId:string,targetId:string,battleId:string,commandId:string,now:Date,botTargetsEnabled=false){
  const row=(await sql.query("SELECT * FROM bounties WHERE target_id=$1 AND status='active' AND expires_at>$2 FOR UPDATE",[targetId,now])).rows[0];
  if(!row)return null;
  // Prove the finishing action from the server's saved combat result. A prior
  // damaging hit or a client-supplied outcome can never become a claim.
  const battle=(await sql.query(`SELECT (snapshot->'attacker'->>'level')::int AS attacker_level,(snapshot->'defender'->>'level')::int AS defender_level
    FROM battles WHERE id=$1 AND attacker_id=$2 AND defender_id=$3
    AND created_at>=$4 AND created_at<$5 AND result->'defenderHealthAfter'='0'::jsonb
    AND (result->>'defenderHealthBefore')::int>0 AND (result->>'spiritSpent')::int>0`,[battleId,claimantId,targetId,row.created_at,row.expires_at])).rows[0];
  if(!battle||!Number.isInteger(battle.attacker_level)||!Number.isInteger(battle.defender_level)||
    await claimBlockedReason(sql,claimantId,row,now,[battle.attacker_level,battle.defender_level],botTargetsEnabled))return null;
  const claimed=await sql.query("UPDATE bounties SET status='claimed',claimant_id=$2,battle_id=$3,settled_at=$4 WHERE id=$1 AND status='active' RETURNING id",[row.id,claimantId,battleId,now]);
  if(!claimed.rows.length)return null;
  await creditGold(sql,claimantId,BigInt(row.amount),commandId,'bounty_reward',row.ruleset_id);
  await sql.query("INSERT INTO bounty_events(id,bounty_id,kind,character_id,amount,command_id,created_at) VALUES($1,$2,'claimed',$3,$4,$5,$6)",[randomUUID(),row.id,claimantId,row.amount,commandId,now]);
  await sql.query("INSERT INTO bounty_kills(bounty_id,battle_id,claimant_id,target_id,ruleset_id,source,awarded_at) VALUES($1,$2,$3,$4,$5,'finishing_claim',$6)",[row.id,battleId,claimantId,targetId,pvp.id,now]);
  return {id:row.id as string,reward:row.amount as number,rulesetId:row.ruleset_id as string,claimRulesetId:pvp.id};
}
// One visibility rule shared by the board and its lightweight count.
const visibleBounties=`b.status='active' AND b.expires_at>$1 AND
 ((d.character_id IS NULL AND NOT a.login_disabled) OR ($2 AND d.active))`;
export async function activeBountyCount(sql:Sql,now:Date,botTargetsEnabled=false){
 const row=(await sql.query(`SELECT count(*)::int AS count,min(b.expires_at) AS next_expiry
  FROM bounties b JOIN characters c ON c.id=b.target_id JOIN accounts a ON a.id=c.account_id
  LEFT JOIN development_bots d ON d.character_id=c.id WHERE ${visibleBounties}`,[now,botTargetsEnabled])).rows[0]!;
 return {count:row.count as number,nextExpiryAt:row.next_expiry?new Date(row.next_expiry).toISOString():null};
}
export async function bountyBoard(db:Database,characterId:string,botTargetsEnabled=false){
  return transaction(db,async sql=>{
    await lockBountyEscrow(sql);const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
    await settleExpiredBounties(sql,now);
    const active=(await sql.query<BountyRecord>(`SELECT b.*,count(*) OVER()::int AS visible_total,min(b.expires_at) OVER() AS next_expiry,c.name,c.attained_level AS level,c.profile_class,c.health,c.health_updated_at,c.max_health,c.legacy_army_floor,
      (SELECT COALESCE(sum(quantity),0)::int FROM army_stacks WHERE character_id=c.id) AS units,
      (SELECT count(*)::int FROM army_links l WHERE c.id IN (l.low_id,l.high_id) AND l.status='accepted') AS allies,
      EXISTS(SELECT 1 FROM development_bots WHERE character_id=c.id) AS temporary_rival, sponsor.name AS sponsor_name FROM bounties b JOIN characters c ON c.id=b.target_id JOIN characters sponsor ON sponsor.id=b.sponsor_id
      JOIN accounts a ON a.id=c.account_id LEFT JOIN development_bots d ON d.character_id=c.id
      WHERE ${visibleBounties} ORDER BY b.amount DESC,b.created_at,b.id LIMIT 100`,[now,botTargetsEnabled])).rows;
    const history=(await sql.query(`SELECT b.*,c.name AS target_name,s.name AS sponsor_name,h.name AS claimant_name,f.outcome AS battle_outcome,(d.battle_id IS NOT NULL) AS verified_death,(k.bounty_id IS NOT NULL) AS recorded_claim FROM bounties b
      JOIN characters c ON c.id=b.target_id JOIN characters s ON s.id=b.sponsor_id LEFT JOIN characters h ON h.id=b.claimant_id LEFT JOIN battles f ON f.id=b.battle_id
      LEFT JOIN competitive_deaths d ON d.battle_id=b.battle_id
      LEFT JOIN bounty_kills k ON k.bounty_id=b.id AND b.status='claimed' AND k.claimant_id=b.claimant_id AND k.target_id=b.target_id AND k.battle_id=b.battle_id
      WHERE b.sponsor_id=$1 OR b.target_id=$1 OR b.claimant_id=$1 ORDER BY b.created_at DESC,b.id DESC LIMIT 50`,[characterId])).rows;
    // A transaction has one client; queued parallel reads add no SQL parallelism.
    const listings=[];for(const row of active){
      const health=regenerate(row.health,row.max_health,new Date(row.health_updated_at),now,recoverySeconds(row.profile_class,'health',alpha.resources.healthSeconds),alpha.resources.healthAmount).value;
      // Board presentation only. Claim eligibility must still allow a winning
      // attack that has just reduced the defender to zero Health.
      listings.push({...row,health,armySize:Math.min(row.temporary_rival?10:Number.MAX_SAFE_INTEGER,activeArmy(row.level,row.units,row.allies,row.legacy_army_floor).participants),
        attackBlockedReason:health===0?'Opponent defeated — 0 Health. Wait for their recovery.':null,claimBlockedReason:await claimBlockedReason(sql,characterId,row,now,undefined,botTargetsEnabled)});
    }
    const attentionFeed=(await sql.query(`SELECT e.id,e.kind,b.id AS bounty_id,b.target_id,b.sponsor_id,b.claimant_id FROM bounty_events e JOIN bounties b ON b.id=e.bounty_id
      WHERE b.id=ANY($1::uuid[]) AND e.kind IN ('placed','claimed') AND NOT EXISTS(SELECT 1 FROM notification_reads r WHERE r.character_id=$2 AND r.event_id=e.id AND r.kind='bounty_'||e.kind)
      ORDER BY e.created_at DESC,e.id DESC LIMIT 40`,[[...active,...history].map(b=>b.id),characterId])).rows.map(e=>({id:e.id,kind:'bounty',data:{bountyId:e.bounty_id,event:e.kind,targetId:e.target_id,sponsorId:e.sponsor_id,claimantId:e.claimant_id}}));
    return {attentionFeed,active:listings,activeCount:Number(active[0]?.visible_total??0),nextExpiryAt:active[0]?.next_expiry?new Date(active[0].next_expiry).toISOString():null,history,eligible:await qualified(sql,characterId),botTargetsEnabled,serverTime:now.toISOString(),rulesetId:pvp.id};
  });
}
