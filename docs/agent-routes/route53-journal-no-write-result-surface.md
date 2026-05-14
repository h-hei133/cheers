# Route 53: journal projection into no-write result surface

## Objective

Use the Route 52 route-scoped edit journal prototype in no-write / failure result projection only.

Do not wire the journal into runtime writers as execution authority.
Do not implement rollback.
Do not implement recovery.
Do not implement snapshot.
Do not expand write capability.

The goal is to make failure/no-write result surfaces able to carry journal-derived metadata such as:

- planned operations
- writerStarted
- applied/verified/failed operations
- changedFiles
- failedFiles
- unrecoveredFiles
- recoveryCandidateFiles
- rollbackAtomicityClaim=false

This route should only consume the journal in projection/result code where safe.

## Scope

Allowed:

- packages/ts-shell/src/orchestration/patchResult/routeScopedEditJournal.ts
- packages/ts-shell/src/orchestration/patchResult/routeScopedEditJournal.test.ts
- packages/ts-shell/src/orchestration/patchResult/*
- focused patchResult tests
- mutation/result projection tests only if needed

Forbidden:

- actual writer integration as authority
- rollback/snapshot/recovery implementation
- broad apply_patch writes
- 3+ mixed writes
- package scripts
- default gates
- SessionManager.ts
- cli.tsx
- provider/session/CLI/MCP behavior
- docs/* except this route spec

## Validation policy

Light validation only.

Preflight:

- rtk git status --short --branch
- rtk git diff --check
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/routeScopedEditJournal.test.ts

During edits:

- run focused tests for touched modules
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

Final:

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/routeScopedEditJournal.test.ts
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git status --short --branch

Run unsupported-patch E2E only if no-write result surfaces are touched broadly.
Run mixed/move/delete/three-file evidence only if shared write routing is touched.

## Read first

- docs/design/rollback-snapshot-journal-design.md
- packages/ts-shell/src/orchestration/patchResult/routeScopedEditJournal.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceCreateResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteResult.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts

## Implementation target

Add a projection helper if useful, for example:

- journalResultProjection.ts
- journalFailureSurface.ts
- routeScopedEditJournalProjection.ts

It should convert journal metadata into result-safe facts.

It must not:

- decide whether a write may run
- perform rollback
- perform recovery
- alter existing writer order
- alter capability boundaries

## Required projection facts

The result-side projection should be able to expose:

- changedFiles
- failedFiles
- verifiedFiles
- unrecoveredFiles
- recoveryCandidateFiles
- writerStarted
- hasPartialApply
- hasUnrecoveredApply
- rollbackAtomicityClaim=false
- recoveryExecuted=false

Exact naming may match existing result conventions.

## Tests required

Add focused tests for:

1. planned-only journal projects no changedFiles
2. verified operation projects changedFiles
3. writer failure before apply projects failedFiles but no changedFiles
4. post-write verification failure projects changedFiles + failedFiles + unrecoveredFiles
5. mixed prefix success / suffix failure projects changed and failed distinctly
6. recovery candidate does not imply recovery executed
7. rollbackAtomicityClaim remains false
8. projection can be attached to a no-write/stopped result without changing success semantics

## Success criteria

Route is complete if:

- journal can be consumed by result projection safely
- no runtime writer authority changes
- no rollback/snapshot/recovery capability added
- no new write capability added
- result-contract passes
- build passes
- focused tests pass
- no default gates changed
- no provider/session/CLI/MCP behavior changed
- residue cleaned
- no commit/push

## Stop conditions

Stop and report if:

- result projection requires changing current runtime writer behavior
- result projection requires SessionManager or cli.tsx changes
- result contract cannot be preserved
- journal must become execution authority
- rollback/recovery implementation becomes necessary

## Final report

Report:

1. Route
2. Journal consumed by result projection? yes/no
3. Runtime writer behavior changed? yes/no
4. Files changed
5. Forbidden files touched? yes/no
6. Projection facts added
7. Rollback/recovery still absent? yes/no
8. Focused validation
9. Final validation
10. Residue cleanup
11. Residual risks
12. Next recommended route
13. Proposed commit message

Do not commit or push.
