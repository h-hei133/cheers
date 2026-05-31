# Structure Tree Pressure Report

Status: current structure pressure report for the patch output, write result, evidence, repair, verification, and result owner split.

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

Target direct counts before editing:

| Directory | Direct files before | Direct tests before |
|---|---:|---:|
| `orchestration` | 404 | 173 |
| `orchestration/patchResult` | 66 | 35 |
| `edit/result` | 3 | 1 |
| `edit/patch` | 0 | 0 |
| `edit/authority` | 3 | 1 |
| `verification/result` | 3 | 1 |
| `repair/handoff` | 4 | 1 |
| `evidence/projection` | 2 | 0 |
| `result/projection` | 1 | 0 |

Other before measurements:

- Direct patch output adjacency files in `orchestration/patchResult`: 66, including 35 direct tests.
- Direct tests still outside owner folders in target roots: 40.
- Export-only compatibility files: 124.
- Compatibility files with zero internal imports: 119.
- Compatibility files still imported internally: 5.
- Files with long basenames in target areas: 31.

## After Snapshot

Top crowded directories by direct TypeScript file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 398 |
| `core/context` | 172 |
| `core/harness` | 91 |
| `session` | 50 |
| `core/shell` | 49 |
| `entrypoints` | 45 |
| `core/context/memory` | 39 |
| `core/context/sidebar` | 34 |
| `orchestration/patchResult` | 33 |
| `session/continuation` | 33 |
| `context` | 28 |
| `core/commands` | 26 |
| `runtime/loop` | 20 |
| `core/context/browser/runtime/core` | 19 |
| `core/tools` | 19 |
| `session/store` | 19 |
| `edit/write/status` | 16 |
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

Target direct counts after editing:

| Directory | Direct files after | Direct tests after |
|---|---:|---:|
| `orchestration` | 398 | 171 |
| `orchestration/patchResult` | 33 | 19 |
| `edit/result` | 3 | 1 |
| `edit/patch` | 0 | 0 |
| `edit/authority` | 3 | 1 |
| `verification/result` | 3 | 1 |
| `repair/handoff` | 4 | 1 |
| `evidence/projection` | 2 | 0 |
| `result/projection` | 1 | 0 |

Other after measurements:

- Direct patch output adjacency files in `orchestration/patchResult`: 33, including 19 direct tests.
- Direct tests still outside owner folders in target roots: 24.
- Export-only compatibility files: 124.
- Compatibility files with zero internal imports: 119.
- Compatibility files still imported internally: 5.
- Files with long basenames in target areas: 22.

## Directories Improved

- `orchestration/patchResult`: 66 to 33 direct files; direct tests reduced from 35 to 19.
- `orchestration`: 404 to 398 direct files; direct tests reduced from 173 to 171.
- Direct tests still outside owner folders in target roots: 40 to 24.
- Files with long basenames in target areas: 31 to 22.

## Owner Files Moved

- Patch readiness and mixed-operation status moved to `edit/patch/status/`.
- Dry-run opt-in contract moved to `edit/patch/apply/optIn.ts`.
- Write guard, lane, no-write, wiring, and writer status files moved to `edit/write/status/`.
- Journal model moved to `edit/result/journal/model.ts`.
- No-write and production result projections moved to `result/projection/write/`.
- Patch mapper bridge moved to `result/projection/patch/bridge.ts`.
- Terminal session display contract moved to `result/projection/terminal/session.ts`.
- Verification failure classifier moved to `verification/result/failure/classifier.ts`.
- Claim ledger projection moved to `evidence/projection/claim/ledger.ts`.
- Action result evidence moved to `evidence/projection/action/result.ts`.
- Edit patch result projection moved to `edit/result/patch/projection.ts`.

Deferred move:

- Remaining `orchestration/patchResult` files stay in place when they still drive central write flow, real-provider gates, or workspace write execution and need narrower owner review before movement.

## Tests Moved

Eighteen tests were moved beside clearer owner code:

- 3 patch status/apply tests under `edit/patch/`.
- 8 write status tests under `edit/write/status/`.
- 1 journal model test under `edit/result/journal/`.
- 2 write result projection tests under `result/projection/write/`.
- 1 patch bridge test under `result/projection/patch/`.
- 1 terminal session contract test under `result/projection/terminal/`.
- 1 verification failure test under `verification/result/failure/`.
- 1 claim ledger test under `evidence/projection/claim/`.

## Compatibility Status

Removed compatibility files: none.

Added compatibility files: none.

Moved implementation files were updated through internal imports instead of new compatibility entries. Existing export-only compatibility files remain classified as kept until downstream compatibility is proven disposable.

| Class | Count before | Count after |
|---|---:|---:|
| Export-only compatibility files | 124 | 124 |
| Zero-internal-import compatibility files | 119 | 119 |
| Internally imported compatibility files | 5 | 5 |

Deletion condition: remove an export-only compatibility file only after internal imports are zero and package consumer compatibility is proven disposable.

## Imports Updated

Internal imports were updated away from the moved old paths for touched owner domains. Active imports now target:

- `edit/patch/status/*`
- `edit/patch/apply/optIn`
- `edit/write/status/*`
- `edit/result/journal/model`
- `edit/result/patch/projection`
- `result/projection/write/*`
- `result/projection/patch/bridge`
- `result/projection/terminal/session`
- `verification/result/failure/classifier`
- `evidence/projection/claim/ledger`
- `evidence/projection/action/result`

## Validation Evidence

- Focused moved-owner tests passed: 23 files, 181 tests.
- `npm run build -w packages/ts-shell` passed.
- `npm run verify:result-contract` passed.
- Diff check, repository status, commit, and push status are recorded in the implementation summary for this pass.

## Remaining Visible Debt

- `orchestration` remains the largest direct root because central flow files were not moved for appearance alone.
- `orchestration/patchResult` still contains write execution and provider-gated adjacency that should be split only with narrower ownership proof.
- `core/context` and `core/harness` remain crowded but were outside this pass.
- Existing compatibility files remain numerous because downstream compatibility has not been proven disposable.

## Recommended Next Step

Audit the remaining write execution adjacency for owner placement only where import churn and compatibility risk are bounded.

## SR015 Snapshot

Status: structure-only owner split for write-adjacent projection, verification command, patch hunk, approval authority, planning wording, and shell result assembly files. Runtime behavior, provider gates, approval semantics, apply semantics, package scripts, build config, workflow coordinator behavior, and session manager behavior were not changed.

### Before Snapshot

Top crowded directories by direct TypeScript file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 398 |
| `core/context` | 172 |
| `core/harness` | 91 |
| `session` | 50 |
| `core/shell` | 49 |
| `entrypoints` | 46 |
| `core/context/memory` | 39 |
| `core/context/sidebar` | 34 |
| `orchestration/patchResult` | 33 |
| `session/continuation` | 33 |
| `context` | 28 |
| `core/commands` | 26 |
| `runtime/loop` | 20 |
| `core/context/browser/runtime/core` | 19 |
| `core/tools` | 19 |
| `session/store` | 19 |
| `edit/write/status` | 16 |
| `orchestration/patchRecovery` | 16 |
| `session/recovery` | 16 |
| `turn` | 15 |

Target direct counts before editing:

| Directory | Direct files before | Direct tests before |
|---|---:|---:|
| `orchestration` | 398 | 171 |
| `orchestration/patchResult` | 33 | 19 |
| `edit/result` | 3 | 1 |
| `edit/patch` | 0 | 0 |
| `edit/authority` | 3 | 1 |
| `verification/result` | 3 | 1 |
| `repair/handoff` | 4 | 1 |
| `evidence/projection` | 2 | 0 |
| `result/projection` | 1 | 0 |

Other before measurements:

- Direct tests still outside owner folders in target roots: 23.
- Export-only compatibility files: 138.
- Compatibility files with zero internal imports: 105.
- Compatibility files still imported internally: 33.
- Files with long basenames in target areas: 53.

### After Snapshot

