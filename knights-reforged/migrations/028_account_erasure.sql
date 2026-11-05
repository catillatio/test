-- Unreleased PR infrastructure only. No deletion or NPC is activated here.
-- The real login account is removed; historical foreign-key anchors remain
-- private and inert under a separately approved retention exception.
ALTER TABLE characters ALTER COLUMN account_id DROP NOT NULL;
CREATE TABLE abandoned_kingdoms (
 character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
 policy_version text NOT NULL DEFAULT 'independent-estate-zero-wallet-v1'
  CHECK(policy_version='independent-estate-zero-wallet-v1')
);
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON abandoned_kingdoms FROM PUBLIC;
-- Existing champion triggers must support accountless world entities without
-- accidentally making either NPCs or historical anchors leaderboard-eligible.
CREATE OR REPLACE FUNCTION champions_character_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO champion_standings(character_id,eligible,attained_level,xp,created_at)
 VALUES(NEW.id,coalesce(NOT (SELECT login_disabled FROM accounts WHERE id=NEW.account_id),false)
 AND NOT EXISTS(SELECT 1 FROM development_bots WHERE character_id=NEW.id),NEW.attained_level,NEW.xp,NEW.created_at)
 ON CONFLICT(character_id) DO UPDATE SET attained_level=EXCLUDED.attained_level,xp=EXCLUDED.xp;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION start_character_attention() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.account_id IS NOT NULL THEN INSERT INTO notification_state(character_id) VALUES(NEW.id) ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END $$;
CREATE TABLE account_erasures (
 operation_id uuid PRIMARY KEY,
 account_id uuid NOT NULL UNIQUE,
 character_id uuid NOT NULL UNIQUE,
 request_id uuid NOT NULL,
 intent_sha256 char(64) NOT NULL CHECK(intent_sha256~'^[a-f0-9]{64}$'),
 policy_id text NOT NULL,
 execution_proof jsonb NOT NULL,
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
CREATE TRIGGER abandoned_kingdom_identity_immutable BEFORE UPDATE OR DELETE ON abandoned_kingdoms
 FOR EACH ROW EXECUTE FUNCTION preserve_account_erasure_record();
CREATE TRIGGER abandoned_kingdom_no_truncate BEFORE TRUNCATE ON abandoned_kingdoms
 FOR EACH STATEMENT EXECUTE FUNCTION preserve_account_erasure_record();
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
 IF NOT attacker AND NOT defender AND NOT owned_object AND strpos(value::text,subject::text)=0 AND strpos(value::text,account_subject::text)=0 THEN RETURN value; END IF;
 IF jsonb_typeof(value)='object' THEN
  result:='{}';
  own:=owned_object OR value->>'id'=subject::text OR value->>'characterId'=subject::text
    OR value->>'accountId'=account_subject::text;
  FOR pair IN SELECT * FROM jsonb_each(value) LOOP
   IF coalesce(own,false) AND pair.key IN ('accountId','accountCreatedAt','accountAgeDays','invitationCode') THEN CONTINUE; END IF;
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
DO $install$
DECLARE trusted_schema text:=current_schema();
BEGIN
 EXECUTE format($definition$
 CREATE FUNCTION %1$I.account_erasure_credentials_witness(subject uuid) RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
  SELECT encode(sha256(convert_to(coalesce(string_agg(id::text||':'||password_hash,chr(10) ORDER BY id),''),'UTF8')),'hex')
  FROM %1$I.accounts WHERE id<>subject
 $body$ $definition$,trusted_schema);
 EXECUTE format($definition$
 CREATE FUNCTION %1$I.account_erasure_credentials_removed(subject uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
  SELECT NOT EXISTS(SELECT 1 FROM %1$I.accounts WHERE id=subject)
 $body$ $definition$,trusted_schema);
END $install$;
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
  IF TG_OP<>'DELETE' AND NEW.name IS NOT DISTINCT FROM OLD.name AND NEW.account_id IS NOT DISTINCT FROM OLD.account_id THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM account_erasures WHERE character_id=OLD.id) OR EXISTS(SELECT 1 FROM abandoned_kingdoms WHERE character_id=OLD.id) THEN
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
  IF identity_text IS NOT NULL AND (EXISTS(SELECT 1 FROM account_erasures
    WHERE CASE WHEN field='account_id' OR TG_TABLE_NAME='accounts' THEN account_id=identity_text::uuid ELSE character_id=identity_text::uuid END)
    OR (field<>'account_id' AND TG_TABLE_NAME NOT IN ('accounts','characters') AND EXISTS(SELECT 1 FROM characters WHERE id=identity_text::uuid AND account_id IS NULL))) THEN
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
 ('content_policy_rejections','character_id'),('character_quest_progress','character_id'),
 ('character_loot','character_id'),('progression_awards','character_id'),('skill_allocations','character_id')) AS reviewed(target,fields) LOOP
  EXECUTE format('CREATE TRIGGER erasure_personal_write_guard BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION guard_erased_personal_write(%s)',
   target,(SELECT string_agg(quote_literal(field),',') FROM unnest(string_to_array(fields,',')) field));
 END LOOP;
