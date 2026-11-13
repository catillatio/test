import {type Sql,transactionMemo} from './db.js';
const key=Symbol('account-safety-schema');
// Historical read-only migration fixtures may precede 027. A partial/current
// installation must fail closed; production startup still requires the full head.
export function accountSafetySchema(sql:Sql):Promise<boolean>{return transactionMemo(sql,key,async()=>{
 const row=(await sql.query(`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name='053_play_account_safety.sql') AS installed,
 to_regclass('account_deletion_requests') IS NOT NULL AS deletion,
 to_regclass('social_blocks') IS NOT NULL AS blocks,
 to_regclass('social_user_reports') IS NOT NULL AS reports,
 to_regclass('community_policy_acceptances') IS NOT NULL AS consent`)).rows[0]!;
 if([row.deletion,row.blocks,row.reports,row.consent].some(value=>value!==row.installed))throw Error('Incomplete account-safety schema.');
 return row.installed;
});}
