# KINGDOM COME — MASTER PROJECT CONTEXT

**Snapshot:** October 26, 2026  
**Purpose:** Portable, human-readable context for ChatGPT, Work, Codex, and future collaborators.  
**Repository:** https://github.com/catillatio/test  
**App directory:** `knights-reforged/`  
**Protected release branch:** `release/production`  
**Maintenance rule:** This is a snapshot, not a substitute for the live repository, current production measurements, signed proofs, or owner decisions. Verify changing facts before acting.

## 1. Project identity and design philosophy

Kingdom Come is an independently reconstructed, multiplayer medieval browser RPG inspired by the original Storm8 *Kingdoms Live* experience. The codebase still uses `knights-reforged` naming for historical compatibility. The owner prioritizes the classic feel: short sessions, dense functional screens, meaningful PvP, repeatable quests, equipment-based progression, army recruitment, and Land-generated income. The gameplay is a reconstruction; do **not** claim original Storm8 server formulas were recovered.

**Non-negotiable design preferences:**
- Maintain **five familiar tabs**: Home, Quests, Battle, Armory, Recruit; preserve navigation and established terminology unless explicitly approved.
- Favor compact rows, readable small item icons, dark fantasy visuals and recognizable classic layout; avoid gratuitous modern cards, oversized headers, wasted space, feature creep, and unexplained mechanics.
- Existing artwork is full bleed, without artificial black gutters or letterboxing. Preserve silhouettes and identities.
- Do not alter the actual game merely to make visual changes that look nearly identical. The experimental warm-bronze/charcoal UI-polish mockups at commit `b494730` were **rejected for integration**. The separate name/image placement proposal in those mockups is not approved by that fact.
- Protect existing accounts, inventory, finances, bot identities, history, item IDs, numerical slots, and historical receipts. Use new immutable/versioned definitions when changing policies.
- Keep production deployments and destructive operations under explicit owner control; Codex may prepare draft PRs but should **not merge, deploy, or modify production** without authorization.
- Prefer one coherent PR/deployment over many tiny rounds; use targeted tests during iteration and final required protected CI at the exact final candidate. Be concise and precise with operational commands.

## 2. System architecture and operations

- **GitHub:** `catillatio/test`; server application under `knights-reforged/`. Check `release/production` and the current protected workflow for latest state; historical README sections may be outdated.
- **Railway project:** `merry-patience`. Production game service named `test`; primary PostgreSQL is separate from the independent recovery-copy service `KingdomReleaseCopy`.
- **Backend:** server-rendered app with server-authoritative gameplay and PostgreSQL. Database schema migrations and immutable rulesets; strict schema 026 is referenced in October 2026 Phase 6/retention material.
- **Protected releases:** signed exact-candidate review, owner-gated promotion, encrypted backup, private independent PostgreSQL restoration and preservation verification. The release-copy cluster is not the main game database. Do not bypass required checks or reseed/reset the live realm.
- **Secrets:** never paste database URLs, release or encryption keys, signed plans, private authentication data, or raw sensitive manifests into chats, public logs, or repository artifacts. Use restricted private channels for precise operational evidence.
- **Android:** prospective Google Play release and tester recruitment exist as future work, but are **not currently requested priorities**.

## 3. Gameplay baseline and significant decisions

### Progression, equipment, quests, bots
- Level-100 expansion and 99-slot equipment **presentation** progression, filling gaps while preserving underlying item numerical identities/values. Regional dark-fantasy equipment art and Land illustrations have been a major investment.
- A 900-bot realm: 450 existing bots plus 450 added. The extra 450 cohort has **purchases-only autonomy activated** via private, time-limited operator process; autonomous combat for the added cohort remains **disabled**. Existing 450 bot behavior is unchanged. At one modeled checkpoint, 169 of the added cohort were financially constrained for gear purchases; do not quietly mint funds or change economics to resolve this.
- Quest-exclusive rare drops were explicitly approved and activated at **500 parts per million = 0.05% per eligible completion**; no pity or guaranteed drop. One item per successful rare event; quest requirements apply. Rare-drop mapping in `rulesets/quest-equipment-rarities-1/rules.json`:

