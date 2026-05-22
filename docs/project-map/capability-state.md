# Capability State

Evidence levels are restricted to Route 201 labels.

## Read / Context

- Responsibility: classify read/inspect intent, resolve explicit targets, read selected files, produce replay-safe read delivery and context evidence.
- Main files/modules: `runMvpIntegratedFlow.ts`, `readInspectModule.ts`, `readInspectIntent.ts`, `targetResolution.ts`, `workspaceFileContract.ts`, `workspaceTargetProjection.ts`.
- Upstream dependencies: CLI prompt, session continuity state, workspace root, tool runtime `read` and `glob`.
- Downstream consumers: Agent Loop, Context Graph / Code Graph, Result Surface, Session / Continue.
- What works: explicit target reads, read-window delivery, missing/ambiguous/out-of-workspace stopped projections, read continuation target recovery, inspect candidate glob.
- What does not work: broad semantic repository discovery, LSP/symbol index, dependency-aware reasoning beyond deterministic heuristics, guaranteed multi-file understanding from vague prompts.
- Evidence level: `focused-unit-tests`.
- Internal defects: read intent and target extraction remain partly regex/prompt-shape dependent in `runMvpIntegratedFlow.ts`.
- Boundary risks: read context may look more semantically complete than it is; read authority must not become write authority.

## Context Graph / Code Graph

- Responsibility: build deterministic no-write context packets, graph candidates, second-hop summaries, test impact, code graph facts, impact queries, and staleness warnings.
- Main files/modules: `contextPacket.ts`, `contextDiscovery.ts`, `contextBudget.ts`, `contextGraph.ts`, `contextGraphDiscovery.ts`, `contextGraphScore.ts`, `contextGraphReadiness.ts`, `contextGraphPlanning.ts`, `testImpactPlan.ts`, `codeGraphFacts.ts`, `codeGraphTrace.ts`, `codeGraphQuery.ts`, `codeGraphStaleness.ts`, `codeGraphImpact.ts`, `codeGraphResult.ts`.
- Upstream dependencies: explicit in-workspace target, readable files, deterministic filesystem heuristics.
- Downstream consumers: Agent Plan, Plan Quality, provider prompts, verification planning, Session / Continue, Harness / Eval.
- What works: bounded import/sibling/nearby-test/docs/call-site candidates, file/read budgets, redaction, replay-safe summaries, graph/test-impact/impact ids.
- What does not work: LSP-level call graph, type checking, embeddings, persistent index, full-repo semantic search.
- Evidence level: `focused-unit-tests`.
- Internal defects: graph completeness is heuristic and budget-bounded; omitted candidates can hide important context.
- Boundary risks: graph scores can be mistaken for semantic certainty.

## Analyze

- Responsibility: produce evidence-grounded analysis briefs, confidence/risk, missing facts, and quality gates without hidden chain-of-thought persistence.
- Main files/modules: `analysisBrief.ts`, `analysisBriefCalibration.ts`, `analysisQualityGate.ts`, `taskContextResult.ts`, `taskContextNeed.ts`, `taskContextSufficiency.ts`.
- Upstream dependencies: task intent, context packet, graph/code graph facts, staged acquisition.
- Downstream consumers: Agent Plan, Plan Quality, provider dry-run gate, verification/repair handoff, Result Surface.
- What works: deterministic analysis confidence/risk/missing-fact projection and under-evidenced claim blocking.
- What does not work: model-assisted deep analysis is not a default proven path; semantic bug diagnosis remains bounded by gathered context.
- Evidence level: `focused-unit-tests`.
- Internal defects: analysis facts are projections over deterministic evidence, not true reasoning quality guarantees.
- Boundary risks: analysis readiness can be overclaimed if context evidence is thin.

## Plan / Plan Quality

- Responsibility: build Agent Plan, execution readiness, missing facts, suggested reads/verification, and Plan Quality scores/gates.
- Main files/modules: `agentPlan.ts`, `agentPlanContext.ts`, `agentPlanProjection.ts`, `agentPlanResult.ts`, `planQuality.ts`, `planQualityScore.ts`, `planQualityGate.ts`, `planQualityResult.ts`.
- Upstream dependencies: workflow plan, context packet/graph, task lifecycle, analysis brief, verification/repair/provider readiness.
- Downstream consumers: provider proposal gates, verification command planning, repair planning, result/session/harness.
- What works: deterministic plan id, readiness, score dimensions, missing facts, no-write result projection.
- What does not work: no broad semantic planner, no autonomous decomposition engine, no default model-assisted plan execution claim.
- Evidence level: `focused-unit-tests`.
- Internal defects: planning decisions remain scattered between these modules and `runMvpIntegratedFlow.ts`.
- Boundary risks: a "ready" plan is not write authorization.

