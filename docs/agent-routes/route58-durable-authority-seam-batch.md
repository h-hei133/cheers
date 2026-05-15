# Route 58: durable authority seam and original-content readiness batch

## Objective

Implement a thicker Batch 58 after Route 57.

Route 57 added plan-only recovery projection, failure-state classification, recovery blocker facts, representative recoveryPlan wiring, and tests proving no recovery execution and no rollback claim.

Route 58 should now move beyond a thin "authority absent" descriptor. It should decide the durable authority direction and create a non-executing authority seam that future storage/recovery work can use.

This route should add:

- durable authority design decision
- original-content authority seam
- capture requirement / authority record shape
- restore/recovery readiness classification
- absent-authority diagnostics in recoveryPlan where safe
- focused tests across helper and representative consumers
- concise roadmap/design evidence

This route must not implement durable persistence, recovery execution, rollback execution, snapshot restore, writer changes, broad writes, 3+ mixed writes, 4+ writes, or new write capability.

The goal is to make the next route concrete: either implement a non-default original-content ledger prototype, or deliberately defer recovery authority and audit 3+ mixed writes under explicit no-recovery semantics.

## Current state

Build on the current working tree. Do not reset Route 57 changes.

Route 57 delivered:

- docs/design/recovery-plan-projection.md
- journalFailureStateProjection.ts
- journalRecoveryPlanProjection.ts
- recoveryPlan under existing routeScopedEditJournal failure surfaces
- journalMetadataBoundary blocker facts:
  - metadata-only-journal
  - no-durable-snapshot
  - no-original-content
  - no-recovery-executor
  - no-atomicity-authority
  - no-persistence-authority
- representative recoveryPlan coverage:
  - mixed partial failure
  - multi-file partial/post-write failure
  - single-file stale-read/post-write verification
  - structural move verification failure

Current write capability remains intentionally narrow:

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
- durable journal storage
- recovery executor
- rollback executor
- snapshot/revert
- stale-read recovery
- partial failure recovery
- atomicity claim

## Pre-development reference check

Before code edits, perform a bounded durable-authority reference check.

Use existing docs as the primary source:

- docs/design/edit-capability-roadmap.md
- docs/design/journal-boundary-readiness.md
- docs/design/recovery-plan-projection.md

Inspect external repositories only to confirm durable authority design patterns.

Reference repositories:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Budget:

- at most 4 files per repository
- at most 12 external files total
- exceed by at most 2 files only if a direct durable-authority file is clearly useful
- do not copy implementation code
- record only directional patterns, path references, and implications

Search focus:

ClaudeCode:

- fileHistory
- checkpoint
- rewind
- undo
- stale
- original content
- edit failure
- restore

opencode:

- snapshot
- revert
- session revert
- checkpoint
- apply_patch
- diff metadata
- file history
- restore

gemini-cli:

- checkpoint
- restore
- rewind
- gitService
- edit
- write-file
- file operation
- original content

The reference check should answer:

1. What durable authority backs restore/rollback/recovery?
2. Is authority captured before write, after write, or outside the edit tool?
3. Does restore require current-content inspection?
4. How are stale/user edits guarded before restore?
5. Which local direction is most appropriate now:
   - original-content ledger
   - snapshot/checkpoint
   - shadow-git/checkpoint
   - file-history
   - keep metadata-only and defer recovery authority

Record findings in docs/design/durable-authority-decision.md.

## Validation policy

Use minimal validation between tasks.

Preflight:

- rtk git status --short --branch
- rtk git diff --check

After docs-only tasks:

- rtk git diff --check

After code/test tasks:

- run focused tests for touched patchResult files only
- rtk git diff --check

Final:

- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Optional real-user capability gates should run only if related runtime behavior is materially changed. This route should not require them.

Do not run broad/default/provider/CLI/MCP gates unless a touched file or failure directly requires it.

## Read first

Roadmap/design:

- docs/design/edit-capability-roadmap.md
- docs/design/journal-boundary-readiness.md
- docs/design/recovery-plan-projection.md

Patch result/journal modules:

- packages/ts-shell/src/orchestration/patchResult/journalMetadataBoundary.ts
- packages/ts-shell/src/orchestration/patchResult/journalFailureStateProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalRecoveryPlanProjection.ts
- packages/ts-shell/src/orchestration/patchResult/routeScopedEditJournal.ts
- packages/ts-shell/src/orchestration/patchResult/journalResultProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalFailureConsumer.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceCreateResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteResult.ts

