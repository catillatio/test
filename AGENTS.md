# Kingdom Come development

## Identity and architecture
This is `catillatio/test`; the default/release branch is `release/production`.
Verify origin, base, HEAD and `git status` before editing. Preserve other branches
and uncommitted work. `knights-reforged/` contains the Node 24 / TypeScript /
Fastify / EJS / PostgreSQL application. HTTP handlers are in `src/app.ts`, command
dispatch in `src/commands.ts`, transactions in `src/db.ts`, and versioned policy
selection in `src/realm-policy.ts`. See the small
[current authority index](knights-reforged/docs/development/CURRENT.md) before
loading longer phase reports.

Crime RPG is independent. Never use its database, credentials, Railway services,
backups or game-specific policies here. Repository/project organization is not a
security boundary; verify operational targets explicitly.

## Development and verification
Use **GPT-6.1 Sol Medium, Standard speed** for ordinary tasks. Use Low for
mechanical work, High for complex state/security/economy work, and XHigh for a
specific unresolved interaction. These are per-chat choices, not global settings;
record the actual setting if it differs. Read [the short workflow](knights-reforged/docs/development/WORKFLOWS.md)
once per bounded task; it covers targeted exploration, test selection, handoffs
and the next-ten-task measurement pilot. Load its measurement details only when
recording or reviewing a task. Do not replay old work to generate benchmarks.

Run application commands from `knights-reforged/`. Existing commands include
`npm run typecheck`, `npm run build`, `npm run check:static` and
`node scripts/ci/run-tests.mjs`. Use reviewed `--files`, `--profile` or `--lane`
selection for focused local feedback; consult `scripts/ci/test-manifest.json`
and the existing CI-performance guide. Register meaningful new tests. Required
exact-head CI remains mandatory; a focused pass is not release approval. For
documentation-only work, validate links, facts and diff scope locally and let
the unchanged CI classifier select required checks. Do not install dependencies
unless authorized.

Trace active callers before changing formulas: historical helpers coexist with
current human/bot rewards and progression epochs. Installed ruleset IDs, saved
receipts, financial journals and historical evidence are immutable. UI work starts
with `views/layout.ejs`, the current theme branch and relevant browser tests;
preserve artwork provenance, five-tab behavior and authoritative form bindings.

## Scope and completion
Complete authorized implementation, appropriate testing and PR creation without
repeated routine confirmations. Merge/deploy only when explicitly authorized.
Destructive database operations, production data changes, security-sensitive
configuration and global Codex changes require separate owner approval. Never
print secrets, reset a live realm or use live gameplay as a disposable fixture.

Use one implementer by default. Add an agent only for independent work or a
material-risk review that justifies its overhead; give it a bounded question,
disjoint files/resources and existing findings to prevent duplicate discovery.
No routine parallel review of trivial edits. Report exact source,
verification results, unresolved gates and rollback implications. Update the
authority index when a task changes its current-state facts; link existing
evidence instead of duplicating it.
