# Route 60: complete recovery authority coverage and restore drills

## Objective

Extend the Route 59 minimum recovery-authority loop across the remaining existing narrow write surfaces and prove explicit restore drills for partial-failure scenarios.

Route 59 implemented:

- explicit non-default recovery authority store
- guarded explicit per-file restore primitive
- non-default pre-write capture for:
  - single update
  - single delete
  - exactly-two update
  - single create
- recoveryPlan diagnostics for explicit captured authority
- default runtime behavior unchanged

Route 60 should complete coverage for existing supported write surfaces and exercise the recovery authority loop under realistic partial-failure conditions.

This route should add:

- non-default pre-write capture for remaining narrow write routes
- capture coverage for exactly-three update
- capture coverage for single move
- capture coverage for exactly-two mixed write lanes where clean
- explicit restore drills after partial failures
- optional non-atomic restore-set helper if needed
- focused tests proving default behavior remains unchanged
- design/roadmap evidence update

This route must not implement broad apply_patch, 3+ mixed writes, 4+ writes, provider changes, CLI restore commands, SessionManager persistence, automatic recovery, or atomic transaction rollback.

## Current state

Build on the current working tree. Do not reset Route 57, Route 58, or Route 59 changes.

Route 59 delivered:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts
- packages/ts-shell/src/orchestration/patchRecovery/restorePrimitive.ts
- non-default pre-write capture in:
  - workspaceWriteRoute.ts
  - workspaceDeleteRoute.ts
  - multiFileWriteRoute.ts for exactly-two update
  - workspaceCreateRoute.ts
- recoveryPlan diagnostics reflecting explicit captured authority where safe
- no automatic recovery
- no atomic rollback
- no default persistence
- no provider/session/CLI/MCP changes

A broad package test was attempted after Route 59 and failed in unrelated non-touched areas. Do not expand into those unrelated failures. Use focused validation only unless this route touches broader areas.

Current supported write surfaces:

- selected-workspace single-file update
- selected-workspace single-file create
- selected-workspace single-file move
- selected-workspace single-file delete
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
- full rollback / transaction rollback
- snapshot/revert UX
- provider/session/CLI/MCP changes

## Reference scan first

Do a very small implementation-oriented reference scan before code edits.

Primary reference repository:

- opencode: /home/wang/projects/opencode

Secondary references:

- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- opencode: inspect at most 5 directly relevant files
- gemini-cli: inspect at most 3 directly relevant files
- ClaudeCode: inspect at most 2 directly relevant files
- total external files: at most 10
- exceed by at most 2 files only if a direct recovery/restore file is clearly useful
- do not copy implementation code verbatim
- record path references and practical implications only

Search focus:

opencode:

- snapshot
- revert
- apply_patch
- multi file
- move
- delete
- restore
- cleanup
- partial failure

gemini-cli:

- restore
- rewind
- checkpoint
- file operation
- current content

ClaudeCode:

- fileHistory
- rewind
- stale
- move
- edit failure

The scan should answer:

1. How do they handle restore authority for multi-file or mixed operations?
2. Do they restore as atomic transaction or explicit per-file/set action?
3. How do they guard move/delete/create restore semantics?
4. What is the smallest local equivalent for remaining narrow routes?

Record findings in docs/design/recovery-authority-coverage-drills.md.

## Validation policy

Use minimal validation between tasks.

Preflight:

- rtk git status --short --branch
- rtk git diff --check

After docs-only tasks:

- rtk git diff --check

After code/test tasks:

- run focused tests for touched modules/routes only
- rtk git diff --check

Final:

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchRecovery src/orchestration/patchResult
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Do not run broad package tests. Do not expand into unrelated existing failures outside touched areas.

Optional real-user capability gates should only run if default runtime behavior is changed. This route should keep default behavior unchanged.

## Read first

Design/roadmap:

- docs/design/edit-capability-roadmap.md
- docs/design/minimum-recovery-authority-loop.md
- docs/design/durable-authority-decision.md
- docs/design/recovery-plan-projection.md

Recovery modules:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts
- packages/ts-shell/src/orchestration/patchRecovery/restorePrimitive.ts

Route 57/58/59 journal helpers:

- packages/ts-shell/src/orchestration/patchResult/journalDurableAuthority.ts
- packages/ts-shell/src/orchestration/patchResult/journalOriginalContentAuthority.ts
- packages/ts-shell/src/orchestration/patchResult/journalRecoveryReadinessProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalRecoveryPlanProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalFailureStateProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalMetadataBoundary.ts
- packages/ts-shell/src/orchestration/patchResult/journalResultProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalFailureConsumer.ts
- packages/ts-shell/src/orchestration/patchResult/routeScopedEditJournal.ts

Writer/result route files:

- packages/ts-shell/src/orchestration/patchResult/workspaceWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceCreateRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceCreateResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteResult.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts

Focused tests:

