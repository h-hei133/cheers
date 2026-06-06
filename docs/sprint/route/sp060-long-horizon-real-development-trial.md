# SP060 Long Horizon Real Development Trial

## Goal

Prove long-horizon autonomous development in disposable workspaces.

This goal is failed unless real workspace execution, failing verification, repair, targeted rerun, durable task state, continuation or replay, artifact or source receipts, changed-file accounting, evidence proof, and result verdict work together in long tasks.

This is not a single-step repair task. This is not a workspace smoke task. This is not catalog, liveRun, evaluation, docs, proof, or receipt work.

## Required Tools

Use Serena MCP for owner discovery, symbol references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and requirement coverage.

Use Superpowers where useful: using-superpowers, systematic-debugging, test-driven-development, verification-before-completion, dispatching-parallel-agents, subagent-driven-development, and code review.

Use local navigation first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then only matched files.

Use mature local source after target owner inspection:

/home/wang/projects/pi

Inspect only agent loop, harness, tool handling, workspace execution, verification, repair, session, compaction, artifact handling, and result reduction.

## Four Level Introduction Rule

For every capability brought in, evaluate in order:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Behavior-only alignment is allowed only after explaining why the first three are not appropriate. Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Required Long Tasks

Create or update:

docs/sprint/long-horizon-real-development-trial.md

Design 3 to 4 new disposable workspace long tasks. They must not recycle SP044 through SP059 tasks.

Required coverage:

- at least 3 tasks execute in disposable workspaces
- at least 2 tasks span continuation, replay, or compact carry-forward
- at least 2 tasks require multi-file edits
- at least 2 tasks start with real failing verification output
- at least 2 tasks require repair and targeted rerun
- at least 1 task requires first repair failure and second distinct strategy success
- at least 1 task produces artifact or source receipt proof
- at least 1 task resumes pending work with changed files, failure classification, repair attempts, and next verification plan
- manual correction count is zero

Each task must record workspace path pattern, turns or phases, changed files, failure output source, durable task-state fields, repair attempts, command reruns, artifact or continuation proof, final verdict, and exact missing proof if incomplete.

## Mandatory Product Behavior

Implement or fix product behavior only where long tasks expose gaps.

Mandatory behavior:

1. Real workspace task state survives continuation, replay, or compact carry-forward.
2. Restored task state drives normal runtime next action.
3. Changed files, failed target, repair attempts, and next verification plan survive across task phases.
4. Real failing command output drives discovery or repair.
5. Repair reads relevant context before editing when context is missing.
6. Repair writes actual files and targeted verification reruns changed targets.
7. First failed repair can trigger a distinct second strategy.
8. Artifact or source receipt proof binds source evidence and verification evidence.
9. Complete requires evidence/result-owned proof and verdict.
10. Incomplete tasks remain stopped_not_proven with exact missing proof.

## Non-Substitution Rule

Do not substitute completion with:

- single-turn task success
- simulated changed files
- simulated command output
- summary-only carry-forward
- proof-only or receipt-only change
- evaluation-only behavior
- catalog or liveRun behavior
- docs-only output
- generic green command
- provider or fallback success
- owner count or mission count

If long tasks do not cross phases and continue from durable task state, do not mark complete.

## Required Product Owners

Product fixes must be in rightful owners:

- core query runtime
- workspace or execution seam
- tools or dispatch
- verification command
- repair
- context or source discovery
- session or continuation
- compact carry-forward
- artifacts
- evidence
- result

Runtime evaluation and live catalog may consume behavior only. They must not own new product behavior.

## Hard Completion Gates

This task is not complete until all gates pass:

1. long-trial document exists
2. 3 to 4 new long tasks are defined
3. at least 3 tasks execute
4. at least 2 tasks span continuation, replay, or compact carry-forward
5. at least 2 tasks perform multi-file actual writes
6. at least 2 tasks start with real failing verification output
7. at least 2 tasks complete repair and targeted rerun
8. at least 1 task proves first repair failure and second strategy success
9. at least 1 task completes artifact or source receipt proof
10. at least 2 tasks complete with evidence/result verdict
11. incomplete tasks remain stopped_not_proven with exact missing proof
12. manual correction count is zero
13. product failures are fixed in rightful owners and same tasks rerun
14. requirement coverage table is complete
15. SP044 through SP059 regressions still pass
16. build passes
17. result truthfulness gate passes
18. anti-false-success gate passes
19. diff check passes
20. external live catalog passes if run after product changes

Not complete:

- no cross-phase task
- no durable task-state resume
- no real failed verification output
- no repair rerun
- no actual file writes
- no artifact or continuation proof
- proof-only or receipt-only fix
- evaluation-only behavior
- catalog or profile work
- stopping because tasks are hard

## Requirement Coverage Table

Final report must include:

- hard gate
- long task evidence
- durable state source
- real failing command output
- product files changed
- normal runtime path
- repair and verification proof
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

Run long tasks before and after product fixes, focused tests for changed owners, SP044 through SP059 regression suites, build when needed, result truthfulness gate, anti-false-success gate, diff checks, and external live catalog only if needed after product changes.

## Final Report

Report long tasks, before and after outcomes, task-state carry-forward, repair strategies, product fixes, requirement coverage table, mature source areas inspected, four-level introduction decisions, regression outcomes, live status if run, validation commands, final git status, commit hash, and push status.

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
