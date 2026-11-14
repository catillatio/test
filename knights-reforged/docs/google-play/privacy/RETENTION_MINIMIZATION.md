# Minimal retained records — owner-approved v6 policy, execution disabled

Owner approved A/B/D, including the exact v6 B proposal at `3d273e8`.
[Approval provenance](APPROVED_POLICY_SOURCE.json) preserves its original byte hash.
This integrated candidate changes the signed wire format to v7 only to represent
conditional C honestly and bind a real protected GitHub coordinator. It does not
broaden B or require B reapproval. No production policy/key, role, journal,
credentials or execution has been installed or activated.

## What changes at fulfillment

| Records | v6 disposition | Why |
|---|---|---|
| Login/password, sessions, human names, owned social/personal/preferences/tutorial data, mutable progress | Physically remove; normalize the inaccessible character FK stub | Genuine personal-data deletion, no login/reclaim or replacement NPC |
| Selected equipment, army composition, progression epoch, income/UI feedback and clocks, achievements, champion/competitive/legacy-stat projections | Remove for the erased subject; block stale rebuilding | Disposable private profile state is not needed for other players' history or financial integrity |
| Ordinary inventory entries/lots without immutable acquisition-event references | Remove | The separate original purchase/sale journals retain their amounts/item facts; the former live inventory is unnecessary |
| Land without a sales or paid-settlement reference | Remove | No shared history needs this private holding row; its original payment ledger is unchanged |
| Inventory/lot and Land rows required by immutable acquisition/sales/settlement FKs | Keep only the existing historical anchor rows, with live quantity/remaining quantity zero; close retained holdings | Preserve exact acquisition/settlement IDs, original quantities/costs/rates/times and referenced history without retaining an active estate or loadout |
| Maintenance account | Clear active rate/activity clock and pause; preserve reserve, arrears and fractional amounts exactly | Stop retaining unnecessary profile state without writing off or redistributing recorded amounts |
| Wallet/Vault/treasury balances; financial, asset-acquisition and shared battle/bounty/rivalry journals | Preserve necessary opaque references, original numbers and provenance; redact typed personal labels | Preserve other players' results, balanced transactions, anti-duplication and original audit facts |
| Signed erasure intent/receipt/checkpoint | Minimal private IDs and proof, under approved D | Prevent an old backup from restoring an erased account |

No sale, refund, income settlement, gift, treasury transfer, monetary write-off,
new NPC or item substitution is performed by erasure. Financial fractions remain
exact. No immutable financial journal is rewritten or bypassed. Removed asset
rows have no remaining FK reference to those historical records. Every retained
full row must match the explicit erasure projection; all unrelated rows and all
original transaction amounts remain exact.

The restricted eraser still has no general asset/financial UPDATE or DELETE
permission. The existing subject-bound SECURITY DEFINER capability performs the
reviewed minimization after identity/hold checks. Achievement permanence has one
narrow, schema-pinned exception for owner-capability deletion of an already
accountless non-NPC human; active accounts and NPC awards remain permanent. Normal
players cannot use that path. Completed erasure records block subsequent profile,
asset and clock rebuilding. All remains inside the existing exclusive SQL lock,
signed exact-target/code/recovery permit, durable external intent and rollback/
full-row witness transaction. No arbitrary GUC or trigger-disable bypass is added.

## Narrowest practical B policy for owner review

1. **Delete disposable state at fulfillment**, ordinarily within the approved
   seven-day operating target. Do not retain a full current estate, loadout,
   achievements, private progress or activity clock merely for general safety.
2. **Retain a record only while a specific shared financial/gameplay journal,
   actual unresolved dispute/security case, or restore-suppression dependency
   requires it.** Use opaque IDs, original necessary numeric/history facts and
   the minimum FK anchors above. No credentials, human labels or deleted content.
   These records remain associated data; this is not an anonymity claim.
3. **Review necessity every 30 days.** Record the dependency/hold and release
   criterion. Dispose of a no-longer-required retained record within 30 days of
   its last dependency/legitimate hold ending, through a separately authorized,
   integrity-checked procedure. No automatic historical-journal purge is claimed
   or activated. Some references can outlast 90 days while the actual immutable
   shared journals still need them; do not promise a fixed universal expiry that
   the current financial architecture cannot safely enforce.
4. **No blanket realm-lifetime permission.** If a category is not necessary for
   that purpose, it does not qualify simply because the table exists. A universal
   finite expiry for the monetary journals themselves would require a separately
   reviewed financial archival design, not a generic Play requirement or a
   reason to destroy other players' transactions now.
5. **Keep genuine holds specific.** Active escrow must settle/expire correctly;
   identifying immutable administrative grants and third-party personal mentions
   need case-specific review. Do not label these requests fulfilled or let an
   unexplained safety hold silently replace a deletion process.

Google Play requires associated-data deletion and transparent legitimate
retention. It does not require any of these financial retention periods, a
particular ledger schema, or an independent legal/privacy certificate. Owner
approval must reflect actual necessity and applicable law; code approval alone
is not approval to retain data or to execute production erasure.

**Decision B approved:** review necessity every 30 days and dispose of a retained
record within 30 days after its final legitimate dependency/hold ends, through a
separately authorized integrity-checked procedure. This is not authority to purge
financial history automatically. A/D approved; C remains conditional.

## C — verified facts and remaining access limit

The protected release source currently requests **90 days** for both encrypted
recovery and verification artifacts. Authenticated metadata for successful release
run #41962151527 confirms the two artifacts expire **2027-02-03T03:31:43Z** (about 90
days after the 2026-11-05 run). No artifact contents were downloaded or expiry
changed. This is not an enforced 30-day routine-backup schedule.

The owner completed both production Backups-tab checks. Postgres has no volume
backup schedule and PITR is disabled; KingdomReleaseCopy has no schedule and its
current image does not support PITR. The two/three online-resize entries are not
scheduled backups. Neither inspection establishes expiry or protected/manual holds.
See [recorded owner evidence](DECISION_C_OWNER_EVIDENCE.json); do not repeat this check.

Published Railway documentation describes daily 6-day, weekly 27-day and monthly 89-day
volume retention; those are product capabilities, not proof any schedule is enabled
here. Published native-bucket documentation says lifecycle configuration/object
locks are unsupported. The existing recovery store code issues bounded PUT/GET
grants, not object-expiry rules. Actual bucket expiry/controlled retirement remains
unverified; do not infer 30-day deletion from a presigned URL expiring or a GitHub
artifact's separate expiry. Restored PostgreSQL databases are another independent
retained copy, with existing adoption/retirement requirements unchanged.

C remains conditional until separately managed recovery objects/databases,
provider retention practices and all protected/manual holds are accounted for.
No new backup survey or retention change is necessary to prepare this candidate.
Emergency OIDs 106971/129180, pinned/current/uncertain copies and 90-day GitHub
artifacts remain protected. A 30-day target is not a current maximum or guarantee.

Sources: [Railway backups](https://docs.railway.com/volumes/backups),
[storage buckets](https://docs.railway.com/storage-buckets),
[public volume API](https://docs.railway.com/integrations/api/manage-volumes),
[Google User Data](https://support.google.com/googleplay/android-developer/answer/10144311).
