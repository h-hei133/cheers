# Route 59: opencode-style minimum recovery authority loop

## Objective

Implement a practical minimum recovery-authority loop, using opencode's snapshot/revert layering as the primary reference.

This route should stop over-designing metadata-only seams and implement a small, non-default, explicit recovery authority path:

- snapshot/original-state authority store
- writer preflight capture for selected narrow write routes under explicit non-default opt-in
- explicit restore primitive with current-content guard
- cleanup/purge behavior
- recoveryPlan diagnostics that can distinguish "authority captured" from "recovery executed"
- focused tests proving the default runtime remains unchanged

This route must not implement broad apply_patch, 3+ mixed writes, 4+ writes, provider changes, CLI commands, session UX, default persistence, automatic recovery, or full transaction rollback.

It may implement per-file restore primitives in focused modules/tests. Restore must be explicit, guarded, and non-default.

## Strategy shift

Previous routes established the safe boundary:

- Route 57: plan-only recovery projection and failure-state classification
- Route 58: durable authority seam and original-content authority readiness

The project now has enough reference evidence from ClaudeCode, opencode, and gemini-cli. Do not continue inventing a fully custom recovery design from scratch.

Primary reference:

- opencode snapshot/revert layering

Secondary references:

- gemini-cli checkpoint/restore and current-content protection
- ClaudeCode read-before-write, stale-read, and file-history semantics

Port architecture and boundaries, not source code verbatim. Use this repository's existing types, style, tests, and route boundaries.

## Current state

Build on the current working tree. Do not reset Route 57 or Route 58 changes.

Route 58 delivered:

- docs/design/durable-authority-decision.md
- journalDurableAuthority.ts
- journalOriginalContentAuthority.ts
- journalRecoveryReadinessProjection.ts
- recoveryPlan fields for durableAuthority, originalContentAuthority, and recoveryReadiness
- original-content ledger selected as smallest viable durable-authority direction
- no durable persistence, file IO, git, snapshot, recovery execution, rollback, or writer behavior changes

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

Before editing code, perform a bounded implementation-oriented scan.

Primary reference repository:

- opencode: /home/wang/projects/opencode

Secondary references:

- ClaudeCode: /home/wang/projects/source-claudecode
- gemini-cli: /home/wang/projects/gemini-cli

Budget:

- opencode: inspect at most 8 directly relevant files
- gemini-cli: inspect at most 4 directly relevant files
- ClaudeCode: inspect at most 3 directly relevant files
- total external files: at most 15
- exceed by at most 2 files only if a direct recovery-authority file is clearly necessary
- do not copy implementation code verbatim
- record path references and practical implications only

Search focus:

opencode:

- snapshot
- revert
- apply_patch
- edit
- write
- session revert
- restore
- diff metadata
- file state
- cleanup

gemini-cli:

- checkpoint
- restore
- rewind
- gitService
- edit result
- write-file
- current content

ClaudeCode:

- fileHistory
- rewind
- stale
- read-before-write
- edit failure
- restore

The scan should answer:

1. How does opencode keep patch/edit metadata separate from snapshot/revert authority?
2. What is captured before write?
3. What state is needed to restore safely?
4. How is cleanup/residue handled?
5. How do gemini-cli and ClaudeCode guard against overwriting hidden user edits?
6. What is the smallest local equivalent we can implement now?

Record findings in docs/design/minimum-recovery-authority-loop.md.

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

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Optional real-user capability gates:

- Do not run broad/default/provider/CLI/MCP gates.
- Run focused real-user capability gates only if default runtime behavior is materially changed.
- This route should keep default behavior unchanged, so focused unit/integration tests plus result-contract/build should normally be sufficient.

## Read first

Design/roadmap:

- docs/design/edit-capability-roadmap.md
- docs/design/recovery-plan-projection.md
- docs/design/durable-authority-decision.md

Route 57/58 helpers:

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

