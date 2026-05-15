# Route 61: explicit restore surface and recovery execution bridge

## Objective

Implement a practical explicit restore surface on top of the Route 59-60 recovery authority loop.

Route 59 implemented the minimum non-default recovery authority loop:

- explicit recovery authority store
- guarded per-file restore primitive
- non-default pre-write capture for selected narrow routes

Route 60 expanded non-default capture coverage across existing narrow write surfaces and added partial-failure restore drills.

Route 61 should now make the captured authority operational and inspectable:

- authority index / inspection
- restore eligibility surface
- explicit restore execution bridge
- user/session-visible recovery summary where clean
- focused tests proving guarded restore can be triggered intentionally
- default runtime still unchanged
- no automatic recovery
- no atomic rollback
- no broad writes

This route should be a thick implementation batch, not another metadata-only helper route.

## Current state

Build on the current working tree. Do not reset Route 57, 58, 59, or 60 changes.

Current recovery authority state:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts exists.
- packages/ts-shell/src/orchestration/patchRecovery/restorePrimitive.ts exists.
- Non-default pre-write capture is integrated for:
  - single update
  - single create
  - single move
  - single delete
  - exactly-two update
  - exactly-three update
  - exactly-two mixed lanes where clean
- Explicit partial-failure restore drills exist.
- Default route behavior remains unchanged.
- Recovery is not automatic.
- Rollback is not atomic.
- No provider/session/CLI/MCP/default-gate behavior has been changed.

Current supported write surfaces remain narrow:

- selected-workspace single-file update/create/move/delete
- exactly-two update
- exactly-three update
- exactly-two mixed write lanes

Still unsupported:

- broad arbitrary apply_patch
- 3+ mixed writes
- 4+ writes
- multi-delete
- multi-move
- directory delete/move
- overwrite
- default durable persistence
- automatic recovery
- full transaction rollback
- provider changes

## Reference scan first

Do a bounded implementation-oriented scan before code edits.

Primary reference repository:

- opencode: /home/wang/projects/opencode

Secondary references:

- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- opencode: inspect at most 6 directly relevant files
- gemini-cli: inspect at most 4 directly relevant files
- ClaudeCode: inspect at most 3 directly relevant files
- total external files: at most 13
- exceed by at most 2 files only if a direct restore-surface file is clearly useful
- do not copy implementation code verbatim
- record path references and practical implications only

Search focus:

opencode:

- session revert
- snapshot revert
- restore
- revert
- tool result
- output summary
- session projectors
- apply_patch

gemini-cli:

- restore command
- rewind command
- checkpoint
- restore
- tool result
- file operation

ClaudeCode:

- fileHistory
- rewind
- restore
- tool result
- stale
- user visible error
- edit failure

The scan should answer:

1. How is stored recovery authority listed or discovered?
2. How does the user/session surface explain restorable files?
3. How is restore explicitly triggered?
4. Does restore execution live in the edit tool, session layer, CLI layer, or separate recovery layer?
5. What is the smallest local equivalent that fits this project now?

Record findings in docs/design/explicit-restore-surface.md.

## Validation policy

Use minimal validation between tasks.

Preflight:

- rtk git status --short --branch
- rtk git diff --check

After docs-only tasks:

- rtk git diff --check

After code/test tasks:

- run focused tests for touched modules only
- rtk git diff --check

Final:

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchRecovery src/orchestration/patchResult
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Do not run broad package tests. Route 59 already observed unrelated broad package test failures outside touched areas. Do not expand into unrelated failures unless this route touches those areas.

Run optional real-user gates only if default runtime behavior changes. This route should keep default runtime behavior unchanged.

## Read first

Design/roadmap:

- docs/design/edit-capability-roadmap.md
- docs/design/minimum-recovery-authority-loop.md
- docs/design/recovery-authority-coverage-drills.md
- docs/design/durable-authority-decision.md
- docs/design/recovery-plan-projection.md

Recovery modules:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts
- packages/ts-shell/src/orchestration/patchRecovery/restorePrimitive.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreSetPrimitive.ts if present
- packages/ts-shell/src/orchestration/patchRecovery/recoveryPreWriteCapture.ts if present

Journal/result modules:

