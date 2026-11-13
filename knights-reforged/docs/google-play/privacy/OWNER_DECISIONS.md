# Recorded retention decisions — no new policy approval requested

| Decision | State | Operational meaning |
|---|---|---|
| A | Approved | Prompt account/personal-data deletion, ordinarily within seven days, after authorized operational setup. |
| B | Approved at `3d273e8` | Only necessary financial/shared-history/security/recovery references; remove unnecessary personal data. Review necessity every 30 days; dispose within 30 days after the final dependency/hold ends, through a separately approved procedure. |
| C | Conditional | 30-day routine-backup target is not enforced. GitHub recovery artifacts are about 90 days. Owner verified both Railway services have no scheduled volume backups; Postgres PITR is off, ReleaseCopy PITR unavailable. Resize entries prove no retention window or holds. Other copies/provider practices/holds remain unresolved and protected. |
| D | Approved | Minimal protected erasure evidence prevents resurrection until the last relevant backup is destroyed, plus 30 days. |

The exact approved v6 B text is preserved by hash in
[APPROVED_POLICY_SOURCE.json](APPROVED_POLICY_SOURCE.json). Current v7 signed packets
retain these terms, explicitly encode conditional C, and bind the real release
mutex. No new key or production signature was created. No policy is activated.
[Completed C evidence](DECISION_C_OWNER_EVIDENCE.json) must not be requested again.

Remaining owner actions are factual publisher/contact/legal text, separate
backend deployment and private restricted operator/journal installation approval,
then synthetic operational acceptance. Real erasure remains separately disabled.
No universal Google Play independent legal certification is asserted. Optional
abandoned kingdoms are independent, archived and excluded from this launch.
