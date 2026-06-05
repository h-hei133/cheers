# SP046 Mainline Consolidation Debt Collapse

## Goal

Collapse architecture debt created during the fast autonomous development push while preserving and strengthening the normal runtime mission lane.

This is not a slowdown task. It is a convergence task. The goal is to make the current autonomous development ability durable, maintainable, and harder to regress.

The system already has adaptive dispatch, observation feedback, runtime task proof, hard missions, real development missions, live acceptance, reviewed apply, and truth gates. This sprint must remove dangerous duplication and unclear owner boundaries before the next capability push.

## Required Tool Discipline

Use Serena MCP for owner discovery, symbol navigation, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and execution discipline.

Use Superpowers where available:

- using-superpowers to select relevant skills
- systematic-debugging for boundary and duplication root cause analysis
- test-driven-development for regression diagnostics
- verification-before-completion before any completion claim
- dispatching-parallel-agents and subagent-driven-development for focused owner audits
- requesting-code-review or receiving-code-review before final commit

Do not let any tool create process bloat, extra process documents, or a stopping excuse.

## Required Inputs

Use these existing sprint documents as active evidence:

- docs/sprint/hard-mission-gauntlet.md
- docs/sprint/real-development-mission-pack.md
- docs/sprint/development-capability-catalog.json

Use the local navigation project first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then only matching source files.

Use the mature local source only after target owner inspection and navigation:

/home/wang/projects/pi

Use it for main loop, action dispatch, tool feedback, session durability, retry policy, verification, artifact handling, and result reduction patterns.

## Four Level Introduction Rule

For each capability brought into this project, use this order:

1. dependency use: use an existing package or stable API when safe and compatible
2. structured port: port the design shape into current owner domains with target naming and contracts
3. isolated source adoption: adapt a small isolated implementation unit only when safe, licensed, and compatible with target ownership
4. behavior-only alignment: reproduce behavior only after explaining why the first three levels are not appropriate

Explicitly evaluate the first three levels before behavior-only alignment.

Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Required Consolidation Areas

Audit and improve at least 7 areas:

- adaptive policy source of truth
- runtime observation ownership
- normal runtime versus evaluation runtime behavior sharing
- QueryEngine and AgentRunner responsibility boundary
- tool strategy versus repair strategy boundary
- verification execution versus verification proof boundary
- artifact workflow versus artifact proof boundary
- session continuation pending action ownership
- evidence task proof versus result verdict ownership
- live catalog as acceptance layer only

## Required Product Changes

Implement product changes that remove duplication or boundary ambiguity.

Required improvements:

- adaptive decision logic has one primary owner or a clearly documented thin adapter
- evaluation runtime consumes product behavior rather than maintaining a competing copy
- live catalog remains an acceptance consumer, not a product behavior owner
- QueryEngine remains loop and wiring, not the durable decision owner for every domain
- AgentRunner remains execution boundary and consumes runtime action without owning policy truth
- runtime observations remain observations or proof candidates, not verdict owners
- evidence owns proof normalization and result owns verdict reduction
- repair, verification, artifact, continuation, and tool policy keep domain-specific decisions in rightful owners
- RD-05 style dependent update graph is connected to the normal runtime lane or explicitly proven through the owner consumed by that lane

At least 5 product fixes are required. At least 4 core owners must change. At least 3 changed owners must be from runtime, tools, planning, verification, repair, artifacts, session continuation, evidence, or result.

Changes limited to docs, tests, surface, presentation, evaluation task, liveRun, quality, catalog, or scripts do not satisfy this task.

## Required Debt Diagnostics

Create or strengthen at least 8 diagnostics.

Required diagnostics:

1. adaptive policy has no competing product decision fork
2. evaluation path and normal runtime share product policy behavior
3. runtime observation cannot become terminal success
4. evidence proof and result verdict stay separate
5. artifact validation cannot bypass claim-evidence proof
6. repair strategy and tool strategy do not duplicate conflicting retry decisions
7. continuation pending action is restored by one owner and consumed by runtime decision
8. dependent update graph feeds normal runtime mission behavior or owner-consumed behavior without a detached path

At least 6 diagnostics must pass because of product changes or new regression coverage.

## Hard Completion Gates

This task is not complete until all gates pass:

1. at least 7 consolidation areas audited
2. at least 5 product fixes implemented
3. at least 4 core product owners changed
4. at least 8 debt diagnostics created or strengthened
5. at least 6 diagnostics prove boundary consolidation
6. SP044 hard mission gauntlet still passes
7. SP045 real development mission pack still passes
8. normal runtime mission tests still pass
9. result truthfulness gate passes
10. anti-false-success gate passes
11. build passes
12. external live catalog passes after product changes
13. live acceptance shows manualCorrectionCount 0
14. write tasks include reviewed isolated apply and post-apply verification
15. debug repair complete is true
16. primary success, fallback skipped on primary success, and forced primary failure fallback pass through shared runtime
17. task proof, verification, repair status, artifact validation, changed-file accounting, and result verdict are reported

Not complete:

- docs only
- diagnostics only
- metrics only
- surface only
- evaluation-only behavior
- catalog or profile work
- fallback-only work
- proof boundary only
- tests without product boundary consolidation
- duplicated policy paths left unresolved
- stopping because cleanup is hard

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

Do not stop because owner discovery is hard, diagnostics fail, cleanup is hard, validation fails, source shape differs, or live output is noisy.

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

- consolidation diagnostics
- SP044 hard mission gauntlet
- SP045 real development mission pack
- focused tests for every changed owner
- normal runtime mission tests
- build when imports, contracts, or runtime-facing code change
- result truthfulness gate
- anti-false-success gate
- external live catalog after product changes
- diff checks

Classify provider or fallback failures separately from product runtime failures.

## Final Report

Report:

- consolidation areas audited
- product fixes implemented
- duplicated or risky paths removed
- owner boundaries after consolidation
- Superpowers skills used
- playbook files used
- mature source areas inspected
- introduction level per capability
- diagnostics added or strengthened
- SP044 and SP045 rerun outcomes
- live acceptance or blocked details
- provider or fallback failure classification if any
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
