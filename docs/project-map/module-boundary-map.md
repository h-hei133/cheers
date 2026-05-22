# Module Boundary Map

Modules are responsibility boundaries, not directories.

## Agent Loop

- Responsibility: compose each turn, classify workflow task, dispatch capability branches, collect evidence, and hand off to result/session surfaces.
- Main files: `runMvpIntegratedFlow.ts`, `MultiAgentOrchestrator.ts`, `workflowTaskPlanner.ts`, `workflowIntentProjection.ts`, `runtimeHandoffProjection.ts`, `core/query/*`.
- Facade/public functions: `runMvpIntegratedFlow`, `streamMvpIntegratedFlow`, `createIntegratedRunner`, `buildWorkflowTaskPlan`.
- Upstream modules: CLI / UX, Session / Continue, Provider / Model, MCP gateway, Tool runtime.
- Downstream modules: Read / Context Discovery, Analysis / Plan Quality, Edit / Patch, Browser, Verification, Result Surface.
- Owned lifecycle stages: planning, execution composition, evidence aggregation, result handoff.
- Coupling level: high.
- Role: central glue.
- Unclear ownership or boundary violations: prompt intent parsing, read planning, edit execution, verification, provider activation, and some user-facing output still live inside this composition root.

## Task Lifecycle

- Responsibility: task intent, stage model, lifecycle readiness, activation, and handoff evidence.
- Main files: `taskIntent.ts`, `taskStage.ts`, `taskLifecycle.ts`, `taskReadPlan.ts`, `analysisBrief.ts`, `taskExecutionPlan.ts`, `taskLifecycleResult.ts`, `taskLifecycleTrace.ts`, `taskLifecycleRouter.ts`, `taskLifecycleActivation.ts`, `taskLifecycleHandoff.ts`, `realTaskLoopPlan.ts`, `realTaskLoopRuntime.ts`, `realTaskLoopResult.ts`.
- Facade/public functions: `activateTaskLifecycle`, `buildTaskLifecycle`, `buildRealTaskLoopPlan`, `runRealTaskLoopRuntime`, `buildRealTaskLoopResult`.
- Upstream modules: Agent Loop, Workspace / File Context, Analysis / Plan Quality.
- Downstream modules: Provider Proposal / Smoke, Verification / Runtime, Repair Loop, Result Surface, Harness / Eval.
- Owned lifecycle stages: planning, evidence, transcript/report handoff.
- Coupling level: medium.
- Role: dependent module with task-loop bridge.
- Unclear ownership or boundary violations: task-loop runtime crosses provider, proposal, apply, verification, and fixture cleanup.

## Workspace / File Context

- Responsibility: workspace target facts, context packets, context graphs, code graph facts, target summaries, safe labels.
- Main files: `workspaceFileContract.ts`, `workspaceTargetProjection.ts`, `readInspectModule.ts`, `contextPacket.ts`, `contextDiscovery.ts`, `contextBudget.ts`, `contextGraph*.ts`, `codeGraph*.ts`, `testImpactPlan.ts`.
- Facade/public functions: `buildTargetedContextPacket`, `discoverTargetedContext`, `buildContextGraph`, `buildContextGraphPlanningBundle`, `safeTargetLabel`.
- Upstream modules: Agent Loop, filesystem, selected workspace.
- Downstream modules: Analysis / Plan Quality, Provider Proposal / Smoke, Verification / Runtime, Session / Continue.
- Owned lifecycle stages: availability, planning, observation, evidence, redaction.
- Coupling level: medium.
- Role: dependent module.
- Unclear ownership or boundary violations: context discovery owns deterministic heuristics but not semantic understanding; downstream consumers may overread context quality.

## Read / Context Discovery

