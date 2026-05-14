# Route 52: TS route-scoped journal prototype, no product capability

## Objective

Prototype a TypeScript control-plane route-scoped edit journal.

This route must not add rollback capability to runtime.
This route must not wire journal recovery into existing writers.
This route must not enable broad apply_patch or 3+ mixed writes.

The goal is to create a focused, testable journal model that can describe:

- operations planned
- operations started
- operations applied
- operations verified
- operations failed
- possible recovery candidates
- unrecovered state
- no-rollback/no-atomicity claim boundary

This is a prototype foundation only.

## Scope

Allowed:

- Add a focused journal prototype module under orchestration, preferably:
  - packages/ts-shell/src/orchestration/patchResult/routeScopedEditJournal.ts
  - or packages/ts-shell/src/orchestration/patchApplication/routeScopedEditJournal.ts
- Add focused tests.
- Add small type exports if needed.

Forbidden:

- Runtime writer integration
- Actual rollback
- Actual snapshot
- Actual recovery
- Broad apply_patch writes
- 3+ mixed writes
- Default gate changes
- Package scripts
- Provider/session/CLI/MCP behavior
- SessionManager.ts
- cli.tsx
- docs/* except this route spec

If runtime wiring becomes necessary, stop and report.

## Validation policy

Use light validation.

Preflight:

- rtk git status --short --branch
- rtk git diff --check

During edits:

- run focused tests for the new journal module
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

Final:

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/routeScopedEditJournal.test.ts
  - or the actual focused test path if different
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git status --short --branch

Do not run broad capability gates unless touched files or failures justify it.

## Read first

- docs/design/rollback-snapshot-journal-design.md
- docs/design/broad-apply-patch-3plus-readiness-design.md
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteResult.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts

Use the design docs only to confirm the prototype shape.
Do not restate full history.

## Prototype requirements

The journal prototype should model route-scoped write progress.

It should support operation records with fields like:

- operationId
- operationKind
- targetPath
- sourcePath, if applicable
- planned
- preflightPassed
- writerStarted
- applied
- verified
- failed
- failureClass
- recoveryCandidate
- recovered
- unrecovered

Exact names may differ, but tests must make the state model clear.

The journal must be able to derive:

- changedFiles
- failedFiles
- verifiedFiles
- unrecoveredFiles
- recoveryCandidateFiles
- writerStarted
- hasPartialApply
- hasUnrecoveredApply
- rollbackAtomicityClaim=false

## Required tests

Add focused tests for:

1. empty journal has no changed/failed/recovery state
2. planned operations do not count as changed files
3. applied + verified operation counts as changed/verified
4. applied + failed verification counts as changed + failed + unrecovered
5. writer failure before apply counts as failed but not changed
6. mixed operation sequence can represent verified prefix and failed suffix
7. recovery candidate is metadata only and does not imply rollback happened
8. no rollback/atomicity claim is ever produced
9. delete/move/update/create operation kinds can all be represented
10. 3+ operations can be represented in journal metadata without enabling writes

## Required non-behavior guarantee

The new module must not be imported by runtime write routes unless the import is type-only or test-only.

If implementation needs runtime integration, stop and report.

## Success criteria

Route is complete if:

- route-scoped journal prototype exists
- focused tests pass
- build passes
- result-contract passes
- no runtime behavior changes
- no writer integration
- no rollback/snapshot/recovery capability added
- no broad/3+ capability added
- no package/default gate changes
- no provider/session/CLI/MCP changes
- residue cleaned
- no commit/push

## Stop conditions

Stop and report if:

- journal prototype requires changing current result contract
- journal prototype requires runtime writer integration
- journal prototype requires persistence/session schema changes
- journal prototype requires package script/default gate changes
- journal prototype cannot be tested without changing existing runtime behavior

## Final report

Report:

1. Route
2. Journal prototype added? yes/no
3. Runtime behavior changed? yes/no
4. Files changed
5. Forbidden files touched? yes/no
6. Journal state model summary
7. No rollback/atomicity evidence
8. Focused validation
9. Final validation
10. Residue cleanup
11. Residual risks
12. Recommended next route
13. Proposed commit message

Do not commit or push.
