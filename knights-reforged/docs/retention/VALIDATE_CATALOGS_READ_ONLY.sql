-- Version 1: empty, pre-registration catalogs only. Owner Console; no writes.
-- psql variable expected_cluster_digest: previously confirmed PRIVATE digest.
-- Emits only owner_summary. Does not call any catalog-defined function.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path=pg_catalog,pg_temp;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='2s';
WITH managed_roles AS (
 SELECT oid,rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
 rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil,
 rolpassword IS NOT NULL AS password_assigned
 FROM pg_authid WHERE rolname IN
 ('kc_retention_owner','kc_release_copy_owner','kc_retention_runtime','kc_retention_authorizer','kc_copy_registrar')
), namespaces AS (
 SELECT oid,nspname,nspowner,nspacl FROM pg_namespace
 WHERE nspname IN ('release_retention','release_observations')
), relations AS (
 SELECT c.* FROM pg_class c JOIN namespaces n ON n.oid=c.relnamespace
), functions AS (
 SELECT p.* FROM pg_proc p JOIN namespaces n ON n.oid=p.pronamespace
), definitions AS (
 SELECT jsonb_build_array('schema',n.nspname,pg_get_userbyid(n.nspowner)) AS doc FROM namespaces n
 UNION ALL SELECT jsonb_build_array('relation',n.nspname,c.relname,c.relkind,c.relpersistence,
 pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity)
 FROM relations c JOIN namespaces n ON n.oid=c.relnamespace
 UNION ALL SELECT jsonb_build_array('column',n.nspname,c.relname,a.attnum,a.attname,
 format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,
 pg_get_expr(d.adbin,d.adrelid))
 FROM relations c JOIN namespaces n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE c.relkind='r'
 UNION ALL SELECT jsonb_build_array('constraint',n.nspname,c.relname,k.conname,k.contype,
 k.condeferrable,k.condeferred,k.convalidated,pg_get_constraintdef(k.oid))
 FROM pg_constraint k JOIN relations c ON c.oid=k.conrelid JOIN namespaces n ON n.oid=c.relnamespace
 UNION ALL SELECT jsonb_build_array('index',n.nspname,c.relname,pg_get_indexdef(i.indexrelid),
 i.indisvalid,i.indisready,i.indisunique)
 FROM pg_index i JOIN relations c ON c.oid=i.indrelid JOIN namespaces n ON n.oid=c.relnamespace
 UNION ALL SELECT jsonb_build_array('trigger',n.nspname,c.relname,t.tgname,
 t.tgtype,t.tgenabled,pg_get_triggerdef(t.oid))
 FROM pg_trigger t JOIN relations c ON c.oid=t.tgrelid JOIN namespaces n ON n.oid=c.relnamespace
 WHERE NOT t.tgisinternal
 UNION ALL SELECT jsonb_build_array('function',n.nspname,p.proname,
 pg_get_function_arguments(p.oid),pg_get_function_result(p.oid),
 encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),p.proconfig,p.prosecdef,
 p.provolatile,p.proparallel,p.proleakproof,l.lanname,pg_get_userbyid(p.proowner))
 FROM functions p JOIN namespaces n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
 UNION ALL SELECT jsonb_build_array('sequence',n.nspname,c.relname,
 format_type(s.seqtypid,NULL),s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle)
 FROM pg_sequence s JOIN relations c ON c.oid=s.seqrelid JOIN namespaces n ON n.oid=c.relnamespace
), role_definitions AS (
 SELECT jsonb_build_array('role',r.rolname,r.rolcanlogin,r.rolinherit,r.rolsuper,
 r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,r.rolconnlimit,
 r.rolvaliduntil,r.password_assigned) AS doc FROM managed_roles r
 UNION ALL SELECT jsonb_build_array('role_setting',pg_get_userbyid(s.setrole),
 CASE WHEN s.setdatabase=0 THEN 'ALL' WHEN s.setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database()) THEN 'MAINTENANCE' ELSE 'OTHER' END,s.setconfig)
 FROM pg_db_role_setting s WHERE s.setrole IN (SELECT oid FROM managed_roles)
 UNION ALL SELECT jsonb_build_array('membership',pg_get_userbyid(m.roleid),
 pg_get_userbyid(m.member),m.admin_option,m.inherit_option,m.set_option)
 FROM pg_auth_members m
 WHERE m.roleid IN (SELECT oid FROM managed_roles) OR m.member IN (SELECT oid FROM managed_roles)
), acls AS (
 SELECT jsonb_build_array('schema',n.nspname,
 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
 pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable) AS doc
 FROM namespaces n,LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
 UNION ALL SELECT jsonb_build_array('relation',n.nspname,c.relname,
 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
 pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
 FROM relations c JOIN namespaces n ON n.oid=c.relnamespace,
 LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) a
 WHERE c.relkind IN ('r','S')
 UNION ALL SELECT jsonb_build_array('column',n.nspname,c.relname,col.attname,
 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
 pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
 FROM relations c JOIN namespaces n ON n.oid=c.relnamespace
 JOIN pg_attribute col ON col.attrelid=c.oid AND col.attnum>0 AND NOT col.attisdropped,
 LATERAL aclexplode(col.attacl) a
 WHERE c.relkind='r'
 UNION ALL SELECT jsonb_build_array('function',n.nspname,p.proname,
 pg_get_function_identity_arguments(p.oid),
 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
 pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
 FROM functions p JOIN namespaces n ON n.oid=p.pronamespace,
 LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
), logins AS (
 SELECT * FROM managed_roles WHERE rolname IN
 ('kc_retention_runtime','kc_retention_authorizer','kc_copy_registrar')
), effective AS (
 SELECT jsonb_build_array('schema',r.rolname,n.nspname,v.priv,
 has_schema_privilege(r.oid,n.oid,v.priv)) AS doc
 FROM logins r CROSS JOIN pg_namespace n CROSS JOIN (VALUES ('USAGE'),('CREATE')) v(priv)
 WHERE n.nspname IN ('release_retention','release_observations','public')
 UNION ALL SELECT jsonb_build_array('table',r.rolname,n.nspname,c.relname,v.priv,
 has_table_privilege(r.oid,c.oid,v.priv))
 FROM logins r CROSS JOIN relations c JOIN namespaces n ON n.oid=c.relnamespace
 CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) v(priv)
 WHERE c.relkind='r'
 UNION ALL SELECT jsonb_build_array('column',r.rolname,n.nspname,c.relname,a.attname,v.priv,
 has_column_privilege(r.oid,c.oid,a.attnum,v.priv))
 FROM logins r CROSS JOIN relations c JOIN namespaces n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) v(priv)
 WHERE c.relkind='r'
 UNION ALL SELECT jsonb_build_array('sequence',r.rolname,n.nspname,c.relname,v.priv,
 has_sequence_privilege(r.oid,c.oid,v.priv))
 FROM logins r CROSS JOIN relations c JOIN namespaces n ON n.oid=c.relnamespace
 CROSS JOIN (VALUES ('USAGE'),('SELECT'),('UPDATE')) v(priv) WHERE c.relkind='S'
 UNION ALL SELECT jsonb_build_array('function',r.rolname,n.nspname,p.proname,
 pg_get_function_identity_arguments(p.oid),has_function_privilege(r.oid,p.oid,'EXECUTE'))
 FROM logins r CROSS JOIN functions p JOIN namespaces n ON n.oid=p.pronamespace
 UNION ALL SELECT jsonb_build_array('control_function',r.rolname,
 has_function_privilege(r.oid,'pg_catalog.pg_control_system()','EXECUTE'))
 FROM managed_roles r
 UNION ALL SELECT jsonb_build_array('maintenance_database',r.rolname,v.priv,
 has_database_privilege(r.oid,current_database(),v.priv))
 FROM logins r CROSS JOIN (VALUES ('CONNECT'),('CREATE'),('TEMPORARY')) v(priv)
), checks AS (
 SELECT
 (SELECT encode(sha256(convert_to(coalesce(jsonb_agg(doc ORDER BY doc::text COLLATE "C"),'[]')::text,'UTF8')),'hex') FROM definitions)='59416540bd7f8a3d093904709db90ecf4a0189ae4eb197ba06d801313c57b505' AS catalog_definitions_match,
 (SELECT encode(sha256(convert_to(coalesce(jsonb_agg(doc ORDER BY doc::text COLLATE "C"),'[]')::text,'UTF8')),'hex') FROM role_definitions)='40b03997732f654a967175575f5672fc8f9353d3288a2f9acc0c8d09de5ce945' AS role_definitions_match,
 (SELECT encode(sha256(convert_to(coalesce(jsonb_agg(doc ORDER BY doc::text COLLATE "C"),'[]')::text,'UTF8')),'hex') FROM acls)='b21fe9ee52ad7afc8706a3ce1bbf23da8dee31153279293c04f74e533ca6f43f' AS explicit_grants_match,
 (SELECT encode(sha256(convert_to(coalesce(jsonb_agg(doc ORDER BY doc::text COLLATE "C"),'[]')::text,'UTF8')),'hex') FROM effective)='83070d467db898c40460c16292cf7d6f38e3ef1464291092ccc0e6f6312c8ccd' AS effective_permissions_match
)
SELECT jsonb_build_object(
 'kind','read-only-empty-catalog-validation-v1-not-authorization',
 'observed_at',clock_timestamp(),
 'read_only',current_setting('transaction_read_only')='on',
 'maintenance_name_matches',current_database()='Railway',
 'privileged_console_actor_matches',current_user='postgres',
 'postgres_major_matches',current_setting('server_version_num')::int BETWEEN 180000 AND 189999,
 'cluster_matches',encode(sha256(convert_to((SELECT system_identifier::text FROM pg_control_system()),'UTF8')),'hex')=:'expected_cluster_digest',
 'catalog_definitions_match',c.catalog_definitions_match,
 'role_definitions_match',c.role_definitions_match,
 'explicit_grants_match',c.explicit_grants_match,
 'effective_permissions_match',c.effective_permissions_match,
 'all_five_tables_empty',(SELECT count(*) FROM release_retention.copies)
  +(SELECT count(*) FROM release_retention.pins)+(SELECT count(*) FROM release_retention.permits)
  +(SELECT count(*) FROM release_retention.audit)+(SELECT count(*) FROM release_observations.verified_copies)=0,
 'recovery_copy_count',(SELECT count(*) FROM pg_database WHERE datname ~ '^kc_[a-f0-9]{32}_restore_test$'),
 'all_scoped_owners_postgres',(SELECT bool_and(pg_get_userbyid(datdba)='postgres')
  FROM pg_database WHERE datname ~ '^kc_[a-f0-9]{32}_restore_test$' OR oid IN (106971,129180)),
 'emergency_106971_present',EXISTS(SELECT 1 FROM pg_database WHERE oid=106971),
 'emergency_129180_present',EXISTS(SELECT 1 FROM pg_database WHERE oid=129180),
 'no_managed_role_owns_database',NOT EXISTS(SELECT 1 FROM pg_database WHERE datdba IN (SELECT oid FROM managed_roles)),
 'registration_authorized',false,'retirement_authorized',false
) AS owner_summary FROM checks c;
ROLLBACK;
