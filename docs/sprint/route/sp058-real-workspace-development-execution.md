# SP058 Real Workspace Development Execution

## Goal

Prove real workspace autonomous development ability in disposable workspaces.

This goal is failed unless normal runtime plus execution seam completes real disposable workspace tasks with actual file changes, actual verification command output, repair reruns, artifact or continuation evidence, changed-file accounting, evidence/task proof, and result/task verdict.

This is not a runtime diagnostic task. This is not catalog work. This is not liveRun work. This is not evaluation-only. This is not proof-only. This is not receipt-only.

## Required Tools

Use Serena MCP for owner discovery, symbol references, diagnostics, and targeted edits.

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

Inspect only agent loop, harness, tool handling, workspace execution, verification, repair, session/compaction, artifact handling, and result reduction.

## Four Level Introduction Rule

For every capability brought in, evaluate in order:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Behavior-only alignment is allowed only after explaining why the first three are not appropriate. Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Required Workspace Tasks

Create or update:

docs/sprint/real-workspace-development-execution.md

Design 4 to 6 new disposable workspace tasks. They must not recycle SP044 through SP057 tasks.

Required coverage:

- at least 4 tasks execute in disposable workspaces
- at least 3 tasks perform actual file writes
- at least 2 tasks modify multiple files
- at least 2 tasks run real verification commands
- at least 1 task starts with failing verification, repairs, then reruns targeted verification
- at least 1 task produces artifact or source-receipt proof
- at least 1 task uses replay, compact, or continuation task state
- at least 1 task requires missing-context discovery before edit

Each task must record workspace path pattern, changed files, command run, command output classification, repair action if any, proof input, final verdict, and exact missing proof if not complete.

## Required Product Behavior

Implement or fix product behavior only where the workspace tasks expose gaps.

Mandatory behavior:

1. Normal runtime can execute task work in a disposable workspace.
2. Actual file diffs are captured as changed-file evidence.
3. Real command output is reduced into safe structured verification feedback.
4. Failed verification output can drive repair or discovery.
5. Repair that changes files requires targeted post-repair verification.
6. Artifact proof binds source evidence and verification evidence.
7. Continuation or replay state can resume pending workspace work safely.
8. Complete cannot occur without evidence/result-owned proof.
9. Incomplete tasks remain stopped_not_proven with exact missing proof.
10. Manual correction count remains zero.

## Non-Substitution Rule

Do not substitute completion with:

- simulated changed files
- simulated verification output
- normalTaskRuntime-only diagnostics
- catalog completion
- liveRun completion
- evaluation-only behavior
- docs-only output
- proof-only or receipt-only change
- event or surface output
- provider/fallback success
- mission count without real workspace behavior

If tasks do not perform actual workspace file changes and real command execution, do not mark complete.

## Required Product Owners

Product fixes must be in rightful owners:

- core query runtime
- workspace or execution seam
- tools or tool dispatch
- edit
- verification command
- repair
- artifacts
- session or continuation
- evidence
- result

Runtime evaluation and live catalog may consume behavior only. They must not own new product behavior.

## Hard Completion Gates

This task is not complete until all gates pass:

1. workspace execution document exists
2. 4 to 6 new disposable workspace tasks are defined
3. at least 4 tasks are executed
4. at least 3 tasks perform actual file writes
5. at least 2 tasks modify multiple files
6. at least 2 tasks include real verification command output
7. at least 1 failed verification task completes after repair and targeted rerun
8. at least 1 artifact or source-receipt task completes with proof
9. at least 1 continuation or replay task completes safely
10. at least 3 tasks complete with evidence/result verdict
11. any incomplete task remains stopped_not_proven with exact missing proof
12. manual correction count is zero
13. product failures are fixed in rightful owners and same tasks rerun
14. requirement coverage table is complete
15. SP044 through SP057 regressions still pass
16. build passes
17. result truthfulness gate passes
18. anti-false-success gate passes
19. diff check passes
20. external live catalog passes if run after product changes

Not complete:

- no disposable workspace execution
- no actual file writes
- no real command output
- no repair rerun evidence
- no artifact or continuation task
- proof-only or receipt-only work
- evaluation-only behavior
- catalog or profile work
- tests without real workspace behavior
- stopping because tasks are hard

## Requirement Coverage Table

Final report must include:

- hard gate
- workspace task evidence
- product files changed
- real command output source
- normal runtime path
- execution seam evidence
- verification or repair proof
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

- workspace tasks before and after product fixes
- focused tests for changed owners
- SP044 through SP057 regression suites
- build when needed
- result truthfulness gate
- anti-false-success gate
- diff checks
- external live catalog only if needed after product changes

Classify provider or fallback failures separately from product runtime failures.

## Final Report

Report workspace tasks, before and after outcomes, product fixes, requirement coverage table, mature source areas inspected, four-level introduction decisions, regression outcomes, live status if run, validation commands, final git status, commit hash, and push status.

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
