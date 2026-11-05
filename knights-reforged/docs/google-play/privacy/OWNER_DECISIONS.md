# Erasure policy decisions — owner approval required

Review proposal, 2026-11-05. **No retention exception or erasure policy is active.**
The policy verifier requires a separately signed, explicit `approved: true`
document. This proposal, a green test, or merging PR #88 supplies no approval.

| Data | Proposed treatment / period | Reason and limitation |
|---|---|---|
| Account name, display name, password hash, sessions, own command receipts, invitation codes, own/profile-wall messages, linked reports/moderation, blocks, notification pointers, preferences, consent and tutorial state | Erase in the fulfillment transaction; original identifiers never enter the completion ledger | Prevent login and remove linked personal/social content. Display/account names become reserved tombstones. Other people's content on the removed wall is also erased; approve this scope explicitly. |
| Existing shared financial/combat and game-state anchors | Retain minimized account/character UUIDs, closed non-login tombstones, numeric game state, holdings, financial/inventory/Land journals, combat numbers, achievements/progression and typed historical references **while that shared realm operates**; proposed disposal within 30 days of permanent service closure, subject to a separately reviewed closure procedure | Existing foreign keys and immutable journals make blind cascades unsafe. Identity labels in mutable reports/other players' receipts are redacted, numbers and item names preserved. These records are **pseudonymous, not anonymous**. This is a proposed service-integrity exception, not an assertion of a statutory financial-record obligation. Approve or reject the actual retained categories; a shorter period/severing additional links needs a separate tested purge design. No purge/closure procedure is activated here. |
| Request/completion receipt, signed suppression intent and policy binding | Retain until the last relevant backup/recovery copy is destroyed under its own authorization, then 30 days | Prevent deleted accounts returning after restoration and verify fulfillment. Contains random IDs, policy/operation/time/evidence bindings, no names/passwords/message bodies. Requires controlled access. No automatic ledger expiry is implemented. |
| Encrypted backups and independent recovery copies predating erasure | Proposed normal expiry: 30 days for future routine backups, subject to existing holds/retention minima. Existing legacy, uncertain and emergency copies remain protected pending their separate review; suppress erased identities on every restore for as long as those copies exist | Approval must disclose the actual exception and proposed 30-day review interval for protected copies; **a 30-day expiry is not current production fact**. PR #88 neither deletes nor weakens protection of any copy, including OIDs 106971/129180. If indefinite protected-backup retention cannot be justified, resolve that policy before publication. |
| Active bounty/escrow; operator/bot accounts; immutable administrative grants containing an account name | Hold; no completed-erasure claim | Settle obligations only through existing approved gameplay/operations. For an immutable identifying grant, approve a separately reviewed privacy-compatible archival/redaction mechanism or a specific legitimate time-bounded exception. This tool never disables immutable triggers. |
| Incidental personal mentions in unlinked third-party content/provider logs | Private request-specific review; operator must clear this before signing the execution permit | Structured ownership cannot prove the meaning of arbitrary free text or provider logs. Do not certify those data as erased automatically. Choose provider log retention, response deadline, alternative identity-verification/support route and appeal/moderation handling. Do not request passwords through support. |

The supported policy contract currently expresses the proposed shared-realm and
backup-suppression exceptions above. It intentionally rejects a different or
incomplete policy. If the owner chooses a different schedule, revise and test
that contract; do not silently substitute approval text. Final public notices
must describe the **approved actual practice**, not this proposal.

Before first production fulfillment, separate approval is also required for the
private operator role/grants, purpose-bound public-key trust and signing custody,
external append-only journal storage and recovery guard configuration. No
production key, credential, role or infrastructure is provisioned by this PR.
No existing retention/release signing credential is automatically repurposed.
