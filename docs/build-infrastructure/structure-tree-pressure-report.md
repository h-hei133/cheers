# Structure Tree Pressure Report

Status: current structure pressure report for SR007.

## Scope

This report measures visible tree pressure under `packages/ts-shell/src` for structure-only cleanup in TypeScript owner domains. The work preserves product behavior, moves safe tests beside owner code, and keeps old import paths as export-only compatibility files when public compatibility may still matter.

## Before Snapshot

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

Target direct counts before editing:

| Directory | Direct files before |
|---|---:|
| `orchestration` | 404 |
| `core` | 0 |
| `session` | 63 |
| `result` | 2 |
| `evidence` | 7 |
| `verification` | 18 |
| `repair` | 14 |
| `edit` | 24 |

Tests directly in target roots before editing:

| Directory | Direct tests before |
|---|---:|
| `orchestration` | 173 |
| `core` | 0 |
| `session` | 25 |
| `result` | 0 |
| `evidence` | 2 |
| `verification` | 7 |
| `repair` | 6 |
| `edit` | 11 |

Other before measurements:

- Tests still outside owner folders in target roots: 224.
- Export-only compatibility files: 93.
- Compatibility files with zero internal imports: 64.
- Compatibility files still imported internally: 29.
- Files with long basenames in target areas: 481.

## After Snapshot

Top crowded directories by direct file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 404 |
| `core/context` | 356 |
| `orchestration/patchResult` | 130 |
| `core/harness` | 92 |
| `session` | 61 |
| `core/shell` | 49 |
| `entrypoints` | 46 |
| `context` | 28 |
| `core/commands` | 26 |
| `edit` | 24 |
| `session/continuation` | 22 |
| `runtime/loop` | 20 |
| `core/tools` | 19 |
| `core/query` | 18 |
| `session/store` | 17 |
| `verification` | 17 |
| `orchestration/patchRecovery` | 16 |
| `turn` | 15 |
| `session/recovery` | 14 |
| `repair` | 13 |

Target direct counts after editing:

| Directory | Direct files after |
|---|---:|
| `orchestration` | 404 |
| `core` | 0 |
| `session` | 61 |
| `result` | 2 |
| `evidence` | 6 |
| `verification` | 17 |
| `repair` | 13 |
| `edit` | 24 |

Tests directly in target roots after editing:

| Directory | Direct tests after |
|---|---:|
| `orchestration` | 173 |
| `core` | 0 |
| `session` | 23 |
| `result` | 0 |
| `evidence` | 1 |
| `verification` | 6 |
| `repair` | 5 |
| `edit` | 11 |

Other after measurements:

- Tests still outside owner folders in target roots: 219.
- Export-only compatibility files: 98.
- Compatibility files with zero internal imports: 73.
- Compatibility files still imported internally: 25.
- Files with long basenames in target areas: 480.

## Directories Improved

- `session`: 63 to 61 direct files; current selection and replay builder tests moved beside owner code.
- `evidence`: 7 to 6 direct files; continuation transform evidence test moved beside the projection owner.
- `verification`: 18 to 17 direct files; command intent planning test moved beside the intent owner.
- `repair`: 14 to 13 direct files; reopen planning test moved beside the handoff owner.

## Tests Moved

- `session/currentSessionSelection.test.ts` -> `session/store/currentSelection.test.ts`
- `session/sessionReplayBuilder.test.ts` -> `session/replay/builder.test.ts`
- `evidence/continuationTransformEvidence.test.ts` -> `evidence/projection/continuation.test.ts`
- `verification/commandIntentPlanning.test.ts` -> `verification/intent/command.test.ts`
- `repair/degradedReopenPlanning.test.ts` -> `repair/handoff/reopen.test.ts`

## Owner Files Moved

- `session/currentSessionSelection.ts` -> `session/store/currentSelection.ts`
- `session/sessionReplayBuilder.ts` -> `session/replay/builder.ts`
- `evidence/continuationTransformEvidence.ts` -> `evidence/projection/continuation.ts`
- `verification/commandIntentPlanning.ts` -> `verification/intent/command.ts`
- `repair/degradedReopenPlanning.ts` -> `repair/handoff/reopen.ts`

