# Owner-controlled Phase 6 launch sequence

Preparation only. No commands below were executed against production. Do not
rerun population provisioning, level-100 activation or artwork adoption. The
already-live 900 identities, XP epochs, 5× capacity and approved art remain.

1. Review the coordinated draft PR and exact-head normal CI, including actual
   encrypted recovery and 450/900 identity/preservation evidence. Separately
   authorize merge, then the existing protected exact-candidate production
   release. Keep all owner approvals, signatures, retained ciphertext,
   independent restore, migration and post-deployment checks. Schema head must
   be **026_living_competition.sql**; stale 025 and unexpected 027 are rejected.
2. After an authorized release, verify ordinary personal PvP, exact-contract
   cross-level hunts, private report access, accurate finishing records,
   leaderboards and badge acknowledgements. Army allies may hunt. Invitation
   spacing and the daily quota are removed; same-person, roster and authorization
   checks remain. These normal UI changes need no admin toggle.
3. Separately authorize a trusted private game-service Console inspection. Use
   the existing scoped Railway authorization/private database checks. Never use
   public SQL, new endpoints, altered startup commands or release-worker reuse.
   No credentials, full plans, DB identities or signed proof values belong in
   chat/GitHub. Inspect files are exclusive 0600; retain securely across sessions.

```sh
ALLOW_EXPANSION_OPERATOR=1 node dist/expansion-console.js inspect-economy /tmp/phase6-economy.json
ALLOW_EXPANSION_OPERATOR=1 node dist/expansion-console.js inspect-autonomy /tmp/phase6-autonomy.json
```

Review installed manifest `level100-rivals-1` and exact digests, 450 original +
450 added, active cohort, current paused state, financial aggregates, recent
errors, actual storage/WAL/headroom and successful current recovery. Do not
change the immutable capital or policies. A fresh autonomy plan defaults to
`purchases-only`, `policiesReviewed=false`, `combatReviewed=false`. Approve only
`purchases-only` with `policiesReviewed=true`; leave combat review false. Privately
review the complete edited plan and compute its existing canonical digest:

```sh
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {definitionDigest} from "./dist/expansion-content.js"; console.log(definitionDigest(JSON.parse(readFileSync(process.argv[1], "utf8"))));' /tmp/phase6-autonomy.json
```

Only after explicit owner approval of **that exact plan/digest**, execute with
the digest supplied privately as `APPROVED_EXPANSION_PLAN_SHA256`:

```sh
ALLOW_EXPANSION_OPERATOR=1 node dist/expansion-console.js set-autonomy /tmp/phase6-autonomy.json
```

No bot combat is authorized. Enabling combat now requires both an immediately
preceding purchases-only state and separate `combatReviewed=true`; an old retry
never reverses a newer pause. Do not change any live environment flags here.

## Observe and pause

Proposed operator observation thresholds, **not new economic rules or automatic
flags**: observe at 1h/6h/24h/72h, then daily. Monitor only the added cohort;
original bots continue existing behavior. Use a fresh `inspect-economy` file each
time and ordinary service/volume metrics; observation never settles or credits.

- Immediate pause/review: any funding mismatch, unexpected new-cohort duel,
  negative accounting/integrity failure, identity drift, or repeated settlement/
  purchase exceptions. Stop for investigation; never inject gold to clear it.
- Pause/review: >5% upkeep-paused cohort at two consecutive hourly observations;
  >25% creation/upkeep divergence from the matching model over a full 24h;
  unavailable current recovery; >80% volume utilization or <7 days projected
  free-space runway. These are conservative proposed trial stop criteria, not
  production observations. Compare saved counters only at equivalent settlement
  windows; they do not include unsettled offline accrual.
- Review gear/Land split and stalled tier counts at 24h/72h/7d. The 169 modeled
  stalls are a known policy limitation, not an accounting violation. Do not
  increase allowance or capital without a separate approved immutable policy.

To pause, inspect a fresh autonomy plan, set `mode=paused` and the reviewed flag,
review its canonical digest and authorize `set-autonomy` on that same file.
Pausing decisions does **not** stop existing hourly Land/upkeep settlement.
No bot deletion, account reset, retained-copy deletion or forced liquidation.

## Separate rarity authorization

Only with fresh current verified signed release/recovery evidence and explicit
rate/equipment approval:

```sh
ALLOW_EXPANSION_OPERATOR=1 node dist/expansion-console.js inspect-rarity /tmp/phase6-rarity.json
```

Review the exact DB/schema/target, pending `quest-equipment-rarities-1` digest,
500 ppm, original expansion presence, prior event, current recovery reference and
expiry. Default `enabled=false`, `rateReviewed=false`, `equipmentReviewed=false`
cannot enable. For an explicitly approved enable, set all three true and approve
its canonical digest; then, separately authorized:

```sh
ALLOW_EXPANSION_OPERATOR=1 node dist/expansion-console.js set-rarity /tmp/phase6-rarity.json
```

The CLI revalidates the existing signed proof and exact reference. No proof is
created, renewed or extended. It appends a new authorization; it never rewrites
expansion activation or the immutable pending proposal. To pause, create a new
reviewed plan with `enabled=false` and both review flags true, under the same
proof requirements. Installed policies remain adopted after original proof
expiry; expiry prevents new operations, not ongoing approved draws.

## Separate Hudson grant

```sh
ALLOW_EXPANSION_OPERATOR=1 node dist/expansion-console.js inspect-hudson /tmp/phase6-hudson.json
```

Privately verify UUID **55742e75-70c9-4792-8136-fe6ead2b83e0**, actual account
mapping/name, non-bot/login status, existing inventory/grant evidence and exact
immutable manifest. This is 15 each `king-hudsons-sword`, `king-hudsons-shield`,
`king-hudsons-meteor-shower`; zero-cost acquisition and exact item-specific
upkeep entitlement, not a blanket character exemption. The inspection now binds
current verified recovery. A partial/conflicting prior source fails closed.
After distinct owner approval of that exact file/digest, and only then:

```sh
ALLOW_EXPANSION_OPERATOR=1 node dist/expansion-console.js grant-hudson /tmp/phase6-hudson.json
```

Verify the single immutable grant, three acquisition lots of 15, three exact
entitlements, normal unrelated upkeep and unchanged balances/progress/other
accounts. Do not grant gear merely to test a production installation.

## Expiry, failure and forward recovery

Plans expire within one server hour (rarity also bounded by proof expiry).
Rarity/Hudson writes require the exact current signed recovery reference. If it
expires, stop: obtain separately owner-approved fresh evidence through the
existing protected process, regenerate the relevant inspection and reapprove
its exact digest. Do not forge, extend or reuse a different proof. No protected
workflow was dispatched here.

After uncertain acknowledgement, retry the **identical securely retained** plan
and digest under the CLI's still-valid proof requirements. Committed operations
return replay receipts; transaction rollback leaves no partial state. If the
plan/proof is missing or changed, perform separately approved read-only evidence
inspection before deciding recovery; do not create another grant blindly.

026 is additive. Prefer forward correction on the installed schema; do not drop
new event/read tables, decrement counters, rewrite histories, undo real purchases
or roll back earned rare items. Any application rollback candidate must still
accept schema026 and the current expansion writer. Disaster recovery uses only
the existing owner-approved exact encrypted restore procedure and reconciles
subsequent legitimate activity. This PR does not alter backups, signing,
retention, infrastructure, permissions or keys.
