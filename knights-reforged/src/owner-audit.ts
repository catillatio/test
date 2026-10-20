// Operator setup is deliberately outside the game's versioned migration list.
// Normal startup/release migration cannot create or run this operator setup.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {type Database,type Sql,transaction} from './db.js';
const definition=readFileSync(new URL('../deployment/operator/audit.sql',import.meta.url),'utf8');
export const auditDefinitionSha256=createHash('sha256').update(definition).digest('hex');
export async function assertOwnerAudit(sql:Sql){
 const row=(await sql.query('SELECT definition_sha256 FROM owner_operator_schema WHERE id=1')).rows[0];
 if(row?.definition_sha256!==auditDefinitionSha256)throw new Error('Owner operator audit setup is unavailable or incompatible.');
 const triggers=(await sql.query(`SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname=current_schema() AND c.relname IN ('owner_operator_actions','owner_operator_schema') AND NOT t.tgisinternal AND t.tgenabled='O' ORDER BY t.tgname`)).rows.map(r=>r.tgname);
 if(JSON.stringify(triggers)!==JSON.stringify(['owner_operator_actions_immutable','owner_operator_actions_no_truncate','owner_operator_schema_immutable','owner_operator_schema_no_truncate']))throw new Error('Owner operator append-only protections are unavailable.');
}
export async function installOwnerAudit(db:Database,actor:{operator:string;sourceSha:string;runId:string}){
 if(actor.operator!=='catillatio'||!/^[a-f0-9]{40}$/.test(actor.sourceSha)||!/^[0-9]{1,20}$/.test(actor.runId))throw new Error('Explicit owner setup authorization is required.');
 return transaction(db,async sql=>{
  await sql.query("SET LOCAL statement_timeout='15s'");await sql.query("SET LOCAL lock_timeout='5s'");await sql.query('SELECT pg_advisory_xact_lock(61824901)');
  const existing=(await sql.query("SELECT to_regclass('owner_operator_schema') AS marker,to_regclass('owner_operator_actions') AS actions")).rows[0]!;
  if(existing.marker||existing.actions){await assertOwnerAudit(sql);return {installed:false,alreadyInstalled:true,definitionSha256:auditDefinitionSha256};}
  await sql.query(definition);
  await sql.query('INSERT INTO owner_operator_schema(id,definition_sha256,installed_by,source_sha,github_run_id) VALUES(1,$1,$2,$3,$4)',[auditDefinitionSha256,actor.operator,actor.sourceSha,actor.runId]);
  await assertOwnerAudit(sql);return {installed:true,alreadyInstalled:false,definitionSha256:auditDefinitionSha256};
 });
}
