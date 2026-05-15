# Route 65: bounded small-N write policy implementation

## Objective

Replace the current count-by-count write expansion with a bounded small-N write policy.

Route 64 implemented selected-workspace exactly-four update, mixed, delete-only, and move-only support. Continuing with exactly-five and exactly-six routes would be too slow.

Route 65 should introduce a clear small-N policy:

- support selected-workspace bounded write batches up to a fixed cap
- recommended cap: 8 operations
- keep 9+ writes blocked
- keep broad arbitrary apply_patch blocked
- preserve all existing workspace, approval, preflight, verification, recovery-authority, and result-projection semantics

This route should be audit-plus-implementation, not audit-only unless a real blocker is found.

The target capability is:

- update-only batches up to 8 files
- mixed batches up to 8 operations
- delete-only batches up to 8 files
- move-only batches up to 8 moves
- operations drawn only from existing guarded operation kinds:
  - update
  - add/create
  - delete
  - move
- selected-workspace only
- explicit approval naming all affected paths
- workspace authority for every source and target path
- final stale-read / preflight before any writer starts
- non-default recovery-authority capture before any writer starts
- parsed-order sequential execution
- per-file post-write verification
- changedFiles / failedFiles / plannedFiles preserved
- journal and recoveryPlan coverage
- explicit restore drills for partial failures
- no automatic recovery
- no atomic rollback

This route must not implement broad arbitrary apply_patch, 9+ writes, directory delete/move, overwrite, provider changes, MCP changes, package scripts, default gates, default persistence, automatic recovery, or transaction rollback.

## Current state

Build on the current working tree. Do not reset Route 57-64 changes.

Current supported write surfaces:

- selected-workspace single-file update/create/move/delete
- exactly-two update
- exactly-three update
- exactly-four update
- exactly-two mixed
- exactly-three mixed
- exactly-four mixed
- exactly-two / exactly-three / exactly-four delete-only
- exactly-two / exactly-three / exactly-four move-only

Current recovery authority surface:

- recoveryAuthorityStore
- restorePrimitive
- recoveryAuthorityIndex
- restorePreview
- restoreExecutionBridge
- recoverySurfaceProjection
- non-default pre-write capture for supported write surfaces
- explicit restore drills for partial failures

Still unsupported before this route:

- 5+ writes
- broad arbitrary apply_patch
- directory delete/move
- overwrite
- automatic recovery
- atomic rollback
- default restore UX

## Reference scan first

Do a bounded implementation-oriented scan before code edits.

Primary reference repository:

- opencode: /home/wang/projects/opencode

Secondary references:

- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- opencode: inspect at most 5 directly relevant files
- gemini-cli: inspect at most 2 directly relevant files
- ClaudeCode: inspect at most 2 directly relevant files
- total external files: at most 9
- exceed by at most 2 files only if a direct bounded-operation policy file is clearly useful
- do not copy implementation code verbatim
- record path references and practical implications only

Search focus:

opencode:

- apply_patch
- patch
- permission
- multi file
- snapshot
- revert
- operation count
- diff metadata

gemini-cli:

- edit
- write-file
- checkpoint
- restore
- tool result

ClaudeCode:

- FileEditTool
- fileHistory
- stale
- edit failure
- permission

The scan should answer:

1. Do references use explicit operation-count caps or broad patch machinery?
2. How do they keep multi-file permission/confirmation understandable?
3. How do they represent affected paths for larger bounded sets?
4. How do they preserve recovery/checkpoint authority for larger sets?
5. What is the smallest local equivalent for a capped small-N policy?

Record findings in docs/design/bounded-small-n-write-policy.md.

## Validation policy

Use focused validation. Do not run broad package tests.

Preflight:

- rtk git status --short --branch
- rtk git diff --check

After docs-only tasks:

- rtk git diff --check

After code/test tasks:

- run focused tests for touched modules only
- rtk git diff --check

Final:

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult src/orchestration/patchRecovery
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Do not run broad package tests. Do not expand into unrelated broad package-test failures outside touched areas.

Do not run provider/default/CLI/MCP gates.

## Read first

Design/roadmap:

- docs/design/edit-capability-roadmap.md
- docs/design/bounded-exactly-four-write-surface.md
- docs/design/bounded-destructive-multi-delete-move.md
- docs/design/exactly-three-mixed-write-implementation.md
- docs/design/minimum-recovery-authority-loop.md
- docs/design/recovery-authority-coverage-drills.md
- docs/design/explicit-restore-surface.md

