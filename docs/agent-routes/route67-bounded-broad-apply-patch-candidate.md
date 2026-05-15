# Route 67: bounded broad apply_patch candidate implementation

## Objective

Implement the first bounded broad apply_patch candidate path.

Route 65 introduced a bounded small-N write policy with cap 8.

Route 66 added explicit restore UX and CLI/session command surface.

Route 67 should now start dismantling the broad apply_patch blocker, but only for the safe subset that can be normalized into existing guarded bounded small-N operations.

This route should allow apply_patch payloads to execute only when all of these are true:

- selected-workspace authority exists
- operation count is 1-8
- every operation normalizes to an existing guarded operation kind:
  - update
  - add/create
  - delete
  - move
- every path passes workspace containment
- every target/source precondition is already handled by existing route semantics
- no directory delete/move
- no overwrite
- no reused source/target collision
- no unsupported broad diff shape
- no fuzzy patch recovery requirement
- no parser rewrite
- recovery-authority capture can happen before writer start
- result projection can preserve changedFiles / failedFiles / plannedFiles
- explicit restore remains separate and guarded

This route must keep blocked:

- 9+ writes
- arbitrary broad apply_patch
- unsupported diff shapes
- directory operations
- overwrite
- fuzzy patch
- provider/session/MCP changes
- package scripts
- default gates
- automatic recovery
- atomic rollback

This route should be audit-plus-implementation, not audit-only unless a real blocker is found.

## Current state

Build on the current working tree. Do not reset Route 57-66 changes.

Current supported write surface:

- selected-workspace single-file update/create/move/delete
- bounded update-only batches with 2-8 files
- bounded mixed batches with 2-8 operations
- bounded delete-only batches with 2-8 files
- bounded move-only batches with 2-8 moves
- 9+ writes remain blocked
- broad arbitrary apply_patch remains blocked

Current recovery surface:

- non-default recovery authority store
- pre-write capture across supported bounded write surfaces
- guarded restore primitive
- restore preview
- explicit restore execution bridge
- recovery authority index
- session/user recovery summary
- local /restore command path
- no automatic recovery
- no atomic rollback

Known Route 66 validation note:

- The final broad focused suite had unrelated existing failures in src/core/shell/recovery.* caused by runtimeContext path.resolve(undefined).
- Do not expand into unrelated recovery test failures unless this route touches those paths.
- Focus validation on touched apply_patch / patchResult / patchRecovery / command surface files.

## Reference scan first

Do a bounded implementation-oriented scan before code edits.

Primary reference repository:

- opencode: /home/wang/projects/opencode

Secondary references:

- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- opencode: inspect at most 7 directly relevant files
- gemini-cli: inspect at most 3 directly relevant files
- ClaudeCode: inspect at most 3 directly relevant files
- total external files: at most 13
- exceed by at most 2 files only if a direct broad patch routing file is clearly useful
- do not copy implementation code verbatim
- record path references and practical implications only

Search focus:

opencode:

- apply_patch
- patch parser
- patch operation
- permission
- diff metadata
- snapshot
- revert
- file operation

gemini-cli:

- edit
- write-file
- apply patch
- tool result
- checkpoint
- restore

ClaudeCode:

- FileEditTool
- FileWriteTool
- fileHistory
- stale
- edit failure
- read-before-write

The scan should answer:

1. How does opencode normalize broad patch input into per-file operations?
2. How does it separate parse / plan / permission / apply / snapshot?
3. Which broad patch shapes should remain unsupported locally?
4. How do references avoid overclaiming broad arbitrary edit readiness?
5. What is the smallest local equivalent for bounded broad apply_patch?

Record findings in docs/design/bounded-broad-apply-patch-candidate.md.

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

Do not run broad package tests.

Do not run provider/default/MCP gates.

If touched session/command restore files are included by focused path and unrelated core/shell/recovery failures appear again, document them and narrow to touched tests.

## Read first

Design/roadmap:

- docs/design/edit-capability-roadmap.md
- docs/design/bounded-small-n-write-policy.md
- docs/design/explicit-restore-ux-cli-surface.md
- docs/design/explicit-restore-surface.md
- docs/design/minimum-recovery-authority-loop.md
- docs/design/recovery-authority-coverage-drills.md

