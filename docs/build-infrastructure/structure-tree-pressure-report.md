# Structure Tree Pressure Report

Status: current structure pressure report for SR008.

## Scope

This report measures visible tree pressure under `packages/ts-shell/src` for structure-only cleanup in TypeScript owner domains. Product behavior is preserved. Old import paths remain export-only compatibility entries where downstream use is not proven disposable.

## Before Snapshot

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

Target direct counts before editing:

| Directory | Direct files before | Direct tests before |
|---|---:|---:|
| `orchestration` | 404 | 173 |
| `orchestration/patchResult` | 130 | 65 |
| `core` | 0 | 0 |
| `core/shell` | 49 | 23 |
| `core/tools` | 19 | 8 |
| `core/query` | 18 | 6 |
| `core/context` | 356 | 97 |
| `session` | 61 | 23 |
| `result` | 2 | 0 |
| `evidence` | 6 | 1 |
| `verification` | 17 | 6 |
| `repair` | 13 | 5 |
| `edit` | 24 | 11 |

Other before measurements:

- Tests still outside owner folders in target areas: 353.
- Export-only compatibility files: 84.
- Compatibility files with zero internal imports: 70.
- Compatibility files still imported internally: 14.
- Files with long basenames in target areas: 249.

## After Snapshot

Top crowded directories by direct file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 404 |
| `core/context` | 356 |
| `orchestration/patchResult` | 130 |
| `core/harness` | 92 |
| `session` | 50 |
| `core/shell` | 49 |
| `entrypoints` | 46 |
| `session/continuation` | 33 |
| `context` | 28 |
| `core/commands` | 26 |
| `runtime/loop` | 20 |
| `edit` | 19 |
| `core/tools` | 19 |
| `session/store` | 19 |
| `core/query` | 18 |
| `session/recovery` | 16 |
| `orchestration/patchRecovery` | 16 |
| `verification` | 16 |
| `turn` | 15 |
| `repair` | 10 |

Target direct counts after editing:

| Directory | Direct files after | Direct tests after |
|---|---:|---:|
| `orchestration` | 404 | 173 |
| `orchestration/patchResult` | 130 | 65 |
| `core` | 0 | 0 |
| `core/shell` | 49 | 23 |
| `core/tools` | 19 | 8 |
| `core/query` | 18 | 6 |
| `core/context` | 356 | 97 |
| `session` | 50 | 12 |
| `result` | 2 | 0 |
| `evidence` | 6 | 1 |
| `verification` | 16 | 5 |
| `repair` | 10 | 2 |
| `edit` | 19 | 6 |

Other after measurements:

- Tests still outside owner folders in target areas: 333.
- Export-only compatibility files: 105.
- Compatibility files with zero internal imports: 91.
- Compatibility files still imported internally: 14.
- Files with long basenames in target areas: 249.

## Directories Improved

- `session`: 61 to 50 direct files; 11 tests moved into owner folders.
- `edit`: 24 to 19 direct files; 5 tests moved into owner folders.
- `repair`: 13 to 10 direct files; 3 tests moved into owner folders.
- `verification`: 17 to 16 direct files; 1 test moved into an owner folder.

## Tests Moved

- `session/approvalAuditProjection.test.ts` -> `session/approval/auditProjection.test.ts`
- `session/approvalMemoryCodec.test.ts` -> `session/approval/memoryCodec.test.ts`
- `session/compactContinuitySummary.test.ts` -> `session/continuation/compactSummary.test.ts`
- `session/compactRetentionPlanner.test.ts` -> `session/continuation/retentionPlanner.test.ts`
- `session/durableStatusProjection.test.ts` -> `session/lifecycle/durableStatusProjection.test.ts`
- `session/projectBindingPolicy.test.ts` -> `session/store/projectBindingPolicy.test.ts`
- `session/projectRootRebaseProjection.test.ts` -> `session/continuation/projectRootRebaseProjection.test.ts`
- `session/sessionPresentationFacts.test.ts` -> `session/presentation/facts.test.ts`
- `session/sessionResumeContextBuilder.test.ts` -> `session/recovery/resumeContextBuilder.test.ts`
- `session/stoppedSessionContinuity.test.ts` -> `session/continuation/stoppedSessionContinuity.test.ts`
- `session/turnContinuationFacts.test.ts` -> `session/continuation/turnFacts.test.ts`
- `edit/mutationInstructionPlanner.test.ts` -> `edit/planning/instructionPlanner.test.ts`
- `edit/mutationIntentPlanning.test.ts` -> `edit/planning/intent.test.ts`
- `edit/mutationScopePlanning.test.ts` -> `edit/planning/scope.test.ts`
- `edit/mutationTargetSelection.test.ts` -> `edit/planning/targetSelection.test.ts`
- `edit/workspaceReadPolicy.test.ts` -> `edit/workspace/readPolicy.test.ts`
- `repair/crossFileRepairPlanning.test.ts` -> `repair/flow/crossFilePlanning.test.ts`
- `repair/groundedAnswerRepair.test.ts` -> `repair/proposal/groundedAnswer.test.ts`
- `repair/repairContinuationPlanning.test.ts` -> `repair/handoff/continuationPlanning.test.ts`
- `verification/commandVerificationStage.test.ts` -> `verification/command/verificationStage.test.ts`

