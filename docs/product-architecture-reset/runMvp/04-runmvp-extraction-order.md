# runMvp Extraction Order

The order is aggressive but avoids mixing unrelated concerns. Each phase should
land as behavior-preserving code with compatibility shims and focused tests.

## Phase 1: Entrypoint And Runtime Environment Wrapper

Goal:

- Move public implementation behind product turn files while preserving the
  legacy import path.

Move:

- `MvpIntegratedFlowOptions`
- `runMvpIntegratedFlow`
- `streamMvpIntegratedFlow`
- environment assembly
- apply_patch runtime bridge
- workspace no-write read helper
- `createIntegratedRunner` shell

Destination:

- `turn/integratedTurnEntrypoint.ts`
- `turn/integratedTurnCoordinator.ts`
- `turn/turnRuntimeEnvironment.ts`
- `edit/applyPatchRuntimeBridge.ts`

Compatibility:

- `orchestration/runMvpIntegratedFlow.ts` re-exports and delegates.
- `turn/turnFacade.ts` remains compatible.

Tests:

- runMvp full suite
- turn facade tests
- fenced edit stream tests
- build

Stop conditions:

- Any stream event ordering drift.
- Any apply_patch no-write or permission default drift.

Expected reduction:

- `runMvpIntegratedFlow.ts` stops owning environment setup and public turn
  orchestration.

## Phase 2: Provider, Browser, Lifecycle, Proposal, Planning Runtime Handoffs

Goal:

- Extract high-priority handoff branches that already have domain modules.

Move:

- provider draft stage
- browser plan/execute branch adapter
- planning runtime route branch
- task lifecycle activation branch
- anchored proposal runtime branch
- `readAnchoredProposalCurrentContent`

Destination:

- `provider/providerDraftStage.ts`
- `turn/stages/browserStage.ts`
- `planning/planningRuntimeStage.ts`
- `turn/stages/lifecycleStage.ts`
- `proposal/anchoredProposalStage.ts`

Compatibility:

- Keep current fake/synthetic provider behavior.
- Keep no-provider inspect flow provider-free.
- Keep anchored proposal fake dry-run.

Tests:

- runMvp provider/no-write inspect cases
- anchored proposal runtime test
- task lifecycle activation tests
- browser harness tests if browser stage wiring changes

Stop conditions:

- Any provider call appears on default no-write/read-only path.
- Any browser unavailable/policy-blocked result becomes success.

Expected reduction:

- Major route branches leave the turn executor before deeper planning changes.

## Phase 3: Workflow Intent, Target, And Command Policy Planning

Goal:

- Split `buildWorkflowTaskPlan` into planning-owned intent and target modules
  without changing plan output.

Move:

- `WorkflowTaskIntentSignals`
- `extractWorkflowTaskIntentSignals`
- prompt target projection
- read/write/verify/diagnosis/command cue classification
- unsupported command policy
- mutation target selection where it affects plan selection

Destination:

- `planning/workflowIntentSignals.ts`
- `planning/promptTargetProjection.ts`
- `planning/workflowTaskPlan.ts`
- `policy/commandIntentPolicy.ts`
- `edit/mutationTargetSelection.ts`

Compatibility:

- Keep `WorkflowTaskPlan` shape and evidence strings stable.
- Keep existing `workflowTaskPlanner.ts` type exports until downstream imports
  migrate.

Tests:

- runMvp full suite
- command blocker tests
- read/diagnosis tests
- target resolution tests
- planning runtime no-write tests

Stop conditions:

- Multi-suffix target resolution drifts.
- Unsupported command blockers become generic or success-like.

Expected reduction:

- Planning regex and target logic leaves turn execution.

## Phase 4: Context Read, Repo Explain, And Read Continuation

Goal:

- Move read-only context execution and delivery into context-owned modules.

Move:

- read delivery builders
- read window and fragment continuation
- inspect-files stage
- repo-explain stage
- context packet branch
- read continuation relocation evidence

Destination:

- `context/readDeliveryProjection.ts`
- `context/readWindowContinuation.ts`
- `context/repoInspectStage.ts`
- `context/repoExplainStage.ts`
- `turn/stages/contextReadStage.ts`

Compatibility:

- Result projection still goes through current result surface.
- Read-only paths keep changedFiles empty and verification not-run/not-requested.

Tests:

- runMvp read/inspect/repo-explain cases
- no-write real-mode inspect cases
- focused context packet tests if available

Stop conditions:

- Read-only flow consumes provider config.
- Read-only output upgrades to completion without grounded delivery evidence.

Expected reduction:

- Read/repo diagnosis branch leaves the monolithic executor.

## Phase 5: Edit, Mutation, And Repair Planning

