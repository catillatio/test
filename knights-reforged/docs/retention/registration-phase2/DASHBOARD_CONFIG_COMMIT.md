# Protected dashboard-only registrar configuration commit

Development candidate. This change authorizes no Railway operation. Registration
remains OFF; activation and a fresh recovery rehearsal are separate owner decisions.
Reuse the installed catalogs, validated roles and three existing staged variables.
Do not reinstall catalogs or inventory/adopt/delete historical recovery copies.

## Configuration commit #60: apparently applied; do not repeat it

[Run #60 / 40431411556](https://github.com/catillatio/test/actions/runs/40431411556)
at `4951605b6ffe5e7b600aed609c12a16f99d22967` stopped at `PATCH_NOT_CLEARED` after
the single mutation, configuration-workflow completion and worker postcheck. The
release job was skipped. Independent read-only Railway integration checks confirm:

- Normalized staged patch is null, with no resource/shared-variable changes.
- All three registrar variable names exist in applied worker configuration.
- The latest worker is still the original SUCCESS deployment, with `updatedAt`
  `2026-10-26T04:49:06.680Z`; no newer worker deployment exists.

The owner independently reports the same applied state. Treat this as an
apparently completed configuration commit. **Do not re-run #60, repeat commit
mode, restage variables or reset credentials.** A new staged-patch inspection is
not needed to recreate pins for a configuration that is already applied.

The verifier previously unconditionally required a UUID for `pending.id`, even
after successfully validating the original committed receipt. That rejects an
explicit cleared `null` and empty placeholders with opaque/non-UUID IDs. The
correction accepts explicit null only **after every original receipt check passes**;
missing/undefined data still fails. A non-null empty placeholder must retain the
correct environment, STAGED/null-applied/error state, timestamps and strictly empty
known containers. Its GraphQL ID is an opaque string, not a stored-patch UUID
contract. The same committed-record response still requires exact receipt equality.
Non-empty/unknown pending data and every invalid receipt remain rejected.

**Evidence limit:** connected Railway tools expose normalized staging and applied
variable names, but no historical `environmentPatch(id)` receipt or private values.
#60's fixed category does not identify which inner receipt/staging assertion failed.
The captured patch ID is retained privately from its inputs; the exact receipt
cannot be independently confirmed through these tools. The null/placeholder defect
is reproduced synthetically; do not claim the live receipt was fully verified or
weaken receipt/payload checks based only on applied-variable names.

### Shortest first-registration path — requires separate owner authorization

1. Keep registration disabled until the owner explicitly authorizes enablement
   and a fresh protected recovery rehearsal. No repeated catalog installation,
   credential update, historical-copy adoption or configuration commit is needed.
2. After that approval, the **existing official Railway integration** supports
   setting only `KINGDOM_COPY_REGISTRATION_ENABLED=1` on the exact existing worker,
   with `skipDeploys:true`, `staged:false`, and explicit project/environment/service
   IDs. This is a proposed future single-variable write, **not executed here**.
   Check staging is empty and the old deployment is unchanged before/after. Do
   not click ordinary Deploy or use the disabled-only registrar commit mode.
   No local CLI, API client or new infrastructure is required.
3. Run the existing protected GitHub release workflow on the reviewed, green exact
   production candidate: operation **release**, promotion **OFF**, through owner
   production approval. It creates a fresh request and uploads a fresh worker;
   never restart the old worker. `prepare` does not automatically commit arbitrary
   staged registrar settings, so enablement must actually be applied without a
   deploy before this separately approved run. No game promotion occurs.
4. Require normal independent encrypted recovery/export/restore/preservation
   success **and** `COPY_REGISTRATION: PASS`; a green recovery run alone does not
   certify optional registration. Use the retained manifest and existing
   [first-observation read-only verification](VERIFY_FIRST_OBSERVATION.sql) to
   require exactly one matching job observation and preservation of every baseline
   copy/OID, including **106971 / 129180**. Retirement/adoption/scheduling stay OFF.

If the exact historical receipt is required for owner audit before enablement,
obtain that receipt read-only through an existing authorized Railway history/API
channel using #60's original patch ID. Do not invent a new execution channel or
repeat a write to obtain evidence. This postcheck fix does not require deployment
or a repeat mutation to establish the independently observed applied state.

## Decision: approve a server revision, not a secret-value fingerprint

[Inspection #57 / run 40425915246](https://github.com/catillatio/test/actions/runs/40425915246)
at `f98e92cfe2ec2937a55e3a05662ecac181d2593c` confirmed exact equality between the
non-decrypted and decrypted strings for all three approved variables. Safety
passed, registrar inspection failed, release was skipped, and no configuration
commit occurred. Earlier storage-envelope documentation did not establish this
GraphQL API's behavior. All patch contents must be treated as sensitive.

The replacement uses **registrar-server-revision-v1**. It requests one explicit
`patch(decryptVariables:true)` snapshot over authenticated HTTPS and validates its
contents privately. No encrypted-storage envelope is assumed or required.

The approval token is a SHA-256 fingerprint of an explicit **non-secret metadata
allowlist only**:

- Policy version and exact reviewed GitHub source commit.
- Project/environment and the game, worker and recovery-service identities.
- Server-issued patch ID, environment, exact creation/update timestamps and STAGED status.
- The validated stopped worker's explicitly selected deployment/history/instance metadata.
- The three fixed variable names and optional/sealed metadata flags.
- The fixed required state: registration disabled.

**No variable value, registrar password/URL, scope JSON, cluster fingerprint or
arbitrary provider object enters the token.** It is not a ciphertext digest,
plaintext credential hash, signature, bearer credential or commitment to secret
bytes. Anyone knowing its non-secret metadata could recompute it; authorization
comes from the existing protected production owner gate and trusted workflow.
Old ciphertext-digest inputs/pins are rejected. The new dashboard input is
`registrar_approval_token`; a fresh successful inspection is required.

## Adequacy and threat boundary

This is adequate **only for the existing trusted-owner, exclusive-edit procedure**,
where the owner approves installing the current, privately validated three-variable
configuration on one exact server revision. It is not adequate for adversarial or
uncoordinated concurrent Railway writers, or for claiming cryptographic continuity
of secret bytes between independent workflow runs.

The owner must freeze **all** environment patch writers before inspection and keep
them frozen until commit/postchecks finish: dashboard collaborators, API/CLI users,
automation and other release processes. The GitHub production mutex serializes
this workflow's operations, but cannot lock Railway's dashboard or external API.
The commit checkbox explicitly acknowledges metadata-only binding and that freeze.

What is checked mechanically:

1. Inspection and commit each require the exact project/environment/worker, stopped
   deployment identity, exited instance, deployment timestamps/history and no queued
   replacement. Patch identity, STAGED/null-applied/error state, timestamps and exact
   one-worker/three-variable scope are checked on every read.
2. Values are privately checked: flag exactly `0`; private PostgreSQL URL with user
   exactly `kc_copy_registrar`, nonempty password and maintenance database exactly
   `Railway`; scope with exactly eight fields. Its six target/name fields must match
   the selected project/environment/services/database, and the two cluster digests
   must be valid distinct digests. No credentials or role permissions are modified.
3. Commit requires the inspected patch ID/token on the same source commit, owner
   production approval, exclusive-window acknowledgement and run attempt 1.
4. A fresh read immediately before the single mutation revalidates every condition,
   matches the approval metadata, and compares the **complete sensitive patch** with
   the commit run's first snapshot in memory. Nothing sensitive is hashed, persisted,
   uploaded, summarized or passed back in the mutation request.
5. Only `environmentPatchCommitStaged(..., skipDeploys:true)` is called, once.
   The job reads its status and the original patch receipt by ID, requires unchanged
   private payload/creation identity, valid committed/applied state, cleared staging
   and an unchanged stopped worker. All comparisons remain in memory.

### Residual races and limitations — explicit, not bypassed

- Railway's mutation accepts only environment ID, commit message and `skipDeploys`.
  It has **no expected patch ID/revision parameter**. The API supplies no atomic
  compare-and-swap for this operation. No unsupported ETag/header is invented.
- The token identifies exact returned timestamps; it does not prove that every
  content edit advances `updatedAt`, or that timestamps uniquely version contents.
  If values change under identical ID/timestamps **between runs**, the token alone
  cannot detect it. This limitation is explicitly exercised by tests. The owner
  freeze and fresh private validation are required; no stronger claim is made.
- Values changing between the two reads **within the commit run** are rejected,
  even if metadata does not advance. Invalid flag/URL/scope always fail privately.
- An external edit **after the last read and before the mutation** can still race
  the write. Postchecks may detect it only after configuration has been committed.
  They cannot undo it. Tests assert detection with one write and no automatic retry
  or rollback. A later edit after postchecks is likewise outside this action's lock.
- After a runner restart, lost acknowledgement or uncertain write, the in-memory
  snapshot is gone. The action must stop. It never automatically resumes/repeats a
  write; a new inspection and separate owner authorization are necessary.

**If the exclusive window cannot be guaranteed, HOLD this procedure.** Do not turn
it into an automatic metadata-only fallback. A different dashboard-only route
would need a separately reviewed protected GitHub action using a provider operation
that applies an explicit three-variable service snapshot with skip-deploy support,
plus a safe owner procedure for the still-pending patch. The current staged-commit
API cannot supply an adversarial-race guarantee, and this PR implements no such
alternative or unreviewed write. Ordinary Railway Deploy is not a substitute.

## Short owner procedure after separately approved merge and exact-head checks

1. Freeze all Railway environment patch writers before inspection. Leave the three
   existing worker variables staged, including `KINGDOM_COPY_REGISTRATION_ENABLED=0`.
   Do not recreate variables or start the old worker.
2. GitHub → Actions → **Owner approved Railway release** → Run workflow on
   `release/production`: **registrar-config-inspect**, promotion OFF, blank patch ID
   and approval token. Approve its existing protected **production** gate. Require
   `REGISTRAR_CONFIG_INSPECTION: PASS`. Review the summary's policy/limitations;
   copy its **Patch ID** and **Approval token**. These contain no values or secret
   hashes. If the freeze is interrupted or source/patch changes, stop and reinspect.
3. Only after separate owner authorization to commit this disabled configuration,
   dispatch the same workflow at the same reviewed source: **registrar-config-commit**,
   promotion OFF, exact Patch ID and **registrar_approval_token**. Check the exclusive
   window acknowledgement only if the uninterrupted freeze and metadata-only binding
   are acceptable. Approve the production gate. No release/recovery job starts.
4. Require `REGISTRAR_CONFIG_COMMIT: PASS`. In Railway's dashboard verify no pending
   changes and no new/restarted worker deployment. The stopped deployment remains
   `ccd3f1b1-c1ba-4f47-9613-352c0b972304` with its original instance/timestamps.
   Registration remains OFF. End the freeze only after successful postchecks.
5. Registration activation and a fresh protected recovery rehearsal require their
   own authorization and procedure; neither is launched by this action.

No local CLI, API client, extra software, new secret or permission is required.
The action reuses the existing protected `RAILWAY_TOKEN`. There is no database
connection, public endpoint, backup, signing, source upload or deployment here.
All 23 historical copies and emergency OIDs **106971 / 129180** remain protected;
retention adoption, ownership, retirement and scheduling are untouched.

## Any failure or lost acknowledgement

Do not retry a commit, click Deploy, run recovery or change credentials. Inspect
patch metadata and the old deployment read-only. If already cleared/committed,
never attempt to commit it again. Preserve the exclusive window while determining
state. A new dispatch needs fresh inspection/review; **Re-run jobs** cannot write
because commit requires `GITHUB_RUN_ATTEMPT=1`. The action has no automatic undo.
Only fixed failure categories leave the process; provider bodies/errors, patch
values, exception details and temporary diagnostic probes are never printed.

## API contract and verification evidence

Pinned official Railway CLI v5.70.0 sources:

- [Staged commit with skipDeploys](https://github.com/railwayapp/cli/blob/5ba0b00c62d7fd5cdade53f0c3869ed4ba1de2e1/src/gql/mutations/strings/EnvironmentPatchCommitStaged.graphql)
- [Schema: patch timestamps and mutation arguments](https://github.com/railwayapp/cli/blob/5ba0b00c62d7fd5cdade53f0c3869ed4ba1de2e1/src/gql/schema.json)
- [Project-token authentication](https://github.com/railwayapp/cli/blob/5ba0b00c62d7fd5cdade53f0c3869ed4ba1de2e1/src/client.rs)

Focused tests cover actual plaintext-shaped API data; metadata token exclusion of
password/URL/scope; ID/revision/source/worker/flag binding; exact scope and private
URL checks; within-run value drift; post-write race detection; owner window/run
context checks; no retry after lost acknowledgement; cleared receipts; secret-safe
success/failure output; and unchanged workflow/recovery separation. Earlier
unsupported-envelope and temporary diagnostic tests are replaced with these
functional tests. Final exact-head CI is linked in the draft PR. No protected
production workflow is dispatched during development/testing.