Parsing / routing / planning:

- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/boundedWritePolicy.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileUpdatePlanning.ts
- packages/ts-shell/src/orchestration/patchResult/mixedOperationReadiness.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/singleFileApplyPatchDryRun.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceCreateRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveRoute.ts

Journal / recovery:

- packages/ts-shell/src/orchestration/patchResult/journalResultProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalRecoveryPlanProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalRecoveryReadinessProjection.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts
- packages/ts-shell/src/orchestration/patchRecovery/restorePreview.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreExecutionBridge.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoverySurfaceProjection.ts

Tests:

- mutationRoutingProjection tests
- boundedWritePolicy tests
- singleFileApplyPatchDryRun tests
- multiFileUpdatePlanning tests
- mixedOperationReadiness tests
- perFilePatchPlan tests
- mixedFileWriteRoute tests
- mixedFileWriteResult tests
- multiFileWriteRoute tests
- multiFileWriteResult tests
- patchRecovery tests touched by recovery-authority capture

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchRecovery/*
- focused tests for touched modules
- docs/design/bounded-broad-apply-patch-candidate.md
- docs/design/edit-capability-roadmap.md, concise Route 67 update only
- docs/design/bounded-small-n-write-policy.md, Route 67 note only
- docs/design/explicit-restore-ux-cli-surface.md, Route 67 note only
- this route spec

Conditionally allowed if clean:

- a small bounded apply_patch normalization helper, for example:
  - boundedApplyPatchCandidate.ts
  - broadApplyPatchBoundedProjection.ts
  - applyPatchSmallNCandidate.ts

Forbidden unless a blocker is reported first:

- broad arbitrary apply_patch
- 9+ writes
- fuzzy patch recovery
- parser rewrite
- directory delete/move
- overwrite
- default durable persistence
- automatic recovery
- atomic transaction rollback
- provider/session/MCP behavior changes
- package scripts
- default gates
- git/shadow-git integration
- broad CLI/session restore UX changes
- SessionManager persistence changes

## Batched tasks

### Task 1: bounded broad apply_patch design note

Create docs/design/bounded-broad-apply-patch-candidate.md.

Include:

- post-Route 66 baseline
- bounded reference scan summary
- current broad apply_patch blocker
- local normalization strategy
- operation count boundary
- supported normalized operation kinds
- unsupported broad shapes
- workspace / approval / stale-read / verification semantics
- recovery-authority capture semantics
- result / journal / recoveryPlan semantics
- restore UX interaction
- why 9+ and arbitrary broad remain blocked
- next-route decision criteria

Minimum validation:

- rtk git diff --check

### Task 2: audit broad apply_patch blocker and current dispatch

Audit current broad apply_patch handling before implementation.

Document findings in the design note.

The audit should answer:

- where broad apply_patch currently becomes unsupported/no-write
- which parsed patch shapes already normalize to update/add/delete/move
- which shapes fail because of count limits versus unsupported semantics
- where selected-workspace authority is checked
- where approval naming happens
- where per-file plan metadata is constructed
- where 9+ is blocked
- how recoveryAuthority capture is attached
- what must change to allow bounded broad apply_patch
- what must remain blocked

Minimum validation:

- no tests required unless code is touched
- rtk git diff --check

### Task 3: add bounded apply_patch candidate classifier

Add a pure helper if current code lacks a clean owner.

Preferred file:

- packages/ts-shell/src/orchestration/patchResult/boundedApplyPatchCandidate.ts

The helper should classify a parsed apply_patch payload into:

- executableBoundedSmallN
- unsupportedTooManyOperations
- unsupportedBroadShape
- unsupportedDestructiveShape
- unsupportedPathConflict
- unsupportedWorkspaceBoundary
- unsupportedOverwrite
- unsupportedDirectoryOperation
- unsupportedFuzzyPatch

Preferred output:

- status:
  - "candidate"
  - "unsupported"
- operationCount
- operationFamily:
  - "single"
  - "update-only"
  - "mixed"
  - "delete-only"
  - "move-only"
- normalizedOperations
- affectedPaths
- approvalPaths
- rejectionReason
- evidence

Rules:

- 1 operation should still route to existing single-file routes if local dispatch expects that.
- 2-8 operations may become bounded small-N candidates.
- 9+ operations must remain unsupported.
- helper must not read or write files.
- helper must not bypass existing workspace/preflight checks.
- helper must not imply broad arbitrary support.
- helper must not perform recovery.

Minimum validation:

- focused tests for boundedApplyPatchCandidate
- include supported 1, 2, 5, 8 cases and blocked 9+ cases
- include invalid directory/overwrite/path conflict examples
- rtk git diff --check

### Task 4: route bounded broad apply_patch candidates into existing small-N routes

Update mutationRoutingProjection and/or existing patchResult routing so candidate apply_patch payloads reach the appropriate existing route:

- single operation -> existing single-file update/create/delete/move route
- update-only 2-8 -> multiFileWriteRoute
- mixed 2-8 -> mixedFileWriteRoute
- delete-only 2-8 -> bounded destructive delete path
- move-only 2-8 -> bounded destructive move path

Required behavior:

- existing direct small-N routes remain unchanged
- bounded broad apply_patch candidates reuse existing route semantics
- 9+ remains unsupported/no-write
- invalid broad shapes remain unsupported/no-write
- broad arbitrary apply_patch label should not appear in success claims; describe as bounded apply_patch candidate or bounded small-N apply_patch
- approval names all affected paths
- workspace authority covers all source/target paths
- final stale-read / preflight before writer
- recoveryAuthority capture before writer if explicit non-default option is enabled
- sequential execution and verification preserved

Minimum validation:

- focused mutationRoutingProjection tests
- focused route tests for each family
- rtk git diff --check

### Task 5: result/journal/recovery surface for bounded apply_patch candidates

Ensure bounded apply_patch candidate results preserve existing result semantics.

Required behavior:

- changedFiles / failedFiles / plannedFiles unchanged from underlying route behavior
- postWriteVerification unchanged
- writer flags unchanged
- journal includes normalized operations
- recoveryPlan can reflect captured authority
- recoverySurface summary remains correct
- recoveryExecuted remains false in route results
- rollbackAtomicityClaim remains false
- automatic recovery remains absent
- unsupported broad shapes remain stopped/no-write with actionable reason

Minimum validation:

- focused result/journal/recoveryPlan tests
- rtk git diff --check

### Task 6: end-to-end bounded apply_patch candidate tests

Add focused tests that simulate broad apply_patch-looking payloads but route only safe bounded candidates.

Required supported tests:

1. single update apply_patch candidate routes to existing single update path
2. 5-file update-only apply_patch candidate routes to bounded update path
3. 8-operation mixed apply_patch candidate routes to bounded mixed path
4. 8 delete-only apply_patch candidate routes to bounded delete path
5. 8 move-only apply_patch candidate routes to bounded move path
6. non-default recoveryAuthority capture works for at least one bounded apply_patch candidate
7. partial failure restore drill works for at least one bounded apply_patch candidate

Required blocked tests:

1. 9+ update apply_patch remains blocked
2. 9+ mixed apply_patch remains blocked
3. broad arbitrary unsupported shape remains blocked
4. directory delete/move remains blocked
5. overwrite remains blocked
6. path reuse/collision remains blocked
7. outside-workspace remains blocked
8. fuzzy/ambiguous patch shape remains blocked if current parser exposes such a case

Required assertions:

- no automatic recovery
- no atomic rollback
- default path has no persistence
- result fields are preserved
- blocked results remain no-write

Minimum validation:

- focused tests for touched routing/result modules
- rtk git diff --check

### Task 7: preserve no-write planning and unsupported surfaces

Update no-write planning only if needed.

Required behavior:

- dry-run/no-write mode may classify bounded candidates as planned bounded operations
- dry-run/no-write must not authorize writes
- unsupported broad apply_patch remains stopped/no-write
- 9+ remains too-many/no-write
- approval-pending or dry-run must not become write authorization
- result contract remains stable

Minimum validation:

- focused singleFileApplyPatchDryRun / planning tests if touched
- verify:result-contract in final
- rtk git diff --check

### Task 8: roadmap and design evidence update

Update docs/design/bounded-broad-apply-patch-candidate.md with final implementation notes:

- supported bounded apply_patch candidate families
- blocked broad shapes
- route/result files changed
- recovery-authority capture behavior
- restore drill behavior
- validation
- residual risks
- next recommendation

Update docs/design/edit-capability-roadmap.md lightly:

- mark Route/Batch 67 as implemented if completed
- update capability inventory:
  - bounded small-N apply_patch candidates are supported
  - broad arbitrary apply_patch remains unsupported
  - 9+ remains unsupported
- add evidence rows for bounded apply_patch normalization/routing/recovery coverage
- update recommended future sequence

Update docs/design/bounded-small-n-write-policy.md and docs/design/explicit-restore-ux-cli-surface.md only if needed.

Recommended next route should be one of:

1. Route 68: broad apply_patch unsupported-shape hardening and UX
   - if bounded candidate path succeeds and the remaining problem is explaining blocked broad shapes

2. Route 68: 9+ / arbitrary-N policy decision
   - if bounded candidate path is stable and operation-count cap is the next blocker

3. Route 68: broad arbitrary apply_patch readiness map
   - if local implementation is now close enough to evaluate full broad support

Do not write the next route file in this task.

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged unless explicitly part of bounded apply_patch candidate support:

- existing single-file behavior
- bounded small-N update/mixed/delete/move behavior
- 9+ blocked behavior
- broad arbitrary apply_patch blocked behavior
- no-write/dry-run does not authorize writes
- changedFiles semantics
- failedFiles semantics
- plannedFiles semantics
- postWriteVerification semantics
- writer flags
- package scripts
- provider/session/MCP behavior
- default runtime persistence absence
- automatic recovery absence
- atomic rollback absence

Non-default explicit test paths may:

- capture recovery authority for bounded apply_patch candidates under explicit ledgerRoot
- run explicit restore drills
- inspect workspace current content for guarded restore

Non-default explicit test paths must not:

- run automatically after write failure
- claim atomic rollback
- alter provider/session/MCP behavior
- create default persistent storage

## Success criteria

Route is complete if:

- bounded broad apply_patch design note exists
- bounded reference scan is summarized
- broad apply_patch blocker audit is documented
- bounded apply_patch candidate classifier exists and is tested
- safe apply_patch candidates with 1-8 operations route to existing guarded write paths
- 9+ apply_patch remains blocked
- unsupported broad shapes remain blocked
- recovery-authority capture works for representative bounded candidates
- partial-failure restore drill exists for representative bounded candidate
- no-write/dry-run remains non-authorizing
- changedFiles/failedFiles/plannedFiles/postWriteVerification/writer flags are preserved
- recoveryExecuted remains false in route results
- rollbackAtomicityClaim remains false
- automatic recovery remains absent
- broad arbitrary apply_patch readiness is not claimed
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- bounded apply_patch requires parser rewrite
- bounded apply_patch requires arbitrary broad diff support
- classifier cannot distinguish safe bounded candidates from unsupported broad shapes
- no-write planning would become write authorization
- recoveryAuthority capture cannot happen before writer
- result-contract requires broad public shape churn
- provider/session/MCP changes become necessary
- automatic recovery or atomic rollback becomes necessary

## Final report

Report:

1. Route
2. External repos scanned and file-count summary
3. Design document added/updated
4. Broad apply_patch blocker audit result
5. Bounded candidate classifier status
6. Supported bounded apply_patch candidate families
7. Blocked broad shapes
8. Routing changes
9. Result projection changes
10. Recovery-authority capture changes
11. Partial-failure restore drill
12. No-write planning / dry-run preservation
13. Files changed
14. Forbidden files touched? yes/no
15. Default runtime behavior changed outside new capability? yes/no
16. 9+ writes still blocked? yes/no
17. Broad arbitrary apply_patch still blocked? yes/no
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
