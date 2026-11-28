# Account deletion — implemented, production execution disabled

A/B/D are already approved; C remains conditional. The approved v6 B terms and
completed Railway observations are preserved in [owner decisions](privacy/OWNER_DECISIONS.md).
No NPC is created, scheduled or counted by deletion. Optional graveyard code is
archived/excluded from launch and all construction/income gates remain off.

## Implemented behavior

Public `/account-deletion` and Settings authenticate the existing account/password
and require explicit confirmation, same-origin CSRF protection and rate limits.
Repeated requests reuse the pending receipt. Login alone does not erase an account.
The request routes are in the merged backend source. Production fulfillment remains
disabled. Synthetic tests verify the request flow and fulfillment separately.

Signed fulfillment physically deletes the login account and credentials, sessions,
posting content, reports/blocks/consent, disposable profile/loadout/army/progression,
achievement state and private caches. Typed personal names and private identifiers
are removed from shared JSON reports. Current financial references retain sealed
balances and only necessary historical facts; historically referenced asset rows
have zero live quantities. They remain restricted associated data, not a claim of
anonymity. Every unaffected row is witnessed by PostgreSQL full-row hashes;
unknown schema/JSON shapes fail closed. Other players' money, equipment, battles,
transactions and immutable rulesets remain intact.

The current deployed schema upgrades through **053/054** after production 052.
All 33 deployed migrations remain byte-identical. The contract explicitly covers
106 tables, including achievement/Crowns receipts, NPC funding evidence and current
notification/matchmaking caches. No financial receipt is deleted or rewritten.

## Bounded authorization and recovery

`deployment/privacy/approve.mjs` is an owner-private packet signer using the
existing Ed25519 primitive. It generates no key, never runs in the game/worker and
writes only a private file with O_EXCL/fsync. Current policy/intent protocols are
v7; execution permit is v2. Prior v6 approvals remain recorded policy decisions,
not reusable cryptographic permits.

A fresh permit binds the account/request/operation, signed policy, exact packaged
source and candidate, database name/OID/cluster, journal head, encrypted backup and
independent recovery evidence, external holds and a <=15-minute expiry. It also
binds a real protected GitHub workflow run, attempt and job. No environment-variable
claim substitutes for this window.

`.github/workflows/account-erasure-window.yml` reuses the existing GitHub
**Production** environment and `kingdom-come-production` concurrency group.
The release preflight verifies the exact protected `release/production` commit,
successful full CI, the sole owner reviewer, the production branch restriction
and disabled administrator bypass. The workflow accepts only the digest of the
private operation UUID and receives no database, Railway or signing credentials.
The private operator checks that the owner's Production approval belongs to this
exact erasure workflow, run, attempt, job, source and operation before starting,
before appending the journal and before committing. Cancellation, expiry or missing
Actions read access stops the operation. The job is bounded to 20 minutes and
the permit to 15 minutes.

After separate operational authorization, dispatch with
`gh workflow run account-erasure-window.yml -R catillatio/test --ref release/production -f operation_digest=<sha256>`.
The owner approves the **Production** review for that exact run. Once the private
operator reports `ACCOUNT_ERASURE: VERIFIED` and has closed its database
connection, the authorized coordinator can end the window with
`gh run cancel <run-id> -R catillatio/test`. Closing it earlier makes fulfillment
fail closed. A distinct `account-erasure` GitHub environment is unnecessary.

The private CLI is `node deployment/privacy/fulfill.mjs /absolute/private/packet.json`.
It requires the exact immutable game image, realm identity, the column-restricted
`kc_account_eraser` role reviewed in `deployment/privacy/ROLE_REVIEW.sql`, an active
signed permit, execution enabled explicitly for the authorized operation, and the
independent journal. Never install database superuser credentials in this service.
The signer private key stays owner-private; it is never installed in the operator,
game, verification worker, GitHub window job or journal relay.

## Owner-dashboard data review

The production catalog has two dashboard tables and an activity view. The tables
can retain report and target identifiers, operator labels, reasons and JSON state.
The activity view derives its account identifier from command receipts. Erasure
removes the subject's receipts and their view rows through the normal receipt
cleanup.

The schema guard validates the three dashboard objects independently of gameplay
and privacy tables. The restricted role has no table or column privileges on them.
When the dashboard is present, both fulfillment and restore replay require an
owner-signed review for the exact subject, database OID and cluster. Run
`deployment/privacy/owner-dashboard-review.sql` with `psql -X -qAt` as the trusted
database owner, passing `account_id` and `character_id` through private psql
variables. Run it in the existing exclusive window with owner-dashboard writes
paused through commit. The output contains only subject/target binding and counts.
Review free text, JSON and orphaned report references privately because zero
matches cannot rule out indirect identifiers. Positive matches or unresolved
personal data require a separately approved disposition before proceeding. This
operation never rewrites or deletes dashboard evidence.

