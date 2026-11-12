# Crime RPG — Master Planning Folder

**Status:** Research/planning only. **No implementation, forking of runtime code, deployment, database creation, migrations, or production changes authorized.**

## Vision
Create an independent, original crime/mafia-themed mobile/browser RPG **closely faithful to the gameplay feel of the original Storm8 iMobsters**, leveraging the **stabilized** Kingdom Come codebase as a technical starting point. Modernize original artwork, accessibility, reliability, responsive design, and presentation without sacrificing quick, compact, menu-driven play.

The game is **not** an iMobsters-branded product. Do not reproduce original artwork, logos, copyrighted writing, screens pixel-for-pixel, proprietary code, or trade dress. Names and content must be independently created. Historical formula research should differentiate verified facts from speculation.

## Owner decisions (2026-10-29)
1. **Kingdom Come remains live and independent** with all existing players, data, services, URLs, and deployments intact.
2. **Wait until Kingdom Come is stabilized before beginning the runtime fork.**
3. **First copy the stable codebase into an isolated game**, verify unchanged baseline behavior, **then change formulas/economy**, then implement original crime-themed content and modern artwork; run regression/economy/PvP tests throughout.
4. Intended long-term separation: **distinct GitHub repository, Railway project/services, PostgreSQL database, domains, accounts, secrets, workers, schedules, and deployment pipelines**. A GitHub code fork or copy alone does **not** provision these.
5. Preserve the classic systems: mob recruitment, jobs/energy, attacks/rivals/revenge, hit lists/bounties, weapons/defensive gear/vehicles, property/passive income, upkeep, leveling, social competition, and leaderboards, subject to mechanical research.
6. Mafia economy: replace gold with money/cash; prices, earnings, upkeep, and combat may differ materially from Kingdom Come. **Do not merely multiply all numbers by a constant** and call that a rebalance.
7. **No game changes in this planning stage.** This repository folder is a *reference*, not the future runtime repository.

## Master documents
- [Design north star](GAME_DESIGN.md)
- [Foundation, isolation, and phased migration plan](FORK_AND_ISOLATION.md)
- [Economy and formula research plan](FORMULAS_AND_ECONOMY.md)
- [Research/marketing and decision log](RESEARCH_AND_DECISIONS.md)

## Non-negotiable stop conditions
No copying production credentials or customer data; no reuse of live database URLs, queues, caches, cron schedules, webhook secrets, object storage buckets, or external integrations. A copied Railway deployment must never point at Kingdom Come production. Test against synthetic or separately sanitized data. No live changes without a separate, explicit owner authorization and deployment checklist.

## Next action
After Kingdom Come is stable: audit existing architecture, catalog transferable code and deviations from historical iMobsters mechanics, pin a known-good source commit, and prepare a **read-only, reviewable migration/fork proposal** before provisioning the new game.
