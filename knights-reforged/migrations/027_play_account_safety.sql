-- Additive account-safety data only. No existing account, gameplay or ledger rows change.
CREATE TABLE account_deletion_requests (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id),
 requested_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
 resolved_at timestamptz,
 CHECK ((status='pending' AND resolved_at IS NULL) OR (status<>'pending' AND resolved_at IS NOT NULL))
);
CREATE UNIQUE INDEX account_deletion_pending ON account_deletion_requests(account_id) WHERE status='pending';
CREATE TABLE social_blocks (
 character_id uuid NOT NULL REFERENCES characters(id), blocked_id uuid NOT NULL REFERENCES characters(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(character_id,blocked_id), CHECK(character_id<>blocked_id)
);
CREATE INDEX social_blocks_target ON social_blocks(blocked_id,character_id);
CREATE TABLE social_user_reports (
 id uuid PRIMARY KEY, reporter_id uuid NOT NULL REFERENCES characters(id), target_id uuid NOT NULL REFERENCES characters(id),
 reason text NOT NULL CHECK(reason IN ('spam','abuse','other')), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(reporter_id<>target_id), UNIQUE(reporter_id,target_id)
);
CREATE TABLE community_policy_acceptances (
 character_id uuid NOT NULL REFERENCES characters(id), policy_version text NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(character_id,policy_version)
);