- Responsibility: read/inspect intent, repo explain target selection, read continuation target recovery.
- Main files: `readInspectModule.ts`, `readInspectIntent.ts`, `repoExplainEvidence.ts`, `readContinuationTarget.ts`, `targetResolution.ts`.
- Facade/public functions: `classifyReadInspectRequest`, `recoverReadContinuationTarget`, `selectRepoExplainTarget`, `resolveTaskTargets`.
- Upstream modules: CLI prompt, Agent Loop, Session / Continue.
- Downstream modules: Workspace / File Context, Result Surface, Session / Continue.
- Owned lifecycle stages: planning, observation, evidence.
- Coupling level: medium.
- Role: dependent module.
- Unclear ownership or boundary violations: target resolution and prompt intent still interact with many regex branches in `runMvpIntegratedFlow.ts`.

## Context Graph / Code Graph

- Responsibility: bounded deterministic graph, second-hop candidates, test impact, staleness, impact queries.
- Main files: `contextGraph.ts`, `contextGraphDiscovery.ts`, `contextGraphBudget.ts`, `contextGraphScore.ts`, `contextGraphReadiness.ts`, `contextGraphPlanning.ts`, `contextGraphResult.ts`, `codeGraphFacts.ts`, `codeGraphTrace.ts`, `codeGraphQuery.ts`, `codeGraphStaleness.ts`, `codeGraphImpact.ts`, `codeGraphResult.ts`.
- Facade/public functions: `buildContextGraph`, `discoverContextGraph`, `scoreContextGraph`, `buildContextGraphReadinessFacts`.
- Upstream modules: Workspace / File Context.
- Downstream modules: Agent Plan, Plan Quality, Provider Proposal, Verification.
- Owned lifecycle stages: planning, observation, evidence, report, redaction.
- Coupling level: medium.
- Role: dependent module.
- Unclear ownership or boundary violations: graph quality is heuristic and no persistent semantic index exists.

## Analysis / Plan Quality

- Responsibility: evidence-grounded analysis brief, analysis quality gate, Agent Plan, Plan Quality.
- Main files: `analysisBrief.ts`, `analysisBriefCalibration.ts`, `analysisQualityGate.ts`, `agentPlan.ts`, `agentPlanContext.ts`, `agentPlanProjection.ts`, `agentPlanResult.ts`, `planQuality.ts`, `planQualityScore.ts`, `planQualityGate.ts`, `planQualityResult.ts`.
- Facade/public functions: `buildAgentPlan`, `buildPlanQuality`, `evaluatePlanQualityGate`, `buildAgentPlanResult`.
- Upstream modules: Workspace / File Context, Task Lifecycle.
- Downstream modules: Provider / Model, Verification / Runtime, Repair Loop, Result Surface, Harness / Eval.
- Owned lifecycle stages: planning, evidence, result mapping, transcript, eval/report.
- Coupling level: medium.
- Role: dependent module.
- Unclear ownership or boundary violations: plan decisions still partly live in Agent Loop; plan readiness is not execution authority.

## Provider / Model

- Responsibility: provider readiness, diagnostic handoff, real-provider proposal gate, no-write dry-run, provider output validation.
- Main files: `providerReadiness.ts`, `providerModule.ts`, `providerOutcomeProjection.ts`, `realProviderProposalGate.ts`, `realProviderProposalDryRun.ts`, `providerPromptAudit.ts`, `providerOutputValidator.ts`.
- Facade/public functions: `checkRealProviderReadiness`, `projectProviderDiagnosticHandoff`, `evaluateRealProviderProposalGate`, `runRealProviderProposalDryRun`.
- Upstream modules: CLI credential resolution, Analysis / Plan Quality, Workspace / File Context, explicit opt-in env.
- Downstream modules: Provider Proposal / Smoke, Proposal Anchoring, Harness / Eval, Result Surface.
- Owned lifecycle stages: availability, policy, execution for provider call, evidence, redaction.
- Coupling level: medium.
- Role: dependent module.
- Unclear ownership or boundary violations: live provider readiness and live provider task-loop evidence are separate and must remain separately labeled.

## Provider Proposal / Smoke

