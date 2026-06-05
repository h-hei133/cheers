# SP047 Final Development Acceptance Gap Closure

## Goal

Run a final hard acceptance and gap closure sprint for autonomous development ability.

This is not a pure cleanup sprint and not another incremental feature sprint. Use SP044 and SP045 as regression baselines, add a small number of harder composite missions, identify the remaining highest-impact gaps, implement product fixes, and prove the normal runtime can complete harder development work without weakening truthfulness.

## Required Tool Discipline

Use Serena MCP for semantic owner discovery, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and execution discipline.

Use Superpowers where available:

- using-superpowers to choose relevant skills
- systematic-debugging for residual gap root cause
- test-driven-development for hard acceptance diagnostics
- verification-before-completion before any completion claim
- dispatching-parallel-agents and subagent-driven-development for focused owner audits
- requesting-code-review or receiving-code-review before final commit

Do not let any tool create process bloat, extra process documents, or a stopping excuse.

## Required Inputs

Use these existing sprint documents as active regression evidence:

- docs/sprint/hard-mission-gauntlet.md
- docs/sprint/real-development-mission-pack.md
- docs/sprint/development-capability-catalog.json

Use the local navigation project first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then only matching source files.

Use the mature local source only after target owner inspection and navigation:

/home/wang/projects/pi

Use it for main loop, action dispatch, tool feedback, session durability, repair strategy, verification, artifact handling, and result reduction patterns.

## Four Level Introduction Rule

For each capability brought into this project, use this order:

1. dependency use: use an existing package or stable API when safe and compatible
2. structured port: port the design shape into current owner domains with target naming and contracts
3. isolated source adoption: adapt a small isolated implementation unit only when safe, licensed, and compatible with target ownership
4. behavior-only alignment: reproduce behavior only after explaining why the first three levels are not appropriate

Explicitly evaluate the first three levels before behavior-only alignment.

Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Required Acceptance Work

Create or update a final development acceptance record under docs/sprint.

It must include:

- SP044 regression status
- SP045 regression status
- residual gaps found
- harder composite missions added or strengthened
- same-mission before and after outcomes
- product owners changed
- remaining not-proven claims

Add or strengthen at least 4 composite missions. They must combine multiple SP045 categories rather than repeat one narrow proof rule.

Required composite mission types:

1. cross-module feature plus API or type dependent update plus targeted verification
2. failed verification plus changed repair strategy plus re-verification
3. ambiguous owner discovery plus tool failure recovery before edit
4. continuation resume plus pending verification plus artifact or changed-file proof

At least 3 composite missions must exercise normal QueryEngine runtime behavior outside evaluation-only paths.

## Required Gap Closure

Audit the remaining gaps from SP044, SP045, and current product code.

Prioritize:

- owner graph behavior that is not deeply proven through normal runtime
- AgentRunner or tool execution paths that only carry metadata but do not affect action
- verification execution that selects targets but does not prove actual relevant checks
- repair strategy that avoids repetition but does not make useful progress
- artifact semantic validation that checks receipts but not claim consistency
- continuation facts that restore state but do not drive completion
- duplicated policy, proof, or result behavior

Implement at least 3 product fixes. At least 2 must improve real task execution, not only proof safety.

At least 4 core owners must change. At least 3 must be from runtime, tools, context, planning, edit, verification, repair, artifacts, session continuation, evidence, or result.

Changes limited to docs, tests, surface, presentation, evaluation task, liveRun, quality, catalog, scripts, or proof boundary only do not satisfy this task.

## Hard Completion Gates

This task is not complete until all gates pass:

1. SP044 hard mission gauntlet still passes
2. SP045 real development mission pack still passes
3. final acceptance record exists under docs/sprint
4. at least 4 composite missions are added or strengthened
5. at least 3 composite missions exercise non-evaluation normal runtime behavior
6. at least 3 product fixes are implemented
7. at least 2 fixes improve real task execution, not only proof safety
8. at least 4 core product owners changed
9. cross-module plus dependent update plus targeted verification is proven
10. failed verification plus changed repair strategy plus re-verification is proven
11. ambiguous owner plus tool failure recovery before edit is proven
12. continuation resume plus pending verification or artifact proof is proven
13. no duplicated policy, proof, or result path is left unresolved if found
14. stop-not-proven cannot become terminal success
15. result truthfulness gate passes
16. anti-false-success gate passes
17. build passes
18. external live catalog passes after product changes
19. live acceptance shows manualCorrectionCount 0
20. write tasks include reviewed isolated apply and post-apply verification
21. debug repair complete is true
22. primary success, fallback skipped on primary success, and forced primary failure fallback pass through shared runtime
23. task proof, verification, repair status, artifact validation, changed-file accounting, and result verdict are reported

Not complete:

- pure cleanup only
- proof safety only
- docs only
- diagnostics only
- metrics only
- evaluation-only behavior
- projection-only behavior
- catalog or profile work
- fallback-only work
- tests without normal runtime behavior
- duplicated policy paths left unresolved
- stopping because implementation is difficult

## Blocked Rule

Do not use temporary stop language.

If product implementation, focused tests, build, truthfulness gates, anti-false-success gates, SP044, SP045, and diff checks pass, but live acceptance fails only because of provider-network, provider-config, provider-auth, or provider-unreachable, mark the goal blocked.

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

Do not stop because owner discovery is hard, diagnostics fail, cleanup is hard, implementation is hard, validation fails, source shape differs, or live output is noisy.

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

- SP044 hard mission gauntlet
- SP045 real development mission pack
- final composite missions
- focused tests for every changed owner
- build when imports, contracts, or runtime-facing code change
- result truthfulness gate
- anti-false-success gate
- external live catalog after product changes
- diff checks

Classify provider or fallback failures separately from product runtime failures.

## Final Report

Report:

- final acceptance record created or updated
- SP044 and SP045 rerun outcomes
- composite missions and outcomes
- residual gaps found
- product fixes implemented
- real execution improvements versus proof-only changes
- product changes by owner
- Superpowers skills used
- playbook files used
- mature source areas inspected
- introduction level per capability
- live acceptance or blocked details
- provider or fallback failure classification if any
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