## Task Lifecycle

- Responsibility: represent task intent, stage readiness, lifecycle trace, activation, and handoff across read/analyze/plan/provider/verification/repair.
- Main files/modules: `taskIntent.ts`, `taskStage.ts`, `taskLifecycle.ts`, `taskReadPlan.ts`, `taskExecutionPlan.ts`, `taskLifecycleTrace.ts`, `taskLifecycleRouter.ts`, `taskLifecycleActivation.ts`, `taskLifecycleHandoff.ts`, `realTaskLoopPlan.ts`, `realTaskLoopRuntime.ts`, `realTaskLoopResult.ts`.
- Upstream dependencies: prompt/workflow plan, context and plan-quality facts, provider availability for task-loop variants.
- Downstream consumers: provider dry-run, verification command, repair, Result Surface, Harness / Eval.
- What works: deterministic lifecycle ids, stage readiness, activation for task-driven context paths, no-write handoff evidence.
- What does not work: Route 200 live task-loop provider/apply/verification closure is not proven.
- Evidence level: `focused-unit-tests`.
- Internal defects: task-loop runtime exists but live provider path observed state is stopped.
- Boundary risks: lifecycle readiness can be confused with live task-loop success.

## Provider / Model

- Responsibility: classify provider readiness, gate real-provider dry-run, call provider only through explicit opt-in boundaries, validate and anchor provider output.
- Main files/modules: `providerReadiness.ts`, `providerModule.ts`, `providerOutcomeProjection.ts`, `realProviderProposalGate.ts`, `realProviderProposalDryRun.ts`, `providerPromptAudit.ts`, `providerOutputValidator.ts`, `providerAnchorQuality.ts`, `providerProposalAnchors.ts`, `providerAnchorMatcher.ts`, `providerAnchorConflict.ts`, `providerAnchoredProposal.ts`, `providerAnchoringResult.ts`.
- Upstream dependencies: provider config/credential resolution, explicit opt-in, context/analysis/plan-quality ids.
- Downstream consumers: Proposal / Review, Harness / Eval, Result Surface, Session / Continue.
- What works: missing-key/config/unsupported/auth/network classification, prompt audit, output validation, exact-ready/review-only/unsafe anchor classification, no-write evidence.
- What does not work: default real-provider execution is not claimed; live provider task-loop apply/verification is not proven.
- Evidence level: `live-provider-called` for Route 199; `default-safe-skip` and `focused-unit-tests` for most other provider paths.
- Internal defects: provider smoke evidence has multiple levels that can be misread as equivalent.
- Boundary risks: provider-called no-write must not imply apply authority.

## Provider Smoke / Dry-run

- Responsibility: verify approved provider boundaries and no-write proposal evidence.
- Main files/modules: `scripts/verify-real-provider-anchored-smoke.mjs`, `scripts/real-provider-smokes/anchoredSmokeRunner.ts`, `scripts/verify-real-provider-task-loop-mvp.mjs`, `scripts/real-provider-smokes/taskLoopRunner.ts`, `liveProviderSmokeResult.ts`, `anchoredProviderSmoke*.ts`.
- Upstream dependencies: explicit live opt-ins, provider readiness, isolated test roots, fake-ready or real provider env boundary.
- Downstream consumers: Harness / Eval, Session / Continue evidence, readiness claims.
- What works: Route 199 live provider-called no-write smoke; default safe-skip behavior; fake-ready provider-called boundary tests.
- What does not work: Route 200 live task-loop provider/apply/verification closure.
- Evidence level: `live-provider-called` for Route 199; `default-safe-skip` for defaults; `fake-ready-boundary` for fake-ready wiring.
- Internal defects: task-loop scorecard can exist while provider call is false.
- Boundary risks: Route 200 can be mislabeled if only its gate name is read.

## Proposal / Review

