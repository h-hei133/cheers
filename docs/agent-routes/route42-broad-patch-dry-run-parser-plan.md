# Route 42: broad apply_patch structured dry-run parser and plan evaluator, no write

This is a development-only Codex goal spec for bounded implementation work.
It is not a broad edit readiness claim.

## Objective

Continue the edit capability roadmap after Route 35-41.

Route 39 hardened no-write broad/delete/move/mixed classification, but residual risk remained:

- broad diff target extraction is conservative metadata-only classification
- it is not a full broad patch parser
- it is not a writer

Route 42 should introduce or harden a structured broad apply_patch dry-run parser / plan evaluator.

This route must not add broad write capability.

The goal is to parse/evaluate broad apply_patch-shaped model output into a structured no-write plan that can represent update/create/delete/move/mixed operations, target paths, source paths, unsupported reasons, boundary failures, duplicate targets, and malformed sections, while preserving stopped/no-write behavior.

## Current behavior to preserve

Supported lanes remain unchanged:

- single-file selected-workspace update writes
- single-file create writes
- exactly-two update writes
- exactly-three existing-file update writes through the guarded Route 40 lane

No-write lanes remain no-write:

- 4+ update remains unsupported/no-write unless it is only represented as a dry-run plan
- delete remains unsupported/no-write
- move/rename remains unsupported/no-write
- broad apply_patch remains unsupported/no-write
- malformed output remains model-output/error/no-write
- mixed supported/unsupported remains stopped/error/no-write

## Non-goals

Do not implement:

- broad apply_patch writes
- 4+ writes
- delete/move writes
- mixed operation writes
- rollback/atomicity
- snapshot/revert
- automatic recovery/retry/merge
- stale-read recovery
- partial failure recovery
- provider behavior changes
- CLI behavior changes
- session persistence changes
- MCP behavior changes
- package script changes
- default gate changes
- readiness claim changes

Do not change writer invocation conditions for supported lanes.
Do not convert dry-run plans into write authority.

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
- Preserve supported write behavior.
- Preserve unsupported/no-write behavior.
- Preserve result contract and deterministic release claims.
- Preserve default gate membership.

## Required first step

Read:

- docs/design/edit-capability-roadmap.md
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.test.ts
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
- unified diff
- update/create/delete/move operations
- mixed operation parsing/classification
- target path extraction
- source path extraction for move/rename
- duplicate target/source handling
- workspace boundary classification
- perFilePatchPlan operation projection
- Route08 unsupported patch E2E fixtures
- three-file guarded write evidence
- result contract fields

Final report must include a short dry-run parser/plan inventory.

## Fast preflight

Run only:

- rtk git status --short --branch
- rtk git diff --check
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts
- rtk npm run verify:real-user-capabilities:three-file-guarded-write

If Route 40/41 changes are still uncommitted, proceed only if they are expected edit-capability evidence/source files and do not conflict with this route.

## Implementation target

Add a structured dry-run parser/plan evaluator for broad apply_patch-like shapes.

Possible module names:

- packages/ts-shell/src/orchestration/patchResult/broadPatchDryRunPlan.ts
- packages/ts-shell/src/orchestration/patchResult/broadPatchPlanParser.ts
- packages/ts-shell/src/orchestration/patchResult/broadPatchPlanEvaluator.ts

Choose the smallest clean shape based on current code.

The module should produce structured planning output only. It must not call writers.

## Required dry-run plan representation

The dry-run broad patch plan should be able to represent:

- update operation
- create operation
- delete operation unsupported/no-write
- move/rename operation unsupported/no-write
- broad/mixed operation unsupported/no-write
- unknown/malformed operation
- target path
- source path for move/rename when available
- raw operation label or parsed operation kind
- support status
- failure class/reason
- workspace boundary failure
- duplicate target failure
- missing source/destination failure
- planned/no-write vs invalid-model-output distinction
- changedFiles=[]
- writerInvoked=false
- deleteMoveInvoked=false

Integrate with `perFilePatchPlan` where safe.

## Required behavior

Dry-run parser/evaluator may improve metadata and classification, but must preserve current no-write behavior.

Cases that must remain no-write:

- broad apply_patch
- unified diff
- 4+ updates outside allowed lane
- delete
- move/rename
- mixed update+delete
- mixed create+move
- external path operation
- duplicate target operation
- malformed operation/header
- unknown operation

Cases that must remain writable:

- existing single-file update
- existing single-file create
- existing exactly-two update
- existing exactly-three guarded update

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
- scripts/verify-real-user-capabilities.mjs only if current Route08 fixture registration/classification lives there

Prefer adding focused module/tests under `patchResult/`.

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

Add focused tests for the dry-run broad patch plan.

At minimum, cover:

- broad patch with update/create/delete mixed operations yields structured no-write plan
- delete operation yields unsupported delete plan with changedFiles=[]
- move operation yields unsupported move plan with source/target
- unified diff yields unsupported broad/no-write plan, not a write route
- duplicate target yields duplicate-target failure
- missing move source yields missing-source failure
- missing move destination yields missing-target/destination failure
- external target yields workspace-boundary failure if current classifier supports this
- mixed supported update + unsupported delete remains no-write
- mixed supported create + unsupported move remains no-write
- supported single/two/three update lanes remain unaffected

## Focused validation during edits

Run tests only for touched focused modules, then build:

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/broadPatchDryRunPlan.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/mutationRoutingProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/capabilityBoundaryProjection.test.ts
- rtk node --check scripts/verify-real-user-capabilities.mjs, if touched
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

Only run tests for files actually touched.

## Final route-level validation

Run one final validation pass:

- rtk npm run verify:real-user-capabilities:three-file-guarded-write
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

Route 42 is complete only if:

- structured broad patch dry-run plan/evaluator exists or existing plan is meaningfully hardened
- broad/delete/move/mixed operation metadata is clearer
- no broad/delete/move write capability was added
- supported write lanes still pass
- exactly-three guarded write still passes
- 4+ / delete / move / broad remain no-write
- changedFiles / plannedFiles / failedFiles are preserved
- writer/deleteMove/creator flags are preserved
- result contract passes
- deterministic release passes
- no readiness claims changed
- no provider/session/CLI/MCP behavior changed
- no package scripts or default gates changed

## Stop conditions

Stop and report if:

- structured dry-run parser requires enabling broad writes
- structured dry-run parser changes supported write behavior
- dry-run classification changes writer invocation
- result contract cannot be preserved
- unsupported/no-write gates fail
- deterministic release fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Roadmap alignment
4. Pre-coding broad dry-run inventory
5. Dry-run parser/plan changes
6. Files changed
7. Forbidden files touched? yes/no
8. Product behavior changed? yes/no
9. New write capability added? yes/no
10. Broad/delete/move writes still unsupported? yes/no
11. Exactly-three guarded write preserved? yes/no
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
