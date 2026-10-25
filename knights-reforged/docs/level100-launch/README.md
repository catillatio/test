# Level-100 launch preparation — inactive, owner review required

Base: merged PR #34, `36367d340a561e575e4af7e098d3c2cdedf5579f`.
This work completes the new-only population/operations wiring and launch studies;
it does **not** authorize launch. Artwork is [frozen and unapproved](ART_FREEZE.md).
The owner will supply original equipment art; no more generation, recoloring,
reframing or recycling. The [comparison gallery](ART_DIRECTION_REVIEW.md) is
historical evidence. Non-artwork engineering continues independently.
No Railway, live database, protected workflow, production grant or deployment was used.

## Implemented and still inactive

- Reuses E2b's six regions, 18 quests, 36 shop items, six Land properties, three
  quest-exclusive Hudson definitions, coordinated 5× army/XP epochs and exact grant.
  Classic catalog definitions, prices, combat rewards and artwork are unchanged.
- Prepares full-bleed versioned images and consistent shared rendering. The three
  Hudson images use the exact owner-selected randomized-name PNGs. Other new images
  remain **frozen, rejected drafts**, not accepted final art. No rejected charcoal study is
  a game asset. [Provenance and hashes](art/PROVENANCE.md).
- Adds an immutable manifest of **450 new identities**, never regenerating the
  existing 450. Real declared capital funds saved equipment, FIFO lots, Land,
  wallet and existing upkeep reserve. All new accounts have disabled logins.
- Separates registration, publication with human cutover, and autonomy approval.
  Registration leaves the cohort unpublished. Publication leaves autonomy paused.
  Later exact plans permit purchases-only, enabled, or paused operation. Existing
  original-bot behavior, receipt keys and scheduling lanes remain intact.
- Adds empty migration `025_level100_population.sql`, immutable provenance and
  an old-writer fence. Updates the strict release pin to **025**, and admits 900
  only with exact manifest/identity evidence and matching independent restore.
  Release controller, workflows, signatures, encrypted recovery and approvals are unchanged.
- Ships a guarded **private, manual** compiled Console command, not an endpoint,
  startup seed or new Railway service. Population writes additionally require the
  existing current signed recovery approval. No production action has been run.

## Numerical decisions, not approvals

The selected **candidate** cohort costs **3,701,553,498 Gold-equivalent** rather
than E1's approximately 10.18B. It comprises 24,013,536 wallet, 9,071,344 prepaid
upkeep, 2,317,207,570 paid equipment and 1,351,261,048 Land. Initial property net
before equipment is 15,072,095/hour; equipment upkeep is 9,071,344/hour. This is
substantial new capital and recurring income, not an approved free refill.
[Alternatives and exact totals](capitalization.json).

There are eight new bots at every level 51–100 and 50 mid-level additions.
Green/seasoned/elite variants use actual saved member counts, legal skill budgets,
different equipment coverage and level lag. They receive no quest-exclusive gear.
The original 450 keep their current identities, inventories, finances and legacy
10-participant bot behavior. Humans retain current rules until the separate cutover.

| Paced scenario | Days to 100, three deterministic seeds | Combat wins / losses, seed 1001 |
| --- | --- | --- |
| 8 hours/day, four visits | 22.42–22.50 | 3,317 / 3,864 |
| 90 minutes/day, three visits | 59.80–60.81 | 1,635 / 1,535 |
| 2 hours/day, four visits | 45.50–45.84 | 1,728 / 1,479 |

Half availability takes 61.33 days; half invitation acceptance 63.35; one 30-minute
visit/day takes 178.80. More visits confer a material recovery advantage. These
use finite opponents, real resource costs/recovery, actual gold transfers, ordinary
level-up refills, healing costs, progressive purchases and unchanged **65% bot XP**.
They are strategy-specific models, not guarantees or measurements of live accounts.
The earlier 1.0-strength candidate was too fast (17.59/51.79 days intensive/regular);
the 1.5 candidate is proposed, not silently activated. [Full outputs](progression.json),
[capital/pace comparison](capital-progression-comparison.json),
[combat/equipment matrix](combat-equipment.json). The roll grid is not a win-probability estimate.
Levels 200/500 are numerical stress tests using level-100 gear, not authored content.

### Autonomous development and inflation

New-cohort-only proposed rules retain 5% purse spending, two-hour surplus budget,
90% purse retention, four-hour upkeep liquidity and one purchase per decision.
They allow up to the highest unlocked shop price (maximum 50,000), a 70% upkeep
ceiling, gear no more than 20 levels behind and useful Land gains of 0.5–2%.
The original cohort keeps its 5,000/35% rules. All new rules remain separately gated.

