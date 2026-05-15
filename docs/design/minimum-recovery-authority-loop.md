# Minimum Recovery Authority Loop

Route baseline: Route 59
Date: 2026-05-15
Status: implemented explicit non-default minimum recovery-authority loop.

This document records the Route 59 implementation. It is not broad edit
readiness, not automatic recovery, and not rollback or snapshot parity with any
reference repository.

## Reference Scan Summary

Bounded scan count:

- opencode: 3 files inspected.
- gemini-cli: 3 files inspected.
- ClaudeCode: 1 file inspected.
- Total external files inspected: 7.

Files inspected:

- `/home/wang/projects/opencode/packages/opencode/src/tool/edit.ts`
- `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`
- `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/commands/restore.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/utils/checkpointUtils.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/tools/write-file.ts`
- `/home/wang/projects/source-claudecode/utils/fileHistory.ts`

Directional patterns:

- opencode keeps edit diff/result metadata separate from `Snapshot` authority.
  Revert/restore use snapshot state, not tool-result metadata alone.
- gemini-cli restore depends on checkpoint data and git snapshot authority;
  write-file still produces diff/result metadata separately.
- ClaudeCode file history tracks backups before edits and rewinds from stored
  backup authority, not from display diffs.

Local implication: patch/result metadata can explain failure and restore
eligibility, but recoverable authority must be stored separately before writes.

## Selected Local Architecture

Route 59 implements a small original-content authority loop:

- `patchRecovery/recoveryAuthorityStore.ts`
  - explicit `mode: "non-default"` storage only.
  - disabled mode performs no file IO.
  - ledger root has no default value.
  - manifest stores metadata only.
  - original content is stored separately as a hash-named blob.
  - workspace paths are relative and traversal/absolute paths are rejected.
  - cleanup removes individual records/blobs; purge removes a namespace.

- `patchRecovery/restorePrimitive.ts`
  - explicit per-file restore primitive.
  - validates requested path against the stored record path.
  - validates the restore target stays inside the workspace.
  - inspects current content/state before writing or deleting.
  - blocks hidden user edits when the current hash differs.
  - restores one file at a time and never claims atomic rollback.

- Narrow route capture integration:
  - `workspaceWriteRoute.ts`: single-file update.
  - `workspaceDeleteRoute.ts`: single-file delete.
  - `multiFileWriteRoute.ts`: exactly-two update.
  - `workspaceCreateRoute.ts`: additional narrow create lane with
    `beforeState: "absent"`.

Capture is optional and non-default. Existing callers do not pass
`recoveryAuthority`, so default runtime behavior and default result shape remain
unchanged.

## Record Shape

Stored records include:

- `schemaVersion`
- `authorityId`
- `recordId`
- `workspaceRelativePath`
- `operationKind`
- `beforeState`
- optional `beforeContentHash`
- optional `beforeContentSizeBytes`
- optional `beforeContentRef`
- `expectedCurrentState`
- optional `expectedCurrentContentHash`
- `capturedAtPhase: "pre-write"`
- `persistence: "non-default"`
- `createdAt`
- evidence strings

The manifest intentionally does not contain raw file content or absolute
workspace paths.

## Lifecycle

Capture lifecycle:

- route guards, workspace authority, approval, and final stale-read pass first.
- capture runs after those checks and before any writer starts.
- exactly-two update captures both files before the first writer starts.
- capture failure blocks the route before writer invocation.

Restore lifecycle:

- caller explicitly invokes `restoreRecoveryAuthorityRecord`.
- restore reads the record from explicit ledger root and authority namespace.
- requested restore path must match the record path.
- current state and current content hash must match the record expectations.
- `beforeState: "exists"` writes the stored original content back.
- `beforeState: "absent"` removes the created file only when the guard passes.

Cleanup lifecycle:

- `cleanupRecoveryAuthorityRecord` removes record and blob.
- `purgeRecoveryAuthority` removes a route/authority namespace.
- no default cleanup hook, session persistence, CLI command, or provider path was
  added.

## Boundaries

Supported initial coverage:

- single update capture and guarded restore.
- single delete capture and guarded restore.
- exactly-two update pre-write capture for both files.
- single create absent-before capture and guarded removal.

Non-goals:

- automatic recovery.
- recovery executor.
- atomic rollback.
- snapshot/checkpoint/git integration.
- broad `apply_patch`.
- 3+ mixed writes.
- 4+ writes.
- provider/session/CLI/MCP behavior.
- default persistence or package-script changes.

## Evidence

Focused tests cover:

- disabled store mode performs no file IO.
- explicit non-default ledger root is required.
- manifest metadata excludes raw content and absolute workspace paths.
- content blobs are stored separately and named by content hash.
- cleanup and purge remove residue.
- absolute/traversal paths are rejected.
- restore update/delete/create paths respect current-content/state guards.
- hidden user edits block restore.
- restore never claims atomic rollback.
- single update/delete/create and exactly-two update routes capture only under
  explicit non-default options.
- default route paths do not expose `recoveryAuthorityCapture`.
- recoveryPlan can reflect captured non-default authority while
  `recoveryExecuted=false` and `rollbackAtomicityClaim=false`.

## Route 60 Note

Route 60 expanded the non-default capture loop across the remaining narrow
supported write surfaces:

- single move capture coverage
- exactly-three update capture coverage
- exactly-two mixed capture coverage where the route remains clean
- explicit partial-failure restore drills with current-content guards

The restore primitive remains explicit and non-atomic. Recovery still does not
run automatically, and default runtime behavior remains unchanged.

## Route 61 Note

Route 61 added the core explicit restore surface over the existing primitive:

- `patchRecovery/recoveryAuthorityIndex.ts` lists explicit non-default
  authority namespaces and records without raw content.
- `patchRecovery/restorePreview.ts` previews selected records with workspace
  current-content guards and no writes.
- `patchRecovery/restoreExecutionBridge.ts` runs preview first and then invokes
  the guarded restore primitive only in explicit execute mode.
- `patchRecovery/recoverySurfaceProjection.ts` summarizes captured authority as
  explicit restore only, with `automaticRecoveryAvailable=false`,
  `atomicRollbackAvailable=false`, and `recoveryExecuted=false`.

CLI/session command wiring remains deferred. Default runtime behavior,
provider/MCP behavior, package scripts, automatic recovery, atomic rollback,
and broad write support remain unchanged.

## Next Direction

Recommended next batch: a 3+ mixed readiness audit, unless product UX now needs
a dedicated CLI/session explicit restore command. Broad writes should remain
delayed until larger mixed writes have a clear recovery and rollback stance.
