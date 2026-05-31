# Structure Tree Pressure Report

Status: current structure pressure report for SR009.

## Scope

This report measures visible tree pressure under `packages/ts-shell/src` for structure-only cleanup in TypeScript owner domains. Product behavior is preserved. No compatibility entries were added in this pass.

## Before Snapshot

Top crowded directories by direct TypeScript file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 404 |
| `core/context` | 356 |
| `orchestration/patchResult` | 130 |
| `core/harness` | 91 |
| `session` | 50 |
| `core/shell` | 49 |
| `entrypoints` | 46 |
| `session/continuation` | 33 |
| `context` | 28 |
| `core/commands` | 26 |
| `runtime/loop` | 20 |
| `core/tools` | 19 |
| `edit` | 19 |
| `session/store` | 19 |
| `core/query` | 18 |
| `orchestration/patchRecovery` | 16 |
| `session/recovery` | 16 |
| `verification` | 16 |
| `turn` | 15 |
| `orchestration/patchApplication` | 12 |
| `planning` | 11 |
| `tools` | 11 |
| `cli/interactive` | 10 |
| `orchestration/patchParsing` | 10 |
| `repair` | 10 |

Target direct counts before editing:

| Directory | Direct files before | Direct tests before |
|---|---:|---:|
| `orchestration` | 404 | 173 |
| `orchestration/patchResult` | 130 | 65 |
| `core` | 0 | 0 |
| `core/context` | 356 | 97 |
| `core/query` | 18 | 6 |
| `core/shell` | 49 | 23 |
| `edit` | 19 | 6 |
| `verification` | 16 | 5 |
| `repair` | 10 | 2 |
| `evidence` | 6 | 1 |
| `result` | 2 | 0 |

Other before measurements:

- Tests still outside owner folders in target roots: 378.
- Export-only compatibility files: 103.
- Compatibility files with zero internal imports: 88.
- Compatibility files still imported internally: 15.
- Files with long basenames in target areas: 137.

## After Snapshot

Top crowded directories by direct TypeScript file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 404 |
| `core/context` | 268 |
| `orchestration/patchResult` | 113 |
| `core/harness` | 91 |
| `session` | 50 |
| `core/shell` | 49 |
| `entrypoints` | 46 |
| `core/context/memory` | 39 |
| `core/context/sidebar` | 34 |
| `session/continuation` | 33 |
| `context` | 28 |
| `core/commands` | 26 |
| `runtime/loop` | 20 |
| `core/tools` | 19 |
| `edit` | 19 |
| `session/store` | 19 |
| `orchestration/patchRecovery` | 16 |
| `session/recovery` | 16 |
| `verification` | 16 |
| `edit/result/journal` | 15 |
| `turn` | 15 |
| `orchestration/patchApplication` | 12 |
| `planning` | 11 |
| `tools` | 11 |
| `cli/interactive` | 10 |

Target direct counts after editing:

| Directory | Direct files after | Direct tests after |
|---|---:|---:|
| `orchestration` | 404 | 173 |
| `orchestration/patchResult` | 113 | 57 |
| `core` | 0 | 0 |
| `core/context` | 268 | 73 |
| `core/query` | 6 | 2 |
| `core/shell` | 49 | 23 |
| `edit` | 19 | 6 |
| `verification` | 16 | 5 |
| `repair` | 10 | 2 |
| `evidence` | 6 | 1 |
| `result` | 2 | 0 |

Other after measurements:

- Tests still outside owner folders in target roots: 342.
- Export-only compatibility files: 103.
- Compatibility files with zero internal imports: 88.
- Compatibility files still imported internally: 15.
- Files with long basenames in target areas: 136.

## Directories Improved

- `core/context`: 356 to 268 direct files; 24 tests moved into owner folders.
- `core/query`: 18 to 6 direct files; 4 tests moved into owner folders.
- `orchestration/patchResult`: 130 to 113 direct files; 8 tests moved into owner folders.
- Tests still outside owner folders in target roots: 378 to 342.
- Long basename count in target areas: 137 to 136.

## Owner Files Moved

- `core/context/projectMemory*` files now live under `core/context/memory/`.
- `core/context/sidebar*` files now live under `core/context/sidebar/`.
- `core/context/startupWarm*` files now live under `core/context/startup/`.
- `core/context/contextContinuityManifest*`, `contextLayerModel*`, and `contextStateProjection*` now live under `core/context/model/`.
- `core/query/resultMapper*`, `capabilityResultClassification.ts`, and `crossCapabilityResultFlow.test.ts` now live under `core/query/mapping/` with shorter local names where ownership was clear.
- `core/query/QueryEngine*`, `queryLoop.ts`, `events.ts`, `runtimeState.ts`, and `transitions.ts` now live under `core/query/runtime/` with shorter local names where ownership was clear.
- `core/query/terminalClassificationProjection.ts` now lives under `core/query/terminal/classificationProjection.ts`.
- `orchestration/patchResult/journal*` files now live under `edit/result/journal/`.
- `orchestration/patchResult/mutationVerificationProjection*` files now live under `verification/result/`.

## Tests Moved

Thirty-six tests were moved beside clearer owner code:

- 6 project-memory tests under `core/context/memory/`.
- 12 sidebar tests under `core/context/sidebar/`.
- 3 startup tests under `core/context/startup/`.
- 3 context model tests under `core/context/model/`.
- 4 query tests under `core/query/mapping/` and `core/query/runtime/`.
- 7 journal tests under `edit/result/journal/`.
- 1 verification-result test under `verification/result/`.

## Compatibility Status

Removed compatibility files: none.

Added compatibility files: none.

Existing export-only compatibility files remain classified as kept until downstream compatibility is proven disposable. The current internal-import split did not change:

| Class | Count |
|---|---:|
| Export-only compatibility files | 103 |
| Zero-internal-import compatibility files | 88 |
| Internally imported compatibility files | 15 |

Deletion condition: remove an export-only compatibility file only after internal imports are zero and no package consumer compatibility need is documented.

## Imports Updated

Internal imports were updated away from old moved paths for the touched owner domains. Active imports now target:

- `core/context/memory/*`
- `core/context/sidebar/*`
- `core/context/startup/*`
- `core/context/model/*`
- `core/query/mapping/*`
- `core/query/runtime/*`
- `core/query/terminal/classificationProjection.js`
- `edit/result/journal/*`
- `verification/result/mutationVerificationProjection.js`

## Validation Evidence

- Focused moved-owner tests passed: 36 files, 177 tests.
- `npm run build -w packages/ts-shell` passed.
- Result-contract validation, diff check, status, commit, and push are recorded in the final response for this run.

## Remaining Visible Debt

- `orchestration` remains the largest direct root because central owner files were not moved for appearance alone.
- `core/context` remains crowded, especially browser and compact ownership clusters.
- `orchestration/patchResult` still contains write-result and apply-adjacent files that need separate ownership review before movement.
- `core/shell` still has root tests that touch provider, recovery, session, and terminal boundaries.
- Compatibility files remain numerous because downstream compatibility has not been proven disposable.

## Recommended Next Step

Audit the remaining browser and compact context clusters for safe owner-folder movement, then review write-result files only where edit, verification, or result ownership is clear.
