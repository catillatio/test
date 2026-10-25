# Future owner sequence — not authorization to execute

Nothing in this PR runs automatically. The owner permits lightweight functional
beta placeholders, not production activation or final-art approval. Financial,
rarity and current storage/access review remain separate. No action was run here.
See [the temporary beta policy](beta-art/README.md).

## Gates, in order

1. Review the five temporary icons, the exact `level100-beta-artwork-1` registry
   and `temporary-beta-artwork-1` policy. Final illustrations are not required.
   Approve the exact 450-new-identity manifest, 3.702B capital and proposed new-only
   policies separately. Approve rarity separately or keep rare drops off. Retain
   immutable versions and all archived art; do not label temporary pictures final.
2. Obtain fresh storage/recovery inventory and adequate growth/restore headroom.
   Rehearse physical iPhone Safari and Android Chrome as well as automated widths.
   Separately approve merge after exact-head normal CI and then follow the
   existing owner-approved **protected production release** on release/production.
   Its encryption, independent recovery, artifact download, signed exact candidate,
   pre-deploy migration, health, saved-realm and login checks remain mandatory.
   Deploying this compatible binary alone keeps human rules and population unchanged.
3. Separately authorize the exact private population append. Use the existing
   authenticated game-service private Console, never the release worker, public
   API, external public DB connection or startup command. No new service, token,
   key, environment flag rollout or relaxed permission is required by this PR.
   The Console must already satisfy the established production/private-alpha
   metadata and private `DATABASE_URL` checks. Do not print those values.
4. Create a fresh population plan, privately review its exact database name/OID/
   cluster, original identity digest, candidate manifest and capital, and fill only
   the explicitly reviewed financial/storage and recovery fields. Retain the
   private plan and compute its **canonical** `definitionDigest`, not a raw-file
   SHA with different whitespace. The production command also verifies the
   existing current signed exact-candidate release proof and requires its artifact
   ID/ciphertext hash to match this plan. It does not create or sign a proof.
5. Execute the reviewed append once. It creates only the exact 450 new accounts
   and saved business rows, all unpublished and autonomy paused. Audit evidence
   binds the original identities, manifest, capital and plan digest. A fresh
   independently verified **900-account-cohort backup/restore rehearsal** must
   pass before cutover. Use the unchanged protected release's `promote=false`
   option; retain and independently verify recovery as usual. This is a future
   owner action, not something dispatched by this development work.
6. Inspect a fresh cutover plan after that rehearsal. Approve exact current human
   level/XP snapshot, policy/catalog/art/population digests, actual eligible
   opponent bands, storage/recovery review and bot policy review. Set `rareDrops`
   only if its immutable probability definition has separately been approved.
   The plan must pin `artworkRegistryId=level100-beta-artwork-1` and its exact
   digest, and explicitly set `temporaryBetaArtworkReviewed=true` after owner
   review; its default is false. This is temporary-beta approval, not final art.
   The transaction freezes attained human transitions, installs epochs, publishes
   the exact cohort and enables 5× capacity/content/post-50 XP together. No
   legitimate recruited member or earned level is manufactured/recomputed.
   Changed human progress, expired plan, missing beta review or failed image integrity aborts without partial writes.
7. Verify the new catalog, real equipment/army participation, finite gold/XP
   reports and old sessions/records. Authorize a separate **purchases-only**
   autonomy plan first. Observe wallet/upkeep/arrears, useful purchases, pressure,
   latency, WAL and storage. Only after a reviewed observation window authorize
   `enabled` for new-cohort bot-versus-bot combat. Human attacks are never initiated
   by bots. `paused` is available through another exact plan, without deleting data.
8. Hudson's grant is **not part of beta authorization**. Only if separately
   authorized later, inspect Hudson's exact UUID/account/name and approve the 15/15/15
   manifest, then run the existing exact grant once. Verify three zero-cost
   acquisitions and three upkeep entitlements; ordinary players and unrelated
   gear retain upkeep. No username matching or copied-name exemption exists.
9. Retain a fresh encrypted recovery of the activated state and verify post-launch
   preservation/health. Record exact runs/artifact IDs, plans and receipts privately.

## Existing private command surface

The compiled command ships through the existing game Docker `dist` copy; no
startup/pre-deploy override or new deployment is needed to make it available.
These are examples **for a later separately approved trusted Console session**:

```sh
ALLOW_EXPANSION_OPERATOR=1 node dist/expansion-console.js inspect-population /tmp/population-plan.json
ALLOW_EXPANSION_OPERATOR=1 node dist/expansion-console.js inspect-expansion /tmp/cutover-plan.json
ALLOW_EXPANSION_OPERATOR=1 node dist/expansion-console.js inspect-autonomy /tmp/autonomy-plan.json
ALLOW_EXPANSION_OPERATOR=1 node dist/expansion-console.js inspect-hudson /tmp/hudson-plan.json
```

Each file is created exclusively with mode 0600 outside `public/`; existing files,
unexpected operations, missing authorization, worker use or public connections
fail closed. Inspect/review plans privately. **Do not upload them to a public PR.**
They contain database identity and target identity, but no credentials or signed URLs.
For the chosen file, canonical hashing can use the existing compiled utility:

```sh
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {definitionDigest} from "./dist/expansion-content.js"; console.log(definitionDigest(JSON.parse(readFileSync(process.argv[1], "utf8"))));' /tmp/population-plan.json
```

After explicit review, use the corresponding write mode `provision-population`,
`activate-expansion`, `set-autonomy` or `grant-hudson`, the **same private file**,
`ALLOW_EXPANSION_OPERATOR=1` and `APPROVED_EXPANSION_PLAN_SHA256` equal to that
reviewed canonical digest. Never print proof/key/connection values. Plans expire
after one server-derived hour. The existing deployment proof also expires (the
controller currently issues one hour); population execution must be inside both
windows. If either expires, stop and obtain fresh protected evidence/approval via
the established process; do not forge, extend or bypass it.

## Interrupted operation / retries

All writes are transactional. An interruption before commit leaves no partial
population/grant/cutover. After an uncertain acknowledgement, reconnect to the
same trusted Console and retry the **identical retained plan/digest**: committed
evidence returns an idempotent receipt, never recredits wallets or grants gear
twice. Population retries still require the CLI's current signed recovery proof.
Preserve private plans securely across sessions; they are not recoverable from
ephemeral `/tmp` after a service restart unless retained by the owner.

Do not generate a new write plan merely because acknowledgement was lost. If the
original plan/proof is unavailable or expired, inspect existing immutable evidence
through a separately authorized read-only session and stop for owner recovery
review. Conflicting identity, capital, partial grant, duplicate name, changed
target or another approval fails closed. Retrying an old autonomy `enabled` plan
after a later pause returns its receipt and **does not re-enable** anything.

Use a short owner-coordinated write-drain window for population/cutover: the
exclusive transaction serializes with gameplay, so a slow large append can cause
temporary request delay. No automatic maintenance toggle or infrastructure
mutation is added. After data activation use compatible forward recovery; see
[preservation and storage limits](PRESERVATION_AND_STORAGE.md).
