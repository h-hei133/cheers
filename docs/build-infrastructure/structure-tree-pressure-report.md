# Structure Tree Pressure Report

Status: current structure pressure report for this structure-only pass.

## Scope

This report measures visible tree pressure under `packages/ts-shell/src` for TypeScript owner-domain cleanup. Product behavior is preserved. No compatibility entries were added.

## Before Snapshot

Top crowded directories by direct TypeScript file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 404 |
| `core/context` | 225 |
| `orchestration/patchResult` | 100 |
| `core/harness` | 91 |
| `session` | 50 |
| `core/shell` | 49 |
| `entrypoints` | 45 |
| `core/context/memory` | 39 |
| `core/context/sidebar` | 34 |
| `session/continuation` | 33 |
| `context` | 28 |
| `core/commands` | 26 |
| `runtime/loop` | 20 |
| `session/store` | 19 |
| `edit` | 19 |
| `core/tools` | 19 |
| `verification` | 16 |
| `session/recovery` | 16 |
| `orchestration/patchRecovery` | 16 |
| `turn` | 15 |
| `edit/result/journal` | 15 |
| `core/context/browser/receipt` | 14 |
| `edit/result/workspace` | 13 |
| `orchestration/patchApplication` | 12 |
| `core/context/compact/injection` | 12 |
| `tools` | 11 |
| `planning` | 11 |
| `runtime/execution` | 10 |
| `repair` | 10 |
| `orchestration/patchParsing` | 10 |

Target direct counts before editing:

| Directory | Direct files before | Direct tests before |
|---|---:|---:|
| `orchestration` | 404 | 173 |
| `orchestration/patchResult` | 100 | 51 |
| `core/context` | 225 | 54 |
| `edit` | 19 | 6 |
| `verification` | 16 | 5 |
| `repair` | 10 | 2 |
| `evidence` | 6 | 1 |
| `result` | 2 | 0 |

Other before measurements:

- Direct browser-cluster files in `core/context`: 218, including 53 direct tests.
- Direct browser runtime-cluster files in `core/context`: 114, including 28 direct tests.
- Direct browser skill-cluster files in `core/context`: 23, including 11 direct tests.
- Direct patch output adjacency files in `orchestration/patchResult`: 100, including 51 direct tests.
- Direct patch planning adjacency files in `orchestration/patchResult`: 5, including 2 direct tests.
- Tests still outside owner folders in target roots: 119.
- Export-only compatibility files: 105.
- Compatibility files with zero internal imports: 87.
- Compatibility files still imported internally: 18.
- Files with long basenames in target areas: 95.

## After Snapshot

Top crowded directories by direct TypeScript file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 404 |
| `core/context` | 172 |
| `core/harness` | 91 |
| `orchestration/patchResult` | 90 |
| `session` | 50 |
| `core/shell` | 49 |
| `entrypoints` | 45 |
| `core/context/memory` | 39 |
| `core/context/sidebar` | 34 |
| `session/continuation` | 33 |
| `context` | 28 |
| `core/commands` | 26 |
| `runtime/loop` | 20 |
| `session/store` | 19 |
| `edit` | 19 |
| `core/tools` | 19 |
| `core/context/browser/runtime/core` | 19 |
| `verification` | 16 |
| `session/recovery` | 16 |
| `orchestration/patchRecovery` | 16 |
| `turn` | 15 |
| `edit/result/journal` | 15 |
| `core/context/browser/receipt` | 14 |
| `edit/result/workspace` | 13 |
| `core/context/browser/runtime/external` | 13 |
| `orchestration/patchApplication` | 12 |
| `core/context/compact/injection` | 12 |
| `core/context/browser/skill/runner` | 12 |
| `tools` | 11 |
| `planning` | 11 |

Target direct counts after editing:

| Directory | Direct files after | Direct tests after |
|---|---:|---:|
| `orchestration` | 404 | 173 |
| `orchestration/patchResult` | 90 | 47 |
| `core/context` | 172 | 35 |
| `edit` | 19 | 6 |
| `verification` | 16 | 5 |
| `repair` | 10 | 2 |
| `evidence` | 6 | 1 |
| `result` | 2 | 0 |