END $$;

CREATE TRIGGER account_erasure_insert_guard BEFORE INSERT ON accounts
 FOR EACH ROW EXECUTE FUNCTION guard_erased_personal_write('id');
CREATE TRIGGER character_erasure_insert_guard BEFORE INSERT ON characters
 FOR EACH ROW EXECUTE FUNCTION guard_erased_personal_write('id','account_id');

-- Never inherit a caller's "$user"/implicit temporary-schema lookup. Trigger
-- relation resolution is fixed to the installation schema, with pg_temp last.
DO $pin$
DECLARE trusted_schema text:=current_schema(); function_name text; arguments text;
BEGIN
 FOR function_name,arguments IN SELECT * FROM (VALUES
 ('preserve_account_erasure_record',''),('guard_erased_identity',''),('guard_erased_personal_write',''),
 ('erase_account_identity_labels','jsonb,uuid,uuid,boolean,boolean,boolean')) AS reviewed(name,args) LOOP
  EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path TO pg_catalog,%I,pg_temp',trusted_schema,function_name,arguments,trusted_schema);
 END LOOP;
END $pin$;

-- Derive the new world entity exclusively from the locked human estate. Fresh
-- keys, zero wallet, no predecessor pointer, no inherited clocks/history/labels.
-- Exact estates can remain linkable through backups: signing this operation
-- requires a separate de-identification assessment, not a claim of anonymity.
CREATE FUNCTION detach_erased_estate(subject uuid,account_subject uuid,new_world_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE source characters%ROWTYPE; at_time timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO STRICT source FROM characters WHERE id=subject AND account_id=account_subject FOR UPDATE;
 IF subject=new_world_id OR account_subject=new_world_id THEN RAISE EXCEPTION 'Invalid estate transition'; END IF;
 IF EXISTS(SELECT 1 FROM development_bots WHERE character_id=subject)
 OR EXISTS(SELECT 1 FROM bounties WHERE (sponsor_id=subject OR target_id=subject OR claimant_id=subject) AND status='active')
 OR EXISTS(SELECT 1 FROM authorized_gold_grants WHERE account_id=account_subject)
 OR EXISTS(SELECT 1 FROM development_accounts WHERE account_id=account_subject)
 OR EXISTS(SELECT 1 FROM hudson_equipment_grants WHERE account_id=account_subject)
 OR EXISTS(SELECT 1 FROM private_alpha_initializations WHERE dev_account_id=account_subject)
 THEN RAISE EXCEPTION 'Estate has a protected hold'; END IF;
 INSERT INTO characters(id,account_id,name,xp,health,energy,max_health,mana,max_mana,spirit,max_spirit,
  attained_level,level_xp,skill_points,legacy_army_floor,profile_class,attack_training,defense_training,
  created_at,health_updated_at,energy_updated_at,mana_updated_at,spirit_updated_at,attack_ready_at)
 VALUES(new_world_id,NULL,'Abandoned Kingdom',0,source.health,source.energy,source.max_health,source.mana,source.max_mana,source.spirit,source.max_spirit,
  source.attained_level,0,0,source.legacy_army_floor,source.profile_class,source.attack_training,source.defense_training,
  at_time,at_time,at_time,at_time,at_time,at_time);
 INSERT INTO abandoned_kingdoms(character_id) VALUES(new_world_id);
 INSERT INTO wallets(character_id,balance) VALUES(new_world_id,0);
 INSERT INTO vault_accounts(character_id,balance) VALUES(new_world_id,0);
 INSERT INTO army_stacks(character_id,unit_definition_id,quantity)
 SELECT new_world_id,unit_definition_id,quantity FROM army_stacks WHERE character_id=subject;
 INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id,quantity,acquired_at)
 SELECT gen_random_uuid(),new_world_id,item_definition_id,ruleset_id,quantity,at_time
 FROM inventory_entries WHERE character_id=subject AND quantity>0;
 -- No resale/acquisition ledger, entitlement, lot IDs or historical timestamps
 -- are copied. This non-player estate cannot sell, trade, purchase or spend.
 INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,
  unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through)
 SELECT gen_random_uuid(),new_world_id,property_id,property_name,ruleset_id,sum(quantity)::integer,sum(quantity)::integer,
  unit_price,hourly_income,hourly_upkeep,interval_seconds,at_time,at_time FROM land_holdings
 WHERE character_id=subject AND quantity>0
 GROUP BY property_id,property_name,ruleset_id,unit_price,hourly_income,hourly_upkeep,interval_seconds;
 INSERT INTO land_accounts(character_id,pending_gold) VALUES(new_world_id,0);
 INSERT INTO income_cycles(character_id,next_payment_at,created_at) VALUES(new_world_id,at_time+interval '1 hour',at_time);
 INSERT INTO maintenance_accounts(character_id,settled_at) VALUES(new_world_id,at_time);
 -- Old financial/gameplay facts stay exact but never accrue or become public.
 UPDATE characters SET account_id=NULL,name='Deleted Warrior' WHERE id=subject;
 UPDATE champion_standings SET eligible=false WHERE character_id=subject;
 DELETE FROM accounts WHERE id=account_subject;
