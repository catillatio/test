import type {Sql} from './db.js';
import {strategy} from './strategy-rules.js';
export const callingChangePolicy=Object.freeze({id:'calling-change-2',cost:1000000,cooldownSeconds:604800,previousPolicy:strategy.id,legacyCooldownSeconds:86400});
export async function callingChangeView(sql:Sql,row:{id:string;calling_changed_at:Date|null}){
 const installed=!!(await sql.query("SELECT to_regclass('calling_policy_epochs') AS t")).rows[0]?.t;
 const current=installed&&!!(await sql.query('SELECT 1 FROM calling_policy_epochs WHERE id=$1',[callingChangePolicy.id])).rows.length;
 if(!current)return {policyId:strategy.id,cost:row.calling_changed_at?strategy.callingChange.laterCost:0,cooldownSeconds:strategy.callingChange.cooldownSeconds,readyAt:row.calling_changed_at?new Date(+new Date(row.calling_changed_at)+strategy.callingChange.cooldownSeconds*1000).toISOString():null};
 const last=(await sql.query('SELECT ruleset_id FROM calling_changes WHERE character_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[row.id])).rows[0];
 const seconds=last?.ruleset_id===callingChangePolicy.id?callingChangePolicy.cooldownSeconds:callingChangePolicy.legacyCooldownSeconds;
 return {policyId:callingChangePolicy.id,cost:callingChangePolicy.cost,cooldownSeconds:callingChangePolicy.cooldownSeconds,readyAt:row.calling_changed_at?new Date(+new Date(row.calling_changed_at)+seconds*1000).toISOString():null};
}
