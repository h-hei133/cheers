# Route 38: edit safety guard and failure surface batch, no write expansion

This is a development-only Codex goal spec for bounded implementation work.
It is not a product readiness claim.

## Objective

Continue the edit capability roadmap after Route 35-37.

Route 35 introduced the typed per-file patch plan/result contract.
Route 36 wired perFilePatchPlan into route/result projections.
Route 37 expanded model-output and patch-shape fixture coverage.

Route 38 should implement the next safety layer in one batch:

1. read-before-write / stale-read detection
2. partial or post-write verification failure result surface

This route must not add write capability.

The goal is to make edit execution safer and result reporting more precise before any future 3-file write, broad apply_patch, delete/move, rollback, or recovery work.

## Current behavior to preserve

Supported behavior must remain unchanged:

- single-file selected-workspace update writes
- single-file create writes
- exactly-two update writes
- exactly-three update remains planning/no-write
- 3+ update remains unsupported/no-write
- delete remains unsupported/no-write
- move remains unsupported/no-write
- broad apply_patch remains unsupported/no-write
- malformed model output remains model-output/error/no-write
- mixed supported/unsupported remains stopped/error/no-write

## Non-goals

Do not add or change:

- broad apply_patch write capability
- 3-file write capability
- 3+ write capability
- delete/move write capability
- rollback/atomicity
- snapshot/revert
- automatic stale-read recovery
- automatic re-read/retry/merge
- partial failure recovery
- provider behavior
- model prompting behavior
- CLI behavior
- session persistence behavior
- MCP behavior
- package scripts
- default gates
- readiness claims

Do not change selected-workspace writer behavior except to block unsafe stale writes before writer invocation if an existing route can prove stale input.
Do not change post-write verification behavior except to project failures more explicitly.
Do not change current supported success behavior.

## Validation policy

Use fast preflight, focused validation during edits, and one final route-level validation pass.

Do not run broad gates before coding unless:

- the working tree is dirty unexpectedly
- focused preflight fails
- the route touches cross-cutting runtime/session/CLI boundaries
- a local validation failure points to a broader regression

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve current capability boundaries.
- Preserve success/stopped/error semantics.
- Preserve changedFiles / failedFiles / plannedFiles semantics.
- Preserve no-write invariant for unsupported and planning-only cases.
- Preserve writerInvoked / creatorInvoked / deleteMoveInvoked semantics.
- Preserve current supported write success paths.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits or push.

## Real provider constraints

Route 38 should not require full real-provider execution.

Never read, print, copy, grep, parse, modify, or summarize anything under:

- /home/wang/.private-agents-real

Allowed real-provider-related checks:

- default skip/readiness checks
- dry-run/listing checks
- classification self-test

Do not run full opt-in real-provider execution unless explicitly approved.

## Required first step

Before editing, read:

- docs/design/edit-capability-roadmap.md
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.test.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/mutationExecution.test.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts only for locating call sites, not for broad rewrite
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*
- package.json

Then locate current behavior for:

- read-before-write, if any
- current file content snapshot or expected original content
- stale or mismatch detection, if any
- selected-workspace writer invocation conditions
- post-write verification failure projection
- partial write / partial verification failure representation
- changedFiles / failedFiles / plannedFiles production
- writerInvoked / creatorInvoked / deleteMoveInvoked reporting
- perFilePatchPlan failure classes and support status

Prepare an internal implementation inventory for the final report:

1. Existing read-before-write or expected-content checks.
2. Existing stale/mismatch behavior.
3. Existing post-write verification failure surface.
4. Existing partial-failure representation.
5. Safe seams migrated or added.
6. Execution paths intentionally left unchanged.
7. Focused tests used to prove preservation.

## Fast preflight

Run only:

- rtk git status --short --branch
- rtk git diff --check
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts

If Route 36 or Route 37 changes are still uncommitted, proceed only if they are exactly expected edit-capability route files and do not conflict with this route. Report stacked status.

## Implementation target

Implement a bounded edit safety/failure-surface batch.

Possible target modules:

- packages/ts-shell/src/orchestration/patchApplication/readBeforeWriteGuard.ts
- packages/ts-shell/src/orchestration/patchApplication/staleReadDetection.ts
- packages/ts-shell/src/orchestration/patchResult/patchVerificationFailureProjection.ts
- packages/ts-shell/src/orchestration/patchResult/partialEditFailureProjection.ts

Choose names based on current code shape.

Prefer adding focused modules/tests over modifying broad orchestration code.

## A. Read-before-write / stale-read detection

Add or harden a guard that can represent:

- expected original content or expected prior read facts
- current workspace content
- stale/mismatch condition
- no-write result when stale/mismatch is detected
- per-file plan failure class for stale/mismatch
- writerInvoked=false when stale/mismatch prevents the write
- changedFiles=[]
- failedFiles or failure class according to existing semantics
- clear stopped/error reason without pretending success

