# runMvp Extraction Targets

Each target below is a concrete future implementation destination. Some
directories do not exist yet; creating them is part of the future extraction
routes, not this planning route.

## Target 1: Turn Entrypoint And Runtime Environment

Destination files:

- `packages/ts-shell/src/turn/integratedTurnEntrypoint.ts`
- `packages/ts-shell/src/turn/integratedTurnCoordinator.ts`
- `packages/ts-shell/src/turn/turnRuntimeEnvironment.ts`

Move:

- public run/stream orchestration setup
- `createIntegratedRunner` role dispatch
- environment assembly for config, MCP, browser status, sandbox, dispatcher
- orchestrator invocation and metric recording

Keep compatible:

- `runMvpIntegratedFlow`
- `streamMvpIntegratedFlow`
- `MvpIntegratedFlowOptions`
- `ApplyPatchRuntimeRouteOptions`

Validation:

- `npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts`
- `npm test -w packages/ts-shell -- src/turn/turnFacade.test.ts`
- `npm run verify:product:cli-entry` if CLI/session turn output changes
- `npm run build -w packages/ts-shell`

## Target 2: Planning Intent And Workflow Plan

Destination files:

- `packages/ts-shell/src/planning/workflowIntentSignals.ts`
- `packages/ts-shell/src/planning/workflowTaskPlan.ts`
- `packages/ts-shell/src/planning/promptTargetProjection.ts`
- `packages/ts-shell/src/policy/commandIntentPolicy.ts`

Move:

- `WorkflowTaskIntentSignals`
- `extractWorkflowTaskIntentSignals`
- `buildWorkflowTaskPlan` in slices by output branch
- prompt path, explicit execution, unsupported command, read/write/verify cue
  classifiers

Keep compatible:

- `WorkflowTaskPlan` contract remains import-compatible through
  `orchestration/workflowTaskPlanner.ts` until callers migrate.

Validation:

- full runMvp suite
- focused route tests for read/diagnosis, command blockers, target resolution,
  planning runtime no-write handoff, and task lifecycle activation

## Target 3: Continuation And Session State Planning

Destination files:

- `packages/ts-shell/src/session/continuationPromptState.ts`
- `packages/ts-shell/src/session/turnContinuationFacts.ts`
- `packages/ts-shell/src/repair/repairContinuationPlanning.ts`
- `packages/ts-shell/src/verification/verifyContinuationPlanning.ts`

Move:

- inline continuity parsing
- restored state merge callers
- read/verify/action-result seed carryover logic
- verify continuation object resolution
- repair continuation object resolution
- migration-like root rebase decisions

Keep compatible:

- Existing session projection modules remain the durable session source.
- New modules consume `ContinuityStateLike` and emit plan facts, not terminal
  verdicts.

Validation:

- runMvp continuation cases
- `sessionResultParity.test.ts`
- `continuationEvidenceParity.test.ts`
- `stoppedSessionContinuity.test.ts`

## Target 4: Context Read And Repo Explain Stages

Destination files:

- `packages/ts-shell/src/context/readDeliveryProjection.ts`
- `packages/ts-shell/src/context/readWindowContinuation.ts`
- `packages/ts-shell/src/context/repoExplainStage.ts`
- `packages/ts-shell/src/turn/stages/contextReadStage.ts`

Move:

- read delivery builders
- line window and fragment recovery
- repo explain target selection execution branch
- inspect-files glob branch
- context packet handoff branch

Keep compatible:

- Existing `readInspectModule.ts` remains the source for read/inspect route
  helpers until stage ownership is complete.

Validation:

- runMvp read/inspect/repo-explain tests
- focused tests for `readInspectModule.ts`
- no-write real-mode inspect tests, without live provider

## Target 5: Provider, Proposal, Lifecycle, And Planning Runtime Stages

Destination files:

- `packages/ts-shell/src/provider/providerDraftStage.ts`
- `packages/ts-shell/src/planning/planningRuntimeStage.ts`
- `packages/ts-shell/src/proposal/anchoredProposalStage.ts`
- `packages/ts-shell/src/turn/stages/lifecycleStage.ts`

Move:

- provider draft invocation
- planning runtime route branch
- lifecycle activation branch
- anchored proposal branch and current-content adapter

Keep compatible:

- `providerMode: "synthetic" | "real"` behavior.
- No provider call for default no-write inspect flows.
- Fake anchored proposal runtime remains fake-only unless explicitly changed by
  a provider route.

