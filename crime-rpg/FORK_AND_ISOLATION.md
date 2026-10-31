# Fork, Isolation & Development Sequence

## Stage 0 — Gate
Do not begin the code fork until the owner explicitly confirms Kingdom Come is stable enough to serve as a baseline. Record the exact commit SHA and inventory architecture, critical workflows, scheduled workers and secrets. Check retention/storage or operator-sensitive work separately; never transplant any ongoing maintenance operations into the new title.

## Stage 1 — Copy without behavior changes
Create a new independent repository derived from the approved stable Kingdom Come snapshot. Build a separately named app and deploy only when infrastructure separation has been reviewed. Initial copied app must operate on synthetic fixtures and a **fresh independent database**; no real Kingdom Come accounts or history.

### Isolation checklist
- Separate repository and branch protections
- Separate Railway project, environment, services and deployment credentials
- Separate Postgres instance/database and dedicated least-privilege roles
- Separate caches, queues, job schedulers, buckets and backup/retention policy
- Separate domains, authentication signing keys, third-party integrations, monitoring and billing/payment keys
- Explicit safeguards against production Kingdom Come URLs and destructive command execution
- Confirm no CI/CD automation from this planning folder deploys anything

## Stage 2 — Baseline verification
Show identical behavior of core Kingdom Come systems using reproducible synthetic test data: registration/login, stats, quests, combat, purchases, income, upkeep, recruitment, hit-list actions and leaderboards. Record expected outputs as tests.

## Stage 3 — Mechanics and economic retuning
Create an externalized/configurable balance specification and separately test job rewards, energy/stamina, cash inflow/outflow, passive income and property price escalation, combat, mob contributions, equipment/upkeep, XP and level caps. Preserve a transition ledger from old constants/formulas to new ones. Do not modify the Kingdom Come live game in this stage.

## Stage 4 — Original retheme
Implement independently named crime jobs, properties, gear, scenery, icons, illustration sets and copy. Keep classic compact UI arrangement and quick feedback. Replace fantasy-specific concepts that do not map mechanically; do not force mismatched mechanics merely to preserve source schemas.

## Stage 5 — QA, release preparation, launch
Run multi-level economy simulations, small-population PvP tests, anti-abuse/security reviews, account recovery, mobile/browser compatibility, accessibility tests and private testing. Launch with independent app-store listing/branding and separate operational monitoring.

## Rollback
Roll back the new game using its own releases and backups; never use Kingdom Come production as a test environment or rollback target.
