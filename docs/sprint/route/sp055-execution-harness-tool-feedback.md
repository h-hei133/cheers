# SP055 Execution Harness Tool Feedback

## Goal

Deepen the normal runtime execution harness and tool feedback loop.

This goal is failed unless normal runtime action becomes concrete execution work with typed batch results, ordered ingestion, partial failure handling, and next-action impact. Proof hardening, receipt hardening, event output, catalog behavior, evaluation-only behavior, or task documents alone do not satisfy this goal.

The target capability is:

runtime action
-> execution batch
-> concrete execution seam
-> ordered tool results
-> typed safe feedback
-> runtime observations
-> next action decision
-> verification or repair or stop-not-proven

## Required Tools

Use Serena MCP for symbol navigation, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and requirement coverage.

Use Superpowers where available:

- using-superpowers
- systematic-debugging
- test-driven-development
- verification-before-completion
- dispatching-parallel-agents
- subagent-driven-development
- requesting-code-review or receiving-code-review

Do not let any tool create process bloat or stopping excuses.

Use local navigation first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then only matching files.

Use mature local source after target owner inspection:

/home/wang/projects/pi

Inspect concrete areas only: agent loop, harness, tool result handling, action dispatch, verification command handling, tool execution details, and result reduction.

## Four Level Introduction Rule

For every capability brought in, evaluate in order:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Behavior-only alignment is allowed only after explaining why the first three are not appropriate. Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Mandatory Product Behavior

Implement all of these:

1. Add a runtime-owned execution batch model for at least read, search, verify, repair, and artifact action families.
2. Batch execution must be consumed by normal QueryEngine plus the concrete execution seam, not evaluation-only helpers.
3. Preserve safe per-tool result details into runtime observations: tool id, action kind, covered files, truncated flag, exit status class, failure class, affected paths, and redaction status.
4. Ingest ordered tool results before the next runtime decision.
5. Partial batch failure must change the next action instead of being hidden by later success.
6. Targeted verification handoff must flow from runtime action to verification command handling and back as typed coverage.
7. Stop-not-proven must occur when batch results leave no safe next action.
8. Evidence/result remains terminal truth owner and must not be bypassed.

## Non-Substitution Rule

Do not substitute the goal with:

- proof-only changes
- receipt-only changes
- event or surface output
- catalog or liveRun changes
- evaluation-only behavior
- docs-only output
- tests that bypass QueryEngine and the execution seam
- owner count without execution behavior
- mission count without runtime behavior

If runtime execution batch and ordered feedback ingestion are not implemented, do not mark complete.

## Required Product Owners

At minimum, product changes must include:

- core query runtime
- concrete execution seam or tool dispatch seam
- tool feedback or tool policy owner
- verification command owner
- runtime observation owner

Evidence or result may change only to consume new product behavior, not as a substitute.

## Required Diagnostics

Create before-failing and after-passing diagnostics for all of these:

1. ordered batch result ingestion affects the next runtime action
2. partial batch failure changes next action instead of being hidden
3. failed tool feedback carries safe failure class and affected paths
4. targeted verification action hands off to command coverage and returns typed coverage
5. unsafe batch action is blocked by authority before execution
6. no safe next action after batch failure produces stop-not-proven

At least six diagnostics must exercise normal QueryEngine plus concrete execution seam behavior. Evaluation-only tests do not count.

## Requirement Coverage Table

Final report must include a table with:

- mandatory requirement
- product files changed
- execution path
- diagnostic proving behavior
- why this is not proof-only
- why this is not evaluation-only
- remaining risk

If any mandatory row lacks product behavior evidence, do not mark complete.

## Architecture Guardrails

Keep boundaries clean:

- QueryEngine and runQueryLoop own sequencing
- concrete execution seam owns execution
- tool dispatch and tool runtime own side effects and safe tool receipts
- tools policy owns next-action choice
- verification owns command target and execution facts
- repair owns repair strategy
- artifacts workflow owns artifact validation
- session replay owns durable input facts
- evidence owns proof normalization
- result owns verdict reduction
- evaluation and live catalog consume product behavior only

Do not create duplicated policy, proof, execution, verification, repair, artifact, continuation, or live acceptance paths.

## Hard Completion Gates

This task is not complete until all gates pass:

1. runtime-owned execution batch model exists
2. ordered result ingestion exists
3. safe per-tool result details enter runtime observations
4. partial batch failure changes next action
5. targeted verification handoff is proven
6. stop-not-proven occurs when no safe action remains
7. all six required diagnostics pass after failing before changes
8. at least six diagnostics exercise normal QueryEngine plus execution seam
9. requirement coverage table is complete
10. SP044 through SP054 regressions still pass
11. build passes
12. result truthfulness gate passes
13. anti-false-success gate passes
14. diff check passes
15. external live catalog passes if run after product changes
16. live acceptance, if run, shows manualCorrectionCount 0 and reportRedaction pass

Not complete:

- no execution batch
- no ordered tool-result ingestion
- proof-only or receipt-only work
- evaluation-only behavior
- catalog or profile work
- fallback-only work
- surface or event only
- tests without normal execution behavior
- duplicated policy or proof paths
- stopping because implementation is difficult

## Blocked Rule

Live provider is not required for this goal.

If live acceptance is run and fails only because of provider-network, provider-config, provider-auth, or provider-unreachable after non-live gates pass, set the goal status to blocked.

Blocked is not complete.

When blocked, report:

- exact retest command
- required environment variables
- expected pass fields
- observed provider failure class
- why this is not a product runtime failure
- current git status
- whether product changes are uncommitted

Do not retry live repeatedly after provider-classified failure. Do not commit or push while blocked unless the user provides passing live evidence and explicitly tells you to continue.

## Blocker Policy

Ordinary technical blockers are work items, not stopping points.

Do not stop because owner discovery is hard, diagnostics fail, implementation is hard, validation fails, source shape differs, review is slow, or live output is noisy.

Allowed blocked states only:

- safety boundary would be violated
- required credential or explicit provider opt-in is unavailable
- provider remains unreachable after explicit opt-in
- isolated workspace cannot be created safely
- user authorization is required for a write this task cannot authorize

## Naming And Content Rules

During development, product file names and product content must not contain process wording, comparison wording, reading-process wording, or names of outside codebases. Use domain language only.

## Truthfulness And Safety

Evidence/result owns terminal truth.

Do not claim success from provider output, tool execution, dry-run, apply, status, host output, artifact existence, event emission, presentation, profile inclusion, or quality counter.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning.

Do not manually read or print files under /home/wang/.private-agents-real.

Live provider use must be explicit opt-in and isolated.

## Validation

Run:

- required execution batch diagnostics before and after
- focused tests for changed owners
- SP044 through SP054 regression suites
- build when needed
- result truthfulness gate
- anti-false-success gate
- diff checks
- external live catalog only if needed after product changes

Classify provider or fallback failures separately from product runtime failures.

## Final Report

Report:

- execution batch behavior
- ordered ingestion behavior
- safe tool feedback details
- partial failure handling
- targeted verification handoff
- requirement coverage table
- product changes by owner
- mature source areas inspected
- four-level introduction decisions
- architecture guardrail status
- SP044 through SP054 regression outcomes
- live acceptance or blocked details if live was run
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
