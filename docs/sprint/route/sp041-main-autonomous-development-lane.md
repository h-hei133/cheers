# SP041 Main Autonomous Development Lane

## Goal

Build a high-quality main autonomous development lane without leaving avoidable architecture debt.

The system must stop being a collection of strong components and become a coherent normal runtime path:

user task
-> context discovery
-> owner narrowing
-> adaptive next action
-> tool or edit execution
-> targeted verification
-> failure diagnosis
-> repair action
-> re-verification
-> artifact validation when needed
-> continuation when needed
-> task proof and result verdict

This task must preserve truthfulness while improving real autonomous development ability. Do not trade long-term correctness for a quick pass.

## Required Position

The adaptive policy must control or constrain normal product runtime behavior, not only evaluation behavior.

The main lane must run through the normal query runtime, AgentRunner or closest rightful dispatcher, and relevant owner domains. Evaluation code may remain a consumer, but it must not be the only proof of behavior.

## Required Inputs

Use the local navigation project first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then only matching source files for the capability areas being implemented.

Use the mature local source only after target owner inspection and navigation:

/home/wang/projects/pi

Use it for concrete patterns around main loop, action dispatch, tool observation, session durability, retry policy, verification, artifact handling, and result reduction.

## Four Level Introduction Rule

For each capability brought into this project, use this order:

1. dependency use: use an existing package or stable API when safe and compatible
2. structured port: port the design shape into current owner domains with target naming and contracts
3. isolated source adoption: adapt a small isolated implementation unit only when safe, licensed, and compatible with target ownership
4. behavior-only alignment: reproduce behavior only after explaining why the first three levels are not appropriate

Do not default to behavior-only alignment. Explicitly evaluate the first three levels.

Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Required Capability Upgrade

Implement a coherent main lane.

Required behavior:

- normal runtime derives adaptive policy input from proof gap, changed files, failure history, task intent, artifact contract, pending action, continuation facts, and budget
- policy output affects actual next action, not only display or metadata
- read or search updates context facts
- edit action carries changed-file intent and safe write requirements
- verification action uses task intent, changed files, and failure history
- repair action uses failure output and avoids repeating the same failed repair
- repair can switch to new discovery when failure suggests missing context
- artifact action validates claim-evidence consistency and verification evidence
- continuation restores pending action and proof gap into runtime decision
- stop-not-proven is available only when no safe productive action remains
- evidence/result remains terminal truth owner

## Required Architecture Quality

This task must reduce future rework.

Requirements:

- no duplicate adaptive policy forks
- no durable decision logic hidden in broad orchestration
- no product behavior added to compatibility shims
- no evaluation-only implementation accepted as main behavior
- no surface-only or projection-only implementation accepted as behavior
- normal runtime tests must prove the main lane
- changed owner boundaries must remain clean and cohesive

If orchestration must change, keep it as wiring and move decisions into rightful owners.

## Required Mission Diagnostics

Create or strengthen at least 8 mission diagnostics.

At least 6 must exercise normal product runtime behavior outside evaluation-only paths.

Required missions:

1. ambiguous context mission reaches additional discovery or owner selection
2. proof gap mission chooses verify or stop-not-proven without success claim
3. changed-file mission chooses targeted verification
4. failed verification mission reaches diagnosis, repair, re-verification, and proof update
5. repeated repair mission avoids duplicate repair and changes strategy
6. artifact mission validates claim-evidence consistency
7. continuation mission restores pending action into runtime decision
8. multi-step mission completes context, edit, verify, repair or artifact path through the main lane

At least 5 missions must improve after product code changes.

If initial missions pass, make them harder until real weakness appears.

## Hard Completion Gates

This task is not complete until all gates pass:

1. normal product runtime owns the main autonomous development lane
2. evaluation runtime is not the only consumer
3. at least 8 mission diagnostics created or strengthened
4. at least 6 missions exercise non-evaluation runtime behavior
5. at least 5 missions improve after code changes
6. at least 5 core product owners changed
7. at least 5 action kinds are effective in normal runtime among read, search, edit, verify, repair, artifact, continue, stop-not-proven
8. repair retry can change strategy after repeated failure
9. continuation pending action re-enters runtime decision
10. artifact validation uses claim-evidence consistency
11. stop-not-proven cannot become terminal success
12. external live catalog passes after product changes
13. live acceptance shows manualCorrectionCount 0
14. write tasks include reviewed isolated apply and post-apply verification
15. debug repair complete is true
16. primary success, fallback skipped on primary success, and forced primary failure fallback pass through shared runtime
17. task proof, verification, repair status, artifact validation, changed-file accounting, and result verdict are reported

Not complete:

- diagnostics only
- docs only
- metrics only
- evaluation-only behavior
- projection-only behavior
- surface-only behavior
- catalog or profile work
- fallback-only work
- tests without product runtime behavior
- changes limited to evaluation task, liveRun, quality, catalog, thin scripts, docs, or tests
- implementation that creates duplicated policy paths
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

Do not stop because owner discovery is hard, diagnostics fail, implementation is hard, patch fails, repair fails, validation fails, dispatcher wiring is hard, source shape differs, or live output is noisy.

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

## Required Tools

Use Serena MCP for owner discovery, symbol navigation, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and execution discipline.

Use parallel subagents for main runtime seam inspection, owner inspection, navigation, mature source inspection, mission diagnostics, runtime wiring, and validation.

## Validation

Run:

- before and after mission diagnostics
- focused tests for every changed owner
- normal runtime lane tests
- build when imports, contracts, or runtime-facing code change
- result truthfulness gates when proof, verdict, status, or completion logic changes
- anti-false-success gates when completion logic changes
- external live catalog after product changes
- diff checks

Classify provider or fallback failures separately from product runtime failures.

## Final Report

Report:

- main runtime lane implemented
- adaptive policy consumers
- capability areas improved
- playbook files used
- mature source areas inspected
- introduction level per capability
- mission diagnostics before and after
- product code changes by owner
- action kinds effective in normal runtime
- repair retry behavior
- continuation behavior
- artifact validation behavior
- live acceptance or blocked details
- provider or fallback failure classification if any
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
