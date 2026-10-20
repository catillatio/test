# Phase 4.8 shared-stage security and preservation

This is a local code/fixture audit, not a certification of the live Railway deployment.

## Protections exercised

- Marketplace transactions still use the existing server handlers, catalog values, character locks and durable receipts. One-item and bulk controls share pending intent; double taps, lost committed responses, refresh, background/online events and session expiry do not duplicate charges or sales.
- A fresh identity/CSRF read precedes marketplace writes and Settings autosave. Changed-account and expired-session tests send no unauthorized write. Ambiguous sound saves retry the original ID/payload before queuing a newer choice; volume changes serialize. No initial autosave occurs.
- The only registration change is a one-time optional tutorial destination and enabled sound preference for newly registered public human accounts. Argon2id, cookies, session rotation, persistent sessions, logout, authentication throttles, Origin validation and CSRF guards are retained. Existing sound rows and the legacy muted fallback are untouched.
- Tutorial navigation and replay never spend resources or fabricate completion evidence. The browser verifies permanent dismissal, existing progress and actual target highlighting. Locked quest controls and server level/region/equipment restrictions remain authoritative.
- The bot policy only excludes losses from the existing victory allowance. Shared actor/target locks, six-win and one-opponent budgets, rolling cutoffs, pair loot reductions, Vault protection and separate escrow remain. Historical records are not rewritten. No endpoint for grants, bot finance edits or moderation was introduced.
- APK-derived artwork without established redistribution permission is no longer in the public asset tree. Static checks guard against reintroduction. Original replacement provenance and reviewed source records remain.
- Populated-fixture and compiled-process restart tests exercise saved cookies, balances, Vault, inventory, Land, achievements, tutorial, bot identities, rivalry/leaderboard records and offline settlement. No schema migration, seed or live connection is part of the feature.

## Fixed issues

- Bot losses could consume a future win's gold allowance. Only actual rewarded attacking victories now count.
- A tablet breakpoint could shrink Armory trade buttons. The actual 44px minimum is restored, rather than relaxing the test.
- Changed browser modules now have fresh cache revision URLs so existing browsers receive the Land summary and Settings recovery changes.
- The former settings help text incorrectly said the game had no Vault or paid healing. It now describes the existing protected savings and Health interaction accurately.

## Release boundaries / remaining checks

- No production database, Railway configuration, live account or broadcast was accessed or changed. Live credential removal, private-network settings and current realm finances are therefore unverified here.
- GitHub workflows, deployment/recovery controllers, migrations and versioned balance catalogs are unchanged. No release workflow was dispatched and nothing was merged.
- Two unwanted broadcasts still require immutable-ID owner review and a separate explicit reversible moderation approval. Neither startup nor migration performs cleanup.
- New licensed audio is an unserved audition until owner approval. Browser tests validate the existing runtime engine, not a physical judgement of new sound quality.
- Chromium mobile emulation covers layout, accessibility interactions and audio decoding/gesture behavior. Physical iPhone Safari/Android audio, safe areas and OS suspension still require owner device review.
- Use the existing protected release process only after shared-screen/asset review, exact-commit CI and the existing backup/restored-copy/owner-promotion gates. This branch review authorizes no deployment.
