# Account and associated-data deletion

Review candidate, 2026-11-05. **Implemented and tested on synthetic accounts only;
production fulfillment remains disabled.** This is not a compliance certification.

## Request and fulfillment

`GET /account-deletion` is public, linked from Settings and the legal footer.
`POST /account-deletion/requests` requires first-party CSRF, same-origin validation,
explicit confirmation and the existing password authentication. A signed-in caller
must confirm that same account. Existing auth rate limits apply. The request
stores no password, email or new contact detail. Row locking plus a partial unique
index returns one pending receipt on concurrent/lost-response retries. The request
itself leaves sessions, balances, characters and gameplay unchanged.

Migration 028 creates empty append-only erasure receipts/checkpoints, typed JSON
label redaction and stale-writer guards. **It erases no existing account and
installs no approved policy.** See the [owner decision document](privacy/OWNER_DECISIONS.md)
for every proposed retention exception, period and unresolved operational decision.

The private compiled operator entry point is
`deployment/privacy/fulfill.mjs`; there is no HTTP erasure endpoint, public debug
switch, scheduled worker or automatic policy activation. It requires:

- An owner-approved Ed25519 public verification key for this distinct protocol; no private key enters the app,
  database or operator input. Owner signing custody must be separately approved.
- A signed approved policy, signed permanent intent tied to the authenticated
  pending request/account/character, and a fresh signed execution permit (at most
  15 minutes) binding the exact immutable code SHA/candidate digest, database name/OID/cluster, journal head,
  cleared external holds and independently verified encrypted recovery evidence.
  The authorized signer must authenticate that existing retained recovery evidence
  before attesting its hashes and verification time (at most two hours old); the erasure tool neither repeats a backup nor
  independently downloads/verifies an artifact on behalf of that signer.
- A narrowly restricted `kc_account_eraser` connection. The private CLI validates
  actual effective privileges, no superuser/ownership/membership/CREATE/role or
  database creation, no password-hash reads, and no financial write privilege.
  [ROLE_REVIEW.sql](../../deployment/privacy/ROLE_REVIEW.sql) is installation
  material for separate approval, **not executed by migrations or this task**.
- An exclusive approved owner window sharing the protected release mutex
  `kingdom-come-production`; the CLI requires the explicit window attestation.
  The operator must run inside that protected control, not concurrently from an
  uncoordinated shell. Production installation/wiring is a remaining owner gate.
- `KINGDOM_ACCOUNT_ERASURE_ENABLED=1` only after separate authorization, required
  restore guard, private input file owned by the process (0600), exact code/public
  key/journal path bindings. The CLI verifies the packaged immutable-image identity and recomputed candidate bytes; an arbitrary checkout/environment SHA is insufficient. None of these production settings is enabled here.

The transaction takes the existing realm-wide **exclusive** expansion lock; normal
commands/session creation hold its shared counterpart. It waits at most ten seconds
for the lock, bounds each SQL statement at 120 seconds and the PostgreSQL 18
transaction at five minutes. Process interruption closes/rolls back the transaction.
The durable external signed intent, approved policy and original execution proof are written **before** row changes with O_EXCL,
0600 permissions and file/directory fsync. A torn file or unexpected journal entry
blocks further processing; it is never discarded or rewritten automatically.

For supported ordinary accounts, fulfillment removes credentials and linked
personal/social rows, reserves a non-login account tombstone, redacts only typed
identity labels in battle snapshots/results and other players' receipts, and
completes the original request with a minimal append-only receipt including the signed proof for that actual execution. Permanent journal approvals remain verifiable after their execution window expires; freshness is required again for each new execution. It removes army
relationships as deletion of that account's social links; future roster contribution
naturally ceases. It never transfers/refunds gold, changes combat numbers, rewrites
item names or creates rewards. The exact retained game records are disclosed in
the owner decision document; **deactivation alone is not described as erasure**.

Every reviewed table/column is covered by an exact schema contract. Added unknown
fields stop fulfillment before a journal/row write. PostgreSQL hashes every full
row under the expected approved erasure projection; the after-state must match.
Node receives batches of 500 digests, never full battle histories. Other password
hashes are compared through a private SECURITY DEFINER witness and never returned
as password values or logged. Credential helpers qualify the installation schema with a pg_catalog/pg_temp-only definer path; trigger paths pin the trusted schema with pg_temp last. Synthetic hostile temporary-table checks prove they cannot shadow credential verification or erased-identity guards. No credential-derived witness is published. Unrelated battle/receipt rows are not rewritten merely to store identical data. Any
unexpected financial/data change rolls back the entire transaction.

Active escrow, bot/operator identities and immutable identifying administrative
grants stop execution before writing the intent. The permit's external-hold
attestation also requires review of unstructured third-party mentions and provider
records that cannot be proven from structured ownership. Never mark held requests
completed. The tool has no immutable-trigger bypass.

## Interruption and retries

