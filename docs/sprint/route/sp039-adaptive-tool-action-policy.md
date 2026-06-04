# SP039 Adaptive Tool Action Policy

## Goal

Aggressively improve autonomous development ability by turning the controller into an adaptive tool-action policy.

The system must choose the next best development action from observations, proof gaps, failure history, changed files, artifact requirements, and remaining budget.

This task must not stop at graph fields, projections, diagnostics, docs, metrics, catalog/profile work, fallback smoke, validation replay, or live-provider-only proof.

Live provider is an acceptance standard, not the primary discovery mechanism.

## Required Inputs

Use the local playbook first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then read only matching source files for the capability areas being implemented.

Use the mature source only after target owner inspection and playbook navigation:

/home/wang/projects/pi

Use it for concrete patterns around action policy, tool planning, retry strategy, session durability, verification, artifact quality, and result reduction.

## Required Capability Upgrade

Implement adaptive development behavior, not fixed-case handling.

Required improvements:

- next-action policy chooses between read, search, edit, verify, repair, artifact, continue, or stop-not-proven
- policy uses proof gap, failure history, changed files, task intent, artifact contract, and budget
- action plan records preconditions, expected observations, proof contribution, fallback action, and budget impact
- repair policy avoids repeating the same failed repair
- repair policy can switch from repair to new discovery when failure evidence shows missing context
- verification policy can rerun targeted checks after changed files or repair attempts
- artifact policy validates claim-evidence consistency, not only markers
- continuation policy carries pending action, proof gap, and next action safely

At least 5 core owners must change. At least 4 must be from context, planning, tools, edit, verification, repair, task loop, artifact, or session continuation.

## Required Diagnostics

Create or strengthen at least 7 diagnostics.

At least 6 must test task-solving power.

Required diagnostics:

1. proof gap chooses verify instead of final success
2. missing context after failure chooses additional discovery instead of repeated repair
3. repeated failed repair is rejected or replaced by a different action
4. changed files select targeted verification
5. artifact claim without evidence fails validation
6. pending continuation restores next action and proof gap
7. multi-step task chooses read or edit or verify or repair based on current observations

At least 5 diagnostics must improve after product code changes.

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

1. at least 7 capability areas diagnosed
2. at least 5 weak areas improved by product code changes
3. at least 7 diagnostics created or strengthened
4. at least 6 diagnostics test task-solving power
5. at least 5 diagnostics improve after code changes
6. at least 5 core product owners changed
7. adaptive next-action policy implemented and consumed by runtime behavior
8. at least 4 action kinds are supported among read, search, edit, verify, repair, artifact, continue, stop-not-proven
9. repair policy avoids repeated failed repair
10. repair policy can choose new discovery after missing-context failure
11. artifact validation checks claim-evidence consistency
12. continuation carries pending action and proof gap
13. external live catalog passes after product changes
14. at least 2 write tasks complete with reviewed isolated apply and post-apply verification
15. at least 1 debug repair task complete
16. primary success, fallback skipped on primary success, and forced primary failure fallback all pass through shared runtime
17. manual correction count is 0 for counted complete tasks
18. task proof, verification, repair status, artifact validation, changed-file accounting, and result verdict are reported

Not complete:

- docs only
- diagnosis only
- metric only
- fixed-case projection only
- action graph fields only
- single repair only
- validation replay only
- live provider smoke only
- catalog or profile work only
- fallback work only
- changes limited to evidence, result, presentation, evaluation task, catalog, quality, liveRun, thin scripts, docs, or tests
- orchestration-only behavior growth
- stopping because the implementation is difficult

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

Use parallel subagents for target owner inspection, playbook navigation, mature source inspection, policy design, diagnostics, implementation, and validation.

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
- adaptive policy behavior
- repair policy behavior
- artifact claim-evidence validation
- continuation pending-action behavior
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
