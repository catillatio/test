# Staged image handoff: exact delta validation

This correction does not resume, commit, discard or deploy the patch left by
[run 40629780333](https://github.com/catillatio/test/actions/runs/40629780333).
That run is called release #77 in the owner incident report; the API records
workflow run number 78. The numeric run ID is the authoritative reference.

## Confirmed evidence and remaining limit

Authenticated read-only Railway checks found the existing successful deployment
online, the applied game source still pointing to GitHub, registry credentials
unapplied, and one non-destructive STAGED patch touching only the game service.
The patch revision was updated at `2026-10-28T04:09:02.032Z`. The controller did
not emit `PATCH_STAGED`; that marker is after staging-response validation and
before any commit mutation. The failed run therefore did not reach its commit
path. No new game deployment exists.

The provider summary contains six changed release variables. It omits
`KINGDOM_AUTOMATED_RELEASES`, which already exists on the applied service. The
old validator demands all seven keys in the patch itself. A synthetic replay
of the six-entry delta reproduces `VARIABLE_DELTA_KEYS`.

**This is not yet the authenticated first rejected assertion.** Credential
checks precede that assertion. The integration redacts credentials and does not
return the raw mutation response. The new protected inspection is needed to
identify the first failure against the currently stored staged representation.
It cannot recreate an unretained original mutation response or prove that the
response and later readback had identical serialization.

The incident definition is
[`image-handoff-40629780333.json`](../../deployment/release/image-handoff-40629780333.json).
It pins the exact patch/revision, original source commit, running deployment,
prepared image digest, image preparation/artifact identity and retained recovery
artifact identity. It contains no credentials, signed proof or database identity.

## Narrow correction

The staged delta may contain only the seven allowlisted release variables.
Every changed entry must have the existing permitted shape and exact intended
value. An omitted entry must exist directly on the authenticated applied game
configuration and have the exact intended value. Missing, null, redacted,
reference-valued, mismatched or unknown entries cannot satisfy that comparison.
Inherited/shared values are not used to fill missing service entries.

The environment-config read explicitly requests `decryptVariables:true`, as the
patch read already does. Values remain private in process memory. No secret,
proof or credential is added to the public target digest or an approval token.
The operational intended values still come from `run.mjs` only after the exact
candidate, retained encrypted artifact, independent recovery and signing checks.

The complete effective set is checked against that intended set both immediately
after staging and in the fresh pre-commit read. All seven applied values are
also checked after the exact committed receipt and immediately before deployment.
The raw server delta is never expanded or rewritten for revision comparison:
the exact raw patch, identity and timestamps remain bound across reads and to
the committed receipt.

Registry username/password comparison remains byte-for-byte. Redacted strings,
opaque objects, changed credentials and extra credential fields still reject.
No assumed decryption/envelope format, masked-value exception or credential
hash is introduced. The seven-key/full-echo policy remains available only for
read-only forensic comparison with the original validator.

Existing empty-staging preflight, owner-exclusive edit window, production mutex,
single skip-deploys commit, exact receipt, unchanged running deployment, single
exact-image deployment, signatures, current-time proof expiry and post-deployment
health/preservation checks remain mandatory. A lost stage, commit or deployment
acknowledgment still stops without retry.

## Protected read-only inspection

The existing **Railway authorization diagnostic** gains a default-OFF
`image_handoff_inspection` input. It remains limited to `release/production`,
the protected production owner approval, exact checkout and production mutex.
Selecting both image inspection modes rejects without querying Railway.

This mode uses only two allowlisted GraphQL queries. It checks the exact incident
revision and healthy running target, verifies the existing signed image/recovery
proof against the protected public key and configured database targets privately,
then compares the original and corrected validators. A second read authenticates
the exact stored record and unchanged applied configuration/target. Changed
revisions, competing edits, missing receipts and lost read acknowledgments yield
UNVERIFIED, with no retry or authorization artifact.

The same reads include the official CLI's `variablesForServiceDeployment` field
to resolve the existing private database references. Those URLs never enter a
workflow environment binding or output. The protected job receives only the
existing Railway token, restricted registry-read token, public verification key
and target service IDs; it needs no database credentials or signing private key.

Output is one `IMAGE_HANDOFF_INSPECTION` report containing only fixed result and
failure categories. It reports credential representation and variable-delta
categories, original/corrected first rejection categories, signed-evidence status
and revision binding. It prints no values, lengths, fragments, IDs, URLs,
timestamps, raw provider bodies or hashes of secrets. No private patch or proof
is uploaded as an artifact.

Forensic verification may validate the existing signature **at the pinned stage
revision** to explain an old failure. If expired now, it reports
`SIGNED_HISTORICAL_ONLY`. This never changes the proof, extends expiry, creates
an approval or makes an expired proof usable by a deployment. Every report has
`authorizesRelease:false`. Operational/runtime verification still uses current
time and is unchanged.

## Shortest safe owner procedure

1. Review this single draft PR and its CI. A merge requires separate explicit
   owner authorization; it does not deploy the game or modify the staged patch.
   The production environment intentionally prevents inspecting new code from an
   unmerged branch. Do not relax that branch restriction to collect the result.
2. After an approved merge and green exact production CI, open Actions →
   **Railway authorization diagnostic** → **Run workflow**. Select branch
   `release/production`, enable **image_handoff_inspection**, and leave
   **image_target_inspection** OFF. Approve the existing production gate.
   Start one new inspection; do not rerun the failed production release.
3. Review the single sanitized report. `VARIABLE_DELTA_KEYS` as the original
   first rejection plus `CORRECTED_MATCH`, `CREDENTIAL_EXACT_MATCH` and
   `EXACT_MATCH` revision establishes the six-change defect for the current
   stored patch. Any earlier credential/shape rejection must be resolved from
   that evidence before promotion; do not treat the delta correction as proof
   that all provider representations are compatible.
4. Leave the existing patch unchanged pending separate disposition approval.
   This PR deliberately adds no commit/resume/discard mode. The normal release
   still refuses nonempty staging. The old image/proof belongs to the original
   source commit; merging this correction does not rebind it to a new commit.
   An expired proof cannot be renewed or replayed as authorization.
5. If the owner chooses a fresh release, separately authorize retirement of only
   this verified unapplied patch, then use the existing exact-current-commit
   image preparation and protected release sequence with fresh required recovery
   evidence. Do not manually click Railway Deploy or reuse stale proofs. A
   metadata-only continuation of the old patch is not implemented or authorized
   here; it would require a separately reviewed procedure preserving every gate.

No new production backup, restore, registry publication, configuration change,
credential reset, registration write, retirement or deployment is part of this
correction or its diagnostic. The staged production patch remains untouched.

## Verification status

Focused coverage includes six/seven-entry deltas, omission of each allowed key,
all-seven effective/applied values, credential redaction and mismatch, competing
edits, raw revision/receipt binding, lost acknowledgments, historical-only proof
inspection, protected workflow scope and hostile-output secrecy.

The first authenticated production inspection remains an owner-run acceptance
step after the reviewed merge. It is not claimed as completed by local fixtures
or CI. If that result requires a code change, run focused tests and one complete
CI on that final corrected head; do not call an earlier CI run evidence for it.
