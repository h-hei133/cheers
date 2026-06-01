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

## Owner Index Compatibility Trim

Status: structure-only owner index cleanup for context, planning, provider, and tools. Product behavior was preserved. No result truthfulness, provider configuration, provider calls, fallback behavior, tool authority, command allowlists, edit/apply/write approval behavior, verification execution, repair execution, session schema, CLI behavior, package scripts, build config, workflow coordinator behavior, or session manager behavior changed.

Initial status:

- `git status --short --branch` reported `## main...origin/main`.
- No pre-edit push was attempted because the branch was not ahead.
- The worktree was clean before editing.

Inspection summary:

- Latest pressure report, remaining internally imported compatibility files, context/planning/provider/tools owner indexes, old entry surfaces, imports to broad indexes and old paths, package exports, package metadata, tests outside touched owner folders, direct file counts, and long basenames were inspected.
- Serena targeted inspection confirmed the four parent owner indexes have no symbol bodies and only re-export child owner indexes.
- `packages/ts-shell/package.json` exposes `dist`, `src`, and a CLI binary, with no documented package export for the removed child index paths.

### Before Snapshot

Before measurements:

| Measurement | Before |
|---|---:|
| Export-only compatibility files | 106 |
| Zero-internal-import compatibility files | 92 |
| Internally imported compatibility files | 14 |
| Target owner index files | 16 |
| `context` owner index files | 4 |
| `planning` owner index files | 4 |
| `provider` owner index files | 4 |
| `tools` owner index files | 4 |
| Tests outside owner folders for touched owners | 21 |
| Long basenames in target areas | 2 |

Target internally imported compatibility files before:

| Path | Internal imports | Importer |
|---|---:|---|
| `context/acquisition/index.ts` | 1 | `context/index.ts` |
| `context/discovery/index.ts` | 1 | `context/index.ts` |
| `context/memory/index.ts` | 1 | `context/index.ts` |
| `planning/grounded/index.ts` | 1 | `planning/index.ts` |
| `planning/handoff/index.ts` | 1 | `planning/index.ts` |
| `planning/runtime/index.ts` | 1 | `planning/index.ts` |
| `provider/registry/index.ts` | 1 | `provider/index.ts` |
| `provider/request/index.ts` | 1 | `provider/index.ts` |
| `provider/response/index.ts` | 1 | `provider/index.ts` |
| `tools/dispatch/index.ts` | 1 | `tools/index.ts` |
| `tools/policy/index.ts` | 1 | `tools/index.ts` |
| `tools/result/index.ts` | 1 | `tools/index.ts` |

### After Snapshot

After measurements:

| Measurement | Before | After |
|---|---:|---:|
| Export-only compatibility files | 106 | 94 |
| Zero-internal-import compatibility files | 92 | 92 |
| Internally imported compatibility files | 14 | 2 |
| Target owner index files | 16 | 4 |
| `context` owner index files | 4 | 1 |
| `planning` owner index files | 4 | 1 |
| `provider` owner index files | 4 | 1 |
| `tools` owner index files | 4 | 1 |
| Tests outside owner folders for touched owners | 21 | 21 |
| Long basenames in target areas | 2 | 2 |

Target internally imported compatibility files after:

| Path | Internal imports | Status |
|---|---:|---|
| none | 0 | none remain in the target owner index area |

### Compatibility Files Considered

| Path | Status | Internal imports before | Internal imports after | Package-facing status | Reason | Deletion condition |
|---|---|---:|---:|---|---|---|
| `context/acquisition/index.ts` | removed | 1 | 0 | no documented package export found | parent owner index now exports concrete acquisition files directly | already met |
| `context/discovery/index.ts` | removed | 1 | 0 | no documented package export found | parent owner index now exports concrete discovery files directly | already met |
| `context/memory/index.ts` | removed | 1 | 0 | no documented package export found | parent owner index now exports concrete memory files directly | already met |
| `planning/grounded/index.ts` | removed | 1 | 0 | no documented package export found | parent owner index now exports concrete grounded files directly | already met |
| `planning/handoff/index.ts` | removed | 1 | 0 | no documented package export found | parent owner index now exports concrete handoff files directly | already met |
| `planning/runtime/index.ts` | removed | 1 | 0 | no documented package export found | parent owner index now exports concrete runtime files directly | already met |
| `provider/registry/index.ts` | removed | 1 | 0 | no documented package export found | parent owner index now exports concrete registry files directly | already met |
| `provider/request/index.ts` | removed | 1 | 0 | no documented package export found | parent owner index now exports concrete request files directly | already met |
| `provider/response/index.ts` | removed | 1 | 0 | no documented package export found | parent owner index now exports concrete response files directly | already met |
| `tools/dispatch/index.ts` | removed | 1 | 0 | no documented package export found | parent owner index now exports concrete dispatch files directly | already met |
| `tools/policy/index.ts` | removed | 1 | 0 | no documented package export found | parent owner index now exports concrete policy files directly | already met |
| `tools/result/index.ts` | removed | 1 | 0 | no documented package export found | parent owner index now exports concrete result files directly | already met |
| `context/index.ts` | kept | 0 | 0 | root owner entry | retained as owner entry and package-facing aggregation surface | remove only if all owner entry consumers and package safety are proven disposable |
| `planning/index.ts` | kept | 0 | 0 | root owner entry | retained as owner entry and package-facing aggregation surface | remove only if all owner entry consumers and package safety are proven disposable |
| `provider/index.ts` | kept | 0 | 0 | root owner entry | retained as owner entry and package-facing aggregation surface | remove only if all owner entry consumers and package safety are proven disposable |
| `tools/index.ts` | kept | 0 | 0 | root owner entry | retained as owner entry and package-facing aggregation surface | remove only if all owner entry consumers and package safety are proven disposable |
| `provider/providerRegistry.ts` | kept | 0 | 0 | old entry surface | no internal import pressure in this bounded cleanup | remove only after provider-facing package safety is reviewed |
| `tools/dispatcher.ts` | kept | 0 | 0 | old entry surface | no internal import pressure in this bounded cleanup | remove only after tools-facing package safety is reviewed |
| `tools/interception.ts` | kept | 0 | 0 | old entry surface | no internal import pressure in this bounded cleanup | remove only after tools-facing package safety is reviewed |
| `tools/resultSplit.ts` | kept | 0 | 0 | old entry surface | no internal import pressure in this bounded cleanup | remove only after tools-facing package safety is reviewed |

