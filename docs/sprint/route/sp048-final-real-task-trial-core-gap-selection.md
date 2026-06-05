# SP048 Final Real Task Trial Core Gap Selection

## Goal

Use 2 to 3 high-difficulty realistic development tasks to identify the last highest-value autonomous development gaps.

This is the first move of the final convergence window. Do not waste it on easy tasks, toy diagnostics, catalog entries, proof-only cases, or another broad test suite. The output must clearly answer which remaining gaps block stronger autonomous development ability.

This task is not complete unless the trial tasks are hard enough to stress normal runtime behavior and produce useful acceptance or gap evidence.

## Required Tool Discipline

Use Serena MCP for semantic owner discovery, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and execution discipline.

Use Superpowers where available:

- using-superpowers to choose relevant skills
- brainstorming only to sharpen task difficulty, not to create process bloat
- systematic-debugging for root-cause analysis
- test-driven-development for trial diagnostics
- verification-before-completion before any completion claim
- dispatching-parallel-agents and subagent-driven-development for independent task-design review and owner audit
- requesting-code-review or receiving-code-review before final closeout

Do not let any tool create extra process documents or stopping excuses.

## Required Inputs

Use these existing sprint documents as baselines:

- docs/sprint/hard-mission-gauntlet.md
- docs/sprint/real-development-mission-pack.md
- docs/sprint/final-development-acceptance-record.md
- docs/sprint/development-capability-catalog.json

Use the local navigation project first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then only matching source files.

Use the mature local source only after target owner inspection and navigation:

/home/wang/projects/pi

Use it for main loop, action dispatch, tool feedback, verification, repair strategy, artifact handling, session durability, and result reduction patterns.

## Four Level Introduction Rule

For each capability brought into this project, use this order:

1. dependency use: use an existing package or stable API when safe and compatible
2. structured port: port the design shape into current owner domains with target naming and contracts
3. isolated source adoption: adapt a small isolated implementation unit only when safe, licensed, and compatible with target ownership
4. behavior-only alignment: reproduce behavior only after explaining why the first three levels are not appropriate

Explicitly evaluate the first three levels before behavior-only alignment.

Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Required Trial Task Design

Create or update:

docs/sprint/final-real-task-trial.md

Design 2 to 3 realistic development tasks. Each task must be composite and harder than SP045 missions.

A task is not acceptable if it is single-file only, path-known, proof-boundary-only, catalog-only, evaluation-only, no-op, or solved by adding metadata.

Each task must include at least 5 of these stressors:

- non-obvious owner discovery
- cross-module or cross-file edit dependency
- API or type contract dependent update
- callsite or test impact
- targeted verification selection
- failed verification requiring repair
- repair strategy change after failure
- artifact or report with semantic claim-evidence consistency
- continuation or pending work recovery
- tool failure or stale observation recovery
- changed-file accounting and final proof

Across the 2 to 3 tasks, all of these must be covered:

- at least 1 cross-module feature with dependent update and targeted verification
- at least 1 failed-check repair with changed strategy and re-verification
- at least 1 continuation or artifact task with semantic evidence
- at least 1 ambiguous owner or tool failure recovery path
- at least 1 normal QueryEngine and AgentRunner path, not evaluation-only

## Required Difficulty Review

Before implementation, perform an explicit difficulty review.

The review must answer:

- why each task is harder than SP045
- why each task cannot be satisfied by proof-only changes
- which normal runtime owners it stresses
- what failure would reveal a real capability gap
- what would count as complete
- what would count as weak or partial
- whether an independent review sidecar or subagent agreed the tasks are hard enough

If all tasks pass immediately, do not declare success unless the difficulty review proves the tasks are genuinely hard. If the tasks are too easy, harden them in the same goal until at least one meaningful gap or high-confidence acceptance result appears.

## Required Execution

Run the trial tasks before product fixes.

For each task, record:

- execution path
- observed outcome
- weak phase if any
- root gap
- owner domain responsible
- whether the gap is context, plan, dispatch, tool, edit, verification, repair, artifact, continuation, proof, or result
- whether the issue is architecture debt or missing capability
- recommended next fix

If a contained high-impact product fix is obvious and safe, implement it in rightful core owners and rerun the same task. Do not spend the entire goal on broad refactors unless the task failure proves the refactor is necessary.

## Hard Completion Gates

This task is not complete until all gates pass:

1. final real task trial document exists under docs/sprint
2. 2 to 3 hard realistic tasks are defined
3. task difficulty review is recorded
4. at least 2 tasks exercise non-evaluation normal runtime behavior
5. at least 1 task exercises cross-module dependent update and targeted verification
6. at least 1 task exercises failed-check repair and re-verification
7. at least 1 task exercises artifact semantic evidence or continuation completion
8. initial trial run records useful acceptance or real gaps
9. remaining highest-value gaps are ranked for the next goal
10. SP044 hard mission gauntlet still passes
11. SP045 real development mission pack still passes
12. SP047 composite acceptance still passes
13. build passes
14. result truthfulness gate passes
15. anti-false-success gate passes
16. external live catalog passes or the goal is marked blocked under the blocked rule
17. diff checks pass

Not complete:

- easy tasks
- proof-only tasks
- docs only
- diagnostics without difficulty review
- evaluation-only behavior
- catalog or profile work
- fallback-only work
- tests without normal runtime behavior
- stopping because task design is hard

## Blocked Rule

Do not use temporary stop language.

If product implementation, non-live validation, SP044, SP045, SP047, build, truthfulness gates, anti-false-success gates, and diff checks pass, but live acceptance fails only because of provider-network, provider-config, provider-auth, or provider-unreachable, set the goal status to blocked.

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

Do not stop because task design is hard, owner discovery is hard, diagnostics fail, implementation is hard, validation fails, source shape differs, or live output is noisy.

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

- final real task trial before fixes
- rerun same tasks if product fixes are made
- SP044 hard mission gauntlet
- SP045 real development mission pack
- SP047 composite acceptance
- focused tests for changed owners
- build when needed
- result truthfulness gate
- anti-false-success gate
- external live catalog after product changes
- diff checks

Classify provider or fallback failures separately from product runtime failures.

## Final Report

Report:

- trial tasks designed
- difficulty review
- skills and subagents used
- trial outcomes
- accepted capabilities and remaining gaps
- ranked next-goal gap list
- product fixes if any
- SP044, SP045, SP047 rerun outcomes
- live acceptance or blocked details
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
