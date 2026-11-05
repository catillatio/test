-- REVIEW ONLY; not executed or provisioned. Separate LOGIN role with no
-- superuser/ownership/membership/CREATE, no personal-table reads and no table writes.
-- Never reuse the account eraser credential for this capability.
GRANT USAGE ON SCHEMA public TO kc_graveyard_builder;
GRANT EXECUTE ON FUNCTION graveyard_snapshot(jsonb),read_graveyard_batch(uuid),
 construct_public_graveyard(uuid,jsonb,bigint,bigint,bigint,timestamptz,text,jsonb,jsonb) TO kc_graveyard_builder;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO kc_graveyard_builder;
-- No source account, private journal or donor estate is supplied to this worker.
-- Fresh owner approval must attest the full source erasure fence before issuance.
