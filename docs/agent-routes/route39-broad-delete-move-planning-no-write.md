# Route 39: broad patch / delete / move planning batch, no write

This is a development-only Codex goal spec for bounded implementation work.
It is not a product readiness claim.

## Objective

Continue the edit capability roadmap after Route 35-38.

Route 35 added the per-file patch plan contract.
Route 36 wired it into edit results.
Route 37 hardened malformed/unsupported patch-shape fixtures.
Route 38 added/hardened stale-read and partial/post-write failure result surfaces.

Route 39 should extend no-write planning and classification for broader patch shapes, delete operations, and move/rename operations.

This route must not add write capability.

The goal is to make broad apply_patch, delete, move, and mixed-operation requests produce clearer per-file planning/classification output while preserving the existing stopped/no-write behavior.

## Required behavior to preserve

Supported lanes remain unchanged:

- single-file selected-workspace update writes
- single-file create writes
- exactly-two update writes

No-write lanes remain no-write:

- exactly-three update remains planning/no-write
- 3+ update remains unsupported/no-write
- delete remains unsupported/no-write
- move/rename remains unsupported/no-write
- broad apply_patch remains unsupported/no-write
- malformed output remains model-output/error/no-write
- mixed supported/unsupported remains stopped/error/no-write

## Non-goals

Do not implement:

- broad apply_patch writes
- 3-file writes
- delete/move writes
- rollback/atomicity
- snapshot/revert
- stale-read recovery
- partial failure recovery
- provider behavior changes
- CLI behavior changes
- session persistence changes
- MCP behavior changes
- package script changes
- default gate changes
- readiness claim changes

Do not change writer invocation conditions except preserving existing no-write blocking.

## Validation policy

Use fast preflight, focused validation while editing, and one final route-level validation.

Do not run broad gates before coding unless focused preflight fails or the working tree is suspicious.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline active.
- Use rtk for reads, search, git status/diff, tests, build, verification, and large-output commands.
- Do not read or print anything under `/home/wang/.private-agents-real`.
- Do not run full opt-in real-provider execution.
- Do not commit or push.

## Required first step

Read:

- docs/design/edit-capability-roadmap.md
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*
- package.json

Locate current handling for:

- broad apply_patch
- delete file operation
- move/rename operation
- mixed supported/unsupported operation lists
- operation kind projection in perFilePatchPlan
- Route08 unsupported patch E2E fixtures
- changedFiles / plannedFiles / failedFiles
- writerInvoked / creatorInvoked / deleteMoveInvoked
- successLike / stopped / error projection

Final report must include a short implementation inventory.

## Fast preflight

Run only:

- rtk git status --short --branch
- rtk git diff --check
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts

If Route 38 changes are still uncommitted, proceed only if they are exactly expected Route 38 patchResult files and do not conflict with this route.

## Implementation target

Add or harden no-write planning/classification for broad patch/delete/move shapes.

Likely target files:

- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.test.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.test.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.test.ts
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*

Prefer focused modules/tests over broad script changes.

## Required additions or hardening

Add meaningful coverage and representation for a useful subset of:

1. broad apply_patch with multiple unrelated operations
2. broad apply_patch with update + create + delete mixed operations
3. delete file operation
4. move/rename operation
5. mixed supported update plus delete
6. mixed supported create plus move
7. duplicate move/delete targets
8. move with missing source
9. move with missing destination
10. delete outside selected workspace
11. move outside selected workspace
12. broad patch with one supported file and one unsupported external file

The system may classify these as unsupported/no-write, but it should represent them clearly in perFilePatchPlan where safe.

## Per-file plan expectations

The plan should clearly represent:

- operation kind:
  - update
  - create
  - delete unsupported
  - move unsupported
  - broad unsupported
  - unknown / malformed
- target path
- source path for move where available
- support status:
  - supported-write
  - supported-planning-no-write
  - unsupported-no-write
  - invalid-model-output
- failure class / reason
- changedFiles=[]
- writerInvoked=false
- deleteMoveInvoked=false
- creatorInvoked=false unless existing create success path is used
- plannedFiles only for current planning/no-write semantics, not for unsupported writes unless existing behavior already does so

## Allowed modification scope

Allowed:

- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.test.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.test.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/mutationExecution.test.ts
- scripts/real-user-capabilities/*
- scripts/verify-real-user-capabilities.mjs only if current Route08 fixture registration lives there

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/core/mcp/*
- provider/auth core
- MCP core
- package.json
- docs/* except this route spec

Stop if completing the route requires forbidden files.

## Focused tests required

Add or update tests for:

- broad apply_patch remains unsupported/no-write with per-file plan facts
- delete remains unsupported/no-write with delete operation projection
- move remains unsupported/no-write with source/target projection
- mixed update+delete remains stopped/no-write
- mixed create+move remains stopped/no-write
- outside workspace delete/move remains stopped/no-write
- writerInvoked=false for all unsupported delete/move/broad cases
- changedFiles=[] for all unsupported delete/move/broad cases
- supported update/create/two-file lanes remain unchanged

## Focused validation during edits

Run tests only for touched focused modules, then build:

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/mutationRoutingProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/capabilityBoundaryProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/mutationExecution.test.ts
- rtk node --check scripts/verify-real-user-capabilities.mjs, if touched
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

Only run tests for files actually touched.

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

Do not run session/MCP/CLI broad gates unless this route touches those areas or validation points to a cross-cutting failure.

## Residue cleanup

Clean generated residue when safe:

- permissions.jsonl changes
- history.db changes
- undefined/
- temporary logs
- /tmp/private-agents-test/test-results/real-user-capabilities-report.json

Report anything that cannot be cleaned.

## Success criteria

Route 39 is complete only if:

- broad apply_patch planning/classification is clearer
- delete operation no-write classification is clearer
- move operation no-write classification is clearer
- mixed supported/unsupported operation classification is clearer
- no new write capability was added
- supported write lanes still pass
- unsupported/no-write lanes still pass
- exactly-three remains planning/no-write
- changedFiles / plannedFiles / failedFiles are preserved
- writer/deleteMove/creator flags are preserved
- result contract passes
- deterministic release passes
- no readiness claims changed
- no provider/session/CLI/MCP behavior changed
- no package scripts or default gates changed

## Stop conditions

Stop and report if:

- clearer classification requires enabling broad apply_patch writes
- clearer classification requires enabling delete/move writes
- classification changes writer invocation
- classification changes supported write behavior
- result contract cannot be preserved
- unsupported/no-write gates fail
- deterministic release fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Roadmap alignment
4. Pre-coding broad/delete/move inventory
5. Planning/classification changes
6. Files changed
7. Forbidden files touched? yes/no
8. Product behavior changed? yes/no
9. New write capability added? yes/no
10. Delete/move/broad writes still unsupported? yes/no
11. Three-file write still no-write? yes/no
12. Mixed supported/unsupported still no-write? yes/no
13. changedFiles/plannedFiles/failedFiles preservation evidence
14. writer/deleteMove/creator flag evidence
15. Focused tests added/reused
16. Focused validation results
17. Final validation results
18. Residue cleanup status
19. Claim/readiness changes
20. Residual risks
21. Recommended next route
22. Proposed commit message

## Commit and push policy

Do not commit or push.
Propose a commit message only.