Top crowded directories by direct TypeScript file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 377 |
| `core/context` | 172 |
| `core/harness` | 91 |
| `session` | 50 |
| `core/shell` | 49 |
| `entrypoints` | 46 |
| `core/context/memory` | 39 |
| `core/context/sidebar` | 34 |
| `orchestration/patchResult` | 33 |
| `session/continuation` | 33 |
| `context` | 28 |
| `core/commands` | 26 |
| `runtime/loop` | 20 |
| `core/context/browser/runtime/core` | 19 |
| `core/tools` | 19 |
| `session/store` | 19 |
| `edit/write/status` | 16 |
| `orchestration/patchRecovery` | 16 |
| `session/recovery` | 16 |
| `turn` | 15 |
| `verification/command` | 14 |

Target direct counts after editing:

| Directory | Direct files after | Direct tests after |
|---|---:|---:|
| `orchestration` | 377 | 161 |
| `orchestration/patchResult` | 33 | 19 |
| `edit/result` | 3 | 1 |
| `edit/patch` | 0 | 0 |
| `edit/authority` | 3 | 1 |
| `verification/result` | 3 | 1 |
| `repair/handoff` | 4 | 1 |
| `evidence/projection` | 2 | 0 |
| `result/projection` | 1 | 0 |

Other after measurements:

- Direct tests still outside owner folders in target roots: 23.
- Export-only compatibility files: 138.
- Compatibility files with zero internal imports: 105.
- Compatibility files still imported internally: 33.
- Files with long basenames in target areas: 50.

### Directories Improved

- `orchestration`: 398 to 377 direct files; direct tests reduced from 171 to 161.
- Files with long basenames in target areas: 53 to 50.
- Owner-local test placement improved by moving 10 direct tests out of root `orchestration`.

### Owner Files Moved

- Approval authority projection moved to `edit/authority/projection/approval.ts`.
- Exact hunk set model moved to `edit/patch/plan/hunkSet.ts`.
- Exact hunk conflict detection moved to `edit/patch/apply/conflict.ts`.
- Exact hunk result summary moved to `edit/patch/result/hunk.ts`.
- Verification command result, runner, and selection moved to `verification/command/`.
- Verification outcome classification moved to `verification/result/failure/outcome.ts`.
- Shell result assembly and verification delivery note moved to `result/projection/shell/`.
- Edit planning next-action wording moved to `planning/projection/nextAction.ts`.

Deferred:

- Remaining `orchestration/patchResult` files stayed in place because their ownership is still tied to central write execution, provider-gated write checks, or permission/apply behavior.
- Verification repair result and edit snapshot files stayed in place because moving them would carry old process vocabulary into new product paths or touch protected allowlist adjacency.
- Runtime handoff and mutation execution files stayed in place because moving them would require workflow coordinator import churn.

### Tests Moved

Ten tests were moved beside owner code:

- 3 edit patch hunk tests under `edit/patch/`.
- 1 approval authority projection test under `edit/authority/projection/`.
- 3 verification command tests under `verification/command/`.
- 1 verification failure outcome test under `verification/result/failure/`.
- 1 shell result assembly test under `result/projection/shell/`.
- 1 planning next-action wording test under `planning/projection/`.

### Compatibility Status

Added compatibility files: none.

Removed compatibility files: none.

Moved implementation files were updated through internal imports rather than new compatibility entries.

| Class | Count before | Count after |
|---|---:|---:|
| Export-only compatibility files | 138 | 138 |
| Zero-internal-import compatibility files | 105 | 105 |
| Internally imported compatibility files | 33 | 33 |

Deletion condition remains unchanged: remove an export-only compatibility file only after internal imports are zero and package consumer compatibility is proven disposable.

### Validation Evidence

- Focused moved-owner and nearby consumer tests passed: 14 files, 50 tests.
- `npm run build -w packages/ts-shell` passed after import correction.
- `npm run verify:result-contract` passed after moving result-facing projection code.

### Remaining Visible Debt

- `orchestration` remains the largest direct root.
- `orchestration/patchResult` did not improve in this pass because the remaining files are central write execution or provider/permission/apply adjacency.
- Several long visible names remain in root `orchestration`; the safe ones are mixed with planning/runtime/provider surfaces outside this pass.
