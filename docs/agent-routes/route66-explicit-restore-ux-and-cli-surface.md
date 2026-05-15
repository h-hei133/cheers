# Route 66: explicit restore UX and CLI/session surface

## Objective

Implement a user-operable explicit restore UX on top of the recovery authority loop built in Routes 59-65.

Route 59 implemented the minimum recovery authority loop.
Route 60 expanded capture coverage and restore drills.
Route 61 added recovery authority index, restore preview, restore execution bridge, and recovery surface projection.
Route 62-65 expanded write capability up to bounded small-N cap 8 while preserving recovery authority and blocked broad apply_patch.

Route 66 should now make restore operational from the user/session/CLI surface:

- show recovery availability in failure/session output
- expose restore preview through an explicit CLI/session command path
- expose guarded restore execution through an explicit command path
- require explicit execution intent for writes
- preserve preview as the safe default
- keep restore separate from provider/model execution
- keep automatic recovery absent
- keep atomic rollback absent
- keep broad apply_patch blocked

This route should be an implementation route, not docs-only and not metadata-only.

## Current state

Build on the current working tree. Do not reset Route 57-65 changes.

Current write capability:

- selected-workspace single-file update/create/move/delete
- bounded update-only batches with 2-8 files
- bounded mixed batches with 2-8 operations
- bounded delete-only batches with 2-8 files
- bounded move-only batches with 2-8 moves
- 9+ writes remain blocked
- broad arbitrary apply_patch remains blocked

Current recovery authority surface:

- recoveryAuthorityStore
- restorePrimitive
- recoveryAuthorityIndex
- restorePreview
- restoreExecutionBridge
- recoverySurfaceProjection
- non-default pre-write capture for supported bounded write surfaces
- explicit restore drills
- current-content guards
- no automatic recovery
- no atomic rollback

Known gap:

- restore authority is testable in core modules, but not yet user-operable through session/CLI surfaces.
- users cannot easily inspect recovery records or trigger guarded restore from the product surface.

## Reference scan first

Do a bounded implementation-oriented scan before code edits.

Primary reference repository:

- opencode: /home/wang/projects/opencode

Secondary references:

- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- opencode: inspect at most 6 directly relevant files
- gemini-cli: inspect at most 5 directly relevant files
- ClaudeCode: inspect at most 3 directly relevant files
- total external files: at most 14
- exceed by at most 2 files only if a direct restore/user-surface file is clearly useful
- do not copy implementation code verbatim
- record path references and practical implications only

Search focus:

opencode:

- session revert
- revert
- snapshot
- command
- tool result
- session projectors
- output summary
- restore

gemini-cli:

- restore command
- rewind command
- checkpoint
- command
- tool result
- UI restore
- file operation

ClaudeCode:

- fileHistory
- rewind
- restore
- tool result
- terminal output
- edit failure
- user visible

The scan should answer:

1. How is recovery authority surfaced to the operator?
2. How is preview separated from execution?
3. How is explicit restore triggered?
4. How are restored files reported separately from normal edit results?
5. What is the smallest local CLI/session equivalent for this project?

Record findings in docs/design/explicit-restore-ux-cli-surface.md.

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

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchRecovery src/orchestration/patchResult src/core/shell src/session src/entrypoints
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

If the final focused path test expands into unrelated existing failures, narrow it to touched tests and document the unrelated failures. Do not fix unrelated failures.

Do not run provider/default/MCP gates.

## Read first

Design/roadmap:

- docs/design/edit-capability-roadmap.md
- docs/design/explicit-restore-surface.md
- docs/design/minimum-recovery-authority-loop.md
- docs/design/recovery-authority-coverage-drills.md
- docs/design/bounded-small-n-write-policy.md

Recovery modules:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityIndex.ts
- packages/ts-shell/src/orchestration/patchRecovery/restorePreview.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreExecutionBridge.ts
- packages/ts-shell/src/orchestration/patchRecovery/restorePrimitive.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoverySurfaceProjection.ts

Result/session/CLI surface:

- packages/ts-shell/src/orchestration/patchResult/journalRecoveryPlanProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalRecoveryReadinessProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalResultProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalFailureConsumer.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/session/sessionStateSurface.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- focused tests for the above

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/patchRecovery/*
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/session/sessionStateSurface.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- focused tests for touched modules
- docs/design/explicit-restore-ux-cli-surface.md
- docs/design/explicit-restore-surface.md, Route 66 note only
- docs/design/edit-capability-roadmap.md, concise Route 66 update only
- this route spec

Conditionally allowed if current CLI structure makes it cleaner:

- a small new CLI restore command/parser helper under existing entrypoint or shell folder
- a small restore command contract module under patchRecovery

Forbidden unless a blocker is reported first:

- provider behavior changes
- MCP behavior changes
- package scripts
- default gates
- automatic recovery
- atomic transaction rollback
- default persistence
- broad apply_patch
- 9+ writes
- SessionManager persistence schema changes
- broad CLI lifecycle rewrite
- git/shadow-git integration

## Batched tasks

### Task 1: explicit restore UX design note

Create docs/design/explicit-restore-ux-cli-surface.md.

Include:

- post-Route 65 baseline
- bounded reference scan summary
- local UX goals
- operator-visible recovery summary
- restore preview command semantics
- restore execute command semantics
- CLI/session integration decision
- argument/option contract
- safety guardrails
- current-content guard
- no-hidden-user-edit rule
- restore result reporting
- cleanup/residue policy
- non-goals
- next-route decision criteria

The design must explicitly say:

- preview is the default restore action
- execute requires explicit intent
- restore execution result is separate from normal route result
- route result recoveryExecuted remains false
- automatic recovery remains absent
- atomic rollback remains absent
- provider/model execution is not involved

Minimum validation:

- rtk git diff --check

### Task 2: define restore command contract

Add a small explicit restore command contract if no clean one exists.

Preferred location:

- packages/ts-shell/src/orchestration/patchRecovery/restoreCommandContract.ts

Preferred concepts:

- mode:
  - "preview"
  - "execute"
- ledgerRoot
- workspaceRoot
- authorityId or routeId
- recordSelection:
  - "all"
  - explicit record ids
- requireExplicitExecute: true for execute mode
- dryRun / previewOnly semantics
- output shape:
  - mode
  - executed
  - restorableFiles
  - restoredFiles
  - blockedFiles
  - inspectedFiles
  - missingRecords
  - evidence
  - automaticRecovery: false
  - rollbackAtomicityClaim: false

The contract should validate:

- ledgerRoot provided
- workspaceRoot provided
- authority/route id provided
- execute mode requires explicit execute confirmation
- record ids are sanitized
- "all" is explicit, not default if local CLI convention prefers explicit records

Minimum validation:

- focused tests for restoreCommandContract
- rtk git diff --check

### Task 3: implement restore command runner

Add a runner that bridges command contract to restorePreview / restoreExecutionBridge.

Preferred location:

- packages/ts-shell/src/orchestration/patchRecovery/restoreCommandRunner.ts

Required behavior:

- preview mode calls restorePreview / restoreExecutionBridge preview path
- execute mode calls restoreExecutionBridge execute path only after explicit execute intent passes validation
- returns structured command result
- never runs provider/model
- never runs automatically from write failure
- never claims atomic rollback
- never bypasses current-content guard
- never creates default storage root
- never persists session state

Minimum validation:

- focused tests for restoreCommandRunner
- rtk git diff --check

### Task 4: add user/session recovery summary output

Use existing recoverySurfaceProjection and failure result recoveryPlan facts to add a user-visible summary where clean.

Preferred behavior:

- when a failure result contains captured authority:
  - show that guarded restore preview is available
  - show authority/route id if safe
  - show restorable file count or affected files if already present in result facts
  - show that restore is explicit and non-automatic
  - show that rollback is non-atomic / unavailable
- when no authority exists:
  - do not claim restore is available
  - preserve current failure summary
- do not print raw original content
- do not print ledgerRoot unless user explicitly provided it and local conventions allow it
- avoid noisy output for success paths

Potential touchpoints:

- sessionRuntime.ts
- sessionStateSurface.ts
- patchResult recovery surface projection

If sessionRuntime/sessionStateSurface integration is too coupled, implement a pure formatter/helper plus tests and document CLI/session blocker. But aim to wire at least non-tty/print failure summary if clean.

Minimum validation:

- focused tests for touched session surface / runtime formatter files
- rtk git diff --check

### Task 5: add explicit CLI restore preview / execute path

Add a narrow CLI path if current cli.tsx structure supports it cleanly.

Preferred semantics:

- restore preview is default:
  - explicit restore command / mode
  - requires ledgerRoot
  - requires workspaceRoot or uses cwd only if existing CLI convention safely treats cwd as workspace
  - requires authorityId/routeId
  - requires record ids or explicit all
- restore execute requires an explicit flag/option:
  - do not execute on preview
  - do not execute without explicit execute intent
- output structured human-readable summary:
  - preview: restorable / blocked / inspected files
  - execute: restored / blocked / skipped files
- exit behavior:
  - preview with blocked files should not look like normal edit failure unless local conventions require nonzero
  - execute with blocked files should report blocked details clearly
- no provider/model execution
- no session persistence requirement
- no default storage root

If CLI parsing integration would require broad lifecycle rewrite, do not force it. Instead:
- implement restoreCommandRunner fully
- expose a focused internal command handler callable from tests
- document CLI blocker and recommend Route 67 user command polish

Minimum validation:

- focused cli/session tests if cli.tsx or sessionRuntime is touched
- restoreCommandRunner tests otherwise
- rtk git diff --check

### Task 6: restore UX focused tests

Add focused tests for the operational surface.

Required command contract tests:

- preview mode validates required args
- execute mode requires explicit execute intent
- missing ledgerRoot/workspaceRoot/authority id is rejected
- record selection sanitization
- automaticRecovery false
- rollbackAtomicityClaim false

Required runner tests:

- preview does not write workspace files
- execute restores eligible records
- execute blocks current-content mismatch
- execute blocks missing record/content blob
- execute reports restoredFiles and blockedFiles separately
- execute does not claim atomic rollback
- preview/execute do not run automatically

Required session/user summary tests:

- captured authority failure summary mentions explicit guarded restore/preview availability
- no-authority failure summary does not claim restore
- no raw content appears
- success path remains unchanged or quiet
- route result recoveryExecuted remains false

Required CLI tests if CLI touched:

- restore preview command prints preview and does not write
- restore execute command requires explicit execute flag
- restore execute writes only eligible records
- mismatch is blocked and reported
- no provider/model execution is invoked

Minimum validation:

- focused tests for touched modules
- rtk git diff --check

### Task 7: roadmap and design evidence update

Update docs/design/explicit-restore-ux-cli-surface.md with final implementation notes:

- modules added
- command contract
- preview behavior
- execute behavior
- session/CLI integration status
- test coverage
- residual risks
- next recommendation

Update docs/design/explicit-restore-surface.md with Route 66 note.

Update docs/design/edit-capability-roadmap.md lightly:

- mark Route/Batch 66 as implemented if completed
- add evidence rows for:
  - restore command contract
  - restore command runner
  - session/user recovery summary
  - CLI restore preview/execute if implemented
- keep broad apply_patch and 9+ writes unsupported
- update recommended future sequence

Recommended next route should be one of:

1. Route 67: broad apply_patch readiness and candidate implementation split
   - if explicit restore UX is sufficient and small-N cap 8 is stable

2. Route 67: CLI restore command polish
   - if core command runner exists but CLI integration was deferred

3. Route 67: automatic recovery experiment behind non-default test path
   - only if explicit restore UX is stable and current-content guards are strong

Prefer broad apply_patch readiness split only if:
- cap 8 support is stable
- recovery authority and explicit restore UX are both present
- result/session surfaces can explain partial failures

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged by default:

- write routing behavior
- bounded small-N cap 8 behavior
- 9+ blocked behavior
- broad apply_patch blocked behavior
- provider behavior
- MCP behavior
- package scripts
- default gates
- default persistence absence
- automatic recovery absence
- atomic rollback absence
- existing changedFiles/failedFiles/plannedFiles semantics
- postWriteVerification semantics
- writer flags

New explicit restore paths may:

- inspect ledger records
- preview restore eligibility
- execute guarded explicit restore
- print user-visible restore summaries
- inspect current workspace content for guard checks

New explicit restore paths must not:

- run automatically after failures
- invoke provider/model
- claim atomic rollback
- create default persistent storage
- bypass current-content guard
- expose raw original content in summaries

## Success criteria

Route is complete if:

- explicit restore UX design note exists
- bounded reference scan is summarized
- restore command contract exists and is tested
- restore command runner exists and is tested
- session/user recovery summary exists and is tested, or a clear blocker is documented
- CLI restore preview/execute path exists and is tested, or a clear blocker is documented
- preview never writes
- execute requires explicit intent
- current-content mismatch blocks execute
- route result recoveryExecuted remains false
- explicit restore command result can report restored files separately
- atomic rollback remains false
- no provider/MCP/package/default gate changes
- bounded small-N write behavior remains unchanged
- 9+ and broad apply_patch remain blocked
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- CLI restore path requires broad lifecycle rewrite
- restore UX requires SessionManager persistence schema changes
- restore command cannot enforce explicit execute intent
- current-content guard cannot be preserved
- provider/model execution becomes necessary
- result-contract requires broad public shape churn
- automatic recovery or atomic rollback becomes necessary
- broad apply_patch or 9+ writes become necessary

## Final report

Report:

1. Route
2. External repos scanned and file-count summary
3. Design document added/updated
4. Restore command contract status
5. Restore command runner status
6. Session/user recovery summary status
7. CLI restore preview/execute status
8. Tests covered
9. Files changed
10. Forbidden files touched? yes/no
11. Default write behavior changed? yes/no
12. Provider/MCP changes? yes/no
13. Default persistence added? yes/no
14. Automatic recovery added? yes/no
15. Explicit restore execution path added? yes/no and where
16. Atomic rollback added? yes/no
17. 9+ / broad apply_patch still blocked? yes/no
18. Existing result fields preserved
19. Focused validation
20. Final validation
21. Residue cleanup
22. Residual risks
23. Next recommended route
24. Proposed commit message

Do not commit or push.
