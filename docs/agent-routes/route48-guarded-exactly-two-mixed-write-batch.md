# Route 48: guarded exactly-two mixed operation write batch

## Objective

Implement guarded exactly-two mixed operation write support in staged phases.

Allowed final scope, if each phase proves safe:

- exactly two operations only
- selected workspace only
- each operation must be one of:
  - Update File
  - Add File
  - Move File
  - Delete File
- no broad apply_patch writer
- no 3+ mixed operations
- no directory delete/move
- no overwrite
- no outside-workspace path
- no duplicate target/source conflict
- no rollback / atomicity claim
- no recovery / retry / merge

This route should proceed phase-by-phase. After each phase, run focused validation. If a phase is unsafe, stop with the already-safe phases implemented and report the blocker.

## Why this route

Route 47 hardened mixed-operation no-write/readiness projection. The next efficient step is not one tiny mixed subset per route. Instead, implement exactly-two mixed operations in ordered phases, with focused validation between phases.

This route must not enable arbitrary mixed writes or broad apply_patch.

## Validation policy

Use light staged validation.

Preflight:

- rtk git status --short --branch
- rtk git diff --check
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/mixedOperationReadiness.test.ts

After each phase:

- run touched focused tests only
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

Final:

- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git status --short --branch

Run these only if shared routing/write code is touched:

- rtk npm run verify:real-user-capabilities:three-file-guarded-write
- rtk npm run verify:real-user-capabilities:single-file-move-evidence
- rtk npm run verify:real-user-capabilities:single-file-delete-evidence

If a new non-default mixed evidence command is added, run it in final validation.

Do not run broad session/MCP/CLI gates unless touched files or failures justify it.

## Boundary check

Before editing, read:

- docs/design/runtime-module-ownership-map.md
- docs/design/edit-capability-roadmap.md

Use them only to confirm:

- this is edit capability work
- SessionManager.ts and cli.tsx remain out of scope
- broad apply_patch remains out of scope
- 3+ mixed writes remain out of scope
- rollback/atomicity remain out of scope
- default gates remain unchanged

Do not restate full route history.

## Narrow reference comparison

Because this route opens mixed write behavior, do a narrow read-only comparison.

Reference only:

- opencode:
  - apply_patch / patch / permission metadata
  - focus: per-file operation model, operation ordering, failure surfaces
- Gemini CLI:
  - file tools / checkpoint / sandbox
  - focus: workspace-safe file operation sequencing and checkpoint boundaries
- Claude Code:
  - FileEditTool result/failure surfaces
  - focus: user-visible failed edit result

Use references only for safety lessons.
Do not copy code.
Keep final report short.

## Read first

Target files:

- packages/ts-shell/src/orchestration/patchResult/mixedOperationReadiness.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceCreateResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteResult.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*
- package.json

Locate current handling for:

- single update
- single create
- single move
- single delete
- mixed operation readiness
- changedFiles / failedFiles / plannedFiles
- writerInvoked / creatorInvoked / deleteMoveInvoked
- perFilePatchPlan operation projection
- stale-read / final preflight
- post-write verification
- partial failure surface

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- focused orchestration tests
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*
- package.json only for a new non-default script

Forbidden:

- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/core/mcp/*
- provider/auth core
- MCP core
- docs/* except this route spec
- default gate membership

## Global capability scope

The mixed writer may execute only if all are true:

1. exactly two operations
2. both paths are inside selected workspace
3. operation kinds are parseable and individually supported by existing single-operation lanes
4. no broad apply_patch writer
5. no 3+ operations
6. no duplicate target path
7. no source/target conflict
8. no overwrite
9. no directory delete/move
10. all final preflight checks pass before any write starts
11. perFilePatchPlan records both operations as supported-write
12. post-write verification runs for both operations
13. no rollback/atomicity claim

If any guard fails, result must be stopped/no-write.

## Phase 1: shared mixed write contract and executor

Implement or harden shared support for exactly-two mixed operations.

Required:

- explicit mixed operation plan
- deterministic operation ordering
- preflight-all-before-write
- per-operation writer result facts
- changedFiles / failedFiles / plannedFiles projection
- writerInvoked / creatorInvoked / deleteMoveInvoked aggregation
- post-write verification aggregation
- no rollback/atomicity claim

Recommended ordering model:

1. parse and classify both operations
2. validate all workspace/source/target/preconditions
3. execute operations in deterministic order
4. verify all results
5. project partial failure if needed

The code must document the ordering choice.

If Phase 1 cannot be implemented cleanly, stop before adding mixed writes.

## Phase 2: non-destructive mixed lane

Implement exactly-two:

- Update File + Add File

Guard requirements:

- update target exists and is regular file
- create target does not exist
- both targets inside workspace
- targets distinct
- stale/final preflight passes
- post-write verification passes both files

This is the first and safest mixed lane.

Run focused validation before Phase 3.

## Phase 3: move mixed lanes

Implement exactly-two, if Phase 2 is stable:

- Update File + Move File
- Add File + Move File

Guard requirements:

- move source exists and is regular file
- move target does not exist
- update target exists if present
- create target does not exist if present
- no source/target collision across operations
- no directory move
- no overwrite
- all paths inside workspace
- post-write verification covers all operations

Run focused validation before Phase 4.

## Phase 4: delete mixed lanes

Implement exactly-two, if Phase 3 is stable:

- Update File + Delete File
- Add File + Delete File
- Move File + Delete File

Guard requirements:

- delete target exists and is regular file
- no directory delete
- no missing target success
- no source/target collision across operations
- no delete of a path also needed by another operation unless explicitly rejected
- all paths inside workspace
- post-write verification covers all operations

If destructive mixed operations require confirmation UI, rollback, or broader authority to be honest, stop before Phase 4 and report blocker.

## Still unsupported after Route 48

Must remain unsupported/no-write:

- 3+ mixed operations
- broad arbitrary apply_patch
- unified diff broad writer
- directory delete/move
- overwrite
- recursive operations
- rollback/atomicity
- recovery/retry/merge
- outside workspace operations
- malformed/unknown operations

## Evidence / verifier requirements

If feasible, add one non-default evidence command:

- verify:real-user-capabilities:mixed-operation-evidence

It should cover:

- update+create success
- at least one move mixed success if Phase 3 implemented
- at least one delete mixed success if Phase 4 implemented
- 3+ mixed remains no-write
- broad apply_patch remains no-write
- outside/duplicate/conflict cases remain no-write
- no rollback/atomicity claim

Do not add to default gates.

## Tests required

Add/update focused tests per implemented phase.

Phase 1 tests:

- mixed plan preserves operation order/kinds
- preflight failure blocks before writer
- flags aggregate correctly
- no rollback/atomicity claim

Phase 2 tests:

- update+create success
- update missing blocked
- create target exists blocked
- duplicate target blocked
- outside path blocked
- partial failure projects changed/failed distinctly if safely simulatable

Phase 3 tests, if implemented:

- update+move success
- create+move success
- move source missing blocked
- move target exists blocked
- move conflicts with update/create blocked
- directory move blocked

Phase 4 tests, if implemented:

- update+delete success
- create+delete success
- move+delete success
- delete missing blocked
- directory delete blocked
- delete conflicts blocked

Preservation tests:

- single update/create/move/delete still pass
- exactly-two update still pass
- exactly-three update still pass if shared routing touched
- broad apply_patch remains no-write
- 3+ mixed remains no-write

## Focused validation

Run touched tests only, likely:

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/mixedOperationReadiness.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/mutationRoutingProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/mutationExecution.test.ts
- rtk node --check scripts/verify-real-user-capabilities.mjs, if touched
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

## Success criteria

Route is complete if:

- Phase 1 is implemented, or route stops with clear blocker before behavior changes
- Phase 2 update+create is implemented if safe
- Phase 3 move mixed lanes are implemented if safe
- Phase 4 delete mixed lanes are implemented if safe
- any skipped phase has a clear blocker
- no 3+ mixed writes added
- no broad apply_patch writer added
- no rollback/atomicity claim added
- single-operation lanes remain intact
- unsupported broad/3+/malformed remain no-write
- changedFiles/plannedFiles/failedFiles are accurate
- writer/creator/deleteMove flags are accurate
- non-default evidence exists if feasible and passes
- unsupported-patch E2E passes
- result contract passes
- build passes
- no default gate changed
- no provider/session/CLI/MCP behavior changed
- residue cleaned
- no commit/push

## Stop conditions

Stop and report if:

- mixed support cannot be separated from broad apply_patch
- 3+ mixed support becomes necessary
- rollback/atomicity is required to be honest
- destructive mixed operations require confirmation UI or broader authority
- result contract cannot preserve file-list/writer flag semantics
- unsupported-patch E2E cannot be preserved
- implementation requires touching SessionManager.ts or cli.tsx
- implementation requires default gate changes

## Final report

Report:

1. Route
2. Phases completed
3. Phases skipped and blockers
4. Exact new write capability scope
5. Boundary/map check result
6. Narrow reference comparison summary
7. Ordering rule
8. Guard evidence
9. Files changed
10. Forbidden files touched? yes/no
11. Product behavior changed? yes/no
12. New mixed write capabilities
13. Still unsupported capabilities
14. Single-operation lanes preserved
15. Non-default evidence, if added
16. File list / writer flag / post-verification evidence
17. Focused validation
18. Final validation
19. Residue cleanup
20. Claim/readiness changes
21. Residual risks
22. Next recommended route
23. Proposed commit message

Do not commit or push.
