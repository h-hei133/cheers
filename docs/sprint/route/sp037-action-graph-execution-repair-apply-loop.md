# SP037 Action Graph Execution Repair Apply Loop

## Goal

Turn the development controller output into an executable autonomous development loop.

The previous sprint connected context, planning, verification, repair, and orchestration into a controller path. This task must go further: action graph output must drive next actions, and repair diagnosis output must drive a real repair apply and re-verification chain.

Target path:

ambiguous context narrowing
-> discovery or owner selection action
-> dependency ordered action graph
-> edit or tool action execution
-> targeted verification
-> failure diagnosis
-> repair patch intent
-> reviewed isolated apply
-> re-verification
-> task proof and result verdict

Live provider remains an acceptance standard, not the main discovery mechanism.

## Required Inputs

Use the local playbook first:

/home/wang/projects/pi-docs-playbook

Read:

- README.md
- AGENTS.md
- usage/task-reading-matrix.md

Then read matching source files for the capability areas being implemented.

Use the mature source only after target owner inspection and playbook navigation:

/home/wang/projects/pi

Use it for concrete execution loop, action dispatch, repair retry, tool observation, verification, session durability, and result reduction patterns.

## Required Capability Upgrade

Implement a connected execution loop, not another model or projection.

Required improvements:

- action graph can produce a runtime next action
- owner narrowing can produce additional discovery or a selected owner action
- dependency ordered graph can drive at least one edit or tool action path
- changed-file intent can drive verification choice
- verification failure output can drive diagnosis
- diagnosis can produce repair patch intent or repair action
- repair action can enter reviewed isolated apply when allowed
- post-repair verification can update proof and verdict
- incomplete repair chain remains not proven

At least 4 core owners must change. At least 3 must be from context, planning, edit, verification, repair, task loop, tools, or session continuation.

Do not place durable behavior in broad orchestration. If existing orchestration code must be touched, keep it as wiring and move decision logic into rightful owners.

## Required Diagnostics

Create or strengthen at least 5 diagnostics.

At least 4 must test task-solving execution, not only truthfulness.

Required diagnostics:

1. ranked owner narrowing produces a discovery or owner selection next action
2. action graph drives a dependency ordered edit or tool action
3. multi-file graph preserves dependency reason and changed-file accounting through execution
4. verification selection follows changed-file intent after graph execution
5. failed verification produces diagnosis, repair action, reviewed apply eligibility, and re-verification

At least 3 diagnostics must improve after product code changes.

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
3. at least 5 diagnostics created or strengthened
4. at least 4 diagnostics test execution power
5. at least 3 diagnostics improve after code changes
6. at least 4 core product owners changed
7. action graph drives at least one runtime next action
8. owner narrowing drives discovery or owner selection
9. at least 1 multi-file action graph executes with dependency and changed-file accounting preserved
10. at least 1 failed-check flow reaches diagnosis, repair action, reviewed apply eligibility, re-verification, and updated proof
11. repair apply without re-verification remains not proven
12. external live catalog passes after product changes
13. at least 2 write tasks complete with reviewed isolated apply and post-apply verification
14. at least 1 debug repair task complete
15. primary success, fallback skipped on primary success, and forced primary failure fallback all pass through shared runtime
16. manual correction count is 0 for counted complete tasks
17. task proof, verification, repair status, artifact validation, changed-file accounting, and result verdict are reported

Not complete:

- action graph projection only
- repair recommendation only
- proof integrity only
- false-success prevention only
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

Use parallel subagents for target owner inspection, playbook navigation, mature source inspection, diagnostic design, action execution, repair loop implementation, and validation.

## Validation

Run:

- before and after diagnostics
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
- action graph execution behavior
- repair apply and re-verification behavior
- orchestration logic kept thin or moved
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
