# Route 57: recovery readiness projection batch

## Objective

Implement the Batch 57 recovery-readiness slice from the post-Route 56 edit capability roadmap.

This is a development route, not a docs-only route.

The goal is to make journal-enabled edit failures more actionable by adding plan-only recovery diagnostics:

- recovery plan projection without execution
- failed-before-apply vs applied-but-unverified classification
- explicit recovery blocker facts
- representative journal-enabled consumer wiring
- focused tests proving no recovery execution and no rollback claim
- concise design/map updates recording what changed and what remains blocked

This route must keep recovery non-executing and journal authority metadata-only.

## Current state

The current roadmap baseline is post-Route 56.

Implemented write capability remains narrow:

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
- atomicity claim
- stale-read recovery
- partial failure recovery

Journal state after Routes 52-56:

- routeScopedEditJournal exists as metadata-only route-scoped journal facts
- journalResultProjection projects journal facts into failure surfaces
- journalFailureConsumer is the shared projection entrypoint
- mixed/multi partial failure paths carry journal metadata
- representative single-file write/create/move/delete failure consumers carry journal metadata
- journalMetadataBoundary centralizes:
  - writeCapability: "metadata-only"
  - rollbackAtomicityClaim: false
  - recoveryExecuted: false
  - boundary/evidence strings

Route 56 and the roadmap comparison against ClaudeCode, opencode, and gemini-cli found the same core rule:

Recovery/rollback/restore claims require durable checkpoint, snapshot, file-history, recorded original-content, or equivalent authority. Diff/result/journal metadata alone is not recovery authority.

## Pre-development reference check

Before code edits, do a very small targeted reference check.

Use the updated roadmap as the primary source. Only inspect external files when needed to confirm naming or boundary direction.

Reference repositories:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Budget:

- at most 3 files per repository
- at most 9 external files total
- do not exceed the budget unless a direct hit is clearly necessary
- do not copy implementation code
- record only practical implications in docs/design/recovery-plan-projection.md

Search focus:

ClaudeCode:

- checkpoint
- file history
- rollback
- stale
- edit failure
- undo

opencode:

- snapshot
- revert
- apply_patch failure
- patch result
- recovery
- diff metadata

gemini-cli:

- checkpoint
- restore
- rewind
- edit result
- write-file
- file operation

The reference check should answer only:

1. How do they separate diagnostic metadata from recovery execution?
2. What durable authority exists before rollback/restore is claimed?
3. How do they distinguish pre-write failure from post-write or partially-applied failure?
4. Which naming or boundary pattern is useful for this route?

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

Optional real-user capability gates should run only if the related consumer behavior is materially changed:

- rtk npm run verify:real-user-capabilities:mixed-operation-evidence
- rtk npm run verify:real-user-capabilities:three-file-guarded-write
- rtk npm run verify:real-user-capabilities:single-file-move-evidence
- rtk npm run verify:real-user-capabilities:single-file-delete-evidence

Do not run broad/default/provider/CLI/MCP gates unless a touched file or failure directly requires it.

## Read first

Core roadmap/design:

- docs/design/edit-capability-roadmap.md
- docs/design/journal-boundary-readiness.md

Patch result/journal modules:

- packages/ts-shell/src/orchestration/patchResult/journalMetadataBoundary.ts
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