### Files Removed

- `packages/ts-shell/src/context/acquisition/index.ts`
- `packages/ts-shell/src/context/discovery/index.ts`
- `packages/ts-shell/src/context/memory/index.ts`
- `packages/ts-shell/src/planning/grounded/index.ts`
- `packages/ts-shell/src/planning/handoff/index.ts`
- `packages/ts-shell/src/planning/runtime/index.ts`
- `packages/ts-shell/src/provider/registry/index.ts`
- `packages/ts-shell/src/provider/request/index.ts`
- `packages/ts-shell/src/provider/response/index.ts`
- `packages/ts-shell/src/tools/dispatch/index.ts`
- `packages/ts-shell/src/tools/policy/index.ts`
- `packages/ts-shell/src/tools/result/index.ts`

### Files Moved

- None.

### Tests Moved

- None.

### Imports Updated

- `context/index.ts` now exports concrete acquisition, discovery, and memory owner files directly.
- `planning/index.ts` now exports concrete grounded, handoff, and runtime owner files directly.
- `provider/index.ts` now exports concrete registry, request, and response owner files directly.
- `tools/index.ts` now exports concrete dispatch, policy, and result owner files directly.

### Remaining Visible Debt

- Two internally imported compatibility files remain outside this bounded target: `orchestration/contextEngine.ts` and `orchestration/planningRuntimeProductProjection.ts`.
- Root owner indexes and old zero-internal entry surfaces remain until package-facing safety is reviewed.

## Context Planning Entry Trim

Status: structure-only cleanup for the remaining internally imported context and planning entry surfaces. Product behavior was preserved. No result truthfulness, provider configuration, provider calls, fallback behavior, tool authority, command allowlists, edit/apply/write approval behavior, verification execution, repair execution, session schema, CLI behavior, package scripts, build config, workflow coordinator behavior, or session manager behavior changed.

Initial status:

- `git status --short --branch` reported `## main...origin/main`.
- No pre-edit push was attempted because the branch was not ahead.
- The worktree was clean before editing.

Inspection summary:

- Latest pressure report, both old entry files, context acquisition owner files, planning runtime owner files, imports to old entry paths, package metadata, tests around context acquisition and planning runtime, direct file counts, and long basenames were inspected.
- Serena targeted inspection confirmed the two old entry files had no symbols and only re-exported owner files.
- `packages/ts-shell/package.json` exposes `dist`, `src`, and a CLI binary, with no documented package export for the removed old entry files.

### Before Snapshot

Before measurements:

| Measurement | Before |
|---|---:|
| Export-only compatibility files | 94 |
| Zero-internal-import compatibility files | 92 |
| Internally imported compatibility files | 2 |
| Root `orchestration` direct files | 347 |
| `context/acquisition` direct files | 8 |
| `planning/runtime` direct files | 5 |
| Tests outside owner folders for touched owners | 27 |
| Long basenames in target areas | 39 |

Target internally imported compatibility files before:

| Path | Internal imports |
|---|---:|
| `orchestration/contextEngine.ts` | 5 |
| `orchestration/planningRuntimeProductProjection.ts` | 1 |

### After Snapshot

After measurements:

| Measurement | Before | After |
|---|---:|---:|
| Export-only compatibility files | 94 | 92 |
| Zero-internal-import compatibility files | 92 | 92 |
| Internally imported compatibility files | 2 | 0 |
| Root `orchestration` direct files | 347 | 345 |
| `context/acquisition` direct files | 8 | 8 |
| `planning/runtime` direct files | 5 | 5 |
| Tests outside owner folders for touched owners | 27 | 27 |
| Long basenames in target areas | 39 | 38 |

Target internally imported compatibility files after:

| Path | Internal imports | Status |
|---|---:|---|
| none | 0 | none remain in the target entry area |

### Old Entries Considered