| Financial isolation | Equipment / Land purchases | Gold spent | Estimated Land journal rows |
| --- | --- | --- | --- |
| 7 days, quiet | 668 / 3,692 | 23,796,907 | 1,086,766 |
| 30 days, quiet | 4,605 / 12,914 | 127,836,543 | 8,493,608 |
| 30 days, 50 raiding accounts, two day-long outages | 4,195 / 12,286 | 118,597,848 | 7,660,776 |

The quiet 30-day case creates 12.369B through existing Land, consumes 6.597B in
upkeep, and leaves 5.677B aggregate liquid/prepaid currency. The external-raiding
case transfers 16,766,547 gold to attackers, rather than creating it. Conservation
passes, but **conservation does not mean low inflation**. Quiet 30-day equipment
does not improve for 169 bots; some are already supplied or cannot afford a useful
upgrade. High-priced Land can still exceed the conservative shared price ceiling.

These financial runs fix bot levels and omit bot-versus-bot duels to isolate money
flows. Actual SQL duels/retries are tested separately. Four daily visits by mature
level-100 attackers produce all wins in this particular stress scenario; the paced
model above includes losses. Three-worker invocation figures are projections;
concurrency/idempotency is verified against PostgreSQL, not inferred from them.
See [scope and distributions](autonomy.json) and [policy comparison](autonomy-policy-comparison.json).
The quality filters reduce low-tier filler, but **increase journal growth**; they
do not solve the storage problem. No further policy tuning is included in this checkpoint.

### Rare gear and Hudson

Keep the E2b recommendation **500 ppm (0.05%) per listed item per eligible quest**:
mean 2,000 eligible completions; median 1,386. At ten eligible completions/day,
one item has a 25.9% chance by day 60 and 36.2% by day 90. Minimum character level
is 71; the first designated quest unlocks at 74. This satisfies above-70 access,
but does not promise an obtainable drop on the level-70 birthday. The last quest
offers three independent item draws. No pity, paid purchase, resale windfall or
retroactive roll. [Probability evidence](rarity.json). Probability approval is pending.

Hudson's exact UUID `55742e75-70c9-4792-8136-fe6ead2b83e0` is bound to a separately
observed account/name/database plan before any grant. The existing provisioner
grants **15/15/15 once**, with zero-cost lots and an audited three-item-specific
upkeep entitlement. Other players pay normal upkeep (7,650/hour for 15 of each),
and Hudson's unrelated items remain chargeable. No live account was inspected or granted gear.

## Verification and remaining launch blockers

- [Completed non-artwork engineering checkpoint](ENGINEERING_READINESS.md)
- [Actual paginated opponent availability at every level 1–100](matchmaking.json):
  minimum 27 eligible bots, 20 rows/page, all eligible bots reachable without duplicates.
- [Preservation, capacity limits and recovery](PRESERVATION_AND_STORAGE.md)
- [Future owner-only sequence and retry behavior](OPERATIONS.md)
- [Native independent PostgreSQL restore evidence](independent-restore.json)
- [Browser verification](screenshots/verification.json): 320/390/430/1024,
  309 full-bleed aspect checks, no overflow/errors, five tabs retained.
- [320](screenshots/320-armory-weapon.png), [390](screenshots/390-armory-weapon.png),
  [430](screenshots/430-armory-weapon.png), [1024](screenshots/1024-armory-weapon.png)
  prepared Armory; [Land](screenshots/390-land.png), [quests](screenshots/390-quests.png),
  [Hudson Profile](screenshots/390-hudson-profile.png), [battle equipment](screenshots/390-battle-art.png).
  These are synthetic future-catalog previews, **not an approved visual direction**.

Before launch: integrate separately owner-supplied approved artwork and final rights/
framing; review 3.702B capitalization and new bot policies; approve rarity separately;
verify current production/recovery storage headroom and physical devices; separately
authorize protected deployment, private population append, coordinated cutover,
autonomy stages and Hudson grant. The art guard currently rejects **all 45** entries.
No live activation is possible merely by merging or installing this branch.

Reproduction (development only): `npx tsx scripts/level100-cohort-manifest.ts --check`,
`npx tsx scripts/level100-launch-models.ts --check`,
`npx tsx scripts/level100-autonomy.ts --check`,
`python scripts/package-level100-art.py --previews-only`,
`python scripts/level100-style-gallery.py`. Local restore/browser scripts require
explicit disposable localhost `_test` databases. Final normal exact-head CI is
recorded on the draft PR; no protected release is dispatched.
