# SP059 Debug Repair Verification Autonomy

## Goal

Build real debug repair and verification autonomy in disposable workspaces.

This goal is failed unless real failing verification output drives diagnosis, source discovery, repair edits, targeted rerun, and final evidence/result verdict.

This is not a proof cleanup. This is not a receipt cleanup. This is not a lightweight command path task. This is not catalog, liveRun, evaluation, docs, or synthetic-summary work.

## Required Tools

Use Serena MCP for owner discovery, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and requirement coverage.

Use Superpowers where useful:

- using-superpowers
- systematic-debugging
- test-driven-development
- verification-before-completion
- dispatching-parallel-agents
- subagent-driven-development
- requesting-code-review or receiving-code-review

Use local navigation first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then only matched files.

Use mature local source after target owner inspection:

/home/wang/projects/pi

Inspect only agent loop, harness, tool result handling, verification failure handling, repair iteration, source discovery, targeted rerun, session state, and result reduction.

## Four Level Introduction Rule

For every capability brought in, evaluate in order:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Behavior-only alignment is allowed only after explaining why the first three are not appropriate. Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Required Failing Workspace Tasks

Create or update:

docs/sprint/debug-repair-verification-autonomy.md

Design 4 to 6 new disposable workspace tasks. They must not recycle SP044 through SP058 tasks.

Required coverage:

- at least 4 tasks start with real failing verification command output
- at least 3 tasks complete from red to green with evidence/result verdict
- at least 3 tasks include actual repair file writes
- at least 2 tasks require multi-file repair
- at least 2 tasks must fail the first repair and then succeed after a different second repair strategy
- at least 1 task requires missing-context discovery before repair
- at least 1 task preserves failure through replay or continuation before repair
- at least 1 task produces artifact or source receipt after repair

Commands must produce real failing output from local files. Synthetic failure labels, provider summaries, fake receipts, and selected-not-run verification do not count.

## Mandatory Product Behavior

Implement or fix product behavior only where these tasks expose gaps.

Mandatory behavior:

1. Real command failure output is captured as safe structured feedback.
2. Failure output changes repair or discovery strategy.
3. Repair reads relevant source context before editing when context is missing.
4. Repair writes real files in the disposable workspace.
5. Repeated same failed repair is blocked.
6. At least two tasks prove first repair failure then second distinct strategy success.
7. Targeted verification reruns the failed target after every repair write.
8. Generic green output cannot hide an unrepaired failed target.
9. Repair chain enters durable task state when replay or continuation is involved.
10. Incomplete tasks remain stopped_not_proven with exact missing proof.

## Non-Substitution Rule

Do not substitute completion with:

- proof-only change
- receipt-only change
- type-only mapping
- synthetic failure label
- generic command success
- selected-not-run verification
- catalog completion
- liveRun completion
- evaluation-only behavior
- docs-only output
- normalTaskRuntime-only diagnostics
- owner count
- mission count
- provider or fallback success

If real failed command output does not drive repair and targeted rerun, do not mark complete.

## Required Product Owners

Product fixes must be in rightful owners:

- core query runtime
- workspace or execution seam
- tools or tool dispatch
- verification command
- repair iteration or handoff
- context or source discovery
- session or continuation
- evidence
- result

Runtime evaluation and live catalog may consume behavior only. They must not own new product behavior.

## Hard Completion Gates

This task is not complete until all gates pass:

1. debug repair document exists
2. 4 to 6 new disposable failing tasks are defined
3. at least 4 tasks execute real failing verification commands
4. at least 3 tasks complete red to green with evidence/result verdict
5. at least 3 tasks perform actual repair writes
6. at least 2 tasks require multi-file repair
7. at least 2 tasks prove first repair fails and second distinct repair strategy succeeds
8. at least 1 task requires missing-context discovery before repair
9. at least 1 task preserves failure through replay or continuation before repair
10. targeted verification reruns after every repair write
11. generic green output cannot hide failed target
12. manual correction count is zero
13. incomplete tasks remain stopped_not_proven with exact missing proof
14. product failures are fixed in rightful owners and same tasks rerun
15. requirement coverage table is complete
16. SP044 through SP058 regressions still pass
17. build passes
18. result truthfulness gate passes
19. anti-false-success gate passes
20. diff check passes
21. external live catalog passes if run after product changes

Not complete:

- fewer than 4 real failing verification tasks
- no first-failed then second-strategy repair success
- no real repair writes
- no targeted rerun
- proof-only or receipt-only fix
- type-only fix
- synthetic failure output
- evaluation-only behavior
- catalog or profile work
- stopping because tasks are hard

## Requirement Coverage Table

Final report must include:

- hard gate
- workspace task evidence
- real failing command output source
- repair source context
- product files changed
- normal runtime path
- execution seam evidence
- targeted verification proof
- why not proof-only
- why not evaluation-only
- remaining risk

If any required row lacks product behavior evidence, do not mark complete.

## Blocked Rule

Live provider is not required for this goal.

If live acceptance is run and fails only because of provider-network, provider-config, provider-auth, or provider-unreachable after non-live gates pass, set goal status to blocked.

Blocked is not complete.

When blocked, report exact retest command, expected pass fields, observed provider failure class, why this is not a product runtime failure, current git status, and whether changes are uncommitted.

Do not retry live repeatedly after provider-classified failure. Do not commit or push while blocked unless the user provides passing live evidence and explicitly tells you to continue.

## Naming And Content Rules

During development, product file names and product content must not contain process wording, comparison wording, reading-process wording, or names of outside codebases. Use domain language only.

## Truthfulness And Safety

Evidence/result owns terminal truth.

Do not claim success from provider output, tool execution, dry-run, apply, status, host output, artifact existence, event emission, presentation, profile inclusion, replay restore, compact summary, command output alone, or quality counter.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning.

Do not manually read or print files under /home/wang/.private-agents-real.

## Validation

Run:

- failing workspace tasks before and after product fixes
- focused tests for changed owners
- SP044 through SP058 regression suites
- build when needed
- result truthfulness gate
- anti-false-success gate
- diff checks
- external live catalog only if needed after product changes

Classify provider or fallback failures separately from product runtime failures.

## Final Report

Report failing tasks, before and after outcomes, first and second repair strategies, product fixes, requirement coverage table, mature source areas inspected, four-level introduction decisions, regression outcomes, live status if run, validation commands, final git status, commit hash, and push status.

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
