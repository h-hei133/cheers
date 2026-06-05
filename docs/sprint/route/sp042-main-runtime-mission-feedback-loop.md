# SP042 Main Runtime Mission Feedback Loop

## Goal

Build the main runtime mission feedback loop.

SP041 made the normal runtime derive adaptive decisions and emit task proof. This sprint must prove and improve the next layer:

runtime action
-> tool or edit execution
-> observation
-> state update
-> next runtime action
-> mission proof
-> result verdict

The goal is to make the normal product runtime complete harder mission diagnostics through feedback, not only decide or project facts.

## Required Position

Normal runtime behavior is the target. Evaluation-only behavior is not enough.

The main lane must involve QueryEngine, runQueryLoop, AgentRunner, tool or edit observation, and the rightful owner domains for context, planning, verification, repair, artifacts, continuation, evidence, and result.

## Required Inputs And Tools

Use Serena MCP for owner discovery, symbol navigation, references, diagnostics, and targeted edits.

Use Spec-Driven Develop plugin for decomposition and execution discipline.

Use Superpowers when available for systematic debugging, test-first diagnostics, verification-before-completion, subagent-driven development, and review discipline. Do not let it create process bloat, extra process documents, or a stopping excuse. If unavailable, apply the same discipline manually and continue.

Use the local navigation project first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then only matching source files for the capability areas being implemented.

Use the mature local source only after target owner inspection and navigation:

/home/wang/projects/pi

Use it for concrete patterns around tool feedback, action observation, session durability, retry policy, result reduction, verification, artifact handling, and mission execution.

## Four Level Introduction Rule

For each capability brought into this project, use this order:

1. dependency use: use an existing package or stable API when safe and compatible
2. structured port: port the design shape into current owner domains with target naming and contracts
3. isolated source adoption: adapt a small isolated implementation unit only when safe, licensed, and compatible with target ownership
4. behavior-only alignment: reproduce behavior only after explaining why the first three levels are not appropriate

Do not default to behavior-only alignment. Explicitly evaluate the first three levels.

Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Required Capability Upgrade

Implement feedback-driven mission behavior.

Required behavior:

- read or search observation updates context facts and can refine owner selection
- edit observation updates changed-file intent, write proof, and verification needs
- verification observation updates proof gap, failure history, and next action
- repair observation updates repair attempt history and avoids repeated failed repair
- artifact observation updates artifact evidence and claim-evidence validation
- continuation observation restores pending action and proof gap into runtime decision
- tool failure observation can select retry, discovery, repair, verify, or stop-not-proven
- task proof updates from observation facts without creating terminal success
- next runtime action is recomputed after observations

## Required Architecture Quality

Do not create a second parallel runtime.

Requirements:

- no duplicate adaptive policy fork
- no durable decision logic hidden in broad orchestration
- no product behavior added to compatibility shims
- no evaluation-only implementation accepted as main behavior
- no surface-only implementation accepted as behavior
- no status/proof projection accepted without tool feedback consumption
- normal runtime tests must prove the feedback loop
- changed owner boundaries must remain cohesive

If orchestration must change, keep it as wiring and move decisions into rightful owners.

## Required Mission Diagnostics

Create or strengthen at least 8 mission diagnostics.

At least 6 must exercise normal runtime feedback behavior outside evaluation-only paths.

Required missions:

1. read or search updates context and changes the next action
2. edit updates changed files and triggers targeted verification
3. verification failure updates failure history and triggers repair or discovery
4. repair observation triggers re-verification and avoids duplicate repair
5. artifact observation validates claim-evidence consistency
6. continuation restores pending action into the next runtime decision
7. tool failure selects a safe next action without success claim
8. multi-step mission completes through at least three feedback turns

At least 5 missions must improve after product code changes.

If initial missions pass, harden them until real weakness appears.

## Hard Completion Gates

This task is not complete until all gates pass:

1. normal runtime mission feedback loop is implemented
2. evaluation runtime is not the only consumer
3. at least 8 mission diagnostics created or strengthened
4. at least 6 missions exercise non-evaluation runtime feedback
5. at least 5 missions improve after code changes
6. at least 5 core product owners changed
7. at least 5 action kinds are effective in normal runtime among read, search, edit, verify, repair, artifact, continue, stop-not-proven
8. tool or edit observations update runtime state and next action
9. verification and repair observations update proof gap and retry strategy
10. continuation pending action re-enters runtime decision
11. artifact observation validates claim-evidence consistency
12. stop-not-proven cannot become terminal success
13. external live catalog passes after product changes
14. live acceptance shows manualCorrectionCount 0
15. write tasks include reviewed isolated apply and post-apply verification
16. debug repair complete is true
17. primary success, fallback skipped on primary success, and forced primary failure fallback pass through shared runtime
18. task proof, verification, repair status, artifact validation, changed-file accounting, and result verdict are reported

Not complete:

- diagnostics only
- docs only
- metrics only
- evaluation-only behavior
- projection-only behavior
- surface-only behavior
- catalog or profile work
- fallback-only work
- tests without product runtime feedback behavior
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

Do not stop because owner discovery is hard, diagnostics fail, implementation is hard, patch fails, repair fails, validation fails, dispatcher wiring is hard, tool feedback wiring is hard, source shape differs, or live output is noisy.

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

- before and after mission diagnostics
- focused tests for every changed owner
- normal runtime feedback loop tests
- build when imports, contracts, or runtime-facing code change
- result truthfulness gates when proof, verdict, status, or completion logic changes
- anti-false-success gates when completion logic changes
- external live catalog after product changes
- diff checks

Classify provider or fallback failures separately from product runtime failures.

## Final Report

Report:

- main runtime feedback loop implemented
- adaptive policy consumers
- observation to state update behavior
- capability areas improved
- playbook files used
- mature source areas inspected
- introduction level per capability
- mission diagnostics before and after
- product code changes by owner
- action kinds effective in normal runtime
- repair and verification feedback behavior
- continuation behavior
- artifact validation behavior
- live acceptance or blocked details
- provider or fallback failure classification if any
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
