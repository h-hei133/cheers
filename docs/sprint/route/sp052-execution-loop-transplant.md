# SP052 Execution Loop Transplant

## Goal

Push autonomous development ability toward top-tier behavior by strengthening the execution loop.

This is not a closeout sprint. This is not an acceptance matrix. The goal is to move from diagnostic-driven improvements toward a stronger normal runtime execution loop where runtime action, AgentRunner execution, typed tool feedback, verification execution, repair strategy, re-verification, continuation, artifact proof, task proof, and result verdict form one product mainline.

## Required Tool Discipline

Use Serena MCP for semantic owner discovery, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and execution discipline.

Use Superpowers where available:

- using-superpowers to select skills
- systematic-debugging for root cause analysis
- test-driven-development for execution loop diagnostics
- verification-before-completion before any completion claim
- dispatching-parallel-agents and subagent-driven-development for parallel audits of runtime, execution, verification, repair, and durable session owners
- requesting-code-review or receiving-code-review before closeout

Do not let any tool create process bloat, extra documents, or stopping excuses.

## Required Inputs

Use existing sprint records as baseline evidence only:

- docs/sprint/hard-mission-gauntlet.md
- docs/sprint/real-development-mission-pack.md
- docs/sprint/final-development-acceptance-record.md
- docs/sprint/final-real-task-trial.md
- docs/sprint/final-gap-closure-record.md
- docs/sprint/final-architecture-audit-record.md
- docs/sprint/development-capability-catalog.json

Use the local navigation project first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then only matching source files.

Use the mature local source after target owner inspection:

/home/wang/projects/pi

Inspect concrete areas only: agent loop, harness, session durability, tool result handling, action dispatch, verification, repair, artifact handling, result reduction, and long-task continuation.

## Four Level Introduction Rule

For each capability brought into this project, use this order:

1. dependency use: use an existing package or stable API when safe and compatible
2. structured port: port the design shape into current owner domains with target naming and contracts
3. isolated source adoption: adapt a small isolated implementation unit only when safe, licensed, and compatible with target ownership
4. behavior-only alignment: reproduce behavior only after explaining why the first three levels are not appropriate

Explicitly evaluate the first three levels before behavior-only alignment.

Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Required Capability Upgrade

Implement at least 5 product-level execution loop upgrades.

Required focus areas:

- runtime action constrains or stages AgentRunner work, not only proof metadata
- AgentRunner output is reduced into typed tool feedback with safe failure reasons
- failed read, search, edit, verify, artifact, and repair outcomes drive distinct next-action inputs
- verification execution records command receipts and blocks incomplete changed-target coverage
- repair strategy uses failure output and context quality to choose repair, discovery, targeted verification, or stop-not-proven
- re-verification targets failed changed files and dependent verification targets
- continuation restores durable pending work and feeds execution loop decisions
- artifact proof binds source, verification, changed output, and claim evidence
- result reduction preserves original failure, repair chain, changed-file accounting, and not-proven claims

Do not implement broad behavior inside live catalog, quality counters, surface, presentation, compatibility shims, or evaluation-only code.

## Required Unseen Execution Trials

Create or update:

docs/sprint/execution-loop-trial.md

Design 3 to 4 unseen realistic execution-loop tasks. They must be harder than SP051 diagnostics and must not recycle SP044 through SP051 tasks.

Each task must combine at least 6 stressors:

- non-obvious owner discovery
- cross-module or cross-file edit dependency
- API or type dependent update
- tool failure or stale observation recovery
- targeted verification command execution
- failed verification requiring repair
- changed repair strategy
- re-verification of failed changed file
- continuation or pending work recovery
- artifact claim-source-verification evidence
- changed-file accounting and final proof

At least 2 tasks must prove execution-boundary behavior through AgentRunner or its rightful execution seam. At least 2 tasks must include multi-file changes. At least 1 task must include failed verification, repair, and re-verification. At least 1 task must include continuation or artifact proof.

## Required Process

Run the unseen execution trials before product changes.

For each task, record:

- initial outcome
- weak phase
- root gap
- owner domain responsible
- mature source area inspected
- four-level introduction decision
- planned product fix

Then implement product changes in rightful owners and rerun the same tasks.

If all tasks pass immediately, harden them in the same goal until at least one meaningful weakness appears or independent difficulty review proves high confidence acceptance.

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

Do not create duplicated policy, proof, verification, repair, artifact, continuation, execution, or live acceptance paths.

## Hard Completion Gates

This task is not complete until all gates pass:

1. execution loop trial record exists under docs/sprint
2. 3 to 4 unseen realistic execution-loop tasks are designed and difficulty-reviewed
3. tasks are harder than SP051 and not recycled from SP044 through SP051
4. initial run records meaningful weakness or high-confidence hard acceptance
5. at least 5 product-level execution loop upgrades are implemented
6. at least 5 core owners change
7. at least 2 tasks prove execution-boundary behavior
8. at least 2 multi-file tasks complete after changes
9. at least 1 failed verification repair task completes after re-verification
10. at least 1 continuation or artifact task completes with proof
11. SP044 through SP051 regressions still pass
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

If product implementation, non-live validation, SP044 through SP051 regressions, build, truthfulness gates, anti-false-success gates, and diff checks pass, but live acceptance fails only because of provider-network, provider-config, provider-auth, or provider-unreachable, set the goal status to blocked.

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

- execution-loop trial before and after product changes
- focused tests for changed owners
- SP044 through SP051 regression suites
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
