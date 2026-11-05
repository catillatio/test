-- Infrastructure only; no account is erased and no retention policy is activated.
CREATE TABLE account_erasures (
 operation_id uuid PRIMARY KEY,
 account_id uuid NOT NULL UNIQUE,
 character_id uuid NOT NULL UNIQUE,
 request_id uuid NOT NULL,
 intent_sha256 char(64) NOT NULL CHECK(intent_sha256~'^[a-f0-9]{64}$'),
 policy_id text NOT NULL,
 source_scope_sha256 char(64) NOT NULL CHECK(source_scope_sha256~'^[a-f0-9]{64}$'),
 outcome text NOT NULL CHECK(outcome IN ('erased','absent_in_restore')),
 completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE account_erasure_checkpoints (
 sequence bigint PRIMARY KEY CHECK(sequence>=0),
 root_sha256 char(64) NOT NULL CHECK(root_sha256~'^[a-f0-9]{64}$'),
 source_scope_sha256 char(64) NOT NULL CHECK(source_scope_sha256~'^[a-f0-9]{64}$'),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION preserve_account_erasure_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Account erasure records are append-only'; END $$;
CREATE TRIGGER account_erasure_receipt_immutable BEFORE UPDATE OR DELETE ON account_erasures
 FOR EACH ROW EXECUTE FUNCTION preserve_account_erasure_record();
CREATE TRIGGER account_erasure_checkpoint_immutable BEFORE UPDATE OR DELETE ON account_erasure_checkpoints
 FOR EACH ROW EXECUTE FUNCTION preserve_account_erasure_record();
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON account_erasures,account_erasure_checkpoints FROM PUBLIC;

-- Redact only identity labels whose sibling identity, or typed battle side, proves
-- ownership. Numbers, IDs, item names and unrelated players' labels remain exact.
CREATE FUNCTION erase_account_identity_labels(value jsonb,subject uuid,account_subject uuid,
 attacker boolean DEFAULT false,defender boolean DEFAULT false,owned_object boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE result jsonb; pair record; part jsonb; own boolean; label boolean; prefix text;
BEGIN
 IF jsonb_typeof(value)='object' THEN
  result:='{}';
  own:=owned_object OR value->>'id'=subject::text OR value->>'characterId'=subject::text
    OR value->>'accountId'=account_subject::text;
  FOR pair IN SELECT * FROM jsonb_each(value) LOOP
   prefix:=regexp_replace(pair.key,'Name$','');
   label:=pair.key IN ('name','username','displayName') AND coalesce(own,false)
    OR pair.key='attackerName' AND attacker OR pair.key='defenderName' AND defender
    OR pair.key~'Name$' AND (value->>(prefix||'Id')=subject::text OR value->>(prefix||'Id')=account_subject::text);
   IF coalesce(label,false) AND jsonb_typeof(pair.value)='string' THEN part:='"Deleted Warrior"';
   ELSE part:=erase_account_identity_labels(pair.value,subject,account_subject,attacker,defender,
      pair.key='attacker' AND attacker OR pair.key='defender' AND defender); END IF;
   result:=result||jsonb_build_object(pair.key,part);
  END LOOP;
  RETURN result;
 ELSIF jsonb_typeof(value)='array' THEN
  SELECT coalesce(jsonb_agg(erase_account_identity_labels(e,subject,account_subject,attacker,defender,false) ORDER BY ord),'[]') INTO result
   FROM jsonb_array_elements(value) WITH ORDINALITY a(e,ord);
  RETURN result;
 END IF;
 RETURN value;
END $$;

-- The restricted operator can compare credentials without SELECTing password
-- hashes. Only an opaque in-process witness leaves PostgreSQL; never log it.
CREATE FUNCTION account_erasure_credentials_witness(subject uuid) RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
 SELECT encode(sha256(convert_to(coalesce(string_agg(id::text||':'||password_hash,E'\n' ORDER BY id),''),'UTF8')),'hex')
 FROM accounts WHERE id<>subject
$$;
CREATE FUNCTION account_erasure_credentials_removed(subject uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
 SELECT coalesce((SELECT login_disabled AND password_hash='!erased' FROM accounts WHERE id=subject),true)
$$;
REVOKE ALL ON FUNCTION account_erasure_credentials_witness(uuid),account_erasure_credentials_removed(uuid) FROM PUBLIC;
CREATE TRIGGER account_erasure_receipt_no_truncate BEFORE TRUNCATE ON account_erasures
 FOR EACH STATEMENT EXECUTE FUNCTION preserve_account_erasure_record();
CREATE TRIGGER account_erasure_checkpoint_no_truncate BEFORE TRUNCATE ON account_erasure_checkpoints
 FOR EACH STATEMENT EXECUTE FUNCTION preserve_account_erasure_record();
-- An erased account cannot be resurrected by a stale application path.
CREATE FUNCTION guard_erased_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='accounts' THEN
  IF EXISTS(SELECT 1 FROM account_erasures WHERE account_id=OLD.id) THEN
   RAISE EXCEPTION 'Erased identity is protected';
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM account_erasures WHERE character_id=OLD.id) THEN
   IF TG_OP='DELETE' OR NEW.name IS DISTINCT FROM OLD.name OR NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    RAISE EXCEPTION 'Erased identity is protected';
   END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_erasure_identity_guard BEFORE UPDATE OR DELETE ON accounts
 FOR EACH ROW EXECUTE FUNCTION guard_erased_identity();
CREATE TRIGGER character_erasure_identity_guard BEFORE UPDATE OR DELETE ON characters
 FOR EACH ROW EXECUTE FUNCTION guard_erased_identity();
-- Backstop for in-flight notification/social/session paths outside commands.
CREATE FUNCTION guard_erased_personal_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE field text; identity_text text;
BEGIN
 FOREACH field IN ARRAY TG_ARGV LOOP
  identity_text:=to_jsonb(NEW)->>field;
  IF identity_text IS NOT NULL AND EXISTS(SELECT 1 FROM account_erasures
    WHERE CASE WHEN field='account_id' OR TG_TABLE_NAME='accounts' THEN account_id=identity_text::uuid ELSE character_id=identity_text::uuid END) THEN
   RAISE EXCEPTION 'Erased identity is protected';
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
DO $$
DECLARE target text; fields text;
BEGIN
 FOR target,fields IN SELECT * FROM (VALUES
 ('sessions','account_id'),('command_receipts','account_id'),('trade_quotes','account_id,character_id'),
 ('account_deletion_requests','account_id'),('realm_messages','author_id,profile_id'),
 ('social_reports','reporter_id'),('social_moderation','character_id,actor_id'),('social_mutes','character_id'),
 ('social_blocks','character_id,blocked_id'),('social_user_reports','reporter_id,target_id'),
 ('army_links','low_id,high_id,inviter_id'),('army_events','actor_id,target_id'),('army_invitation_codes','character_id'),
 ('notification_reads','character_id'),('notification_state','character_id'),('competitive_attention_starts','character_id'),
 ('army_attention_starts','character_id'),('player_preferences','character_id'),('sound_preferences','character_id'),
 ('tutorial_steps','character_id'),('tutorial_guides','character_id'),('community_policy_acceptances','character_id'),
 ('content_policy_rejections','character_id')) AS reviewed(target,fields) LOOP
  EXECUTE format('CREATE TRIGGER erasure_personal_write_guard BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION guard_erased_personal_write(%s)',
   target,(SELECT string_agg(quote_literal(field),',') FROM unnest(string_to_array(fields,',')) field));
 END LOOP;
END $$;

CREATE TRIGGER account_erasure_insert_guard BEFORE INSERT ON accounts
 FOR EACH ROW EXECUTE FUNCTION guard_erased_personal_write('id');
CREATE TRIGGER character_erasure_insert_guard BEFORE INSERT ON characters
 FOR EACH ROW EXECUTE FUNCTION guard_erased_personal_write('id','account_id');