## Compatibility Status

| Path | Status | Internal imports | Reason | Deletion condition |
|---|---:|---:|---|---|
| `session/currentSessionSelection.ts` | Kept | 0 | Existing public path may still be consumed downstream. | Remove only after downstream compatibility is proven disposable. |
| `session/sessionReplayBuilder.ts` | Kept | 0 | Existing public path may still be consumed downstream. | Remove only after downstream compatibility is proven disposable. |
| `evidence/continuationTransformEvidence.ts` | Kept | 0 | Existing public path may still be consumed downstream. | Remove only after downstream compatibility is proven disposable. |
| `verification/commandIntentPlanning.ts` | Kept | 0 | Existing public path may still be consumed downstream. | Remove only after downstream compatibility is proven disposable. |
| `repair/degradedReopenPlanning.ts` | Kept | 0 | Existing public path may still be consumed downstream. | Remove only after downstream compatibility is proven disposable. |
| `session/continuationReadiness.ts` | Deferred | 0 | Prior compatibility file with public path risk not resolved in this pass. | Remove only after downstream compatibility is proven disposable. |
| `session/continuationTargetRebase.ts` | Deferred | 0 | Prior compatibility file with public path risk not resolved in this pass. | Remove only after downstream compatibility is proven disposable. |
| `session/replaySafeLoopState.ts` | Deferred | 0 | Prior compatibility file with public path risk not resolved in this pass. | Remove only after downstream compatibility is proven disposable. |
| `result/sessionResultTruthAdapter.ts` | Deferred | 0 | Prior compatibility file with public path risk not resolved in this pass. | Remove only after downstream compatibility is proven disposable. |
| `result/workflowRuntimeProjection.ts` | Deferred | 0 | Prior compatibility file with public path risk not resolved in this pass. | Remove only after downstream compatibility is proven disposable. |
| `evidence/runtimeSavePoint.ts` | Deferred | 0 | Prior compatibility file with public path risk not resolved in this pass. | Remove only after downstream compatibility is proven disposable. |
| `verification/commandStage.ts` | Deferred | 0 | Prior compatibility file with public path risk not resolved in this pass. | Remove only after downstream compatibility is proven disposable. |
| `verification/verificationCommandPlan.ts` | Deferred | 0 | Prior compatibility file with public path risk not resolved in this pass. | Remove only after downstream compatibility is proven disposable. |
| `repair/repairFacade.ts` | Deferred | 0 | Prior compatibility file with public path risk not resolved in this pass. | Remove only after downstream compatibility is proven disposable. |
| `repair/singleFileRepairPlanning.ts` | Deferred | 0 | Prior compatibility file with public path risk not resolved in this pass. | Remove only after downstream compatibility is proven disposable. |
| `edit/editFacade.ts` | Deferred | 0 | Prior compatibility file with public path risk not resolved in this pass. | Remove only after downstream compatibility is proven disposable. |

Removed compatibility files: none.

No compatibility file added or kept in this pass contains business logic.

## Imports Updated

Internal imports for the moved owners now use nested owner paths:

- `session/store/currentSelection.js`
- `session/replay/builder.js`
- `evidence/projection/continuation.js`
- `verification/intent/command.js`
- `repair/handoff/reopen.js`

The selected old paths have no remaining real TypeScript imports.

## Remaining Visible Debt

- `orchestration` remains the largest broad directory at 404 direct files.
- `core/context` remains dense at 356 direct files.
- `orchestration/patchResult` remains dense at 130 direct files and should be handled only with edit/apply ownership care.
- Export-only compatibility files increased because this pass preserved old import paths while moving implementations.
- Root-level tests remain in `session`, `evidence`, `verification`, `repair`, and `edit`; each needs owner review before movement.

## Validation Evidence

- Focused moved-owner tests passed: 5 files, 18 tests.
- Build, result contract check, diff check, status, commit, and push are recorded in the final response for the run that updates this report.

## Recommended Next Step

Continue with a narrow owner audit for remaining `session` root tests, then separately decide which zero-import compatibility files can be deleted without downstream breakage.
