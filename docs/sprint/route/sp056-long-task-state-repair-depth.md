# SP056 Long Task State Repair Depth

## Goal

Build durable long-task state and deeper repair behavior for normal runtime.

This goal is failed unless a durable task-state projection can survive replay or compact carry-forward and then drive normal runtime decisions for pending action, proof gap, changed files, failed verification, repair attempts, and next verification plan.

This is not a continuation proof cleanup. This is not a summary-string task. This is not a diagnostics-only task.

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

Inspect concrete areas only: harness save points, session state, compaction, branch summaries, pending write or pending work handling, repair iteration, verification rerun, and result reduction.

## Four Level Introduction Rule

For every capability brought in, evaluate in order:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Behavior-only alignment is allowed only after explaining why the first three are not appropriate. Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Mandatory Product Behavior

Implement all of these:

1. Add a durable task-state projection with pending action, proof gap, changed files, verified files, unverified files, failure category, original failure output classification, repair attempts, next verification plan, artifact pending state, and continuation safety state.
2. Replay can restore this projection only from safe persisted facts.
3. Compact carry-forward can restore this projection only when quality and safety checks pass.
4. Restored task state drives normal runtime next action.
5. Stale, incomplete, unsafe, or contradictory task state produces not-proven or discovery, not success.
6. Repair iteration consumes failure output, prior repair attempts, context quality, changed files, and verification result.
7. Repair strategy changes after repeated failure or missing context instead of repeating the same repair.
8. Every repair that changes files requires post-repair targeted verification for those files.
9. The projection is not terminal truth. Evidence owns proof normalization and result owns verdict reduction.
10. Evaluation and live catalog consume this behavior only and must not own a competing state model.

## Non-Substitution Rule

Do not substitute the goal with:

- summary string carry-forward
- proof-only additions
- receipt-only additions
- replay fact without runtime decision impact
- compact injection text without structured task state
- evaluation-only behavior
- live catalog behavior
- docs-only output
- tests that bypass normal runtime
- repair proposal without post-repair verification
- owner count without product behavior

If durable task state does not drive normal runtime behavior after replay or compact restore, do not mark complete.

## Required Product Owners

At minimum, product changes must include:

- session continuation or replay
- compact carry-forward or context injection
- core query runtime state or policy
- repair iteration or repair handoff
- verification owner
- evidence or result only if needed to consume behavior, not as substitute

## Required Diagnostics

Create before-failing and after-passing diagnostics for all of these:

1. replay restores durable task state with pending action, proof gap, changed files, and next verification plan
2. compact carry-forward restores durable task state only when quality and safety pass
3. stale or unsafe continuation state is rejected and remains not-proven
4. failed verification after replay drives discovery or repair instead of generic continue
5. repeated repair with same failure changes strategy or requests discovery
6. repair with changed files requires targeted post-repair verification
7. missing context repair switches to discovery before another repair attempt
8. compact or replay after failed verification preserves original failure classification

At least four diagnostics must simulate multi-turn work with changed files and pending proof gap. At least one diagnostic must simulate compact or replay after failed verification and prove the next action is safe.

## Requirement Coverage Table

Final report must include a table with:

- mandatory requirement
- product files changed
- restored state source
- normal runtime path affected
- diagnostic proving behavior
- why this is not proof-only
- why this is not summary-only
- remaining risk

If any mandatory row lacks product behavior evidence, do not mark complete.

## Architecture Guardrails

Keep boundaries clean:

- session continuation and replay own durable input facts
- compact carry-forward owns quality-gated carry-forward
- core runtime owns runtime state and next decision consumption
- repair owns repair strategy
- verification owns verification target and execution facts
- evidence owns proof normalization
- result owns verdict reduction
- evaluation and live catalog consume product behavior only

Do not create duplicated policy, proof, repair, verification, continuation, replay, compact, or live acceptance paths.

## Hard Completion Gates

This task is not complete until all gates pass:

1. durable task-state projection exists
2. replay restores task state from safe persisted facts
3. compact carry-forward restores task state with quality and safety checks
4. restored state drives normal runtime next action
5. stale or unsafe restored state remains not-proven or discovery
6. repair consumes failure output and prior attempts
7. repeated repair changes strategy or requests discovery
8. post-repair targeted verification is required for changed repair files
9. all eight required diagnostics pass after failing before changes
10. at least four diagnostics simulate multi-turn changed-file pending-proof work
11. at least one diagnostic covers compact or replay after failed verification
12. requirement coverage table is complete
13. SP044 through SP055 regressions still pass
14. build passes
15. result truthfulness gate passes
16. anti-false-success gate passes
17. diff check passes
18. external live catalog passes if run after product changes
19. live acceptance, if run, shows manualCorrectionCount 0 and reportRedaction pass

Not complete:

- no durable task-state projection
- summary-only carry-forward
- proof-only or receipt-only work
- evaluation-only behavior
- catalog or profile work
- fallback-only work
- tests without normal runtime behavior
- repair without post-repair verification
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

Do not claim success from provider output, tool execution, dry-run, apply, status, host output, artifact existence, event emission, presentation, profile inclusion, carry-forward, replay restore, compact summary, or quality counter.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning.

Do not manually read or print files under /home/wang/.private-agents-real.

Live provider use must be explicit opt-in and isolated.

## Validation

Run:

- required durable task-state and repair diagnostics before and after
- focused tests for changed owners
- SP044 through SP055 regression suites
- build when needed
- result truthfulness gate
- anti-false-success gate
- diff checks
- external live catalog only if needed after product changes

Classify provider or fallback failures separately from product runtime failures.

## Final Report

Report:

- durable task-state behavior
- replay restore behavior
- compact carry-forward behavior
- repair strategy behavior
- post-repair verification behavior
- requirement coverage table
- product changes by owner
- mature source areas inspected
- four-level introduction decisions
- architecture guardrail status
- SP044 through SP055 regression outcomes
- live acceptance or blocked details if live was run
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
