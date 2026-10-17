-- Additive only: no account, wallet, resource, inventory or historical record reset.
CREATE TABLE army_invitation_codes (
 character_id uuid PRIMARY KEY REFERENCES characters(id),
 code varchar(12) NOT NULL UNIQUE CHECK(code ~ '^[A-F0-9]{12}$')
);
-- Codes identify consenting invitations, not authentication secrets. Retry the
-- unique constraint even in the unlikely event of a truncated digest collision.
DO $$ DECLARE warrior record; candidate text; BEGIN
 FOR warrior IN SELECT id FROM characters ORDER BY id LOOP
  LOOP
   candidate := upper(substr(md5(random()::text || clock_timestamp()::text || warrior.id::text),1,12));
   INSERT INTO army_invitation_codes(character_id,code) VALUES(warrior.id,candidate) ON CONFLICT DO NOTHING;
   EXIT WHEN EXISTS(SELECT 1 FROM army_invitation_codes WHERE character_id=warrior.id);
  END LOOP;
 END LOOP;
END $$;
CREATE TABLE army_events (
 id uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES characters(id),target_id uuid NOT NULL REFERENCES characters(id),
 kind text NOT NULL CHECK(kind IN ('invited','accepted','rejected','canceled','removed')),
 command_id uuid NOT NULL,ruleset_id text NOT NULL REFERENCES rulesets(id),created_at timestamptz NOT NULL,
 CHECK(actor_id<>target_id),UNIQUE(actor_id,command_id)
);
CREATE INDEX army_events_actor ON army_events(actor_id,created_at DESC,id DESC);
CREATE INDEX army_events_target ON army_events(target_id,created_at DESC,id DESC);
CREATE TABLE realm_messages (
 id uuid PRIMARY KEY,author_id uuid NOT NULL REFERENCES characters(id),profile_id uuid REFERENCES characters(id),
 channel text NOT NULL CHECK(channel IN ('comment','broadcast')),
 body varchar(500) NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 500),
 status text NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden','deleted')),
 command_id uuid NOT NULL,ruleset_id text NOT NULL REFERENCES rulesets(id),created_at timestamptz NOT NULL,
 CHECK((channel='comment' AND profile_id IS NOT NULL) OR (channel='broadcast' AND profile_id IS NULL AND length(body)<=280)),
 UNIQUE(author_id,command_id)
);
CREATE INDEX realm_messages_profile ON realm_messages(profile_id,created_at DESC,id DESC);
CREATE INDEX realm_messages_author ON realm_messages(author_id,channel,created_at DESC);
CREATE INDEX realm_messages_public ON realm_messages(channel,created_at DESC,id DESC) WHERE status='visible';
CREATE TABLE social_reports (
 id uuid PRIMARY KEY,message_id uuid NOT NULL REFERENCES realm_messages(id),reporter_id uuid NOT NULL REFERENCES characters(id),
 reason text NOT NULL CHECK(reason IN ('spam','abuse','other')),created_at timestamptz NOT NULL,
 UNIQUE(message_id,reporter_id)
);
CREATE INDEX social_reports_reporter ON social_reports(reporter_id,created_at DESC);
CREATE TABLE social_moderation (
 id uuid PRIMARY KEY,message_id uuid REFERENCES realm_messages(id),character_id uuid REFERENCES characters(id),
 actor_id uuid REFERENCES characters(id),operator_label varchar(80),
 action text NOT NULL CHECK(action IN ('author_delete','profile_hide','operator_hide','operator_restore','mute','unmute')),
 reason varchar(200) NOT NULL,created_at timestamptz NOT NULL,
 CHECK(message_id IS NOT NULL OR character_id IS NOT NULL)
);
CREATE TABLE social_mutes (
 character_id uuid PRIMARY KEY REFERENCES characters(id),until_at timestamptz NOT NULL,
 reason varchar(200) NOT NULL,updated_at timestamptz NOT NULL
);
CREATE INDEX battles_initiated_feed ON battles(attacker_id,created_at DESC,id DESC);
CREATE INDEX battles_received_feed ON battles(defender_id,created_at DESC,id DESC);
