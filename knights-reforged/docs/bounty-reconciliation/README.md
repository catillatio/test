# Historical bounty quotas and contract finishing

Owner review, October 27, 2026. One focused draft; no merge, release, production SQL or production settings changes.

Pinned `release/production` baseline: **`7802b0ab1c606f35402d5ab15f91408127968c19`**, the merge of PR #54. The branch preserves its cross-level sponsorship, ordinary-PvP range separation, XP correction and artwork changes. Branch: `fix/historical-bounty-quotas`.

## Implemented

* Each sponsor can place **25 bounties on the same target** in a rolling 24 hours.
* Each target can receive **250 placements across all sponsors** in that window.
* Both independent limits count each durable `bounties` row once, across active, claimed, canceled and expired states. The window is `(server time − 86,400 seconds, server time]`. Exact-cutoff rows release their slot; there is no calendar-day reset or extra relisting cooldown.
* Current quotes, profile actions, placement/review, board, placement result and help use the same quota status. Remaining counts are snapshots, not reservations. Exhausted buckets expose the first time enough old placements leave the window, including when a legitimate old count already exceeds the new cap. Confirmation always rechecks.
* An active contract still blocks another listing. Existing unique-active-target constraint, escrow-before-character-lock order, command receipts and financial ledger remain authoritative.
* Every new saved attack records the exact `bountyContractId` present before its combat resolution, including ordinary in-range attacks that can legitimately finish a bounty. Claims require that contract ID, the same command and action timestamp, positive pre-hit Health, zero post-hit Health and positive Stamina cost. A previous hit cannot be reassigned to a later same-timestamp listing.

The existing financial `pvp-economy-0.1` ruleset stays frozen. The separately identified `historical-bounty-1` placement policy is code used by current eligibility; its ID is included with quota snapshots. It is not an XP policy or a new financial ruleset. Historical rows retain their original IDs, rulesets and results.

Distinct failures identify `BOUNTY_SPONSOR_TARGET_LIMIT` (25), `BOUNTY_TARGET_LIMIT` (250), or `BOUNTY_EXISTS`. The latter takes precedence while a listing is active. Every rejected command rolls back its receipt and any incidental transactional changes; a successful replay returns its saved receipt without incrementing a quota or charging again.

## Historical evidence and precise scope