An uncertain acknowledgement is not permission to run an unreviewed second
operation. Read the private journal/receipt state. A durable intent with rolled-back
SQL must be completed under a **fresh permit for the observed journal head**, using
the same operation/request/subject. It cannot authorize a different account or a
second financial action. Completed matching intents return the original outcome;
conflicting operations/identity reuse stop. Local receipts and checkpoints reject
UPDATE, DELETE and TRUNCATE. Explicit logout requests browser storage/cache clearing using Clear-Site-Data. Normal session expiry and reauthentication preserve pending purchase quantities and idempotent recovery state. Erasure revokes server sessions without retaining token hashes merely to identify old browsers. Offline devices cannot be remotely wiped; users should clear app/site data, and support varies by browser/WebView. No personal HTML response is cacheable. Database guards prevent old sessions, notifications,
commands and social paths from recreating erased personal rows or identities.

The external intent represents the approved irreversible erasure decision. If SQL
fails after it is durable, restore/startup guard may block until approved
reconciliation finishes. Do not remove the intent to make a service start.

## Backups and restoration

The journal must be **outside** the game database/PGDATA, durable across worker
replacement, append-only to the controlled writer, read-only to the game/recovery
worker, and independently protected from rollback, deletion and truncation. A
private 0700 directory/fsync is a local durability primitive, **not proof of a
provider's append-only retention or off-box freshness**. Production storage access,
head freshness/rollback protection, availability and separate custody must be
approved and verified before first fulfillment. The repository does not provision
this infrastructure or claim the existing retention bucket is automatically suitable.

Keep `KINGDOM_ERASURE_RECONCILIATION_REQUIRED=1` on game **and** recovery worker after
activation; keep the journal/public key mounted independently of restored snapshots.
Server startup validates every signed entry, exact matching receipt and checkpoint,
and erased credentials/content/typed labels before listening. Missing/unavailable,
corrupt or incompletely reconciled journal state stops startup. A fully replayed
old external journal paired with an old backup cannot be detected from those two
old inputs alone; the independent storage/head-freshness requirement above is
mandatory, not an inferred guarantee from signatures.

The existing encrypted independent restore/migration/full-row preservation check
runs **unchanged first**. The release worker adds a separate erasure reconciliation
fence afterward; existing source erasures also require the guard to remain enabled.
No unreconciled restored copy can produce the successful retained recovery report.
Original encrypted backups remain immutable; none is rewritten/deleted for erasure.

For an older isolated restore, authenticate its exact database/OID/cluster and
original evidence, then replay each existing signed intent with a fresh
`mode: restore` permit. No new intent is invented. If both account and character
are absent, append `absent_in_restore` without fabricating account/request rows.
If one identity mismatches, escrow is active, or an immutable personal hold exists,
stop promotion. Multiple entries may be reconciled in order; the head checkpoint
and startup fence succeed only after **all** journal entries have receipts.
Run the read-only fence before any restored realm is made accessible.

## Synthetic evidence and remaining activation gate

`tests/play-erasure.test.ts` uses disposable PostgreSQL, actual Fastify requests,
Ed25519 fixture keys, a real custom-format pg_dump/pg_restore and a separately
created recovered database. It covers erased credentials/social content/typed
labels; preserved other-player wallets, Vault, ledger, inventory and Land; unchanged
combat rewards/item names; idempotence, forged/expired/stale-target permissions,
unknown schema, active escrow, interruption, concurrent sessions, immutable
receipts, restore blocking/replay and a column-restricted non-owner role.
The original archive hash must remain unchanged. No production data was imported.

Production policy approval, protected signer/operator/storage installation and a
separately authorized isolated operational acceptance remain required. Existing
historical/emergency recovery protections and cleanup infrastructure are unchanged.
A working request form and synthetic erasure tests alone are not Play readiness.

## Private approval packet preparation (after policy approval only)

`deployment/privacy/approve.mjs` reuses the existing Ed25519 `signProof` primitive
to prepare the policy/intent/permit packet without generating a key, contacting a
provider or executing SQL. The owner's reviewed private input contains `policy`,
`intent`, `permit`, `journalPath`, matching the versioned contracts in
`src/privacy/authorization.ts`; policy/intent digest bindings are derived by the
helper. Supply the owner-approved existing private PEM **only in the private
signing context**, never the game/recovery/operator service. Both input/PEM files
are owner-only 0600 files; output is O_EXCL, 0600, fsynced in a 0700 directory.
It refuses overwrite, invalid policy, expired proof or malformed bindings.

The bounded future commands, after separate approval/installation, are:

```sh
# Owner-controlled private signing context only; paths are private inputs, not chat.
KINGDOM_ERASURE_POLICY_APPROVED=1 node deployment/privacy/approve.mjs \
  /private/reviewed-erasure.json /private/approved-signing.pem /private/erasure-packet.json
# Restricted private operator inside the approved exclusive production window.
node deployment/privacy/fulfill.mjs /run/kingdom-erasure/erasure-packet.json
```

These are **not current execution instructions or authorization**. Exact target,
code/candidate hashes, current journal head, authenticated request and recovery
evidence must be privately supplied and independently checked first. Output
contains subject IDs and signatures and must never become a public Actions artifact.
The signer emits only a fixed success/failure line. The operator never receives
the private PEM. Do not run either command on real accounts under PR #88 approval.
