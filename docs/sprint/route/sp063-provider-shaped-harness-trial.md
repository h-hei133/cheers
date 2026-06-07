# SP063 Provider Shaped Harness Trial

## Goal

Prove durable harness recovery from provider-shaped imperfect action sequences.

This goal is failed unless normal QueryEngine plus execution seam receives wrong or incomplete action sequences and product harness behavior corrects them through ledger, pending queues, repair strategy, targeted verification, artifact proof, continuation restore, evidence proof, and result verdict.

This is not a field-expansion task. This is not an ideal summary task. This is not docs-only, tests-only, proof-only, receipt-only, catalog, liveRun, or evaluation-only work.

## Required Tools

Use Serena MCP for owner discovery, references, diagnostics, and targeted edits.

Use Spec-Driven Develop for decomposition and requirement coverage.

Use Superpowers where useful: using-superpowers, systematic-debugging, test-driven-development, verification-before-completion, dispatching-parallel-agents, subagent-driven-development, and code review.

Use local navigation first: /home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, usage/task-reading-matrix.md, then matched files only.

Use mature local source after owner inspection: /home/wang/projects/pi

Inspect only agent loop, harness, session state, tool results, pending writes, continuation, compaction, verification, repair, artifact handling, and result reduction.

## Four Level Introduction Rule

Evaluate in order:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Structured port is expected. Isolated source adoption is allowed only for small pure reducers after review. Behavior-only alignment is fallback only. Do not copy names, paths, runtime fields, user-visible wording, terminal truth rules, or architecture wholesale.

## Mandatory Product Behavior

Implement or fix product behavior only where the trial exposes gaps:

1. wrong edit while discovery is required is blocked or redirected
2. generic verification cannot hide a targeted failed verification
3. bad repair changes strategy after rerun failure
4. incomplete artifact proof remains pending until source and verification evidence exist
5. lost continuation restores durable harness state and drives next action
6. restored ledger or restored queues cannot complete a task alone
7. real command output and real writes are used in the trial
8. evidence/result remains terminal truth owner

## Required Product Owners

Product changes must be in rightful owners:

- core runtime harness
- execution seam or tool dispatch
- session, replay, or compact carry-forward
- verification
- repair
- artifacts
- evidence or result only as consumers

Docs, tests, catalog, liveRun, quality, surface, event output, proof-only, or receipt-only changes do not satisfy this goal.

## Required Workspace Tasks

Create or update:

docs/sprint/provider-shaped-harness-trial.md

Define 3 to 5 disposable workspace tasks that are not recycled from SP044 through SP062.

Required coverage:

- at least 3 tasks execute
- at least 3 tasks include wrong or incomplete actions
- at least 2 tasks use real failing command output
- at least 2 tasks perform actual writes
- at least 1 task rejects generic green and requires targeted rerun
- at least 1 task changes strategy after bad repair
- at least 1 task fixes incomplete artifact proof after restore
- at least 1 task resumes lost continuation from durable harness state
- incomplete tasks remain stopped_not_proven with exact missing proof
- manual correction count is zero

## Required Diagnostics

Create before-failing and after-passing diagnostics for:

1. wrong edit blocked then discovery resumes task
2. generic verification rejected then targeted rerun succeeds or remains not-proven
3. bad repair changes strategy after rerun failure
4. incomplete artifact proof remains pending across restore
5. lost continuation restores harness state and continues safely
6. restored ledger alone cannot complete a task

At least six diagnostics must use normal QueryEngine plus execution seam. At least three must use disposable workspace writes and real command output. At least three must use imperfect actions, not ideal summaries.

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

If imperfect actions do not get corrected by product harness behavior, do not mark complete.

## Coverage Table

Final report must include:

- mandatory requirement
- product files changed
- imperfect action
- harness component
- normal runtime path
- workspace evidence
- diagnostic
- why not ideal-summary-only
- why not proof-only or evaluation-only
- remaining risk

If any required row lacks product behavior evidence, do not mark complete.

## Hard Gates

Not complete until:

1. trial document exists
2. at least 3 workspace tasks execute
3. at least 3 tasks include wrong or incomplete actions
4. at least 2 tasks use real failing command output
5. at least 2 tasks perform actual writes
6. at least 1 generic green is rejected for targeted rerun
7. at least 1 bad repair changes strategy
8. at least 1 incomplete artifact proof is fixed after restore
9. at least 1 lost continuation resumes from durable state
10. all six diagnostics pass after failing before changes
11. SP044 through SP062 regressions pass
12. build passes
13. truthfulness gate passes
14. anti-false-success gate passes
15. diff checks pass
16. live catalog passes if run

## Blocked Rule

Live provider is not required.

If live is run and fails only from provider-network, provider-config, provider-auth, or provider-unreachable after non-live gates pass, set status blocked. Report retest command, expected fields, failure class, why not product failure, git status, and uncommitted state. Do not retry live repeatedly.

## Naming And Safety

During development, product file names and product content must not contain process wording, comparison wording, reading-process wording, or outside project names. Use domain language only.

Evidence/result owns terminal truth. Do not claim success from provider output, tool execution, dry-run, apply, status, artifact existence, replay restore, compact summary, command output alone, harness ledger, or quality counter.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning. Do not manually read or print /home/wang/.private-agents-real.

## Validation

Run provider-shaped harness diagnostics before and after, workspace tasks, focused changed-owner tests, SP044 through SP062 regressions, build, truthfulness gate, anti-false-success gate, diff checks, and live catalog only if needed.

Commit only after hard gates pass. Push once only. If push fails, do not retry.