| Path | Status | Internal imports before | Internal imports after | Package-facing status | Reason | Deletion condition |
|---|---|---:|---:|---|---|---|
| `orchestration/contextEngine.ts` | removed | 5 | 0 | no documented package export found | internal references now avoid the old entry path and owner implementation remains in `context/acquisition/engine.ts` | already met |
| `orchestration/planningRuntimeProductProjection.ts` | removed | 1 | 0 | no documented package export found | internal references now avoid the old entry path and owner implementation remains in `planning/runtime/projection.ts` | already met |

### Files Removed

- `packages/ts-shell/src/orchestration/contextEngine.ts`
- `packages/ts-shell/src/orchestration/planningRuntimeProductProjection.ts`

### Files Moved

- None.

### Tests Moved

- None.

### Imports Updated

- Context acquisition and planning runtime tests no longer import through `orchestration/contextEngine.ts`.
- Discovery ranking fixtures now use owner paths for context acquisition and planning runtime projection.
- A product-surface fixture no longer imports through `orchestration/contextEngine.ts`.
- One integrated-flow fixture no longer imports through `orchestration/contextEngine.ts` while preserving its scenario target path.

### Remaining Visible Debt

- Root `orchestration` remains the largest direct root and still contains many long test and planning-adjacent names outside this bounded cleanup.
- A few string-only scenario paths still mention old planning or context filenames as task data. They are not imports and should be reviewed only with behavior-specific ownership proof.

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

## SR016 Snapshot

Status: structure-only cleanup for unused export-only compatibility files and clear owner placement. Product behavior was preserved. No provider configuration, provider calls, fallback behavior, tool authority, command allowlists, edit/apply/write approval behavior, verification execution, repair execution, session schema, package scripts, build config, workflow coordinator behavior, or session manager behavior changed.

### Before Snapshot

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

Before measurements:

| Measurement | Before |
|---|---:|
| Root `orchestration` direct files | 377 |
| `orchestration/patchResult` direct files | 33 |
| Export-only compatibility files | 138 |
| Zero-internal-import compatibility files | 105 |
| Internally imported compatibility files | 33 |
| Tests outside owner folders | 184 |
| Long basenames in target areas | 244 |

### After Snapshot

Top crowded directories by direct TypeScript file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 348 |
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
| `context/acquisition/code` | 12 |

After measurements:

| Measurement | After |
|---|---:|
| Root `orchestration` direct files | 348 |
| `orchestration/patchResult` direct files | 33 |
| Export-only compatibility files | 127 |
| Zero-internal-import compatibility files | 94 |
| Internally imported compatibility files | 33 |
| Tests outside owner folders | 175 |
| Long basenames in target areas | 240 |

### Compatibility Files Considered

| Path | Status | Internal imports | Package-facing status | Reason | Deletion condition |
|---|---|---:|---|---|---|
| `orchestration/contextAcquisitionProjection.ts` | removed | 0 | no package export found | old export-only path after owner imports moved | already met |
| `orchestration/contextGraphPlanning.ts` | removed | 0 | no package export found | old export-only path after owner imports moved | already met |
| `orchestration/contextMemory.ts` | removed | 0 | no package export found | old export-only path after owner imports moved | already met |
| `orchestration/contextPlanningSummary.ts` | removed | 0 | no package export found | old export-only path after owner imports moved | already met |
| `orchestration/groundedPlanningProjection.ts` | removed | 0 | no package export found | old export-only path after owner imports moved | already met |
| `orchestration/planningMutationHandoffProjection.ts` | removed | 0 | no package export found | old export-only path after owner imports moved | already met |
| `orchestration/planningMutationProposalBridge.ts` | removed | 0 | no package export found | old export-only path after owner imports moved | already met |
| `orchestration/planningRuntime.ts` | removed | 0 | no package export found | old export-only path after owner imports moved | already met |
| `orchestration/planningRuntimeProductProposal.ts` | removed | 0 | no package export found | old export-only path after owner imports moved | already met |
| `orchestration/repoIntelligence.ts` | removed | 0 | no package export found | old export-only path after owner imports moved | already met |
| `orchestration/planQualityScore.ts` | removed | 0 | no package export found | old export-only path after owner imports moved | already met |
| `context/acquisition/index.ts` | kept | 1 | owner index | still imported internally | internal import count reaches 0 and no package-facing need is documented |
| `context/discovery/index.ts` | kept | 1 | owner index | still imported internally | internal import count reaches 0 and no package-facing need is documented |
| `context/memory/index.ts` | kept | 1 | owner index | still imported internally | internal import count reaches 0 and no package-facing need is documented |
| `planning/runtime/index.ts` | kept | 1 | owner index | still imported internally | internal import count reaches 0 and no package-facing need is documented |
| `planning/handoff/index.ts` | kept | 1 | owner index | still imported internally | internal import count reaches 0 and no package-facing need is documented |
| `result/projection/runtime.ts` | kept | 1 | owner projection export | still imported internally | internal import count reaches 0 and no package-facing need is documented |

### Owner Files Moved

- Code graph facts, query, trace, impact, staleness, and result projections moved to `context/acquisition/code/`.
- Plan quality model, gate, and result projection moved to `planning/quality/`.

### Tests Moved

Nine tests were moved beside owner code:

