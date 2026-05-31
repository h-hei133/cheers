# Structure Tree Pressure Report

Status: current structure pressure report for SR006.

## Scope

This report measures visible tree pressure under `packages/ts-shell/src` for structure-only cleanup in TypeScript owner domains. The work preserves product behavior and keeps old import paths as export-only compatibility surfaces.

## Before Snapshot

Top crowded directories by direct file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 404 |
| `core/context` | 356 |
| `orchestration/patchResult` | 130 |
| `core/harness` | 92 |
| `session` | 66 |
| `core/shell` | 49 |
| `entrypoints` | 46 |
| `context` | 28 |
| `core/commands` | 26 |
| `edit` | 25 |
| `runtime/loop` | 20 |
| `verification` | 20 |
| `core/tools` | 19 |
| `core/query` | 18 |
| `session/continuation` | 18 |
| `orchestration/patchRecovery` | 16 |
| `repair` | 16 |
| `session/store` | 15 |
| `turn` | 15 |
| `session/recovery` | 14 |

Target direct counts before editing:

| Directory | Direct files before |
|---|---:|
| `orchestration` | 404 |
| `core` | 0 |
| `session` | 66 |
| `result` | 4 |
| `evidence` | 8 |
| `verification` | 20 |
| `repair` | 16 |
| `edit` | 25 |

Tests directly in target roots before editing:

| Directory | Direct tests before |
|---|---:|
| `orchestration` | 173 |
| `session` | 28 |
| `result` | 2 |
| `evidence` | 3 |
| `verification` | 9 |
| `repair` | 8 |
| `edit` | 12 |

Other before measurements:

- Export-only compatibility files: 82.
- Files with long basenames in target areas: 483.
- Real imports using the selected old paths moved in this pass: 74.
- Compatibility files needing business logic: 0.

## After Snapshot

Top crowded directories by direct file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 404 |
| `core/context` | 356 |
| `orchestration/patchResult` | 130 |
| `core/harness` | 92 |
| `session` | 63 |
| `core/shell` | 49 |
| `entrypoints` | 46 |
| `context` | 28 |
| `core/commands` | 26 |
| `edit` | 24 |
| `session/continuation` | 22 |
| `runtime/loop` | 20 |
| `core/tools` | 19 |
| `core/query` | 18 |
| `verification` | 18 |
| `orchestration/patchRecovery` | 16 |
| `session/store` | 15 |
| `turn` | 15 |
| `repair` | 14 |
| `session/recovery` | 14 |

Target direct counts after editing:

| Directory | Direct files after |
|---|---:|
| `orchestration` | 404 |
| `core` | 0 |
| `session` | 63 |
| `result` | 2 |
| `evidence` | 7 |
| `verification` | 18 |
| `repair` | 14 |
| `edit` | 24 |

Tests directly in target roots after editing:

| Directory | Direct tests after |
|---|---:|
| `orchestration` | 173 |
| `session` | 25 |
| `result` | 0 |
| `evidence` | 2 |
| `verification` | 7 |
| `repair` | 6 |
| `edit` | 11 |

Other after measurements:

- Export-only compatibility files: 93.
- Files with long basenames in target areas: 481.
- Real imports using the selected old paths moved in this pass: 0.
- Compatibility files needing business logic: 0.

## Directories Improved

- `session`: 66 to 63 direct files; three tests moved beside continuation and replay owners.
- `result`: 4 to 2 direct files; terminal truth and runtime projection tests moved beside owner code.
- `evidence`: 8 to 7 direct files; save point model and test moved under the save point owner.
- `verification`: 20 to 18 direct files; command stage and command plan tests moved under the command owner.
- `repair`: 16 to 14 direct files; iteration projection and single-file proposal tests moved under their owners.
- `edit`: 25 to 24 direct files; edit result projection test moved under the result owner.

## Files Moved

- `session/continuationReadiness.ts` -> `session/continuation/readiness.ts`
- `session/continuationTargetRebase.ts` -> `session/continuation/target.ts`
- `session/replaySafeLoopState.ts` -> `session/replay/state.ts`
- `result/sessionResultTruthAdapter.ts` -> `result/terminal/truth.ts`
- `result/workflowRuntimeProjection.ts` -> `result/projection/runtime.ts`
- `evidence/runtimeSavePoint.ts` -> `evidence/savepoint/model.ts`
- `verification/commandStage.ts` -> `verification/command/stage.ts`
- `verification/verificationCommandPlan.ts` -> `verification/command/plan.ts`
- `repair/repairFacade.ts` -> `repair/iteration/projection.ts`
- `repair/singleFileRepairPlanning.ts` -> `repair/proposal/singleFile.ts`
- `edit/editFacade.ts` -> `edit/result/projection.ts`

## Tests Moved

- `session/continuationReadiness.test.ts` -> `session/continuation/readiness.test.ts`
- `session/continuationTargetRebase.test.ts` -> `session/continuation/target.test.ts`
- `session/replaySafeLoopState.test.ts` -> `session/replay/state.test.ts`
- `result/sessionResultTruthAdapter.test.ts` -> `result/terminal/truth.test.ts`
- `result/workflowRuntimeProjection.test.ts` -> `result/projection/runtime.test.ts`
- `evidence/runtimeSavePoint.test.ts` -> `evidence/savepoint/model.test.ts`
- `verification/commandStage.test.ts` -> `verification/command/stage.test.ts`
- `verification/verificationCommandPlan.test.ts` -> `verification/command/plan.test.ts`
- `repair/repairFacade.test.ts` -> `repair/iteration/projection.test.ts`
- `repair/singleFileRepairPlanning.test.ts` -> `repair/proposal/singleFile.test.ts`
- `edit/editFacade.test.ts` -> `edit/result/projection.test.ts`

## Compatibility Status

Kept as export-only compatibility files:

- `session/continuationReadiness.ts`
- `session/continuationTargetRebase.ts`
- `session/replaySafeLoopState.ts`
- `result/sessionResultTruthAdapter.ts`
- `result/workflowRuntimeProjection.ts`
- `evidence/runtimeSavePoint.ts`
- `verification/commandStage.ts`
- `verification/verificationCommandPlan.ts`
- `repair/repairFacade.ts`
- `repair/singleFileRepairPlanning.ts`
- `edit/editFacade.ts`

No compatibility file added in this pass contains business logic. None were removed because downstream compatibility is not proven disposable.

## Imports Updated

Internal imports for the moved owners now use the nested owner paths where safe. This includes runtime loop projections, runtime event projections, workflow execution imports, planning handoff imports, repair imports, product compatibility exports, and touched tests.

The selected old paths have no remaining real TypeScript imports.

## Remaining Visible Debt

- `orchestration` remains the largest broad directory at 404 direct files.
- `core/context` remains dense at 356 direct files.
- `orchestration/patchResult` remains dense at 130 direct files and should be handled only with edit/apply ownership care.
- Export-only compatibility files increased because this pass preserved old import paths while moving implementations.
- Some root-level tests remain in `session`, `verification`, `repair`, and `edit`; they need separate owner review before moving.

## Validation Evidence

- Focused moved-owner tests passed: 11 files, 38 tests.
- `npm run build -w packages/ts-shell` passed.
- `npm run verify:result-contract` passed.

## Recommended Next Step

Run a narrow ownership audit for the remaining `session` root tests, then consider a separate compatibility-retirement audit for export-only files with zero internal imports.