- Responsibility: normalize generated/provider/repair proposals, review hunks, select exact hunks, and gate handoff.
- Main files/modules: `generatedEditProposal.ts`, `providerEditProposal.ts`, `contextAwareProviderProposal.ts`, `providerAnchoredProposal.ts`, `editProposalReview.ts`, `editProposalSelection.ts`, `editProposalApply.ts`, `proposalHunkSet.ts`.
- Upstream dependencies: provider/generated/repair proposal manifest, current safe-read matches, selection confirmation.
- Downstream consumers: Fenced Edit, Target Set, Proposal Hunk Set, Result Surface, Session / Continue.
- What works: no-write proposal manifests, review-required states, explicit selection, single-target/target-set/hunk-set handoff.
- What does not work: proposal review does not itself apply, and provider output does not grant mutation.
- Evidence level: `focused-unit-tests`.
- Internal defects: multiple proposal kinds require careful state separation.
- Boundary risks: review/selection can be confused with write authorization.

## Anchoring

- Responsibility: extract anchors from provider output, match against current safe-read content, detect conflicts, classify anchor quality, create anchored proposal manifests.
- Main files/modules: `providerAnchorCandidate.ts`, `providerProposalAnchors.ts`, `providerAnchorMatcher.ts`, `providerAnchorConflict.ts`, `providerAnchorQuality.ts`, `providerAnchoredProposal.ts`, `providerAnchoringResult.ts`, `anchoredProposalRuntime.ts`, `anchoredProposalEval.ts`, `anchoredProposalScorecard.ts`.
- Upstream dependencies: validated provider output, explicit target labels, current content by target label.
- Downstream consumers: Proposal Review, Plan Quality, Provider Smoke, Harness / Eval.
- What works: exact-ready, review-only, unsafe/failed classification and no-write anchored proposal evidence.
- What does not work: broad fuzzy anchoring and arbitrary multi-file semantic anchoring are not proven.
- Evidence level: `live-provider-called` for Route 199 exact-ready no-write; `focused-unit-tests` otherwise.
- Internal defects: exact anchor safety is narrow by design.
- Boundary risks: exact-ready means handoff-readiness, not mutation authority.

## Edit / Apply

- Responsibility: execute bounded selected-workspace mutations through explicit routes and preserve truthful changed/failed/unattempted evidence.
- Main files/modules: `editPatchModule.ts`, `fencedEditRoute.ts`, `targetSetEditRoute.ts`, `proposalHunkSetRoute.ts`, `exactHunkApply.ts`, `editProposalApply.ts`, `patchResult/workspaceWriteRoute.ts`, `patchApplication/singleFileUpdateApply.ts`, `patchApplication/singleFileCreateApply.ts`, `patchApplication/twoFileUpdateApply.ts`, `mutationExecution.ts`, `patchMutationLane.ts`.
- Upstream dependencies: explicit target/mapping/patch, approval, workspace authority, final stale-read, selected-workspace write opt-in.
- Downstream consumers: Verification, Repair, Result Surface, Session / Continue.
- What works: exact fenced replacement, selected-workspace single-file update, single-file create candidate, exactly-two-file update candidate, exact hunk-set apply, stopped unsupported paths, partial-failure surface.
- What does not work: broad/fuzzy apply_patch, delete/move as default release ability, arbitrary project mutation, automatic rollback, AST edit, general multi-file refactor.
- Evidence level: `focused-unit-tests`; `fake-provider`/synthetic candidate gates for candidate mutation; no `live-provider-apply` claim in Route 201.
- Internal defects: older direct mutation branch remains in `runMvpIntegratedFlow.ts` beside newer bounded routes.
- Boundary risks: candidate write support can be overstated as broad write support.

## Snapshot / Recovery

- Responsibility: capture pre-write snapshot authority, expose rollback readiness, preview/apply explicit restore, preserve no automatic rollback claim.
- Main files/modules: `editSnapshot.ts`, `editRecoveryPlan.ts`, `editRecoveryApply.ts`, `editRecoveryOutcome.ts`, `editRecoveryResult.ts`, `editRollback.ts`, `patchRecovery/*`, `targetSetEditRecoveryWorkflow.ts`, `targetSetEditRecovery.ts`.
- Upstream dependencies: workspace write routes, recovery authority store, target paths, snapshot ids.
- Downstream consumers: Result Surface, Session / Continue, Harness / Eval.
- What works: snapshot receipt, rollback readiness projection, explicit restore seams, recovery workflow handoff.
- What does not work: automatic rollback and broad transaction atomicity are not claimed.
- Evidence level: `focused-unit-tests`.
- Internal defects: partial failure can require manual inspection and explicit recovery.
- Boundary risks: rollback-ready can be mistaken for rollback-executed.

## Verification / Runtime

