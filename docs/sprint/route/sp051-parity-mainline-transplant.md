# SP051 Parity Mainline Transplant

## Goal

Push autonomous development ability toward top-tier behavior in one high-value sprint.

This is not a closeout sprint. This is not an acceptance-matrix sprint. Use the remaining budget to transplant stronger mainline development behavior into this project and prove it with unseen realistic development tasks.

The target is a stronger normal runtime lane:

task intake
-> context discovery
-> owner selection
-> action planning
-> tool or edit execution
-> typed observation reduction
-> targeted verification
-> repair strategy
-> re-verification
-> continuation or artifact handling
-> task proof
-> result verdict

## Required Tool Discipline

Use Serena MCP for semantic owner discovery, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and execution discipline.

Use Superpowers where available:

- using-superpowers to select skills
- brainstorming only to harden tasks and migration scope
- systematic-debugging for root cause analysis
- test-driven-development for unseen task diagnostics
- verification-before-completion before any completion claim
- dispatching-parallel-agents and subagent-driven-development for parallel owner and mature-source audits
- requesting-code-review or receiving-code-review before closeout

Do not let any tool create process bloat, extra documents, or stopping excuses.

## Required Inputs

Use current sprint records as baseline only:

- docs/sprint/hard-mission-gauntlet.md
- docs/sprint/real-development-mission-pack.md
- docs/sprint/final-development-acceptance-record.md
- docs/sprint/final-real-task-trial.md
- docs/sprint/final-gap-closure-record.md
- docs/sprint/final-architecture-audit-record.md

Use the local navigation source first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then only matching source files.

Use the mature local source after target owner inspection:

/home/wang/projects/pi

Inspect concrete areas only: main loop, agent harness, session durability, tool feedback, action dispatch, verification, repair, artifact handling, result reduction, and long-task continuation.

## Four Level Introduction Rule

For each capability brought into this project, use this order:

1. dependency use: use an existing package or stable API when safe and compatible
2. structured port: port the design shape into current owner domains with target naming and contracts
3. isolated source adoption: adapt a small isolated implementation unit only when safe, licensed, and compatible with target ownership
4. behavior-only alignment: reproduce behavior only after explaining why the first three levels are not appropriate

Explicitly evaluate the first three levels before behavior-only alignment.

Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Required Mainline Capability Transplant

Implement at least 4 product-level upgrades from the following areas:

- AgentRunner or execution boundary uses runtime action to constrain or stage actual work, not only metadata
- tool feedback reducer produces typed next-action inputs across failed read, search, edit, verify, artifact, and repair outcomes
- action planning supports dependent multi-file work with verification targets and repair targets
- verification execution proves relevant checks, not only target selection
- repair strategy changes based on failure output and avoids generic retry or generic reverify
- continuation restores durable pending work from replay or persisted facts and resumes execution
- artifact handling binds claims to source and verification receipts beyond shallow presence
- result reduction preserves original failure, repair chain, changed-file accounting, and not-proven claims

Do not implement broad behavior inside live catalog, quality counters, surface, or evaluation-only code.

## Required Unseen Realistic Tasks

Create or update:

docs/sprint/parity-development-trial.md

Design 3 to 4 unseen realistic development tasks. They must be harder than SP048 tasks and must not be recycled from SP044 through SP050.

Each task must combine at least 6 stressors:

- non-obvious owner discovery
- cross-module or cross-file edit dependency
- API or type contract dependent update
- callsite or test impact
- targeted verification execution
- failed verification requiring repair
- changed repair strategy
- tool failure or stale observation recovery
- continuation or pending work recovery
- artifact or report with claim-source-verification evidence
- changed-file accounting and final proof

At least 2 tasks must involve multi-file code changes. At least 1 task must include failed verification plus repair plus re-verification. At least 1 task must include continuation or artifact evidence. At least 1 task must require actual execution-boundary behavior, not only proof logic.

## Required Process

Run the unseen tasks before product changes.

Record for each task:

- initial outcome
- weak phase
- root gap
- owner domain responsible
- mature source area inspected
- introduction decision
- planned product fix

Then implement product changes in rightful owners and rerun the same tasks.

If all tasks pass immediately, harden them in the same goal until at least one meaningful weakness appears or the independent difficulty review proves high confidence acceptance.

## Architecture Guardrails

Keep boundaries clean:

- QueryEngine and runQueryLoop are loop and sequencing owners
- AgentRunner is execution boundary
- tools/policy owns action policy
- planning owns action graph and dependent planning
- verification owns target and execution facts
- repair owns repair strategy
- artifacts/workflow owns artifact validation
- session replay owns durable input facts
- evidence owns proof normalization
- result owns verdict reduction
- evaluation and live catalog consume product behavior only

Do not create duplicated policy, proof, verification, repair, artifact, continuation, or live acceptance paths.

## Hard Completion Gates

This task is not complete until all gates pass:

1. parity development trial record exists under docs/sprint
2. 3 to 4 unseen realistic tasks are designed and difficulty-reviewed
3. tasks are harder than SP048 and not recycled from SP044 through SP050
4. initial run records meaningful weakness or high-confidence hard acceptance
5. at least 4 product-level upgrades are implemented
6. at least 5 core owners change
7. at least 2 multi-file tasks complete after changes
8. at least 1 failed verification repair task completes after re-verification
9. at least 1 continuation or artifact task completes with proof
10. execution-boundary behavior is proven in normal runtime
11. SP044 through SP050 regressions still pass
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

- acceptance matrix only
- cleanup only
- docs only
- proof safety only
- recycled tasks only
- evaluation-only behavior
- catalog or profile work
- fallback-only work
- tests without normal runtime behavior
- shallow task design
- duplicated policy or proof paths
- stopping because implementation is difficult

## Blocked Rule

Do not use temporary stop language.

If product implementation, non-live validation, SP044 through SP050 regressions, build, truthfulness gates, anti-false-success gates, and diff checks pass, but live acceptance fails only because of provider-network, provider-config, provider-auth, or provider-unreachable, set the goal status to blocked.

Blocked is not complete.

When blocked, report:

- exact retest command
- required environment variables
- expected pass fields
- observed provider failure class
- why this is not a product runtime failure
- current git status
- whether product changes are uncommitted

Do not commit or push while blocked unless the user provides passing live evidence and explicitly tells you to continue.

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

- unseen trial before and after product changes
- focused tests for changed owners
- SP044 through SP050 regression suites
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
- mature source areas inspected
- introduction decisions
- product upgrades implemented
- product changes by owner
- tasks completed after changes
- execution-boundary behavior proof
- architecture guardrail status
- regression outcomes
- live acceptance or blocked details
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
