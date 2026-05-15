# Explicit Restore Surface

Route baseline: Route 61
Date: 2026-05-15
Status: core explicit restore surface implemented; Route 66 adds user-operable CLI/session restore UX.

This document records the Route 61 explicit restore surface on top of the
Route 59-60 recovery authority loop. It is not automatic recovery, not
transaction rollback, not broad write readiness, and not parity with
ClaudeCode, opencode, or gemini-cli.

## Post-Route 60 Baseline

Before this route, the project already had:

- explicit non-default recovery authority storage
- guarded per-file restore primitive
- non-default pre-write capture for current narrow write surfaces
- partial-failure restore drills
- no default persistence
- no automatic recovery
- no atomic rollback
- no broad `apply_patch`, 9+ mixed, 9+ write, broad multi-delete, or
  broad multi-move
  support

Route 65 note: bounded small-N write support now covers 2-8 update-only,
mixed, delete-only, and move-only batches. The restore surface remains explicit
and non-default; no automatic recovery, rollback, or default persistence was
added.

Route 66 note: explicit restore UX is now available through
`restoreCommandContract.ts`, `restoreCommandRunner.ts`, the `/restore` local
command surface, and session/user recovery summary lines. Preview remains the
safe default. Execute requires explicit intent. Restore output is separate from
normal route results, and route result `recoveryExecuted` remains false.

Route 61 makes captured authority inspectable and intentionally executable
through a separate bridge. Default write routes still do not run recovery.

## Reference Scan Summary

Bounded scan count:

- opencode: 6 files inspected.
- gemini-cli: 4 files inspected.
- ClaudeCode: 4 files inspected.
- Total external files inspected: 14.

Files inspected:

- `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`
- `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`
- `/home/wang/projects/opencode/packages/opencode/src/tool/edit.ts`
- `/home/wang/projects/opencode/packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts`
- `/home/wang/projects/opencode/packages/opencode/src/cli/cmd/tui/util/revert-diff.ts`
- `/home/wang/projects/opencode/packages/opencode/src/server/routes/control/workspace.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/utils/checkpointUtils.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/commands/restore.ts`
- `/home/wang/projects/gemini-cli/packages/cli/src/ui/utils/rewindFileOps.ts`
- `/home/wang/projects/gemini-cli/packages/cli/src/ui/hooks/useGeminiStream.ts`
- `/home/wang/projects/source-claudecode/utils/fileHistory.ts`
- `/home/wang/projects/source-claudecode/commands/rewind/rewind.ts`
- `/home/wang/projects/source-claudecode/entrypoints/sdk/coreSchemas.ts`
- `/home/wang/projects/source-claudecode/main.tsx`

Directional patterns:

- opencode stores recovery authority in a snapshot layer and exposes session
  revert/unrevert through session services and HTTP handlers. Edit tool result
  metadata is separate from snapshot restore authority.
- gemini-cli creates checkpoint files before restorable file tools and restore
  uses checkpoint data plus git snapshot authority. It also has rewind logic
  that inspects current file content and avoids blind overwrite when conflicts
  are detected.
- ClaudeCode file history tracks pre-edit backups and session resume carries
  file-history snapshots. The user-visible rewind entrypoint is separate from
  normal tool result metadata.

Local implication: the smallest equivalent here is not a CLI command yet. It
is a recovery layer that can list explicit non-default authority, preview
current-content eligibility, and execute a guarded restore only when explicitly
called.

## Local Restore Surface Architecture

Implemented modules:

- `packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityIndex.ts`
  - lists authority namespaces and records under an explicit ledger root.
  - returns metadata only.
  - does not read workspace files.
  - rejects invalid authority and record identifiers.

- `packages/ts-shell/src/orchestration/patchRecovery/restorePreview.ts`
  - combines authority records with current workspace inspection.
  - reports restorable files, blocked files, missing records, content
    mismatches, and path boundary failures.
  - does not write workspace files.

- `packages/ts-shell/src/orchestration/patchRecovery/restoreExecutionBridge.ts`
  - runs preview first.
  - supports preview-only mode and explicit execute mode.
  - calls the existing guarded restore primitive only for eligible records.
  - restores selected records in deterministic reverse capture order.
  - returns restored files separately from route results.

- `packages/ts-shell/src/orchestration/patchRecovery/recoverySurfaceProjection.ts`
  - projects captured recovery authority into a user/session-friendly summary.
  - never claims automatic recovery or atomic rollback.
  - remains a core projection helper and is not wired into CLI/session lifecycle.

## Authority Index / Listing Model

The index requires an explicit `ledgerRoot`. Record listing additionally
requires an explicit `authorityId`. It exposes:

- `recordId`
- `authorityId`
- `workspaceRelativePath`
- `operationKind`
- `beforeState`
- `expectedCurrentState`
- `beforeContentHash`
- `beforeContentSizeBytes`
- `hasContentBlob`
- `createdAt`
- `schemaVersion`

It intentionally does not expose raw original content or absolute workspace
paths.

## Restore Preview / Eligibility Model

Preview requires:

- explicit `ledgerRoot`
- explicit `authorityId`
- explicit `workspaceRoot`
- selected `recordIds`

Preview may read current workspace content to enforce the current-content
guard. It blocks when:

- the record is missing
- the path is invalid or outside the workspace
- original content is required but the blob is missing
- expected current state does not match
- expected current content hash does not match

This is the no-hidden-user-edit rule: preview and execution must not overwrite
unrelated user edits made after the failed write.

## Restore Execution Bridge Model

The bridge supports:

- `mode: "preview"`
- `mode: "execute"`
- explicit record selection or `"all"` within one authority namespace

Preview mode never writes. Execute mode runs preview first, then calls
`restoreRecoveryAuthorityRecord` only for eligible records. The result reports:

- restored files
- blocked files
- inspected files
- skipped files
- missing records
- `rollbackAtomicityClaim: false`
- `automaticRecovery: false`

The bridge is a per-file or non-atomic set restore. It is not transaction
rollback.

## User / Session Surface Decision

Route 66 wires the core recovery surface into a narrow user-operable path:

- `/restore preview ...` inspects the explicit ledger and current workspace
  state without writing.
- `/restore execute ... --execute` runs the guarded bridge only after explicit
  execute intent.
- failed coding-result summaries can mention guarded restore preview
  availability when captured authority exists.

This remains a separate restore command path. Default write routes still do not
run recovery automatically.

## Cleanup / Residue Policy

Tests use temporary OS directories and clean them in `afterEach`. The
non-default ledger remains caller-owned. There is still no SessionManager
cleanup hook, no default persistence root, and no provider/CLI/MCP residue.

## Non-Goals

- automatic recovery
- recovery executor in default write routes
- atomic rollback
- snapshot/revert backend
- git integration
- broad `apply_patch`
- 9+ writes
- broad multi-delete or multi-move beyond the bounded small-N cap
- provider/MCP behavior changes
- package script or default gate changes

## Next Route Decision Criteria

Route 63 update: selected-workspace exactly-two/exactly-three delete-only and
move-only batches are now implemented with optional non-default
recovery-authority capture and destructive partial-failure restore evidence.
Route 65 update: selected-workspace bounded 2-8 update, mixed, delete-only,
and move-only batches are now implemented with optional non-default
recovery-authority capture and representative partial-failure restore drills.
9+ writes, broad `apply_patch`, automatic recovery, and atomic rollback remain
unsupported.

Recommended next route: CLI restore command polish if operator ergonomics are
still weak, or a broad `apply_patch` readiness split only if bounded cap-8
behavior and explicit restore UX remain stable.
