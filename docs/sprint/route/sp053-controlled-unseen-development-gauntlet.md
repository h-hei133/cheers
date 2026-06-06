# SP053 Controlled Unseen Development Gauntlet

## Goal

Use unseen realistic development tasks to force real execution-boundary improvement.

This goal is failed unless both conditions are met:

1. unseen realistic development tasks expose or prove hard normal-runtime behavior
2. AgentRunner or the closest concrete execution seam changes real product behavior

Runtime action must stage, constrain, or reject actual tool, edit, verify, repair, artifact, or continuation execution. Metadata, proof items, receipts, diagnostics, evaluation behavior, live catalog behavior, or task documents alone do not satisfy this goal.

## Non-Substitution Rule

Do not substitute the core goal with:

- proof hardening
- receipt hardening
- result mapping
- event or surface changes
- evaluation-only behavior
- live catalog behavior
- quality counters
- recycled diagnostics
- task documents without execution-boundary behavior
- owner count without execution-boundary behavior

If the execution boundary does not change behavior, do not mark complete.

## Required Tools

Use Serena MCP for symbol navigation, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and execution discipline.

Use Superpowers where available:

- using-superpowers
- brainstorming only to harden task difficulty and execution scope
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

Inspect concrete areas only: agent loop, execution harness, tool result handling, action dispatch, verification, repair, session durability, artifact handling, and result reduction.

## Four Level Introduction Rule

For every capability brought in, evaluate in order:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Behavior-only alignment is allowed only after explaining why the first three are not appropriate. Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Required Unseen Tasks

Create or update:

docs/sprint/controlled-unseen-development-gauntlet.md

Design 3 to 4 unseen realistic development tasks. They must not be recycled from SP044 through SP052.

Each task must combine at least 6 stressors:

- non-obvious owner discovery
- cross-module or cross-file edit dependency
- API or type contract dependent update
- callsite or test impact
- tool failure or stale observation recovery
- runtime action mismatch risk
- targeted verification execution
- failed verification requiring repair
- changed repair strategy
- re-verification of failed changed file
- continuation or pending work recovery
- artifact claim-source-verification evidence
- changed-file accounting and final proof

At least 2 tasks must require multi-file code changes. At least 1 task must include failed verification, repair, and re-verification. At least 1 task must include continuation or artifact evidence. At least 2 tasks must prove execution-boundary behavior, not only proof behavior.

If all tasks pass immediately, harden them in the same goal until execution-boundary behavior is meaningfully stressed.

## Mandatory Execution Behavior

Implement all of these:

1. Runtime action reaches AgentRunner or the concrete execution seam as authority-bearing instruction.
2. Unsafe edit is blocked or redirected when discovery is required.
3. Generic verification is blocked or redirected when targeted verification is required.
4. Repair is redirected to discovery when context is missing.
5. Failed execution produces typed observation with safe failure reason.
6. Typed observation changes the next runtime action.
7. Repaired targets require post-repair verification coverage.
8. Artifact execution requires claim-source-verification evidence when artifact proof is needed.
9. Stop-not-proven is produced when execution cannot safely satisfy runtime action.
10. Evidence/result remains terminal truth owner.

If AgentRunner is only a type boundary, use Serena references to find the closest concrete execution seam and change that seam. This exception must be proven in the coverage table.

## Required Product Owners

At minimum, product changes must include:

- AgentRunner implementation or closest concrete execution seam
- core query runtime
- tools policy or typed tool feedback reducer
- verification or repair owner
- evidence or result only if needed to consume behavior, not as substitute

Changes limited to docs, tests, surface, event projection, evaluation task, liveRun, quality, catalog, scripts, proof boundary, or receipt boundary do not satisfy this goal.

## Required Diagnostics

Create before-failing and after-passing diagnostics for all of these:

1. unseen task where discovery-required runtime action blocks unsafe edit at execution boundary
2. unseen task where targeted verification action blocks generic verification
3. unseen task where missing-context repair redirects to discovery before repair execution
4. unseen task where failed execution creates typed observation and changes next runtime action
5. unseen task where repaired target requires post-repair verification coverage
6. unseen task where metadata-only runtime action is rejected as insufficient execution proof

At least 4 diagnostics must exercise normal QueryEngine plus AgentRunner or the concrete execution seam. Evaluation-only tests do not count.

## Requirement Coverage Table

Final report must include a table with:

- mandatory requirement
- product files changed
- execution path
- diagnostic proving behavior
- why this is not proof-only
- why this is not evaluation-only
- remaining risk

If any row lacks product behavior evidence, do not mark complete.

## Architecture Guardrails

Keep boundaries clean:

- QueryEngine and runQueryLoop own sequencing
- AgentRunner or concrete seam owns execution boundary
- tools policy owns next-action choice
- planning owns action graph and dependent planning
- verification owns target and execution facts
- repair owns repair strategy
- artifacts workflow owns artifact validation
- session replay owns durable input facts
- evidence owns proof normalization
- result owns verdict reduction
- evaluation and live catalog consume product behavior only

Do not create duplicated policy, proof, execution, verification, repair, artifact, continuation, or live acceptance paths.

## Hard Completion Gates

This task is not complete until all gates pass:

1. 3 to 4 unseen realistic tasks are created and difficulty-reviewed
2. tasks are not recycled from SP044 through SP052
3. execution boundary behavior changes in product code
4. all mandatory execution behaviors are implemented
5. all six required diagnostics pass after failing before changes
6. at least 4 diagnostics exercise normal QueryEngine plus execution seam
7. at least 2 multi-file tasks complete
8. at least 1 failed verification repair task completes after re-verification
9. at least 1 continuation or artifact task completes with proof
10. requirement coverage table is complete
11. SP044 through SP052 regressions still pass
12. build passes
13. result truthfulness gate passes
14. anti-false-success gate passes
15. external live catalog passes after product changes
16. live acceptance shows manualCorrectionCount 0
17. write tasks include reviewed isolated apply and post-apply verification
18. debug repair complete is true
19. primary success, fallback skipped on primary success, and forced primary failure fallback pass through shared runtime
20. task proof, verification, repair status, artifact validation, changed-file accounting, and result verdict are reported

Not complete:

- no execution boundary behavior change
- proof-only or receipt-only work
- metadata-only behavior
- evaluation-only behavior
- catalog or profile work
- fallback-only work
- surface or event only
- recycled tasks only
- tests without normal execution behavior
- shallow task design
- duplicated policy or proof paths
- stopping because implementation is difficult

## Blocked Rule

Do not use temporary stop language.

If product implementation, non-live validation, SP044 through SP052 regressions, build, truthfulness gates, anti-false-success gates, and diff checks pass, but live acceptance fails only because of provider-network, provider-config, provider-auth, or provider-unreachable, set the goal status to blocked.

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

Do not stop because task design is hard, owner discovery is hard, diagnostics fail, implementation is hard, validation fails, source shape differs, review is slow, or live output is noisy.

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

- unseen execution tasks before and after changes
- required execution-boundary diagnostics
- focused tests for changed owners
- SP044 through SP052 regression suites
- build when needed
- result truthfulness gate
- anti-false-success gate
- external live catalog after product changes
- diff checks

Classify provider or fallback failures separately from product runtime failures.

## Final Report

Report:

- unseen tasks and difficulty review
- initial weak phases
- execution seam changed
- requirement coverage table
- diagnostics before and after
- product changes by owner
- mature source areas inspected
- four-level introduction decisions
- architecture guardrail status
- SP044 through SP052 regression outcomes
- live acceptance or blocked details
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
