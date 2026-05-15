# Route 63: bounded destructive multi-delete and multi-move implementation

## Objective

Implement bounded destructive multi-delete and multi-move write support using the recovery-authority base built in Routes 59-62.

This route should not be audit-only unless the audit finds a real blocker.

Route 62 enabled exactly-three mixed writes while preserving 4+ mixed and broad apply_patch as blocked. The remaining high-value destructive gap is standalone multi-delete and multi-move support.

Target capability:

- selected-workspace exactly-two delete-only batch
- selected-workspace exactly-three delete-only batch, if audit passes
- selected-workspace exactly-two move-only batch
- selected-workspace exactly-three move-only batch, if audit passes
- optional bounded destructive mixed families such as delete+delete+move or move+move+delete only if the existing exactly-three mixed route cannot already cover them cleanly and the implementation remains small

Required safety:

- explicit approval covering every destructive affected path
- workspace authority for all source and target paths
- no directory delete
- no directory move
- no overwrite
- no reused source/target paths
- no outside-workspace paths
- final stale-read / preflight checks before writer
- non-default recovery-authority capture before any writer starts
- parsed-order sequential execution
- per-file post-write verification
- partial failure surfaces with changedFiles / failedFiles / plannedFiles
- journal and recoveryPlan coverage
- explicit restore drills for destructive partial failures
- no automatic recovery
- no atomic rollback

This route must not implement broad arbitrary apply_patch, 4+ writes, provider changes, MCP changes, package scripts, default gates, default durable persistence, automatic recovery, or transaction rollback.

## Current state

Build on the current working tree. Do not reset Route 57-62 changes.

Current supported write surfaces:

- selected-workspace single-file update/create/move/delete
- exactly-two update
- exactly-three update
- exactly-two mixed
- exactly-three mixed

Current recovery authority surface:

- recoveryAuthorityStore
- restorePrimitive
- restoreExecutionBridge
- recoveryAuthorityIndex
- restorePreview
- recoverySurfaceProjection
- non-default pre-write capture for existing narrow routes
- explicit partial-failure restore drills

Still unsupported before this route:

- standalone multi-delete
- standalone multi-move
- directory delete/move
- overwrite
- 4+ writes
- broad arbitrary apply_patch
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

- opencode: inspect at most 6 directly relevant files
- gemini-cli: inspect at most 3 directly relevant files
- ClaudeCode: inspect at most 2 directly relevant files
- total external files: at most 11
- exceed by at most 2 files only if a direct destructive-operation file is clearly useful
- do not copy implementation code verbatim
- record path references and practical implications only

Search focus:

opencode:

- apply_patch
- delete
- move
- remove
- rename
- snapshot
- revert
- permission
- destructive

gemini-cli:

- edit
- write-file
- restore
- checkpoint
- file operation
- delete
- move

ClaudeCode:

- FileEditTool
- FileWriteTool
- fileHistory
- stale
- delete
- move
- destructive

The scan should answer:

1. How do references treat destructive multi-file operations?
2. How do they scope permission/confirmation for multiple destructive targets?
3. How do they prevent overwrite, target reuse, path collisions, and hidden user edits?
4. How do recovery/checkpoint systems restore destructive operations?
5. What is the smallest local equivalent for bounded multi-delete/multi-move?

Record findings in docs/design/bounded-destructive-multi-delete-move.md.

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
- docs/design/minimum-recovery-authority-loop.md
- docs/design/recovery-authority-coverage-drills.md
- docs/design/explicit-restore-surface.md

Routing / planning / result files:

- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/mixedOperationReadiness.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveResult.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/routeScopedEditJournal.ts
- packages/ts-shell/src/orchestration/patchResult/journalFailureConsumer.ts
- packages/ts-shell/src/orchestration/patchResult/journalResultProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalRecoveryPlanProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalRecoveryReadinessProjection.ts

Recovery modules:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts
- packages/ts-shell/src/orchestration/patchRecovery/restorePrimitive.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreExecutionBridge.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoveryPreWriteCapture.ts if present
- packages/ts-shell/src/orchestration/patchRecovery/restorePreview.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoverySurfaceProjection.ts

Tests:

- workspaceDeleteRoute tests
- workspaceMoveRoute tests
- mixedOperationReadiness tests
- perFilePatchPlan tests
- mixedFileWriteRoute tests
- mixedFileWriteResult tests
- multiFileWriteRoute tests
- restorePrimitive / restoreExecutionBridge tests

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchRecovery/*
- focused tests for touched modules
- docs/design/bounded-destructive-multi-delete-move.md
- docs/design/edit-capability-roadmap.md, concise Route 63 update only
- docs/design/recovery-authority-coverage-drills.md, Route 63 note only
- docs/design/explicit-restore-surface.md, Route 63 note only
- this route spec

Conditionally allowed if it keeps the implementation cleaner:

- a new patchResult route/result module for bounded destructive batches, for example:
  - destructiveMultiFileWriteRoute.ts
  - destructiveMultiFileWriteResult.ts
  - destructiveOperationReadiness.ts

Preferred approach:

- reuse existing per-file plan / mixed write infrastructure if clean
- add a dedicated destructive-batch module only if forcing delete-only/move-only into mixed route makes code worse

Forbidden unless a blocker is reported first:

- broad arbitrary apply_patch
- 4+ writes
- directory delete/move
- overwrite
- default durable persistence
- automatic recovery
- atomic transaction rollback
- provider/session/CLI/MCP behavior changes
- package scripts
- default gates
- git/shadow-git integration
- parser rewrite unrelated to destructive batch recognition
- patchApplication rewrites unrelated to current write lanes

## Batched tasks

### Task 1: destructive multi-operation design and readiness note

Create docs/design/bounded-destructive-multi-delete-move.md.

Include:

- post-Route 62 baseline
- bounded reference scan summary
- current single delete / single move architecture
- current exactly-three mixed architecture
- destructive multi-delete decision
- destructive multi-move decision
- supported operation counts
- excluded destructive shapes
- collision / reuse / overwrite policy
- approval and workspace authority semantics
- final stale-read / preflight semantics
- sequential execution semantics
- recovery-authority capture semantics
- partial-failure restore drill semantics
- no automatic recovery / no atomic rollback
- why broad apply_patch and 4+ writes remain delayed
- next-route decision criteria

Minimum validation:

- rtk git diff --check

### Task 2: destructive readiness audit

Audit current single delete/move, mixed, and per-file plan infrastructure before implementing.

Document findings in the design note.

The audit should answer:

- where single delete is recognized and routed
- where single move is recognized and routed
- where pure multi-delete/multi-move are currently blocked
- whether existing mixed infrastructure can represent delete-only/move-only batches
- whether per-file plan metadata can represent all sources/targets
- whether target collision and reused-path checks already exist
- how recoveryAuthority capture records delete and move before-states
- how post-write verification works for delete and move
- what must change for exactly-two/exactly-three destructive batches
- what must remain blocked

Minimum validation:

- no tests required unless code is touched
- rtk git diff --check

### Task 3: implement bounded multi-delete planning and routing

Implement selected-workspace multi-delete support.

Required support:

- exactly-two delete-only batch
- exactly-three delete-only batch if audit passes; otherwise document blocker and implement exactly-two only

Required behavior:

- all targets must be selected-workspace contained
- all targets must be existing regular files
- no directories
- no duplicate target paths
- no outside-workspace paths
- explicit approval names all deleted files
- final stale-read / preflight runs before writer
- recovery-authority capture stores original content for every target before any delete starts
- writer deletes in parsed order
- post-delete verification runs per file
- partial failure preserves changedFiles / failedFiles / plannedFiles
- no automatic recovery
- no atomic rollback

Minimum validation:

- focused routing/readiness/result tests for multi-delete
- focused recovery capture tests
- rtk git diff --check

### Task 4: implement bounded multi-move planning and routing

Implement selected-workspace multi-move support.

Required support:

- exactly-two move-only batch
- exactly-three move-only batch if audit passes; otherwise document blocker and implement exactly-two only

Required behavior:

- all source and target paths must be selected-workspace contained
- all sources must be existing regular files
- all targets must be absent
- no directories
- no duplicate source paths
- no duplicate target paths
- no source/target collision unless a deliberately supported safe swap is proven; default should reject swaps/cycles
- no overwrite
- explicit approval names all source and target paths
- final stale-read / preflight runs before writer
- recovery-authority capture records source exists and target absent before any move starts
- writer moves in parsed order
- post-move verification runs per move
- partial failure preserves changedFiles / failedFiles / plannedFiles
- no automatic recovery
- no atomic rollback

Minimum validation:

- focused routing/readiness/result tests for multi-move
- focused recovery capture tests
- rtk git diff --check

### Task 5: destructive result projection and journal/recoveryPlan coverage

Update result projection as needed.

Required behavior:

- changedFiles includes only verified destructive changes
- failedFiles includes failed destructive operations
- plannedFiles includes all destructive planned files
- move plannedFiles includes source and destination representation consistent with existing move semantics
- journal metadata includes every destructive operation
- recoveryPlan reflects captured authority in explicit non-default path
- recoveryReadiness remains explicit and non-automatic
- recoveryExecuted remains false in route results
- rollbackAtomicityClaim remains false
- automaticRecovery remains false
- exactly-two/three mixed behavior from Route 62 remains unchanged
- 4+ mixed and broad apply_patch remain blocked

Minimum validation:

- focused result/journal/recoveryPlan tests
- rtk git diff --check

### Task 6: destructive partial-failure restore drills

Add focused explicit restore drills.

Required multi-delete drill:

- capture two or three files before delete starts
- simulate partial delete failure after one or more deletes
- explicit restore restores deleted files only when current-content guard matches expected absent/current state
- restore is blocked if user recreates/edits target after failure
- no atomic rollback claim

Required multi-move drill:

- capture source exists and target absent before moves
- simulate partial move failure after one or more moves
- explicit restore can move/restore affected files back only when current-content guard passes
- restore is blocked on target/source mismatch or hidden user edit
- no safe swap/cycle unless deliberately supported

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

- focused destructive route / patchRecovery tests
- rtk git diff --check

### Task 7: destructive unsupported boundaries

Add/keep tests proving unsupported destructive shapes stay blocked:

- 4+ delete-only
- 4+ move-only
- directory delete
- directory move
- overwrite move
- move target exists
- duplicate delete path
- duplicate move source
- duplicate move target
- source/target cycle or swap if not explicitly supported
- outside-workspace source/target
- broad arbitrary apply_patch still no-write
- default no recoveryAuthority capture

Minimum validation:

- focused unsupported/readiness tests
- rtk git diff --check

### Task 8: roadmap and design evidence update

Update docs/design/bounded-destructive-multi-delete-move.md with final implementation notes:

- supported delete counts
- supported move counts
- excluded destructive shapes
- routing/result files changed
- recovery capture behavior
- restore drill behavior
- validation
- residual risks
- next recommendation

Update docs/design/edit-capability-roadmap.md lightly:

- mark Route/Batch 63 as implemented if completed
- update supported capability inventory
- keep 4+ writes and broad apply_patch unsupported
- add evidence rows for multi-delete/multi-move route/result/recovery coverage
- update recommended future sequence

Update docs/design/recovery-authority-coverage-drills.md and docs/design/explicit-restore-surface.md only if needed.

Recommended next route should be one of:

1. Route 64: 4-operation bounded write readiness and implementation
   - if multi-delete/multi-move succeeds and evidence is stable

2. Route 64: user/session explicit restore UX
   - if larger destructive support reveals operator-visible restore controls are the next blocker

3. Route 64: broad apply_patch readiness map
   - if bounded surfaces are now sufficiently covered and only broad generalization remains

Do not write the next route file in this task.

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged unless explicitly part of bounded destructive support:

- single update/create/move/delete default behavior
- exactly-two update behavior
- exactly-three update behavior
- exactly-two mixed behavior
- exactly-three mixed behavior
- unsupported/no-write behavior for 4+ and broad apply_patch
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

- capture recovery authority for multi-delete/multi-move under explicit ledgerRoot
- run explicit restore drills
- inspect workspace current content for guarded restore

Non-default explicit test paths must not:

- run automatically after write failure
- claim atomic rollback
- alter provider/CLI/session behavior
- create default persistent storage

## Success criteria

Route is complete if:

- destructive multi-operation design note exists
- bounded reference scan is summarized
- destructive readiness audit is documented
- exactly-two multi-delete is implemented
- exactly-two multi-move is implemented
- exactly-three multi-delete and exactly-three multi-move are implemented, or blockers are documented
- unsupported destructive shapes remain blocked
- recovery-authority capture works for supported destructive batches
- partial-failure restore drills exist for supported destructive batches
- changedFiles/failedFiles/plannedFiles/postWriteVerification/writer flags are preserved
- recoveryExecuted remains false in route results
- rollbackAtomicityClaim remains false
- automatic recovery remains absent
- default behavior remains unchanged outside new bounded destructive capabilities
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- multi-delete/multi-move require broad apply_patch route changes
- multi-delete/multi-move require parser rewrite
- destructive support requires 4+ arbitrary write support
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
4. Destructive readiness audit result
5. Multi-delete support status
6. Multi-move support status
7. Unsupported destructive boundaries
8. Routing changes
9. Result projection changes
10. Recovery-authority capture changes
11. Partial-failure restore drills
12. Files changed
13. Forbidden files touched? yes/no
14. Default runtime behavior changed outside new capability? yes/no
15. 4+ writes / broad apply_patch still blocked? yes/no
16. Automatic recovery added? yes/no
17. Atomic rollback added? yes/no
18. Existing result fields preserved
19. Focused validation
20. Final validation
21. Residue cleanup
22. Residual risks
23. Next recommended route
24. Proposed commit message

Do not commit or push.
