# SP036 Development Controller Repair Loop

## Goal

Build an aggressive development task controller and repair diagnosis loop.

This task must connect the point improvements from the previous sprint into a stronger autonomous development path:

context discovery
-> owner narrowing
-> executable action graph
-> multi-file edit dependency
-> targeted verification
-> failure diagnosis
-> repair action
-> re-verification
-> task proof

Live provider is an acceptance standard, not the primary discovery mechanism.

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

Use it for concrete controller, context, planning, tool, edit, verification, repair, session, and result lifecycle patterns.

## Required Capability Upgrade

Implement a connected controller path, not isolated rules.

The upgrade must improve at least 4 of these areas:

- ambiguous context recovery through additional discovery
- owner candidate ranking or confidence
- executable action graph with dependencies
- multi-file edit dependency tracking
- verification selection from changed files and task intent
- failure output diagnosis
- repair action generation from diagnosis
- re-verification after repair
- continuation of pending development work

At least 3 improved areas must be from context, planning, edit, verification, repair, task loop, or session continuation.

## Required Diagnostics

Create or strengthen at least 5 diagnostics.

At least 4 must be task-solving diagnostics, not only truthfulness diagnostics.

Required diagnostics:

1. ambiguous context must trigger additional discovery or ranked owner narrowing before final block
2. multi-step task must produce an executable action graph with dependency order
3. multi-file edit must carry dependency reason and changed-file accounting
4. verification must be selected from task intent and changed files, not only broad readiness
5. failed check must produce diagnosis and a repair action using failure output, then re-verify

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
4. at least 4 diagnostics test task-solving power
5. at least 3 diagnostics improve after code changes
6. at least 4 core product owners changed
7. at least 1 ambiguous context recovery improvement
8. at least 1 executable action graph or dependency planning improvement
9. at least 1 multi-file edit dependency improvement
10. at least 1 repair diagnosis and retry improvement
11. at least 1 re-verification after repair improvement
12. external live catalog passes after product changes
13. at least 2 write tasks complete with reviewed isolated apply and post-apply verification
14. at least 1 debug repair task complete
15. primary success, fallback skipped on primary success, and forced primary failure fallback all pass through shared runtime
16. manual correction count is 0 for counted complete tasks
17. changed-file accounting is reported
18. task proof, verification, repair status, artifact validation, and result verdict are reported

Not complete:

- isolated rule tweaks only
- proof integrity only
- false-success prevention only
- diagnosis only
- docs only
- validation replay only
- live provider smoke only
- catalog or profile work only
- fallback work only
- changes limited to evidence, result, presentation, evaluation task, catalog, quality, liveRun, thin scripts, docs, or tests
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

Use parallel subagents for target owner inspection, playbook navigation, mature source inspection, diagnostic design, controller implementation, repair loop implementation, and validation.

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
- controller path implemented
- repair diagnosis and retry behavior
- live acceptance results
- write, debug, fallback results
- manual correction count
- changed-file accounting
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