Routing / planning / result files:

- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileUpdatePlanning.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileUpdateApply.ts
- packages/ts-shell/src/orchestration/patchResult/mixedOperationReadiness.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveRoute.ts
- packages/ts-shell/src/orchestration/patchResult/routeScopedEditJournal.ts
- packages/ts-shell/src/orchestration/patchResult/journalFailureConsumer.ts
- packages/ts-shell/src/orchestration/patchResult/journalResultProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalRecoveryPlanProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalRecoveryReadinessProjection.ts

Recovery modules:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts
- packages/ts-shell/src/orchestration/patchRecovery/restorePrimitive.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreExecutionBridge.ts
- packages/ts-shell/src/orchestration/patchRecovery/restorePreview.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoverySurfaceProjection.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoveryPreWriteCapture.ts if present

Tests:

- mutationRoutingProjection tests
- multiFileUpdatePlanning tests
- multiFileWriteRoute tests
- multiFileWriteResult tests
- mixedOperationReadiness tests
- perFilePatchPlan tests
- mixedFileWriteRoute tests
- mixedFileWriteResult tests
- patchRecovery tests

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchRecovery/*
- focused tests for touched modules
- docs/design/bounded-small-n-write-policy.md
- docs/design/edit-capability-roadmap.md, concise Route 65 update only
- docs/design/bounded-exactly-four-write-surface.md, Route 65 note only
- docs/design/recovery-authority-coverage-drills.md, Route 65 note only
- docs/design/explicit-restore-surface.md, Route 65 note only
- this route spec

Preferred implementation approach:

- introduce a central bounded write policy constant/helper
- recommended name:
  - boundedWritePolicy.ts
  - boundedOperationPolicy.ts
  - smallNWritePolicy.ts
- recommended active cap:
  - maxBoundedWriteOperations = 8
- route count checks should use this cap instead of hard-coded exactly-two/three/four gates where clean
- keep broad arbitrary apply_patch blocked
- keep 9+ blocked
- avoid arbitrary-N generalization
- avoid package script changes

Forbidden unless a blocker is reported first:

- broad arbitrary apply_patch
- 9+ writes
- directory delete/move
- overwrite
- default durable persistence
- automatic recovery
- atomic transaction rollback
- provider/session/CLI/MCP behavior changes
- package scripts
- default gates
- git/shadow-git integration
- broad CLI/session restore UX
- parser rewrite unrelated to bounded small-N recognition

## Batched tasks

### Task 1: bounded small-N policy design note

Create docs/design/bounded-small-n-write-policy.md.

Include:

- post-Route 64 baseline
- bounded reference scan summary
- why exact-count-by-count development should stop
- selected cap and rationale
- recommended cap: 8
- supported operation families
- excluded operation shapes
- operation count boundary
- approval and workspace authority semantics
- stale-read / preflight semantics
- sequential execution semantics
- recovery-authority capture semantics
- partial-failure restore drill semantics
- no automatic recovery / no atomic rollback
- why 9+ and broad apply_patch remain delayed
- next-route decision criteria

Minimum validation:

- rtk git diff --check

### Task 2: introduce central bounded write policy

Add a small helper for operation-count policy.

Preferred file:

- packages/ts-shell/src/orchestration/patchResult/boundedWritePolicy.ts

Preferred exports:

- MAX_BOUNDED_WRITE_OPERATIONS = 8
- MIN_MULTI_WRITE_OPERATIONS = 2
- isBoundedWriteOperationCount(count: number): boolean
- isTooManyBoundedWriteOperations(count: number): boolean
- maybe helpers for supported family labels:
  - update-only
  - mixed
  - delete-only
  - move-only

Rules:

- count 1 remains single-file route territory where existing routing expects it
- count 2-8 are bounded multi-operation candidates
- count 9+ are too-many / unsupported
- helper must not imply broad apply_patch support
- helper must not bypass operation-kind validation

Minimum validation:

- focused tests for boundedWritePolicy
- rtk git diff --check

### Task 3: migrate update-only route from exact counts to bounded small-N

Update multi-file update planning/routing/writer support.

Required behavior:

- update-only batches with 2-8 distinct existing files are supported
- exactly-two/three/four update behavior remains compatible
- 9+ update remains unsupported/no-write
- all targets selected-workspace contained
- explicit approval names all files
- final stale-read / preflight runs before writer
- recovery-authority capture captures all originals before any writer starts
- sequential writer and per-file verification continue
- partial failure preserves changedFiles / failedFiles / plannedFiles
- no automatic recovery
- no atomic rollback

Minimum validation:

- focused multiFileUpdatePlanning / multiFileWriteRoute / multiFileWriteResult tests
- tests for 5, 8 supported and 9 blocked
- regression tests for 2/3/4 still passing
- rtk git diff --check

### Task 4: migrate mixed route to bounded small-N

Update mixed readiness/routing/writer support.

Required behavior:

- mixed batches with 2-8 operations are supported if every operation is from existing guarded kinds:
  - update
  - add/create
  - delete
  - move
- exactly-two/three/four mixed behavior remains compatible
- 9+ mixed remains unsupported/no-write
- broad arbitrary apply_patch remains unsupported
- all source/target paths selected-workspace contained
- no directory delete/move
- no overwrite
- no reused source/target collisions
- no invalid move cycles/swaps unless already proven safe
- explicit approval names all affected paths
- final stale-read / preflight runs before writer
- recovery-authority capture records all before-states before writer start
- sequential writer and per-file verification continue
- partial failure preserves changedFiles / failedFiles / plannedFiles
- no automatic recovery
- no atomic rollback

Required tests:

- 5-operation representative mixed supported
- 8-operation representative mixed supported
- 9-operation mixed blocked
- all existing exactly-two/three/four mixed tests preserved
- representative repeated-kind mixed within cap works over distinct paths
- invalid destructive boundaries remain blocked

Minimum validation:

- focused mixedOperationReadiness / perFilePatchPlan / mixedFileWriteRoute / mixedFileWriteResult tests
- rtk git diff --check

### Task 5: migrate delete-only and move-only destructive batches to bounded small-N

Update destructive batch support.

Delete-only required behavior:

- delete-only batches with 2-8 distinct existing regular files are supported
- 9+ delete-only remains unsupported
- no directories
- no duplicate target paths
- selected-workspace only
- explicit approval names all targets
- capture all originals before any delete starts
- sequential delete and per-file verification
- partial failure preserves result semantics

Move-only required behavior:

- move-only batches with 2-8 moves are supported
- 9+ move-only remains unsupported
- all sources distinct existing regular files
- all targets absent
- no duplicate source paths
- no duplicate target paths
- no source/target cycles or swaps unless already proven safe
- no overwrite
- selected-workspace only
- explicit approval names all source/target paths
- capture source exists and target absent before any move starts
- sequential move and per-file verification
- partial failure preserves result semantics

Required tests:

- 5 delete-only supported
- 8 delete-only supported
- 9 delete-only blocked
- 5 move-only supported
- 8 move-only supported
- 9 move-only blocked
- destructive invalid boundaries remain blocked

Minimum validation:

- focused destructive route/result/readiness tests
- rtk git diff --check

### Task 6: bounded small-N recovery capture and restore drills

Add focused explicit restore drills for bounded small-N representative cases.

Required drills:

1. 8-file update-only partial failure:
   - capture all originals
   - simulate changed prefix and failed suffix
   - explicit restore can restore changed prefix when current-content guard matches
   - hidden user edit blocks restore

2. 8-operation mixed partial failure:
   - include update/add/delete/move where possible
   - capture all before-states
   - explicit restore drill covers safely restorable changed records
   - no automatic recovery
   - no atomic rollback

3. 8-file delete-only partial failure:
   - capture all originals
   - restore deleted prefix only when guard passes
   - user recreation/edit blocks restore

4. 8-move move-only partial failure:
   - capture source/target states
   - restore moved prefix only when guard passes
   - source/target mismatch blocks restore

Required assertions:

- route result recoveryExecuted remains false
- explicit restore execution result may report restored files separately
- rollbackAtomicityClaim remains false
- changedFiles/failedFiles/plannedFiles are preserved
- postWriteVerification and writer flags are preserved
- current-content mismatch blocks restore
- default path has no persistence
- non-default capture path stores authority under explicit ledgerRoot only

Minimum validation:

- focused route / patchRecovery tests
- rtk git diff --check

### Task 7: preserve unsupported boundaries

Add/keep tests proving unsupported boundaries remain blocked:

- 9+ update
- 9+ mixed
- 9+ delete-only
- 9+ move-only
- broad arbitrary apply_patch
- directory delete
- directory move
- overwrite move
- duplicate source/target paths
- source/target cycle or swap if unsupported
- outside-workspace paths
- default no recoveryAuthority capture

Minimum validation:

- focused unsupported/readiness tests
- rtk git diff --check

### Task 8: roadmap and design evidence update

Update docs/design/bounded-small-n-write-policy.md with final implementation notes:

- cap selected
- supported operation families
- excluded shapes
- route/result files changed
- recovery capture behavior
- restore drill behavior
- validation
- residual risks
- next recommendation

Update docs/design/edit-capability-roadmap.md lightly:

- mark Route/Batch 65 as implemented if completed
- update supported capability inventory from exact-count language to bounded small-N language
- keep 9+ writes and broad apply_patch unsupported
- add evidence rows for bounded small-N update/mixed/delete/move coverage
- update recommended future sequence

Update docs/design/bounded-exactly-four-write-surface.md, docs/design/recovery-authority-coverage-drills.md, and docs/design/explicit-restore-surface.md only if needed.

Recommended next route should be one of:

1. Route 66: broad apply_patch readiness and implementation split
   - if bounded small-N succeeds and main remaining blocker is broad generalization

2. Route 66: bounded small-N real/user-facing evidence route
   - if code support exists but evidence/user surface needs strengthening

3. Route 66: user/session explicit restore UX
   - if larger write expansion is now blocked by operator-visible restore controls

Do not write the next route file in this task.

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged unless explicitly part of bounded small-N support:

- single update/create/move/delete behavior
- exactly-two/three/four update behavior
- exactly-two/three/four mixed behavior
- exactly-two/three/four delete-only behavior
- exactly-two/three/four move-only behavior
- unsupported/no-write behavior for 9+ and broad apply_patch
- changedFiles semantics
- failedFiles semantics
- plannedFiles semantics
- postWriteVerification semantics
- writer flags
- package scripts
- provider/session/CLI/MCP behavior
- default runtime persistence absence
- automatic recovery absence
- atomic rollback absence

Non-default explicit test paths may:

- capture recovery authority for bounded small-N operations under explicit ledgerRoot
- run explicit restore drills
- inspect workspace current content for guarded restore

Non-default explicit test paths must not:

- run automatically after write failure
- claim atomic rollback
- alter provider/CLI/session behavior
- create default persistent storage

## Success criteria

Route is complete if:

- bounded small-N design note exists
- bounded reference scan is summarized
- central bounded write policy helper exists and is tested
- update-only supports 2-8 and blocks 9+
- mixed supports 2-8 clean guarded operations and blocks 9+
- delete-only supports 2-8 and blocks 9+
- move-only supports 2-8 and blocks 9+
- broad apply_patch remains blocked
- recovery-authority capture works for representative bounded small-N cases
- partial-failure restore drills exist for representative 8-operation cases
- changedFiles/failedFiles/plannedFiles/postWriteVerification/writer flags are preserved
- recoveryExecuted remains false in route results
- rollbackAtomicityClaim remains false
- automatic recovery remains absent
- default behavior remains unchanged outside new bounded capability
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- bounded small-N requires broad apply_patch generalization
- bounded small-N requires arbitrary-N writer support
- bounded small-N requires parser rewrite
- recovery-authority capture cannot happen before writer
- partial failure cannot preserve changed/failed/planned semantics
- result-contract requires broad public shape churn
- provider/session/CLI/MCP changes become necessary
- automatic recovery or atomic rollback becomes necessary

## Final report

Report:

1. Route
2. External repos scanned and file-count summary
3. Design document added/updated
4. Bounded small-N cap selected
5. Bounded write policy helper status
6. Update-only support status
7. Mixed support status
8. Delete-only support status
9. Move-only support status
10. Unsupported 9+ / broad boundaries
11. Routing changes
12. Result projection changes
13. Recovery-authority capture changes
14. Partial-failure restore drills
15. Files changed
16. Forbidden files touched? yes/no
17. Default runtime behavior changed outside new capability? yes/no
18. 9+ writes / broad apply_patch still blocked? yes/no
19. Automatic recovery added? yes/no
20. Atomic rollback added? yes/no
21. Existing result fields preserved
22. Focused validation
23. Final validation
24. Residue cleanup
25. Residual risks
26. Next recommended route
27. Proposed commit message

Do not commit or push.
