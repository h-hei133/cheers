# Single-file apply_patch real workspace write entrypoint

Status: implementation branch complete; local validation and real-provider
workspace-write smoke passed.

## Scope

This phase adds an explicit CLI / `runMvpIntegratedFlow` entrypoint that may
write one `Update File` `apply_patch` payload to the selected workspace.

It does not enable default production `apply_patch`, unified diff, multi-file,
add, delete, move, AST, fuzzy patching, rollback, release/default gates, or
implicit prompt-based write authorization.

## Implemented Boundaries

- CLI flag `--apply-patch-workspace-write` is the explicit write entrypoint.
- Existing `--apply-patch-runtime-route` remains no-write when the workspace
  write flag is absent.
- `--non-interactive-approval allow-once|allow-always` is required as explicit
  approved-for-write input for this entrypoint.
- The route reuses dry-run preview, permission UX evidence, write decision,
  guarded gate, final stale-read, and single-file writer contracts.
- Final stale-read runs immediately before the writer.
- Writer output is considered success only after post-write content verification.
- Denied, blocked, stale, unsupported, and no-op states remain stopped and
  report no changed files.

## Required Evidence

- default CLI / runtime behavior unchanged without the new flag
- no-write runtime route unchanged with only `--apply-patch-runtime-route`
- explicit workspace write opt-in and explicit approved-for-write input required
- single-file `Update File` remains the only supported operation
- final stale-read stays adjacent to writer
- no-op, denied, blocked, stale, and unsupported paths do not claim success
- selected workspace write is verified before terminal success
- real-provider smoke uses an isolated test workspace and redaction checks

## Validation

- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/workspaceWriteRoute.test.ts src/orchestration/runMvpIntegratedFlow.test.ts -t "apply_patch"`
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "explicit apply_patch CLI"`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts src/orchestration/patchResult/productionRoute.test.ts src/orchestration/patchResult/productionRouteProjection.test.ts src/orchestration/patchResult/guardedRouteSmoke.test.ts src/orchestration/patchResult/runtimeRouteResult.test.ts src/orchestration/patchResult/noWriteRuntimeRoute.test.ts src/orchestration/patchResult/workspaceWriteRoute.test.ts src/orchestration/runMvpIntegratedFlow.test.ts -t "apply_patch"`
- `rtk npm run build -w packages/ts-shell`
- real-provider gate: `--real-apply-patch-workspace-write-smoke`

Latest real-provider gate result:

- readiness preflight: passed
- provider output contained exactly one `apply_patch` block
- CLI workspace write entrypoint wrote only isolated test workspace `src/app.ts`
- `changedFiles=src/app.ts` and `writeIntents=src/app.ts`
- writer target was isolated test workspace
- terminal success was allowed only after verified write
- repository clean: true
- redaction: pass

## Current Boundary

This is an explicit write entrypoint for a raw single-file `apply_patch` payload
against the selected workspace. It is not default apply_patch enablement and it
does not change release/default gates.