The existing [historical audit](../historical-reconciliation/README.md) and [XP safeguards](../historical-reconciliation/XP_REPORT.md) were reviewed rather than repeated. Reference PR [#44](https://github.com/catillatio/test/pull/44), pinned reference head `5e246718dd6410d410701ab1a5ad02f5bf97f771`, contains `historical/knights-reforged/bounty-addendum/HISTORICAL_BOUNTY_AND_SKILLS.md`. The current owner request explicitly confirms the per-target interpretation of 250, superseding the addendum's earlier request for corroboration.

| Behavior | Evidence / baseline | Result here |
|---|---|---|
| 25 sponsor-target and 250 target placements | Addendum §§2,8 and current explicit owner authorization | Both implemented independently |
| Claims/cancellations/expiry do not reset placement history | Addendum §2; existing durable placement schema | Count all settlement statuses, never event totals |
| One active listing per target | Historical testimony; existing partial unique index | Preserved |
| Losing attacks damage the victim; the finisher claims even on defeat | Addendum §8; `resolveAlphaCombat`, existing Phase 6 tests | Preserved and tested through consecutive contracts |
| Victim stays depleted; immediate relisting | Addendum §§2,8; existing engine | Preserved, including placement at zero Health |
| Literal zero-Health attack and another claim before recovery | Testimony confirms observed rapid sequence; original stored HP floor is explicitly unknown | [One narrowly scoped policy decision](ZERO_HEALTH_POLICY.md); no invented claim trigger installed |
| Cross-level sponsorship and exact-contract hunting | PR #54 and prior Phase 6 implementation | Preserved; ordinary PvP remains range-limited |
| Claim-based Kills/Deaths, separate ordinary outcome | Existing records, constraints and triggers | Preserved; no historical outcome rewrite |

The earlier audit verified all 86 supplied reference-image entries and recorded the later edited addendum's original-manifest mismatch. This task uses that pinned evidence and the owner's new explicit instruction; it does not repair the reference collection. Eight later screenshots remain outside the supplied collection. Neither screenshots nor testimony recover an original internal zero-HP representation, damage algorithm or database transaction.

## Why there is no database migration

Reviewed migrations `010_strategy_and_bounties`, `012_refinements`, `013_pvp_economy`, `019_champions_and_rivalries`, `026_living_competition`, current `bounties`, `combat`, `commands`, resource regeneration, financial ledger, profile, feed and notification code.

`bounties` already stores the placement's unique identity, sponsor, target, immutable creation time and lifecycle state. `bounty_events` has a unique `(bounty_id,kind)` but older rows need not have a `placed` event. Joining events would either omit that trustworthy history or count lifecycle events repeatedly. The placement row is the authoritative fact; no redundant counter/backfill is introduced. Existing `(target_id,created_at)` and sponsor history indexes support these bounded rolling reads. The partial unique index still forbids two active rows even outside the application.

The new contract binding is an additive field in newly saved battle JSON. Old battles/receipts are not upgraded or retroactively claimed. Existing `bounty_kills` uniqueness on contract and battle, append-only competitive deaths and finishing-evidence guards remain untouched. No new table, enum, constraint, migration, migration checksum, data reset or catalog record is needed.

Review of saved-data semantics is source/schema/fixture review only. Production SQL and production account sampling were neither requested nor performed. A sponsor may already have more than 25 legitimate placements from the former policy; those records remain and temporarily deny further placements until enough age out. Their balances, past rewards and cooldown clocks are not changed.

## Financial and security assessment

The authenticated server still checks account availability, level 3/five quests, self/army-ally placement restrictions, bot feature flags, amount and real unbanked affordability. Vault funds are not implicitly spent. A contract debits its principal plus the existing 10% rounded-up/minimum-1 fee, inserts one active row and one placement event in the command transaction. Rejected or conflicting requests charge nothing. Cancellation after one hour and expiry after 24 hours return principal once; fees stay retained. Overflow credit still uses retained gold. A claim pays only real escrow, once, to the eligible finisher.

The existing global transaction-scoped escrow lock covers expiry, attacks, placement, cancellation and claims before sorted character locks. It serializes competing sponsors at placement 249 as well as same-pair requests at 24. The clock is read after obtaining the lock. Quotes need no reservation; final commands never trust client counts. Accepted account allies can hunt, while sponsors and targets cannot claim their own contracts. Stale explicit hunts fail and never fall back to ordinary matchmaking.

Positive-Health fights keep existing damage, minimum attacker Health, 1 Stamina, XP and ordinary human/bot gold policies. Losses still award no attacker XP or ordinary loot and do not advance victory sequences. Successful defender XP remains bounded and never refills the victim. Zero-Health attacks still reject without cost, payout, XP, victory sequence or K/D changes. Repeated low-Health finishing after genuine recovery is tested; no free heal or finishing damage is fabricated.

The higher target cap intentionally permits more sponsor-funded transfers; the new pair cap constrains one sponsor/target. Coordinated account ownership cannot be detected perfectly. Quotas do not claim to solve multi-account abuse. No unapproved XP curve, SP migration, specialization, property economy, bot population, retention automation, recovery registration or deployment identity changes are included.

Rolling mixed versions can disagree: old workers may permit >25 per pair or reject after 50 target placements. Their shared financial locks/unique constraints still protect money, but they do not enforce the new policy uniformly. An owner-approved release must retire old application workers coherently. This draft does not deploy or alter an approval workflow.

## Tests and browser evidence

New tests are explicitly registered in the existing CI manifest; no lane, assertion or timeout is weakened.

* `bounty-policy.test.ts`: six pure tests for independent limits, frozen financial rules, exact boundaries including PostgreSQL microsecond history, over-cap historical counts and no invented cooldown.
* `historical-bounties.test.ts`: nine real PostgreSQL tests covering 25/26 and 250/251, missing old placed events, all settlement statuses, simultaneous sponsors, same-sponsor races, rolling milliseconds, escrow/retries, losing finishes, health/relisting, repeated genuine low-Health hits, XP/gold/K/D, exact-contract claims, replay and attack-versus-placement races, and shared UI/API semantics.
* Existing `bounties.test.ts` still performs fifty real claims with natural recovery; each of two sponsors exhausts its own 25 slots. The analogous bot financial regression retains fifty real claims and existing bot reward assertions. Their former 50-total expectations are replaced by the explicitly authorized independent limits.
* New browser suite uses real Fastify/EJS, localhost and disposable PostgreSQL. Seven screens × five viewport/text configurations = **35 views per stage**: 320,390,430,1280px and 390px with 125% text; DPR 1/2/3. It checks quotes/fees, remaining slots, denied placement and exact release time, exact-contract forms, result presentation, five navigation tabs, script errors, overflow and unchanged wallet/contract/ledger/battle/event/receipt facts.

Before uses a separate unmodified checkout at the pinned baseline. After uses this implementation. Synthetic accounts and synthetic legacy history are labeled fixtures, never production telemetry. Representative [screenshots](screenshots/) and stage verification JSON are included. Full captures remain in the delivery package.

Review follow-up: historical PostgreSQL timestamps can retain microseconds that the driver would truncate when returning Date objects. Rolling reads now preserve numeric epoch precision, and advertised release times round up to the next command millisecond. Pure and real PostgreSQL regressions verify a placement half a millisecond inside the cutoff still counts. The follow-up passes 15/15 policy/database tests.

Local results: 32/32 existing bounty/combat/PR #54 tests; 24/24 targeted historical/XP/gold/bot regression tests; 6/6 new policy unit tests; 35/35 browser views before and after; typecheck/build and static **99/99, 77 production EJS fixtures**. Full exact-commit CI counts/status are recorded on the draft PR and in the delivery evidence, rather than asserting a future run here.

Initial local failures were fixture errors: the new test named a nonexistent victory-sequence table, corrected to the existing `pvp_loot_sequences`; the new browser selected the header's `time` instead of the quota's `time`, corrected to its scope and actual earliest placement timestamp. No runtime safeguard or expected gameplay result was relaxed.

## Review boundary

Implemented and authorized: 25/250 accounting, consistent quota UX, fresh exact-contract finishing evidence and regression coverage. Already-correct positive/low-Health behavior remains installed. Literal zero-Health claim semantics are the **only gameplay policy decision deferred by this task's explicit fallback**, with a concrete proposal and acceptance cases in [ZERO_HEALTH_POLICY.md](ZERO_HEALTH_POLICY.md).

No merge, deployment, production SQL/settings, migration execution, balance rewrite, historical reward, live bot provisioning or retention operation occurred. Review this focused draft; separately approve the zero-Health rule before coding/activating that semantic exception.
