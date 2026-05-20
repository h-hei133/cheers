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

## Route 155 Execution / Result Facade Plan

Route 154 completed the first owner-module pass:

- Workspace / File Context facade: `readInspectModule.ts`
- Result Surface / Verification facade: `verificationModule.ts`
- Session / Continue facade: `continuationModule.ts`

Route 155 continues with heavier execution/result handoffs while keeping
`runMvpIntegratedFlow.ts` as Agent Loop composition root. This section records
the target clusters before code movement.

| Heavy responsibility cluster | Current direct owner in `runMvpIntegratedFlow.ts` | True owner module | Target facade | Route 155 decision | Why this owner | Validation required | Stop condition |
|---|---|---|---|---|---|---|---|
| Browser plan, transaction, observation, result, and evidence handoff | direct imports from `core/context/browser*`, `flowResultProjection.ts`, and `flowEvidenceProjection.ts` | Browser Engineering | `browserModule.ts` | extract now | Browser policy/result/evidence redaction is capability-owned; Agent Loop should consume browser handoff facts. | browser facade test, browser adjacent tests where focused, full runMvp, result-contract | stop if extraction changes browser availability, public-web behavior, action policy, or transaction execution |
| Tool dispatch lifecycle and provenance handoff | direct imports of `dispatchToolWithLifecycle`, `ToolLifecycleResult`, and coding provenance summary | Tool Engineering / Runtime Engineering | `toolRuntimeModule.ts` | extract now | Tool execution lifecycle, approval events, and provenance summaries are Tool/Runtime-owned surfaces consumed by Agent Loop. | tool runtime facade test, `flowDispatch.test.ts`, full runMvp, result-contract | stop if command allowlist, approval, permission, sandbox, or dispatch order changes |
| Generic runtime/result surface construction | direct imports of `projectRuntimeCodingOutcome`, `projectBlockedRuntimeOutcome`, and `projectTurnResultHandoff` | Result Surface Engineering | `resultSurfaceModule.ts` | extract now | Runtime coding outcomes and turn result handoff are result-surface compatibility objects, not Agent Loop internals. | result facade test, runtime outcome / turn kernel tests, full runMvp, result-contract | stop if terminal classification, result truthfulness, schema, or transcript fields change |
| Provider diagnostic handoff projection | direct import of `projectProviderOutcome` in planning | Provider / Model Engineering | `providerModule.ts` | extract now | Provider diagnostic continuity is provider-owned data projection; Agent Loop should not depend on provider helper fragments. | provider facade test, provider outcome projection test, full runMvp | stop if provider live/config reads, auth behavior, model selection, or opt-in gates change |
| Edit execution/result handoff | direct mutation execution and reconciliation calls | Edit / Patch Engineering | future `editExecutionModule.ts` or `editPatchModule.ts` consolidation | defer | This touches stale-read/write-authority and writer result semantics; Route 155 can validate adjacent edit gates without changing writer behavior. | edit closeout if later touched | stop for any writer behavior, workspace authority, stale-read, or mutation-order change |
| Runtime receipt consumer adoption | direct runtime outcome consumption | Runtime Engineering / Result Surface Engineering | future runtime receipt consumer facade | defer | Route 150 receipt adoption should be a separate focused result/session route. | runtime receipt tests + result-contract | stop for protocol/schema/runtime execution change |

Route 155 classifies `runMvpIntegratedFlow.ts` as still acceptable only if,
after extraction, it retains Agent Loop composition duties and no longer owns
the selected heavy result/evidence details directly.

## Route 155 Extraction Result

Extracted heavy clusters:

- Browser Engineering: `browserModule.ts`
  - moved browser plan detection and the browser execution/result handoff
    behind a browser-owned facade
  - `runMvpIntegratedFlow.ts` no longer constructs browser continuation,
    transaction, observation, result, or evidence details directly
- Tool / Runtime Engineering: `toolRuntimeModule.ts`
  - moved tool lifecycle dispatch and coding-result provenance creation /
    summary behind a Tool / Runtime facade
  - `runMvpIntegratedFlow.ts` still decides when tools are called, but does not
    import dispatch/provenance helper fragments directly
- Result Surface Engineering: `resultSurfaceModule.ts`
  - moved runtime coding outcome, blocked runtime outcome, and turn result
    handoff access behind a Result Surface facade
  - result truthfulness and schema remain unchanged
- Provider / Model Engineering: `providerModule.ts`
  - moved provider diagnostic handoff projection behind a provider-owned facade
  - no provider live/config reads or auth behavior changes

Deferred after Route 155:

- edit execution facade adoption
- runtime receipt consumer adoption beyond the current result-surface handoff
- broad intent-planner movement
- deeper generic result fallback extraction inside individual capability
  branches

Route 155 classification:

`runMvpIntegratedFlow.ts` is acceptable as the Agent Loop composition root for
now. It still contains large branch bodies, but the selected heavy
browser/tool/provider/result details are now module-owned facades. Further work
should target one explicit remaining branch family at a time, not a broad
rewrite.
