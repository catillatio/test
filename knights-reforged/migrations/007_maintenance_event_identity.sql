-- Funding is an instantaneous command, not an accrual period. Two distinct
-- valid purchases can fund at the same millisecond. Preserve every existing
-- event and use the correct identity for each kind of financial record.
ALTER TABLE maintenance_events DROP CONSTRAINT maintenance_events_character_id_period_start_at_period_end__key;
CREATE UNIQUE INDEX maintenance_accrual_period_unique
  ON maintenance_events(character_id,period_start_at,period_end_at) WHERE reason='accrual';
CREATE UNIQUE INDEX maintenance_funding_command_unique
  ON maintenance_events(character_id,command_id) WHERE reason='fund' AND command_id IS NOT NULL;