- existing tests for the files above
- journalMetadataBoundary.test.ts
- routeScopedEditJournal.test.ts
- journalResultProjection.test.ts
- any existing mixed/multi/workspace result tests touched by Route 55/56

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/patchResult/*
- focused patchResult tests
- docs/design/recovery-plan-projection.md
- docs/design/edit-capability-roadmap.md, only for a concise Route 57 evidence/next-step update
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

### Task 1: create recovery projection design note

Create docs/design/recovery-plan-projection.md.

Keep it operational, not theoretical.

Include:

- current post-Route 56 baseline
- short external reference check summary
- local terminology
- planned code touchpoints
- public result-shape decision
- test strategy
- next decision after Route 57

Define these terms:

- plan-only recovery projection
- recovery candidate
- unrecovered file
- failed-before-apply
- applied-but-unverified
- applied-and-verified-before-later-failure
- missing durable snapshot
- missing original content authority
- missing recovery executor
- missing atomicity authority
- metadata-only journal

The design must say explicitly:

- this route does not recover
- this route does not rollback
- this route does not snapshot
- this route does not persist
- this route does not infer original file contents
- this route does not change writer order
- this route does not change changedFiles or failedFiles semantics

Minimum validation:

- rtk git diff --check

### Task 2: add failure-state classification

Add a small focused helper if the current code has no clean owner.

Preferred name:

- packages/ts-shell/src/orchestration/patchResult/journalFailureStateProjection.ts

The helper should classify existing journal/result facts into diagnostic states without reading or writing files.

Preferred output concepts:

- failedBeforeApplyFiles
- appliedButUnverifiedFiles
- appliedAndVerifiedBeforeLaterFailureFiles
- unknownApplicationStateFiles, only if existing facts are insufficient

Classification guidance:

- stale-read, parse/capability/workspace/permission/preflight blockers should classify as failed-before-apply if the existing result facts make that clear.
- post-write verification failure should classify as applied-but-unverified.
- verified changed files that remain changed before a later file fails should classify as applied-and-verified-before-later-failure.
- do not guess original content.
- do not claim recovery is possible.
- do not treat plannedFiles as changedFiles.
- do not change existing result terminal semantics.

If facts are insufficient for a file, prefer an explicit unknown state over an unsafe inference.

Minimum validation:

- focused tests for the new helper
- rtk git diff --check

### Task 3: add plan-only recovery projection helper

Add a helper unless an existing projection module can own it cleanly.

Preferred name:

- packages/ts-shell/src/orchestration/patchResult/journalRecoveryPlanProjection.ts

The helper should build a diagnostic recovery plan from existing journal facts, metadata boundary facts, and failure-state classification.

Preferred shape, adjusted to existing local conventions if needed:

- mode: "plan-only"
- authority: "metadata-only"
- recoveryExecuted: false
- rollbackAtomicityClaim: false
- recoveryCandidateFiles
- unrecoveredFiles
- failedBeforeApplyFiles
- appliedButUnverifiedFiles
- appliedAndVerifiedBeforeLaterFailureFiles
- blockers
- evidence

Preferred blocker string literals:

- "metadata-only-journal"
- "no-durable-snapshot"
- "no-original-content"
- "no-recovery-executor"
- "no-atomicity-authority"
- "no-persistence-authority"

Use journalMetadataBoundary.ts for shared boundary facts where possible.

The helper must not:

- read current file contents
- read original file contents
- write files
- call writers
- call recovery code
- call rollback code
- create snapshots
- persist journal data
- change any route result status
- change changedFiles or failedFiles semantics

Minimum validation:

- focused tests for journalRecoveryPlanProjection and any directly touched journal helpers
- rtk git diff --check

### Task 4: attach recovery plan projection where safe

Attach the plan-only projection to representative journal-enabled failure results where the result contract allows it.

Preferred attachment point:

- journalResultProjection.ts or journalFailureConsumer.ts

Preferred behavior:

- expose the recovery plan on failure/stopped paths that already carry journal metadata
- keep success paths unchanged unless existing journal metadata already safely carries an empty diagnostic shape
- keep unsupported/no-write paths unchanged unless they already carry journal metadata and the result contract clearly allows the diagnostic projection
- do not attach recovery execution claims
- do not claim rollback capability
- do not change writer flags
- do not change postWriteVerification facts
- do not change changedFiles, plannedFiles, or failedFiles

Representative coverage target:

- mixedFileWriteResult partial/stopped failure
- multiFileWriteResult partial/stopped failure
- workspaceWriteResult stale-read or post-write verification failure
- at least one destructive or structural single-file consumer:
  - workspaceCreateResult verification failure
  - workspaceMoveResult verification failure
  - workspaceDeleteResult verification failure

If adding a public result field causes broad result-contract churn, do not force it. Keep the helper internal, prove the projection with tests, record the result-shape blocker in docs/design/recovery-plan-projection.md, and stop before wider surface churn.

Minimum validation:

- focused tests for touched projection/result modules
- rtk git diff --check

### Task 5: focused cross-consumer tests

Add or update focused tests to prove the recovery-readiness projection.

Required assertions where projection is attached:

- recovery plan exists
- mode is "plan-only"
- authority is "metadata-only"
- recoveryExecuted is false
- rollbackAtomicityClaim is false
- blockers include metadata/no-snapshot/no-original-content/no-executor/no-atomicity facts
- recoveryCandidateFiles match existing journal candidate facts
- unrecoveredFiles match existing journal unrecovered facts
- failedBeforeApplyFiles do not pretend to be applied
- appliedButUnverifiedFiles only come from applied-but-failed verification facts
- appliedAndVerifiedBeforeLaterFailureFiles only come from verified changed-prefix facts
- changedFiles are preserved
- failedFiles are preserved
- plannedFiles are preserved where present
- writer flags are preserved
- postWriteVerification is preserved where applicable
- stopped/success/error semantics are preserved

Use shared test assertion helpers if that reduces duplication.

Minimum validation:

- focused tests for touched patchResult files
- rtk git diff --check

### Task 6: update design/map evidence

Update docs/design/recovery-plan-projection.md with final implementation notes:

- helper files added
- attachment points
- consumer coverage
- result-shape decision
- known gaps
- next recommended route

Update docs/design/edit-capability-roadmap.md only lightly:

- mark Batch 57 as implemented if completed
- add evidence rows or update existing Batch 57 row
- update the recommended next batch based on actual implementation result

Do not rewrite the entire roadmap again.

The likely next recommendation should be one of:

1. Batch 58 durable authority design/prototype decision
2. Batch 60 3+ mixed write readiness audit

Prefer Batch 58 if Route 57 confirms that recovery projection is useful but blocked by absent durable authority.

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
- unsupported/no-write behavior unless only adding safe diagnostic projection to existing journal metadata
- package scripts
- provider/session/CLI/MCP behavior
- durable persistence absence
- recovery execution absence
- rollback/snapshot absence

## Success criteria

Route is complete if:

- recovery-plan design note exists
- bounded reference check is summarized
- failure-state classification exists and is tested, or a clear blocker is documented
- plan-only recovery projection exists and is tested, or a clear blocker is documented
- representative journal-enabled failure consumers expose the projection where safe, or result-shape blocker is documented
- tests prove no recovery execution and no rollback claim
- tests prove changedFiles, failedFiles, plannedFiles, writer flags, and postWriteVerification are preserved
- roadmap/design evidence is updated concisely
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- projection requires runtime writer behavior changes
- projection requires reading or storing original file contents
- projection requires durable snapshot/storage
- projection requires recovery execution
- projection requires rollback/snapshot implementation
- public result-shape changes cause broad contract churn
- implementation requires SessionManager.ts, cli.tsx, package scripts, provider/session/CLI/MCP behavior, or default gate changes

## Final report

Report:

1. Route
2. External repos scanned and file-count summary
3. Design document added/updated
4. Failure-state classifier added/evolved or blocker
5. Recovery plan projection added/evolved or blocker
6. Projection attachment points
7. Consumers covered by tests
8. Files changed
9. Forbidden files touched? yes/no
10. Runtime writer behavior changed? yes/no
11. Durable persistence added? yes/no
12. Recovery execution added? yes/no
13. Rollback/snapshot still absent? yes/no
14. Existing result fields preserved
15. Focused validation
16. Final validation
17. Residue cleanup
18. Residual risks
19. Next recommended route
20. Proposed commit message

Do not commit or push.