- Responsibility: anchored provider smoke, fake/real proposal quality, no-write smoke result, scorecards.
- Main files: `anchoredProviderSmoke*.ts`, `liveProviderSmoke*.ts`, `proposalQuality*.ts`, `providerSmokeResult.ts`, `scripts/verify-real-provider-anchored-smoke.mjs`, `scripts/real-provider-smokes/anchoredSmokeRunner.ts`, `scripts/verify-real-provider-task-loop-mvp.mjs`, `scripts/real-provider-smokes/taskLoopRunner.ts`.
- Facade/public functions: `runLiveProviderSmokeCalibration`, `buildLiveProviderSmokeResult`, `runRealTaskLoopRuntime`.
- Upstream modules: Provider / Model, Proposal Anchoring, Harness / Eval.
- Downstream modules: Session / Continue, Harness / Eval, readiness claims.
- Owned lifecycle stages: availability, policy, execution, evidence, report, cleanup, redaction.
- Coupling level: high.
- Role: dependent smoke bridge.
- Unclear ownership or boundary violations: Route 200 task-loop smoke spans fixture, provider, proposal, apply, verification, and scorecard in one route.

## Proposal Anchoring

- Responsibility: anchor extraction, current-content matching, conflict detection, anchored proposal manifest, anchoring result.
- Main files: `providerAnchorCandidate.ts`, `providerProposalAnchors.ts`, `providerAnchorMatcher.ts`, `providerAnchorConflict.ts`, `providerAnchorQuality.ts`, `providerAnchoredProposal.ts`, `providerAnchoringResult.ts`, `anchoredProposalRuntime.ts`, `anchoredProposalEval.ts`, `anchoredProposalScorecard.ts`.
- Facade/public functions: `extractProviderProposalAnchors`, `matchProviderAnchorCandidates`, `detectProviderAnchorConflicts`, `buildProviderAnchoredProposal`, `buildProviderAnchoringResult`, `runAnchoredProposalRuntime`.
- Upstream modules: Provider / Model, Workspace / File Context.
- Downstream modules: Proposal / Review, Edit / Patch, Plan Quality, Harness / Eval.
- Owned lifecycle stages: planning, observation, evidence, result mapping, report.
- Coupling level: medium.
- Role: dependent module.
- Unclear ownership or boundary violations: exact-ready can look like apply-ready even though mutation authority remains closed.

## Edit / Patch

- Responsibility: bounded mutation planning, exact fenced route, target-set route, proposal hunk-set route, workspace write route, partial failure and recovery facts.
- Main files: `editPatchModule.ts`, `editExpectationContract.ts`, `fencedEditRoute.ts`, `targetSetEditRoute.ts`, `proposalHunkSetRoute.ts`, `exactHunkApply.ts`, `editProposalApply.ts`, `patchResult/workspaceWriteRoute.ts`, `patchResult/workspaceAuthority.ts`, `patchApplication/*`, `mutationExecution.ts`, `patchMutationLane.ts`.
- Facade/public functions: `runFencedEditReplacementRoute`, `runTargetSetEditRoute`, `runProposalHunkSetRoute`, `runExactHunkApplyRoute`, `applyEditProposalSelection`, `runWorkspaceWriteRoute`.
- Upstream modules: Agent Loop, Permission / Policy, Proposal Anchoring, Workspace / File Context.
- Downstream modules: Verification / Runtime, Repair Loop, Result Surface, Session / Continue.
- Owned lifecycle stages: policy, planning, execution, observation, evidence, cleanup, redaction.
- Coupling level: high.
- Role: central capability module.
- Unclear ownership or boundary violations: old direct mutation execution still sits in Agent Loop, while newer routes own selected-workspace apply_patch behavior.

## Verification / Runtime

