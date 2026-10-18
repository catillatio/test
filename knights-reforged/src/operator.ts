import {randomUUID} from 'node:crypto';
import {type Database,type Sql,transaction} from './db.js';
import {GameError} from './errors.js';
import {ledger} from './economy.js';
import {experienceRules} from './experience-rules.js';
import {privateAlphaEnabled} from './private-alpha-policy.js';
export const grayAuthorization='phase44-authorized-gray-50000-v1';
export function requireRailwayOperator(env:NodeJS.ProcessEnv){
 if(!privateAlphaEnabled(env))throw new Error('Operator commands require the authenticated Railway private-alpha environment.');
}
async function exactGray(sql:Sql){
 const rows=(await sql.query(`SELECT a.id AS account_id,a.username,a.login_disabled,c.id AS character_id,c.name,c.attained_level AS level,w.balance AS spendable_gold,
 COALESCE(v.balance,0) AS vault_gold,EXISTS(SELECT 1 FROM development_bots WHERE character_id=c.id) AS bot
 FROM accounts a JOIN characters c ON c.account_id=a.id JOIN wallets w ON w.character_id=c.id LEFT JOIN vault_accounts v ON v.character_id=c.id WHERE a.username=$1`,['gray'])).rows;
 if(rows.length!==1||rows[0]!.bot||rows[0]!.login_disabled)throw new Error('Exact eligible username gray was not uniquely identified. No grant was performed.');
 return rows[0]!;
}
export async function inspectGray(db:Database,env:NodeJS.ProcessEnv){requireRailwayOperator(env);return exactGray(db);}
export async function grantGray(db:Database,env:NodeJS.ProcessEnv){
 requireRailwayOperator(env);
 if(env.KINGDOM_GRAY_GRANT_CONFIRM!=='GRANT_GRAY_50000_PHASE44'||!env.KINGDOM_GRAY_ACCOUNT_ID||!/^.{8,160}$/.test(env.KINGDOM_OPERATOR_REFERENCE??''))
  throw new Error('Inspect gray first, then supply its exact account ID, explicit grant confirmation and an operator reference.');
 return transaction(db,async sql=>{
  await sql.query('SELECT pg_advisory_xact_lock(61824080)');
  const identity=await exactGray(sql);
  if(identity.account_id!==env.KINGDOM_GRAY_ACCOUNT_ID)throw new Error('Account identity mismatch. No grant was performed.');
  await sql.query('SELECT id FROM characters WHERE id=$1 FOR UPDATE',[identity.character_id]);
  const completed=(await sql.query('SELECT * FROM authorized_gold_grants WHERE authorization_id=$1',[grayAuthorization])).rows[0];
  if(completed){if(completed.account_id!==identity.account_id)throw new Error('The authorization already belongs to another identity.');return {applied:false,alreadyApplied:true,authorizationId:grayAuthorization,accountId:identity.account_id};}
  const before=(await sql.query('SELECT balance FROM wallets WHERE character_id=$1 FOR UPDATE',[identity.character_id])).rows[0]!.balance as number;
  if(before>2147483647-50000)throw new GameError('TREASURY_FULL','The full grant cannot fit in the spendable purse. No balance was changed.',409);
  const command=randomUUID();await ledger(sql,command,'authorized_administrative_grant',[{characterId:identity.character_id,amount:50000}],experienceRules.id);
  const entry=(await sql.query('SELECT id FROM economy_transactions WHERE command_id=$1 AND reason=$2',[command,'authorized_administrative_grant'])).rows[0]!;
  await sql.query(`INSERT INTO authorized_gold_grants(authorization_id,account_id,character_id,username,amount,balance_before,balance_after,reason,operator_reference,transaction_id)
   VALUES($1,$2,$3,'gray',50000,$4,$5,$6,$7,$8)`,[grayAuthorization,identity.account_id,identity.character_id,before,before+50000,'Explicit realm-owner authorization for Phase 4.4; additional spendable gold, no progress reset.',env.KINGDOM_OPERATOR_REFERENCE,entry.id]);
  await sql.query('UPDATE characters SET state_version=state_version+1 WHERE id=$1',[identity.character_id]);
  return {applied:true,alreadyApplied:false,authorizationId:grayAuthorization,accountId:identity.account_id,goldAdded:50000,balanceBefore:before,balanceAfter:before+50000};
 });
}
