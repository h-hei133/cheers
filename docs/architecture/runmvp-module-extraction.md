# runMvp Module Extraction

Route: `docs/agent-routes/route154-runmvp-module-facades.md`

This document records the first owner-module extraction pass for
`packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`.

The route is behavior-preserving. `runMvpIntegratedFlow.ts` remains the Agent
Loop composition root. Module-specific read/inspect/workspace, verification,
and continuation details now enter through module-owned facades instead of
direct helper fragments.

## Responsibility Migration Table

| Current code block / responsibility | Current owner file | True owner module | Target facade or file | Migration decision | Reason | Validation required | Risk |
|---|---|---|---|---|---|---|---|
| Turn setup, dispatcher construction, model adapter wiring, MCP gateway, workflow execution ordering | `runMvpIntegratedFlow.ts` | Agent Loop Engineering | `runMvpIntegratedFlow.ts` | leave in Agent Loop | This file should still compose the turn and call module facades. | full `runMvpIntegratedFlow.test.ts`, build | medium: high-touch composition root |
| Intent signal aggregation and final task-plan ordering | `runMvpIntegratedFlow.ts`, `workflowTaskPlanner.ts`, `workflowIntentProjection.ts` | Agent Loop Engineering | deferred Agent Loop planner facade | defer | The block is large and order-sensitive; Route 154 only starts owner facade migration. | future characterization tests before movement | high: ordering changes can alter user-visible routing |
| Read intent classification, path-only read detection, read continuation target recovery | `readInspectIntent.ts`, `readContinuationTarget.ts`, direct calls from `runMvpIntegratedFlow.ts` | Workspace / File Context Engineering | `readInspectModule.ts` | facade existing helpers | Existing helpers already own read/workspace facts; the facade gives Agent Loop one stable read/inspect entrypoint. | `agentLoopModuleBoundary.test.ts`, read/inspect adjacent tests, runMvp | low: pure projections plus filesystem target recovery |
| Repo explain candidate parsing, evidence target selection, diagnosis disposition/evidence role | `repoExplainEvidence.ts`, direct calls from `runMvpIntegratedFlow.ts` | Workspace / File Context Engineering | `readInspectModule.ts` | facade existing helpers | Repo explain is a read/inspect evidence responsibility, not Agent Loop composition. | `agentLoopModuleBoundary.test.ts`, runMvp | low: wrapper-only facade |
| Missing, ambiguous, and out-of-workspace read target stopped surfaces | `workspaceTargetProjection.ts`, direct calls from `runMvpIntegratedFlow.ts` | Workspace / File Context Engineering | `readInspectModule.ts` | facade existing helpers | Target authority/stopped facts are workspace-owned; Agent Loop should consume the stopped surface. | `agentLoopModuleBoundary.test.ts`, workspace target tests, result-contract | low: projection-only |
| Verification tail stripping for mutation target selection | `verificationPlanner.ts`, direct call from `runMvpIntegratedFlow.ts` | Result Surface / Verification Engineering | `verificationModule.ts` | facade existing helpers | Verification-owned prompt tail handling should be hidden behind the verification facade. | `agentLoopModuleBoundary.test.ts`, verification planner tests, runMvp | low |
| Verification plan, retry decision, command/skipped/not-requested projection, verification evidence | `verificationPlanner.ts`, `verificationResultProjection.ts`, `flowEvidenceProjection.ts`, direct calls from `runMvpIntegratedFlow.ts` | Result Surface / Verification Engineering | `verificationModule.ts` | extract now | Agent Loop should request verification planning/projection without importing internal result/evidence fragments. | `agentLoopModuleBoundary.test.ts`, verification adjacent tests, result-contract, runMvp | medium: evidence surface participates in result/session truthfulness |
| Continuation intent, replay-safe lineage, target derivation, lineage activation projection | `continuationIntent.ts`, `continuationLineage.ts`, `continuationProjection.ts`, `continuationPlanning.ts`, direct calls from `runMvpIntegratedFlow.ts` | Session / Continue Engineering | `continuationModule.ts` | extract now | Continuation redaction, lineage, and target recovery belong to Session / Continue; Agent Loop should consume safe lineage facts. | `agentLoopModuleBoundary.test.ts`, continuation adjacent tests, runMvp | medium: continuation ordering remains in Agent Loop |
| Repair and verify continuation object construction | `continuationPlanning.ts`, direct calls from `runMvpIntegratedFlow.ts` | Session / Continue Engineering | `continuationModule.ts` | facade existing helpers | Structured continuation objects are Session / Continue handoff facts, not Agent Loop helper fragments. | continuation tests, runMvp | medium |
| Edit expectation classification and current/future edit contracts | `editExpectationContract.ts`, `editPatchModule.ts`, direct calls from `runMvpIntegratedFlow.ts` | Edit / Patch Engineering | `editPatchModule.ts` | defer | A facade exists, but current runMvp planning still threads edit expectation into order-sensitive target selection. | edit closeout before further adoption | medium: do not expand edit/write behavior |
| Current bounded mutation execution and patch application | `mutationExecution.ts`, `patchMutationLane.ts`, `patchResult/*`, direct calls from `runMvpIntegratedFlow.ts` | Edit / Patch Engineering | future edit execution facade | defer | Execution movement would touch stale-read/write-authority semantics and is outside this route. | edit closeout, runMvp, result-contract | high |
| Command/tool dispatch and lifecycle projection | `flowDispatch.ts`, direct calls from `runMvpIntegratedFlow.ts` | Tool Engineering | existing `flowDispatch.ts`; future tool module facade | defer | Dispatch already has a boundary; broader tool-result unification is separate work. | flowDispatch tests, runMvp | medium |
| Runtime receipt consumption and blocked/runtime outcome projection | `runtimeOutcomeProjection.ts`, direct calls from `runMvpIntegratedFlow.ts` | Runtime Engineering / Result Surface | future runtime/result facade | defer | Route 150 defined receipt vocabulary; adopting more handoffs should be its own narrow route. | result-contract, runtime adjacent tests | medium |
| Browser plan, transaction handoff, observation/result/evidence projection | `core/context/browser*`, `flowResultProjection.ts`, `flowEvidenceProjection.ts` | Browser Engineering | future browser module facade | defer | Browser behavior is explicit opt-in and should not be widened during runMvp facade extraction. | browser transaction gate if touched | high |
| Provider diagnostic handoff and model adapter execution | `providerOutcomeProjection.ts`, `OpenAIModelAdapter`, direct calls from `runMvpIntegratedFlow.ts` | Provider / Model Engineering | future provider module facade | defer | No provider live/config behavior changes in this route; diagnostic projection can be facaded later. | provider-readiness focused tests if touched | high |
| Result/evidence/transcript projection and fallback stopped result construction | `runtimeOutcomeProjection.ts`, `flowResultProjection.ts`, `flowEvidenceProjection.ts`, `turnKernel.ts`, direct construction in `runMvpIntegratedFlow.ts` | Result Surface Engineering | future result surface facade | defer | Result truthfulness needs dedicated coverage; Route 154 only facades targeted clusters. | result-contract, runMvp | high |
| Test-only deterministic paths | `runMvpIntegratedFlow.ts` and focused tests | Harness / Eval | do not move | do not move | Test determinism supports existing gates; moving it now adds risk without product value. | runMvp, build | low |