After a clean review, add the result plus `"unstructuredReviewed": true` as
`permit.ownerDashboardReview` in the existing private approval packet and sign
within 15 minutes of the review. Keep the packet private. For an old archive
containing dashboard evidence, perform the same review on the independent
restored target and use a fresh target-bound permit. The startup and promotion
fences verify the signed review in erasure receipts when the dashboard is present.

## Independent journal — one private operator service / dedicated volume

Reuse the already staged **KingdomAccountErasure** service and its dedicated
512 MB volume at `/run/kingdom-erasure`, subject to a later installation approval.
Use the pinned game image with its reviewed private operator and journal relay.
The separate volume preserves suppression evidence across PostgreSQL restores.
Keep the eraser role out of the public game and verification worker. The
recovery-copy retirement service handles copy ownership and removal, and its
temporary workers cannot provide an always-available erasure journal.

1. After separate setup authorization, bind the dedicated volume and exact realm,
   image/source, canonical public Ed25519 key and signed approved policy. Start
   credential-free. A private 0600 packet contains `publicKey`, `policy`, `codeSha`,
   and `journalPath=/run/kingdom-erasure/private/journal`.
2. Run `node deployment/privacy/initialize-journal.mjs /absolute/private/install.json`
   ONCE with `KINGDOM_ERASURE_JOURNAL_INITIALIZE_APPROVED=initialize-private-erasure-journal`,
   `KINGDOM_ERASURE_JOURNAL_PATH` and `KINGDOM_ERASURE_VERIFY_KEY`. It checks the
   dedicated mount, exact source/image/realm and signed policy, creates private
   0700 directories plus a 0600 installation marker with O_EXCL/fsync. It refuses
   database credentials, existing directories, wrong ownership or retries. If the
   provider volume is not writable by the reviewed image's non-root `node` user,
   stop and review the exact
   one-time permission operation separately; never fall back to a different path.
3. Privately configure a cryptographically random read-only bearer credential
   (32–128 base64url characters), `KINGDOM_ERASURE_JOURNAL_READ_TOKEN`, and
   `KINGDOM_ERASURE_SCOPE_DIGEST=SHA256(JSON.stringify(validated policy.scope))`.
   Start `node deployment/privacy/journal-server.mjs`, port 8080/private networking.
   Its only data endpoint is authenticated GET `/v1/journal`; no mutation API,
   database connection or private signing key is used. Marker, canonical signatures,
   complete chain and scope are rechecked; missing/corrupt/outsize journals fail.
4. Game AND independent release worker receive ONLY
   `KINGDOM_ERASURE_RECONCILIATION_REQUIRED=1`,
   `KINGDOM_ERASURE_JOURNAL_URL=http://<private-service>.railway.internal:8080/v1/journal`,
   the same read credential/scope digest and `KINGDOM_ERASURE_VERIFY_KEY`.
   They do not receive the writer's volume, DB role or signing key. Reader requests
   reject public hosts, redirects, credentials in URLs, wrong scope/key/head and
   stale filesystem fallback. A restored copy remains fenced until every signed
   erasure has been replayed and its verified checkpoint is complete.
5. Only after separate credential approval, install the restricted role connection
   in the private operator and an Actions:read-only
   `KINGDOM_ERASURE_COORDINATOR_TOKEN`. It verifies actual workflow approval via
   read-only API. Supply both credentials to the private operator invocation and
   keep them out of the persistent journal relay environment. Keep
   `KINGDOM_ACCOUNT_ERASURE_ENABLED=0` in service configuration. Use a process-local
   `KINGDOM_ACCOUNT_ERASURE_ENABLED=1` only for an individually authorized operation.
6. Approve synthetic operational acceptance: request -> protected window -> private
   signed packet -> erasure -> older isolated restore -> fenced startup -> approved
   reconciliation -> usable restore. Do not erase a real account to test setup.

The authoritative volume is independent of database backups. Signed entries are
append-only with O_EXCL and file/directory fsync before SQL commit. A torn write or
lost acknowledgment is a STOP, never automatic retry/rollback/discard. A durable
intent with rolled-back SQL requires reconciliation and a fresh permit for the
observed head. No automatic destructive backup rewriting occurs. Protect the
journal from provider rollback/deletion; signatures alone cannot detect an owner
rolling back BOTH authoritative journal and database to the same old state.

## Approved retention / exact remaining owner gates

Ordinary fulfillment target: seven days. B necessity review: every 30 days; approved
record disposal within 30 days after final dependency/hold, separately authorized.
D minimal erasure evidence: last relevant backup destruction+30 days. C: about 90-day
GitHub artifacts; no enforced 30-day target; separately managed copies/provider
practices/holds remain protected and not fully accounted for. No backup change here.

Remaining owner decisions are the factual publisher/legal notices, approval for
protected deployment and staged operator installation, private signing-key
custody, and authorization of the synthetic operational exercise. Production
activation and each real account erasure remain separately authorized. Use the
existing A/B/D decisions and document C accurately as conditional. Verify the
public deletion URL and the operational exercise before representing fulfillment
as active in Play Console.
