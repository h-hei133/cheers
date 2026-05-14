# Route 36: Wire per-file patch plan into edit route/result projections, no-write

This is a development-only Codex goal spec for bounded implementation work.
It is not a product readiness claim.

## Objective

Wire the Route 35 per-file patch plan/result contract into the existing edit route/result projection path without adding write capability.

Route 35 added:

- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.test.ts

Route 36 should make this contract useful to the current edit pipeline by connecting it to existing mutation route/result projections where safe.

This route must preserve all current behavior:

- single-file selected-workspace update remains supported
- single-file create remains supported
- exactly-two update remains supported
- exactly-three update remains planning/no-write only
- 3+ update remains unsupported/no-write
- delete/move remains unsupported/no-write
- broad apply_patch remains unsupported/no-write
- malformed patch remains model-output/error/no-write
- mixed supported/unsupported remains stopped/error/no-write
- changedFiles / failedFiles / plannedFiles semantics remain unchanged
- writer invocation conditions remain unchanged

Do not implement new edit capability.

## Current context

Route 35 deliberately made `perFilePatchPlan.ts` projection-only. Its residual risk was:

- the contract is not yet wired as the canonical runtime route/result output.

Route 36 should address that by wiring the plan into edit route/result projections while preserving no-write boundaries.

## Non-goals

Do not add or change:

- broad apply_patch write capability
- 3-file write capability
- 3+ write capability
- delete/move write capability
- rollback/atomicity
- snapshot/revert
- stale-read recovery
- partial failure recovery
- provider behavior
- model prompting behavior
- CLI behavior
- session persistence behavior
- MCP behavior
- package scripts
- default gates
- readiness claims

Do not change selected-workspace writer behavior.
Do not change mutation lane limits.
Do not change post-write verification behavior.
Do not change result contract output except to safely carry/project the new per-file plan where existing behavior permits.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve current capability boundaries.
- Preserve success/stopped/error semantics.
- Preserve changedFiles / failedFiles / plannedFiles semantics.
- Preserve no-write invariant for unsupported and planning-only cases.
- Preserve writerInvoked / creatorInvoked / deleteMoveInvoked semantics.
- Preserve postWriteVerification behavior.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits or push.

## Real provider constraints

Route 36 should not require full real-provider execution.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize anything under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, provider env contents, private config contents, or secret-bearing command lines.

Allowed real-provider-related checks:

- default skip/readiness checks
- dry-run/listing checks
- classification self-test

Do not run full opt-in real-provider execution unless explicitly approved.

## Required first step

Before editing, read:

- docs/design/edit-capability-roadmap.md
- docs/design/runtime-module-ownership-map.md
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.test.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- packages/ts-shell/src/orchestration/providerOutcomeProjection.ts
- packages/ts-shell/src/orchestration/multiFileUpdatePlanning.ts, if present
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*
- package.json

Then locate the current route/result projection path for:

- supported single-file update
- supported single-file create
- supported exactly-two update
- exactly-three planning/no-write
- unsupported 3+ update
- unsupported delete/move
- unsupported broad apply_patch
- malformed model output
- mixed supported/unsupported patch
- plannedFiles / changedFiles / failedFiles
- writerInvoked / creatorInvoked / deleteMoveInvoked
- postWriteVerification
- Route08 unsupported E2E projection
- Route11 three-file planning/no-write projection
- Route12 planned-files continuity projection

Prepare an internal implementation inventory for the final report:

1. Where `perFilePatchPlan` can be wired safely.
2. Which supported cases should carry a plan summary.
3. Which unsupported/no-write cases should carry a plan summary.
4. Which result surfaces should not change.
5. Which runtime execution paths must remain untouched.
6. Which tests prove changed/planned/failed and writer flags are preserved.

## Preflight state check

Before coding, verify current baseline is healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -170
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If the repo has unrelated dirty changes, stop and report.
If Route 35 files are still uncommitted, proceed only if they are exactly the expected Route 35 files and do not conflict with this route. Report stacked status.
If baseline gates fail for unrelated reasons, stop and report.

## Implementation target

Wire the per-file patch plan into existing route/result projections where safe.

Likely target areas:

- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/multiFileUpdatePlanning.ts, if present
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts only for minimal projection wiring if necessary

Prefer keeping the new plan under `patchResult/` and wiring it through existing projection modules rather than execution modules.

## Required behavior

Route 36 must preserve current behavior.

Supported write lanes:

- single-file update writes exactly as before
- single-file create writes exactly as before
- exactly-two update writes exactly as before

No-write lanes:

- exactly-three update remains planning/no-write
- 3+ update remains unsupported/no-write
- delete remains unsupported/no-write
- move remains unsupported/no-write
- broad apply_patch remains unsupported/no-write
- malformed remains model-output/error/no-write
- mixed supported/unsupported remains stopped/error/no-write

The plan may be carried/projected, but it must not change write eligibility.

## Allowed modification scope

Allowed:

- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.test.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.test.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.test.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/mutationExecution.test.ts
- packages/ts-shell/src/orchestration/multiFileUpdatePlanning.ts, if present
- packages/ts-shell/src/orchestration/multiFileUpdatePlanning.test.ts, if present
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts only for minimal wiring if required