END $$;
REVOKE ALL ON FUNCTION detach_erased_estate(uuid,uuid,uuid) FROM PUBLIC;
DO $pin_estate$
DECLARE trusted_schema text:=current_schema();
BEGIN
 EXECUTE format('ALTER FUNCTION %I.detach_erased_estate(uuid,uuid,uuid) SET search_path TO pg_catalog,%I,pg_temp',trusted_schema,trusted_schema);
 EXECUTE format('ALTER FUNCTION %I.champions_character_changed() SET search_path TO pg_catalog,%I,pg_temp',trusted_schema,trusted_schema);
 EXECUTE format('ALTER FUNCTION %I.start_character_attention() SET search_path TO pg_catalog,%I,pg_temp',trusted_schema,trusted_schema);
END $pin_estate$;

CREATE FUNCTION enforce_accountless_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject uuid; item record; npc boolean; erased boolean;
BEGIN
 subject:=coalesce(to_jsonb(NEW)->>(CASE WHEN TG_TABLE_NAME='characters' THEN 'id' ELSE 'character_id' END),to_jsonb(OLD)->>(CASE WHEN TG_TABLE_NAME='characters' THEN 'id' ELSE 'character_id' END))::uuid;
 SELECT account_id,name INTO item FROM characters WHERE id=subject;
 IF NOT FOUND THEN RETURN NULL; END IF;
 npc:=EXISTS(SELECT 1 FROM abandoned_kingdoms WHERE character_id=subject);
 erased:=EXISTS(SELECT 1 FROM account_erasures WHERE character_id=subject);
 IF (item.account_id IS NULL) IS DISTINCT FROM (npc OR erased)
 OR npc AND erased OR npc AND item.name<>'Abandoned Kingdom' OR erased AND item.name<>'Deleted Warrior'
 THEN RAISE EXCEPTION 'Invalid accountless identity'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER accountless_character_contract AFTER INSERT OR UPDATE OF account_id,name ON characters
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_accountless_identity();
CREATE CONSTRAINT TRIGGER abandoned_kingdom_contract AFTER INSERT OR UPDATE OR DELETE ON abandoned_kingdoms
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_accountless_identity();
DO $pin_identity$
DECLARE trusted_schema text:=current_schema();
BEGIN
 EXECUTE format('ALTER FUNCTION %I.enforce_accountless_identity() SET search_path TO pg_catalog,%I,pg_temp',trusted_schema,trusted_schema);
END $pin_identity$;