- existing tests for touched files
- recoveryAuthorityStore tests
- restorePrimitive tests
- route tests for update/create/delete/move/multi/mixed

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/patchRecovery/*
- packages/ts-shell/src/orchestration/patchResult/*
- focused tests for touched modules
- docs/design/recovery-authority-coverage-drills.md
- docs/design/minimum-recovery-authority-loop.md, Route 60 notes only
- docs/design/durable-authority-decision.md, Route 60 notes only
- docs/design/edit-capability-roadmap.md, concise Batch 60 update only
- this route spec

Allowed behavior changes:

- extend explicit non-default recoveryAuthority option to remaining existing narrow write routes
- under explicit option, capture pre-write original state before writer execution
- add explicit restore drill helpers/tests
- add non-atomic restore-set helper if useful

Forbidden unless a blocker is reported first:

- broad apply_patch support
- 3+ mixed write support
- 4+ write support
- runtime default persistence
- automatic capture by default
- automatic recovery
- atomic transaction rollback
- CLI restore command
- SessionManager persistence
- provider/session/CLI/MCP behavior changes
- package scripts
- default gates
- git/shadow-git integration
- mutationRoutingProjection changes

## Batched tasks

### Task 1: recovery coverage design note

Create docs/design/recovery-authority-coverage-drills.md.

Include:

- post-Route 59 baseline
- bounded reference scan summary
- local coverage target
- move/create/delete/update restore semantics
- exactly-three update capture semantics
- exactly-two mixed capture semantics
- partial-failure restore drill semantics
- why restore drills are explicit and non-atomic
- why default runtime remains unchanged
- unsupported boundaries
- next-route decision criteria

Minimum validation:

- rtk git diff --check

### Task 2: factor reusable pre-write capture helper if needed

If Route 59 capture logic is duplicated across route files, add a reusable helper.

Preferred location:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryPreWriteCapture.ts

The helper should:

- accept explicit recoveryAuthority option
- no-op in disabled/default mode
- capture update/delete original content from provided or explicitly read content only inside non-default path
- capture create beforeState absent
- support multi-file capture before any writer starts
- reject path traversal and outside-workspace relative paths
- write only to explicit ledgerRoot
- return structured capture diagnostics
- never call writers
- never change route status by itself

If existing Route 59 code is already clean and deduplicated, do not add needless abstraction. Add tests around the current helper instead.

Minimum validation:

- focused tests for recoveryPreWriteCapture or existing capture helper
- rtk git diff --check

### Task 3: integrate single move pre-write capture

Add explicit non-default pre-write capture to workspaceMoveRoute.ts.

Move capture should model both sides of the operation if clean:

- source beforeState exists with original source content
- target beforeState absent

If the existing store shape cannot represent both sides cleanly, use two records with clear roles or document the blocker and capture source-only as a safer first step.

Capture must happen:

- after workspace/capability/permission/final stale-read checks
- before writer execution
- only under explicit non-default recoveryAuthority option

Default behavior must remain unchanged.

Minimum validation:

- focused workspaceMoveRoute/workspaceMoveResult tests
- restorePrimitive tests if move restore semantics require updates
- rtk git diff --check

### Task 4: integrate exactly-three update capture

Extend multiFileWriteRoute.ts non-default capture from exactly-two update to exactly-three update.

Required behavior:

- capture all three target original states before any writer starts
- if capture fails for any target, stop safely before writer where local route semantics allow
- default exactly-three update behavior remains unchanged
- recoveryPlan/capture diagnostics distinguish captured authority from recovery execution

Minimum validation:

- focused multiFileWriteRoute/multiFileWriteResult tests
- rtk git diff --check

### Task 5: integrate exactly-two mixed capture where clean

Add explicit non-default capture to mixedFileWriteRoute.ts for exactly-two mixed write lanes.

Supported lanes to cover if clean:

- update + add
- update + move
- add + move
- update + delete
- add + delete
- move + delete

Capture semantics:

- update: capture existing original content
- add/create: capture beforeState absent
- delete: capture existing original content
- move: capture source exists and target absent if clean; otherwise source-only with documented blocker
- capture both operations before any writer starts
- if any capture fails, stop safely before writer where local route semantics allow
- default mixed route behavior remains unchanged

If all mixed lanes are too much for one route, cover at least three representative lanes:

- update + add
- update + delete
- update + move

Document any remaining lane blockers.

Minimum validation:

- focused mixedFileWriteRoute/mixedFileWriteResult tests
- rtk git diff --check

### Task 6: add explicit non-atomic restore-set drill helper

If helpful, add a helper for explicit restore drills across multiple captured records.

Preferred location:

- packages/ts-shell/src/orchestration/patchRecovery/restoreSetPrimitive.ts

This helper should:

- call per-file restorePrimitive explicitly
- restore records in provided or reverse write order
- stop on first blocked restore unless configured otherwise
- return restoredFiles, blockedFiles, inspectedFiles, evidence
- never claim atomic rollback
- never run automatically
- never integrate with CLI/session/provider
- require explicit ledgerRoot/workspaceRoot/record list

If per-file restorePrimitive tests are enough, skip this helper and document why.

Minimum validation:

- focused restoreSetPrimitive tests if added
- rtk git diff --check

### Task 7: partial-failure restore drills

Add focused tests that simulate partial failure and then explicitly call restore primitive or restore-set primitive.

Representative drills:

1. exactly-two update partial failure:
   - capture both files before writer
   - first file changed/verified
   - second file fails
   - explicit restore restores changed file only if current-content guard matches
   - restore blocked if user edits after failure

2. exactly-three update partial failure:
   - capture all files before writer
   - changed prefix can be explicitly restored
   - no atomic rollback claim

3. mixed update + delete or update + add partial failure:
   - captured authority exists for relevant operands
   - explicit restore drill can undo only guarded records
   - restore blocked on current-content mismatch

Required assertions:

- recoveryExecuted remains false in route result
- explicit restore primitive result may report restored true outside route result
- rollbackAtomicityClaim remains false
- current-content mismatch blocks restore
- no hidden user edit overwrite
- changedFiles/failedFiles/plannedFiles are preserved
- postWriteVerification and writer flags are preserved
- default path has no capture and no persistence

Minimum validation:

- focused tests for touched recovery and route/result files
- rtk git diff --check

### Task 8: recoveryPlan and roadmap evidence

Update recoveryPlan diagnostics only if needed.

Preferred behavior:

- default recoveryPlan remains metadata-only/no-authority
- explicit non-default captured authority can be reflected where safe
- recoveryExecuted remains false
- rollbackAtomicityClaim remains false
- no automatic recovery is claimed
- non-atomic explicit restore drills are not represented as automatic route recovery

Update docs/design/recovery-authority-coverage-drills.md with final implementation notes.

Update docs/design/minimum-recovery-authority-loop.md with Route 60 coverage notes.

Update docs/design/edit-capability-roadmap.md lightly:

- mark Batch 60 as implemented if completed
- add evidence rows for:
  - single move capture
  - exactly-three update capture
  - exactly-two mixed capture coverage
  - partial-failure restore drills
  - restore-set helper if added
- update recommended next route

Recommended next route should be one of:

1. Route 61: user/session-visible explicit restore surface design
   - if authority coverage is strong but users cannot act on it

2. Route 61: controlled automatic recovery experiment behind non-default test path
   - if explicit restore drills are stable and the project wants to evaluate automatic recovery carefully

3. Route 61: 3+ mixed write readiness audit
   - if recovery authority coverage is now strong enough to revisit larger write surfaces

Do not write the next route file in this task.

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
- provider/session/CLI/MCP behavior
- default runtime persistence absence
- automatic recovery absence
- rollback/snapshot absence
- broad write absence

Non-default explicit test paths may:

- write recovery authority records under explicit temp ledgerRoot
- read those records
- perform explicit per-file or set restore primitive calls
- inspect workspace current content for guarded restore
- expose captured authority diagnostics in recoveryPlan where safe

Non-default explicit test paths must not:

- claim atomic rollback
- run automatically
- alter provider/CLI/session behavior
- create default persistent storage

## Success criteria

Route is complete if:

- recovery coverage design note exists
- bounded reference scan is summarized
- single move capture is implemented or a clear blocker is documented
- exactly-three update capture is implemented
- exactly-two mixed capture covers all lanes or at least three representative lanes with blockers documented
- partial-failure explicit restore drills exist
- restore blocks hidden user edits via current-content guard
- default route behavior remains unchanged
- recoveryPlan remains non-automatic and no atomic rollback is claimed
- tests preserve existing changedFiles/failedFiles/plannedFiles/postWriteVerification/writer flags
- no broad writes, 3+ mixed, provider/session/CLI/MCP changes, package scripts, or default gates are added
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- remaining capture coverage requires broad writer rewrites
- mixed capture cannot be explicit/non-default
- capture changes default runtime behavior
- restore drills cannot enforce current-content guard
- route integration requires cli.tsx, SessionManager.ts, provider/session/CLI/MCP, package scripts, default gates, or mutationRoutingProjection changes
- result-contract requires broad public shape churn
- broad writes or 3+ mixed writes become necessary

## Final report

Report:

1. Route
2. External repos scanned and file-count summary
3. Design document added/updated
4. Reusable capture helper added/evolved or why not
5. Single move capture status
6. Exactly-three update capture status
7. Exactly-two mixed capture coverage
8. Restore-set helper added/evolved or why not
9. Partial-failure restore drills covered
10. RecoveryPlan behavior
11. Files changed
12. Forbidden files touched? yes/no
13. Default runtime writer behavior changed? yes/no
14. Non-default persistence added? yes/no and where
15. Default persistence added? yes/no
16. Automatic recovery added? yes/no
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
