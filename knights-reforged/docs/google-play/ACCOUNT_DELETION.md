# Account and associated-data deletion

Review candidate, 2026-11-05. No production request or erasure was executed.

## Implemented request path

`GET /account-deletion` is public and linked in the application footer and Settings. The page supplies an anonymous first-party CSRF session. `POST /account-deletion/requests` requires that CSRF token, the configured same-origin check, explicit confirmation and successful existing account/password authentication. A signed-in caller must confirm that same account. The endpoint shares the existing authentication rate limit. Passwords are neither stored with requests nor sent to an operator. No new email/address is collected.

An account-row lock serializes requests; the partial unique index permits one pending request per account. Concurrent requests and lost-response retries return the original receipt. A receipt means **pending request**, never completed erasure. The request does not disable login, revoke another user's session, transfer funds, change a character or erase history. Existing sessions and game data remain unchanged. The additive `027_play_account_safety.sql` migration creates empty safety tables; it does not adopt old consent or modify existing account data.

## Fulfillment gate — still required before publication

A working request form alone does not complete Google Play's deletion obligation. There is intentionally no automatic cascade-delete command in this candidate. The original schema connects accounts/characters to immutable and shared financial, bounty and combat records. Blind deletion would either fail foreign keys or destroy other players' records. Deactivation alone is not deletion.

The publisher/operator must approve a data-specific fulfillment policy and an authenticated alternative-support path for a player who cannot sign in. Unknown legal bases or retention periods must not be invented. The policy must decide exactly which minimized shared records may be retained and for how long. Until operational fulfillment and restore-time erasure handling are verified, readiness remains **FAIL**, not compliant by assertion.

## Required fulfillment procedure

1. Operator privately reads the authenticated pending-request queue; do not export it to Actions logs or public artifacts. Confirm request ownership and the exact account/character pair without asking for its password again. Never process a user-selected arbitrary UUID.
2. Take the existing protected recovery precautions. Lock the account and affected character using the application ordering; prevent new sign-in/commands during fulfillment. Reconcile pending idempotent commands and active bounty/escrow obligations under the **existing** rules, without inventing refunds, gold or rewards.
3. Remove credential material and all sessions. Erase account/display-name identifiers and account associations where feasible. Review public comments/broadcasts, invitations, preferences, reports, moderation content, search/leaderboards, command payloads/results and any identifying embedded JSON. Hiding a message without removing its personal content is not erasure.
4. Preserve only the specific shared financial/combat integrity fields with an approved legitimate retention reason; de-identify or sever personal links. Do not rewrite immutable historical records under the guise of deletion. If current immutable payloads contain identifying data, obtain a reviewed schema/retention design before claiming fulfillment.
5. Record a minimal non-secret completion receipt, policy version and categories retained/erased. Do not mark the request completed before verification; do not overwrite the request timestamp. Limit operator access.
6. Verify authentication/session failure and removal of public identity/content with isolated synthetic fixtures before running an approved production fulfillment. Verify that other players' balances, ledgers, combat outcomes, inventory and bounty obligations are unchanged.
7. Maintain a protected minimal erasure ledger separate from restorable snapshots. Before exposing any restored backup, reapply approved erasures. Publish the real backup expiry and retained-record limits. The existing retention system and emergency OID protections are unchanged; this task authorizes no recovery-copy retirement.

## Test evidence

`tests/play-account-safety.test.ts` exercises the actual Fastify route and PostgreSQL transactions: public pages, CSRF, hostile origin, failed/password-cross-account authentication, concurrent duplicate requests and exact wallet/ledger/character/session preservation. This is request-stage evidence only. No fulfillment implementation, production deletion, backup erasure or legal retention decision is claimed.

[Google account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111) and [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311) were reviewed on 2026-11-05.