Other after measurements:

- Direct browser-cluster files in `core/context`: 165, including 34 direct tests.
- Direct browser runtime-cluster files in `core/context`: 82, including 19 direct tests.
- Direct browser skill-cluster files in `core/context`: 2, including 1 direct test.
- Direct patch output adjacency files in `orchestration/patchResult`: 90, including 47 direct tests.
- Direct patch planning adjacency files in `orchestration/patchResult`: 0, including 0 direct tests.
- Tests still outside owner folders in target roots: 96.
- Export-only compatibility files: 105.
- Compatibility files with zero internal imports: 87.
- Compatibility files still imported internally: 18.
- Files with long basenames in target areas: 80.

## Directories Improved

- `core/context`: 225 to 172 direct files; direct tests reduced from 54 to 35.
- `orchestration/patchResult`: 100 to 90 direct files; direct tests reduced from 51 to 47.
- Direct browser runtime-cluster files in `core/context`: 114 to 82.
- Direct browser skill-cluster files in `core/context`: 23 to 2.
- Direct patch planning adjacency files in `orchestration/patchResult`: 5 to 0.
- Tests still outside owner folders in target roots: 119 to 96.
- Files with long basenames in target areas: 95 to 80.

## Owner Files Moved

- Browser skill execution files now live under `core/context/browser/skill/execution/`.
- Browser skill runner files now live under `core/context/browser/skill/runner/`.
- Browser skill runtime binding now lives under `core/context/browser/skill/runtime/`.
- Browser runtime files now live under `core/context/browser/runtime/core/`.
- Browser external runtime files now live under `core/context/browser/runtime/external/`.
- Patch planning files now live under `edit/patch/plan/`.
- Patch candidate and bounded write policy files now live under `edit/patch/plan/` and `edit/authority/`.
- Workspace write authority now lives under `edit/authority/`.

Deferred move:

- `core/context/browserSkillManagedRunnerPolicy*` remains at the previous path because it contains existing compatibility-facing text that should not be rewritten in a structure-only pass.

## Tests Moved

Twenty-three tests were moved beside clearer owner code:

- 10 browser skill tests under `core/context/browser/skill/`.
- 9 browser runtime tests under `core/context/browser/runtime/`.
- 4 patch planning and write policy tests under `edit/patch/plan/` and `edit/authority/`.

## Compatibility Status

Removed compatibility files: none.

Added compatibility files: none.

Existing export-only compatibility files remain classified as kept until downstream compatibility is proven disposable. The current scanner counts local export-only entrypoints consistently before and after this pass:

| Class | Count before | Count after |
|---|---:|---:|
| Export-only compatibility files | 105 | 105 |
| Zero-internal-import compatibility files | 87 | 87 |
| Internally imported compatibility files | 18 | 18 |

Deletion condition: remove an export-only compatibility file only after internal imports are zero and no package consumer compatibility need is documented.

## Imports Updated

Internal imports were updated away from old moved paths for the touched owner domains. Active imports now target:

- `core/context/browser/skill/execution/*`
- `core/context/browser/skill/runner/*`
- `core/context/browser/skill/runtime/*`
- `core/context/browser/runtime/core/*`
- `core/context/browser/runtime/external/*`
- `edit/patch/plan/*`
- `edit/authority/*`

## Validation Evidence

- Focused moved-owner tests passed: 24 files, 122 tests.
- `npm run build -w packages/ts-shell` passed.
- `npm run verify:result-contract` passed.

## Remaining Visible Debt

- `orchestration` remains the largest direct root because central owner files were not moved for appearance alone.
- `core/context` remains crowded beyond the browser runtime and skill clusters moved here.
- `orchestration/patchResult` still contains write execution and permission-adjacent files that need separate ownership review before movement.
- `core/harness` still has browser scenario fixtures that may warrant a future owner review.
- Compatibility files remain numerous because downstream compatibility has not been proven disposable.

## Recommended Next Step

Audit remaining write execution and permission-adjacent files under `orchestration/patchResult` for safe owner-folder movement.
