-- Phase 4.5 is additive. Existing accounts, balances, catalogs and journals are not rewritten.
CREATE TABLE health_restorations (
 id uuid PRIMARY KEY,character_id uuid NOT NULL REFERENCES characters(id),command_id uuid NOT NULL,
 health_before integer NOT NULL,health_after integer NOT NULL,max_health integer NOT NULL,
 level integer NOT NULL,gold_cost integer NOT NULL CHECK(gold_cost>=0),
 ruleset_id text NOT NULL REFERENCES rulesets(id),created_at timestamptz NOT NULL,
 UNIQUE(character_id,command_id),CHECK(health_before>=0 AND health_after= max_health AND health_after>=health_before)
);
CREATE TABLE bot_finance_cycles (
 character_id uuid PRIMARY KEY REFERENCES development_bots(character_id),last_boundary_at timestamptz NOT NULL
);
CREATE TABLE bot_finance_events (
 character_id uuid NOT NULL REFERENCES development_bots(character_id),boundary_at timestamptz NOT NULL,
 gold_charged integer NOT NULL CHECK(gold_charged>=0),status text NOT NULL CHECK(status IN('funded','waiting')),
 ruleset_id text NOT NULL REFERENCES rulesets(id),created_at timestamptz NOT NULL,
 PRIMARY KEY(character_id,boundary_at)
);
CREATE FUNCTION preserve_refinement_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Gameplay financial journals are immutable'; END;
$$;
CREATE TRIGGER health_restorations_immutable BEFORE UPDATE OR DELETE ON health_restorations FOR EACH ROW EXECUTE FUNCTION preserve_refinement_journal();
CREATE TRIGGER bot_finance_events_immutable BEFORE UPDATE OR DELETE ON bot_finance_events FOR EACH ROW EXECUTE FUNCTION preserve_refinement_journal();
