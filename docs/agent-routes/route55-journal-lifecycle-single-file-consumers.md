# Route 55: route-scoped journal lifecycle and single-file failure consumers

## Objective

Consolidate the Route 52-54 journal work into a route-scoped, non-durable journal lifecycle metadata layer, then attach it to high-value single-file failure surfaces.

This route must not implement rollback, recovery, snapshot, persistence, or writer authority.

The goal is to make journal metadata production less ad hoc before adding more broad edit capability.

## Current state

Route 52 added routeScopedEditJournal as a prototype model.

Route 53 added journalResultProjection.

Route 54 wired journal metadata into:

- mixedFileWriteResult stopped/partial failure path
- multiFileWriteResult stopped/partial failure path

Remaining gap:

- journal metadata is useful, but lifecycle ownership is still scattered.
- single-file failure surfaces do not consistently carry journal metadata.
- no durable storage or rollback lifecycle should be added yet.

## Validation policy

Use light validation.

Preflight:

- rtk git status --short --branch
- rtk git diff --check
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/routeScopedEditJournal.test.ts src/orchestration/patchResult/journalResultProjection.test.ts

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

Do not run broad session/MCP/CLI gates unless touched files or failures justify it.

## Read first

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

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/patchResult/*
- focused patchResult tests

Forbidden:

- writer behavior changes
- rollback/recovery/snapshot implementation
- durable journal persistence
- SessionManager.ts
- cli.tsx
- package.json
- scripts/*
- provider/session/CLI/MCP behavior
- default gates
- docs/* except this route spec

## Phase 1: route-scoped journal lifecycle helper

Add or harden a helper that centralizes journal metadata construction.

Possible names:

- routeScopedJournalLifecycle.ts
- editJournalLifecycle.ts
- routeJournalBuilder.ts

It should own metadata-only lifecycle construction such as:

- begin planned operations
- mark writer started
- mark applied
- mark verified
- mark failed
- mark recovery candidate
- mark unrecovered
- derive projection facts
- preserve rollbackAtomicityClaim=false
- preserve recoveryExecuted=false
- preserve writeCapability="metadata-only"

It must not:

- decide whether writes may run
- invoke writers
- persist journal state
- rollback or recover
- change route success/stopped/error

If the existing journalFailureConsumer is already the right owner, evolve it rather than adding another small helper.

## Phase 2: single-file failure consumers

Attach journal metadata to at least two of these single-file result surfaces, if clean:

- workspaceWriteResult stale-read / post-write verification failure
- workspaceMoveResult move verification failure
- workspaceDeleteResult delete verification failure
- workspaceCreateResult create verification failure

Prefer the highest-value paths with existing failure tests.

Do not touch runtime writers unless only passing existing result facts into the projection layer is required.

## Phase 3: consistency tests

Focused tests must prove:

- journal lifecycle projection does not change existing result fields
- single-file stale/verification failure attaches journal metadata
- move/delete verification failure attaches journal metadata if those consumers are selected
- changedFiles match existing changedFiles
- failedFiles match existing failedFiles
- unrecoveredFiles are present for applied-but-failed verification
- recoveryCandidateFiles do not imply recoveryExecuted
- rollbackAtomicityClaim=false
- writer flags unchanged
- postWriteVerification unchanged
- success paths are not changed unless already carrying metadata safely

## Required preservation

Must remain unchanged:

- all writer behavior
- single update/create/move/delete success behavior
- exactly-two update behavior
- exactly-three update behavior
- exactly-two mixed write behavior
- unsupported/no-write behavior
- result contract
- default gates

## Success criteria

Route is complete if:

- journal lifecycle construction is less ad hoc
- at least two single-file failure consumers attach journal metadata, or a clear blocker is reported
- mixed/multi-file journal consumers still pass
- no runtime writer behavior changes
- no rollback/recovery/snapshot capability added
- no durable persistence added
- no new write capability added
- result-contract passes
- build passes
- no package/default gate changes
- no provider/session/CLI/MCP behavior changed
- residue cleaned
- no commit/push

## Stop conditions

Stop and report if:

- lifecycle helper requires runtime writer authority
- single-file consumers require changing writer behavior
- journal metadata requires SessionManager persistence
- result contract cannot preserve existing fields
- rollback/recovery becomes necessary
- implementation requires touching cli.tsx or SessionManager.ts

## Final report

Report:

1. Route
2. Journal lifecycle helper added/evolved
3. Single-file consumers wired
4. Files changed
5. Forbidden files touched? yes/no
6. Runtime writer behavior changed? yes/no
7. Rollback/recovery/snapshot still absent? yes/no
8. Existing result fields preserved
9. Journal projection facts added
10. Focused validation
11. Final validation
12. Residue cleanup
13. Residual risks
14. Next recommended route
15. Proposed commit message

Do not commit or push.
