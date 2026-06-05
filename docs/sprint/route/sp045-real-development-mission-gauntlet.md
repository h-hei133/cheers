# SP045 Real Development Mission Gauntlet

## Goal

Force the normal runtime to solve harder real development missions.

SP044 proved important truth and proof boundaries. SP045 must go beyond proof safety. It must prove and improve actual autonomous development ability: discover context, select owners, plan executable work, edit multiple related files, run relevant verification, diagnose failure, repair with a changed strategy, validate artifact content, resume pending work, and produce task proof.

This is a convergence sprint. Do not deliver another narrow component tweak.

## Required Tool Discipline

Use Serena MCP for semantic owner discovery, symbol navigation, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and execution discipline.

Use Superpowers skills where available:

- using-superpowers to choose relevant skills
- systematic-debugging for root cause and failed mission analysis
- test-driven-development for mission diagnostics
- verification-before-completion before any completion claim
- dispatching-parallel-agents and subagent-driven-development for focused owner audits
- requesting-code-review or receiving-code-review before final commit

Do not let any tool create process bloat, extra process documents, or a stopping excuse.

## Required Inputs

Use the local navigation project first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then only matching source files.

Use the mature local source only after target owner inspection and navigation:

/home/wang/projects/pi

Use it for main loop, action dispatch, tool feedback, session durability, repair strategy, verification, artifact handling, and result reduction.

## Four Level Introduction Rule

For each capability brought into this project, use this order:

1. dependency use: use an existing package or stable API when safe and compatible
2. structured port: port the design shape into current owner domains with target naming and contracts
3. isolated source adoption: adapt a small isolated implementation unit only when safe, licensed, and compatible with target ownership
4. behavior-only alignment: reproduce behavior only after explaining why the first three levels are not appropriate

Explicitly evaluate the first three levels before behavior-only alignment.

Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Required Real Development Missions

Create or update a real development mission pack under docs/sprint.

The pack must contain at least 8 hard missions. Existing live catalog entries and SP044 missions may be used as baseline context, but they do not count as SP045 missions.

Required mission categories:

1. cross-module feature requiring source change plus callsite or dependent target update
2. test-impact task requiring source change plus targeted test selection
3. failed test repair requiring at least two repair decisions or a changed repair strategy
4. ambiguous owner task requiring additional discovery before edit
5. API or type contract change requiring dependent update
6. artifact or report task requiring semantic claim-evidence consistency
7. continuation task requiring pending work restoration and completion
8. tool failure task requiring safe recovery and no terminal success claim

At least 6 missions must exercise normal runtime behavior outside evaluation-only paths.

## Required Process

Run the mission pack before product changes.

For each weak mission, record:

- weak phase
- owner domain responsible
- missing runtime behavior
- whether the gap is context, plan, dispatch, tool, edit, verification, repair, artifact, continuation, proof, or result
- mature capability area inspected
- four-level introduction decision

Then implement product changes in core owners.

Rerun the same mission pack after changes. Do not replace failed missions with easier missions.

## Required Capability Upgrade

This task must improve real task execution, not only proof safety.

Required improvements must cover at least 6 areas:

- context discovery and owner selection
- executable planning
- action dispatch or tool feedback
- cross-file edit dependency
- verification selection and execution
- failure diagnosis
- multi-step repair strategy
- artifact semantic validation
- continuation pending work restoration
- task proof and result reduction

At least 7 core owners must change. At least 5 must be from runtime, tools, context, planning, edit, verification, repair, artifacts, session continuation, evidence, or result.

Changes limited to evidence, result, artifact proof boundary, evaluation task, liveRun, quality, catalog, thin scripts, docs, tests, surface, or projection do not satisfy this task.

## Hard Completion Gates

This task is not complete until all gates pass:

1. real development mission pack exists under docs/sprint
2. initial mission run records real weaknesses
3. at least 8 missions run before and after product changes
4. at least 6 missions exercise non-evaluation normal runtime behavior
5. at least 5 missions improve after product changes
6. at least 4 missions complete after product changes
7. at least 2 cross-module or multi-file missions complete with changed-file accounting
8. at least 1 failed test mission completes through repair and re-verification
9. at least 1 repeated repair mission changes strategy or requests discovery
10. at least 1 continuation mission restores pending action and completes
11. at least 1 artifact mission validates semantic claim-evidence consistency
12. normal runtime feedback updates next action and task proof
13. stop-not-proven cannot become terminal success
14. external live catalog passes after product changes
15. live acceptance shows manualCorrectionCount 0
16. write tasks include reviewed isolated apply and post-apply verification
17. debug repair complete is true
18. primary success, fallback skipped on primary success, and forced primary failure fallback pass through shared runtime
19. task proof, verification, repair status, artifact validation, changed-file accounting, and result verdict are reported

Not complete:

- proof safety only
- diagnostics only
- docs only
- metrics only
- evaluation-only behavior
- projection-only behavior
- surface-only behavior
- catalog or profile work
- fallback-only work
- tests without real normal runtime mission behavior
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

Do not stop because owner discovery is hard, missions fail, implementation is hard, patch fails, repair fails, validation fails, mission wiring is hard, source shape differs, or live output is noisy.

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

- before and after real development missions
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

- real development missions created or updated
- initial weaknesses
- same mission rerun outcomes
- improvement count and complete count
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
