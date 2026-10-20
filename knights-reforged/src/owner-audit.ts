// Bootstrap is a separate privileged job; normal execution must authenticate as
// the non-owning, non-inheriting runtime role. No game startup imports this file.
import {readFileSync} from 'node:fs';
import {createHash,randomBytes,pbkdf2Sync,createHmac} from 'node:crypto';
import {type Database,type Sql,transaction} from './db.js';
const definition=readFileSync(new URL('../deployment/operator/audit.sql',import.meta.url),'utf8');
export const auditDefinitionSha256=createHash('sha256').update(definition).digest('hex');
const guardBody=/AS \$\$([\s\S]*?)\$\$;/.exec(definition)![1]!;
const fail=():never=>{throw new Error('Operator ownership, effective privileges or installed definition mismatch.');};
const ident=(s:string)=>{if(!/^[a-z_][a-z0-9_]{0,62}$/.test(s))fail();return '"'+s+'"';};
export async function operatorRoles(sql:Sql){
 const schema=String((await sql.query('SELECT current_schema() AS schema')).rows[0]!.schema);ident(schema);
 const suffix=schema==='public'?'':('_'+createHash('sha256').update(schema).digest('hex').slice(0,16));
 return {schema,owner:'kc_operator_owner'+suffix,runtime:'kc_operator_runtime'+suffix};
}
const columns:Record<string,Record<string,string[]|true>>={
 accounts:{SELECT:['id','username','login_disabled'],UPDATE:['username']},
 characters:{SELECT:['id','account_id','name'],UPDATE:['name']},
 development_bots:{SELECT:['character_id']},realm_messages:{SELECT:true,UPDATE:['status']},
 social_moderation:{SELECT:['id','message_id','action','reason','created_at'],INSERT:true},
 owner_operator_schema:{SELECT:true},owner_operator_actions:{SELECT:true,INSERT:true}
};
async function catalogSignature(sql:Sql,schema:string){
 const columns=(await sql.query(`SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) AS default_expr
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE n.nspname=$1 AND c.relname IN ('owner_operator_schema','owner_operator_actions') ORDER BY c.relname,a.attnum`,[schema])).rows;
 const constraints=(await sql.query(`SELECT c.relname,p.conname,pg_get_constraintdef(p.oid,true) AS definition FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname IN ('owner_operator_schema','owner_operator_actions') ORDER BY c.relname,p.conname`,[schema])).rows;
 return createHash('sha256').update(JSON.stringify({columns,constraints})).digest('hex');
}
export async function assertOwnerAudit(sql:Sql){
 const {schema,owner,runtime}=await operatorRoles(sql);
 const roles=(await sql.query('SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolinherit,rolcanlogin,rolconnlimit FROM pg_roles WHERE rolname IN ($1,$2)',[owner,runtime])).rows;
 if(roles.length!==2||roles.some(r=>r.rolsuper||r.rolcreaterole||r.rolcreatedb||r.rolreplication||r.rolbypassrls||r.rolinherit||r.rolcanlogin!==(r.rolname===runtime)||(r.rolname===runtime&&r.rolconnlimit!==4)))fail();
 if((await sql.query('SELECT 1 FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ($1,$2))',[owner,runtime])).rows.length)fail();
 const marker=(await sql.query('SELECT definition_sha256,catalog_sha256,owner_role,runtime_role FROM owner_operator_schema WHERE id=1')).rows[0];
 if(marker?.definition_sha256!==auditDefinitionSha256||marker.owner_role!==owner||marker.runtime_role!==runtime||marker.catalog_sha256!==await catalogSignature(sql,schema))fail();
 const objects=(await sql.query(`SELECT c.relname,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname=$1 AND c.relname IN ('owner_operator_schema','owner_operator_actions') AND c.relkind='r'`,[schema])).rows;
 if(objects.length!==2||objects.some(o=>o.owner!==owner||o.relrowsecurity||o.relforcerowsecurity))fail();
 const fn=(await sql.query(`SELECT p.oid,p.prosrc,p.prosecdef,p.proconfig,p.prorettype='trigger'::regtype AS trigger_result,p.pronargs,pg_get_userbyid(p.proowner) AS owner,l.lanname
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=$1 AND p.proname='preserve_owner_operator_audit'`,[schema])).rows;
 if(fn.length!==1||fn[0]!.prosrc!==guardBody||fn[0]!.prosecdef||fn[0]!.proconfig!==null||!fn[0]!.trigger_result||fn[0]!.pronargs!==0||fn[0]!.owner!==owner||fn[0]!.lanname!=='plpgsql')fail();
 const triggers=(await sql.query(`SELECT c.relname,t.tgname,t.tgtype,t.tgenabled,t.tgfoid,t.tgnargs,t.tgqual,t.tgoldtable,t.tgnewtable FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname=$1 AND c.relname IN ('owner_operator_actions','owner_operator_schema') AND NOT t.tgisinternal ORDER BY t.tgname`,[schema])).rows;
 const expected=['owner_operator_actions_immutable','owner_operator_actions_no_truncate','owner_operator_schema_immutable','owner_operator_schema_no_truncate'];
 if(triggers.length!==4||triggers.some((t,i)=>t.tgname!==expected[i]||t.relname!==(t.tgname.startsWith('owner_operator_actions_')?'owner_operator_actions':'owner_operator_schema')||t.tgenabled!=='O'||t.tgfoid!==fn[0]!.oid||t.tgtype!==(t.tgname.endsWith('_immutable')?27:34)||t.tgnargs!==0||t.tgqual!==null||t.tgoldtable!==null||t.tgnewtable!==null))fail();
 // Test EFFECTIVE permissions, including PUBLIC and inherited grants, rather
 // than assuming that absence of an explicit GRANT is sufficient.
 const ddl=(await sql.query(`SELECT has_database_privilege($1,current_database(),'CREATE') OR has_database_privilege($1,current_database(),'TEMP')
 OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=(SELECT oid FROM pg_roles WHERE rolname=$1) OR has_schema_privilege($1,oid,'CREATE'))
 OR EXISTS(SELECT 1 FROM pg_database WHERE datdba=(SELECT oid FROM pg_roles WHERE rolname=$1))
 OR EXISTS(SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=$1))
 OR EXISTS(SELECT 1 FROM pg_proc WHERE proowner=(SELECT oid FROM pg_roles WHERE rolname=$1)) AS forbidden`,[runtime])).rows[0];if(ddl!.forbidden)fail();
 const privileges=(await sql.query(`SELECT n.nspname,c.relname,a.attname,v.privilege FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) v(privilege)
 WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
 AND has_column_privilege($1,c.oid,a.attnum,v.privilege)`,[runtime])).rows;
 for(const p of privileges){const allowed=columns[p.relname]?.[p.privilege];if(p.nspname!==schema||!allowed||(allowed!==true&&!allowed.includes(p.attname)))fail();}
 if((await sql.query("SELECT has_parameter_privilege($1,'session_replication_role','SET') AS forbidden",[runtime])).rows[0]!.forbidden)fail();
 const destructive=(await sql.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
 AND (has_table_privilege($1,c.oid,'DELETE') OR has_table_privilege($1,c.oid,'TRUNCATE') OR has_table_privilege($1,c.oid,'TRIGGER')) LIMIT 1`,[runtime])).rows;if(destructive.length)fail();
 for(const [table,verbs] of Object.entries(columns))for(const [verb,cols] of Object.entries(verbs)){
  const names=cols===true?(await sql.query('SELECT attname FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped',[schema+'.'+table])).rows.map(r=>r.attname):cols;
  for(const column of names)if(!(await sql.query('SELECT has_column_privilege($1,$2,$3,$4) AS ok',[runtime,schema+'.'+table,column,verb])).rows[0]!.ok)fail();
 }
 return {schema,owner,runtime};
}
export async function assertOperatorRuntime(sql:Sql){
 const roles=await assertOwnerAudit(sql),identity=(await sql.query('SELECT current_user AS effective,session_user AS authenticated')).rows[0]!;
 if(identity.effective!==roles.runtime||identity.authenticated!==roles.runtime)fail();return roles;
}
// Same SCRAM verifier format used by libpq/psql: a plaintext password never
// appears in credential-utility SQL. Only the bootstrap process handles it.
function scramVerifier(password:string){
 const salt=randomBytes(16),salted=pbkdf2Sync(password,salt,4096,32,'sha256');
 const h=(text:string)=>createHmac('sha256',salted).update(text).digest();
 return 'SCRAM-SHA-256$4096:'+salt.toString('base64')+'$'+createHash('sha256').update(h('Client Key')).digest('base64')+':'+h('Server Key').toString('base64');
}
export async function installOwnerAudit(db:Database,actor:{operator:string;sourceSha:string;runId:string},runtimePassword?:string){
 if(actor.operator!=='catillatio'||!/^[a-f0-9]{40}$/.test(actor.sourceSha)||!/^[0-9]{1,20}$/.test(actor.runId))fail();
 return transaction(db,async sql=>{
  await sql.query("SET LOCAL statement_timeout='30s'");await sql.query("SET LOCAL lock_timeout='5s'");await sql.query('SELECT pg_advisory_xact_lock(61824901)');
  const {schema,owner,runtime}=await operatorRoles(sql);
  if(!(await sql.query('SELECT rolsuper FROM pg_roles WHERE rolname=session_user')).rows[0]!.rolsuper)fail();
  const existing=(await sql.query("SELECT to_regclass('owner_operator_schema') AS marker,to_regclass('owner_operator_actions') AS actions")).rows[0]!;
  if(existing.marker||existing.actions){await assertOwnerAudit(sql);return {installed:false,alreadyInstalled:true,definitionSha256:auditDefinitionSha256,owner,runtime};}
  const validatedPassword=runtimePassword&&/^[A-Za-z0-9_-]{43,128}$/.test(runtimePassword)?runtimePassword:fail();
  if((await sql.query('SELECT 1 FROM pg_roles WHERE rolname IN ($1,$2)',[owner,runtime])).rows.length)fail();
  // PUBLIC TEMP is normally enabled in PostgreSQL. Preserve every existing
  // role's effective access explicitly before excluding the NEW runtime role.
  // This metadata-only change is part of the exact bootstrap confirmation.
  const database=String((await sql.query('SELECT current_database() AS name')).rows[0]!.name);
  const previousAcl=(await sql.query('SELECT datacl::text AS acl FROM pg_database WHERE datname=current_database()')).rows[0]!.acl;
  const tempRoles=(await sql.query("SELECT rolname FROM pg_roles WHERE has_database_privilege(oid,current_database(),'TEMP') ORDER BY rolname")).rows.map(r=>r.rolname);
  for(const role of tempRoles)await sql.query('GRANT TEMPORARY ON DATABASE '+ident(database)+' TO '+ident(role));
  await sql.query('REVOKE TEMPORARY ON DATABASE '+ident(database)+' FROM PUBLIC');
  await sql.query('CREATE ROLE '+ident(owner)+' NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
  await sql.query('CREATE ROLE '+ident(runtime)+" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 4 PASSWORD '"+scramVerifier(validatedPassword)+"'");
  await sql.query('GRANT CONNECT ON DATABASE '+ident(database)+' TO '+ident(runtime));
  await sql.query('GRANT USAGE ON SCHEMA '+ident(schema)+' TO '+ident(runtime)+','+ident(owner));
  await sql.query(definition);

  for(const table of ['owner_operator_schema','owner_operator_actions']){
   await sql.query('ALTER TABLE '+ident(schema)+'.'+ident(table)+' OWNER TO '+ident(owner));await sql.query('REVOKE ALL ON TABLE '+ident(schema)+'.'+ident(table)+' FROM PUBLIC');
  }
  await sql.query('ALTER FUNCTION '+ident(schema)+'.preserve_owner_operator_audit() OWNER TO '+ident(owner));await sql.query('REVOKE ALL ON FUNCTION '+ident(schema)+'.preserve_owner_operator_audit() FROM PUBLIC');
  for(const [table,verbs] of Object.entries(columns))for(const [verb,cols] of Object.entries(verbs))await sql.query('GRANT '+verb+(cols===true?'':' ('+cols.map(ident).join(',')+')')+' ON TABLE '+ident(schema)+'.'+ident(table)+' TO '+ident(runtime));
  await sql.query('INSERT INTO owner_operator_schema(id,definition_sha256,catalog_sha256,owner_role,runtime_role,installed_by,source_sha,github_run_id,bootstrap_details) VALUES(1,$1,$2,$3,$4,$5,$6,$7,$8)',[auditDefinitionSha256,await catalogSignature(sql,schema),owner,runtime,actor.operator,actor.sourceSha,actor.runId,{previousDatabaseAcl:previousAcl,preservedTemporaryRoles:tempRoles}]);
  await assertOwnerAudit(sql);return {installed:true,alreadyInstalled:false,definitionSha256:auditDefinitionSha256,owner,runtime};
 });
}