This route should not implement automatic recovery.

Do not:

- automatically re-read and retry
- merge stale edits
- modify prompt behavior
- change provider behavior
- change supported success behavior

## B. Partial / post-write verification failure surface

Add or harden projection for verification failure and partial failure.

Represent:

- writer started vs writer not started
- files that changed
- files that failed verification
- files planned but not changed
- postWriteVerification status
- per-file plan/result projection
- terminal stopped/error outcome according to current taxonomy
- no rollback claim

Do not:

- implement rollback
- revert files
- add atomicity
- retry writes
- expand multi-file write capability

## Allowed modification scope

Allowed:

- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/mutationExecution.test.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.test.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.test.ts
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts only for minimal wiring if unavoidable
- focused orchestration tests

Prefer not to touch `runMvpIntegratedFlow.ts` unless the safety/failure projection cannot be wired otherwise.

## Conditional allowed scope

Only if strictly necessary for result projection:

- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts

Do not change user-visible behavior except to preserve or expose existing failure state more explicitly.

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
- docs/*, except this route spec if already created

If completing this route requires forbidden files, stop and report.

## Focused tests required

Add focused tests for:

### Stale/read-before-write

At minimum cover:

- supported single-file update with matching expected content still writes
- stale/mismatched expected content stops before writer invocation
- stale/mismatch produces changedFiles=[]
- stale/mismatch produces writerInvoked=false
- stale/mismatch produces perFilePatchPlan failure class/status
- stale/mismatch does not change unsupported/no-write behavior

### Verification / partial failure surface

At minimum cover:

- post-write verification failure is projected as stopped/error according to existing taxonomy
- writer started is represented distinctly from writer not started
- changed files and failed files are not conflated
- planned files remain distinct from changed files
- no rollback or atomicity claim is made
- per-file plan/result carries verification failure facts

Use existing tests where possible, but add at least one new focused test proving stale/no-write behavior and one proving verification/partial failure projection.

Possible test files:

- packages/ts-shell/src/orchestration/patchApplication/readBeforeWriteGuard.test.ts
- packages/ts-shell/src/orchestration/patchResult/patchVerificationFailureProjection.test.ts
- packages/ts-shell/src/orchestration/mutationExecution.test.ts

## Focused validation during edits

After each touched focused module, run only its focused tests and build:

Examples:

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchApplication/readBeforeWriteGuard.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/patchVerificationFailureProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/mutationExecution.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

Run only tests for modules actually touched.

## Final route-level validation

Run one final validation pass:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic
- rtk git status --short --branch

Do not run full opt-in real-provider execution unless explicitly approved.
Do not run session/MCP/CLI broad gates unless this route touches session/MCP/CLI files or the final validation indicates a cross-cutting failure.

## Optional validation

Run only if touched code suggests it is needed:

- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run

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

Route 38 is complete only if:

- stale/read-before-write detection or representation is implemented for safe supported path
- stale/mismatch prevents writer invocation
- verification/partial failure surface is hardened
- no automatic recovery is added
- no rollback or atomicity is added
- no new write capability is added
- supported write lanes still pass
- unsupported/no-write lanes still pass
- exactly-three remains planning/no-write
- changedFiles / plannedFiles / failedFiles are preserved
- writer invocation conditions are preserved or made stricter only for stale safety
- post-write verification success behavior is unchanged
- result contract passes
- deterministic release passes
- no product readiness claims changed
- no provider/session/CLI/MCP behavior changed
- no package scripts or default gates changed
- no secret/provider config is printed

## Stop conditions

Stop and report if:

- implementing stale detection requires provider or prompt changes
- implementing stale detection requires changing supported success behavior
- failure surface hardening requires rollback/revert/atomicity
- failure surface hardening requires changing SessionManager or cli.tsx
- unsupported/no-write gates fail
- result contract cannot be preserved
- deterministic release fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Roadmap alignment
4. Pre-coding safety/failure inventory
5. Stale/read-before-write implementation
6. Verification/partial failure surface implementation
7. Files changed
8. Forbidden files touched? yes/no
9. Product behavior changed? yes/no
10. New write capability added? yes/no
11. Automatic recovery added? yes/no
12. Rollback/atomicity added? yes/no
13. Unsupported capability changed? yes/no
14. Three-file write still no-write? yes/no
15. changedFiles/plannedFiles/failedFiles preservation evidence
16. writer invocation preservation/stale-block evidence
17. post-write verification preservation evidence
18. Focused tests added/reused
19. Focused validation results
20. Final validation results
21. Optional validation results, if any
22. Residue cleanup status
23. Claim/readiness changes
24. Residual risks
25. Recommended next route
26. Proposed commit message

## Commit and push policy

Do not commit or push.
Propose a commit message only.