Prefer adding focused projection tests instead of modifying broad tests.

## Conditional allowed scope

Only if strictly necessary for result projection:

- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts

Do not change user-visible behavior unless preserving existing output requires adapting to the new typed structure.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/core/mcp/*
- provider/auth core behavior
- MCP core behavior
- package.json
- scripts/*
- docs/*, except this route spec if already created

If completing this route requires forbidden files, stop and report.

## Contract wiring requirements

The wired contract must satisfy:

1. Existing supported write lanes can project or carry per-file plan data.
2. Unsupported/no-write lanes can project or carry per-file plan data.
3. The plan distinguishes plannedFiles, changedFiles, and failedFiles.
4. The plan preserves operation kind:
   - update
   - create
   - delete unsupported
   - move unsupported
   - broad unsupported
   - malformed / unknown
5. The plan preserves support status:
   - supported-write
   - supported-planning-no-write
   - unsupported-no-write
   - invalid-model-output
6. Route08 unsupported patch E2E semantics are unchanged.
7. Route11 exactly-three planning/no-write semantics are unchanged.
8. Route12 plannedFiles continuity semantics are unchanged.
9. Writer invocation conditions are unchanged.
10. No rollback or partial failure behavior is introduced.

## Focused tests required

Add or update focused tests to prove the plan is wired into route/result projection.

At minimum, cover:

- supported single-file update projection includes supported-write plan without changing changedFiles
- supported single-file create projection includes supported-write plan without changing changedFiles
- exactly-two update projection includes per-file supported-write plans
- exactly-three planning/no-write projection includes plannedFiles and no changedFiles
- 3+ update projection remains unsupported/no-write
- delete projection remains unsupported/no-write
- move projection remains unsupported/no-write
- broad apply_patch projection remains unsupported/no-write
- malformed projection remains invalid-model-output
- mixed supported/unsupported projection remains unsupported/no-write
- writerInvoked remains false for unsupported/no-write cases
- Route08/Route11/Route12 evidence surfaces are not changed except for internal plan availability if applicable

Use existing focused tests where possible, but add at least one new or updated test proving the plan is integrated rather than isolated.

## Local validation after implementation

Run focused tests for touched modules, at minimum:

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts

Also run any actual focused tests changed/added, for example:

- rtk npm run test -w packages/ts-shell -- src/orchestration/mutationRoutingProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/capabilityBoundaryProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/mutationExecution.test.ts

Then run:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

## Batch validation

Run:

- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

## Full validation before final report

Run:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:release:deterministic
- rtk git status --short --branch

Do not run full opt-in real-provider execution unless explicitly approved.

## Optional comparison

If feasible, compare before/after outputs for:

- unsupported patch E2E
- three-file planning/no-write
- planned-files continuity
- release deterministic

Check:

- outcome unchanged
- Route08Class / Route02Class unchanged where applicable
- plannedFiles unchanged
- changedFiles unchanged
- writerInvoked unchanged
- successLike unchanged
- no new readiness claims

Do not store large logs in repo.

## Residue cleanup

Clean audit/history/runtime residue before final report when safe, including:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
- temporary comparison logs
- /tmp/private-agents-test/test-results/real-user-capabilities-report.json

If residue cannot be cleaned, report why.

## Success criteria

Route 36 is complete only if:

- perFilePatchPlan is wired into existing route/result projection where safe
- perFilePatchPlan is no longer only an isolated contract
- current supported write lanes still pass
- current unsupported/no-write lanes still pass
- no new write capability was added
- delete/move/broad apply_patch remain unsupported/no-write
- exactly-three update remains planning/no-write
- changedFiles / failedFiles / plannedFiles are preserved
- writer invocation conditions are unchanged
- post-write verification behavior is unchanged
- result contract passes
- deterministic release passes
- no product readiness claims changed
- no provider/session/CLI/MCP behavior changed
- no package scripts or default gates changed
- no secret/provider config is printed

## Stop conditions

Stop and report if:

- wiring the plan requires changing write capability
- wiring the plan requires enabling broad apply_patch
- wiring the plan requires enabling delete/move
- wiring the plan requires changing mutation execution
- wiring the plan requires changing post-write verification
- wiring the plan requires changing SessionManager or cli.tsx
- result contract cannot be preserved
- unsupported/no-write gates fail
- deterministic release fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Roadmap alignment
4. Pre-coding route/result wiring inventory
5. Wiring completed
6. Contract/module changed
7. Files changed
8. Forbidden files touched? yes/no
9. Product behavior changed? yes/no
10. New write capability added? yes/no
11. Unsupported capability changed? yes/no
12. Delete/move/broad apply_patch still unsupported? yes/no
13. Three-file write still no-write? yes/no
14. changedFiles/plannedFiles/failedFiles preservation evidence
15. writer invocation preservation evidence
16. post-write verification preservation evidence
17. Focused tests added/reused
18. Local validation results
19. Batch validation results
20. Full validation results
21. Residue cleanup status
22. Claim/readiness changes
23. Residual risks
24. Recommended next route
25. Proposed commit message

## Commit and push policy

Do not commit or push.
Propose a commit message only.
