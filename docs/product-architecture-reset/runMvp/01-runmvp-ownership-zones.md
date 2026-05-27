# runMvp Ownership Zones

This map uses final product ownership names. It intentionally avoids
`helper`, `utils`, `misc`, and `mvp` buckets.

## Zone A: Legacy Public Turn Entrypoint

Current symbols:

- `MvpIntegratedFlowOptions`
- `runMvpIntegratedFlow`
- `streamMvpIntegratedFlow`
- `createIntegratedRunner`

Final owner:

- `turn/`

Final destination:

- `packages/ts-shell/src/turn/integratedTurnEntrypoint.ts`
- `packages/ts-shell/src/turn/integratedTurnCoordinator.ts`
- `packages/ts-shell/src/turn/turnRuntimeEnvironment.ts`

What remains in `runMvpIntegratedFlow.ts`:

- Compatibility exports only.
- Type re-exports if required by existing consumers.
- Thin delegation to product turn entrypoint.

Compatibility shim:

- Keep `../orchestration/runMvpIntegratedFlow.js` import path valid.
- `turn/turnFacade.ts` can initially keep using the legacy path, then migrate to
  the new turn entrypoint after the wrapper exists.

## Zone B: Runtime Environment And Policy Setup

Current symbols:

- runtime config lookup
- MCP gateway snapshot
- browser runtime status
- sandbox enforcer escalation handler setup
- `ToolDispatcher`
- `runApplyPatchRuntimeRouteIfRequested`
- `readWorkspaceFile`
- `pathStaysInsideWorkspace`

Final owners:

- `runtime/`
- `tools/`
- `mcp/`
- `browser/`
- `policy/`
- `edit/`

Final destinations:

- `turn/turnRuntimeEnvironment.ts` for composing the runtime environment.
- `policy/escalationPolicyBridge.ts` for escalation handler normalization.
- `edit/applyPatchRuntimeBridge.ts` for explicit apply_patch compatibility.
- `edit/workspaceReadPolicy.ts` or `policy/workspaceReadPolicy.ts` for
  bounded no-write file reads.

Compatibility shim:

- `MvpIntegratedFlowOptions.applyPatchRuntimeRoute` must keep identical
  behavior and stream shape.
- No production write default can change.

## Zone C: Intent, Target, And Continuation Planning

Current symbols:

- `WorkflowTaskIntentSignals`
- `buildWorkflowTaskPlan`
- `extractWorkflowTaskIntentSignals`
- `derivePromptPathTarget`
- `stripPathTokensForIntent`
- cue classifiers such as `isWeakRepairFollowUpPrompt`,
  `isTemporalSuccessorCuePrompt`, `isPostEditReadOnlyVerifyFollowUp`
- target selection and target blocker calls

Final owners:

- `planning/`
- `context/`
- `session/`
- `repair/`
- `verification/`
- `policy/`

Final destinations:

- `planning/workflowIntentSignals.ts`
- `planning/workflowTaskPlan.ts`
- `planning/promptTargetProjection.ts`
- `session/continuationPromptState.ts`
- `repair/repairContinuationPlanning.ts`
- `verification/verifyContinuationPlanning.ts`
- `policy/commandIntentPolicy.ts`

Compatibility shim:

- Export only stable `WorkflowTaskPlan` from `workflowTaskPlanner.ts` or a new
  planning facade. Do not expose prompt regex internals across domains.

## Zone D: Context Read, Repo Explain, And Context Packet Delivery

Current symbols:

- `buildReadTaskDelivery`
- `buildSingleGroundedDelivery`
- `buildInspectFilesDelivery`
- `buildExplainTaskDelivery`
- `buildPurposeIoExplainDelivery`
- `detectReadFilterIntent`
- read window and fragment helpers
- context packet route inside `executeWorkflowTaskPlan`

Final owners:

- `context/`
- `turn/stages/`
- `result/`

Final destinations:

- `context/readDeliveryProjection.ts`
- `context/readWindowContinuation.ts`
- `context/repoExplainStage.ts`
- `turn/stages/contextReadStage.ts`
- `result/groundedDeliveryProjection.ts`

Compatibility shim:

- Stage output must keep current `CodingResultSummary` and terminal projection
  shape through `resultSurfaceModule` until result facade migration is complete.

## Zone E: Provider, Lifecycle, Proposal, And Planning Runtime Handoff

Current symbols and branches:

- `streamTurnRoleDraft`
- provider-mode chat draft
- `selectPlanningRuntimeProductRoute`
- `runPlanningRuntime`
- `projectPlanningRuntimeProductOutcome`
- `activateTaskLifecycle`
- `runAnchoredProposalRuntime`
- `readAnchoredProposalCurrentContent`

