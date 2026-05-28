# Validation Plan

This audit route requires only artifact existence, `git diff --check`, and `git status --short --branch`. No build or tests are required because runtime code is not changed.

Future implementation routes must run focused gates based on touched owners.

## Always For Implementation Routes

- `npm test -w packages/ts-shell -- src/planning/workflowTaskPlan.test.ts`
- Focused tests for every new module added in the route.
- `npm run build -w packages/ts-shell`
- `git diff --check`
- `git status --short --branch`

## Route-Specific Gates

| Route | Required focused validation |
|---|---|
| Intent and target planning split | `src/planning/workflowTaskPlan.test.ts`, `src/planning/promptTargetProjection.test.ts`, new `workflowIntentSignals` and `workflowTargetPlanning` tests, targeted runMvp read/edit/command intent cases. |
| Inline continuity and session fact adapter | New `src/session/inlineContinuityContext.test.ts`, `src/session/sessionResumeContextBuilder.test.ts`, `src/session/stoppedSessionContinuity.test.ts`, `src/session/continuationEvidenceParity.test.ts`, `src/planning/workflowTaskPlan.test.ts`. |
| Context and grounded read planning | New context planning tests, `src/context/readWindowContinuation.test.ts`, `src/context/readRuntimeStage.test.ts`, `src/context/readDeliveryProjection.test.ts`, `src/context/inspectFilesStage.test.ts`, `src/context/repoExplainRuntimeStage.test.ts` as touched. |
| Edit intent, mutation scope, and single-file repair planning | New edit/repair planning tests, `src/edit/mutationInstructionPlanner.test.ts`, `src/edit/mutationTargetSelection.test.ts`, `src/edit/mutationRuntimeStage.test.ts` as touched, `src/repair/groundedAnswerRepair.test.ts`, targeted runMvp edit/write cases. |
| Repair, cross-file, and degraded reopen planning | `src/repair/crossFileRepairPlanning.test.ts`, new degraded reopen tests, `src/repair/crossFileRepairStage.test.ts`, `src/evidence/continuationTransformEvidence.test.ts`, continuation/cross-file runMvp cases. |
| Verification and command planning | `src/policy/commandIntentPolicy.test.ts`, `src/verification/commandStage.test.ts`, `src/verification/commandVerificationStage.test.ts`, `src/verification/verificationCommandPlan.test.ts`, new verify continuation planning tests. |
| Browser intent planning and residue cleanup | Browser planning focused tests if a browser owner is created, `src/planning/workflowTaskPlan.test.ts`, build proof for any deletion. |

## Broad Gates When Touched

- Full `npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts` when branch order or plan outputs change broadly.
- `npm test -w packages/ts-shell -- src/runtime/workflowExecutionCoordinator.test.ts` when runtime imports or handoff fields change.
- `npm run verify:result-contract` when any route touches result projection, evidence truth, verification status, or terminal classification.
- `npm run verify:route221-anti-false-success-gate` when any route touches evidence/result truth or fields consumed by that truth surface.
- Import scan for product runtime after extraction:
  - `rg -n "(\\.\\./)+docs|(\\.\\./)+scripts|dev-history|product_architecture_reset_routes|product-architecture-reset" packages/ts-shell/src`

## No Live Provider

Do not run live provider gates for these planning extractions unless a later route explicitly opens that boundary. None of the proposed routes should read `/home/wang/.private-agents-real`.

## Baseline Discipline

If a focused or broad test fails during a future implementation route, classify it before changing code or tests:

- product behavior drift
- stale expectation
- harness/setup drift
- obsolete scenario
- future capability expectation
- environment/flaky issue

Do not make extraction pass by weakening false-success, redaction, not-proven, partial, blocked, skipped, no-provider, no-write, or target boundary assertions.
