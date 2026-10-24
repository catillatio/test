import {expansionBots,expansionBotCombat,expansionBotIds,partitionBotSchedule,installedCohort} from './expansion-bot-rules.js';
import {createHash} from 'node:crypto';
import {type Database,transaction} from './db.js';
import {GameError} from './errors.js';
import {clock,materialize,stateFrom,type CharacterRow} from './game.js';
import {areRivals} from './alpha-rules.js';
import {resolveBattle} from './combat.js';
import type {CommandResult} from './commands.js';
import {levelCelebration} from './experience.js';
import {tryLockBountyEscrow} from './bounties.js';
import {scheduledNumber,scheduledCommand,scheduledCandidates,startScheduledBotWork} from './bot-schedule.js';

// Scheduling only; all combat/reward/resource formulas remain authoritative.
export const livingCombat=Object.freeze({id:'living-bot-duels-1',intervalMs:300000,slotsPerDecision:144,
 maximumBotsPerTick:5,maximumPopulation:450,initiationsPerUtcDay:2,incomingPerUtcDay:4,incomingPerHour:1});
type Candidate={id:string;account_id:string;level:number;active:boolean;disabled:boolean};
export const duelWindow=(now:Date)=>Math.floor(+now/livingCombat.intervalMs);
export const duelSlot=(id:string)=>scheduledNumber(livingCombat.id+':'+id)%livingCombat.slotsPerDecision;
export const duelCommand=(id:string,window:number)=>scheduledCommand(expansionBotIds.has(id)?expansionBotCombat.id:livingCombat.id,id,window);
export const duelCandidates=(ids:string[],window:number)=>{const {legacy,added}=partitionBotSchedule(ids);return [...scheduledCandidates(legacy,window,{slots:144,maximum:5,population:450,salt:livingCombat.id+':'}),...scheduledCandidates(added,window,{slots:144,maximum:5,population:450,salt:expansionBotCombat.id+':'})];};
const validId=(id:unknown):id is string=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
const fingerprint=(actor:string,target:string,window:number)=>createHash('sha256').update([livingCombat.id,actor,target,window].join(':')).digest('hex');
async function population(db:Pick<Database,'query'>){
 const rows=(await db.query<Candidate>(`SELECT c.id,c.account_id,c.attained_level AS level,b.active,a.login_disabled AS disabled
  FROM development_bots b JOIN characters c ON c.id=b.character_id JOIN accounts a ON a.id=c.account_id
  ORDER BY c.id LIMIT $1`,[901])).rows;
 if(rows.length>450&&(!await installedCohort(db)||rows.length!==900))throw new Error('Unexpected rival population; autonomous duels stopped.');
 return rows;
}
export function duelTarget(rows:Candidate[],actor:Candidate,window:number){
 return rows.filter(t=>t.id!==actor.id&&t.active&&t.disabled&&areRivals(actor.level,t.level))
  .sort((a,b)=>scheduledNumber(duelCommand(actor.id,window)+':'+a.id)-scheduledNumber(duelCommand(actor.id,window)+':'+b.id)||a.id.localeCompare(b.id))[0]?.id;
}
export function duelPressureAllows(p:{initiated:number;targeted:number;recent:number}){
 return [p.initiated,p.targeted,p.recent].every(n=>Number.isSafeInteger(n)&&n>=0)&&p.initiated<livingCombat.initiationsPerUtcDay&&p.targeted<livingCombat.incomingPerUtcDay&&p.recent<livingCombat.incomingPerHour;
}
type DuelResult={status:'disabled'|'ineligible'|'busy'|'battled'|'replayed';reason?:string;battleId?:string;actorId?:string;targetId?:string};
// Trusted server-only entry. No HTTP command accepts a bot actor or this mode.
// Even direct internal calls must pass the same global slot/population guards.
export async function attemptBotDuel(db:Database,enabled:boolean,actorId:string,window:number,requestedTarget?:string):Promise<DuelResult>{
 if(!enabled)return {status:'disabled'};
 if(!validId(actorId)||requestedTarget!==undefined&&!validId(requestedTarget)||!Number.isSafeInteger(window)||window<0)return {status:'ineligible',reason:'identity'};
 try{return await transaction(db,async sql=>{
  const now=await clock(sql),bots=await population(sql),actor=bots.find(b=>b.id===actorId);
  if(!actor||!duelCandidates(bots.map(b=>b.id),window).includes(actorId))return {status:'ineligible',reason:'schedule'};
  if(expansionBotIds.has(actorId)&&(await installedCohort(sql))?.autonomyMode!=='enabled')return {status:'ineligible',reason:'expansion_autonomy_off'};
  const current=duelWindow(now)===window;
  // Serialize the first receipt read with competing new duels. This closes
  // the read-before-commit race without another provider/database operation.
  if(current&&!await tryLockBountyEscrow(sql))return {status:'busy',reason:'escrow_lock'};
  const key=duelCommand(actorId,window);
  const previous=(await sql.query('SELECT kind,intent_hash,result FROM command_receipts WHERE account_id=$1 AND command_id=$2',[actor.account_id,key])).rows[0];
  if(previous){
   const old=previous.result;
   if(previous.kind!=='bot_duel'||old?.policy!==(expansionBotIds.has(actorId)?expansionBotCombat.id:livingCombat.id)||old.actorId!==actorId||old.window!==window||!validId(old.targetId)||!validId(old.battleId)||
    requestedTarget!==undefined&&requestedTarget!==old.targetId||previous.intent_hash!==fingerprint(actorId,old.targetId,window))throw new Error('Autonomous duel receipt identity mismatch.');
   return {status:'replayed',battleId:old.battleId,actorId,targetId:old.targetId};
  }
  if(!current)return {status:'ineligible',reason:'stale_window'};
  const targetId=requestedTarget??duelTarget(bots,actor,window);
  if(!targetId||targetId===actorId)return {status:'ineligible',reason:'target'};
  const rows=(await sql.query<CharacterRow>(`SELECT c.*,true AS development_bot FROM characters c
   JOIN development_bots b ON b.character_id=c.id JOIN accounts a ON a.id=c.account_id
   WHERE c.id=ANY($1::uuid[]) AND b.active AND a.login_disabled ORDER BY c.id FOR UPDATE OF c,b,a SKIP LOCKED`,[[actorId,targetId]])).rows;
  if(rows.length!==2)return {status:'busy',reason:'identity_or_lock'};
  const a=rows.find(r=>r.id===actorId)!,t=rows.find(r=>r.id===targetId)!;
  if(a.account_id!==actor.account_id||t.account_id!==bots.find(b=>b.id===targetId)?.account_id)return {status:'ineligible',reason:'identity_changed'};
  if(!areRivals(a.attained_level,t.attained_level))return {status:'ineligible',reason:'level'};
  // Include expired-but-unsettled escrow. Autonomous work never claims,
  // expires, cancels or refunds a player's bounty as a side effect.
  if((await sql.query("SELECT 1 FROM bounties WHERE status='active' AND (target_id=ANY($1::uuid[]) OR sponsor_id=ANY($1::uuid[])) LIMIT 1",[[actorId,targetId]])).rows.length)return {status:'ineligible',reason:'bounty'};
  const day=new Date(now);day.setUTCHours(0,0,0,0);const hour=new Date(+now-3600000);
  const pressure=(await sql.query(`SELECT count(*) FILTER(WHERE attacker_id=$1 AND created_at>=$3)::int AS initiated,
   count(*) FILTER(WHERE defender_id=$2 AND created_at>=$3)::int AS targeted,
   count(*) FILTER(WHERE defender_id=$2 AND created_at>$4)::int AS recent
   FROM battles WHERE (attacker_id=$1 OR defender_id=$2) AND created_at>=LEAST($3::timestamptz,$4::timestamptz) AND result ? 'botDuelPolicyId'`,[actorId,targetId,day,hour])).rows[0]!;
  if(!duelPressureAllows(pressure as {initiated:number;targeted:number;recent:number}))return {status:'ineligible',reason:'pressure'};
  await sql.query("INSERT INTO command_receipts(account_id,command_id,kind,intent_hash,created_at) VALUES($1,$2,'bot_duel',$3,$4)",[a.account_id,key,fingerprint(actorId,targetId,window),now]);
  const preparedActor=await materialize(sql,a,now),target=await materialize(sql,t,now),state=await stateFrom(sql,preparedActor,now);
  const result:CommandResult={commandId:key,kind:'attack',message:''};
  await resolveBattle(sql,{actor:preparedActor,target,state,now,key,targetIsBot:true,runtime:{developmentBotsEnabled:true},result,autonomousPolicy:livingCombat.id});
  const final=(await sql.query('SELECT attained_level,skill_points FROM characters WHERE id=$1',[actorId])).rows[0]!;
  result.data={newAchievements:[],celebration:levelCelebration(state.level,final.attained_level,final.skill_points-state.skillPoints)};
  await sql.query("UPDATE battles SET result=result||jsonb_build_object('playerExperience',jsonb_build_object($2::text,$3::jsonb)) WHERE id=$1",[result.battleId,actorId,JSON.stringify(result.data)]);
  await sql.query('UPDATE characters SET state_version=state_version+1 WHERE id=$1',[actorId]);
  await sql.query('UPDATE command_receipts SET result=$3 WHERE account_id=$1 AND command_id=$2',[a.account_id,key,{policy:expansionBotIds.has(actorId)?expansionBotCombat.id:livingCombat.id,window,actorId,targetId,battleId:result.battleId,result}]);
  return {status:'battled',battleId:result.battleId,actorId,targetId};
 });}catch(error){
  if(error instanceof GameError&&['RIVAL_LEVEL_RANGE','NEEDS_RECOVERY','OPPONENT_DEFEATED','INSUFFICIENT_SPIRIT'].includes(error.code))return {status:'ineligible',reason:error.code};
  throw error;
 }
}
export async function runBotCombat(db:Database,enabled:boolean){
 const result={considered:0,battled:0,replayed:0,busy:0,ineligible:0};if(!enabled)return result;
 const now=await clock(db),window=duelWindow(now),bots=await population(db);
 for(const id of duelCandidates(bots.map(b=>b.id),window)){
  const duel=await attemptBotDuel(db,true,id,window);result.considered++;
  if(duel.status!=='disabled')result[duel.status]++;
 }
 return result;
}
export function startBotCombat(db:Database,enabled:boolean,onError:(error:unknown)=>void){
 return startScheduledBotWork(()=>runBotCombat(db,true),enabled,livingCombat.intervalMs,onError);
}