## Extracted Facades

### Workspace / File Context: `readInspectModule.ts`

Owns read/inspect classification, path-only read detection, read-continuation
target recovery, repo-explain evidence selection, diagnosis metadata, and
read/workspace target stopped surfaces.

`runMvpIntegratedFlow.ts` no longer imports `readInspectIntent.ts`,
`readContinuationTarget.ts`, `repoExplainEvidence.ts`, or the read-target
stopped projections directly.

### Result Surface / Verification: `verificationModule.ts`

Owns verification prompt tail handling, verification plan/retry decisions,
command/skipped/not-requested verification projections, and verification
evidence projection.

`runMvpIntegratedFlow.ts` now consumes verification through the module facade
instead of importing planner/result/evidence helper fragments directly.

### Session / Continue: `continuationModule.ts`

Owns continuation intent, replay-safe lineage, target derivation, lineage
activation projection, repair/verify continuation objects, local explain/read
fragment evidence checks, and verify-resume facts.

`runMvpIntegratedFlow.ts` still decides turn ordering, but continuation facts
are provided through a Session / Continue facade.

## What Remains In Agent Loop

- constructing the turn runtime and dispatcher
- selecting the order in which module facts are consumed
- composing the `WorkflowTaskPlan`
- executing capability branches
- aggregating receipts, notes, evidence, and final handoff

## Deferred Boundaries

- edit execution facade adoption
- browser module facade
- provider diagnostic/execution facade
- generic result surface handoff
- runtime receipt consumer adoption
- broad intent-planner movement

These are deferred because they would touch execution semantics, result
truthfulness, provider/browser/edit boundaries, or order-sensitive planning.
