-- Unreleased PR infrastructure only. No deletion or NPC is activated here.
-- The real login account is removed; historical foreign-key anchors remain
-- private and inert under a separately approved retention exception.
ALTER TABLE characters ALTER COLUMN account_id DROP NOT NULL;
CREATE TABLE graveyard_operations (
 id uuid PRIMARY KEY,catalog_id text NOT NULL,definition_digest char(64) NOT NULL CHECK(definition_digest~'^[a-f0-9]{64}$'),
 policy_record jsonb NOT NULL,approval_record jsonb NOT NULL,population_before integer NOT NULL CHECK(population_before BETWEEN 0 AND 95),
 previous_operations integer NOT NULL CHECK(previous_operations>=0),slots integer[] NOT NULL CHECK(cardinality(slots) BETWEEN 1 AND 12),
 members uuid[] NOT NULL CHECK(cardinality(members)=cardinality(slots)),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON graveyard_operations FROM PUBLIC;
CREATE TABLE abandoned_kingdoms (
 character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
 policy_version text NOT NULL DEFAULT 'graveyard-world-2' CHECK(policy_version='graveyard-world-2'),
 operation_id uuid NOT NULL REFERENCES graveyard_operations(id),slot smallint NOT NULL CHECK(slot BETWEEN 0 AND 95),
 template_id text NOT NULL,garrison integer NOT NULL CHECK(garrison BETWEEN 1 AND 5000),UNIQUE(slot)
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
CREATE TRIGGER graveyard_operations_immutable BEFORE UPDATE OR DELETE ON graveyard_operations
 FOR EACH ROW EXECUTE FUNCTION preserve_account_erasure_record();
CREATE TRIGGER graveyard_operations_no_truncate BEFORE TRUNCATE ON graveyard_operations
 FOR EACH STATEMENT EXECUTE FUNCTION preserve_account_erasure_record();
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
  IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM account_erasures WHERE character_id=OLD.id) AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NEW,'{"account_id":null,"name":"Deleted Warrior","xp":0,"health":0,"energy":0,"health_updated_at":"1970-01-01T00:00:00.000Z","energy_updated_at":"1970-01-01T00:00:00.000Z","attack_ready_at":"1970-01-01T00:00:00.000Z","state_version":1,"created_at":"1970-01-01T00:00:00.000Z","max_health":100,"mana":0,"max_mana":20,"spirit":0,"max_spirit":3,"mana_updated_at":"1970-01-01T00:00:00.000Z","spirit_updated_at":"1970-01-01T00:00:00.000Z","attained_level":1,"level_xp":0,"skill_points":0,"legacy_army_floor":1,"profile_class":"Freeblade","attack_training":0,"defense_training":0,"calling_changed_at":null}'::jsonb)) THEN RAISE EXCEPTION 'Erased profile is protected and minimized'; END IF;
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

