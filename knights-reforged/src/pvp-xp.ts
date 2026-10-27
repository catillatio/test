import {transactionMemo,type Sql} from './db.js';
import type {CharacterRow} from './game.js';
import {boundedVictoryXp,pvpXp,type XpInput,type PvpXpDetails} from './pvp-xp-policy.js';

const schemaKey=Symbol('pvp-xp-schema');
// Older restored schemas remain executable under their recorded legacy rules.
// A partial installation fails closed; only the exact additive migration and
// its ledger together enable the new policy. No environment/client selector.
export function pvpXpSchema(sql:Sql):Promise<boolean>{return transactionMemo(sql,schemaKey,async()=>{
 const row=(await sql.query("SELECT to_regclass('pvp_xp_events') IS NOT NULL AS ledger,EXISTS(SELECT 1 FROM schema_migrations WHERE name='027_pvp_xp_bonus.sql') AS installed")).rows[0]!;
 if(row.ledger!==row.installed)throw Error('Incomplete PvP XP schema.');
 return row.installed as boolean;
});}

// Called inside the combat transaction after sorted character locks. One
// account-level lock also serializes any future additional character slots.
// The battle FK is deferred; rollback/replayed command receipts cannot mint XP.
export async function prepareVictoryXp(sql:Sql,recipient:CharacterRow,opponent:CharacterRow,input:XpInput,now:Date){
 await sql.query('SELECT pg_advisory_xact_lock(728194,hashtext($1))',[recipient.account_id]);
 const cutoff=new Date(+now-pvpXp.windowSeconds*1000);
 const spent=(await sql.query(`SELECT COALESCE(sum(budget_units),0)::int AS units,
  count(*) FILTER (WHERE opponent_account_id=$2)::int AS wins FROM pvp_xp_events
  WHERE recipient_account_id=$1 AND created_at>$3`,[recipient.account_id,opponent.account_id,cutoff])).rows[0]!;
 return boundedVictoryXp(input,spent.wins,Math.min(pvpXp.budgetUnits,spent.units));
}
export async function recordVictoryXp(sql:Sql,battleId:string,recipient:CharacterRow,opponent:CharacterRow,role:'attacker'|'defender',details:PvpXpDetails,credited:number,now:Date){
 if(!details.trivial)return;
 // Persist every easy win, including rounded/exhausted ones, so changing gear,
 // switching roles, logins or getting a level-up never resets the pair taper.
 const bonus=Math.max(0,credited-details.baselineAmount);
 const units=bonus?Math.ceil(bonus*pvpXp.budgetUnits/details.bonusCapacity):0;
 await sql.query(`INSERT INTO pvp_xp_events(battle_id,recipient_account_id,opponent_account_id,recipient_id,role,policy_id,recipient_level,baseline_xp,bonus_xp,budget_units,created_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[battleId,recipient.account_id,opponent.account_id,recipient.id,role,pvpXp.id,recipient.attained_level,details.baselineAmount,bonus,units,now]);
}
