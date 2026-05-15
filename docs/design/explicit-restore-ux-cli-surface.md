# Explicit Restore UX and CLI Surface

Route baseline: Route 66
Date: 2026-05-15
Status: implemented explicit restore command contract, command runner, local slash command surface, and session/user recovery summary.

This document records the Route 66 user-operable restore surface built on the
Route 59-65 recovery authority loop. It is not automatic recovery, not atomic
rollback, not broad `apply_patch` readiness, and not provider/model execution.

## Post-Route 65 Baseline

The write surface remains selected-workspace and bounded:

- single-file update/create/delete/move
- bounded 2-8 update-only writes
- bounded 2-8 mixed writes
- bounded 2-8 delete-only writes
- bounded 2-8 move-only writes
- 9+ writes blocked
- broad arbitrary `apply_patch` blocked

Recovery authority remains explicit and non-default. Supported routes may
capture original-content authority only when a caller provides a non-default
ledger. Default write behavior does not create a recovery store, does not run
recovery, and does not claim rollback.

## Bounded Reference Scan

Files inspected:

- opencode, 4 files:
  - `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`
  - `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`
  - `/home/wang/projects/opencode/packages/opencode/src/session/processor.ts`
  - `/home/wang/projects/opencode/packages/opencode/src/server/routes/instance/session.ts`
- gemini-cli, 4 files:
  - `/home/wang/projects/gemini-cli/packages/cli/src/ui/commands/restoreCommand.ts`
  - `/home/wang/projects/gemini-cli/packages/a2a-server/src/commands/restore.ts`
  - `/home/wang/projects/gemini-cli/packages/cli/src/ui/utils/rewindFileOps.ts`
  - `/home/wang/projects/gemini-cli/packages/core/src/tools/edit.ts`
- ClaudeCode, 3 files:
  - `/home/wang/projects/source-claudecode/utils/fileHistory.ts`
  - `/home/wang/projects/source-claudecode/commands/rewind/index.ts`
  - `/home/wang/projects/source-claudecode/main.tsx`

Directional findings:

- opencode surfaces restore through session revert/unrevert and HTTP session
  routes, but the authority comes from a snapshot subsystem. Session processor
  captures snapshots before tool execution and records patch parts separately
  from restore execution.
- gemini-cli exposes explicit restore commands over checkpoint files. The
  command can list candidates, select one, and then restore conversation/file
  state. Its rewind file operation also reads current content and avoids blind
  overwrite on conflicts.
- ClaudeCode has an explicit rewind command and a hidden `--rewind-files`
  option. Its file history captures pre-edit backups before edits and carries
  snapshots through session resume.

Local implication: the smallest equivalent here is an explicit command path
over the existing non-default recovery ledger. Preview and execution should be
separate command modes; execution must require explicit intent; restored files
must be reported outside normal edit route results.

## Local UX Goals

- Make recovery availability visible after failed mutation results when
  captured authority exists.
- Provide a safe preview command as the default restore action.
- Provide a guarded execute command that requires explicit execute intent.
- Keep restore output separate from normal route result output.
- Keep route result `recoveryExecuted` false.
- Avoid raw original content in summaries.
- Avoid printing `ledgerRoot` in automatic session summaries.

## Command Contract

Implemented module:

- `packages/ts-shell/src/orchestration/patchRecovery/restoreCommandContract.ts`

The contract validates:

- `mode: "preview" | "execute"`
- explicit `ledgerRoot`
- explicit `workspaceRoot`
- explicit `authorityId` or `routeId`
- explicit record selection, either `--all` or sanitized record IDs
- execute mode requires explicit execute intent

The command result reports:

- `mode`
- `executed`
- `restorableFiles`
- `restoredFiles`
- `blockedFiles`
- `inspectedFiles`
- `missingRecords`
- evidence
- `automaticRecovery: false`
- `rollbackAtomicityClaim: false`

Preview is the default restore action. `"all"` is explicit, not implicit.

## Command Runner

Implemented module:

- `packages/ts-shell/src/orchestration/patchRecovery/restoreCommandRunner.ts`

Preview mode calls the existing restore execution bridge in preview mode and
does not write. Execute mode calls the bridge in execute mode only after the
contract accepts explicit execute intent. The runner does not invoke provider
or model execution, does not persist session state, and does not create a
default storage root.

The current-content guard remains owned by `restorePreview.ts` and
`restorePrimitive.ts`; the runner does not bypass it.

## CLI / Session Integration

Implemented modules:

- `packages/ts-shell/src/core/commands/restoreCommandRuntime.ts`
- `packages/ts-shell/src/core/shell/restoreSurfaceSummary.ts`
- local command registration in `packages/ts-shell/src/core/commands/registry.ts`
- help/discovery entry in `packages/ts-shell/src/entrypoints/slashCommandRegistry.ts`
- reserved slash command handling in `packages/ts-shell/src/entrypoints/cliArgs.ts`

CLI command shape:

- preview:
  - `/restore preview --ledger-root <path> --authority-id <id> --all`
  - `/restore --ledger-root <path> --authority-id <id> --records r1,r2`
- execute:
  - `/restore execute --ledger-root <path> --authority-id <id> --all --execute`
  - `/restore execute --ledger-root <path> --authority-id <id> --records r1,r2 --execute`

`workspaceRoot` defaults to the current command context workspace. A caller may
override it with `--workspace-root <path>` when restoring a separate workspace
explicitly.

Session/user failure summaries now mention explicit guarded restore preview
availability when a failed coding result contains captured recovery authority.
They report candidates and authority id where available, but not raw original
content and not ledger contents.

## Safety Guardrails

- Preview never writes.
- Execute requires explicit `--execute` or `--confirm execute`.
- Current-content mismatch blocks execution.
- Missing records and missing original-content blobs are reported separately.
- Restore execution result is separate from normal route result.
- Route result `recoveryExecuted` remains false.
- Automatic recovery remains absent.
- Atomic rollback remains absent.
- Provider/model execution is not involved.
- Default persistent recovery storage is not created.
- 9+ writes and broad arbitrary `apply_patch` remain blocked by existing write
  routing.

## Cleanup / Residue Policy

Tests use temporary OS directories and clean them in `afterEach`. The
non-default recovery ledger is caller-owned. Route 66 adds no SessionManager
schema field, no package script, no default gate, and no provider/MCP state.

## Test Coverage

Focused tests cover:

- command contract required args and record id sanitization
- execute mode explicit intent
- preview no-write behavior
- execute restore of eligible records
- current-content mismatch blocking
- missing records and missing content blobs
- local command parsing and output formatting
- user/session restore summary visibility and no-authority quiet paths

## Non-Goals

- automatic recovery
- atomic transaction rollback
- broad arbitrary `apply_patch`
- 9+ writes
- default durable recovery store
- provider/model execution
- MCP behavior
- SessionManager persistence schema changes
- package scripts or default gate changes

## Next Route Decision Criteria

Route 67 should not widen writes just because an explicit restore command now
exists. Prefer broad `apply_patch` readiness split only if the cap-8 surface is
stable and result/session surfaces explain partial failures clearly. If UX
gaps remain, a narrower Route 67 should polish CLI restore command ergonomics
before broad write readiness.
