# runMvp Stay Vs Move Matrix

Preferred final role for `runMvpIntegratedFlow.ts`: compatibility wrapper.

Reason: direct consumers still import this orchestration path, but
`turn/turnFacade.ts` already establishes product-owned turn ownership. The
future implementation should move coordination into `turn/` and leave the
legacy file as a stable import path that delegates without owning planning,
mutation, verification, repair, provider, evidence, or result semantics.

| Current region or symbol | Stay in `runMvpIntegratedFlow.ts` | Move | Delete or deprecate later | Final destination | Compatibility shim | Phase |
|---|---:|---:|---:|---|---|---:|
| `MvpIntegratedFlowOptions` | Yes, as re-export or imported alias | Yes, canonical type moves | No | `turn/integratedTurnEntrypoint.ts` | Re-export legacy type | 1 |
| `runMvpIntegratedFlow` | Yes, wrapper body only | Yes, implementation moves | No | `turn/integratedTurnEntrypoint.ts` | Delegate legacy export | 1 |
| `streamMvpIntegratedFlow` | Yes, wrapper body only | Yes, implementation moves | No | `turn/integratedTurnEntrypoint.ts` | Delegate legacy export | 1 |
| runtime config/MCP/browser/sandbox setup | No | Yes | No | `turn/turnRuntimeEnvironment.ts` | Entry wrapper calls environment builder | 1 |
| `createIntegratedRunner` | No | Yes | No | `turn/integratedTurnCoordinator.ts` | Coordinator keeps role/handoff parity | 1 |
| planner role canned response | No | Yes | Later simplify | `turn/stages/plannerHandoffStage.ts` | Preserve notes/events | 8 |
| reviewer role canned response | No | Yes | Later simplify | `turn/stages/reviewerHandoffStage.ts` | Preserve notes | 8 |
| provider chat draft | No | Yes | No | `provider/providerDraftStage.ts` | Preserve providerMode behavior | 2 |
| `runApplyPatchRuntimeRouteIfRequested` | No | Yes | No | `edit/applyPatchRuntimeBridge.ts` | Wrapper keeps option name | 1 |
| `readWorkspaceFile`, `pathStaysInsideWorkspace` | No | Yes | No | `edit/workspaceReadPolicy.ts` | Same path containment semantics | 1 |
| `readAnchoredProposalCurrentContent` | No | Yes | No | `proposal/anchoredProposalStage.ts` | Same current-content map shape | 2 |
| `WorkflowTaskIntentSignals` | No | Yes | No | `planning/workflowIntentSignals.ts` | Export through planning facade | 3 |
| `buildWorkflowTaskPlan` | No | Yes | No | `planning/workflowTaskPlan.ts` plus domain planners | Facade returns same `WorkflowTaskPlan` | 3 |
| target resolution blocker integration | No | Yes | No | `planning/promptTargetProjection.ts` | Keep `resolveTaskTargets` output | 3 |
| command intent and unsupported command detection | No | Yes | No | `policy/commandIntentPolicy.ts` | Preserve allowlist blockers | 3 |
| browser plan selection | No | Yes | No | `browser/browserPlanningStage.ts` or `turn/stages/browserStage.ts` | Preserve `browserPlan` task kind | 2 |
| continuation state merge and inline context | No | Yes | No | `session/continuationPromptState.ts` | Keep `ContinuityStateLike` input | 4 |
| read target recovery and migration rebase | No | Yes | No | `context/readWindowContinuation.ts` and `session/continuationPromptState.ts` | Preserve relocation evidence | 4 |
| repair object planning | No | Yes | No | `repair/repairContinuationPlanning.ts` | Preserve structured blocker wording | 5 |
| verify object planning | No | Yes | No | `verification/verifyContinuationPlanning.ts` | Preserve blocked verify semantics | 6 |
| degraded reopen/cross-file candidate logic | No | Yes | No | `repair/degradedReopenPlanning.ts` and `repair/crossFileRepairPlanning.ts` | Preserve candidate/pruned evidence | 5 |
| `FreshnessObservability` and builder | No | Yes | No | `evidence/freshnessEvidence.ts` | Same notes/evidence strings first | 7 |
| planning runtime route branch | No | Yes | No | `planning/planningRuntimeStage.ts` | Keep review-only no-write handoff | 2 |
| task lifecycle branch | No | Yes | No | `turn/stages/lifecycleStage.ts` | Preserve activation output | 2 |
| anchored proposal branch | No | Yes | No | `proposal/anchoredProposalStage.ts` | Preserve fake dry-run and evidence | 2 |
| discovery edit branch | No | Yes | No | `edit/discoveryEditStage.ts` | Keep manifest/handoff evidence | 5 |
| fenced edit activation branch | No | Yes | No | `edit/fencedEditStage.ts` | Keep stopped/selected stream parity | 5 |
| blocked outcome branch | No | Yes | No | `result/workflowRuntimeProjection.ts` | Keep `projectWorkflowBlockedOutcome` | 7 |
| browser execution branch | No | Yes | No | `turn/stages/browserStage.ts` | Keep browser module result | 2 |
| read-file execution branch | No | Yes | No | `turn/stages/contextReadStage.ts` | Keep read delivery/result shape | 4 |
| inspect-files branch | No | Yes | No | `context/repoInspectStage.ts` | Keep glob evidence | 4 |
| repo-explain branch | No | Yes | No | `context/repoExplainStage.ts` | Keep diagnosis projection | 4 |
| write/edit mutation branch | No | Yes | No | `turn/stages/mutationStage.ts` | Keep `executeFileMutationBranch` use | 5 |
| protected snapshot/readback logic | No | Yes | No | `edit/staleReadMutationStage.ts` | Preserve stale-read and protected file blockers | 5 |
| low-risk rename/secondary writes | No | Yes | No | `edit/lowRiskMutationPlanner.ts` | Preserve explicit prompt-only behavior | 5 |
| direct command branch | No | Yes | No | `turn/stages/commandStage.ts` | Preserve allowlist and stopped output | 6 |
| verification plan and retry execution | No | Yes | No | `verification/verificationStage.ts` | Preserve retry and blocked/failed split | 6 |
| content/unchanged assertions | No | Yes | No | `verification/contentAssertionVerification.ts` | Preserve failed vs blocked reasons | 6 |
| consistency verification | No | Yes | No | `verification/consistencyVerification.ts` | Preserve source/target separation | 6 |
| cross-file repair execution | No | Yes | No | `repair/crossFileRepairStage.ts` | Preserve partial/remaining/skipped evidence | 5 |
| final turn handoff/result contract | No | Yes | No | `result/workflowRuntimeProjection.ts` | Keep `projectWorkflowTurnHandoff` parity | 7 |
| git change set attribution call | No | Yes | No | `result/workflowRuntimeProjection.ts` or `edit/mutationStage.ts` | Preserve pre-existing dirty separation | 7 |
| read delivery helpers | No | Yes | No | `context/readDeliveryProjection.ts` | Keep evidence markers | 4 |
| explain/purpose IO delivery helpers | No | Yes | No | `context/repoExplainStage.ts` | Keep grounded output | 4 |
| follow-up regex classifiers | No | Yes | Later hide internals | `planning/workflowIntentSignals.ts` and repair/session modules | Module-local tests | 3-5 |
| read window/fragment/fingerprint helpers | No | Yes | No | `context/readWindowContinuation.ts` | Preserve selective reanchor behavior | 4 |
| grounded repair instruction helpers | No | Yes | No | `repair/groundedAnswerRepair.ts` | Preserve answer-repair output | 5 |
| verify command detector | No | Yes | No | `verification/verifyCommandIntent.ts` | Preserve allowlisted command selection | 6 |
| file refs, fenced content, replace directive parsing | No | Yes | No | `edit/mutationInstructionPlanner.ts` | Preserve exact patch failure codes | 5 |
| mutation target selection | No | Yes | No | `edit/mutationTargetSelection.ts` | Preserve multi-suffix target behavior | 3 |
| low-risk generated content helpers | No | Yes | No | `edit/lowRiskMutationPlanner.ts` | Characterization tests before move | 5 |
| `truncate`, `normalizePathLike`, `hasPathLikeReference` | No | Yes | Maybe consolidate | `shared/pathTextProjection.ts` or owning modules | Avoid generic export unless reused | 8 |
