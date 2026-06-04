# SP035 Autonomous Development Power Transplant

## Goal

Aggressively improve autonomous development task-solving power.

This task must move beyond proof integrity and false-success prevention. It must improve the system's ability to solve development tasks: find context, choose owners, build executable plans, edit safely, coordinate multiple files, select verification, and repair after failed checks.

Live provider is an acceptance standard, not the primary discovery mechanism.

## Required Inputs

Use the local navigation playbook first:

/home/wang/projects/pi-docs-playbook

Read:

- README.md
- AGENTS.md
- usage/task-reading-matrix.md

Then read matching source files for the capability areas being implemented.

Use mature source only after target owner inspection and playbook navigation:

/home/wang/projects/pi

Use it for concrete lifecycle, context, planning, action loop, edit, verification, repair, session, tool, and result patterns.

## Required Capability Targets

Diagnose at least 6 areas and improve at least 4 weak areas.

Required areas:

- context discovery and owner narrowing
- executable planning and action sequencing
- edit strategy and patch construction
- multi-file coordination
- verification selection
- repair retry using verification failure output

Optional additional areas:

- continuation and resume
- task loop control
- tool result to next action
- artifact content validation
- changed-file accounting
- source receipt quality

## Required Diagnostics

Create or strengthen at least 5 adversarial or failure-injection diagnostics.

At least 4 diagnostics must be task-solving diagnostics, not only truthfulness diagnostics.

Required diagnostic types:

- ambiguous context or non-obvious owner selection
- multi-step executable planning
- multi-file edit dependency
- relevant verification selection
- failed-check repair retry using failure output

Each diagnostic must include:

- expected weak phase
- owner domain responsible
- before result
- product code change
- after result

At least 3 diagnostics must improve from failed or weak to passed or strong after code changes.

If all diagnostics pass initially, make them harder until real weakness appears.

## Required Product Changes

Product code changes must touch at least 4 core capability owners.

At least 3 of these owners must be from:

- context
- planning
- edit
- verification
- repair
- tools
- task loop
- session continuation

Changes limited to evidence, result, presentation, evaluation task, catalog, quality, liveRun, thin scripts, docs, or tests do not satisfy this task.

Do not stop at diagnosis. Failures are implementation targets.

## Four Level Introduction Rule

When bringing capability into this project, use this order:

1. dependency use: use an existing package or stable API when safe and compatible
2. structured port: port the design shape into current owner domains with target naming and contracts
3. isolated source adoption: adapt a small isolated implementation unit only when safe, licensed, and compatible with target ownership
4. behavior-only alignment: reproduce behavior only after explaining why the first three levels are not appropriate

For each migrated capability, explicitly evaluate the first three levels before choosing behavior-only alignment.

Prefer structured port or isolated source adoption for real missing behavior.

Do not mechanically copy implementation code, names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Hard Completion Gates

This task is not complete until all gates pass:

1. at least 6 capability areas diagnosed
2. at least 4 weak areas improved by product code changes
3. at least 5 adversarial or failure-injection diagnostics created or strengthened
4. at least 4 diagnostics are task-solving diagnostics
5. at least 3 diagnostics improve after code changes
6. at least 4 core capability owners changed
7. at least 1 multi-file edit capability improves
8. at least 1 repair retry using verification failure output improves
9. at least 1 verification selection capability improves
10. external live catalog passes after product changes
11. at least 2 write tasks complete with reviewed isolated apply and post-apply verification
12. at least 1 debug repair task complete
13. primary success, fallback skipped on primary success, and forced primary failure fallback pass through shared runtime
14. manual correction count is 0 for counted complete tasks
15. changed-file accounting is reported
16. task proof, verification, repair status, artifact validation, and result verdict are reported

Not complete:

- proof integrity only
- false-success prevention only
- diagnosis only
- docs only
- validation replay only
- live provider smoke only
- catalog or profile work only
- fallback work only
- changes limited to evaluation or surface owners
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

Use parallel subagents for target owner inspection, playbook navigation, mature source inspection, diagnostic design, code transplant, and validation.

## Validation

Run:

- before and after diagnostics
- focused tests for every changed owner
- build when imports, contracts, or runtime-facing code change
- result truthfulness gates when proof, verdict, status, or completion logic changes
- anti-false-success gates when completion logic changes
- external live catalog after product changes
- diff checks

## Final Report

Report:

- capability areas diagnosed
- weak areas improved
- playbook files used
- mature source areas inspected
- introduction level per capability
- diagnostics before and after
- product code changes by owner
- live acceptance results
- write, debug, fallback results
- manual correction count
- changed-file accounting
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