- Responsibility: verification planning, allowlisted command execution, low-risk readback, runtime receipt projection.
- Main files: `verificationModule.ts`, `lowRiskVerificationPlanning.ts`, `verificationCommandPlan.ts`, `verificationCommandRunner.ts`, `verificationCommandResult.ts`, `verificationFailureClassifier.ts`, `toolRuntimeModule.ts`, `runtimeReceipt.ts`, `runtimeReceiptProjection.ts`.
- Facade/public functions: `planWorkflowVerification`, `runVerificationCommand`, `buildVerificationCommandResult`, `projectRuntimeReceiptEvidence`.
- Upstream modules: Agent Loop, Tool runtime, Edit / Patch.
- Downstream modules: Repair Loop, Result Surface, Session / Continue.
- Owned lifecycle stages: planning, execution, observation, evidence, result mapping.
- Coupling level: medium.
- Role: dependent module.
- Unclear ownership or boundary violations: low-risk verification logic is still embedded in `runMvpIntegratedFlow.ts`.

## Repair Loop

- Responsibility: failed apply/verification context, no-write repair proposal, review-required handoff, no automatic repair.
- Main files: `editRepairContext.ts`, `editRepairProposal.ts`, `editRepairPlanner.ts`, `editRepairResult.ts`, `verificationRepairContext.ts`, `verificationRepairPlanner.ts`, `verificationRepairResult.ts`, `verificationRepairLoop.ts`, `verificationRepairBridge.ts`.
- Facade/public functions: `planEditRepairProposal`, `planEditRepairHunkSetHandoff`, `runVerificationRepairLoop`.
- Upstream modules: Verification / Runtime, Edit / Patch, Workspace / File Context, Provider / Model.
- Downstream modules: Proposal / Review, Proposal Hunk Set, Result Surface, Session / Continue.
- Owned lifecycle stages: planning, evidence, result mapping, transcript.
- Coupling level: medium.
- Role: dependent module.
- Unclear ownership or boundary violations: repair proposal and repair execution must stay distinct.

## Result Surface

- Responsibility: truthful terminal classification and user-visible result state.
- Main files: `resultMapper.ts`, `resultSurfaceModule.ts`, `actionableBlockerModule.ts`, `capabilityResultClassification.ts`, `terminalClassificationProjection.ts`, `sessionTerminalState.ts`, `sessionStateSurface.ts`.
- Facade/public functions: `mapTerminalToOrchestrationResult`, `projectWorkflowRuntimeOutcome`, `projectWorkflowBlockedOutcome`, `formatStoppedContinueGuidanceLines`.
- Upstream modules: Agent Loop, Edit / Patch, Verification / Runtime, Tool/MCP/Browser/Provider.
- Downstream modules: CLI / UX, Session / Continue, Harness / Eval.
- Owned lifecycle stages: result mapping, report, transcript handoff.
- Coupling level: high.
- Role: central truth surface.
- Unclear ownership or boundary violations: capability branches can still create user-facing output close to execution.

## Session / Continue

- Responsibility: session persistence, current-session selection, continuity snapshot, compact summary, resume/continue runtime.
- Main files: `SessionManager.ts`, `currentSessionSelection.ts`, `stoppedSessionContinuity.ts`, `compactContinuitySummary.ts`, `continueShellActionRuntime.ts`, `sessionFutureTurnProjection.ts`, `sessionPersistenceProjection.ts`, `sessionStateSurface.ts`.
- Facade/public functions: `SessionManager.buildContinuitySnapshot`, `SessionManager.buildPromptContinuitySnapshot`, `runResumeLikeShellAction`, `buildCompactContinuitySummary`.
- Upstream modules: ShellSessionRuntime, Result Surface, Query events.
- Downstream modules: CLI / UX, Agent Loop, future turns.
- Owned lifecycle stages: transcript, continue/replay, cleanup/report for state.
- Coupling level: high.
- Role: central persistence module.
- Unclear ownership or boundary violations: `SessionManager.ts` owns many persistence, compact, approval, recovery, and current-session concerns.

## Harness / Eval

