# Kingdom Come task workflow

Stage 2 pilot, 2026-11-04. Scope: `catillatio/test` only. Start with root
[AGENTS.md](../../../AGENTS.md) and [CURRENT.md](CURRENT.md); preserve their
safety and completion requirements. This guide changes no client configuration,
CI requirement, release authority or Crime RPG file.

## Choose effort for the task

Use `gpt-6.1-sol`, **Medium / Standard** for ordinary development. Select effort
and speed in this chat's available model controls; CLI `/model` selects effort
and `/fast` controls Fast mode. Verify Standard, rather than blindly toggling it.
Instructions cannot switch the running parent model. If controls are unavailable,
record the actual selection and the mismatch; do not edit global configuration.

| Sol effort | Start here for | Escalate when |
| --- | --- | --- |
| Low | Mechanical docs/copy/path edits; a known, isolated EJS/CSS fix with clear acceptance | Callers, behavior or scope are uncertain: Medium |
| Medium | Bounded bugs, ordinary features and established UI patterns | A failed hypothesis reveals cross-module state, concurrency or security interactions: High |
| High | Economy/progression invariants, migrations, authentication/security, release compatibility, major visual or architectural work | A concrete unresolved interaction/proof remains after targeted evidence: XHigh |
| XHigh | The bounded hard question above, then its integrated verification | Stop a repeated failed approach, preserve evidence and change the hypothesis or escalate the blocker; more effort alone is not a remedy |

A missing SDK, unavailable fixture or provider failure needs diagnosis, not an
automatic reasoning increase. Keep the same acceptance criteria at every effort.
Return to Medium for the next ordinary task; Max/Ultra and other models are not
part of this pilot. Current [official model](https://learn.chatgpt.com/docs/models)
and [speed](https://learn.chatgpt.com/docs/agent-configuration/speed) references
describe available controls; the installed client/account remains authoritative.

## Execute one bounded task

1. State the objective, acceptance criteria and authorized actions in a few lines.
   Verify origin, base/HEAD and dirty work; use an isolated worktree if needed.
   Open CURRENT's affected entry points, then targeted `rg` callers/tests. Read
   bounded sections. Expand only to resolve a concrete question; do not reload
   the whole repository, master plan or unchanged evidence each turn.
2. Keep one implementation agent. Add an agent only if independent work or a
   material-risk review earns its cost: one question, relevant context, disjoint
   ownership/resources and a completion criterion. Do not repeat its discovery.
   Use separate worktrees and isolated fixtures for parallel writers. Record
   useful catches and coordination overhead, not just agent count.
3. Implement and run the smallest checks that exercise the changed behavior and
   affected consumers. Capture the first useful failure excerpt. Before retrying,
   state what source, hypothesis or environment changed. An unchanged deterministic
   failure does not justify another expensive run. Query long CI jobs at meaningful
   transitions; avoid short polling loops and repeated full logs.
4. Complete the integrated acceptance and required exact-head checks. Local focused
   success is development feedback; report pending/blocked gates accurately.
   Continue authorized testing and PR work without routine reconfirmation. Merge
   and deploy retain their existing separate authorization.
5. Record the result and a compact handoff; update only changed authority facts.
   For the next ten normal development tasks, maintain one
   [measurement record](usage-pilot/README.md) across all task chats. Start a fresh
   project chat at a completed work boundary or a distinct objective, not in the
   middle of an unresolved change without a handoff. A 30–90 minute packet is an
   experimental planning heuristic, not a timeout or permission to stop early.

## Select local tests without changing final gates

Use [the existing inventory](../../scripts/ci/test-manifest.json) and
[CI guide](../ci-performance/README.md) as authority. From `knights-reforged/`,
inspect affected manifest entries and their imports/callers. Example commands:

```sh
node scripts/ci/run-tests.mjs --files=tests/bot-loot.test.ts
node scripts/ci/run-tests.mjs --profile=ui
```

The first is feedback for the unit helper, not sufficient acceptance for an
economy change. The UI profile is broader feedback when relevant consumers are
uncertain. `--files` accepts comma-separated reviewed entries; use their declared
lanes/exclusivity, not invented filenames. Register meaningful new tests through
the existing inventory. Add typecheck/build/static checks when the change needs
them. For docs only, check links, facts, JSON where present and diff scope locally.

Check prerequisites before running: existing dependencies and, for database/browser
lanes, an authorized disposable local test fixture/browser. No production fixture,
dependency installation or weakened skip behavior to obtain a pass. If unavailable,
record the local limitation and use authorized existing CI. Prefer its isolated
Linux runner when the documented runner is unsuitable for the local platform.

After relevant local checks pass, do not repeat them without new changes or an
unresolved concern. All required final CI, security, browser, independent recovery,
release and exact production-push gates remain mandatory. Unknown/docs paths still
classify `full`; do not change classification, worker limits, thresholds, caches or
coverage for this pilot. Evidence for another SHA cannot approve this candidate.

## Handoff, at most about ten lines

```text
Objective and acceptance:
Repo / branch / base / head:
Dirty work and ownership:
Changed paths and decision:
Verification commands, exact source and results/links:
Pending gates / failed approach and validated cause:
Next concrete action and authorization boundary:
Pilot record ID and location:
```

Keep raw transcripts, secrets and irrelevant exploration out. Record a lesson only
with evidence using [the learning process](usage-pilot/README.md#validated-lessons).