Focused tests:

- journalMetadataBoundary.test.ts
- journalFailureStateProjection.test.ts
- journalRecoveryPlanProjection.test.ts
- journalResultProjection.test.ts
- representative mixed/multi/workspace result tests touched by Route 57

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/patchResult/*
- focused patchResult tests
- docs/design/durable-authority-decision.md
- docs/design/recovery-plan-projection.md, only for Route 58 notes
- docs/design/edit-capability-roadmap.md, only for concise Batch 58 evidence/next-step updates
- this route spec

Avoid touching unless a blocker is reported first:

- runtime writer behavior
- patchApplication/*
- mutationRoutingProjection.ts
- workspace write route execution flow
- SessionManager.ts
- cli.tsx
- package.json
- scripts/*
- provider/session/CLI/MCP behavior
- default gates

## Batched tasks

### Task 1: durable authority decision document

Create docs/design/durable-authority-decision.md.

It should guide Route 58 and the next several routes.

Include:

- post-Route 57 baseline
- bounded reference comparison
- durable authority requirements for this project
- authority options considered
- recommended direction
- why broad writes remain delayed
- what this route prototypes
- what this route still forbids
- next-route decision criteria

Compare these authority options:

1. Metadata-only blocker
   - current state
   - useful for diagnostics
   - insufficient for recovery

2. Original-content ledger
   - captures original content authority before write
   - can support targeted restore later if current-content checks pass
   - likely smallest local next step
   - sensitive residue risk
   - requires cleanup/redaction/storage policy

3. Hash-only original-content ledger
   - captures before/after hashes or expected hashes
   - useful for safety checks
   - not enough to restore without content authority

4. Snapshot/checkpoint authority
   - captures file or workspace snapshot before writes
   - stronger restore semantics
   - larger lifecycle/storage problem

5. Git/shadow-git authority
   - close to opencode/gemini-cli style
   - powerful but heavy
   - requires repo/non-repo semantics and cleanup rules

6. File-history authority
   - close to ClaudeCode style
   - needs per-file history ownership and session lifecycle

Recommended direction should be explicit.

Preferred recommendation unless evidence says otherwise:

- next actual durable authority route should be an original-content authority design/prototype behind a non-default seam
- this Route 58 should only add the seam/readiness model, not storage

Minimum validation:

- rtk git diff --check

### Task 2: add durable authority descriptor

Add a focused helper.

Preferred file:

- packages/ts-shell/src/orchestration/patchResult/journalDurableAuthority.ts

This helper should describe authority availability and future authority options without implementing storage.

Preferred active-state shape:

- authorityKind:
  - "none"
  - "original-content-ledger"
  - "hash-only-ledger"
  - "snapshot-checkpoint"
  - "git-checkpoint"
  - "file-history"
- availability:
  - "absent"
  - "design-only"
  - "prototype-disabled"
  - "available"
- persistence:
  - "none"
  - "memory-only"
  - "non-default"
  - "durable"
- canRecover: boolean
- canRollback: boolean
- canRestoreOriginalContent: boolean
- canVerifyCurrentContent: boolean
- blockers
- evidence
- requiredBeforeRecovery
- requiredBeforeRollback

Current active descriptor must represent current project state:

- authorityKind: "none"
- availability: "absent"
- persistence: "none"
- canRecover: false
- canRollback: false
- canRestoreOriginalContent: false
- canVerifyCurrentContent: false

It may include typed future option descriptors, but they must be clearly inactive and must not create capability claims.

The helper must not:

- read files
- write files
- persist data
- create snapshots
- call git
- call recovery code
- call rollback code
- modify journal state
- modify route status
- change writer behavior

Minimum validation:

- focused tests for journalDurableAuthority
- rtk git diff --check

### Task 3: add original-content authority seam

Add a second focused helper for the future original-content authority seam.

Preferred file:

- packages/ts-shell/src/orchestration/patchResult/journalOriginalContentAuthority.ts

This file should define types and pure functions only. It must not store content or read files.

It should model:

- original-content authority requirement
- capture record shape
- restore eligibility diagnostics
- missing-authority diagnostics

Preferred concepts:

- OriginalContentAuthorityStatus:
  - "missing"
  - "hash-only"
  - "content-authority-present"
  - "content-authority-stale"
  - "not-applicable"

- OriginalContentCaptureRequirement:
  - filePath
  - operationKind
  - requiresOriginalContent
  - requiresCurrentContentCheck
  - requiresWorkspaceAuthority
  - requiresPersistence
  - reason

- OriginalContentAuthorityRecord shape:
  - filePath
  - operationKind
  - beforeContentHash, optional
  - beforeContentAvailable: boolean
  - expectedCurrentContentHash, optional
  - capturedAtPhase:
    - "not-captured"
    - "pre-write"
    - "post-write"
    - "external"
  - persistence:
    - "none"
    - "memory-only"
    - "non-default"
    - "durable"

- RestoreEligibilityDiagnostic:
  - canAttemptRestore: false for current route
  - blockers
  - missing
  - evidence

Current functions should only derive requirements/diagnostics from existing per-file plan/journal facts and passed-in metadata.

They must not:

- read file contents
- hash file contents from disk
- write files
- store original content
- persist records
- call recovery code
- call rollback code
- infer original content
- claim restore can be attempted

Minimum validation:

- focused tests for journalOriginalContentAuthority
- rtk git diff --check

### Task 4: add durable recovery readiness projection

Add a projection helper that combines:

- plan-only recovery projection
- failure-state classification
- durable authority descriptor
- original-content authority seam diagnostics

Preferred file:

- packages/ts-shell/src/orchestration/patchResult/journalRecoveryReadinessProjection.ts

Preferred output concepts:

- recoveryPlanMode: "plan-only"
- authorityKind
- authorityAvailability
- persistence
- canRecover: false
- canRollback: false
- canRestoreOriginalContent: false
- requiresDurableAuthority: boolean
- originalContentRequirements
- restoreEligibility
- blockers
- evidence

This helper should provide a cleaner future-facing projection than just sprinkling blockers into recoveryPlan.

It must preserve:

- recoveryExecuted: false
- rollbackAtomicityClaim: false
- no writer behavior change
- no file IO
- no persistence
- no route status change

Minimum validation:

- focused tests for journalRecoveryReadinessProjection and directly touched helpers
- rtk git diff --check

### Task 5: connect readiness diagnostics to recoveryPlan where safe

Update journalRecoveryPlanProjection.ts and/or journalResultProjection.ts where safe.

Preferred behavior:

- recoveryPlan includes durable authority/readiness diagnostics under existing recoveryPlan shape if result-contract allows
- if a new nested field is safe, prefer a compact field such as:
  - durableAuthority
  - originalContentAuthority
  - recoveryReadiness
- if public shape churn is high, keep readiness projection internal and expose only blocker/evidence strings already allowed by recoveryPlan
- do not alter success paths unless they already safely carry empty diagnostics
- do not alter unsupported/no-write paths unless they already carry journal/recoveryPlan metadata safely

Required behavior:

- recoveryPlan still says plan-only
- recoveryPlan still says metadata-only
- recoveryExecuted remains false
- rollbackAtomicityClaim remains false
- blockers still include:
  - metadata-only-journal
  - no-durable-snapshot
  - no-original-content
  - no-recovery-executor
  - no-atomicity-authority
  - no-persistence-authority
- no path claims canRecover/canRollback/canRestoreOriginalContent as true

Minimum validation:

- focused tests for journalRecoveryPlanProjection, journalResultProjection, and representative consumer tests touched
- rtk git diff --check

### Task 6: representative consumer tests

Add/update focused tests proving durable authority absence and original-content requirements on representative recoveryPlan surfaces.

Cover representative existing Route 57 surfaces:

- mixedFileWriteResult partial/stopped failure
- multiFileWriteResult partial/post-write failure
- workspaceWriteResult stale-read or post-write verification failure
- at least one structural consumer:
  - workspaceMoveResult verification failure
  - workspaceCreateResult verification failure
  - workspaceDeleteResult verification failure

Required assertions where recoveryPlan/readiness is attached:

- recoveryPlan exists
- recoveryPlan remains plan-only
- authority remains metadata-only
- durable authority descriptor is absent/currently none, either as field or evidence
- canRecover is false if represented
- canRollback is false if represented
- canRestoreOriginalContent is false if represented
- persistence is none if represented
- original-content requirement is represented where applicable, either as field or evidence
- restore eligibility says cannot attempt restore, if represented
- blockers include no-durable-snapshot/no-original-content/no-persistence/no-executor/no-atomicity
- recoveryExecuted remains false
- rollbackAtomicityClaim remains false
- changedFiles are preserved
- failedFiles are preserved
- plannedFiles are preserved where present
- postWriteVerification is preserved where applicable
- writer flags are preserved
- stopped/success/error semantics are preserved

Avoid heavy duplication. Add a shared assertion helper if useful.

Minimum validation:

- focused tests for touched patchResult files
- rtk git diff --check

### Task 7: update design and roadmap evidence

Update docs/design/durable-authority-decision.md with final implementation notes:

- helper files added
- authority direction selected
- what is now modeled
- what is still absent
- why recovery remains blocked
- next recommended route

Update docs/design/recovery-plan-projection.md with a short Route 58 note:

- durable authority seam added
- original-content authority seam added
- recoveryPlan now includes or explains authority/readiness diagnostics
- recovery remains non-executing

Update docs/design/edit-capability-roadmap.md lightly:

- mark Batch 58 as completed if completed
- add evidence rows for:
  - durable authority descriptor
  - original-content authority seam
  - recovery readiness projection
- update the recommended future sequence
- choose next batch

Recommended next batch should be one of:

1. Batch 59: original-content ledger non-default storage prototype
   - if Route 58 confirms original-content authority is the smallest viable durable authority path

2. Batch 60: 3+ mixed write readiness audit under explicit no-recovery semantics
   - if Route 58 decides durable authority should remain deferred

3. Product/user failure surface batch
   - if diagnostics are now strong but user/session display remains too weak

Do not write the next route file in this task.

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged:

- runtime writer behavior
- write execution order
- changedFiles semantics
- failedFiles semantics
- plannedFiles semantics
- postWriteVerification semantics
- writer flags
- single update/create/move/delete success behavior
- exactly-two update behavior
- exactly-three update behavior
- exactly-two mixed write behavior
- unsupported/no-write behavior unless only adding safe diagnostics under existing journal/recoveryPlan metadata
- package scripts
- provider/session/CLI/MCP behavior
- durable persistence absence
- recovery execution absence
- rollback/snapshot absence

## Success criteria

Route is complete if:

- durable authority decision document exists
- bounded reference check is summarized
- durable authority options are compared
- recommended durable authority direction is explicit
- journalDurableAuthority helper exists and is tested
- journalOriginalContentAuthority seam exists and is tested
- recovery readiness projection exists and is tested, or a clear blocker is documented
- recoveryPlan diagnostics include or explain absent durable/original-content authority where safe
- representative tests prove recovery remains blocked by absent authority
- tests prove no recovery execution and no rollback claim
- tests prove no durable persistence, file IO, git calls, snapshot, or writer behavior changes
- tests prove existing changedFiles/failedFiles/plannedFiles/postWriteVerification/writer flags are preserved
- roadmap/design evidence is updated concisely
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- durable authority descriptor requires reading or writing files
- original-content authority seam requires storing content
- recovery readiness projection requires persistence
- recoveryPlan changes require recovery execution
- recoveryPlan changes require rollback/snapshot implementation
- public result-shape changes cause broad result-contract churn
- implementation requires patchApplication, mutationRoutingProjection, SessionManager.ts, cli.tsx, package scripts, provider/session/CLI/MCP behavior, default gate changes, or runtime writer changes

## Final report

Report:

1. Route
2. External repos scanned and file-count summary
3. Durable authority options compared
4. Recommended durable authority direction
5. Design documents added/updated
6. journalDurableAuthority added/evolved or blocker
7. journalOriginalContentAuthority added/evolved or blocker
8. recovery readiness projection added/evolved or blocker
9. RecoveryPlan diagnostic attachment points
10. Consumers covered by tests
11. Files changed
12. Forbidden files touched? yes/no
13. Runtime writer behavior changed? yes/no
14. Durable persistence added? yes/no
15. File IO / git / snapshot added? yes/no
16. Recovery execution added? yes/no
17. Rollback/snapshot still absent? yes/no
18. Existing result fields preserved
19. Focused validation
20. Final validation
21. Residue cleanup
22. Residual risks
23. Next recommended route
24. Proposed commit message

Do not commit or push.
