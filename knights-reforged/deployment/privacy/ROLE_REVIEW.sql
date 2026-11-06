-- REVIEW ONLY. No role/password creation or activation. Owner must separately
-- authorize installation on the exact game/restored DB after policy approval.
-- Role must already be LOGIN, NO SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS,
-- without memberships, ownership, public CREATE or inherited write grants.
-- Run these statements ONLY in a separately approved installation transaction.
GRANT USAGE ON SCHEMA public TO kc_account_eraser;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO kc_account_eraser;
-- Remove blanket account SELECT; never give the operator other password hashes.
REVOKE SELECT ON accounts FROM kc_account_eraser;
GRANT SELECT(id,username,created_at,login_disabled) ON accounts TO kc_account_eraser;
GRANT UPDATE(snapshot,result) ON battles TO kc_account_eraser;
GRANT UPDATE(result) ON command_receipts TO kc_account_eraser;
-- PostgreSQL requires one UPDATE column privilege for SELECT ... FOR UPDATE.
GRANT UPDATE(status) ON account_deletion_requests TO kc_account_eraser;
GRANT INSERT ON account_erasures,account_erasure_checkpoints TO kc_account_eraser;
GRANT DELETE ON character_quest_progress,character_loot,progression_awards,skill_allocations,sessions,trade_quotes,social_reports,social_moderation,social_mutes,
 social_blocks,social_user_reports,army_links,army_invitation_codes,notification_reads,
 realm_messages,army_events,competitive_attention_starts,army_attention_starts,
 notification_state,player_preferences,sound_preferences,tutorial_steps,tutorial_guides,
 community_policy_acceptances,content_policy_rejections,command_receipts,
 account_deletion_requests,authentication_limits TO kc_account_eraser;
GRANT EXECUTE ON FUNCTION account_erasure_credentials_witness(uuid),account_erasure_credentials_removed(uuid) TO kc_account_eraser;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO kc_account_eraser;
-- Never grant UPDATE/DELETE on financial tables, equipment, Land, bounties or
-- immutable grants. Do not execute this file to resolve a failed preflight.

-- Erasure detaches only the historical integrity anchor and removes the login;
-- it never creates or chooses an NPC. Owner-approved retention and installation first; no activation here.
GRANT EXECUTE ON FUNCTION detach_erased_identity(uuid,uuid) TO kc_account_eraser;
