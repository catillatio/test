-- Optional new allocations only. Existing points, capacities, allocations,
-- inventory, combat reports and payment clocks are not reinterpreted.
ALTER TABLE characters
  ADD COLUMN attack_training integer NOT NULL DEFAULT 0 CHECK(attack_training BETWEEN 0 AND 25),
  ADD COLUMN defense_training integer NOT NULL DEFAULT 0 CHECK(defense_training BETWEEN 0 AND 25);
ALTER TABLE skill_allocations DROP CONSTRAINT skill_allocations_resource_check;
ALTER TABLE skill_allocations ADD CHECK(resource IN ('health','mana','spirit','attack','defense'));
-- Earlier allocation rules are not inferred retrospectively.
ALTER TABLE skill_allocations ADD COLUMN ruleset_id text REFERENCES rulesets(id);