- 6 code graph tests under `context/acquisition/code/`.
- 3 plan quality tests under `planning/quality/`.

### Imports Updated

Internal imports were updated away from old root `orchestration` paths for moved code graph and plan quality owners. Touched consumers now import from:

- `context/acquisition/code/*`
- `planning/quality/*`

### Validation Evidence

- Focused moved-owner and consumer tests passed: 15 files, 49 tests.
- `npm run build -w packages/ts-shell` passed after import correction.
- `npm run verify:result-contract` passed after moving a projection that builds `CodingResult` output.

### Remaining Visible Debt

- `orchestration` remains the largest direct root.
- `orchestration/patchResult` stayed unchanged because remaining files are still central write execution or provider/permission/apply adjacency.
- Internally imported compatibility files remain at 33 and need import-by-import replacement before any removal.

## SR017 Internal Compatibility Surface Retirement

Status: structure-only cleanup for one old internally imported compatibility surface. Product behavior was preserved. No provider configuration, provider calls, fallback behavior, tool authority, command allowlists, edit/apply/write approval behavior, verification execution, repair execution, session schema, package scripts, build config, workflow coordinator behavior, or session manager behavior changed.

Inspection summary:

- Latest pressure report, export-only compatibility surfaces, internally imported compatibility surfaces, root `orchestration` files, owner folders, package-facing entry points, old-path imports, tests outside owner folders, direct file counts, and long basenames were inspected.
- The safe change was limited to `orchestration/verificationCommandPlan.ts`, which only re-exported `verification/command/plan.ts` and had one internal importer.
- Package-facing status was checked through `packages/ts-shell/package.json` and source entry-point searches. No documented package export for the removed deep file was found.

### Before Snapshot

Top crowded directories by direct TypeScript file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 348 |
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
| `verification/command` | 14 |

Before measurements:

| Measurement | Before |
|---|---:|
| Root `orchestration` direct files | 348 |
| Export-only compatibility files | 114 |
| Zero-internal-import compatibility files | 96 |
| Internally imported compatibility files | 18 |
| Tests outside owner folders | 2 |
| Long basenames in target areas | 199 |

### After Snapshot

Top crowded directories by direct TypeScript file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 347 |
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
| `verification/command` | 14 |

After measurements:

| Measurement | Before | After |
|---|---:|---:|
| Root `orchestration` direct files | 348 | 347 |
| Export-only compatibility files | 114 | 113 |
| Zero-internal-import compatibility files | 96 | 96 |
| Internally imported compatibility files | 18 | 17 |
| Tests outside owner folders | 2 | 2 |
| Long basenames in target areas | 199 | 199 |

### Compatibility Files Considered

| Path | Status | Internal imports before | Internal imports after | Package-facing status | Reason | Deletion condition |
|---|---|---:|---:|---|---|---|
| `orchestration/verificationCommandPlan.ts` | removed | 1 | 0 | no documented package export found | old export-only path after the internal importer moved to `verification/command/plan.ts` | already met |
| `context/acquisition/index.ts` | kept | 1 | 1 | owner index | still imported by the parent owner index | internal import count reaches 0 and the owner index is proven unnecessary |
| `context/discovery/index.ts` | kept | 1 | 1 | owner index | still imported by the parent owner index | internal import count reaches 0 and the owner index is proven unnecessary |
| `context/memory/index.ts` | kept | 1 | 1 | owner index | still imported by the parent owner index | internal import count reaches 0 and the owner index is proven unnecessary |
| `core/harness/browserEvalBenchmarkRunner.ts` | kept | 5 | 5 | compatibility export in harness area | used by harness tests and runner code; ownership needs a focused harness pass | internal imports move to the eval owner and package-facing safety is clear |
| `evidence/projection/continuation.ts` | kept | 1 | 1 | projection compatibility export | adjacent evidence compatibility chain needs a separate result-facing validation pass | internal imports move to the concrete projection and package-facing safety is clear |
| `planning/grounded/index.ts` | kept | 1 | 1 | owner index | still imported by the parent owner index | internal import count reaches 0 and the owner index is proven unnecessary |
| `planning/handoff/index.ts` | kept | 1 | 1 | owner index | still imported by the parent owner index | internal import count reaches 0 and the owner index is proven unnecessary |
| `planning/runtime/index.ts` | kept | 1 | 1 | owner index | still imported by the parent owner index | internal import count reaches 0 and the owner index is proven unnecessary |
| `provider/registry/index.ts` | kept | 1 | 1 | owner index | still imported by the parent owner index | internal import count reaches 0 and the owner index is proven unnecessary |
| `provider/request/index.ts` | kept | 1 | 1 | owner index | still imported by the parent owner index | internal import count reaches 0 and the owner index is proven unnecessary |
| `provider/response/index.ts` | kept | 1 | 1 | owner index | still imported by the parent owner index | internal import count reaches 0 and the owner index is proven unnecessary |
| `repair/handoff/continuationPlanning.ts` | kept | 1 | 1 | compatibility export in repair handoff | root repair compatibility chain should be simplified in a repair-only pass | root compatibility points directly to concrete owner and package-facing safety is clear |
| `repair/handoff/reopen.ts` | kept | 1 | 1 | compatibility export in repair handoff | root repair compatibility chain should be simplified in a repair-only pass | root compatibility points directly to concrete owner and package-facing safety is clear |
| `result/projection/runtime.ts` | kept | 1 | 1 | projection compatibility export | result-facing compatibility should move with result contract validation | internal imports move to the workflow projection and package-facing safety is clear |
| `tools/dispatch/index.ts` | kept | 1 | 1 | owner index | still imported by the parent owner index | internal import count reaches 0 and the owner index is proven unnecessary |
| `tools/policy/index.ts` | kept | 1 | 1 | owner index | still imported by the parent owner index | internal import count reaches 0 and the owner index is proven unnecessary |
| `tools/result/index.ts` | kept | 1 | 1 | owner index | still imported by the parent owner index | internal import count reaches 0 and the owner index is proven unnecessary |

