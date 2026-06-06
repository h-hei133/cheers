# SP061 Harness Spine Adoption

## Goal

Adopt a mature autonomous development harness spine into the normal product runtime.

This goal is failed unless product code gains a real harness spine for normal runtime execution:

turn snapshot
-> action batch
-> ordered tool result ledger
-> save point
-> pending write or verification or repair queue
-> durable task ledger
-> continuation carry-forward
-> evidence proof
-> result verdict

This is not another diagnostic sprint. This is not a proof cleanup. This is not a receipt cleanup. This is not docs-only, catalog, liveRun, evaluation-only, or test-only work.

## Required Tools

Use Serena MCP for owner discovery, symbol references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and requirement coverage.

Use Superpowers where useful: using-superpowers, systematic-debugging, test-driven-development, verification-before-completion, dispatching-parallel-agents, subagent-driven-development, and code review.

Use local navigation first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then only matched files.

Use mature local source after target owner inspection:

/home/wang/projects/pi

Inspect only agent loop, harness, session state, tool batch execution, tool result handling, save points, pending writes, continuation, compaction, verification, repair, and result reduction.

## Four Level Introduction Rule

For every capability brought in, evaluate in order:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Structured port is the default expected level for harness spine behavior. Isolated source adoption is allowed for small pure reducers or settlement helpers after review. Behavior-only alignment is allowed only after explaining why the first three are not appropriate.

Do not copy names, paths, runtime fields, user-visible wording, terminal truth rules, or architecture wholesale.

## Mandatory Product Behavior

Implement all of these in product owners:

1. Harness turn snapshot records runtime action, action batch, pending queues, changed files, failure state, verification plan, repair attempts, artifact pending state, and task-state version.
2. Save point is created before and after batch execution and can be restored safely.
3. Tool result ledger stores ordered safe tool results with action kind, target files, exit class, failure class, truncation state, redaction state, and affected paths.
4. Pending write queue records intended writes before apply and clears only after changed-file accounting and verification plan update.
5. Pending verification queue records targeted verification after edits or repairs.
6. Pending repair queue records failure output classification, repair hypothesis, prior attempt, and next context need.
7. Ordered settlement feeds runtime observations before the next decision.
8. Continuation or replay can restore the harness state and drive next runtime action.
9. Evidence/result remains terminal truth owner.
10. Evaluation and live catalog consume harness behavior only and own no competing behavior.

## Required Product Owners

Product changes must include at least:

- core query runtime
- execution seam or tool dispatch
- tool runtime or feedback owner
- session continuation or replay
- verification or repair owner
- evidence or result only as consumer

Changes only in docs, tests, catalog, liveRun, quality, surface, event output, proof boundary, or receipt boundary do not satisfy this goal.

## Required Diagnostics

Create before-failing and after-passing diagnostics for all of these:

1. turn snapshot survives batch execution and affects next action
2. ordered tool result ledger preserves partial failure before later success
3. pending write queue blocks terminal success until changed files and verification plan exist
4. pending verification queue survives continuation and triggers targeted rerun
5. pending repair queue changes strategy after failed attempt and missing context
6. save point restore after interrupted execution resumes safe next action
7. continuation restore carries harness state without claiming success
8. evaluation consumer cannot complete a task from harness ledger alone

At least six diagnostics must exercise normal QueryEngine plus execution seam. At least two must use disposable workspace writes and real command output.

## Required Real Tasks

Create or update:

docs/sprint/harness-spine-adoption.md

Define 3 to 5 disposable workspace tasks that prove the harness spine. They must not recycle SP044 through SP060 tasks.

Required coverage:

- at least 3 tasks execute
- at least 2 tasks perform actual multi-file writes
- at least 2 tasks use real failing command output
- at least 1 task restores from save point or continuation
- at least 1 task uses repair queue and targeted rerun
- at least 1 task proves pending write or pending verification queue blocks false completion
- incomplete tasks remain stopped_not_proven with exact missing proof
- manual correction count is zero

## Non-Substitution Rule

Do not substitute completion with:

- more diagnostics without harness product code
- proof-only or receipt-only change
- summary-only continuation
- simulated command output
- simulated changed files
- evaluation-only behavior
- catalog or liveRun behavior
- event or surface output
- provider or fallback success
- owner count or mission count

If there is no harness spine product implementation, do not mark complete.

## Requirement Coverage Table

Final report must include:

- mandatory requirement
- product files changed
- harness spine component
- normal runtime path
- execution seam evidence
- workspace task evidence
- diagnostic
- why not proof-only
- why not evaluation-only
- remaining risk

If any required row lacks product behavior evidence, do not mark complete.

## Hard Completion Gates

This task is not complete until all gates pass:

1. harness turn snapshot exists
2. save point behavior exists
3. ordered tool result ledger exists
4. pending write queue exists
5. pending verification queue exists
6. pending repair queue exists
7. continuation or replay restores harness state
8. at least six required diagnostics pass after failing before changes
9. at least three workspace harness tasks execute
10. at least two multi-file write tasks complete or remain honestly not-proven
11. at least one interrupted or restored task resumes safely
12. at least one repair task completes after targeted rerun
13. requirement coverage table is complete
14. SP044 through SP060 regressions still pass
15. build passes
16. result truthfulness gate passes
17. anti-false-success gate passes
18. diff check passes
19. external live catalog passes if run after product changes

## Blocked Rule

Live provider is not required for this goal.

If live acceptance is run and fails only because of provider-network, provider-config, provider-auth, or provider-unreachable after non-live gates pass, set goal status to blocked.

Blocked is not complete.

Report exact retest command, expected pass fields, failure class, why it is not product runtime failure, git status, and whether changes are uncommitted.

Do not retry live repeatedly after provider-classified failure. Do not commit or push while blocked unless user provides passing live evidence and explicitly tells you to continue.

## Naming And Content Rules

During development, product file names and product content must not contain process wording, comparison wording, reading-process wording, or names of outside codebases. Use domain language only.

## Truthfulness And Safety

Evidence/result owns terminal truth.

Do not claim success from provider output, tool execution, dry-run, apply, status, host output, artifact existence, event emission, presentation, profile inclusion, replay restore, compact summary, command output alone, harness ledger, or quality counter.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning.

Do not manually read or print files under /home/wang/.private-agents-real.

## Validation

Run harness diagnostics before and after product fixes, workspace harness tasks, focused tests for changed owners, SP044 through SP060 regression suites, build when needed, result truthfulness gate, anti-false-success gate, diff checks, and external live catalog only if needed after product changes.

## Final Report

Report harness components implemented, workspace tasks, before and after outcomes, product fixes, requirement coverage table, mature source areas inspected, four-level decisions, regression outcomes, live status if run, validation commands, final git status, commit hash, and push status.

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
