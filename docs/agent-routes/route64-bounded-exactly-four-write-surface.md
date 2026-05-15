# Route 64: bounded exactly-four write surface implementation

## Objective

Implement bounded selected-workspace exactly-four write support across the existing guarded operation families.

This route should continue the aggressive post-Route 63 expansion, but still avoid broad arbitrary apply_patch.

Route 62 enabled exactly-three mixed writes.

Route 63 enabled bounded destructive batches:

- exactly-two / exactly-three delete-only
- exactly-two / exactly-three move-only

Route 64 should now open the next bounded write tier:

- exactly-four update-only writes
- exactly-four mixed writes from existing operation kinds
- exactly-four delete-only writes, if destructive audit passes
- exactly-four move-only writes, if destructive audit passes

This route should not be audit-only unless the audit finds a real blocker.

Required constraints:

- selected-workspace only
- explicit approval covering all affected files
- workspace authority for all source and target paths
- final stale-read / preflight before writer
- non-default recovery-authority capture before any writer starts
- parsed-order sequential execution
- per-file post-write verification
- changedFiles / failedFiles / plannedFiles preserved
- journal and recoveryPlan coverage
- explicit restore drills for partial failure
- no automatic recovery
- no atomic rollback

Still blocked:

- 5+ writes
- broad arbitrary apply_patch
- directory delete/move
- overwrite
- reused source/target paths
- outside-workspace paths
- provider/session/CLI/MCP changes
- package scripts
- default gates

## Current state

Build on the current working tree. Do not reset Route 57-63 changes.

Current supported write surfaces:

- selected-workspace single-file update/create/move/delete
- exactly-two update
- exactly-three update
- exactly-two mixed
- exactly-three mixed
- exactly-two / exactly-three delete-only
- exactly-two / exactly-three move-only

Current recovery authority surface:

- recoveryAuthorityStore
- restorePrimitive
- recoveryAuthorityIndex
- restorePreview
- restoreExecutionBridge
- recoverySurfaceProjection
- non-default pre-write capture for supported narrow routes
- explicit restore drills for partial failures

Still unsupported before this route:

- exactly-four write batches
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
- exceed by at most 2 files only if a direct multi-operation implementation file is clearly useful
- do not copy implementation code verbatim
- record path references and practical implications only

Search focus:

opencode:

- apply_patch
- patch
- multi file
- delete
- move
- permission
- snapshot
- revert
- partial failure

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

The scan should answer:

1. How do references manage larger multi-file operation sets?
2. Do they cap operation counts or rely on broad patch machinery?
3. How do they keep permission/confirmation understandable?
4. How do they handle partial failure / restore authority?
5. What is the smallest local equivalent for exactly-four bounded writes?

Record findings in docs/design/bounded-exactly-four-write-surface.md.

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

Do not expand into unrelated broad package-test failures outside touched areas.

Do not run provider/default/CLI/MCP gates.

## Read first

Design/roadmap:

- docs/design/edit-capability-roadmap.md
- docs/design/exactly-three-mixed-write-implementation.md
- docs/design/bounded-destructive-multi-delete-move.md
- docs/design/minimum-recovery-authority-loop.md
- docs/design/recovery-authority-coverage-drills.md
- docs/design/explicit-restore-surface.md

Routing / planning / result files:

- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/mixedOperationReadiness.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveResult.ts
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
- mixedOperationReadiness tests
- perFilePatchPlan tests
- mixedFileWriteRoute tests
- mixedFileWriteResult tests
- multiFileWriteRoute tests
- multiFileWriteResult tests
- workspaceDeleteRoute tests
- workspaceMoveRoute tests
- patchRecovery tests

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchRecovery/*
- focused tests for touched modules
- docs/design/bounded-exactly-four-write-surface.md
- docs/design/edit-capability-roadmap.md, concise Route 64 update only
- docs/design/recovery-authority-coverage-drills.md, Route 64 note only
- docs/design/bounded-destructive-multi-delete-move.md, Route 64 note only
- docs/design/explicit-restore-surface.md, Route 64 note only
- this route spec

Preferred implementation approach:

- reuse existing per-file plan / mixed route / destructive batch infrastructure
- keep exactly-four as a bounded capability
- do not generalize to arbitrary N
- avoid broad parser rewrites
- avoid package script changes

Forbidden unless a blocker is reported first:

- broad arbitrary apply_patch
- 5+ writes
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
- parser rewrite unrelated to bounded exactly-four recognition

## Batched tasks

### Task 1: exactly-four write design and readiness note

Create docs/design/bounded-exactly-four-write-surface.md.

Include:

- post-Route 63 baseline
- bounded reference scan summary
- current exactly-three mixed architecture
- current destructive batch architecture
- exactly-four implementation decision
- supported operation families
- excluded operation shapes
- operation count boundary
- approval and workspace authority semantics
- stale-read / preflight semantics
- sequential execution semantics
- recovery-authority capture semantics
- partial-failure restore drill semantics
- no automatic recovery / no atomic rollback
- why 5+ and broad apply_patch remain delayed
- next-route decision criteria

Minimum validation:

- rtk git diff --check

### Task 2: exactly-four readiness audit

Audit current update/mixed/destructive infrastructure before implementing.

Document findings in the design note.

The audit should answer:

- where exactly-two and exactly-three update counts are recognized
- where exactly-two and exactly-three mixed counts are recognized
- where exactly-two and exactly-three delete-only/move-only are recognized
- where 4+ writes are currently blocked
- whether existing per-file plan metadata supports four operations cleanly
- whether recoveryAuthority capture can capture all four before writer start
- whether result projection can preserve changed/failed/planned semantics for four operations
- whether partial failure restore drills can cover changed prefix
- what must stay blocked for 5+ and broad apply_patch

Minimum validation:

- no tests required unless code is touched
- rtk git diff --check

### Task 3: implement exactly-four update-only writes

Extend the existing multi-file update route to support exactly-four existing-file update operations.

Required behavior:

- all four targets are distinct existing regular files
- selected-workspace containment required
- explicit approval names all four files
- final stale-read / preflight runs before writer
- non-default recovery-authority capture captures all four originals before any writer starts
- writer executes in parsed order
- post-write verification runs per file
- partial failure preserves changedFiles / failedFiles / plannedFiles
- no automatic recovery
- no atomic rollback
- 5+ update remains unsupported/no-write

Minimum validation:

- focused multiFileWriteRoute / multiFileWriteResult tests
- focused recovery capture tests
- unsupported 5+ update test
- rtk git diff --check

### Task 4: implement exactly-four mixed writes

Extend the mixed write route to support exactly-four mixed operations from existing operation kinds:

- update
- add/create
- move
- delete

Required behavior:

- all source/target paths selected-workspace contained
- no duplicate invalid paths
- no reused source/target collisions
- no directory delete/move
- no overwrite
- no move-with-content-edit
- explicit approval names all affected files
- final stale-read / preflight runs before writer
- non-default recoveryAuthority capture records all four before-states before writer start
- writer executes in parsed order
- post-write verification runs per operation
- changedFiles / failedFiles / plannedFiles preserved
- journal and recoveryPlan include all four operations where safe
- 5+ mixed remains unsupported/no-write

Preferred supported representative families:

- update + add + delete + move
- update + update + add + delete
- update + update + add + move
- update + delete + move + add
- repeated-kind mixed quads over distinct paths if local model supports them

If every possible four-operation mixed combination is too large, implement a documented broad representative subset and keep excluded combinations blocked with tests.

Minimum validation:

- focused mixedOperationReadiness / perFilePatchPlan / mixedFileWriteRoute / mixedFileWriteResult tests
- rtk git diff --check

### Task 5: implement exactly-four delete-only and move-only batches

Extend destructive batch support from Route 63.

Delete-only required behavior:

- exactly-four delete-only if audit passes
- all targets distinct existing regular files
- no directories
- selected-workspace only
- explicit approval names all targets
- capture all originals before any delete starts
- sequential delete and per-file verification
- 5+ delete-only remains unsupported

Move-only required behavior:

- exactly-four move-only if audit passes
- all sources distinct existing regular files
- all targets absent
- no duplicate targets
- no source/target cycles or swaps unless deliberately supported; default reject
- no overwrite
- selected-workspace only
- explicit approval names all source/target paths
- capture source exists and target absent before any move starts
- sequential move and per-file verification
- 5+ move-only remains unsupported

If exactly-four move-only has collision complexity beyond this route, implement exactly-four delete-only and document move-only blocker.

Minimum validation:

- focused destructive route/result tests
- focused unsupported destructive boundary tests
- rtk git diff --check

### Task 6: exactly-four partial-failure restore drills

Add focused explicit restore drills.

Required drills:

1. exactly-four update:
   - capture all originals
   - simulate partial failure after a changed prefix
   - explicit restore can restore changed prefix when current-content guard matches
   - hidden user edit blocks restore

2. exactly-four mixed:
   - use update + add + delete + move or closest supported representative
   - capture all before-states
   - explicit restore drill covers safely restorable changed records
   - no automatic recovery
   - no atomic rollback

3. exactly-four delete-only:
   - capture all originals
   - partial failure drill restores deleted files only when guard passes
   - user recreation/edit blocks restore

4. exactly-four move-only if supported:
   - capture source/target before-states
   - partial failure drill restores moved files only when guard passes
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

- 5+ update
- 5+ mixed
- 5+ delete-only
- 5+ move-only
- broad arbitrary apply_patch
- directory delete
- directory move
- overwrite move
- duplicate source/target path
- source/target cycle or swap if unsupported
- outside-workspace paths
- default no recoveryAuthority capture

Minimum validation:

- focused unsupported/readiness tests
- rtk git diff --check

### Task 8: roadmap and design evidence update

Update docs/design/bounded-exactly-four-write-surface.md with final implementation notes:

- supported exactly-four families
- excluded combinations
- route/result files changed
- recovery capture behavior
- restore drill behavior
- validation
- residual risks
- next recommendation

Update docs/design/edit-capability-roadmap.md lightly:

- mark Route/Batch 64 as implemented if completed
- update supported capability inventory
- keep 5+ writes and broad apply_patch unsupported
- add evidence rows for exactly-four update/mixed/delete/move coverage
- update recommended future sequence

Update docs/design/recovery-authority-coverage-drills.md, docs/design/bounded-destructive-multi-delete-move.md, and docs/design/explicit-restore-surface.md only if needed.

Recommended next route should be one of:

1. Route 65: 5-operation / small-N bounded write policy decision
   - if exactly-four succeeds and arbitrary-N is still too risky

2. Route 65: broad apply_patch readiness map plus implementation candidate split
   - if bounded surfaces are now sufficiently covered and the main remaining blocker is broad generalization

3. Route 65: user/session explicit restore UX
   - if larger write expansion is now blocked by operator-visible restore controls

Do not write the next route file in this task.

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged unless explicitly part of exactly-four support:

- single update/create/move/delete behavior
- exactly-two update behavior
- exactly-three update behavior
- exactly-two mixed behavior
- exactly-three mixed behavior
- exactly-two/three delete-only behavior
- exactly-two/three move-only behavior
- unsupported/no-write behavior for 5+ and broad apply_patch
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

- capture recovery authority for exactly-four operations under explicit ledgerRoot
- run explicit restore drills
- inspect workspace current content for guarded restore

Non-default explicit test paths must not:

- run automatically after write failure
- claim atomic rollback
- alter provider/CLI/session behavior
- create default persistent storage

## Success criteria

Route is complete if:

- exactly-four write design note exists
- bounded reference scan is summarized
- exactly-four readiness audit is documented
- exactly-four update-only is implemented
- exactly-four mixed is implemented for all clean representative families
- exactly-four delete-only is implemented if audit passes
- exactly-four move-only is implemented if audit passes or blocker documented
- 5+ writes and broad apply_patch remain blocked
- recovery-authority capture works for supported exactly-four families
- partial-failure restore drills exist for supported exactly-four families
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

- exactly-four requires broad apply_patch generalization
- exactly-four requires arbitrary-N writer support
- exactly-four requires parser rewrite
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
4. Exactly-four readiness audit result
5. Exactly-four update support status
6. Exactly-four mixed support status
7. Exactly-four delete-only support status
8. Exactly-four move-only support status
9. Unsupported 5+ / broad boundaries
10. Routing changes
11. Result projection changes
12. Recovery-authority capture changes
13. Partial-failure restore drills
14. Files changed
15. Forbidden files touched? yes/no
16. Default runtime behavior changed outside new capability? yes/no
17. 5+ writes / broad apply_patch still blocked? yes/no
18. Automatic recovery added? yes/no
19. Atomic rollback added? yes/no
20. Existing result fields preserved
21. Focused validation
22. Final validation
23. Residue cleanup
24. Residual risks
25. Next recommended route
26. Proposed commit message

Do not commit or push.
