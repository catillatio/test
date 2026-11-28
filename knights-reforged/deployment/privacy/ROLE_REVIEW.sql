-- REVIEW ONLY. No role/password creation or activation. Owner must separately
-- authorize installation on the exact game/restored DB after policy approval.
-- Role must already be LOGIN, NO SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS,
-- without memberships, ownership, public CREATE or inherited write grants.
-- Run these statements ONLY in a separately approved installation transaction.
GRANT USAGE ON SCHEMA public TO kc_account_eraser;
-- Application table allowlist, resolved in the trusted target schema.
GRANT SELECT ON TABLE
  abandoned_kingdoms, account_deletion_requests, account_erasure_checkpoints,
  account_erasures, achievement_gold_receipts, achievement_gold_state,
  army_attention_starts, army_events, army_invitation_codes,
  army_links, army_stacks, authentication_limits,
  authorized_gold_grants, battles, bot_finance_cycles,
  bot_finance_events, bounties, bounty_events,
  bounty_kills, calling_changes, calling_policy_epochs,
  champion_standings, character_achievements, character_income_feedback,
  character_loot, character_progression_epochs, character_quest_progress,
  characters, command_receipts, community_policy_acceptances,
  competitive_attention_starts, competitive_deaths, competitive_statistics,
  content_policy_rejections, crown_transactions, crown_wallets,
  development_account_resets, development_accounts, development_bot_estates,
  development_bot_events, development_bots, economy_entries,
  economy_transactions, equipment_slots, equipment_upkeep_entitlements,
  expansion_bot_activations, expansion_bot_autonomy_events, expansion_bot_cohorts,
  expansion_bot_members, graveyard_operations, health_restorations,
  hudson_equipment_grants, income_cycles, inventory_acquisition_events,
  inventory_entries, inventory_lots, inventory_transactions,
  land_accounts, land_holdings, land_income_settlements,
  land_partial_settlements, land_sales, legacy_casualty_statistics,
  legacy_field_statistics, maintenance_accounts, maintenance_events,
  maintenance_rate_events, notification_read_batches, notification_reads,
  notification_state, npc_army_adjustments, npc_army_memberships,
  npc_sponsored_bounties, npc_sponsorship_holds, npc_sponsorship_windows,
  player_preferences, private_alpha_initializations, progression_awards,
  pvp_loot_sequences, quest_equipment_outcomes, quest_runs,
  rare_equipment_authorizations, realm_expansion_events, realm_expansion_state,
  realm_messages, rival_recommendation_entries, rival_recommendation_snapshots,
  rivalry_totals, rulesets, schema_migrations,
  sessions, skill_allocations, social_blocks,
  social_moderation, social_mutes, social_reports,
  social_user_reports, sound_preferences, trade_quotes,
  treasury_retained_events, tutorial_guides, tutorial_steps,
  vault_accounts, vault_entries, wallets
TO kc_account_eraser;
GRANT SELECT(id,username,created_at,login_disabled) ON accounts TO kc_account_eraser;
GRANT UPDATE(snapshot,result) ON battles TO kc_account_eraser;
GRANT UPDATE(result) ON command_receipts TO kc_account_eraser;
-- PostgreSQL requires one UPDATE column privilege for SELECT ... FOR UPDATE.
GRANT UPDATE(status) ON account_deletion_requests TO kc_account_eraser;
GRANT INSERT ON account_erasures,account_erasure_checkpoints TO kc_account_eraser;
GRANT DELETE ON rival_recommendation_entries,rival_recommendation_snapshots,notification_read_batches,npc_sponsorship_holds,character_quest_progress,character_loot,progression_awards,skill_allocations,sessions,trade_quotes,social_reports,social_moderation,social_mutes,
 social_blocks,social_user_reports,army_links,army_invitation_codes,notification_reads,
 realm_messages,army_events,competitive_attention_starts,army_attention_starts,
 notification_state,player_preferences,sound_preferences,tutorial_steps,tutorial_guides,
 community_policy_acceptances,content_policy_rejections,command_receipts,
 account_deletion_requests,authentication_limits TO kc_account_eraser;
GRANT EXECUTE ON FUNCTION account_erasure_credentials_witness(uuid),account_erasure_credentials_removed(uuid) TO kc_account_eraser;
-- The protected --no-acl restore removes default PUBLIC execution. Replay
-- still needs this pure JSON projection for its before/after row witnesses.
GRANT EXECUTE ON FUNCTION erase_account_identity_labels(jsonb,uuid,uuid,boolean,boolean,boolean) TO kc_account_eraser;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO kc_account_eraser;
-- Never grant UPDATE/DELETE on financial tables, equipment, Land, bounties or
-- immutable grants. Do not execute this file to resolve a failed preflight.

-- Erasure detaches only the historical integrity anchor and removes the login;
-- it never creates or chooses an NPC. Owner-approved retention and installation first; no activation here.
GRANT EXECUTE ON FUNCTION detach_erased_identity(uuid,uuid) TO kc_account_eraser;