### Files Removed

- `packages/ts-shell/src/orchestration/verificationCommandPlan.ts`

### Files Moved

- None.

### Tests Moved

- None.

### Imports Updated

- `planning/runtime/engine.ts` now imports verification command planning from `verification/command/plan.ts`.

### Remaining Visible Debt

- `orchestration` remains the largest direct root.
- Remaining internally imported compatibility surfaces are mostly owner indexes, harness compatibility, repair handoff compatibility, and result/evidence projection compatibility.
- Result/evidence compatibility should be handled only with result contract validation because those surfaces are output-facing.

## SR018 Repair Result Compatibility Trim

Status: structure-only cleanup for repair handoff, evidence projection, and result projection compatibility surfaces. Product behavior was preserved. No output semantics, result truthfulness, provider configuration, provider calls, fallback behavior, tool authority, command allowlists, edit/apply/write approval behavior, verification execution, repair execution, session schema, package scripts, build config, workflow coordinator behavior, or session manager behavior changed.

Inspection summary:

- Latest pressure report, repair handoff and flow owners, result projection owners, evidence projection owners, adjacent verification result owners, export-only files, internal imports, package-facing entry points, tests in touched owner areas, direct file counts, and long basenames were inspected.
- The safe change was limited to one-line compatibility exports that already pointed at concrete owner files through an extra intermediate export.
- `packages/ts-shell/package.json` and source entry-point searches showed no documented package export for the removed intermediate deep files.

### Before Snapshot

Before measurements:

| Measurement | Before |
|---|---:|
| Export-only compatibility files | 113 |
| Zero-internal-import compatibility files | 96 |
| Internally imported compatibility files | 17 |
| `repair/handoff` direct files | 4 |
| `repair/flow` direct files | 4 |
| `result/projection` direct files | 1 |
| `evidence/projection` direct files | 2 |
| `verification/result` direct files | 3 |
| Tests outside owner folders for touched owners | 12 |
| Long basenames in target areas | 2 |

Target export-only compatibility files before:

| Path | Internal imports |
|---|---:|
| `evidence/projection/continuation.ts` | 1 |
| `repair/handoff/continuationPlanning.ts` | 1 |
| `repair/handoff/reopen.ts` | 1 |
| `result/projection/runtime.ts` | 1 |
| `verification/result/mutationVerificationProjection.ts` | 0 |

### After Snapshot

After measurements:

| Measurement | Before | After |
|---|---:|---:|
| Export-only compatibility files | 113 | 109 |
| Zero-internal-import compatibility files | 96 | 96 |
| Internally imported compatibility files | 17 | 13 |
| `repair/handoff` direct files | 4 | 2 |
| `repair/flow` direct files | 4 | 4 |
| `result/projection` direct files | 1 | 0 |
| `evidence/projection` direct files | 2 | 1 |
| `verification/result` direct files | 3 | 3 |
| Tests outside owner folders for touched owners | 12 | 12 |
| Long basenames in target areas | 2 | 2 |

Target export-only compatibility files after:

| Path | Internal imports | Status |
|---|---:|---|
| `verification/result/mutationVerificationProjection.ts` | 0 | kept |

### Compatibility Files Considered

| Path | Status | Internal imports before | Internal imports after | Package-facing status | Reason | Deletion condition |
|---|---|---:|---:|---|---|---|
| `evidence/projection/continuation.ts` | removed | 1 | 0 | no documented package export found | root evidence compatibility now exports directly from `evidence/projection/repair/continuation.ts` | already met |
| `repair/handoff/continuationPlanning.ts` | removed | 1 | 0 | no documented package export found | root repair compatibility now exports directly from `repair/handoff/planning/continuation.ts` | already met |
| `repair/handoff/reopen.ts` | removed | 1 | 0 | no documented package export found | root repair compatibility now exports directly from `repair/handoff/state/reopen.ts` | already met |
| `result/projection/runtime.ts` | removed | 1 | 0 | no documented package export found | root result compatibility now exports directly from `result/projection/workflow/runtime.ts` | already met |
| `verification/result/mutationVerificationProjection.ts` | kept | 0 | 0 | verification result compatibility export | adjacent verification result surface was not touched | remove only after verification result ownership and package-facing safety are reviewed |

### Files Removed

