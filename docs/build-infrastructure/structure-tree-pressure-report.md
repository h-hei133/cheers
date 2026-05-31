# Structure Tree Pressure Report

Status: current structure pressure report for this structure-only pass.

## Scope

This report measures visible tree pressure under `packages/ts-shell/src` for TypeScript owner-domain cleanup. Product behavior is preserved. No compatibility entries were added.

## Before Snapshot

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
| `orchestration/patchParsing` | 10 |
| `repair` | 10 |
| `runtime/execution` | 10 |
| `context/acquisition` | 9 |
| `core/context/startup` | 9 |

Target direct counts before editing:

| Directory | Direct files before | Direct tests before |
|---|---:|---:|
| `orchestration` | 404 | 173 |
| `orchestration/patchResult` | 113 | 57 |
| `core/context` | 268 | 73 |
| `edit` | 19 | 6 |
| `verification` | 16 | 5 |
| `repair` | 10 | 2 |
| `evidence` | 6 | 1 |
| `result` | 2 | 0 |

Other before measurements:

- Direct browser-cluster files in `core/context`: 232, including 58 direct tests.
- Direct compact-cluster files in `core/context`: 29, including 14 direct tests.
- Tests still outside owner folders in target roots: 342.
- Export-only compatibility files: 105.
- Compatibility files with zero internal imports: 64.
- Compatibility files still imported internally: 41.
- Files with long basenames in target areas: 62.

## After Snapshot

Top crowded directories by direct TypeScript file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 404 |
| `core/context` | 225 |
| `orchestration/patchResult` | 100 |
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
| `core/context/browser/receipt` | 14 |
| `edit/result/workspace` | 13 |
| `core/context/compact/injection` | 12 |
| `orchestration/patchApplication` | 12 |
| `planning` | 11 |
| `tools` | 11 |
| `cli/interactive` | 10 |
| `orchestration/patchParsing` | 10 |
| `repair` | 10 |

Target direct counts after editing:

| Directory | Direct files after | Direct tests after |
|---|---:|---:|
| `orchestration` | 404 | 173 |
| `orchestration/patchResult` | 100 | 51 |
| `core/context` | 225 | 54 |
| `edit` | 19 | 6 |
| `verification` | 16 | 5 |
| `repair` | 10 | 2 |
| `evidence` | 6 | 1 |
| `result` | 2 | 0 |

Other after measurements:

- Direct browser-cluster files in `core/context`: 218, including 53 direct tests.
- Direct compact-cluster files in `core/context`: 0, including 0 direct tests.
- Tests still outside owner folders in target roots: 317.
- Export-only compatibility files: 105.
- Compatibility files with zero internal imports: 64.
- Compatibility files still imported internally: 41.
- Files with long basenames in target areas: 62.

## Directories Improved

- `core/context`: 268 to 225 direct files; direct tests reduced from 73 to 54.
- `orchestration/patchResult`: 113 to 100 direct files; direct tests reduced from 57 to 51.
- Direct browser-cluster files in `core/context`: 232 to 218.
- Direct compact-cluster files in `core/context`: 29 to 0.
- Tests still outside owner folders in target roots: 342 to 317.

## Owner Files Moved

- `core/context/browserReceiptCache*` files now live under `core/context/browser/receipt/`.
- `core/context/compactCommand*` files now live under `core/context/compact/command/`.
- `core/context/compactCheckpointSurface*` and `compactLiveCheckpoint*` files now live under `core/context/compact/checkpoint/`.
- `core/context/compactContinuity*` files now live under `core/context/compact/continuity/`.
- `core/context/compactHandoffRenderer*` and `compactSessionSurface*` files now live under `core/context/compact/delivery/`.
- `core/context/compactFutureTurn*`, `compactInjectedContext*`, and `compactInjection*` files now live under `core/context/compact/injection/`.
- `core/context/compactRedactionPolicy*` files now live under `core/context/compact/policy/`.
- `orchestration/patchResult/mixedFileWriteResult*`, `multiFileWriteResult*`, `workspaceCreateResult*`, `workspaceDeleteResult*`, `workspaceMoveResult*`, `workspaceWriteResult*`, and `writeFailureState.ts` now live under `edit/result/workspace/`.

## Tests Moved

Twenty-five tests were moved beside clearer owner code:

- 5 browser receipt-cache tests under `core/context/browser/receipt/`.
- 14 compact-context tests under `core/context/compact/`.
- 6 workspace-result tests under `edit/result/workspace/`.

## Compatibility Status

Removed compatibility files: none.

Added compatibility files: none.

Existing export-only compatibility files remain classified as kept until downstream compatibility is proven disposable. The current scanner counts local export-only entrypoints consistently before and after this pass:

| Class | Count before | Count after |
|---|---:|---:|
| Export-only compatibility files | 105 | 105 |
| Zero-internal-import compatibility files | 64 | 64 |
| Internally imported compatibility files | 41 | 41 |

Deletion condition: remove an export-only compatibility file only after internal imports are zero and no package consumer compatibility need is documented.

## Imports Updated

Internal imports were updated away from old moved paths for the touched owner domains. Active imports now target:

- `core/context/browser/receipt/*`
- `core/context/compact/command/*`
- `core/context/compact/checkpoint/*`
- `core/context/compact/continuity/*`
- `core/context/compact/delivery/*`
- `core/context/compact/injection/*`
- `core/context/compact/policy/*`
- `edit/result/workspace/*`

## Validation Evidence

- Focused moved-owner tests passed: 25 files, 66 tests.
- `npm run build -w packages/ts-shell` passed.
- `npm run verify:result-contract` passed.

## Remaining Visible Debt

- `orchestration` remains the largest direct root because central owner files were not moved for appearance alone.
- `core/context` remains crowded beyond the browser receipt-cache and compact clusters moved here.
- `orchestration/patchResult` still contains write execution and permission-adjacent files that need separate ownership review before movement.
- `core/shell` still has root tests that touch provider, recovery, session, and terminal boundaries.
- Compatibility files remain numerous because downstream compatibility has not been proven disposable.

## Recommended Next Step

Audit the remaining browser runtime, browser skill-runner, and patch planning clusters for safe owner-folder movement.
