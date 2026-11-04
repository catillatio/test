# Kingdom Come

The multiplayer game is maintained in **`catillatio/test`**, with default/release
branch **`release/production`**. Application source is in `knights-reforged/`.

Start with [AGENTS.md](AGENTS.md) and the concise
[current authority index](knights-reforged/docs/development/CURRENT.md). The index
separates reviewed release source, live image observations and unmerged proposals,
and points to architecture, verification and operational evidence.

The reviewed 2026-11-04 release source is `90f10dbcb19dee74d9663a64c8bb96035a8200dd`
([PR #84](https://github.com/catillatio/test/pull/84)). Recheck current state for
each task; a documentation update does not deploy the game.

Node 24, TypeScript, Fastify, EJS and PostgreSQL power the server-rendered game.
From `knights-reforged/`, use the existing typecheck/build/static and reviewed test
runner commands. Dependency installation requires task authorization. Current CI
requirements and protected manual release procedures remain unchanged.

[Application documentation](knights-reforged/README.md) preserves the game's
milestone history. Earlier phase statuses, catalog counts and operations examples
must be read in that historical context; use the current index before operational
work. The original root label was “KR PROTOTYPE.”

Crime RPG is a separate repository, Railway project and database. Never share
credentials, deployment targets, backup destinations or game-specific rules across
the two projects. Do not reset, reseed, migrate, merge or deploy a live realm
without the authorization and safeguards appropriate to that action.
