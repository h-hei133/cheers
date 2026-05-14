# Route 54: journal-backed stopped/partial failure runtime consumer batch

## Objective

Use the Route 52/53 journal projection in real stopped/partial failure result paths.

This route should make runtime result producers create/pass journal metadata for failure surfaces, but the journal must remain metadata-only.

Do not implement rollback.
Do not implement recovery.
Do not implement snapshot.
Do not add write capability.

## Scope

Allowed runtime consumers:

- multiFileWriteResult / multi-file partial failure result
- mixedFileWriteResult / mixed partial failure result
- workspaceWriteResult / single-file stale or verification failure result
- workspaceMoveResult / move verification failure result
- workspaceDeleteResult / delete verification failure result

Pick the highest-value consumers first. Do not touch all files just for symmetry.

## Forbidden

- rollback/recovery/snapshot execution
- writer authority changes
- new write lanes
- broad apply_patch
- 3+ mixed writes
- SessionManager.ts
- cli.tsx
- provider/session/CLI/MCP behavior
- package scripts
- default gates

## Validation policy

Use light validation.

Preflight:

- rtk git status --short --branch
- rtk git diff --check
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/journalResultProjection.test.ts

During edits:

- run focused tests for touched modules
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

Final:

- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git status --short --branch

Run only if touched paths justify it:

- rtk npm run verify:real-user-capabilities:mixed-operation-evidence
- rtk npm run verify:real-user-capabilities:three-file-guarded-write
- rtk npm run verify:real-user-capabilities:single-file-move-evidence
- rtk npm run verify:real-user-capabilities:single-file-delete-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e

## Read first

- packages/ts-shell/src/orchestration/patchResult/routeScopedEditJournal.ts
- packages/ts-shell/src/orchestration/patchResult/journalResultProjection.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteResult.ts

## Implementation target

Create/pass routeScopedEditJournal metadata in at least two real result producer paths.

Preferred order:

1. mixedFileWriteResult partial failure path
2. multiFileWriteResult partial failure path
3. one single-file verification/stale failure path if it is clean

The journal should record:

- planned operations
- writerStarted
- applied operations
- verified operations
- failed operations
- unrecovered operations
- recovery candidates if applicable
- rollbackAtomicityClaim=false
- recoveryExecuted=false

The result must preserve existing public semantics:

- changedFiles unchanged
- failedFiles unchanged
- plannedFiles unchanged
- writer flags unchanged
- postWriteVerification unchanged
- success/stopped/error unchanged

## Tests required

Add/update focused tests proving:

- mixed partial failure produces journalProjection
- multi-file partial failure produces journalProjection
- journalProjection changedFiles matches existing changedFiles
- journalProjection failedFiles matches existing failedFiles
- unrecoveredFiles are present for applied-but-failed verification
- recoveryCandidateFiles do not imply recoveryExecuted
- rollbackAtomicityClaim=false
- existing result fields are unchanged

## Success criteria

Route is complete if:

- at least two real result producers attach journal metadata
- no writer behavior changes
- no rollback/recovery/snapshot capability added
- no new write capability added
- focused tests pass
- result-contract passes
- build passes
- no package/default gate changes
- no provider/session/CLI/MCP changes
- residue cleaned
- no commit/push

## Stop conditions

Stop if:

- journal metadata requires writer behavior changes
- result contract cannot preserve existing fields
- runtime routes need SessionManager/cli.tsx changes
- rollback/recovery becomes necessary
- broad gates fail from unrelated issues

## Final report

Report:

1. Route
2. Runtime consumers wired
3. Files changed
4. Forbidden files touched? yes/no
5. Runtime writer behavior changed? yes/no
6. Rollback/recovery still absent? yes/no
7. Existing result fields preserved
8. Journal projection facts added
9. Focused validation
10. Final validation
11. Residue cleanup
12. Residual risks
13. Next recommended route
14. Proposed commit message

Do not commit or push.