- Responsibility: plan low-risk verification, execute allowlisted verification commands through tool runtime, classify verification failures, produce receipts.
- Main files/modules: `verificationModule.ts`, `lowRiskVerificationPlanning.ts`, `verificationCommandPlan.ts`, `verificationCommandRunner.ts`, `verificationCommandResult.ts`, `verificationFailureClassifier.ts`, `toolRuntimeModule.ts`, `runtimeReceipt.ts`, `runtimeReceiptProjection.ts`.
- Upstream dependencies: changed files, explicit verify intent, command allowlist, tool dispatcher, runtime receipts.
- Downstream consumers: Repair, Result Surface, Session / Continue, Harness / Eval.
- What works: file content/unchanged/consistency readback checks, allowlisted command verification, retry projection, blocked/failed/passed classification.
- What does not work: arbitrary shell verification by default, provider-assisted verification, broad test inference.
- Evidence level: `focused-unit-tests`.
- Internal defects: low-risk verification is still wired in `runMvpIntegratedFlow.ts`.
- Boundary risks: skipped or blocked verification must not become success unless the result contract explicitly allows caveated success.

## Repair

- Responsibility: create safe repair context and no-write repair proposals from failed apply or verification evidence.
- Main files/modules: `editRepairContext.ts`, `editRepairProposal.ts`, `editRepairPlanner.ts`, `editRepairResult.ts`, `verificationRepairContext.ts`, `verificationRepairPlanner.ts`, `verificationRepairResult.ts`, `verificationRepairLoop.ts`, `verificationRepairBridge.ts`.
- Upstream dependencies: failed files, verification result, runtime receipts, context packet, Agent Plan, provider/fake provider availability.
- Downstream consumers: Proposal Review, Hunk Set Apply, Result Surface, Session / Continue.
- What works: no-write repair planning, review-required proposals, explicit hunk-set handoff readiness.
- What does not work: automatic repair mutation, provider calls during apply, broad/fuzzy repair apply.
- Evidence level: `focused-unit-tests`.
- Internal defects: repair readiness can be confused with repair execution.
- Boundary risks: repair proposals must not be counted as changed files.

## Result Surface

- Responsibility: map capability results to truthful terminal success/stopped/error and user-facing result surfaces.
- Main files/modules: `resultMapper.ts`, `resultSurfaceModule.ts`, `actionableBlockerModule.ts`, `capabilityResultClassification.ts`, `terminalClassificationProjection.ts`, `sessionTerminalState.ts`, `sessionStateSurface.ts`.
- Upstream dependencies: coding result, verification, changed/failed/unverified/planned files, actionable blockers.
- Downstream consumers: CLI terminal display, SessionManager persistence, `/continue`.
- What works: stopped/error mapping for blocked verification, partial mutation, hard tool failures, insufficient evidence, approval/MCP blockers.
- What does not work: full prevention of drift is not proven outside covered gates.
- Evidence level: `focused-unit-tests` plus `rtk npm run verify:result-contract` when run.
- Internal defects: final truthfulness is concentrated in a small set of high-impact files.
- Boundary risks: terminal success false positive remains a systemic risk if new routes bypass result mappers.

## Session / Continue

- Responsibility: persist sessions/transcripts/state, build continuity snapshots, compact summaries, stopped guidance, and resume/continue flows.
- Main files/modules: `SessionManager.ts`, `stoppedSessionContinuity.ts`, `compactContinuitySummary.ts`, `sessionStateSurface.ts`, `continueShellActionRuntime.ts`, `sessionFutureTurnProjection.ts`, `sessionPersistenceProjection.ts`.
- Upstream dependencies: Query events, coding results, approval/tool provenance, mutation continuity, recovery snapshots.
- Downstream consumers: CLI `/sessions`, `/resume`, `/continue`, future-turn injections.
- What works: current-session selection, continuity snapshots, stopped failure handoff, changed/failed/planned file summaries, approval memory, compact summary builder.
- What does not work: broad long-session live-provider behavior is not proven by Route 201 evidence.
- Evidence level: `focused-unit-tests`.
- Internal defects: `SessionManager.ts` remains a 2659-line central persistence composition root.
- Boundary risks: compact/replay can drift if capability evidence fields change without parity tests.

## Harness / Eval