Goal:

- Extract write/edit planning and repair planning while preserving authority
  gates.

Move:

- discovery edit stage
- fenced edit stage
- mutation instruction generation
- stale-read/readback stage
- low-risk rename/refactor and secondary writes
- single-file repair context
- cross-file repair candidate and degraded reopen logic
- grounded answer repair and staged repair helpers

Destination:

- `edit/discoveryEditStage.ts`
- `edit/fencedEditStage.ts`
- `edit/mutationInstructionPlanner.ts`
- `edit/staleReadMutationStage.ts`
- `edit/lowRiskMutationPlanner.ts`
- `repair/singleFileRepairContext.ts`
- `repair/crossFileRepairPlanning.ts`
- `repair/degradedReopenPlanning.ts`
- `repair/groundedAnswerRepair.ts`
- `repair/stagedRepairProjection.ts`
- `turn/stages/mutationStage.ts`
- `turn/stages/repairStage.ts`

Compatibility:

- Writes still require explicit authority.
- Prompt text does not imply write authorization.
- Patch failure codes and blocked wording remain stable.

Tests:

- runMvp edit/write/repair cases
- fenced edit activation tests
- edit facade tests
- repair facade tests
- workspace authority/write policy tests if touched

Stop conditions:

- Any dry-run, preview, denied, skipped, partial, or not-run path reports write
  success.
- Any stale-read check is skipped before writer.

Expected reduction:

- Largest mutation and repair chunks leave the executor.

## Phase 6: Verification And Direct Command Stages

Goal:

- Extract verification and command execution semantics after edit stages are
  isolated.

Move:

- direct run-command execution branch
- command allowlist gate
- verify command detection
- verification plan execution and retries
- content/unchanged assertions
- consistency verification
- verify continuation object planning

Destination:

- `turn/stages/commandStage.ts`
- `policy/commandAuthorityGate.ts`
- `verification/verifyCommandIntent.ts`
- `verification/verificationStage.ts`
- `verification/contentAssertionVerification.ts`
- `verification/consistencyVerification.ts`
- `verification/verifyContinuationPlanning.ts`

Compatibility:

- Verification not-run/skipped/blocked/failed stay distinct.
- Apply without verification does not become success when verification is
  required.

Tests:

- runMvp command/verify tests
- verification facade tests
- task relevant verification route tests
- result contract

Stop conditions:

- Verification command authority is inferred from prompt text alone.
- One file passing hides another file failure.

Expected reduction:

- Verification and command responsibility leaves turn executor.

## Phase 7: Evidence, Result, And Session Handoff Projection

Goal:

- Move evidence collection and final result projection behind product result
  and evidence facades.

Move:

- `FreshnessObservability`
- `buildFreshnessObservability`
- evidence ledger append patterns
- `appendSingleFileEditRepairObservability`
- final `projectWorkflowTurnHandoff` integration
- git change set attribution call

Destination:

- `evidence/freshnessEvidence.ts`
- `evidence/turnEvidenceLedger.ts`
- `result/workflowRuntimeProjection.ts`
- `result/terminalVerdictProjection.ts`
- `session/turnContinuationFacts.ts`

Compatibility:

- Current `resultSurfaceModule.ts` remains output-compatible.
- `evidence/verdictFacade.ts` is adapter-only until parity is proven.

Tests:

- runMvp full suite
- evidence/verdict facade tests
- result contract
- Route221 anti-false-success gate
- session result parity tests

Stop conditions:

- Any stopped, partial, blocked, skipped, not-run, no-provider, or not-proven
  state becomes success.
- Redaction or cleanup semantics weaken.

Expected reduction:

- Turn stages return domain receipts; result/evidence modules own terminal truth.

## Phase 8: Wrapper Cleanup And Consumer Migration

Goal:

- Leave `runMvpIntegratedFlow.ts` as a compatibility wrapper and migrate direct
  product consumers to `turn/`.

Move:

- remaining shared string/path helpers into owning modules
- planner/reviewer canned role outputs if still local
- direct consumers in product code, not route/history tests

Destination:

- `turn/integratedTurnEntrypoint.ts`
- owning domain modules identified in prior phases

Compatibility:

- Legacy tests can still import `orchestration/runMvpIntegratedFlow.js`.
- Product runtime should import `turn/` facade or turn entrypoint.

Tests:

- runMvp full suite
- product CLI entry gate if imports change
- import boundary scan
- build

Stop conditions:

- Wrapper still contains planning/execution policy after cleanup.
- Product runtime imports route history, docs, scripts, or dev-history artifacts.

Expected reduction:

- `runMvpIntegratedFlow.ts` becomes a small compatibility file.