Final owners:

- `provider/`
- `proposal/`
- `planning/`
- `turn/stages/`

Final destinations:

- `provider/providerDraftStage.ts`
- `planning/planningRuntimeStage.ts`
- `proposal/anchoredProposalStage.ts`
- `turn/stages/lifecycleStage.ts`

Compatibility shim:

- Keep no-provider/no-write defaults and fake anchored runtime behavior exactly
  as-is until provider/proposal facades own the calls.

## Zone F: Edit, Mutation Authority, And Patch Instruction Planning

Current symbols and branches:

- discovery/fenced edit route branch
- workspace authority creation
- permission checks before edit/write
- `resolveMutationInstruction`
- `applyScopedReplaceDirective`
- `applyLineScopedContinuationRepair`
- `planMutationTargetSelection`
- low-risk rename/refactor and secondary writes
- stale-read and patch failure handling

Final owners:

- `edit/`
- `policy/`
- `proposal/`
- `turn/stages/`

Final destinations:

- `edit/mutationInstructionPlanner.ts`
- `edit/mutationTargetSelection.ts`
- `edit/fencedEditStage.ts`
- `edit/discoveryEditStage.ts`
- `edit/lowRiskMutationPlanner.ts`
- `edit/staleReadMutationStage.ts`
- `policy/mutationAuthorityGate.ts`
- `turn/stages/mutationStage.ts`

Compatibility shim:

- Preserve current `executeFileMutationBranch`, `patchMutationLane`, and
  `workspaceAuthority` semantics. No prompt text may imply write authority.

## Zone G: Verification And Command Execution

Current symbols and branches:

- `detectVerifyCommand`
- `isVerifyLikeCommand`
- direct run-command branch
- allowlist and unsupported command blockers
- `planWorkflowVerification`
- `projectWorkflowCommandVerification`
- retry planning
- content/unchanged/multi-file consistency verification

Final owners:

- `verification/`
- `policy/`
- `runtime/`
- `turn/stages/`

Final destinations:

- `verification/verifyCommandIntent.ts`
- `verification/verificationStage.ts`
- `verification/contentAssertionVerification.ts`
- `verification/consistencyVerification.ts`
- `policy/commandAuthorityGate.ts`
- `turn/stages/commandStage.ts`

Compatibility shim:

- Existing `verificationModule.ts`, `verificationCommandPlan.ts`, and
  `taskRelevantVerificationRoute.ts` remain authoritative until migrated.
- Direct command blockers must not become success-like terminal states.

## Zone H: Repair And Continuation

Current symbols:

- `resolveSingleFileEditFailureRepairContext`
- `resolveSingleFileEditFailureRepairContextAbandonment`
- `resolveContinuationReopenTarget`
- `deriveCrossFileRepairCandidates`
- `shouldDegradeCrossFileRemaining`
- `shouldRetainCrossFileFailureInRemaining`
- `normalizeGroundedRepairInstruction`
- staged repair helpers
- cross-file repair execution branches

Final owners:

- `repair/`
- `session/`
- `context/`
- `turn/stages/`

Final destinations:

- `repair/singleFileRepairContext.ts`
- `repair/crossFileRepairPlanning.ts`
- `repair/degradedReopenPlanning.ts`
- `repair/groundedAnswerRepair.ts`
- `repair/stagedRepairProjection.ts`
- `turn/stages/repairStage.ts`

Compatibility shim:

- Preserve structured continuation facts, lineage evidence, and blocked
  verify/repair surfaces. Continuation must not upgrade stopped results.

## Zone I: Evidence, Result, And Terminal Projection

Current symbols and branches:

- `FreshnessObservability`
- `buildFreshnessObservability`
- evidence array construction in `executeWorkflowTaskPlan`
- `appendSingleFileEditRepairObservability`
- `projectWorkflowBlockedOutcome`
- `projectWorkflowRuntimeOutcome`
- `projectWorkflowTurnHandoff`
- git change set attribution

Final owners:

- `evidence/`
- `result/`
- `session/`

Final destinations:

- `evidence/turnEvidenceLedger.ts`
- `evidence/freshnessEvidence.ts`
- `result/workflowRuntimeProjection.ts`
- `result/terminalVerdictProjection.ts`
- `session/turnContinuationFacts.ts`

Compatibility shim:

- Keep current `resultSurfaceModule` output stable while adapting into
  `evidence/verdictFacade.ts`. No stopped/partial/not-proven state can become
  success.
