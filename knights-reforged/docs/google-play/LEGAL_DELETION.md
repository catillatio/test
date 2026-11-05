# Account and Data Deletion

## Request deletion

Use the public /account-deletion page, also linked from Settings. Confirm your existing account name/password and explicitly request deletion. This verifies control without collecting a new email address. A repeated pending request returns the original request receipt.

## What the request does

It queues an authenticated request for account and associated-data deletion. It is not deactivation, does not claim deletion has completed and does not execute destructive operations automatically. You may still sign in while the request is pending.

## Fulfillment requirements

Approved fulfillment deletes the login account and password hash, revokes sessions, removes reviewed personal/social/preferences and mutable progress records, and clears the old private profile traits and timestamps. It preserves unrelated players’ balances and shared historical amounts. Any retained opaque identifiers, sealed assets, financial/combat journals or backup-suppression proof remain restricted associated data and need a justified purpose and defined retention handling; they are not automatically anonymous. Retention categories/periods and response time: [OWNER TO COMPLETE].

## Backups and recovery

Encrypted backups remain protected. An independently stored signed suppression record must be reconciled before any restored account data becomes accessible. Routine expiry, protected-copy handling and provider log retention: [OWNER TO COMPLETE]. This is not permission to rewrite immutable backups, delete recovery copies or bypass recovery integrity checks.

## Owner completion required

Publisher, support/alternative identity-verification route, response time, retention periods, legal exceptions and the operational fulfillment procedure must be approved and implemented before claiming deletion-policy compliance. See the release-readiness report. Do not send passwords to support or in public messages.
