-- A private operator journal, never an HTTP provisioning route or startup grant.
CREATE TABLE authorized_gold_grants (
 authorization_id text PRIMARY KEY,account_id uuid NOT NULL REFERENCES accounts(id),
 character_id uuid NOT NULL REFERENCES characters(id),username text NOT NULL,
 amount integer NOT NULL CHECK(amount>0),balance_before integer NOT NULL,balance_after integer NOT NULL,
 reason text NOT NULL,operator_reference text NOT NULL,
 transaction_id uuid NOT NULL REFERENCES economy_transactions(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK(balance_after=balance_before+amount)
);
CREATE FUNCTION preserve_authorized_gold_grant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Authorized grant history is immutable'; END;
$$;
CREATE TRIGGER authorized_gold_grants_immutable BEFORE UPDATE OR DELETE ON authorized_gold_grants
 FOR EACH ROW EXECUTE FUNCTION preserve_authorized_gold_grant();
CREATE TABLE authentication_limits (
 scope text NOT NULL,key_hash text NOT NULL,window_start timestamptz NOT NULL,
 attempts integer NOT NULL CHECK(attempts>0),PRIMARY KEY(scope,key_hash)
);
