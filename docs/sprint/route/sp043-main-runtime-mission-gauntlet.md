# SP043 Main Runtime Mission Gauntlet

## Goal

Prove and improve the normal runtime as a mission-level autonomous development lane.

SP042 implemented observation feedback. This sprint must push beyond mechanism proof and make the normal runtime complete harder mission diagnostics through real feedback loops.

Target lane:

task
-> context discovery
-> owner selection
-> adaptive action
-> tool or edit observation
-> state update
-> verification
-> repair if needed
-> artifact or continuation if needed
-> task proof
-> result verdict

## Required Tool Discipline

Use Serena MCP for owner discovery, symbol navigation, references, diagnostics, and targeted edits.

Use the Spec-Driven Develop plugin for decomposition and execution discipline.

Use Superpowers skills where available:

- using-superpowers to select relevant skills
- dispatching-parallel-agents and subagent-driven-development for focused owner audits
- systematic-debugging for failing diagnostics and repair loops
- test-driven-development for new behavior diagnostics
- verification-before-completion before any completion claim
- requesting-code-review or receiving-code-review before final commit
- using-git-worktrees only if isolation is useful and safe

Do not let any tool create process bloat, extra process documents, or a stopping excuse. Tool workflows must serve the hard gates.

Use the local navigation project first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then only matching source files.

Use the mature local source only after target owner inspection and navigation:

/home/wang/projects/pi

## Four Level Introduction Rule

For each capability brought into this project, use this order:

1. dependency use: use an existing package or stable API when safe and compatible
2. structured port: port the design shape into current owner domains with target naming and contracts
3. isolated source adoption: adapt a small isolated implementation unit only when safe, licensed, and compatible with target ownership
4. behavior-only alignment: reproduce behavior only after explaining why the first three levels are not appropriate

Explicitly evaluate the first three levels before behavior-only alignment.

Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Required Capability Upgrade

Implement mission-level runtime behavior.

Required improvements:

- normal runtime can complete a multi-step mission through at least three feedback turns
- read or search observations refine owner selection and next action
- edit observations update changed files and verification needs
- verification observations update proof gap and repair strategy
- repair observations can change strategy or request new discovery
- artifact observations validate claim-evidence consistency
- continuation restores pending mission state into the next decision
- final proof records evidence without treating observations as terminal success

At least 5 core owners must change. At least 4 must be from runtime, tools, context, planning, edit, verification, repair, artifacts, session continuation, evidence, or result.

## Required Mission Diagnostics

Create or strengthen at least 8 mission diagnostics.

At least 6 must exercise normal product runtime behavior outside evaluation-only paths.

Required missions:

1. ambiguous owner mission completes discovery and owner selection
2. multi-file edit mission updates source and dependent target, then verifies
3. failed verification mission repairs and re-verifies
4. repeated repair mission changes strategy or requests discovery
5. artifact mission validates claims against evidence receipts
6. continuation mission resumes pending action and completes
7. tool failure mission selects a safe next action
8. proof gap mission verifies or stops not proven without success claim

At least 5 missions must improve after product code changes.

If initial missions pass, harden them until a real weakness appears.

## Hard Completion Gates

This task is not complete until all gates pass:

1. normal runtime mission gauntlet is implemented
2. evaluation runtime is not the only consumer
3. at least 8 mission diagnostics created or strengthened
4. at least 6 missions exercise non-evaluation runtime behavior
5. at least 5 missions improve after code changes
6. at least 5 core product owners changed
7. at least 6 action kinds are effective in normal runtime among read, search, edit, verify, repair, artifact, continue, stop-not-proven
8. at least 1 multi-file mission completes with changed-file accounting
9. at least 1 repair mission completes after failed verification and re-verification
10. at least 1 continuation mission completes after restoring pending action
11. at least 1 artifact mission validates claim-evidence consistency
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

- before and after mission diagnostics
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

- mission gauntlet implemented
- Superpowers skills used
- adaptive policy consumers
- observation to state update behavior
- capability areas improved
- playbook files used
- mature source areas inspected
- introduction level per capability
- mission diagnostics before and after
- product code changes by owner
- action kinds effective in normal runtime
- repair, continuation, and artifact behavior
- live acceptance or blocked details
- provider or fallback failure classification if any
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
