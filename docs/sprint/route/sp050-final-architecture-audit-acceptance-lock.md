# SP050 Final Architecture Audit Acceptance Lock

## Goal

Perform final architecture audit and acceptance lock for the autonomous development lane.

SP049 closed the ranked remaining gaps. This goal must verify that the closure did not create new policy, proof, runtime, continuation, artifact, verification, or live acceptance debt. Do not add new broad capability. Only fix high-impact boundary or acceptance issues found by audit.

The purpose is to lock a clean, maintainable, verifiable mainline.

## Required Tool Discipline

Use Serena MCP for semantic owner discovery, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and execution discipline.

Use Superpowers where available:

- using-superpowers to select relevant skills
- systematic-debugging for audit findings and root cause analysis
- verification-before-completion before any completion claim
- dispatching-parallel-agents and subagent-driven-development for independent owner audits
- requesting-code-review or receiving-code-review before final closeout

Do not let any tool create process bloat, extra documents, or stopping excuses.

## Required Inputs

Use these sprint records as active evidence:

- docs/sprint/hard-mission-gauntlet.md
- docs/sprint/real-development-mission-pack.md
- docs/sprint/final-development-acceptance-record.md
- docs/sprint/final-real-task-trial.md
- docs/sprint/final-gap-closure-record.md
- docs/sprint/development-capability-catalog.json

Use the local navigation project first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then only matching source files.

Use the mature local source only after target owner inspection and navigation:

/home/wang/projects/pi

Use it only for concrete patterns around main loop boundary, action dispatch, durable replay, verification graph ownership, artifact evidence, result reduction, and review discipline.

## Four Level Introduction Rule

For each capability or pattern brought into this project, use this order:

1. dependency use: use an existing package or stable API when safe and compatible
2. structured port: port the design shape into current owner domains with target naming and contracts
3. isolated source adoption: adapt a small isolated implementation unit only when safe, licensed, and compatible with target ownership
4. behavior-only alignment: reproduce behavior only after explaining why the first three levels are not appropriate

Explicitly evaluate the first three levels before behavior-only alignment.

Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Required Audit Areas

Audit at least 10 areas:

1. QueryEngine and runQueryLoop remain loop and wiring owners
2. AgentRunner remains execution boundary
3. tools/policy remains the primary action policy owner
4. planning/action owns dependent graph facts
5. verification consumes dependent graph facts without owning task verdict
6. session/replay owns durable replay input facts without creating success
7. artifacts/workflow owns artifact claim validation
8. evidence/task owns proof normalization
9. result/task owns verdict reduction
10. runtime/evaluation/task consumes product owner behavior and does not keep a competing copy
11. live catalog remains acceptance only
12. transition cycle control is bounded without blocking legitimate multi-step work

## Required Product Fix Policy

This goal may fix only high-impact audit findings.

Allowed fixes:

- remove duplicated policy, proof, verification, artifact, continuation, or result behavior
- move behavior back to rightful owner
- strengthen tests proving a boundary
- connect an existing owner projection to the normal runtime or evaluation consumer
- repair a regression in SP044, SP045, SP047, SP048, or SP049 acceptance

Not allowed:

- new broad mission pack
- new live catalog behavior
- new quality counter
- proof-only expansion that hides an owner behavior gap
- behavior added only to evaluation or live acceptance
- broad rewrite without an audit finding

At least 3 concrete audit findings must be recorded. If no product fixes are needed, each no-fix closure must be backed by diagnostics and owner evidence.

## Required Audit Record

Create or update:

docs/sprint/final-architecture-audit-record.md

For each audit area, record:

- owner inspected
- current boundary
- risk found or no-risk evidence
- product fix if any
- diagnostic or regression command
- remaining risk
- closure status

## Hard Completion Gates

This task is not complete until all gates pass:

1. final architecture audit record exists under docs/sprint
2. at least 10 audit areas are covered
3. at least 3 concrete audit findings are recorded
4. every finding has product fix or diagnostic-backed no-fix closure
5. no duplicated policy, proof, result, verification, artifact, continuation, or live acceptance product path remains unresolved
6. QueryEngine, AgentRunner, tools/policy, planning, verification, session/replay, artifacts, evidence, result, evaluation, and live boundaries are recorded
7. SP044 hard mission gauntlet still passes
8. SP045 real development mission pack still passes
9. SP047 final acceptance still passes
10. SP048 final real task trial still passes
11. SP049 gap closure diagnostics still pass
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

- pure docs without audit evidence
- pure cleanup without regression proof
- new feature work not tied to audit finding
- evaluation-only behavior
- catalog or profile work
- fallback-only work
- proof boundary only
- unresolved duplicated paths
- stopping because audit is hard

## Blocked Rule

Do not use temporary stop language.

If product implementation, audit diagnostics, SP044, SP045, SP047, SP048, SP049, build, truthfulness gates, anti-false-success gates, and diff checks pass, but live acceptance fails only because of provider-network, provider-config, provider-auth, or provider-unreachable, set the goal status to blocked.

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

Do not stop because owner discovery is hard, audit is hard, diagnostics fail, implementation is hard, validation fails, source shape differs, review sidecar is slow, or live output is noisy.

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

- architecture audit diagnostics
- SP044 hard mission gauntlet
- SP045 real development mission pack
- SP047 final acceptance
- SP048 final real task trial
- SP049 gap closure diagnostics
- focused tests for changed owners
- build when needed
- result truthfulness gate
- anti-false-success gate
- external live catalog after product changes
- diff checks

Classify provider or fallback failures separately from product runtime failures.

## Final Report

Report:

- audit areas covered
- concrete findings
- product fixes or no-fix closures
- owner boundaries after audit
- duplicated paths removed or proven absent
- Superpowers skills used
- playbook files used
- mature source areas inspected
- introduction level per capability
- SP044, SP045, SP047, SP048, SP049 rerun outcomes
- live acceptance or blocked details
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
