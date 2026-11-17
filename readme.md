# Kingdoms Restored (Kingdom Come repository)

The multiplayer game is maintained in **`catillatio/test`**, with default/release
branch **`release/production`**. Application source is in `knights-reforged/`.

Start with [AGENTS.md](AGENTS.md) and the concise
[current authority index](knights-reforged/docs/development/CURRENT.md). The index
separates reviewed release source, live image observations and unmerged proposals,
and points to architecture, verification and operational evidence.

Verified 2026-11-17 production source is
`c8222eaac6ee7a2b6392279b13415fadda3d788e` ([PR #97](https://github.com/catillatio/test/pull/97)),
protected [release 44016282262](https://github.com/catillatio/test/actions/runs/44016282262). The live game image,
restored-copy recovery checks and artifact evidence are documented in the
[production release record](knights-reforged/docs/release-upload/PRODUCTION_RELEASE_20261117.md).
The 2026-11-04 source (PR #84) is historical. Recheck actual provider state for
each task; a documentation-only commit never deploys the game.

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
