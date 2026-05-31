# Structure Tree Pressure Report

Status: current structure pressure report for the write, permission, patch output, result, repair, and verification owner split.

## Scope

This report measures visible tree pressure under `packages/ts-shell/src` for TypeScript owner-domain cleanup. Product behavior is preserved. No package scripts, build config, providers, write execution semantics, approval semantics, apply behavior, repair execution behavior, or verification execution behavior were changed.

## Before Snapshot

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
| `core/context/browser/runtime/core` | 19 |
| `core/tools` | 19 |
| `edit` | 19 |
| `session/store` | 19 |
| `orchestration/patchRecovery` | 16 |
| `session/recovery` | 16 |
| `verification` | 16 |
| `edit/result/journal` | 15 |
| `turn` | 15 |
| `core/context/browser/receipt` | 14 |
| `core/context/browser/runtime/external` | 13 |
| `edit/result/workspace` | 13 |
| `core/context/browser/skill/runner` | 12 |
| `core/context/compact/injection` | 12 |
| `orchestration/patchApplication` | 12 |
| `planning` | 11 |
| `tools` | 11 |

Target direct counts before editing:

| Directory | Direct files before | Direct tests before |
|---|---:|---:|
| `orchestration` | 404 | 173 |
| `orchestration/patchResult` | 90 | 47 |
| `edit` | 19 | 6 |
| `edit/authority` | 3 | 1 |
| `edit/result` | 3 | 1 |
| `edit/patch` | 0 | 0 |
| `edit/workspace` | 2 | 1 |
| `verification/result` | 2 | 1 |
| `repair/handoff` | 4 | 2 |
| `evidence/projection` | 3 | 1 |
| `result/projection` | 2 | 1 |

Other before measurements:

- Direct patch output adjacency files in `orchestration/patchResult`: 90, including 47 direct tests.
- Direct tests still outside owner folders in target roots: 61.
- Export-only compatibility files: 105.
- Compatibility files with zero internal imports: 88.
- Compatibility files still imported internally: 17.
- Files with long basenames in target areas: 64.

## After Snapshot

Top crowded directories by direct TypeScript file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 404 |
| `core/context` | 172 |
| `core/harness` | 91 |
| `orchestration/patchResult` | 66 |
| `session` | 50 |
| `core/shell` | 49 |
| `entrypoints` | 45 |
| `core/context/memory` | 39 |
| `core/context/sidebar` | 34 |
| `session/continuation` | 33 |
| `context` | 28 |
| `core/commands` | 26 |
| `runtime/loop` | 20 |
| `core/context/browser/runtime/core` | 19 |
| `core/tools` | 19 |
| `session/store` | 19 |
| `orchestration/patchRecovery` | 16 |
| `session/recovery` | 16 |
| `edit/result/journal` | 15 |
| `turn` | 15 |
| `core/context/browser/receipt` | 14 |
| `core/context/browser/runtime/external` | 13 |
| `edit/result/workspace` | 13 |
| `core/context/browser/skill/runner` | 12 |
| `core/context/compact/injection` | 12 |
| `orchestration/patchApplication` | 12 |
| `verification` | 12 |
| `edit` | 11 |
| `planning` | 11 |
| `tools` | 11 |

Target direct counts after editing:

| Directory | Direct files after | Direct tests after |
|---|---:|---:|
| `orchestration` | 404 | 173 |
| `orchestration/patchResult` | 66 | 35 |
| `edit` | 11 | 2 |
| `edit/authority` | 3 | 1 |
| `edit/result` | 3 | 1 |
| `edit/patch` | 0 | 0 |
| `edit/workspace` | 2 | 1 |
| `verification/result` | 4 | 2 |
| `repair/handoff` | 6 | 3 |
| `evidence/projection` | 3 | 1 |
| `result/projection` | 2 | 1 |

Other after measurements:

- Direct patch output adjacency files in `orchestration/patchResult`: 66, including 35 direct tests.
- Direct tests still outside owner folders in target roots: 41.
- Export-only compatibility files: 105.
- Compatibility files with zero internal imports: 88.
- Compatibility files still imported internally: 17.
- Files with long basenames in target areas: 46.

## Directories Improved

- `orchestration/patchResult`: 90 to 66 direct files; direct tests reduced from 47 to 35.
- `edit`: 19 to 11 direct files; direct tests reduced from 6 to 2.
- `verification`: 16 to 12 direct files through result and command owner placement.
- Direct tests still outside owner folders in target roots: 61 to 41.
- Files with long basenames in target areas: 64 to 46.

## Owner Files Moved

- Patch apply and result projection files now live under `edit/patch/apply/` and `edit/patch/result/`.
- Permission and approval files now live under `edit/authority/approval/`.
- Write preflight files now live under `edit/write/runtime/`.
- Patch evidence files now live under `evidence/projection/patch/`.
- Patch and terminal result projections now live under `result/projection/patch/` and `result/projection/terminal/`.
- Repair handoff and flow files now live under `repair/handoff/` and `repair/flow/`.
- Verification boundary and command files now live under `verification/result/` and `verification/command/`.
- Mutation runtime files with clear edit ownership now live under `edit/runtime/`.

Deferred move:

- Files that still carry existing history-facing names or output strings remain in place until a separate behavior-preserving rename can be justified.

## Tests Moved

Twenty tests were moved beside clearer owner code:

- 12 patch apply, approval, evidence, and result projection tests.
- 4 edit runtime and write runtime tests.
- 2 repair flow and handoff tests.
- 2 verification command and result tests.

## Compatibility Status

Removed compatibility files: none.

Added compatibility files: none.

Moved implementation files were updated through internal imports rather than new compatibility wrappers. Existing export-only compatibility files remain classified as kept until downstream compatibility is proven disposable.

| Class | Count before | Count after |
|---|---:|---:|
| Export-only compatibility files | 105 | 105 |
| Zero-internal-import compatibility files | 88 | 88 |
| Internally imported compatibility files | 17 | 17 |

Deletion condition: remove an export-only compatibility file only after internal imports are zero and no package consumer compatibility need is documented.

## Imports Updated

Internal imports were updated away from the moved old paths for the touched owner domains. Active imports now target:

- `edit/authority/approval/*`
- `edit/patch/apply/*`
- `edit/patch/result/*`
- `edit/runtime/*`
- `edit/write/runtime/*`
- `evidence/projection/patch/*`
- `repair/flow/*`
- `repair/handoff/*`
- `result/projection/patch/*`
- `result/projection/terminal/*`
- `verification/command/*`
- `verification/result/*`

## Validation Evidence

- Focused moved-owner tests passed: 22 files, 91 tests.
- `npm run build -w packages/ts-shell` passed before report update.
- Final build, result-contract verification, diff check, and repository status are recorded in the implementation summary for this pass.

## Remaining Visible Debt

- `orchestration` remains the largest direct root because central owner files were not moved for appearance alone.
- `orchestration/patchResult` still contains history-facing and high-risk write-adjacent files that need separate ownership review before movement.
- `core/context` and `core/harness` remain crowded but were outside this pass.
- Compatibility files remain numerous because downstream compatibility has not been proven disposable.

## Recommended Next Step

Audit remaining patch output and write-adjacent files for behavior-preserving owner placement where file names and exported contracts can stay clean.