| Quest ID | Possible King Hudson legendary equipment |
|---|---|
| `storm-the-river-fortress` | Sword |
| `settle-the-war-of-crowns` | Shield |
| `breach-the-imperial-walls` | Meteor Shower |
| `defend-the-hundred-kingdoms` | Sword, Shield, or Meteor Shower (one possible rare reward) |

- Hudson's specific grant was executed successfully through the private operator: **15 swords, 15 shields, 15 Meteor Showers** for the explicitly bound Hudson character, with the narrowly specified acquisition/upkeep exemptions; do not rerun a completed grant or broaden exemptions to other players. Three owner-approved Hudson images were integrated into PR #43.
- Four other artwork replacements **still not supplied/implemented** at the last check: Royal Garrison Plate (fortress-inspired), Mountain Warden's Zweihander (distinct from Highland Claymore), Eclipse Gatehammer (white/gold), Eclipse Aegis (white/gold). Do not fabricate approved source assets; owner explicitly deferred this task.

### PvP, bounties, leaderboards
- Ordinary eligible **human PvP victory gold theft** is **3% of exposed/unvaulted defender gold with no fixed 15,000 cap** under new immutable `human-pvp-loot-1` policy (PR #43). Preserve existing rounding, pair-repeat reduction schedule **100/75/50/25/10**, vault shielding, bot-specific anti-farming ceilings, bounty escrow distinction, conserved transfers and overflow/retained-treasury accounting. Large totals require safe integer math.
- **Kills:** successful bounty claims *made* by the character. **Deaths:** successful bounty claims *against* the character. They are **not** ordinary battles won/lost and should include authoritative historical completed bounty claims without inventing missing ones. K/D, public/self profiles, per-rival stats and leaderboard counts must agree. PR #43 corrected this.
- Cross-level bounty hunting is permitted, including level-100 hunter vs level-5 target, subject to real bounty contract/authorization; ordinary PvP level rules remain separate.
- Bounty claimant, historical result, notifications, and PvP safeguards are server-authoritative. Existing successful claims must not pay twice on retries or races. Prior Phase 6 added rivalry history and seven human leaderboard categories.
- Recruitment invitation quota, 30-second spacing and ally restrictions were adjusted in earlier PRs; owner marked invitation restrictions **done**. Verify deployed code before proposing further modifications; an earlier note indicated same-person 24h reinvitation constraint might remain.

### Approved UI
- PR #42 implements compact classic Profile layout for both self and public player pages: two-column **Stats** (left Kills, Deaths, Quests; right Battles Won, Battles Lost, Initiated for), three-line **Income** (Total Income, Upkeep, Net Income), then Weapons/Armor/Spells. Competitive Record, claim-credit clutter and Army Participating explanatory panel removed from Profile; rivalry history belongs under Battle.
- Preserve layout and established calculations; no new cosmetic UI overhaul. The owner visually approved the new Profile arrangement.

## 4. Snapshot of relevant pull requests (verified October 26, 2026)

| PR | Status at verification | Material scope |
|---|---|---|
| [#42](https://github.com/catillatio/test/pull/42) | **Merged** | Classic Stats → Income → Equipment profile arrangement. Head `4ea4de4...` |
| [#43](https://github.com/catillatio/test/pull/43) | **Merged** | Uncapped human 3% PvP loot, corrected bounty-claim Kills/Deaths, Hudson's three approved images. Head `36e9a86...` |
| [#25](https://github.com/catillatio/test/pull/25) | **Open draft, mergeable** | Recovery-copy inventory, protected retention automation, safe audit/coordination; head `4ec0ae6...`. Inactive; not deployed/installed. |

**Important distinction:** Merge status is not proof of Railway deployment. Recheck release runs and live service candidate before asserting any newly merged PR's features are live. PRs #42 and #43 were initially described as drafts in earlier conversation, but their statuses were rechecked and found **merged** on October 26. PR #25 remains in draft.

## 5. PR #25 — verified recovery-copy retention: detailed handoff

**Goal:** Prevent accumulation of one permanent PostgreSQL restore database after each independent encrypted recovery check, **without ever sacrificing required recovery safety**. The owner wants approvals for deletion, not blind unattended disposal. GitHub protected workflow owner review plus a separate signed, exact-copy authorization are design requirements. ChatGPT may help review, but is **not** currently the deletion approval channel.

### Developed, tested but inactive
- Read-only inventory and optional successful-restore provenance observation/registration.
- Eligibility planner fail-closed for uncertain/unknown data, missing verified evidence, connected or active/pending/rollback copies, pinned copies, current commitments, and unclosed releases.
- **Unconditional emergency-OID protection: `106971` and `129180`.** The two newest verified copies and at least 24h since first observation remain protected; never bypass safeguards for a desired space target.
- Exact-copy OID and identity checks, separate role boundaries, signed short-lived exact-run/attempt/job/batch plans, owner-gated protected workflow template, same maintenance-DB lock coordinated with release workflow, immutable audit, interruption reconciliation, pin/unpin race checks.
- Workflow template intentionally remains outside `.github/workflows`, optional registration remains OFF, retirement and scheduling remain OFF. No standing delete authority and no automatic approval. No PostgreSQL catalog or cleanup role was installed in production.
- PR #25 exact-head CI reported **10/10** passing; code and readiness docs at the PR, notably:
  - [Readiness](https://github.com/catillatio/test/blob/4ec0ae6/knights-reforged/docs/retention/READINESS.md)
  - [Owner inventory follow-up](https://github.com/catillatio/test/blob/4ec0ae6/knights-reforged/docs/retention/OWNER_INVENTORY_FOLLOWUP.md)
- **Do not treat a test dry run as production deletion authorization.** Native PostgreSQL database ownership carries residual powers outside application wrappers; review restricted execution risk prior to production install.

### Owner-observed read-only Railway evidence (October 26, 2026)
- `KingdomReleaseCopy` contains **27 databases total**, including **23 recovery-test copies**, aggregate logical recovery database sizes **approximately 6.3 GB**; sizes about **8–495 MB**. At inspection, all 23 displayed owner `postgres` and zero connections. None is established eligible for deletion: **all 23 are protected**.
- Emergency OID `106971` ~235 MB; `129180` ~304 MB. They are included in the 6.3 GB aggregate, not additional usage.
- Existing connected maintenance database rendered **`Railway`**, with PostgreSQL **18.6**, current user `postgres`. IMPORTANT: still independently compare with the recovery worker's exact configured maintenance DB component/cluster; a matching screenshot alone is insufficient.
- `release_retention` and `release_observations` schema/table lookups were NULL/absent, and five expected retention role names were absent in the connected database/cluster. Consistent with clean target, not yet proof of the correct worker connection.
- `pg_ls_waldir()` summed ~**960 MB** WAL; data directory `/var/lib/postgresql/18/docker`.
- Filesystem `/dev/zd28000` mounted at `/var/lib/postgresql`, approx **18 GiB total / 7.1 GiB used / 11 GiB available / 41% used** during shell inspection. PGDATA and `pg_wal` were on this same mount; **do not add duplicated filesystem or WAL totals**.
- Separate Railway observation on Oct 25 ~8:51 PM ET: recovery-copy volume **6.759 GB of advertised 20 GB**; primary PostgreSQL **1.878 GB of 20 GB**; all four services online, no active capacity alerts. Figures differ in units/timestamps/accounting and are not a contradiction to resolve by inventing extra bytes. Logical copy size != reclaimable bytes; current volume headroom is not a substitute for verified recovery integrity.
- Recovery-copy memory appeared to spike near 5–6 GB, but cgroup measurements showed **~4.96 GiB file cache and ~88 MB anonymous memory**. This is consistent with normal reclaimable filesystem cache, not proof of a PostgreSQL process memory leak. Do not clear caches or restart without a new reason.
- Past disk-full incident requires successful protected independent restore verification before the **recovery-integrity hold** can be considered cleared. No current capacity-only hold required at last Railway observation.

### What remains before installing or enabling anything
1. Privately validate the recovery worker uses the exact maintenance database `Railway` and match cluster digest/evidence (without sharing credentials or full URL).
2. Match each recovery copy's **exact OID/name/cluster** against retained GitHub release jobs, attempts, backup manifests, signed encrypted restoration/recovery evidence, worker deployment, and current/pending/rollback references. Legacy uncertain identity remains protected. Do not infer from name, OID ordering or lack of connections.
3. Review existing recovery-integrity status and verify source/current restore protection and headroom for next recovery.
4. Obtain **separate owner approval** to merge/deploy non-destructive helper code, then separately review fresh metadata catalog installation (`bootstrap.sql`, `observations.sql`) only in the confirmed private worker maintenance DB. Fresh install must stop if partial schemas or roles appear. No blanket rerun on partial failure.
5. Later review role isolation, exact OID adoption (never emergency/unknown/active), private runner setup, opt-in observation, private dry run, narrowly signed per-batch deletions and audit. **No database DROP, automatic scheduling, bulk adoption, credential changes or public proxies without separate authorization.**

**Operational note:** The exact private query and setup instructions are in `docs/retention/OWNER_INVENTORY_FOLLOWUP.md`; prefer that file over paraphrased chat instructions when executing. Do not paste raw full connection strings into a chat.

## 6. Art and presentation state

- Hudson's approved 512×512 WebP assets (Sword, Shield, Meteor Shower) were committed through PR #43. Entitlements and gameplay quantities unchanged.
- The four deferred replacement sources for Royal Garrison Plate, Mountain Warden's Zweihander, Eclipse Gatehammer and Eclipse Aegis remained missing in PR #43. Owner **does not want to work on them now**.
- Separate name/image rearrangement mockups appeared in the rejected UI preview; they **did not** change deployed catalogs. Do not mix that candidate into unrelated work.
- The owner's immediate preference is productive infrastructure/gameplay maintenance, not another superficial visual pass and not app-store-readiness work.

## 7. Operating with Codex, Chat and Work

**Chat:** interactive design decisions, PR interpretation, screenshots, safe Railway troubleshooting, exact approved owner commands, high-level strategy. **Codex:** implement/test/review PRs. **Work:** optional for substantial multi-system investigations (GitHub, Railway, files), not a necessary migration. Existing project context may be selective in new sessions; start with this document plus up-to-date GitHub and Railway references.

**Default Codex instructions:**
- Read this context, inspect current protected branch and open PRs, establish exact baseline before making changes.
- Confirm owner intent and avoid unnecessary design inventions. Do not propose four outstanding art replacements or Google Play readiness unless the owner reopens those topics.
- Maintain immutable history and economic conservation; treat backward compatibility, security and real encrypted recovery as first-class requirements.
- Prefer one focused draft PR, narrow tests during iteration, then full required exact-head CI; summarize head commit, findings, checks, remaining blockers. No merge/deploy or production modifications without approval.
- For private operators, separate **inspection**, **reviewed short-lived plan**, **approval digest**, **execution**, **live verification**. A plan creation `PASS` is not proof of activation; do not bypass expiry/identity/lock/proof safeguards.
- When tools lack private Railway Console access, say what owner-observed evidence is available and request *only the minimum necessary read-only steps*; do not guess state or repurpose a production release worker.

## 8. Known open questions and verification checklist

- Has the protected Railway release deployed the merge of PRs #42 and #43? Verify on the actual service; merger alone is insufficient.
- Does the release verification worker's exact maintenance database and cluster match owner-inspected `Railway`? Reconcile privately.
- Can historical manifests/proofs establish complete OID-level provenance for any of the 23 retained copies? Until then no cleanup eligibility.
- Has a successful protected independent restore verified the previous disk-full incident is resolved? Verify proof, not only available space.
- Future owner choice: install optional non-destructive copy-registration catalogs and subsequently design an explicitly owner-approved cleanup workflow. PR #25 remains draft.
- Artwork replacements (four) and Android release/testing are consciously deferred.

## 9. Suggested update method

Maintain this file whenever a meaningful milestone changes. At each revision:
1. Verify PR status, release branch, and live deployment separately.
2. Mark actions as **proposed / coded / merged / deployed / activated / verified in production** rather than treating them as synonyms.
3. Record the source commit/PR, factual date, approval scope and unresolved risks.
4. Keep sensitive identifiers and access data in restricted operator records, not in the portable summary.
5. Preserve superseded decisions as historical footnotes when relevant; do not overwrite the meaning of older proofs or rulesets.

---

**Primary evidence sources:** the linked GitHub PRs and rulesets, Phase 6 documentation, PR #25 readiness files, and owner-observed Railway console screenshots/results from October 2026. Where direct production evidence is missing, this document says so explicitly.
