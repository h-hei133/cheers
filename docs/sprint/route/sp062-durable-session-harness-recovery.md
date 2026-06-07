# SP062 Durable Session Harness Recovery

## Goal

Make the normal runtime harness durable across session, replay, and compact carry-forward, then prove recovery from imperfect action sequences.

This goal is failed unless harness state is stored and restored through product session or continuation owners, not only runtime seed or tests.

Required spine:

session entry
-> harness snapshot
-> save point
-> ordered tool ledger
-> pending write queue
-> pending verification queue
-> pending repair queue
-> compact or replay restore
-> normal runtime next action
-> evidence proof
-> result verdict

## Required Tools

Use Serena MCP for owner discovery, references, diagnostics, and targeted edits.

Use Spec-Driven Develop for decomposition and coverage.

Use Superpowers where useful: using-superpowers, systematic-debugging, test-driven-development, verification-before-completion, dispatching-parallel-agents, subagent-driven-development, and code review.

Use local navigation first: /home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, usage/task-reading-matrix.md, then matched files only.

Use mature local source after owner inspection: /home/wang/projects/pi

Inspect only agent loop, harness, session state, save points, tool-result handling, pending writes, continuation, compaction, verification, repair, and result reduction.

## Four Level Introduction Rule

Evaluate in order:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Structured port is expected. Isolated source adoption is allowed only for small pure reducers after review. Behavior-only alignment is fallback only.

Do not copy names, paths, runtime fields, user-visible wording, terminal truth rules, or architecture wholesale.

## Mandatory Product Behavior

Implement all:

1. Harness state has a durable session or continuation representation, not only runtime memory.
2. Save points, ledger entries, pending write, pending verification, and pending repair queues can be serialized and restored.
3. Compact carry-forward preserves only safe harness state and rejects stale or contradictory state.
4. Replay restores harness state and drives normal runtime next action.
5. Provider-shaped imperfect action sequences are corrected by runtime harness behavior.
6. Wrong edit while discovery is required is blocked or redirected.
7. Generic verification cannot hide a targeted failed verification.
8. Bad repair produces a new repair or discovery strategy, not repeated repair.
9. Incomplete artifact proof stays pending until source and verification evidence exist.
10. Evidence/result remains terminal truth owner.

## Required Product Owners

Product changes must include:

- session continuation or replay
- compact carry-forward
- core query runtime harness
- tool feedback or dispatch
- verification or repair owner
- evidence or result only as consumer

Docs, tests, catalog, liveRun, quality, surface, event output, proof-only, or receipt-only changes do not satisfy this goal.

## Required Diagnostics

Create before-failing and after-passing diagnostics for:

1. durable session restore of harness snapshot
2. compact restore of safe harness queues
3. stale compact harness state rejected
4. wrong edit blocked then discovery resumes task
5. generic verification rejected then targeted rerun required
6. bad repair changes strategy after rerun failure
7. incomplete artifact proof remains pending across restore
8. ledger-only restored state cannot complete task

At least six diagnostics must use normal QueryEngine plus execution seam. At least three must use disposable workspace writes and real command output. At least three must use provider-shaped imperfect turns, not ideal summaries.

## Required Workspace Tasks

Create or update:

docs/sprint/durable-session-harness-recovery.md

Define 3 to 5 disposable workspace tasks. They must not recycle SP044 through SP061 tasks.

Required coverage:

- at least 3 tasks execute
- at least 2 tasks restore from session, replay, or compact state
- at least 2 tasks include provider-shaped wrong or incomplete actions
- at least 2 tasks perform actual file writes
- at least 2 tasks use real failing command output
- at least 1 task repairs after a bad first repair
- at least 1 task completes artifact or source receipt proof after restore
- incomplete tasks remain stopped_not_proven with exact missing proof
- manual correction count is zero

## Non-Substitution Rule

Do not substitute completion with:

- runtime seed only
- ideal synthetic summary
- proof-only or receipt-only change
- docs-only or tests-only work
- evaluation-only behavior
- catalog or liveRun behavior
- simulated files or command output
- provider or fallback success
- owner count or mission count

If durable session harness state does not restore and drive normal runtime action, do not mark complete.

## Requirement Coverage Table

Final report must include:

- mandatory requirement
- product files changed
- durable state source
- harness component
- normal runtime path
- workspace evidence
- diagnostic
- why not runtime-seed-only
- why not proof-only or evaluation-only
- remaining risk

If any required row lacks product behavior evidence, do not mark complete.

## Hard Gates

Not complete until:

1. durable harness representation exists
2. save point and queues serialize and restore
3. compact restore accepts safe state and rejects stale state
4. replay restore drives normal runtime action
5. provider-shaped wrong actions are corrected by harness behavior
6. all eight diagnostics pass after failing before changes
7. at least three workspace tasks execute
8. at least two tasks restore from durable state
9. at least two tasks include wrong or incomplete actions
10. at least one bad repair changes strategy and succeeds or remains honestly not-proven
11. requirement coverage table is complete
12. SP044 through SP061 regressions pass
13. build passes
14. truthfulness gate passes
15. anti-false-success gate passes
16. diff checks pass
17. live catalog passes if run

## Blocked Rule

Live provider is not required.

If live is run and fails only from provider-network, provider-config, provider-auth, or provider-unreachable after non-live gates pass, set status blocked. Report retest command, expected fields, failure class, why not product failure, git status, and uncommitted state. Do not retry live repeatedly.

## Naming And Safety

During development, product file names and product content must not contain process wording, comparison wording, reading-process wording, or outside project names. Use domain language only.

Evidence/result owns terminal truth. Do not claim success from provider output, tool execution, dry-run, apply, status, artifact existence, replay restore, compact summary, command output alone, harness ledger, or quality counter.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning. Do not manually read or print /home/wang/.private-agents-real.

## Validation

Run durable harness diagnostics before and after, workspace tasks, focused changed-owner tests, SP044 through SP061 regressions, build, truthfulness gate, anti-false-success gate, diff checks, and live catalog only if needed.

Commit only after hard gates pass. Push once only. If push fails, do not retry.
