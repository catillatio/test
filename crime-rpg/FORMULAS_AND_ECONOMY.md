# Formula and Economy Research

**Principle:** use the new game's independently verified historical design targets, not Kingdom Come's economy with bigger-looking currency figures.

## Research before implementation
Collect dated historical screenshots, gameplay video, documentation and firsthand reports of iMobsters mechanics. For each formula, cite source, observed inputs/outputs, version/date, confidence, and unresolved alternatives. The original proprietary source and exact formulas are **not assumed available**.

Research specifically:
- Job unlocks, success, rewards, XP and energy costs; regen rates
- Health/stamina and attack limits; loss/recovery and revenge
- Mob size and how equipment is assigned per participating mob member
- Offensive/defensive/vehicle categories and item participation caps
- PvP damage, attack/defense selection, level targeting and payouts
- Properties: base costs, quantity escalation, tick interval and revenue
- Equipment: purchase price, upkeep, acquisition pace, resale and any rarity
- Rank progression, level thresholds and late-game scaling
- Cash on hand, bank/vault mechanics and loss limits, if historically supported

## Ratios to measure
- Property payback time = purchase price / net income per unit time
- Equipment upkeep / passive business income
- Job cash per energy and XP per energy
- Time to afford meaningful next upgrade at each level bracket
- PvP expected loss, win rates and exploit/rival farming constraints
- Wealth disparity under casual vs active sessions

## Process
1. Research sources and separate evidence from inference.
2. Define target curves in a versioned config and design table.
3. Simulate early, mid and endgame with different session habits and mob sizes.
4. Tune with automated tests and economy invariants.
5. Only then finalize item prices, drops and progression.

**Example, illustrative only:** If income rises 100× and prices rise 100×, affordability remains unchanged. To create a different economy, adjust relationships (payback periods, upkeep burden, job yields), not just denomination.

No actual formula changes are approved by this document.
