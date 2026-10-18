-- Additive only: no existing account, balance, session, bot or gameplay journal changes.
CREATE TABLE player_preferences (
 character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
 quest_region text NOT NULL DEFAULT 'all',
 tutorial_status text NOT NULL DEFAULT 'not_started' CHECK(tutorial_status IN('not_started','active','skipped','completed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE tutorial_steps (
 character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
 step_id text NOT NULL,completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(character_id,step_id)
);
CREATE TABLE character_achievements (
 character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
 achievement_id text NOT NULL,ruleset_id text NOT NULL REFERENCES rulesets(id),
 metric_at_unlock bigint NOT NULL CHECK(metric_at_unlock>=0),
 earned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 evidence text NOT NULL CHECK(evidence IN('retroactive','gameplay')),
 PRIMARY KEY(character_id,achievement_id)
);
CREATE FUNCTION preserve_achievement_award() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Achievement awards are permanent'; END;
$$;
CREATE TRIGGER character_achievements_permanent BEFORE UPDATE OR DELETE ON character_achievements
 FOR EACH ROW EXECUTE FUNCTION preserve_achievement_award();
CREATE TABLE trade_quotes (
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES accounts(id),
 character_id uuid NOT NULL REFERENCES characters(id),kind text NOT NULL CHECK(kind IN('land_buy','land_sell')),
 property_id text NOT NULL,quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 25),
 gold_amount bigint NOT NULL CHECK(gold_amount>=0),projected_net_hourly bigint NOT NULL,
 consumed_command uuid,consumed_at timestamptz,UNIQUE(account_id,consumed_command),
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX trade_quotes_owner_time ON trade_quotes(account_id,created_at);
CREATE INDEX quest_runs_character_time ON quest_runs(character_id,created_at);
CREATE INDEX battles_defender_outcome ON battles(defender_id,outcome);
