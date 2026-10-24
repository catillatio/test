# E2b — level-100 expansion, prepared and inactive

Base: `release/production` at `27c64b9d0e5a894cb3e03efd3f423796b8706043` (merged E2a / PR #33). No production service, account, database, token, variable, release workflow or bot provisioning was accessed or changed.

The implementation installs **six regions, 18 quests, 36 shop items, six properties and three quest-exclusive Hudson items**, alongside the existing catalog. It prepares the coordinated 5× army / larger inventory / post-50 XP cutover. Ordinary migration, startup, login and deployment keep the legacy catalog and rules active. There is no activation environment flag, HTTP endpoint or startup grant.

- [Numerical catalog and Approach A/B comparison](CATALOG_AND_BALANCE.md)
- [Activation, preservation and Hudson procedure](ACTIVATION_AND_HUDSON.md)
- [Artwork specifications and unresolved asset requirements](ARTWORK_REQUIREMENTS.md)
- [E3 opponent, capitalization and storage dependencies](E3_DEPENDENCIES.md)
- [Verification and reproduction commands](VERIFICATION.md)

The actual prepared catalog is [catalog.json](catalog.json), mirrored from the immutable [ruleset](../../rulesets/level100-content-1/rules.json). Other versioned definitions are `level100-expansion-1`, `level100-achievements-1`, `level100-artwork-1`, `quest-equipment-rarities-1`, and `hudson-equipment-grant-1`. No historical ruleset JSON was edited.

## Meaningful implementation

**One catalog selection in the existing paths.** State, requirements, regions, purchases, sales, owned equipment, Profiles, saved purchase pages, battle equipment, Land quotes, unlock notices and celebrations use the selected server catalog. Classic IDs, prices, stats, levels, artwork and saved financial rates remain unchanged. Quest-only gear has no shop purchase path. High progressive prices become explicitly unavailable quotes; they are not clamped or shown as zero during polling.

**Coordinated progression.** Compatible transactions take a shared cutover barrier before character locks. The private cutover takes the exclusive barrier, freezes each existing human's current legacy XP transition, initializes epochs and activates the realm in one transaction. Database writer fences abort incompatible writes during/after cutover. Bots retain their legacy progression and 10-participant constraints. New human registrations after a future cutover initialize their epoch in the registration transaction.

**Real equipment discoveries.** A qualifying completion uses the existing quest transaction and command receipt. Each configured item gets a crypto-secure integer draw, with hit, miss or inventory-full outcome saved against the exact quest run. Successful acquisitions create ordinary inventory entries, zero-paid-cost FIFO lots, transaction and provenance records. Rerender/replay never rolls again. No pity, guarantee, boost, extra shop, retroactive drop or currency substitute exists.

**Narrow Hudson entitlement.** The unexecuted private provisioner binds the exact character UUID, observed account mapping, expected names, database/cluster identity and reviewed manifest digest. It grants exactly 15 copies of each item once. Only that UUID and the three exact item IDs can receive zero effective upkeep through the audited grant. Everyone else's copies keep positive global upkeep. Existing liabilities settle first, unrelated equipment remains chargeable, and exempt gear can participate while other maintained equipment is paused.

**Preservation.** Migration `024_level100_expansion.sql` adds empty authorization/acquisition tables, indexes and writer fences, and widens the transaction-kind field/check. It does not backfill epochs, activate content, change balances, create bots or grant items. The release protocol has one literal pin advance to 024; all identity, signature, independent encrypted recovery, preservation, population and approval checks remain intact.

## Results and decisions for review

Finite-resource simulations with the **hypothetical E3 opponent cohort** reach 100 in **22.48–22.81 days** for 8 hours/day and **63.79–65.81 days** for three 30-minute visits/day. Four 30-minute visits take 50.67–51.67 days. With the current 450-cohort model, regular progression takes 105.54 days. These are reproducible synthetic models, not measurements of live accounts or guarantees of future behavior.

The proposed rare probability is **500 ppm (0.05%, 1/2,000) per configured item per eligible completion**. It is unapproved and cannot pass the activation guard. At ten eligible completions/day the mean first copy is 200 days; this is deliberately very rare and merits owner review. At level 100 the final quest offers independent draws for all three items; earlier designated quests offer one specific item. Actual pre-100 eligible trial counts are recorded per item in [progression.json](progression.json).

**Activation blockers:** all 45 new artwork specifications have no approved images; probability review is pending; high-level opponent readiness is unverified and the current authored population does not cover 51–100; E3 capitalization/scheduling, storage and independent-recovery headroom require separate approval. The existing 450-bot exact checks remain strict. No current grant account mapping has been inspected in production.

These blockers prevent gameplay activation. They do not turn dormant definitions into live content. Deployment of even the dormant binary still requires the existing protected release process and separate owner authorization.

## UI evidence

The screenshots use a disposable synthetic cutover **written only by test fixtures**, not the production activator. Missing art is visibly labelled “Art pending”; these labels are not final assets or approved substitutes. No image was generated or adopted.

| Width | Legacy before | Prepared Armory | Prepared Land | Prepared quests | Prepared Profile |
|---|---|---|---|---|---|
| 320 | [before](screenshots/320-legacy-before.png) | [Armory](screenshots/320-armory-prepared.png) | [Land](screenshots/320-land-prepared.png) | [quests](screenshots/320-quests-prepared.png) | [Profile](screenshots/320-profile-prepared.png) |
| 390 | [before](screenshots/390-legacy-before.png) | [Armory](screenshots/390-armory-prepared.png) | [Land](screenshots/390-land-prepared.png) | [quests](screenshots/390-quests-prepared.png) | [Profile](screenshots/390-profile-prepared.png) |
| 430 | [before](screenshots/430-legacy-before.png) | [Armory](screenshots/430-armory-prepared.png) | [Land](screenshots/430-land-prepared.png) | [quests](screenshots/430-quests-prepared.png) | [Profile](screenshots/430-profile-prepared.png) |
| 1024 | [before](screenshots/1024-legacy-before.png) | [Armory](screenshots/1024-armory-prepared.png) | [Land](screenshots/1024-land-prepared.png) | [quests](screenshots/1024-quests-prepared.png) | [Profile](screenshots/1024-profile-prepared.png) |

[Browser evidence](screenshots/verification.json): all four widths, no horizontal overflow or browser exceptions, reduced motion, local-only network and five permanent navigation destinations retained. This is automated Chromium evidence; physical iPhone/Android testing remains a pre-activation check.