- existing tests for all touched files
- journalDurableAuthority.test.ts
- journalOriginalContentAuthority.test.ts
- journalRecoveryReadinessProjection.test.ts
- journalRecoveryPlanProjection.test.ts
- journalResultProjection.test.ts
- representative write/delete/multi/mixed route/result tests

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchRecovery/*
- focused tests for touched modules
- docs/design/minimum-recovery-authority-loop.md
- docs/design/durable-authority-decision.md, only Route 59 notes
- docs/design/recovery-plan-projection.md, only Route 59 notes
- docs/design/edit-capability-roadmap.md, concise Batch 59 update
- this route spec

Allowed behavior changes:

- add explicit non-default recovery-authority option to selected narrow write routes
- under that explicit option, capture pre-write original state before writer execution
- add explicit restore primitive in a focused patchRecovery module
- add isolated tests using temp ledger roots and test workspaces

Forbidden unless a blocker is reported first:

- broad apply_patch support
- 3+ mixed write support
- 4+ write support
- runtime default persistence
- automatic capture by default
- automatic recovery
- full transaction rollback
- CLI restore command
- SessionManager persistence
- provider/session/CLI/MCP behavior changes
- package scripts
- default gates
- git/shadow-git integration
- patchApplication rewrites
- mutationRoutingProjection changes

## Batched tasks

### Task 1: minimum recovery authority design

Create docs/design/minimum-recovery-authority-loop.md.

It should explain the opencode-style local architecture:

- patch/edit result metadata is not recovery authority
- recovery authority is stored separately
- capture happens before write under explicit non-default opt-in
- restore is explicit, not automatic
- restore requires current-content guard
- cleanup/purge is mandatory
- default runtime has no persistence and no recovery authority
- broad writes remain delayed

Include:

- reference scan summary
- selected local architecture
- module map
- record shape
- capture lifecycle
- restore lifecycle
- cleanup lifecycle
- current-content guard
- path/workspace boundary
- redaction/residue policy
- supported initial coverage
- non-goals
- next route decision

Minimum validation:

- rtk git diff --check

### Task 2: implement recovery authority store

Add a focused store module.

Preferred location:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts

The store should support explicit non-default storage only.

Preferred concepts:

- mode:
  - "disabled"
  - "non-default"
- ledgerRoot:
  - required for non-default
  - no default value
- authorityId or routeId
- recordId
- workspaceRelativePath
- operationKind:
  - "update"
  - "create"
  - "delete"
  - "move"
- beforeState:
  - "exists"
  - "absent"
- beforeContentHash, optional
- beforeContentSizeBytes, optional
- beforeContentRef, optional
- expectedCurrentState:
  - "exists"
  - "absent"
  - "unknown"
- expectedCurrentContentHash, optional
- capturedAtPhase:
  - "pre-write"
- persistence:
  - "non-default"
- schemaVersion
- createdAt

Store behavior:

- disabled mode performs no file IO and returns blocked diagnostics
- non-default mode requires explicit ledgerRoot
- manifest stores metadata only
- raw original content is stored separately as an opaque content blob
- content blob name is hash/record based, not path based
- manifest avoids raw content snippets
- manifest avoids absolute workspace paths
- workspace paths are relative and sanitized
- absolute paths and path traversal are rejected
- cleanup deletes record and blob
- purge deletes an authority/route namespace if cleanly implementable
- read returns only data stored under ledgerRoot

The store may use Node fs/path/crypto APIs.

The store must not:

- read workspace files by itself
- write workspace files
- call writers
- call git
- call recovery automatically
- mutate route status
- create default storage roots

Minimum validation:

- focused tests for recoveryAuthorityStore
- rtk git diff --check

### Task 3: implement explicit restore primitive

Add a restore module.

Preferred location:

- packages/ts-shell/src/orchestration/patchRecovery/restorePrimitive.ts

This module may write workspace files, but only when explicitly called in tests or future non-default routes.

Required restore behavior:

- inputs:
  - ledgerRoot
  - authorityId / routeId
  - recordId
  - workspaceRoot
  - expected workspaceRelativePath
  - expected current state/hash
- validate workspaceRelativePath stays inside workspaceRoot
- read recovery authority record from ledgerRoot
- inspect current workspace content/state
- require current state to match expectedCurrentState
- if current file exists and expectedCurrentContentHash is present, require hash match
- reject if current content differs from expected hash
- reject if record path and requested restore path disagree
- reject path traversal / absolute path
- restore beforeState:
  - if beforeState exists: write original content back to the file
  - if beforeState absent: remove the created file only if current-content guard passes
- return structured result:
  - restored: boolean
  - blockedReason, if blocked
  - restoredFiles
  - inspectedFiles
  - evidence

This is a per-file restore primitive, not transaction rollback.

It must not:

- run automatically
- bypass current-content guard
- restore multiple files as an atomic transaction
- integrate with CLI/session/provider
- use git
- claim rollback atomicity

Minimum validation:

- focused tests for restorePrimitive
- rtk git diff --check

### Task 4: add non-default pre-write capture integration for narrow writers

Add explicit non-default capture option to selected narrow writer routes.

Preferred implementation:

- add an optional recoveryAuthority / snapshotAuthority / originalContentAuthority option to route functions where local conventions allow
- default remains disabled / absent
- existing callers do not activate capture
- tests can pass explicit temp ledgerRoot and authorityId
- capture must happen after workspace/capability/permission/final stale-read checks and before writer execution
- capture should use already-read pre-write content if available
- only read additional workspace content if necessary and only inside the explicit non-default capture path
- capture should occur before any file write in a multi-file route

Required minimum integration coverage:

1. single-file update route
2. single-file delete route
3. exactly-two update route

Add one additional route if clean:

- single-file move
- single-file create with beforeState absent
- exactly-two mixed route

If the additional route is not clean, document the blocker and proceed with the three required routes.

Capture semantics:

- update: beforeState exists, original content captured
- delete: beforeState exists, original content captured
- create: beforeState absent, expected current content after write may be captured/derived only if safe
- move: capture source beforeState exists and target beforeState absent if clean
- multi-file update: capture all target original states before any writer starts
- mixed: capture every operand's beforeState if clean

Required default guarantee:

- without explicit recoveryAuthority option, existing route behavior and result shape remain unchanged

Minimum validation:

- focused route/result tests for touched writer routes
- rtk git diff --check

### Task 5: connect captured authority to recoveryPlan diagnostics

Update Route 57/58 recoveryPlan helpers where safe.

Preferred behavior:

- default runtime recoveryPlan remains plan-only and metadata-only
- when a result carries explicit non-default capture authority metadata in tests, recoveryPlan may say durable/original-content authority is captured
- recoveryExecuted remains false
- rollbackAtomicityClaim remains false
- recoveryPlan may indicate:
  - canAttemptExplicitRestore: true only if current-content guard requirements are satisfied and restore primitive is available
  - canRecoverAutomatically: false
  - canRollbackAtomically: false
- no existing default path claims restore/recovery capability

If public result-shape churn is large, keep detailed authority diagnostics internal and expose conservative blocker/evidence facts.

Minimum validation:

- focused tests for journalRecoveryPlanProjection / journalRecoveryReadinessProjection / journalResultProjection if touched
- rtk git diff --check

### Task 6: focused tests for capture/store/restore loop

Add focused tests proving the minimum loop.

Required store tests:

- disabled mode performs no file IO
- non-default mode requires explicit ledgerRoot
- manifest contains metadata only
- manifest contains no raw content snippets
- manifest contains no absolute workspace paths
- content blob is stored separately
- content hash is stable
- cleanup removes record/blob
- purge removes namespace if implemented
- absolute/path traversal inputs are rejected

Required restore tests:

- restore update record succeeds when current content hash matches expected
- restore update record is blocked when current content hash differs
- restore delete record can restore deleted file when current state matches expected
- restore create/absent-before record can remove created file only when current-content guard passes, if create is supported
- restore rejects record/path mismatch
- restore rejects path traversal
- restore never claims atomic rollback

Required capture tests:

- single update route captures original content only under explicit option
- single update route default path does not capture
- single delete route captures original content only under explicit option
- exactly-two update route captures both files before any writer starts
- if additional route is integrated, add equivalent focused coverage
- capture failure stops safely before writer where appropriate
- existing changedFiles/failedFiles/plannedFiles/postWriteVerification/writer flags remain preserved

Required recoveryPlan tests:

- captured authority can be reflected as explicit non-default restore authority if result contract allows
- recoveryExecuted remains false
- rollbackAtomicityClaim remains false
- no automatic recovery is claimed
- default runtime remains metadata-only / no authority

Minimum validation:

- focused tests for touched modules/routes
- rtk git diff --check

### Task 7: update design and roadmap evidence

Update docs/design/minimum-recovery-authority-loop.md with final implementation notes:

- modules added
- coverage implemented
- capture lifecycle
- restore primitive behavior
- cleanup/redaction/path guarantees
- default behavior guarantees
- residual risks
- next recommended route

Update docs/design/durable-authority-decision.md:

- Route 59 implemented opencode-style minimum recovery authority loop
- original-content/snapshot authority is now available only through explicit non-default route/test paths
- automatic recovery and rollback remain absent

Update docs/design/recovery-plan-projection.md if recoveryPlan shape changed.

Update docs/design/edit-capability-roadmap.md lightly:

- mark Batch 59 as implemented if completed
- add evidence rows for:
  - recovery authority store
  - explicit restore primitive
  - non-default writer preflight capture
  - current-content guard
  - cleanup/redaction/path-boundary tests
- update recommended future sequence

Recommended next batch should be one of:

1. Batch 60: expand non-default capture coverage to remaining narrow routes and partial failure surfaces
   - if Route 59 captures only update/delete/two-update and proves the loop

2. Batch 60: recovery executor surface / user-visible explicit restore UX design
   - if restore primitive works but lacks product surface

3. Batch 60: 3+ mixed readiness audit
   - if recovery authority loop is stable enough and broad writes remain delayed

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
- single update/create/move/delete default success behavior
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
- perform explicit per-file restore primitive calls
- inspect workspace current content for guarded restore

Non-default explicit test paths must not:

- claim atomic rollback
- run automatically
- alter provider/CLI/session behavior
- create default persistent storage

## Success criteria

Route is complete if:

- opencode-style minimum recovery authority design exists
- bounded reference scan is summarized
- recovery authority store exists and is tested
- explicit restore primitive exists and is tested
- non-default writer preflight capture is integrated into at least:
  - single update
  - single delete
  - exactly-two update
- at least one additional narrow route is integrated, or a clear blocker is documented
- default route behavior remains unchanged
- current-content guard blocks hidden user-edit overwrite
- cleanup/redaction/path-boundary guarantees are tested
- recoveryPlan reflects captured authority where safe or documents result-shape blocker
- recoveryExecuted remains false unless an explicit restore primitive test result is being reported outside normal route result
- rollbackAtomicityClaim remains false
- no broad writes, 3+ mixed, provider/session/CLI/MCP changes, package scripts, or default gates are added
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- pre-write capture requires broad writer rewrites
- capture cannot be made explicit/non-default
- capture changes default runtime behavior
- restore primitive cannot enforce current-content guard
- storage requires SessionManager/session persistence
- route integration requires cli.tsx, SessionManager.ts, provider/session/CLI/MCP, package scripts, default gates, or mutationRoutingProjection changes
- result-contract requires broad public shape churn
- broad writes or 3+ mixed writes become necessary

## Final report

Report:

1. Route
2. External repos scanned and file-count summary
3. Main opencode patterns ported conceptually
4. Design documents added/updated
5. Recovery authority store added/evolved or blocker
6. Restore primitive added/evolved or blocker
7. Pre-write capture integration points
8. Additional narrow route integrated or blocker
9. Capture/store/restore tests covered
10. RecoveryPlan behavior
11. Files changed
12. Forbidden files touched? yes/no
13. Default runtime writer behavior changed? yes/no
14. Non-default persistence added? yes/no and where
15. Default persistence added? yes/no
16. Workspace current-content inspection added? yes/no and where
17. Recovery execution added? explicit primitive only / automatic no
18. Rollback/snapshot still absent? yes/no
19. Broad writes / 3+ mixed added? yes/no
20. Existing result fields preserved
21. Focused validation
22. Final validation
23. Residue cleanup
24. Residual risks
25. Next recommended route
26. Proposed commit message

Do not commit or push.