- Responsibility: verification scripts, gate markers, safety checks, report writing, residue handling.
- Main files: `scripts/verify-context-planning.mjs`, `scripts/verify-edit-capability-closeout.mjs`, `scripts/verify-result-contract.mjs`, `scripts/verify-release-deterministic.mjs`, `scripts/verify/index.mjs`, `scripts/verify/*`, `scripts/real-user-capabilities/*`.
- Facade/public functions: script entrypoints and verifier modules `verifierCliModule.mjs`, `verifierCaseModule.mjs`, `verifierSafetyModule.mjs`, `verifierReportModule.mjs`.
- Upstream modules: package scripts, focused tests, isolated test roots.
- Downstream modules: readiness claims, release/dogfood evidence.
- Owned lifecycle stages: eval, report, cleanup, redaction.
- Coupling level: high.
- Role: central evidence layer.
- Unclear ownership or boundary violations: verifier output can mix product proof, default skip, dry-run, fake, and descriptor evidence.

## Browser

- Responsibility: browser plan detection, runtime availability, transaction execution, observation/result projection.
- Main files: `browserModule.ts`, `core/context/browserAgent.ts`, `browserTxn.ts`, `browserTxnEvidence.ts`, `browserRuntime*.ts`, `browser*Policy.ts`, `core/harness/browserTxnEval.ts`.
- Facade/public functions: `detectWorkflowBrowserPlan`, `executeBrowserModulePlan`, `executeBrowserTransaction`.
- Upstream modules: Agent Loop, Browser runtime status, Tool runtime.
- Downstream modules: Result Surface, Session / Continue, Harness / Eval.
- Owned lifecycle stages: availability, policy, execution, observation, evidence, cleanup, redaction.
- Coupling level: medium.
- Role: dependent module.
- Unclear ownership or boundary violations: local/controlled evidence is not external browser readiness.

## CLI / UX

- Responsibility: CLI argument/mode dispatch, startup surface, slash commands, interactive loop, non-interactive prompt execution, approval bridge.
- Main files: `cli.tsx`, `cliArgs.ts`, `cliModeDispatch.ts`, `cliRuntimeModule.ts`, `cliPrintModeRunner.ts`, `cliStdinModeRunner.ts`, `cliSessionModule.ts`, `cliWorkspaceModule.ts`, `cliPermissionModule.ts`, `cliApprovalModule.ts`, `slashCommandRegistry.ts`.
- Facade/public functions: `main`, `runCliPrintMode`, `runCliStdinMode`, `runNonInteractivePrompt`, `runCliSessionCommand`, `runCliWorkspaceCommand`, `runCliPermissionCommand`.
- Upstream modules: process args/stdin, runtime config, SessionManager.
- Downstream modules: ShellSessionRuntime, Session / Continue, Permission / Policy, MCP control surface.
- Owned lifecycle stages: availability, policy bridge, transcript entrypoint, report/display.
- Coupling level: high.
- Role: central entrypoint.
- Unclear ownership or boundary violations: entrypoint contains many route-specific branches despite facade extraction.

## Permission / Policy

- Responsibility: approval/trust policy, workspace authority, command allowlist, MCP/browser/provider opt-in policy.
- Main files: `approvalTrustPolicy.ts`, `approvalPromptBridge.ts`, `approvalFlow.ts`, `permissionContext.ts`, `approvalAuthorityProjection.ts`, `patchResult/workspaceAuthority.ts`, `boundedWritePolicy.ts`, `browserToolPolicy.ts`, `browserExecutionPolicy.ts`.
- Facade/public functions: `ApprovalTrustPolicy`, `createCliEscalationPromptHandler`, `createWorkspaceWriteAuthority`, `appendCurrentRequestScopeEvidence`.
- Upstream modules: CLI, Agent Loop, Tool runtime, workspace root.
- Downstream modules: Edit / Patch, Tool runtime, Browser, Provider, Result Surface, Session / Continue.
- Owned lifecycle stages: policy, evidence, transcript, redaction.
- Coupling level: medium-high.
- Role: cross-cutting dependency.
- Unclear ownership or boundary violations: no single common policy result vocabulary covers all capability families.
