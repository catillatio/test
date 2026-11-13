# Account and Data Deletion

## Request deletion

Use the public /account-deletion page, also linked from Settings. Confirm your existing account name/password and explicitly request deletion. This verifies control without collecting a new email address. A repeated pending request returns the original request receipt.

## What the request does

It queues an authenticated request for account and associated-data deletion. It is not deactivation, does not claim deletion has completed and does not execute destructive operations automatically. You may still sign in while the request is pending.

## Fulfillment requirements

Approved fulfillment deletes the login account and password hash, revokes sessions, removes reviewed personal/social/preferences and mutable progress records, and clears the old private profile traits and timestamps. It preserves unrelated players’ balances and shared historical amounts. Unreferenced private assets and current loadout, army, achievement and progression state are removed. Any necessary retained historical asset anchors have zero live quantities. Opaque identifiers, sealed balances, original financial/combat journals and backup-suppression proof remain restricted associated data and need a justified purpose and defined retention handling; they are not automatically anonymous. The approved ordinary fulfillment target is seven days. Necessary retained records are reviewed every 30 days and disposed of within 30 days after their final legitimate dependency or hold ends through a separately approved procedure. This is not indefinite retention by default or a promise that all shared financial history can immediately be removed.

## Backups and recovery

Encrypted backups remain protected. An independently stored signed suppression record must be reconciled before any restored account data becomes accessible. Protected GitHub recovery artifacts currently last about 90 days. No routine Railway volume-backup schedule is configured; Postgres PITR is off and the recovery service image does not support PITR. A 30-day routine target is not enforced. Other copies, provider retention practices and protected/manual holds are still being accounted for; no universal expiry is promised. Minimal suppression evidence lasts until the last affected backup is destroyed plus 30 days. This is not permission to rewrite immutable backups, delete recovery copies or bypass recovery integrity checks.

## Owner completion required

Publisher and the support/alternative identity-verification contact must be finalized. The restricted operational fulfillment and independent journal must be installed and tested before this draft is published as an operational service. Today the branch provides synthetic-tested requests and fulfillment; production has no active fulfillment operator. See the release-readiness report. Do not send passwords to support or in public messages.