-- Erasure never creates, identifies or chooses an NPC. Keeping these operations
-- separate prevents a statement, transaction or receipt from pairing their IDs.
CREATE FUNCTION detach_erased_identity(subject uuid,account_subject uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
 PERFORM 1 FROM characters WHERE id=subject AND account_id=account_subject FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stale identity'; END IF;
 IF EXISTS(SELECT 1 FROM development_bots WHERE character_id=subject)
 OR EXISTS(SELECT 1 FROM bounties WHERE (sponsor_id=subject OR target_id=subject OR claimant_id=subject) AND status='active')
 OR EXISTS(SELECT 1 FROM authorized_gold_grants WHERE account_id=account_subject)
 OR EXISTS(SELECT 1 FROM development_accounts WHERE account_id=account_subject)
 OR EXISTS(SELECT 1 FROM hudson_equipment_grants WHERE account_id=account_subject)
 OR EXISTS(SELECT 1 FROM private_alpha_initializations WHERE dev_account_id=account_subject)
 THEN RAISE EXCEPTION 'Identity has a protected hold'; END IF;
 UPDATE characters SET account_id=NULL,name='Deleted Warrior',xp=0,health=0,energy=0,health_updated_at='1970-01-01T00:00:00.000Z',energy_updated_at='1970-01-01T00:00:00.000Z',attack_ready_at='1970-01-01T00:00:00.000Z',state_version=1,created_at='1970-01-01T00:00:00.000Z',max_health=100,mana=0,max_mana=20,spirit=0,max_spirit=3,mana_updated_at='1970-01-01T00:00:00.000Z',spirit_updated_at='1970-01-01T00:00:00.000Z',attained_level=1,level_xp=0,skill_points=0,legacy_army_floor=1,profile_class='Freeblade',attack_training=0,defense_training=0,calling_changed_at=NULL WHERE id=subject;
 UPDATE champion_standings SET eligible=false,attained_level=1,xp=0,created_at='1970-01-01T00:00:00.000Z' WHERE character_id=subject;
 DELETE FROM accounts WHERE id=account_subject;
END $$;
REVOKE ALL ON FUNCTION detach_erased_identity(uuid,uuid) FROM PUBLIC;
DO $pin_identity_erasure$
DECLARE trusted_schema text:=current_schema();
BEGIN
 EXECUTE format('ALTER FUNCTION %I.detach_erased_identity(uuid,uuid) SET search_path TO pg_catalog,%I,pg_temp',trusted_schema,trusted_schema);
 EXECUTE format('ALTER FUNCTION %I.champions_character_changed() SET search_path TO pg_catalog,%I,pg_temp',trusted_schema,trusted_schema);
 EXECUTE format('ALTER FUNCTION %I.start_character_attention() SET search_path TO pg_catalog,%I,pg_temp',trusted_schema,trusted_schema);
END $pin_identity_erasure$;

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

-- Public-roster construction is a separate capability. The functions expose only
-- aggregate capacity/public world entities, never source accounts or estates.
CREATE FUNCTION graveyard_snapshot(expected jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT jsonb_build_object(
  'installed',EXISTS(SELECT 1 FROM schema_migrations WHERE name='028_account_erasure.sql'),
  'definitions_match',(SELECT definition=expected->'world' FROM rulesets WHERE id='graveyard-world-2')
   AND (SELECT definition=expected#>'{catalogs,alpha-0.3}' FROM rulesets WHERE id='alpha-0.3')
   AND (SELECT definition=expected#>'{catalogs,level100-content-1}' FROM rulesets WHERE id='level100-content-1'),
  'catalog_id',coalesce((SELECT catalog_id FROM realm_expansion_state WHERE singleton),'alpha-0.3'),
  'operations',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY previous_operations) FROM graveyard_operations b),'[]'),
  'occupied_slots',coalesce((SELECT jsonb_agg(slot ORDER BY slot) FROM abandoned_kingdoms),'[]'),
  'world_count',(SELECT count(*) FROM abandoned_kingdoms),'operation_count',(SELECT count(*) FROM graveyard_operations))
$$;
REVOKE ALL ON FUNCTION graveyard_snapshot(jsonb) FROM PUBLIC;

CREATE FUNCTION construct_public_graveyard(operation uuid,expected jsonb,population_policy jsonb,requested_slots integer[],population_before bigint,previous_operations bigint,
 definition_digest text,policy_record jsonb,approval_record jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE state jsonb; roster jsonb; catalog jsonb; template jsonb; item jsonb; property jsonb;
 identities uuid[]; world uuid; at_time timestamptz:=clock_timestamp(); index integer:=0; size integer:=cardinality(requested_slots); guard integer; selected integer;
 desired integer; cap integer; per_operation integer; allowed_slots integer[];
 trusted_schema text; tables text[]; table_name text; predicate text; mismatch boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(61824051);
 state:=graveyard_snapshot(expected);
 desired:=(population_policy->>'targetPopulation')::integer;cap:=(population_policy->>'maximumPopulation')::integer;
 per_operation:=(population_policy->>'maximumNewPerOperation')::integer;
 IF (state->>'installed')::boolean IS DISTINCT FROM true OR (state->>'definitions_match')::boolean IS DISTINCT FROM true
 OR (state->>'world_count')::bigint<>population_before OR (state->>'operation_count')::bigint<>previous_operations
 OR desired IS NULL OR cap IS NULL OR per_operation IS NULL OR size IS NULL
 OR desired<0 OR desired>cap OR cap<1 OR cap>96 OR per_operation<1 OR per_operation>12
 OR size<1 OR size>per_operation OR population_before+size>cap OR definition_digest!~'^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Graveyard population, cap or definitions mismatch'; END IF;
 SELECT array_agg(s ORDER BY s) INTO allowed_slots FROM
  (SELECT s FROM generate_series(0,desired-1) s WHERE NOT EXISTS(SELECT 1 FROM abandoned_kingdoms k WHERE k.slot=s) ORDER BY s LIMIT per_operation) proposed;
 IF requested_slots IS DISTINCT FROM allowed_slots THEN RAISE EXCEPTION 'Exact vacant-slot plan required'; END IF;
 IF EXISTS(SELECT 1 FROM graveyard_operations WHERE id=operation) THEN RAISE EXCEPTION 'Construction already recorded'; END IF;
 SELECT definition INTO STRICT catalog FROM rulesets WHERE id=state->>'catalog_id';
 SELECT definition#>ARRAY['rosters',state->>'catalog_id'] INTO STRICT roster FROM rulesets WHERE id='graveyard-world-2';
 IF jsonb_array_length(roster)<>24 THEN RAISE EXCEPTION 'Invalid public roster'; END IF;
 SELECT array_agg(gen_random_uuid()) INTO identities FROM generate_series(1,size);
 -- Blind full-row preservation stays inside PostgreSQL. The restricted caller
 -- cannot read this owner-only temporary table or obtain any personal row/hash.
 SELECT n.nspname INTO STRICT trusted_schema FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.oid='construct_public_graveyard(uuid,jsonb,jsonb,integer[],bigint,bigint,text,jsonb,jsonb)'::regprocedure;
 IF to_regclass('pg_temp.kc_graveyard_witness') IS NOT NULL THEN RAISE EXCEPTION 'Unexpected preservation state'; END IF;
 CREATE TEMP TABLE kc_graveyard_witness(relation text NOT NULL,fingerprint bytea NOT NULL) ON COMMIT DROP;
 SELECT array_agg(c.relname::text ORDER BY c.relname) INTO tables FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname=trusted_schema AND c.relkind IN ('r','p','m','f');
 FOREACH table_name IN ARRAY tables LOOP
  EXECUTE format('INSERT INTO pg_temp.kc_graveyard_witness SELECT %L,sha256(convert_to(row_to_json(t)::text,''UTF8'')) FROM %I.%I t',table_name,trusted_schema,table_name);
 END LOOP;
 INSERT INTO graveyard_operations(id,catalog_id,definition_digest,policy_record,approval_record,population_before,previous_operations,slots,members,created_at)
 VALUES(operation,state->>'catalog_id',definition_digest,policy_record,approval_record,population_before,previous_operations,requested_slots,identities,at_time);
 FOREACH selected IN ARRAY requested_slots LOOP
  template:=roster->(selected%24);index:=index+1;world:=identities[index];guard:=(template->>'garrison')::integer;
  INSERT INTO characters(id,account_id,name,xp,health,max_health,attained_level,level_xp,skill_points,legacy_army_floor,
   profile_class,attack_training,defense_training,created_at,health_updated_at,energy_updated_at,mana_updated_at,spirit_updated_at,attack_ready_at)
  VALUES(world,NULL,'Abandoned Kingdom',0,(template->>'health')::integer,(template->>'health')::integer,(template->>'level')::integer,0,0,1,
   template->>'calling',(template->>'attackTraining')::integer,(template->>'defenseTraining')::integer,at_time,at_time,at_time,at_time,at_time,at_time);
  INSERT INTO abandoned_kingdoms(character_id,operation_id,slot,template_id,garrison) VALUES(world,operation,selected,template->>'id',guard);
  IF template->'progression' IS NOT NULL THEN
   INSERT INTO character_progression_epochs(character_id,policy_id,boundary_level,boundary_requirement,starting_progress,created_at)
   VALUES(world,template#>>'{progression,policyId}',(template#>>'{progression,boundaryLevel}')::integer,
    (template#>>'{progression,boundaryRequirement}')::integer,0,at_time);
  END IF;
  INSERT INTO wallets(character_id,balance) VALUES(world,0);INSERT INTO vault_accounts(character_id,balance) VALUES(world,0);
  FOR item IN SELECT * FROM jsonb_array_elements(template->'equipment') LOOP
   INSERT INTO inventory_entries(id,character_id,item_definition_id,ruleset_id,quantity,acquired_at)
   VALUES(gen_random_uuid(),world,item->>'itemId',state->>'catalog_id',(item->>'quantity')::integer,at_time);
  END LOOP;
  SELECT value INTO STRICT property FROM jsonb_array_elements(catalog->'properties') WHERE value->>'id'=template#>>'{property,id}';
  INSERT INTO land_holdings(id,character_id,property_id,property_name,ruleset_id,quantity,original_quantity,
   unit_price,hourly_income,hourly_upkeep,interval_seconds,acquired_at,accrued_through)
  VALUES(gen_random_uuid(),world,property->>'id',property->>'name',state->>'catalog_id',(template#>>'{property,quantity}')::integer,
   (template#>>'{property,quantity}')::integer,(property->>'price')::integer,(property->>'hourlyIncome')::integer,(property->>'hourlyUpkeep')::integer,3600,at_time,at_time);
  INSERT INTO land_accounts(character_id,pending_gold) VALUES(world,0);
  INSERT INTO income_cycles(character_id,next_payment_at,created_at) VALUES(world,at_time+interval '1 hour',at_time);
  INSERT INTO maintenance_accounts(character_id,settled_at) VALUES(world,at_time);
 END LOOP;
 FOREACH table_name IN ARRAY tables LOOP
  predicate:='true';
  IF table_name='characters' THEN predicate:=format('NOT (id=ANY(%L::uuid[]))',identities);
  ELSIF table_name='graveyard_operations' THEN predicate:=format('id<>%L::uuid',operation);
  ELSIF EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=trusted_schema AND c.relname=table_name AND a.attname='character_id' AND NOT a.attisdropped) THEN
   predicate:=format('(character_id IS NULL OR NOT (character_id=ANY(%L::uuid[])))',identities);
   IF table_name<>ALL(ARRAY['abandoned_kingdoms','wallets','vault_accounts','inventory_entries','land_holdings','land_accounts','income_cycles','maintenance_accounts','champion_standings','competitive_statistics','character_progression_epochs']) THEN
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE character_id=ANY(%L::uuid[]))',trusted_schema,table_name,identities) INTO mismatch;
    IF mismatch THEN RAISE EXCEPTION 'Unexpected generated personal or activity record'; END IF;
   END IF;
  END IF;
  EXECUTE format('WITH current_rows AS (SELECT sha256(convert_to(row_to_json(t)::text,''UTF8'')) AS fingerprint FROM %I.%I t WHERE %s),original_rows AS (SELECT fingerprint FROM pg_temp.kc_graveyard_witness WHERE relation=%L) SELECT EXISTS((TABLE current_rows EXCEPT ALL TABLE original_rows) UNION ALL (TABLE original_rows EXCEPT ALL TABLE current_rows))',trusted_schema,table_name,predicate,table_name) INTO mismatch;
  IF mismatch THEN RAISE EXCEPTION 'Graveyard preservation mismatch'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION construct_public_graveyard(uuid,jsonb,jsonb,integer[],bigint,bigint,text,jsonb,jsonb) FROM PUBLIC;

CREATE FUNCTION read_graveyard_operation(operation uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT jsonb_build_object('receipt',to_jsonb(b),'entities',(SELECT jsonb_agg(jsonb_build_object(
  'character',to_jsonb(c),'registry',to_jsonb(k),'wallet',(SELECT balance FROM wallets WHERE character_id=c.id),
  'vault',(SELECT balance FROM vault_accounts WHERE character_id=c.id),'pending',(SELECT pending_gold::text FROM land_accounts WHERE character_id=c.id),
  'next_payment',(SELECT next_payment_at FROM income_cycles WHERE character_id=c.id),
  'inventory',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY item_definition_id),'[]') FROM inventory_entries i WHERE character_id=c.id),
  'progression',(SELECT jsonb_build_object('policyId',policy_id,'boundaryLevel',boundary_level,'boundaryRequirement',boundary_requirement,'startingProgress',starting_progress) FROM character_progression_epochs WHERE character_id=c.id),
  'land',(SELECT coalesce(jsonb_agg(to_jsonb(h)),'[]') FROM land_holdings h WHERE character_id=c.id),
  'personal_history_absent',NOT EXISTS(SELECT 1 FROM army_invitation_codes WHERE character_id=c.id)
   AND NOT EXISTS(SELECT 1 FROM notification_state WHERE character_id=c.id)
   AND NOT EXISTS(SELECT 1 FROM progression_awards WHERE character_id=c.id)
   AND NOT EXISTS(SELECT 1 FROM character_quest_progress WHERE character_id=c.id)
   AND NOT EXISTS(SELECT 1 FROM inventory_lots WHERE character_id=c.id)
   AND NOT EXISTS(SELECT 1 FROM development_bots WHERE character_id=c.id)
   AND NOT EXISTS(SELECT 1 FROM accounts WHERE id=c.id)) ORDER BY k.slot)
  FROM abandoned_kingdoms k JOIN characters c ON c.id=k.character_id WHERE k.operation_id=b.id))
 FROM graveyard_operations b WHERE b.id=operation
$$;
REVOKE ALL ON FUNCTION read_graveyard_operation(uuid) FROM PUBLIC;
DO $pin_graveyard$
DECLARE trusted_schema text:=current_schema(); name text; args text;
BEGIN
 FOR name,args IN SELECT * FROM (VALUES
 ('graveyard_snapshot','jsonb'),('construct_public_graveyard','uuid,jsonb,jsonb,integer[],bigint,bigint,text,jsonb,jsonb'),
 ('read_graveyard_operation','uuid')) AS reviewed(n,a) LOOP
  EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path TO pg_catalog,%I,pg_temp',trusted_schema,name,args,trusted_schema);
 END LOOP;
END $pin_graveyard$;