- `packages/ts-shell/src/evidence/projection/continuation.ts`
- `packages/ts-shell/src/repair/handoff/continuationPlanning.ts`
- `packages/ts-shell/src/repair/handoff/reopen.ts`
- `packages/ts-shell/src/result/projection/runtime.ts`

### Files Moved

- None.

### Tests Moved

- None.

### Imports Updated

- `evidence/continuationTransformEvidence.ts` now exports from `evidence/projection/repair/continuation.ts`.
- `repair/repairContinuationPlanning.ts` now exports from `repair/handoff/planning/continuation.ts`.
- `repair/degradedReopenPlanning.ts` now exports from `repair/handoff/state/reopen.ts`.
- `result/workflowRuntimeProjection.ts` now exports from `result/projection/workflow/runtime.ts`.

### Remaining Visible Debt

- Remaining internally imported compatibility files are outside the repair/result/evidence target area measured here.
- `verification/result/mutationVerificationProjection.ts` remains a zero-internal-import compatibility export and needs a narrow verification result safety check before deletion.
- Result and evidence projection surfaces remain output-facing; any further cleanup there should keep the result contract gate.

## Verification Result Compatibility Trim

Status: structure-only cleanup for verification result compatibility. Product behavior was preserved. No result truthfulness, provider configuration, provider calls, fallback behavior, tool authority, command allowlists, edit/apply/write approval behavior, verification execution, repair execution, session schema, package scripts, build config, workflow coordinator behavior, or session manager behavior changed.

Inspection summary:

- Latest pressure report, verification result owner files, adjacent verification command owners, adjacent result and evidence projection owners, adjacent repair handoff owners, export-only files, internal imports, package-facing entry points, tests in touched owner areas, direct file counts, and long basenames were inspected.
- `verification/result/mutationVerificationProjection.ts` was a one-line export to `verification/result/projection/mutation.ts` with zero internal imports.
- `packages/ts-shell/package.json` and source entry-point searches showed no documented package export for the removed deep file.

### Before Snapshot

Before measurements:

| Measurement | Before |
|---|---:|
| Export-only compatibility files | 109 |
| Zero-internal-import compatibility files | 96 |
| Internally imported compatibility files | 13 |
| `verification/result` direct files | 3 |
| `verification/command` direct files | 14 |
| `result/projection` direct files | 0 |
| `evidence/projection` direct files | 1 |
| `repair/handoff` direct files | 2 |
| Root `orchestration` direct files | 347 |
| Tests outside owner folders for touched owners | 9 |
| Long basenames in target areas | 2 |

Target export-only compatibility files before:

| Path | Internal imports |
|---|---:|
| `verification/result/mutationVerificationProjection.ts` | 0 |

### After Snapshot

After measurements:

| Measurement | Before | After |
|---|---:|---:|
| Export-only compatibility files | 109 | 108 |
| Zero-internal-import compatibility files | 96 | 95 |
| Internally imported compatibility files | 13 | 13 |
| `verification/result` direct files | 3 | 2 |
| `verification/command` direct files | 14 | 14 |
| `result/projection` direct files | 0 | 0 |
| `evidence/projection` direct files | 1 | 1 |
| `repair/handoff` direct files | 2 | 2 |
| Root `orchestration` direct files | 347 | 347 |
| Tests outside owner folders for touched owners | 9 | 9 |
| Long basenames in target areas | 2 | 2 |

Target export-only compatibility files after:

| Path | Internal imports | Status |
|---|---:|---|
| none | 0 | none remain in the verification result target area |

### Compatibility Files Considered

| Path | Status | Internal imports before | Internal imports after | Package-facing status | Reason | Deletion condition |
|---|---|---:|---:|---|---|---|
| `verification/result/mutationVerificationProjection.ts` | removed | 0 | 0 | no documented package export found | product imports already use `verification/result/projection/mutation.ts` | already met |

### Files Removed

- `packages/ts-shell/src/verification/result/mutationVerificationProjection.ts`

### Files Moved

- None.

### Tests Moved

- None.

### Imports Updated

- None required; current product imports already target `verification/result/projection/mutation.ts`.

### Remaining Visible Debt

- Remaining internally imported compatibility files are outside the verification result target area measured here.
- Remaining cleanup should continue one owner area at a time and keep result contract validation whenever output-facing projection code is touched.

## Harness Compatibility Trim

Status: structure-only cleanup for the browser eval harness compatibility export. Product behavior was preserved. No result truthfulness, provider configuration, provider calls, fallback behavior, tool authority, command allowlists, edit/apply/write approval behavior, verification execution, repair execution, session schema, package scripts, build config, workflow coordinator behavior, or session manager behavior changed.

Inspection summary:

- Latest pressure report, remaining internally imported compatibility files, harness owner files, eval-adjacent benchmark owner files, result adapters, result and evidence projections, shell result assembly files, package-facing entry points, old-path imports, tests in touched harness owners, direct file counts, and long basenames were inspected.
- `core/harness/browserEvalBenchmarkRunner.ts` was a one-line export to `eval/browser/benchmarkRunner.ts` with five internal harness importers.
- `packages/ts-shell/package.json` and source entry-point searches showed no documented package export for the removed deep file.

### Before Snapshot

Before measurements:

| Measurement | Before |
|---|---:|
| Export-only compatibility files | 108 |
| Zero-internal-import compatibility files | 95 |
| Internally imported compatibility files | 13 |
| Root `orchestration` direct files | 347 |
| `core/harness` direct files | 91 |
| `eval/browser` direct files | 3 |
| `result` direct files | 2 |
| `result/projection` direct files | 0 |
| `evidence` direct files | 6 |
| `evidence/projection` direct files | 1 |
| `result/projection/shell` direct files | 3 |
| Tests importing old harness path | 4 |
| Long basenames in target areas | 48 |

Target internally imported compatibility files before:

| Path | Internal imports | Importers |
|---|---:|---|
| `core/harness/browserEvalBenchmarkRunner.ts` | 5 | `core/harness/browserPlaywrightAdapterSpikeScenarios.test.ts`, `core/harness/browserRuntimeCapabilityScenarioExamples.test.ts`, `core/harness/browserRuntimeGauntletScenarios.test.ts`, `core/harness/pwEval.ts`, `core/harness/pwRuntime.test.ts` |

### After Snapshot

After measurements:

| Measurement | Before | After |
|---|---:|---:|
| Export-only compatibility files | 108 | 107 |
| Zero-internal-import compatibility files | 95 | 95 |
| Internally imported compatibility files | 13 | 12 |
| Root `orchestration` direct files | 347 | 347 |
| `core/harness` direct files | 91 | 90 |
| `eval/browser` direct files | 3 | 3 |
| `result` direct files | 2 | 2 |
| `result/projection` direct files | 0 | 0 |
| `evidence` direct files | 6 | 6 |
| `evidence/projection` direct files | 1 | 1 |
| `result/projection/shell` direct files | 3 | 3 |
| Tests importing old harness path | 4 | 0 |
| Long basenames in target areas | 48 | 48 |

Target internally imported compatibility files after:

| Path | Internal imports | Status |
|---|---:|---|
| none | 0 | none remain in the harness target area |

### Compatibility Files Considered

| Path | Status | Internal imports before | Internal imports after | Package-facing status | Reason | Deletion condition |
|---|---|---:|---:|---|---|---|
| `core/harness/browserEvalBenchmarkRunner.ts` | removed | 5 | 0 | no documented package export found | internal harness importers now target `eval/browser/benchmarkRunner.ts` directly | already met |
| `result/workflowRuntimeProjection.ts` | kept | 0 | 0 | result compatibility export | no internal import pressure in this bounded cleanup | remove only after result-facing package safety is reviewed |
| `result/sessionResultTruthAdapter.ts` | kept | 0 | 0 | result compatibility export | no internal import pressure in this bounded cleanup | remove only after result-facing package safety is reviewed |
| `evidence/continuationTransformEvidence.ts` | kept | 0 | 0 | evidence compatibility export | no internal import pressure in this bounded cleanup | remove only after evidence-facing package safety is reviewed |
| `evidence/runtimeSavePoint.ts` | kept | 0 | 0 | evidence compatibility export | no internal import pressure in this bounded cleanup | remove only after evidence-facing package safety is reviewed |

### Files Removed

- `packages/ts-shell/src/core/harness/browserEvalBenchmarkRunner.ts`

### Files Moved

- None.

### Tests Moved

- None.

### Imports Updated

- `core/harness/pwEval.ts`
- `core/harness/browserPlaywrightAdapterSpikeScenarios.test.ts`
- `core/harness/browserRuntimeCapabilityScenarioExamples.test.ts`
- `core/harness/browserRuntimeGauntletScenarios.test.ts`
- `core/harness/pwRuntime.test.ts`

All now import `runBrowserEvalBenchmark` from `eval/browser/benchmarkRunner.ts`.

### Remaining Visible Debt

- Remaining internally imported compatibility files are owner indexes under context, planning, provider, and tools.
- Result and evidence root compatibility exports remain zero-internal-import compatibility surfaces and should be reviewed only with package-facing safety and result contract validation where needed.

## Legacy Entry Cleanup

Status: structure-only cleanup for export-only legacy entry files. Product behavior was preserved. No result truthfulness, provider configuration, provider calls, fallback behavior, tool authority, command allowlists, edit/apply/write approval behavior, verification execution, repair execution, session schema, CLI behavior, package scripts, build config, workflow coordinator behavior, or session manager behavior changed.

Initial status:

- `git status --short --branch` reported `## main...origin/main`.
- No pre-edit push was attempted because the branch was not ahead.
- The worktree was clean before editing.

Inspection summary:

- Latest pressure report, export-only files, package metadata, documented entry references, root `orchestration` files, context/planning/provider/tools/edit/result/evidence/verification/repair/session/core/runtime owner folders, internal imports, script/test path mentions, direct file counts, crowded directories, and long basenames were inspected.
- Serena targeted inspection confirmed sampled legacy entry files have no symbol bodies and only re-export owner files.
- `packages/ts-shell/package.json` exposes `dist`, `src`, and a CLI binary, with no documented package export for the removed deep files.
- Targeted script and test searches found no real module imports to the removed paths.

### Before Snapshot

Before measurements:

| Measurement | Before |
|---|---:|
| Export-only compatibility files | 93 |
| Zero-internal-import compatibility files | 92 |
| Internally imported compatibility files | 1 |
| Root `orchestration` direct files | 345 |
| `provider` direct files | 4 |
| `repair` direct files | 6 |
| `tools` direct files | 11 |
| Tests outside owner folders for touched owners | 6 |
| Script/test real-module imports to removed paths | 0 |
| Long basenames in target areas | 134 |

Top crowded directories before:

| Directory | Direct files |
|---|---:|
| `orchestration` | 345 |
| `core/context` | 172 |
| `core/harness` | 90 |
| `session` | 50 |
| `core/shell` | 49 |
| `entrypoints` | 46 |
| `core/context/memory` | 39 |
| `core/context/sidebar` | 34 |
| `orchestration/patchResult` | 33 |
| `session/continuation` | 33 |

### After Snapshot

After measurements:

| Measurement | Before | After |
|---|---:|---:|
| Export-only compatibility files | 93 | 83 |
| Zero-internal-import compatibility files | 92 | 82 |
| Internally imported compatibility files | 1 | 1 |
| Root `orchestration` direct files | 345 | 344 |
| `provider` direct files | 4 | 1 |
| `repair` direct files | 6 | 0 |
| `tools` direct files | 11 | 11 |
| Tests outside owner folders for touched owners | 6 | 6 |
| Script/test real-module imports to removed paths | 0 | 0 |
| Long basenames in target areas | 134 | 134 |

Top crowded directories after:

| Directory | Direct files |
|---|---:|
| `orchestration` | 344 |
| `core/context` | 172 |
| `core/harness` | 90 |
| `session` | 50 |
| `core/shell` | 49 |
| `entrypoints` | 46 |
| `core/context/memory` | 39 |
| `core/context/sidebar` | 34 |
| `orchestration/patchResult` | 33 |
| `session/continuation` | 33 |

### Compatibility Files Considered

| Class | Count before | Count after | Status | Reason | Deletion condition |
|---|---:|---:|---|---|---|
| Removed zero-internal legacy entries | 10 | 0 | removed | no internal imports, no package export, no documented public entry need, no script/test real-module import | already met |
| Internally imported legacy entry | 1 | 1 | kept | `tools/registry.ts` is still imported by `tools/registry-rust-bridge.test.ts` | update the test to owner path and recheck package-facing safety |
| Owner root indexes | 4 | 4 | kept | root owner aggregation remains clearer than scattered caller imports | remove only after package-facing safety and owner index need are reviewed |
| Protected or output-facing entries | 38 | 38 | kept | session/runtime execution/edit/result/evidence surfaces need narrower validation because they touch protected boundaries or terminal/result-facing projections | remove only with focused owner review and required result contract validation where applicable |
| Product and presentation facades | 11 | 11 | kept | caller-facing facade safety is unclear in this cleanup | remove only after facade consumers and package-facing safety are proven disposable |
| Other zero-internal owner shims | 29 | 29 | kept | no internal import pressure in this cleanup | remove in bounded owner batches after script/test/doc entry checks |

Removed files:

- `packages/ts-shell/src/orchestration/contextAwareProviderPrompt.ts`
- `packages/ts-shell/src/provider/modelResponseBoundary.ts`
- `packages/ts-shell/src/provider/providerDraftStage.ts`
- `packages/ts-shell/src/provider/providerRegistry.ts`
- `packages/ts-shell/src/repair/crossFileRepairPlanning.ts`
- `packages/ts-shell/src/repair/degradedReopenPlanning.ts`
- `packages/ts-shell/src/repair/groundedAnswerRepair.ts`
- `packages/ts-shell/src/repair/repairContinuationPlanning.ts`
- `packages/ts-shell/src/repair/repairFacade.ts`
- `packages/ts-shell/src/repair/singleFileRepairPlanning.ts`

Kept notable files:

| Path | Reason | Deletion condition |
|---|---|---|
| `packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts` | historical scripts still import this as a real module path | update or retire those script imports, then recheck package-facing safety |
| `packages/ts-shell/src/tools/registry.ts` | still has one internal test import | update the test to `core/tools/registry.ts`, then recheck package-facing safety |
| `packages/ts-shell/src/model-adapters/providerFetch.ts` | provider fetch/auth adjacency is protected | review only under explicit provider boundary scope |
| `packages/ts-shell/src/runtime/execution/*` | execution boundary compatibility is protected | review only under explicit execution boundary scope |
| `packages/ts-shell/src/session/*` | session durability and schema adjacency is protected | review only under explicit session scope |
| `packages/ts-shell/src/result/*` and `packages/ts-shell/src/evidence/*` | result and evidence projections are output-facing | review with result contract validation |

Stale strings updated:

- None. Historical/scenario strings and script entries that still name existing tests or kept real module paths were left unchanged.

### Remaining Visible Debt

- `orchestration` remains the largest direct root.
- One export-only compatibility file still has an internal import: `tools/registry.ts`.
- Many zero-internal entries remain because their package-facing or protected-boundary safety needs narrower owner review.

### Recommended Next Step

Review `tools/registry.ts` and its remaining test import as the next bounded compatibility cleanup.