- packages/ts-shell/src/orchestration/patchResult/journalRecoveryPlanProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalRecoveryReadinessProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalResultProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalFailureConsumer.ts
- packages/ts-shell/src/orchestration/patchResult/routeScopedEditJournal.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceCreateResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteResult.ts

User/session surface files, inspect before touching:

- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/session/sessionStateSurface.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- related focused tests for the above

Do not touch user/session/CLI files unless the route can keep the change narrow and well tested.

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/patchRecovery/*
- packages/ts-shell/src/orchestration/patchResult/*
- focused tests for touched recovery/result modules
- docs/design/explicit-restore-surface.md
- docs/design/minimum-recovery-authority-loop.md, Route 61 notes only
- docs/design/recovery-authority-coverage-drills.md, Route 61 notes only
- docs/design/edit-capability-roadmap.md, concise Batch 61 update only
- this route spec

Conditionally allowed if clean and focused:

- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/session/sessionStateSurface.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- focused tests for those files

Allowed behavior changes:

- add explicit recovery authority inspection/listing APIs
- add explicit restore execution bridge that calls restorePrimitive / restoreSetPrimitive
- add non-default restore preview/eligibility summaries
- add user/session-visible recovery hints when failure results already carry captured authority
- add a narrow explicit restore entrypoint only if it can be done without changing default behavior

Forbidden unless a blocker is reported first:

- broad apply_patch support
- 3+ mixed write support
- 4+ write support
- default runtime persistence
- automatic recovery
- atomic transaction rollback
- provider behavior changes
- MCP behavior changes
- package scripts
- default gates
- git/shadow-git integration
- mutationRoutingProjection changes
- large CLI/session lifecycle rewrite

## Batched tasks

### Task 1: explicit restore surface design

Create docs/design/explicit-restore-surface.md.

Include:

- post-Route 60 baseline
- reference scan summary
- local restore surface architecture
- authority index / listing model
- restore preview / eligibility model
- restore execution bridge model
- user/session-visible recovery summary model
- optional CLI entrypoint decision
- current-content guard
- no-hidden-user-edit rule
- cleanup/residue policy
- non-goals
- next-route decision criteria

The design must explicitly say:

- restore is explicit, not automatic
- restore is per-file or non-atomic set restore, not transaction rollback
- route result recoveryExecuted remains false
- explicit restore execution result may report restored files separately
- default runtime has no restore execution
- broad writes remain delayed

Minimum validation:

- rtk git diff --check

### Task 2: implement recovery authority index / inspection

Add an authority inspection module.

Preferred location:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityIndex.ts

The index should read only from explicit non-default ledger roots.

Preferred behavior:

- list authority namespaces / route ids if store structure supports it
- list records for an authority/route id
- return metadata without raw content by default
- expose per-record:
  - recordId
  - workspaceRelativePath
  - operationKind
  - beforeState
  - expectedCurrentState
  - beforeContentHash
  - beforeContentSizeBytes
  - hasContentBlob
  - createdAt
  - schemaVersion
- reject absolute/path traversal inputs
- do not read workspace files
- do not write workspace files
- do not expose raw content unless explicitly asked by lower-level store tests
- return structured diagnostics when ledger root or namespace is missing

Minimum validation:

- focused tests for recoveryAuthorityIndex
- rtk git diff --check

### Task 3: implement restore eligibility / preview surface

Add a preview module.

Preferred location:

- packages/ts-shell/src/orchestration/patchRecovery/restorePreview.ts

The preview should combine:

- recoveryAuthorityIndex records
- restorePrimitive current-content inspection logic or shared guard logic
- workspace root
- selected record ids

Preferred output:

- canAttemptExplicitRestore
- cannotRestoreReasons
- restorableFiles
- blockedFiles
- inspectedFiles
- missingRecords
- currentContentMismatches
- pathBoundaryFailures
- evidence

The preview may inspect current workspace content to enforce current-content guard.

The preview must not:

- write workspace files
- perform restore
- claim atomic rollback
- integrate with CLI/session automatically
- run without explicit ledgerRoot/workspaceRoot/record selection

Minimum validation:

- focused tests for restorePreview
- rtk git diff --check

### Task 4: implement explicit restore execution bridge

Add a bridge module that uses the existing restore primitive.

Preferred location:

- packages/ts-shell/src/orchestration/patchRecovery/restoreExecutionBridge.ts

The bridge should:

- accept explicit ledgerRoot, workspaceRoot, authorityId/routeId, and record selection
- run preview/eligibility first
- call per-file restorePrimitive or restoreSetPrimitive only for eligible records
- support a dry-run / preview-only mode
- support an execute mode
- restore in deterministic order, preferably reverse write/capture order if records contain enough ordering information
- return structured result:
  - mode: "preview" | "execute"
  - executed: boolean
  - restoredFiles
  - blockedFiles
  - inspectedFiles
  - skippedFiles
  - evidence
  - rollbackAtomicityClaim: false
  - automaticRecovery: false

The bridge must not:

- run automatically from write routes
- bypass current-content guard
- claim atomic rollback
- modify session state directly
- modify CLI behavior directly
- use git
- perform broad recovery beyond selected records

Minimum validation:

- focused tests for restoreExecutionBridge
- rtk git diff --check

### Task 5: add recovery summary projection for failure results

Add or extend a projection helper that converts captured authority/recoveryPlan facts into a user/session-friendly summary.

Preferred location:

- packages/ts-shell/src/orchestration/patchRecovery/recoverySurfaceProjection.ts

Alternative location if cleaner:

- packages/ts-shell/src/orchestration/patchResult/journalRecoveryPlanProjection.ts

Preferred summary concepts:

- recoveryAvailable: boolean
- explicitRestoreAvailable: boolean
- automaticRecoveryAvailable: false
- atomicRollbackAvailable: false
- restorableFiles
- blockedFiles
- recoveryAuthorityId / routeId if safe
- recoveryAction:
  - "inspect-authority"
  - "preview-restore"
  - "execute-explicit-restore"
  - "none"
- userFacingMessage or structured message fragments
- evidence

Default behavior:

- if no captured authority exists, summary says recovery is not available and why
- if captured authority exists, summary says explicit guarded restore may be available
- never say automatic recovery occurred
- never say rollback is available

Minimum validation:

- focused tests for recoverySurfaceProjection or touched journal projection
- rtk git diff --check

### Task 6: optionally add narrow session/CLI visible surface

Inspect current session/CLI surface before touching.

If clean, add one of the following:

Option A, preferred if session surface is simpler:

- Add recovery summary to existing non-tty / print result surface when failure result already contains recoveryPlan with captured authority.
- Do not add new command parsing.
- Ensure default paths without authority remain unchanged except clearer "recovery not available" language if already showing failure details.

Option B, preferred if CLI command structure is simple:

- Add a non-default explicit restore preview/execute entrypoint requiring:
  - ledgerRoot
  - workspaceRoot
  - authorityId/routeId
  - record ids or "all"
  - explicit execute flag for actual restore
- Preview must be default.
- Execute must be explicit.
- No provider involvement.
- No session persistence.

Option C:

- If session/CLI changes are too coupled, do not touch them.
- Keep restore surface as a core execution bridge with tests.
- Document the blocker and recommend a future user-surface route.

Minimum required outcome:

- At least core recoverySurfaceProjection + restoreExecutionBridge must exist.
- Do not let a hard CLI/session integration block the route.

Minimum validation:

- focused tests for touched session/CLI files if any
- rtk git diff --check

### Task 7: end-to-end focused restore surface tests

Add focused tests that prove the user-operational loop without broad runtime changes.

Required scenarios:

1. Authority inspection:
   - create non-default captured records
   - index lists records without raw content
   - missing ledger/record returns diagnostics
   - path traversal rejected

2. Restore preview:
   - eligible record previews as restorable
   - current-content mismatch previews as blocked
   - missing content blob previews as blocked
   - path mismatch previews as blocked

3. Restore execution bridge:
   - preview mode does not write
   - execute mode restores eligible update record
   - execute mode restores deleted file record
   - execute mode removes created file record if supported by store/primitive
   - mismatch blocks restore and preserves user edit
   - result says rollbackAtomicityClaim false
   - result says automaticRecovery false

4. Failure-result recovery summary:
   - captured authority failure result produces explicit restore summary where safe
   - default no-authority failure result does not claim restore
   - recoveryExecuted remains false in route result
   - changedFiles/failedFiles/plannedFiles/postWriteVerification/writer flags remain preserved

5. Session/CLI visible surface if touched:
   - preview is visible without executing restore
   - execute requires explicit flag
   - default behavior unchanged

Minimum validation:

- focused tests for touched modules
- rtk git diff --check

### Task 8: update design and roadmap evidence

Update docs/design/explicit-restore-surface.md with final implementation notes:

- modules added
- surface implemented
- preview behavior
- execution bridge behavior
- session/CLI decision
- current-content guard guarantees
- remaining gaps
- next recommended route

Update docs/design/minimum-recovery-authority-loop.md with Route 61 notes.

Update docs/design/recovery-authority-coverage-drills.md with Route 61 notes.

Update docs/design/edit-capability-roadmap.md lightly:

- mark Batch 61 as implemented if completed
- add evidence rows for:
  - authority index
  - restore preview
  - explicit restore execution bridge
  - recovery summary projection
  - session/CLI visible surface if touched
- update recommended future sequence

Recommended next route should be one of:

1. Route 62: user/session restore UX completion
   - if core bridge exists but session/CLI surface was deferred

2. Route 62: controlled automatic recovery experiment behind non-default test path
   - if explicit restore surface is stable and the project wants to test automatic recovery carefully

3. Route 62: 3+ mixed write readiness audit
   - if explicit restore authority is now complete enough to revisit larger write surfaces

Prefer Route 62: 3+ mixed write readiness audit if:

- capture coverage is complete
- explicit restore bridge works
- current-content guards are stable
- user/session surface is adequate or intentionally deferred

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged by default:

- runtime writer behavior
- write execution order
- changedFiles semantics
- failedFiles semantics
- plannedFiles semantics
- postWriteVerification semantics
- writer flags
- single update/create/move/delete default behavior
- exactly-two update default behavior
- exactly-three update default behavior
- exactly-two mixed default behavior
- unsupported/no-write default behavior
- package scripts
- provider/MCP behavior
- default runtime persistence absence
- automatic recovery absence
- atomic rollback absence
- broad write absence

Non-default explicit paths may:

- inspect recovery authority records under explicit ledgerRoot
- preview restore eligibility
- execute guarded explicit per-file or non-atomic set restore
- inspect workspace current content for guarded restore
- show recovery summaries for captured authority

Non-default explicit paths must not:

- run automatically after write failure
- claim atomic rollback
- alter provider behavior
- create default persistent storage
- bypass current-content guard

## Success criteria

Route is complete if:

- explicit restore surface design exists
- bounded reference scan is summarized
- recovery authority index exists and is tested
- restore preview exists and is tested
- explicit restore execution bridge exists and is tested
- recovery summary projection exists and is tested
- session/CLI visible surface is implemented if clean, or blocker is documented
- current-content guard blocks hidden user edits
- default route behavior remains unchanged
- route result recoveryExecuted remains false
- explicit restore execution result can report restored files separately
- atomic rollback remains false
- no broad writes, 3+ mixed, provider/MCP changes, package scripts, or default gates are added
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- restore surface requires default persistence
- restore preview cannot enforce current-content guard
- execution bridge cannot avoid atomic rollback claims
- session/CLI integration requires broad lifecycle rewrites
- provider/MCP changes become necessary
- package script or default gate changes become necessary
- result-contract requires broad public shape churn
- broad writes or 3+ mixed writes become necessary

## Final report

Report:

1. Route
2. External repos scanned and file-count summary
3. Main reference patterns ported conceptually
4. Design document added/updated
5. Authority index added/evolved or blocker
6. Restore preview added/evolved or blocker
7. Restore execution bridge added/evolved or blocker
8. Recovery summary projection added/evolved or blocker
9. Session/CLI visible surface status
10. Tests covered
11. Files changed
12. Forbidden files touched? yes/no
13. Default runtime writer behavior changed? yes/no
14. Default persistence added? yes/no
15. Automatic recovery added? yes/no
16. Explicit restore execution added? yes/no and where
17. Atomic rollback added? yes/no
18. Broad writes / 3+ mixed added? yes/no
19. Existing result fields preserved
20. Focused validation
21. Final validation
22. Residue cleanup
23. Residual risks
24. Next recommended route
25. Proposed commit message

Do not commit or push.
