# Structure Tree Pressure Report

Status: current structure pressure report for the patch output, history, write result, evidence, repair, verification, and result owner split.

## Scope

This report measures visible tree pressure under `packages/ts-shell/src` for TypeScript owner-domain cleanup. Product behavior is preserved. No package scripts, build config, providers, write execution semantics, approval semantics, apply behavior, repair execution behavior, verification execution behavior, session schema, workflow coordinator behavior, or session manager behavior were changed.

## Before Snapshot

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

Target direct counts before editing:

| Directory | Direct files before | Direct tests before |
|---|---:|---:|
| `orchestration` | 404 | 173 |
| `orchestration/patchResult` | 66 | 35 |
| `edit` | 11 | 2 |
| `edit/authority` | 3 | 1 |
| `edit/result` | 3 | 1 |
| `edit/patch` | 0 | 0 |
| `edit/result/journal` | 15 | 7 |
| `edit/result/workspace` | 13 | 6 |
| `verification/result` | 4 | 2 |
| `repair/handoff` | 6 | 3 |
| `evidence/projection` | 3 | 1 |
| `result/projection` | 2 | 1 |
| `result/projection/terminal` | 2 | 1 |

Other before measurements:

- Direct patch output adjacency files in `orchestration/patchResult`: 66, including 35 direct tests.
- Direct tests still outside owner folders in target roots: 42.
- Export-only compatibility files: 105.
- Compatibility files with zero internal imports: 100.
- Compatibility files still imported internally: 5.
- Files with long basenames in target areas: 36.

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
| `turn` | 15 |
| `core/context/browser/receipt` | 14 |
| `core/context/browser/runtime/external` | 13 |
| `core/context/browser/skill/runner` | 12 |
| `core/context/compact/injection` | 12 |
| `edit/result/workspace/projection` | 12 |
| `orchestration/patchApplication` | 12 |
| `verification` | 12 |
| `edit` | 11 |
| `planning` | 11 |
| `tools` | 11 |
| `cli/interactive` | 10 |

Target direct counts after editing:

| Directory | Direct files after | Direct tests after |
|---|---:|---:|
| `orchestration` | 404 | 173 |
| `orchestration/patchResult` | 66 | 35 |
| `edit` | 11 | 2 |
| `edit/authority` | 3 | 1 |
| `edit/result` | 3 | 1 |
| `edit/patch` | 0 | 0 |
| `edit/result/journal` | 8 | 0 |
| `edit/result/workspace` | 7 | 0 |
| `verification/result` | 3 | 1 |
| `repair/handoff` | 4 | 1 |
| `evidence/projection` | 2 | 0 |
| `result/projection` | 1 | 0 |
| `result/projection/terminal` | 2 | 1 |

Other after measurements:

- Direct patch output adjacency files in `orchestration/patchResult`: 66, including 35 direct tests.
- Direct tests still outside owner folders in target roots: 40.
- Export-only compatibility files: 124.
- Compatibility files with zero internal imports: 119.
- Compatibility files still imported internally: 5.
- Files with long basenames in target areas: 31.

## Directories Improved

- `edit/result/journal`: 15 to 8 direct files; direct tests reduced from 7 to 0.
- `edit/result/workspace`: 13 to 7 direct files; direct tests reduced from 6 to 0.
- `verification/result`: 4 to 3 direct files; direct tests reduced from 2 to 1.
- `repair/handoff`: 6 to 4 direct files; direct tests reduced from 3 to 1.
- `evidence/projection`: 3 to 2 direct files; direct tests reduced from 1 to 0.
- `result/projection`: 2 to 1 direct files; direct tests reduced from 1 to 0.
- Direct tests still outside owner folders in target roots: 42 to 40.
- Files with long basenames in target areas: 36 to 31.

## Owner Files Moved

- Verification handoff projection moved to `verification/result/projection/mutation.ts`.
- Repair continuation planning moved to `repair/handoff/planning/continuation.ts`.
- Repair reopen state selection moved to `repair/handoff/state/reopen.ts`.
- Continuation evidence projection moved to `evidence/projection/repair/continuation.ts`.
- Workflow result projection moved to `result/projection/workflow/runtime.ts`.
- Workspace write result projections moved to `edit/result/workspace/projection/{write,create,delete,move,multiFile,mixedFile}.ts`.
- Journal authority files moved to `edit/result/journal/authority/{durable,original}.ts`.
- Journal metadata moved to `edit/result/journal/metadata/boundary.ts`.
- Journal failure files moved to `edit/result/journal/failure/{state,consumer}.ts`.
- Journal recovery files moved to `edit/result/journal/recovery/{plan,readiness}.ts`.
- Journal failure surface projection moved to `edit/result/journal/projection/failure.ts`.

Deferred move:

- `orchestration/patchResult` implementation files remain in place because moving them would require broader ownership review and higher-risk import churn.

## Tests Moved

Eighteen tests were moved beside clearer owner code:

- 7 journal tests under `edit/result/journal/*`.
- 6 workspace write result tests under `edit/result/workspace/projection/`.
- 2 repair handoff tests under `repair/handoff/*`.
- 1 verification result projection test under `verification/result/projection/`.
- 1 evidence projection test under `evidence/projection/repair/`.
- 1 workflow result projection test under `result/projection/workflow/`.

## Compatibility Status

Removed compatibility files: none.

Added compatibility files: 19.

The added compatibility files preserve old import surfaces as export-only entries while real implementation moved into owner subfolders. Project-internal imports for these moved surfaces were updated to owner paths, leaving the new compatibility entries with zero known internal imports.

| Class | Count before | Count after |
|---|---:|---:|
| Export-only compatibility files | 105 | 124 |
| Zero-internal-import compatibility files | 100 | 119 |
| Internally imported compatibility files | 5 | 5 |

Deletion condition: remove an export-only compatibility file only after internal imports are zero and package consumer compatibility is proven disposable.

## Imports Updated

Internal imports were updated away from the moved old paths for touched owner domains. Active imports now target:

- `verification/result/projection/mutation`
- `repair/handoff/planning/continuation`
- `repair/handoff/state/reopen`
- `evidence/projection/repair/continuation`
- `result/projection/workflow/runtime`
- `edit/result/workspace/projection/*`
- `edit/result/journal/authority/*`
- `edit/result/journal/metadata/boundary`
- `edit/result/journal/failure/*`
- `edit/result/journal/recovery/*`
- `edit/result/journal/projection/failure`

## Validation Evidence

- Focused moved-owner tests passed: 24 files, 129 tests.
- `npm run build -w packages/ts-shell` passed.
- `npm run verify:result-contract` passed.
- Diff check, repository status, commit, and push status are recorded in the implementation summary for this pass.

## Remaining Visible Debt

- `orchestration` remains the largest direct root because central owner files were not moved for appearance alone.
- `orchestration/patchResult` remains dense and should be split only after ownership and compatibility risk are clearer.
- `core/context` and `core/harness` remain crowded but were outside this pass.
- Compatibility files increased to preserve old public surfaces while internal imports moved to owner paths.

## Recommended Next Step

Audit remaining patch output files for behavior-preserving owner placement where existing public names can stay as export-only compatibility entries.
