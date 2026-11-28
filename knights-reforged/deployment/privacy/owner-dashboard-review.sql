-- Run in the trusted owner session inside the existing exclusive erasure window.
-- Supply account_id and character_id privately as psql variables. Only match
-- counts and target identity are returned. Manual review of unstructured data
-- remains required before signing the execution permit.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog, public, pg_temp;
SET LOCAL statement_timeout = '15s';
SET LOCAL row_security = off;

WITH subject AS (
  SELECT :'account_id'::uuid AS account_id, :'character_id'::uuid AS character_id
), labels AS (
  SELECT lower(value) AS value FROM subject s CROSS JOIN LATERAL (
    SELECT s.account_id::text AS value UNION
    SELECT s.character_id::text UNION
    SELECT username FROM public.accounts WHERE id=s.account_id UNION
    SELECT name FROM public.characters WHERE id=s.character_id AND account_id=s.account_id
  ) x WHERE length(value)>0
), linked_reports AS (
  SELECT r.id FROM public.social_reports r
  LEFT JOIN public.realm_messages m ON m.id=r.message_id CROSS JOIN subject s
  WHERE r.reporter_id=s.character_id OR m.author_id=s.character_id OR m.profile_id=s.character_id
), linked_cases AS (
  SELECT c.report_id FROM public.owner_dashboard_cases c
  WHERE c.report_id IN (SELECT id FROM linked_reports)
     OR EXISTS (SELECT 1 FROM labels WHERE strpos(lower(c.state),value)>0)
), linked_operations AS (
  SELECT 1 FROM public.owner_dashboard_operations o CROSS JOIN subject s
  WHERE o.target_id IN (s.account_id,s.character_id)
     OR o.report_id IN (SELECT id FROM linked_reports UNION SELECT report_id FROM linked_cases)
     OR EXISTS (
       SELECT 1 FROM labels WHERE strpos(lower(concat_ws(' ',o.operator_label,o.action,o.reason,
         o.before_state::text,o.after_state::text,o.result::text)),value)>0
     )
)
SELECT jsonb_build_object(
  'accountId',s.account_id,'characterId',s.character_id,'targetDatabase',current_database(),
  'targetOid',(SELECT oid::text FROM pg_database WHERE datname=current_database()),
  'targetClusterDigest',(SELECT encode(sha256(convert_to(system_identifier::text,'UTF8')),'hex') FROM pg_control_system()),
  'reviewedAt',to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'matchingCases',(SELECT count(*) FROM linked_cases),
  'matchingOperations',(SELECT count(*) FROM linked_operations)
) FROM subject s;
ROLLBACK;
