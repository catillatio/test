# Next-ten-task pilot

Kingdom Come only. This is a small manual record, not telemetry infrastructure.
No new plugin, agent, hook, scheduler, schema validator or dependency is required.
Read [WORKFLOWS.md](../WORKFLOWS.md) for execution; read this page when recording
or reviewing evidence. [baseline.json](baseline.json) retains limited historical
observations. Existing [CI benchmarks](../../ci-performance/BENCHMARKS.md) remain
the CI timing authority; do not rerun their workloads to manufacture a comparison.

## Capture one task

Use the next **ten consecutive owner-requested normal Kingdom development tasks**
started after adoption, including failed/blocked ones. Exclude this setup, its
discovery smoke check and administrative benchmark work. Assign K01–K10 in start
order; continuations, revisions and agent work retain the same ID. Do not cherry
pick successes or count one feature's ten substeps as ten completed tasks.

Copy [task-template.json](task-template.json) to task scratch space. At start fill
objective/acceptance, type/risk, UTC start, base and actual model/effort/speed. At
completion or a blocked handoff fill known results and append one compact JSON
line to [tasks.jsonl](tasks.jsonl); amend that same ID on continuation, never add
a second count. Keep verified code HEAD distinct from a later measurement-only
commit. Include the sanitized record in the task's normal PR when practical;
otherwise keep it with the task evidence and consolidate once at review. Do not
open a separate PR or rerun CI solely to append metrics.

- Completion: acceptance met AND required verification passed at the recorded
  source. PR-open, merged and deployment outcomes are separate fields. A pending
  CI/owner gate stays pending and is not a verified completion; deployment is
  counted only when explicitly in the task's authorized scope.
- Time: record start and verified-completion UTC separately from observed active
  work, tool elapsed, CI/job execution, queue and owner wait. Overlapping intervals
  are not summed as wall time. If only timestamps exist, call the difference
  wall time; leave active time null. Note 14-day follow-up for reopening,
  confirmed regression, rollback or security/data-preservation failure.
- Attempts: count distinct abandoned hypotheses, owner corrections and repeated
  unsuccessful actions. Separate product, environment/provider, harness and stale
  expectation causes. Link the failure and the successful fix or leave cause
  unconfirmed. A failed run is not automatically wasted work.
- Tools/agents: distinguish outer calls from nested operations, count each once
  within its category, and note the source/counting rule. Count confirmed avoidable
  repeats only after review; unknown is null, not zero. Record agent count, useful
  catches, conflicts, and coordination. Never label all polling/review as waste.
- Verification: command/suite, source, result, run/attempt URL, relevant duration
  and any prerequisite block. Record unnecessary reruns separately from required
  new-head CI. Preserve failed evidence; do not relabel skipped checks as passing.

## Usage without invented subscription accounting

Use available client/session counters or provider records; do not scan unrelated
chats. Keep raw logs and local session IDs/paths outside Git. Retain a short local
evidence alias, interval and method in `usage.sources`. Record observed values,
not the requested model setting. Missing counters stay null with a reason.

For a task-exclusive session, take the counter before the first task request and
after its final work. Deduplicate repeated cumulative `token_count` events; subtract
boundary counters within a monotonic segment. On reset, compaction or fork verify
continuity before subtraction. If the before counter is missing or lineage is
ambiguous, retain a labeled cumulative snapshot and leave task totals unknown.
Do not sum successive cumulative totals, inherited prefixes or parent/child totals
blindly. Store separately attributable segments as compact objects in `sources`
(alias, parent alias, interval, observed counters/delta, reset/overlap notes).

Cached input is a subset of input; reasoning output is a subset of output.
Never add either again. Record cache writes separately only when exposed. Tokens
are diagnostics, not subscription usage units or a dollar bill. Record provider
allowance/credit before/after only when task-attributable, with window/reset and
concurrent-activity notes. Otherwise leave the subscription field null. Never
convert API prices, cached tokens or rounded allowance percentages to fabricated
subscription cost. Count separately attributable child usage without double count;
if completeness cannot be established, label aggregate usage partial/unavailable.

## Review after five records and after ten outcomes

Keep each review to about ten minutes and record actual administration time. Group
by task type, risk, acceptance breadth, model/effort/speed and comparable usage
source; keep blocked tasks visible. Report sample counts, medians and ranges for
verified time and attributable usage, alongside failures/corrections/regressions.
Primary outcome is verified completion per comparable usage unit. Without such a
unit, that ratio is unavailable; token diagnostics and task time remain separate.

Historical chat snapshots are not matched completed-task controls. Ten varied
tasks may still lack a matched stratum; report that, not a savings percentage.
The audit's exploratory 15% improvement target is not a promised result or a
reason to weaken acceptance. Change one workflow factor at a time where feasible;
label confounders and model escalations. No p90/p95 or causal conclusion from a
tiny mixed sample. Complete the 14-day quality follow-up before a final judgment.

Stop the affected experiment on a confirmed security, financial, data-preservation
or cross-project failure; use the previous reviewed workflow while fixing it.
Keep useful project knowledge and all mandatory checks. Simplify/remove record
fields that cost more than they inform. No automatic settings or instruction edits.

## Validated lessons

Append a short entry to [LESSONS.md](LESSONS.md) only when useful: problem
signature, validated cause, successful solution, effective verification, avoidable
action (if proven), and commit/run evidence. Label hypotheses explicitly. Promote
a lesson into durable guidance only after two independent recurrences or one
costly well-validated incident, through owner approval or a reviewed PR. This file
does not execute policy updates. Record manual corrections and failed experiments
even when no general rule follows.