- Responsibility: run deterministic/focused gates, print markers, classify failure, handle redaction/residue, and report gate scope.
- Main files/modules: `scripts/verify-context-planning.mjs`, `scripts/verify-edit-capability-closeout.mjs`, `scripts/verify-result-contract.mjs`, `scripts/verify-release-deterministic.mjs`, `scripts/verify/index.mjs`, `scripts/verify/*`, `scripts/real-user-capabilities/*`.
- Upstream dependencies: package scripts, isolated test roots, selected cases/tier/suite flags.
- Downstream consumers: release/dogfood/readiness claims.
- What works: broad focused gates, deterministic release meta gate, split real-user capability verifier modules, dry-run safety facts.
- What does not work: gates can still be misunderstood as broad release or live provider proof.
- Evidence level: `focused-unit-tests` and `default-safe-skip`.
- Internal defects: verifier scope is large even after decomposition.
- Boundary risks: passing gate names can be overread without case/evidence labels.

## Browser

- Responsibility: browser planning, runtime availability, policy boundaries, transaction trace/report facts, cleanup and safe observation.
- Main files/modules: `browserModule.ts`, `core/context/browser*.ts`, `core/context/pwRuntime.ts`, `core/harness/browserTxnEval.ts`.
- Upstream dependencies: browser prompt plan, runtime status, browser policy, optional controlled runtime.
- Downstream consumers: Agent Loop, Result Surface, Harness / Eval, Session / Continue.
- What works: local deterministic browser transaction surfaces and result projection at summary level.
- What does not work: broad public-web/browser live readiness is not claimed here.
- Evidence level: `focused-unit-tests` or `scaffold-only` depending path.
- Internal defects: browser route is summarized here only; no browser gate was run for Route 201.
- Boundary risks: controlled/local browser evidence must not imply external browser readiness.

## CLI / UX

- Responsibility: parse CLI args, select stdin/print/interactive/replay modes, bootstrap runtime/session, route slash commands, bridge approval prompts.
- Main files/modules: `cli.tsx`, `cliArgs.ts`, `cliModeDispatch.ts`, `cliRuntimeModule.ts`, `cliPrintModeRunner.ts`, `cliStdinModeRunner.ts`, `cliSessionModule.ts`, `cliWorkspaceModule.ts`, `cliPermissionModule.ts`, `cliApprovalModule.ts`, `slashCommandRegistry.ts`.
- Upstream dependencies: process args/stdin, runtime config, SessionManager, provider credential resolution, MCP gateway.
- Downstream consumers: ShellSessionRuntime, Session / Continue, MCP surface, permission surface.
- What works: print/stdin/interactive route wiring, slash command registry, session/workspace/mcp/permission command surfaces.
- What does not work: `cli.tsx` remains an 821-line entrypoint with substantial wiring.
- Evidence level: `focused-unit-tests` when CLI baseline/entry gates run.
- Internal defects: entrypoint-specific drift remains possible because CLI owns many bridges.
- Boundary risks: CLI mode differences can bypass shared runtime if new behavior is wired locally.

## Workspace / File Context

- Responsibility: normalize workspace target facts, authority summaries, stale-read summaries, safe labels, and read/write boundary projections.
- Main files/modules: `workspaceFileContract.ts`, `workspaceTargetProjection.ts`, `patchResult/workspaceAuthority.ts`.
- Upstream dependencies: selected workspace root, target path, filesystem status.
- Downstream consumers: Read / Context, Edit / Patch, Session / Continue, Result Surface.
- What works: read/write distinction, out-of-workspace, symlink, missing target, final stale-read, safe labels.
- What does not work: workspace context does not provide semantic discovery or write authorization by itself.
- Evidence level: `focused-unit-tests`.
- Internal defects: authority facts are split between read summaries and write route checks.
- Boundary risks: workspace-safe read must not be treated as mutation authority.

## Permission / Policy

- Responsibility: preserve approval, write authority, command allowlist, MCP/browser/provider opt-in and denial/provenance facts.
- Main files/modules: `approvalTrustPolicy.ts`, `approvalPromptBridge.ts`, `approvalFlow.ts`, `permissionContext.ts`, `approvalAuthorityProjection.ts`, `patchResult/workspaceAuthority.ts`, `patchResult/boundedWritePolicy.ts`, `browser*Policy.ts`.
- Upstream dependencies: CLI approval mode, user decision, trust policy, workspace root, command/tool/provider/browser request.
- Downstream consumers: Tool runtime, Edit / Patch, Browser, Provider, Result Surface, Session / Continue.
- What works: explicit approval request/decision provenance, selected-workspace authority, default real-provider skip, MCP error taxonomy.
- What does not work: no single universal policy outcome vocabulary covers every capability.
- Evidence level: `focused-unit-tests` and `default-safe-skip`.
- Internal defects: policy outcome interpretation is spread across CLI, tool, workspace, browser, provider, and result modules.
- Boundary risks: prompt text must not imply approval or write authority.
