import assert from 'node:assert/strict';
import {type Sql} from '../db.js';
import {privacyColumns} from './schema.js';
export const erasureDeleteTables=['sessions','trade_quotes','social_reports','social_moderation','social_mutes','social_blocks','social_user_reports','army_links','army_invitation_codes','notification_reads','realm_messages','army_events','competitive_attention_starts','army_attention_starts','notification_state','player_preferences','sound_preferences','tutorial_steps','tutorial_guides','community_policy_acceptances','content_policy_rejections','command_receipts','account_deletion_requests','authentication_limits'];
const updates:Record<string,string[]>={accounts:['username','password_hash','login_disabled'],characters:['name'],champion_standings:['eligible'],battles:['snapshot','result'],command_receipts:['result'],account_deletion_requests:['status','resolved_at']};
export async function assertErasureOperator(sql:Sql,expectedRole='kc_account_eraser',expectedSchema='public'){
 assert.equal((await sql.query('SELECT current_schema() AS schema')).rows[0]!.schema,expectedSchema,'Unexpected erasure schema.');
 const role=(await sql.query(`SELECT current_user AS name,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,
 EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS member,
 EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) OR EXISTS(SELECT 1 FROM pg_database WHERE datdba=r.oid) OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=r.oid) AS owns_objects,
 has_schema_privilege(current_schema(),'CREATE') AS can_create FROM pg_roles r WHERE rolname=current_user`)).rows[0]!;
 assert.equal(role.name,expectedRole);
 for(const key of ['rolsuper','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls','member','owns_objects','can_create'])assert.equal(role[key],false,'Restricted erasure role required.');
 for(const [table,definition] of Object.entries(privacyColumns)){
  const rights=(await sql.query(`SELECT has_table_privilege($1,'DELETE') AS remove,has_table_privilege($1,'TRUNCATE') AS truncate`,[table])).rows[0]!;
  assert.equal(rights.remove,erasureDeleteTables.includes(table),'Unexpected erasure delete privilege.');assert.equal(rights.truncate,false);
  for(const column of definition.split('|').map(c=>c.split(':')[0]!)){
   const grants=(await sql.query(`SELECT has_column_privilege($1,$2,'SELECT') AS read,has_column_privilege($1,$2,'UPDATE') AS update,has_column_privilege($1,$2,'INSERT') AS insert`,[table,column])).rows[0]!;
   assert.equal(grants.read,!(table==='accounts'&&column==='password_hash'),'Unexpected credential access.');
   assert.equal(grants.update,updates[table]?.includes(column)??false,'Unexpected erasure update privilege.');
   assert.equal(grants.insert,['account_erasures','account_erasure_checkpoints'].includes(table),'Unexpected erasure insert privilege.');
  }
 }
}
