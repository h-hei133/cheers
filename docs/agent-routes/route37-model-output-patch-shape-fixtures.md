# Route 37: model-output patch-shape fixture expansion and no-write classification hardening

This is a development-only Codex goal spec for bounded implementation work.
It is not a product readiness claim.

## Objective

Continue the edit capability roadmap after Route 35/36.

Route 35 introduced a typed per-file patch plan/result contract.
Route 36 wired that contract into existing edit route/result projections.

Route 37 must expand model-output / patch-shape fixture coverage and harden no-write classification around malformed, unsupported, mixed, and broad patch-like outputs.

This route must not add write capability.

The goal is to make model-output and unsupported patch classification more robust before any future stale-read, partial-failure, broad apply_patch, delete/move, or 3-file write work.

## Current context

Current supported behavior must remain unchanged:

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

Route 36 now projects `perFilePatchPlan` into route/result paths, but the fixture matrix should be expanded before adding new edit capability.

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

Do not change writer invocation conditions.
Do not change selected-workspace writer behavior.
Do not change post-write verification behavior.
Do not change result contract output except where internal no-write plan/classification fields are safely strengthened.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve current capability boundaries.
- Preserve success/stopped/error semantics.
- Preserve changedFiles / failedFiles / plannedFiles semantics.
- Preserve no-write invariant for unsupported and malformed cases.
- Preserve writerInvoked / creatorInvoked / deleteMoveInvoked semantics.
- Preserve postWriteVerification behavior.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Use fast preflight, focused validation during edits, and one final route-level validation pass.
- Do not create commits or push.

## Real provider constraints

Route 37 should not require full real-provider execution.

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
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- packages/ts-shell/src/orchestration/providerOutcomeProjection.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/multiFileUpdatePlanning.ts, if present
- packages/ts-shell/src/orchestration/patchResult/*
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*
- package.json

Then locate existing fixture/classification coverage for:

- malformed model output
- fenced markdown patch
- explanation plus patch
- empty output
- patch with unsupported operation
- delete file
- move/rename file
- broad apply_patch
- 3+ updates
- mixed supported and unsupported operations
- path outside workspace
- duplicate file targets
- unsupported hunk/shape
- unsupported multi-hunk shape, if applicable
- missing file target
- malformed filename/header
- unknown operation kind
- success-like text with no valid patch

Prepare an internal implementation inventory for the final report:

1. Existing patch-shape fixtures.
2. Existing unsupported/malformed classifications.
3. Existing perFilePatchPlan coverage.
4. Gaps in model-output / patch-shape fixture coverage.
5. Which gaps were added in Route 37.
6. Which gaps are deferred because they would imply new parser or write capability.

## Fast preflight

Run only:

- rtk git status --short --branch
- rtk git diff --check
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts

If the repo has unrelated dirty changes, stop and report.
If Route 36 changes are still uncommitted, proceed only if they are exactly expected Route 36 files and do not conflict with this route. Report stacked status.
Do not run broad gates before coding unless the focused preflight fails or the working tree is suspicious.

## Implementation target

Expand fixture and classification coverage.

Likely target areas:

- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.test.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.test.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.test.ts
- scripts/real-user-capabilities/*, only if current unsupported E2E fixtures live there
- scripts/verify-real-user-capabilities.mjs, only if fixture registration/classification wiring already lives there

Prefer focused tests and support modules over broad script changes.
Do not add package scripts.

## Fixture/classification requirements

Add coverage where not already present for a useful subset of these cases:

1. fenced markdown patch with extra prose
2. success-like text but no valid patch
3. empty or whitespace-only model output
4. patch with missing target file
5. patch with malformed operation/header
6. duplicate file target operations
7. unsupported delete operation
8. unsupported move/rename operation
9. unsupported broad apply_patch
10. mixed supported update plus unsupported delete/move
11. 3+ update operations
12. exactly-three update planning/no-write
13. path outside selected workspace, if current path classifier supports it
14. unsupported multi-hunk or unsupported patch body shape, if applicable
15. unknown operation kind

The selected fixture set should improve meaningful coverage without pretending to support new behavior.

## Required behavior

All new or expanded fixtures must preserve:

- unsupported/no-write for delete/move/broad/3+ unsupported cases
- model-output/error/no-write for malformed cases
- mixed supported/unsupported remains no-write
- exactly-three remains planning/no-write
- writerInvoked=false for unsupported/no-write cases
- changedFiles=[] for no-write cases
- plannedFiles only for planning/no-write cases
- failedFiles or failure class only where current semantics already support it
- perFilePatchPlan support status/failure class is consistent with route outcome

## Allowed modification scope

Allowed:

- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.test.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.test.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.test.ts
- packages/ts-shell/src/orchestration/providerOutcomeProjection.ts
- packages/ts-shell/src/orchestration/providerOutcomeProjection.test.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/mutationExecution.test.ts
- scripts/real-user-capabilities/* only if existing fixtures are there
- scripts/verify-real-user-capabilities.mjs only if fixture registration/classification wiring is already there

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

## Focused validation during edits

After each touched focused module, run only its focused test and build:

Examples:

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/mutationRoutingProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/capabilityBoundaryProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/providerOutcomeProjection.test.ts
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

Run only if the touched code suggests it is needed:

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

Route 37 is complete only if:

- model-output / patch-shape fixture coverage is expanded meaningfully
- perFilePatchPlan classification coverage is stronger
- unsupported/no-write behavior is preserved
- malformed output remains model-output/error/no-write
- mixed supported/unsupported remains stopped/error/no-write
- exactly-three remains planning/no-write
- no new write capability was added
- writer invocation conditions are unchanged
- changedFiles / plannedFiles / failedFiles are preserved
- result contract passes
- deterministic release passes
- no product readiness claims changed
- no provider/session/CLI/MCP behavior changed
- no package scripts or default gates changed
- no secret/provider config is printed

## Stop conditions

Stop and report if:

- meaningful fixture expansion requires enabling new write capability
- fixture expansion requires changing writer invocation
- fixture expansion requires changing post-write verification
- fixture expansion requires changing SessionManager or cli.tsx
- unsupported/no-write gates fail
- result contract cannot be preserved
- deterministic release fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Roadmap alignment
4. Pre-coding fixture/classification inventory
5. Fixtures/classifications added or expanded
6. Files changed
7. Forbidden files touched? yes/no
8. Product behavior changed? yes/no
9. New write capability added? yes/no
10. Unsupported capability changed? yes/no
11. Malformed/mixed behavior preserved? yes/no
12. Delete/move/broad apply_patch still unsupported? yes/no
13. Three-file write still no-write? yes/no
14. changedFiles/plannedFiles/failedFiles preservation evidence
15. writer invocation preservation evidence
16. Focused tests added/reused
17. Focused validation results
18. Final validation results
19. Optional validation results, if any
20. Residue cleanup status
21. Claim/readiness changes
22. Residual risks
23. Recommended next route
24. Proposed commit message

## Commit and push policy

Do not commit or push.
Propose a commit message only.
