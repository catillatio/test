-- Existing trusted private PostgreSQL Console ONLY. No connection string needed.
-- Names/OIDs are private operational evidence: keep output out of public logs.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='2s';
SELECT current_database() AS maintenance_database, current_user AS observer,
       clock_timestamp() AS observed_at,
       encode(sha256(convert_to(system_identifier::text,'UTF8')),'hex') AS cluster_digest
FROM pg_control_system();
SELECT d.datname AS name,d.oid::text AS oid,r.rolname AS owner,
       d.datistemplate AS template,d.datallowconn AS allows_connections,
       pg_database_size(d.oid)::text AS bytes,
       (SELECT count(*) FROM pg_stat_activity a WHERE a.datid=d.oid) AS connections,
       CASE WHEN d.oid IN (106971,129180) THEN 'EMERGENCY: PROTECTED'
            WHEN d.datistemplate OR d.datname=current_database() THEN 'SYSTEM: PROTECTED'
            ELSE 'UNRECONCILED: PROTECTED' END AS protection
FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba ORDER BY d.datname;
SELECT sum(pg_database_size(oid))::text AS database_bytes FROM pg_database;
-- Inventory contains no inference of database creation time or cleanup safety.
COMMIT;
-- Optional SEPARATE read-only statement, only with existing monitor permission:
-- SELECT coalesce(sum(size),0)::text AS wal_bytes FROM pg_ls_waldir();
-- PostgreSQL logical sizes + WAL are not filesystem usage/free-space evidence.
