# SP044 Hard Mission Gauntlet Core Transplant

## Goal

Run a convergence sprint for autonomous development ability.

This is not another incremental component sprint. Build and use a hard mission gauntlet to expose real weaknesses in the normal runtime lane, then make core product changes and rerun the same missions to prove improvement.

Target outcome:

hard missions before
-> failure taxonomy
-> mature capability inspection
-> core owner transplant
-> same missions after
-> improved normal runtime completion
-> live acceptance

Live provider is an acceptance standard, not the main discovery mechanism.

## Required Tool Discipline

Use Serena MCP for owner discovery, symbol navigation, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and execution discipline.

Use Superpowers skills where available:

- using-superpowers to choose relevant skills
- dispatching-parallel-agents and subagent-driven-development for focused owner audits
- systematic-debugging for failure taxonomy and root cause analysis
- test-driven-development for mission diagnostics
- verification-before-completion before any completion claim
- requesting-code-review or receiving-code-review before final commit
- using-git-worktrees only if isolation is useful and safe

Do not let any tool create process bloat, extra process documents, or a stopping excuse.

## Required Inputs

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

## Required Hard Missions

Create or update mission material under docs/sprint.

The mission set must contain at least 8 hard missions and must exercise normal runtime behavior outside evaluation-only paths.

Required mission categories:

1. ambiguous owner discovery leading to additional read or search and selected owner
2. cross-module feature with source change plus dependent callsite or test update
3. failed verification requiring diagnosis, repair, and re-verification
4. repeated repair failure requiring changed strategy or new discovery
5. artifact or report requiring claim-evidence consistency
6. continuation after interrupted work restoring pending action
7. tool failure requiring safe next action without success claim
8. proof gap requiring verify or stop-not-proven without terminal success

Do not count existing live catalog entries as the hard mission gauntlet.

## Required Process

Run the hard missions before core capability changes.

For each initial weak mission, record:

- weak phase
- owner domain responsible
- missing runtime behavior
- whether the gap is context, plan, tool, edit, verify, repair, artifact, continuation, proof, or result
- mature capability area to inspect
- four-level introduction decision

Then implement product changes in core owners.

Rerun the same mission set after changes.

The same mission set must show improvement. Adding easier replacement missions does not satisfy the task.

## Required Capability Upgrade

Implement core autonomous development improvements, not only diagnostics.

Required improvements must cover at least 5 of these areas:

- normal runtime action dispatch
- tool or edit observation feedback
- context re-narrowing
- executable planning
- cross-file edit dependency
- targeted verification
- failure diagnosis
- repair retry strategy
- artifact claim-evidence validation
- continuation pending action
- task proof and result reduction

At least 6 core owners must change. At least 5 must be from runtime, tools, context, planning, edit, verification, repair, artifacts, session continuation, evidence, or result.

## Hard Completion Gates

This task is not complete until all gates pass:

1. hard mission gauntlet exists under docs/sprint
2. initial mission run records real weaknesses
3. at least 8 hard missions run before and after product changes
4. at least 6 missions exercise non-evaluation normal runtime behavior
5. at least 5 missions improve after product changes
6. at least 6 core product owners changed
7. at least 1 cross-module mission completes with changed-file accounting
8. at least 1 failed verification mission completes through repair and re-verification
9. at least 1 repeated repair mission changes strategy or requests discovery
10. at least 1 continuation mission restores pending action and completes
11. at least 1 artifact mission validates claim-evidence consistency
12. normal runtime feedback updates next action and task proof
13. stop-not-proven cannot become terminal success
14. external live catalog passes after product changes
15. live acceptance shows manualCorrectionCount 0
16. write tasks include reviewed isolated apply and post-apply verification
17. debug repair complete is true
18. primary success, fallback skipped on primary success, and forced primary failure fallback pass through shared runtime
19. task proof, verification, repair status, artifact validation, changed-file accounting, and result verdict are reported

Not complete:

- diagnostics only
- docs only
- metrics only
- evaluation-only behavior
- projection-only behavior
- surface-only behavior
- catalog or profile work
- fallback-only work
- tests without normal runtime mission behavior
- changes limited to evaluation task, liveRun, quality, catalog, thin scripts, docs, or tests
- duplicated policy paths
- stopping because implementation is difficult

## Blocked Rule

Do not use temporary stop language.

If product implementation, focused tests, build, truthfulness gates, anti-false-success gates, and diff checks pass, but live acceptance fails only because of provider-network, provider-config, provider-auth, or provider-unreachable, mark the goal blocked.

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

Do not stop because owner discovery is hard, diagnostics fail, implementation is hard, patch fails, repair fails, validation fails, mission wiring is hard, source shape differs, or live output is noisy.

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

- before and after hard mission gauntlet
- focused tests for every changed owner
- normal runtime mission tests
- build when imports, contracts, or runtime-facing code change
- result truthfulness gates when proof, verdict, status, or completion logic changes
- anti-false-success gates when completion logic changes
- external live catalog after product changes
- diff checks

Classify provider or fallback failures separately from product runtime failures.

## Final Report

Report:

- hard missions created or updated
- initial weaknesses
- same mission rerun outcomes
- improvement count
- Superpowers skills used
- playbook files used
- mature source areas inspected
- introduction level per capability
- product changes by owner
- normal runtime behavior improved
- cross-module, repair, continuation, and artifact results
- live acceptance or blocked details
- provider or fallback failure classification if any
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