## Owner Files Moved

- `session/approvalAuditProjection.ts` -> `session/approval/auditProjection.ts`
- `session/approvalMemoryCodec.ts` -> `session/approval/memoryCodec.ts`
- `session/compactContinuitySummary.ts` -> `session/continuation/compactSummary.ts`
- `session/compactRetentionPlanner.ts` -> `session/continuation/retentionPlanner.ts`
- `session/compactSummaryFormatter.ts` -> `session/continuation/summaryFormatter.ts`
- `session/durableStatusProjection.ts` -> `session/lifecycle/durableStatusProjection.ts`
- `session/projectBindingPolicy.ts` -> `session/store/projectBindingPolicy.ts`
- `session/projectRootRebaseProjection.ts` -> `session/continuation/projectRootRebaseProjection.ts`
- `session/sessionPresentationFacts.ts` -> `session/presentation/facts.ts`
- `session/sessionResumeContextBuilder.ts` -> `session/recovery/resumeContextBuilder.ts`
- `session/stoppedSessionContinuity.ts` -> `session/continuation/stoppedSessionContinuity.ts`
- `session/turnContinuationFacts.ts` -> `session/continuation/turnFacts.ts`
- `edit/mutationInstructionPlanner.ts` -> `edit/planning/instructionPlanner.ts`
- `edit/mutationIntentPlanning.ts` -> `edit/planning/intent.ts`
- `edit/mutationScopePlanning.ts` -> `edit/planning/scope.ts`
- `edit/mutationTargetSelection.ts` -> `edit/planning/targetSelection.ts`
- `edit/workspaceReadPolicy.ts` -> `edit/workspace/readPolicy.ts`
- `repair/crossFileRepairPlanning.ts` -> `repair/flow/crossFilePlanning.ts`
- `repair/groundedAnswerRepair.ts` -> `repair/proposal/groundedAnswer.ts`
- `repair/repairContinuationPlanning.ts` -> `repair/handoff/continuationPlanning.ts`
- `verification/commandVerificationStage.ts` -> `verification/command/verificationStage.ts`

## Compatibility Status

Removed compatibility files: none.

The following old paths are kept as export-only entries. Deletion condition for each: remove only after downstream compatibility is proven disposable and no package consumer imports the old path.

| Path | Internal imports |
|---|---:|
| `session/approvalAuditProjection.ts` | 0 |
| `session/approvalMemoryCodec.ts` | 0 |
| `session/compactContinuitySummary.ts` | 0 |
| `session/compactRetentionPlanner.ts` | 0 |
| `session/compactSummaryFormatter.ts` | 0 |
| `session/durableStatusProjection.ts` | 0 |
| `session/projectBindingPolicy.ts` | 0 |
| `session/projectRootRebaseProjection.ts` | 0 |
| `session/sessionPresentationFacts.ts` | 0 |
| `session/sessionResumeContextBuilder.ts` | 0 |
| `session/stoppedSessionContinuity.ts` | 0 |
| `session/turnContinuationFacts.ts` | 0 |
| `edit/mutationInstructionPlanner.ts` | 0 |
| `edit/mutationIntentPlanning.ts` | 0 |
| `edit/mutationScopePlanning.ts` | 0 |
| `edit/mutationTargetSelection.ts` | 0 |
| `edit/workspaceReadPolicy.ts` | 0 |
| `repair/crossFileRepairPlanning.ts` | 0 |
| `repair/groundedAnswerRepair.ts` | 0 |
| `repair/repairContinuationPlanning.ts` | 0 |
| `verification/commandVerificationStage.ts` | 0 |

Previously kept zero-import compatibility entries remain under the same deletion condition.

## Imports Updated

Internal imports were moved away from the old paths for touched owner domains and tests. The active paths now target:

- `session/approval/*`
- `session/continuation/*`
- `session/lifecycle/*`
- `session/presentation/*`
- `session/recovery/*`
- `session/store/projectBindingPolicy.js`
- `edit/planning/*`
- `edit/workspace/readPolicy.js`
- `repair/flow/crossFilePlanning.js`
- `repair/proposal/groundedAnswer.js`
- `repair/handoff/continuationPlanning.js`
- `verification/command/verificationStage.js`

## Remaining Visible Debt

- `orchestration`, `core/context`, and `orchestration/patchResult` remain the most crowded directories.
- `core/shell`, `core/tools`, `core/query`, and `core/context` still have root tests that need owner review before movement.
- Compatibility file count increased because old paths were preserved.
- Long visible basenames did not improve in this pass; many are in high-risk write and provider-adjacent areas.

## Validation Evidence

- Focused moved-owner tests passed: 24 files, 105 tests.
- Build, result contract check if required, diff check, status, commit, and push are recorded in the final response for the run that updates this report.

## Recommended Next Step

Audit `core/context` for clearly separable browser, compact, project memory, sidebar, and startup owner clusters, then move only the safe test-and-owner pairs with focused validation.
