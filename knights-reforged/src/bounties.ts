import {randomUUID} from 'node:crypto';
import type {Database,Sql} from './db.js';
import {transaction} from './db.js';
import {GameError} from './errors.js';
import {strategy,bountyFee} from './strategy-rules.js';
import {ledger,creditGold} from './economy.js';
import {areRivals,activeArmy} from './alpha-rules.js';

const rule=strategy.bounties;
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
export async function expireBounties(sql:Sql,now:Date){
  const expired=(await sql.query("SELECT * FROM bounties WHERE status='active' AND expires_at<=$1 ORDER BY expires_at,id LIMIT 100 FOR UPDATE",[now])).rows;
  if(!expired.length)return 0;
  await sql.query('SELECT id FROM characters WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[expired.map(row=>row.sponsor_id)]);
  for(const row of expired){
    await sql.query("UPDATE bounties SET status='expired',settled_at=$2 WHERE id=$1 AND status='active'",[row.id,now]);
    await creditGold(sql,row.sponsor_id,BigInt(row.amount),null,'bounty_expiry_refund',row.ruleset_id);
    await sql.query("INSERT INTO bounty_events(id,bounty_id,kind,character_id,amount,created_at) VALUES($1,$2,'expired',$3,$4,$5)",[randomUUID(),row.id,row.sponsor_id,row.amount,now]);
  }
  return expired.length;
}
export async function placeBounty(sql:Sql,sponsorId:string,targetId:string,amount:number,commandId:string,now:Date){
  if(sponsorId===targetId)throw new GameError('SELF_BOUNTY','You cannot place a bounty on yourself.',409);
  if(!Number.isSafeInteger(amount)||amount<rule.minimum||amount>rule.maximum)throw new GameError('BOUNTY_AMOUNT',`Bounties must be ${rule.minimum}–${rule.maximum} gold.`,409);
  if(!await qualified(sql,sponsorId)||!await qualified(sql,targetId))throw new GameError('BOUNTY_ELIGIBILITY',`Bounties require real players at level ${rule.minimumLevel} with ${rule.minimumQuests} completed quests. Temporary rivals are excluded.`,409);
  if(await allies(sql,sponsorId,targetId))throw new GameError('BOUNTY_ALLY','You cannot place a bounty on an army ally.',409);
  const counts=(await sql.query(`SELECT
    (SELECT count(*)::int FROM bounties WHERE sponsor_id=$1 AND status='active') AS active,
    (SELECT count(*)::int FROM bounties WHERE sponsor_id=$1 AND created_at>$3) AS daily,
    (SELECT count(*)::int FROM bounties WHERE target_id=$2 AND created_at>$3) AS target_daily,
    (SELECT count(*)::int FROM bounties WHERE sponsor_id=$1 AND target_id=$2 AND created_at>$4) AS pair,
    (SELECT count(*)::int FROM bounties WHERE target_id=$2 AND status='active') AS occupied`,[sponsorId,targetId,cutoff(now,86400),cutoff(now,rule.sponsorTargetCooldownSeconds)])).rows[0]!;
  if(counts.occupied)throw new GameError('BOUNTY_EXISTS','That player already has an active bounty.',409);
  if(counts.active>=rule.sponsorActiveLimit||counts.daily>=rule.sponsorDailyLimit||counts.target_daily>=rule.targetDailyLimit||counts.pair)
    throw new GameError('BOUNTY_LIMIT','The sponsor, target or daily bounty limit has been reached. Canceled and expired placements still count.',409);
  const fee=bountyFee(amount),id=randomUUID();
  await ledger(sql,commandId,'bounty_escrow',[{characterId:sponsorId,amount:-amount}],strategy.id);
  await ledger(sql,commandId,'bounty_fee',[{characterId:sponsorId,amount:-fee}],strategy.id);
  await sql.query(`INSERT INTO bounties(id,sponsor_id,target_id,amount,fee,status,ruleset_id,command_id,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5,'active',$6,$7,$8,$9)`,[id,sponsorId,targetId,amount,fee,strategy.id,commandId,now,new Date(+now+rule.durationSeconds*1000)]);
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
async function claimBlockedReason(sql:Sql,claimantId:string,row:Record<string,any>,now:Date):Promise<string|null>{
  if(row.sponsor_id===claimantId)return 'Sponsors cannot claim their own contracts.';
  if(row.target_id===claimantId)return 'You are this contract’s target.';
  if(!await qualified(sql,claimantId))return 'Reach level 3 and complete five quests.';
  const levels=(await sql.query('SELECT attained_level FROM characters WHERE id=ANY($1::uuid[]) ORDER BY id',[[claimantId,row.target_id]])).rows;
  if(levels.length!==2||!areRivals(levels[0]!.attained_level,levels[1]!.attained_level))return 'Target is outside your rival level range.';
  if(await allies(sql,claimantId,row.target_id)||await allies(sql,claimantId,row.sponsor_id))return 'Army allies of the sponsor or target cannot claim.';
  const counts=(await sql.query(`SELECT
    count(*) FILTER(WHERE claimant_id=$1 AND settled_at>$4)::int AS daily,
    COALESCE(sum(amount) FILTER(WHERE claimant_id=$1 AND settled_at>$4),0)::int AS daily_gold,
    count(*) FILTER(WHERE claimant_id=$1 AND target_id=$2 AND settled_at>$5)::int AS pair,
    count(*) FILTER(WHERE claimant_id=$1 AND sponsor_id=$3 AND settled_at>$6)::int AS sponsor_pair
    FROM bounties WHERE status='claimed' AND settled_at>$6`,[claimantId,row.target_id,row.sponsor_id,cutoff(now,86400),cutoff(now,rule.pairClaimCooldownSeconds),cutoff(now,rule.sponsorClaimantCooldownSeconds)])).rows[0]!;
  if(counts.daily>=rule.claimantDailyLimit||counts.daily_gold+row.amount>rule.claimantDailyGoldLimit)return 'Your daily bounty reward limit is reached.';
  if(counts.pair||counts.sponsor_pair)return 'A recent target or sponsor payment is on cooldown.';
  return null;
}
export async function claimBounty(sql:Sql,claimantId:string,targetId:string,battleId:string,commandId:string,now:Date){
  const row=(await sql.query("SELECT * FROM bounties WHERE target_id=$1 AND status='active' AND expires_at>$2 FOR UPDATE",[targetId,now])).rows[0];
  if(!row||await claimBlockedReason(sql,claimantId,row,now))return null;
  const claimed=await sql.query("UPDATE bounties SET status='claimed',claimant_id=$2,battle_id=$3,settled_at=$4 WHERE id=$1 AND status='active' RETURNING id",[row.id,claimantId,battleId,now]);
  if(!claimed.rows.length)return null;
  await creditGold(sql,claimantId,BigInt(row.amount),commandId,'bounty_reward',row.ruleset_id);
  await sql.query("INSERT INTO bounty_events(id,bounty_id,kind,character_id,amount,command_id,created_at) VALUES($1,$2,'claimed',$3,$4,$5,$6)",[randomUUID(),row.id,claimantId,row.amount,commandId,now]);
  return {id:row.id as string,reward:row.amount as number,rulesetId:row.ruleset_id as string};
}
export async function bountyBoard(db:Database,characterId:string){
  return transaction(db,async sql=>{
    await lockBountyEscrow(sql);const now=new Date((await sql.query('SELECT clock_timestamp() AS now')).rows[0]!.now);
    await expireBounties(sql,now);
    const active=(await sql.query<BountyRecord>(`SELECT b.*,c.name,c.attained_level AS level,c.profile_class,c.health,c.max_health,c.legacy_army_floor,
      (SELECT COALESCE(sum(quantity),0)::int FROM army_stacks WHERE character_id=c.id) AS units,
      (SELECT count(*)::int FROM army_links l WHERE c.id IN (l.low_id,l.high_id) AND l.status='accepted') AS allies,
      sponsor.name AS sponsor_name FROM bounties b JOIN characters c ON c.id=b.target_id JOIN characters sponsor ON sponsor.id=b.sponsor_id
      WHERE b.status='active' AND b.expires_at>$1 ORDER BY b.amount DESC,b.created_at,b.id LIMIT 100`,[now])).rows;
    const history=(await sql.query(`SELECT b.*,c.name AS target_name,s.name AS sponsor_name FROM bounties b
      JOIN characters c ON c.id=b.target_id JOIN characters s ON s.id=b.sponsor_id
      WHERE b.sponsor_id=$1 OR b.target_id=$1 OR b.claimant_id=$1 ORDER BY b.created_at DESC,b.id DESC LIMIT 50`,[characterId])).rows;
    const listings=await Promise.all(active.map(async row=>({...row,armySize:activeArmy(row.level,row.units,row.allies,row.legacy_army_floor).participants,claimBlockedReason:await claimBlockedReason(sql,characterId,row,now)})));
    return {active:listings,history,eligible:await qualified(sql,characterId),serverTime:now.toISOString(),rulesetId:strategy.id};
  });
}