Validation:

- runMvp real-provider missing-key and no-write inspect cases
- `anchoredProposalRuntime.test.ts`
- `taskLifecycleActivation.test.ts`
- result contract and Route221 gate if result/evidence adaptation changes

## Target 6: Edit And Mutation Stages

Destination files:

- `packages/ts-shell/src/edit/discoveryEditStage.ts`
- `packages/ts-shell/src/edit/fencedEditStage.ts`
- `packages/ts-shell/src/edit/mutationInstructionPlanner.ts`
- `packages/ts-shell/src/edit/mutationTargetSelection.ts`
- `packages/ts-shell/src/edit/lowRiskMutationPlanner.ts`
- `packages/ts-shell/src/edit/staleReadMutationStage.ts`
- `packages/ts-shell/src/policy/mutationAuthorityGate.ts`
- `packages/ts-shell/src/turn/stages/mutationStage.ts`

Move:

- discovery edit route handoff
- fenced replacement activation
- permission checks before writes
- mutation instruction generation
- low-risk generated examples and bugfixes
- secondary writes and rename refactor
- stale-read/readback protected snapshots

Keep compatible:

- Existing `editFacade.ts`, `patchMutationLane.ts`, `mutationExecution.ts`,
  and `workspaceAuthority.ts` remain the behavior owners during migration.

Validation:

- runMvp edit/write/apply_patch cases
- `fencedEditRuntimeActivation.test.ts`
- edit facade tests
- workspace writer policy tests if authority boundaries move
- `npm run verify:result-contract`

## Target 7: Verification And Command Stages

Destination files:

- `packages/ts-shell/src/verification/verifyCommandIntent.ts`
- `packages/ts-shell/src/verification/verificationStage.ts`
- `packages/ts-shell/src/verification/contentAssertionVerification.ts`
- `packages/ts-shell/src/verification/consistencyVerification.ts`
- `packages/ts-shell/src/policy/commandAuthorityGate.ts`
- `packages/ts-shell/src/turn/stages/commandStage.ts`

Move:

- verify command detection and direct command allowlist handling
- verify-like command classification
- verification plan execution and retry loop
- content contains, unchanged-file, and multi-file consistency checks
- command provenance and current request scope evidence

Keep compatible:

- Existing `verificationModule.ts`, `verificationCommandPlan.ts`, and
  `taskRelevantVerificationRoute.ts` are not bypassed.

Validation:

- runMvp command/verification tests
- verification facade tests
- task-relevant verification route tests
- result contract

## Target 8: Repair And Cross-File Continuation Stages

Destination files:

- `packages/ts-shell/src/repair/singleFileRepairContext.ts`
- `packages/ts-shell/src/repair/crossFileRepairPlanning.ts`
- `packages/ts-shell/src/repair/degradedReopenPlanning.ts`
- `packages/ts-shell/src/repair/groundedAnswerRepair.ts`
- `packages/ts-shell/src/repair/stagedRepairProjection.ts`
- `packages/ts-shell/src/turn/stages/repairStage.ts`

Move:

- single-file failure repair context
- cross-file candidate derivation
- degraded reopen decision
- grounded answer repair normalization
- staged repair parsing
- cross-file repair execution and remaining/failed/skipped projections

Keep compatible:

- `repairFacade.ts` remains the stable product facade.
- Continuation evidence must remain report/session safe.

Validation:

- runMvp repair/continuation tests
- repair facade tests
- stopped session continuity tests

## Target 9: Evidence And Result Projection

Destination files:

- `packages/ts-shell/src/evidence/freshnessEvidence.ts`
- `packages/ts-shell/src/evidence/turnEvidenceLedger.ts`
- `packages/ts-shell/src/result/workflowRuntimeProjection.ts`
- `packages/ts-shell/src/result/terminalVerdictProjection.ts`

Move:

- `FreshnessObservability`
- `buildFreshnessObservability`
- evidence ledger append patterns
- final `projectWorkflowTurnHandoff` calls
- result contract adaptation into `evidence/verdictFacade.ts`

Keep compatible:

- `resultSurfaceModule.ts` remains stable until result facade parity is proven.
- Route221 anti-false-success gate remains active evidence infrastructure.

Validation:

- `npm run verify:result-contract`
- `npm run verify:route221-anti-false-success-gate`
- focused evidence/verdict facade tests
- runMvp full suite
