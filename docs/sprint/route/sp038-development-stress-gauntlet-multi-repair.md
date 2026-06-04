# SP038 Development Stress Gauntlet Multi Repair

## Goal

Stress the autonomous development controller and upgrade it for harder real development tasks.

The previous sprint connected action graph execution and repair apply. This sprint must prove and improve the loop under harder conditions:

- multi-step development tasks
- cross-file dependency edits
- context re-narrowing after ambiguity
- multi-repair retry after repeated verification failure
- artifact or report content validation
- live acceptance after product changes

Live provider is an acceptance standard, not the primary discovery mechanism.

## Required Inputs

Use the local playbook first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then read only matching source files for the capability areas being implemented.

Use the mature source only after target owner inspection and playbook navigation:

/home/wang/projects/pi

Use it for concrete patterns around controller loops, retry planning, repair iteration, context/session continuation, tool observations, verification, and result reduction.

## Required Capability Upgrade

Implement stronger task-solving behavior, not more projections.

Required improvements must include:

- context re-narrowing after ambiguous or insufficient discovery
- action graph update after new context or verification feedback
- multi-file dependency execution with changed-file accounting
- verification selection from task intent, changed files, and failure history
- bounded multi-repair loop using verification failure output
- re-verification after each repair attempt
- artifact or report content validation beyond file existence

At least 4 core owners must change. At least 3 must be from context, planning, edit, verification, repair, task loop, tools, or session continuation.

## Required Stress Diagnostics

Create or strengthen at least 6 diagnostics.

At least 5 must test task-solving power, not only truthfulness.

Required diagnostics:

1. ambiguous context triggers additional discovery and refined owner confidence
2. action graph updates after context re-narrowing
3. cross-file dependency edit executes source and dependent target changes in order
4. changed-file accounting survives multi-file execution and verification
5. failed verification produces first repair, failed first repair produces second repair, and final re-verification passes
6. artifact or report validation checks required content, source receipts, and verification evidence

At least 4 diagnostics must improve after product code changes.

If initial diagnostics all pass, harden them until a real weakness appears.

## Four Level Introduction Rule

When bringing capability into this project, use this order:

1. dependency use: use an existing package or stable API when safe and compatible
2. structured port: port the design shape into current owner domains with target naming and contracts
3. isolated source adoption: adapt a small isolated implementation unit only when safe, licensed, and compatible with target ownership
4. behavior-only alignment: reproduce behavior only after explaining why the first three levels are not appropriate

For each migrated capability, explicitly evaluate dependency use, structured port, and isolated source adoption before choosing behavior-only alignment.

Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Hard Completion Gates

This task is not complete until all gates pass:

1. at least 6 capability areas diagnosed
2. at least 4 weak areas improved by product code changes
3. at least 6 diagnostics created or strengthened
4. at least 5 diagnostics test task-solving power
5. at least 4 diagnostics improve after code changes
6. at least 4 core product owners changed
7. at least 1 context re-narrowing improvement
8. at least 1 action graph update-after-feedback improvement
9. at least 1 cross-file dependency edit executes with changed-file accounting
10. at least 1 bounded multi-repair flow reaches second repair and final re-verification
11. at least 1 artifact or report content validation improvement
12. external live catalog passes after product changes
13. at least 2 write tasks complete with reviewed isolated apply and post-apply verification
14. at least 1 debug repair task complete
15. primary success, fallback skipped on primary success, and forced primary failure fallback all pass through shared runtime
16. manual correction count is 0 for counted complete tasks
17. task proof, verification, repair status, artifact validation, changed-file accounting, and result verdict are reported

Not complete:

- model or projection only
- single repair only
- truthfulness only
- diagnosis only
- docs only
- validation replay only
- live provider smoke only
- catalog or profile work only
- fallback work only
- changes limited to evidence, result, presentation, evaluation task, catalog, quality, liveRun, thin scripts, docs, or tests
- orchestration-only behavior growth
- partial outcomes without safety, credential, provider, or isolated workspace blocker

## Blocker Policy

Ordinary technical blockers are work items, not stopping points.

Do not stop because owner discovery is hard, diagnostics fail, patch fails, repair fails, validation fails, mature source shape differs, or live output is noisy.

Allowed stop conditions only:

- safety boundary would be violated
- required credential or explicit provider opt-in is unavailable
- provider remains unreachable after explicit opt-in
- isolated workspace cannot be created safely
- user authorization is required for a write this task cannot authorize

## Architecture Rules

Deterministic, diagnostic, and live product behavior must share runtime owners wherever behavior is product behavior.

Scripts must stay thin callers.

Product behavior belongs in rightful owner domains.

Do not add behavior to compatibility shims.

During development, product file names and product content must not contain process wording, comparison wording, reading-process wording, or names of outside codebases. Use domain language only.

## Truthfulness And Safety

Evidence/result owns terminal truth.

Do not claim success from provider output, tool execution, dry-run, apply, status, host output, artifact existence, event emission, presentation, profile inclusion, or quality counter.

Protect raw provider output, patch body, tokens, headers, secrets, private paths, and hidden reasoning.

Do not manually read or print files under /home/wang/.private-agents-real.

Live provider use must be explicit opt-in and isolated.

## Required Tools

Use Serena MCP for owner discovery, symbol navigation, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and execution discipline.

Use parallel subagents for target owner inspection, playbook navigation, mature source inspection, stress diagnostic design, multi-repair loop implementation, artifact validation, and final validation.

## Validation

Run:

- before and after stress diagnostics
- focused tests for every changed owner
- build when imports, contracts, or runtime-facing code change
- result truthfulness gates when proof, verdict, status, or completion logic changes
- anti-false-success gates when completion logic changes
- external live catalog after product changes
- diff checks

Classify provider or fallback failures separately from product runtime failures.

## Final Report

Report:

- capability areas diagnosed
- weak areas improved
- playbook files used
- mature source areas inspected
- introduction level per capability
- diagnostics before and after
- product code changes by owner
- context re-narrowing behavior
- action graph update behavior
- multi-file dependency execution
- multi-repair and re-verification behavior
- artifact content validation behavior
- live acceptance results
- provider or fallback failure classification if any
- write, debug, fallback results
- manual correction count
- changed-file accounting
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
