# SP040 Main Runtime Adaptive Dispatcher

## Goal

Move adaptive tool-action policy from evaluation-only consumption into the normal coding-agent runtime decision path.

SP039 created an adaptive policy model, but audit found the strongest consumer in runtime/evaluation/task rather than the normal interactive tool execution boundary. This task must wire adaptive next-action behavior into the product runtime dispatcher or the closest rightful runtime owner.

This task is not complete if adaptive behavior remains only in evaluation, tests, catalog, quality, liveRun, docs, or surface projection.

## Required Target

Find the normal runtime decision seam that chooses or prepares the next tool/action after model response, tool observation, verification state, repair state, continuation facts, proof gaps, and result facts.

The implementation must make adaptive policy or a thin domain adapter influence actual runtime next-action behavior.

Required action kinds:

- read or search
- edit
- verify
- repair
- artifact
- continue
- stop-not-proven

At least 4 action kinds must be reachable in non-evaluation runtime tests.

## Required Inputs

Use the local navigation playbook first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then read matching source files only for the capability areas being implemented.

Use the mature local source only after target owner inspection and playbook navigation:

/home/wang/projects/pi

Use it for action dispatch, loop control, tool observation, retry policy, verification, session durability, and result reduction patterns.

## Required Capability Upgrade

Implement product runtime behavior, not model-only behavior.

Required improvements:

- runtime creates policy input from proof gap, changed files, failure history, task intent, artifact contract, pending action, continuation facts, and budget
- policy output affects actual runtime next action
- missing context drives read or search instead of repeated repair
- changed files drive targeted verification
- repeated failed repair drives new discovery, different repair, or stop-not-proven
- pending continuation action re-enters runtime decision
- artifact contract drives artifact action or validation
- stop-not-proven is explicit when proof is missing and no safe action remains
- evaluation loop can remain a consumer but must not be the only consumer

At least 5 core owners must change. At least 4 must be from runtime, tools, context, planning, edit, verification, repair, artifacts, session continuation, evidence, or result.

## Required Diagnostics

Create or strengthen at least 7 diagnostics.

At least 5 diagnostics must exercise non-evaluation runtime behavior.

Required diagnostics:

1. proof gap in normal runtime selects verify or stop-not-proven, not success
2. missing context selects read or search, not repeated repair
3. changed files select targeted verification
4. repeated repair failure selects new discovery, different repair, or stop-not-proven
5. continuation pending action is restored into runtime decision
6. artifact contract selects artifact action or validation
7. policy output is visible as runtime next-action evidence without becoming terminal truth

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

1. normal product runtime consumes adaptive policy or a thin adapter around it
2. evaluation runtime is not the only adaptive policy consumer
3. at least 7 capability areas diagnosed
4. at least 5 weak areas improved by product code changes
5. at least 7 diagnostics created or strengthened
6. at least 5 diagnostics exercise non-evaluation runtime behavior
7. at least 5 diagnostics improve after code changes
8. at least 5 core product owners changed
9. at least 4 action kinds are reachable in normal runtime tests
10. proof gap, missing context, changed files, repeated repair failure, continuation pending action, and artifact contract affect runtime decision
11. runtime policy output does not create terminal success
12. external live catalog passes after product changes or reaches an allowed temporary live stop
13. at least 2 write tasks complete with reviewed isolated apply and post-apply verification when live acceptance passes
14. at least 1 debug repair task complete when live acceptance passes
15. primary success, fallback skipped on primary success, and forced primary failure fallback pass through shared runtime when live acceptance passes
16. manual correction count is 0 for counted complete tasks when live acceptance passes

Not complete:

- adaptive policy only in runtime/evaluation/task
- docs only
- diagnosis only
- metric only
- projection only
- catalog or profile work only
- fallback work only
- live provider smoke only
- tests without product runtime consumption
- changes limited to evaluation task, liveRun, quality, catalog, thin scripts, docs, or tests
- stopping because implementation is difficult

## Temporary Live Stop

If product implementation is complete and all non-live gates pass, Codex may temporarily stop only when the remaining blocker is clearly provider-network, provider-config, provider-auth, or provider-unreachable.

Temporary live stop is not completion.

It must report:

- exact live retest command
- required environment variables
- expected pass fields
- observed provider failure class
- why this is not a product runtime failure
- current git status
- whether product changes are uncommitted

Do not commit or push until hard gates pass or the user provides passing live retest evidence and asks to continue.

## Blocker Policy

Ordinary technical blockers are work items, not stopping points.

Do not stop because owner discovery is hard, diagnostics fail, patch fails, repair fails, validation fails, dispatcher wiring is hard, mature source shape differs, or live output is noisy.

Allowed stop conditions only:

- safety boundary would be violated
- required credential or explicit provider opt-in is unavailable
- provider remains unreachable after explicit opt-in
- isolated workspace cannot be created safely
- user authorization is required for a write this task cannot authorize

## Architecture Rules

Deterministic, diagnostic, live, and interactive product behavior must share runtime owners wherever behavior is product behavior.

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

Use parallel subagents for dispatcher seam inspection, owner inspection, playbook navigation, mature source inspection, diagnostics, runtime wiring, and validation.

## Validation

Run:

- before and after diagnostics
- focused tests for every changed owner
- non-evaluation runtime dispatcher tests
- build when imports, contracts, or runtime-facing code change
- result truthfulness gates when proof, verdict, status, or completion logic changes
- anti-false-success gates when completion logic changes
- external live catalog after product changes
- diff checks

Classify provider or fallback failures separately from product runtime failures.

## Final Report

Report:

- runtime dispatcher seam found
- adaptive policy consumer outside evaluation
- capability areas diagnosed
- weak areas improved
- playbook files used
- mature source areas inspected
- introduction level per capability
- diagnostics before and after
- product code changes by owner
- action kinds reachable in normal runtime
- continuation and artifact decision behavior
- live acceptance or temporary live stop details
- provider or fallback failure classification if any
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after hard gates pass. After commit, one push attempt is allowed. If push fails, do not retry.
