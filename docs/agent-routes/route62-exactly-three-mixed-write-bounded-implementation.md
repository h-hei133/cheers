# Route 62: exactly-three mixed write readiness and bounded implementation

## Objective

Implement a bounded exactly-three mixed write capability if the readiness audit confirms the existing route/result/recovery-authority infrastructure can support it safely.

This route should not be audit-only unless the audit finds a real blocker.

Route 59-61 created a stronger safety base:

- non-default recovery authority store
- pre-write capture across existing narrow write routes
- explicit restore primitive
- partial-failure restore drills
- restore preview / execution bridge
- authority index
- recovery surface projection
- current-content guards
- no automatic recovery
- no atomic rollback

Route 62 should now use that base to expand edit capability from exactly-two mixed writes to exactly-three mixed writes.

The target capability is:

- selected-workspace exactly-three mixed operations
- operations drawn from existing narrow lanes:
  - update
  - add/create
  - move
  - delete
- explicit approval / workspace authority / final stale-read / per-file verification preserved
- parsed-order sequential execution
- no atomic rollback claim
- non-default recovery-authority capture available
- partial failure surfaces include changedFiles, failedFiles, plannedFiles, journal, recoveryPlan, and captured authority where applicable

This route must not implement broad arbitrary apply_patch, 4+ writes, 3+ arbitrary mixed beyond exactly three, multi-delete/multi-move as a standalone broad destructive feature, automatic recovery, atomic rollback, provider changes, MCP changes, package scripts, or default gates.

## Current state

Build on the current working tree. Do not reset Route 57-61 changes.

Current supported write surfaces:

- selected-workspace single-file update/create/move/delete
- exactly-two update
- exactly-three update
- exactly-two mixed write lanes

Current recovery authority surface:

- recoveryAuthorityStore
- restorePrimitive
- recoveryAuthorityIndex
- restorePreview
- restoreExecutionBridge
- recoverySurfaceProjection
- non-default pre-write capture for existing narrow write surfaces
- partial-failure restore drills

Still unsupported before this route:

- exactly-three mixed writes
- 4+ writes
- broad arbitrary apply_patch
- broad multi-delete/multi-move
- directory delete/move
- overwrite
- automatic recovery
- atomic rollback

## Reference scan first

Do a bounded implementation-oriented reference scan before code edits.

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
- exceed by at most 2 files only if a direct mixed-write file is clearly useful
- do not copy implementation code verbatim
- record path references and practical implications only

Search focus:

opencode:

- apply_patch
- patch
- edit
- move
- delete
- add
- snapshot
- revert
- permission
- mixed operation

gemini-cli:

- edit
- write-file
- restore
- checkpoint
- tool result
- file operation

ClaudeCode:

- FileEditTool
- file history
- stale
- read-before-write
- tool result
- edit failure

The scan should answer:

1. How does the reference handle multiple file operations in one tool call?
2. Are destructive operations treated differently from update/add?
3. How is permission/confirmation scoped for multiple files?
4. How is partial failure explained?
5. What concept should this project copy for exactly-three mixed while staying bounded?

Record findings in docs/design/exactly-three-mixed-write-implementation.md.

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

Run optional focused real-user capability gate only if this route adds or updates a dedicated exactly-three mixed evidence script. Do not create or run broad/default/provider/CLI/MCP gates.

Do not expand into unrelated failures outside touched areas.

## Read first

Design/roadmap:

- docs/design/edit-capability-roadmap.md
- docs/design/minimum-recovery-authority-loop.md
- docs/design/recovery-authority-coverage-drills.md
- docs/design/explicit-restore-surface.md
- docs/design/durable-authority-decision.md

Mixed write / patch result files:

- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/mixedOperationReadiness.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceCreateRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/routeScopedEditJournal.ts
- packages/ts-shell/src/orchestration/patchResult/journalFailureConsumer.ts
- packages/ts-shell/src/orchestration/patchResult/journalResultProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalRecoveryPlanProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalRecoveryReadinessProjection.ts

Recovery modules:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoveryPreWriteCapture.ts if present
- packages/ts-shell/src/orchestration/patchRecovery/restorePrimitive.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreExecutionBridge.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoverySurfaceProjection.ts

Tests:

- mixedOperationReadiness tests
- perFilePatchPlan tests
- mixedFileWriteRoute tests
- mixedFileWriteResult tests
- mutationRoutingProjection tests if present
- recovery authority / restore drill tests touched by Routes 59-61

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchRecovery/*
- focused tests for touched modules
- docs/design/exactly-three-mixed-write-implementation.md
- docs/design/edit-capability-roadmap.md, concise Route 62 update only
- docs/design/recovery-authority-coverage-drills.md, Route 62 note only
- docs/design/explicit-restore-surface.md, Route 62 note only
- this route spec

Conditionally allowed if the project already has this pattern:

- scripts/verify-three-mixed-guarded-write.mjs or similarly named focused evidence script
- package script only if there is already a clear local convention for per-capability evidence scripts and the addition is minimal

Forbidden unless a blocker is reported first:

- broad arbitrary apply_patch
- 4+ writes
- 3+ arbitrary mixed beyond exactly-three
- default durable persistence
- automatic recovery
- atomic transaction rollback
- provider/session/CLI/MCP behavior changes
- broad CLI/session restore UX
- default gates
- git/shadow-git integration
- parser rewrite
- patchApplication rewrites unrelated to mixed route needs

## Batched tasks

### Task 1: exactly-three mixed design and readiness note

Create docs/design/exactly-three-mixed-write-implementation.md.

Include:

- post-Route 61 baseline
- bounded reference scan summary
- current exactly-two mixed architecture
- exactly-three mixed implementation decision
- supported operation combinations
- excluded operation combinations, if any
- ordering semantics
- approval/workspace/stale-read/verification semantics
- non-default recovery-authority capture semantics
- partial-failure semantics
- restore drill semantics
- no automatic recovery / no atomic rollback
- why broad apply_patch remains delayed
- next-route decision criteria

Minimum validation:

- rtk git diff --check

### Task 2: readiness audit of current mixed route

Audit current exactly-two mixed route and tests before implementing.

Document findings in the design note.

The audit should answer:

- where exactly-two mixed is recognized
- where exactly-two mixed is routed
- where operation count is limited
- where unsupported 3+ mixed is currently blocked
- how per-file plans are generated
- how changedFiles/failedFiles/plannedFiles are projected
- how recovery authority capture is attached
- how partial failure is represented
- what needs to change for exactly-three mixed
- what must remain unchanged for 4+ mixed and broad apply_patch

Minimum validation:

- no tests required unless code is touched
- rtk git diff --check

### Task 3: extend mixed-operation readiness to exactly-three

Update mixedOperationReadiness and/or perFilePatchPlan logic so exactly-three mixed can be classified as supported under the explicit bounded route.

Required behavior:

- exactly-three mixed operations from update/add/move/delete can be recognized
- 4+ mixed operations remain unsupported/no-write
- broad arbitrary apply_patch remains unsupported
- directory delete/move, overwrite, outside-workspace, invalid move targets, and invalid destructive shapes remain blocked
- plannedFiles and per-file operation metadata remain accurate

If some three-operation combinations are too risky, support a documented subset first. Preferred minimum subset:

- update + add + delete
- update + add + move
- update + delete + move
- update + update + add or update + update + delete, if local model allows repeated operation kinds over distinct files

Minimum validation:

- focused mixedOperationReadiness/perFilePatchPlan tests
- rtk git diff --check

### Task 4: route exactly-three mixed writes

Update mutationRoutingProjection and mixedFileWriteRoute so exactly-three mixed requests reach the mixed write route.

Required behavior:

- exactly-two mixed behavior remains unchanged
- exactly-three mixed is enabled only for selected-workspace explicit write route
- 4+ mixed remains unsupported/no-write
- unsupported/no-write result surfaces remain unchanged for broad/invalid shapes
- approval naming covers all affected files
- workspace authority covers all source/target paths
- final stale-read / preflight checks run before writer
- writer execution remains parsed-order sequential
- no automatic recovery
- no atomic rollback

Minimum validation:

- focused mutationRoutingProjection tests if touched
- focused mixedFileWriteRoute tests
- rtk git diff --check

### Task 5: extend writer execution and result projection

Update mixedFileWriteRoute / mixedFileWriteResult as needed.

Required behavior:

- exactly-three mixed sequential writes execute in parsed order
- per-file post-write verification runs for all three operations
- changedFiles only includes verified changed files
- failedFiles includes failed files
- plannedFiles includes all planned files
- partial failure preserves changed prefix and failed suffix semantics
- journal metadata includes all three planned operations
- recoveryPlan reflects captured authority where explicit non-default capture is enabled
- routeScopedEditJournal / recoveryPlan / recoverySurfaceProjection continue to preserve:
  - recoveryExecuted: false
  - rollbackAtomicityClaim: false
  - automaticRecovery: false
  - no atomic rollback claim

Minimum validation:

- focused mixedFileWriteRoute / mixedFileWriteResult tests
- focused journal/recoveryPlan tests if touched
- rtk git diff --check

### Task 6: integrate non-default recovery-authority capture

Extend existing Route 59-60 recovery-authority capture to exactly-three mixed.

Required behavior:

- capture all three operation before-states before any writer starts
- update/delete source content is captured
- add/create beforeState absent is captured
- move captures source exists and target absent if local record shape supports it; otherwise capture source and document target-absent blocker
- if capture fails, stop before writer if local route semantics allow
- default behavior without explicit recoveryAuthority option remains unchanged
- recoveryPlan can reflect captured authority where safe

Minimum validation:

- focused mixedFileWriteRoute recoveryAuthority tests
- focused recoveryPreWriteCapture tests if touched
- rtk git diff --check

### Task 7: exactly-three mixed partial-failure restore drills

Add focused tests that simulate exactly-three mixed partial failures and explicit restore drills.

Required drills:

1. update + add + delete:
   - capture all before-states
   - simulate partial failure after one or two operations
   - explicit restore can restore changed verified prefix where current-content guard matches
   - restore is blocked on hidden user edit

2. update + add + move or update + delete + move:
   - capture move/update/delete authority
   - explicit restore drill covers the changed records that are safely restorable
   - no atomic rollback claim

3. 4+ mixed blocked:
   - verify unsupported/no-write remains blocked
   - no recoveryAuthority capture should occur by default

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

- focused mixedFileWriteRoute / patchRecovery tests
- rtk git diff --check

### Task 8: update evidence and roadmap

Update docs/design/exactly-three-mixed-write-implementation.md with final implementation notes:

- supported combinations
- excluded combinations
- route/result files changed
- capture behavior
- partial-failure restore drills
- validation
- residual risks
- next recommendation

Update docs/design/edit-capability-roadmap.md lightly:

- mark Route/Batch 62 as implemented if completed
- update supported capability inventory to include exactly-three mixed write if implemented
- keep 4+ writes and broad apply_patch unsupported
- add evidence rows for exactly-three mixed route/result/recovery coverage
- update recommended future sequence

Update docs/design/recovery-authority-coverage-drills.md and docs/design/explicit-restore-surface.md only if needed.

Recommended next route should be one of:

1. Route 63: 4-operation bounded write readiness and implementation
   - if exactly-three mixed succeeds and evidence is stable

2. Route 63: destructive multi-delete/multi-move readiness
   - if exactly-three mixed reveals destructive-operation-specific risk

3. Route 63: user/session explicit restore UX
   - if larger write support is now blocked by lack of user-facing recovery controls

Do not write the next route file in this task.

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged unless explicitly part of exactly-three mixed support:

- single update/create/move/delete default behavior
- exactly-two update behavior
- exactly-three update behavior
- exactly-two mixed behavior
- unsupported/no-write behavior for 4+ mixed and broad apply_patch
- changedFiles semantics
- failedFiles semantics
- plannedFiles semantics
- postWriteVerification semantics
- writer flags
- package scripts unless a minimal focused evidence script follows existing convention
- provider/session/CLI/MCP behavior
- default runtime persistence absence
- automatic recovery absence
- atomic rollback absence

Non-default explicit test paths may:

- capture recovery authority for exactly-three mixed under explicit ledgerRoot
- run explicit restore drills
- inspect workspace current content for guarded restore

Non-default explicit test paths must not:

- run automatically after write failure
- claim atomic rollback
- alter provider/CLI/session behavior
- create default persistent storage

## Success criteria

Route is complete if:

- exactly-three mixed design note exists
- bounded reference scan is summarized
- readiness audit is documented
- exactly-three mixed support is implemented or a clear blocker is documented
- 4+ mixed and broad apply_patch remain blocked
- non-default recovery-authority capture works for exactly-three mixed
- partial-failure restore drills exist for representative exactly-three mixed cases
- changedFiles/failedFiles/plannedFiles/postWriteVerification/writer flags are preserved
- recoveryExecuted remains false in route results
- rollbackAtomicityClaim remains false
- automatic recovery remains absent
- default behavior remains unchanged outside new exactly-three mixed route
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- exactly-three mixed requires broad apply_patch route changes
- exactly-three mixed requires parser rewrite
- exactly-three mixed requires 4+ arbitrary write support
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
4. Readiness audit result
5. Supported exactly-three mixed combinations
6. Excluded combinations and blockers
7. Routing changes
8. Result projection changes
9. Recovery-authority capture changes
10. Partial-failure restore drills
11. Files changed
12. Forbidden files touched? yes/no
13. Default runtime behavior changed outside new capability? yes/no
14. 4+ mixed / broad apply_patch still blocked? yes/no
15. Automatic recovery added? yes/no
16. Atomic rollback added? yes/no
17. Existing result fields preserved
18. Focused validation
19. Final validation
20. Residue cleanup
21. Residual risks
22. Next recommended route
23. Proposed commit message

Do not commit or push.
