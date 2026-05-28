# File Size And Fan-in Map

Audit date: 2026-05-28.

Scope: `packages/ts-shell/src`. Current code is the authority. Test files are
listed separately from product files because the route question is product
architecture concentration.

## Product Largest Files

| Rank | File | Lines | Fan-in | Fan-out | Classification |
| --- | --- | ---: | ---: | ---: | --- |
| 1 | `orchestration/patchResult/mixedFileWriteRoute.ts` | 1717 | 2 | 10 | partial monolith, future edit route |
| 2 | `planning/workflowTaskPlan.ts` | 1672 | 1 | 28 | partial new monolith, Phase 3 blocker |
| 3 | `orchestration/patchResult/perFilePatchPlan.ts` | 1596 | 17 | 8 | heavy owner, future edit route |
| 4 | `orchestration/claimLedgerProjection.ts` | 1460 | 7 | 2 | evidence compatibility owner, future evidence/result route |
| 5 | `runtime/workflowExecutionCoordinator.ts` | 1358 | 0 | 47 | partial new monolith, Phase 3 blocker |
| 6 | `orchestration/approvalAuthorityProjection.ts` | 1145 | 5 | 3 | heavy policy projection owner |
| 7 | `edit/mutationInstructionPlanner.ts` | 1114 | 7 | 5 | heavy edit owner |
| 8 | `orchestration/planningRuntimeProductProposal.ts` | 1075 | 2 | 12 | route-era proposal bridge, future provider/proposal route |
| 9 | `core/shell/sessionTerminalState.ts` | 1073 | 2 | 10 | terminal surface owner, watch |
| 10 | `session/SessionManager.ts` | 926 | 33 | 47 | session facade plus partial monolith |

Test concentration is still significant: `orchestration/runMvpIntegratedFlow.test.ts`
is 8289 lines, `cli-baseline.test.ts` is 5688 lines, and
`session/SessionManager.test.ts` is 3876 lines. Those are validation debt, but
not proof that product runtime concentration remains in the old files.

## Product High Fan-in

| File | Lines | Fan-in | Fan-out | Classification |
| --- | ---: | ---: | ---: | --- |
| `orchestration/types.ts` | 302 | 118 | 0 | shared contract surface |
| `core/context/browserCapabilityModel.ts` | 168 | 108 | 1 | browser capability contract |
| `core/context/browserExecutionContract.ts` | 145 | 69 | 2 | browser execution contract |
| `core/query/events.ts` | 17 | 46 | 0 | event contract |
| `orchestration/workflowTaskPlanner.ts` | 154 | 39 | 3 | shared task-plan contract |
| `core/query/runtimeState.ts` | 234 | 36 | 0 | runtime state contract |
| `session/SessionManager.ts` | 926 | 33 | 47 | high fan-in session facade |
| `orchestration/patchRecovery/recoveryAuthorityStore.ts` | 513 | 32 | 5 | recovery authority owner |
| `renderer/StreamingRenderer.ts` | 42 | 31 | 0 | renderer contract |
| `core/tools/toolResultLifecycle.ts` | 137 | 30 | 0 | tool result contract |

High fan-in files are mostly contract/facade surfaces. The exception with
active concentration risk is `session/SessionManager.ts`, because it combines
high fan-in with high fan-out and 926 lines of implementation.

## Product High Fan-out

| File | Lines | Fan-in | Fan-out | Classification |
| --- | ---: | ---: | ---: | --- |
| `runtime/workflowExecutionCoordinator.ts` | 1358 | 0 | 47 | broad coordinator plus domain logic |
| `session/SessionManager.ts` | 926 | 33 | 47 | broad session facade plus implementation |
| `core/context/browserCommandRunner.ts` | 314 | 1 | 36 | browser command composition owner |
| `orchestration/contextGraphPlanning.ts` | 376 | 4 | 33 | planning/context bridge |
| `planning/workflowTaskPlan.ts` | 1672 | 1 | 28 | broad planning monolith |
| `entrypoints/cliRuntimeModule.ts` | 545 | 3 | 27 | CLI compatibility module |
| `core/context/browserExecutionCommandRunner.ts` | 240 | 1 | 27 | browser execution bridge |
| `orchestration/taskLifecycleActivation.ts` | 435 | 4 | 24 | lifecycle activation owner |
| `orchestration/realTaskLoopRuntime.ts` | 453 | 0 | 22 | route-era real task loop owner |
| `core/context/browserExternalNetworkExecutionBridge.ts` | 397 | 2 | 22 | browser external network bridge |

## Required Concentration Points

| File | Lines | Fan-in | Fan-out | Current judgment |
| --- | ---: | ---: | ---: | --- |
| `cli/bootstrap/cliProcessRunner.ts` | 167 | 1 | 14 | acceptable process coordinator |
| `cli/runtime/cliSessionRuntimeFactory.ts` | 66 | 1 | 12 | acceptable factory |
| `cli/interactive/interactiveCommandRouter.ts` | 253 | 1 | 18 | acceptable router with compatibility imports |
| `cli/interactive/interactiveLoop.ts` | 145 | 1 | 14 | acceptable loop coordinator |
| `session/continuation/sessionContinuitySnapshot.ts` | 274 | 1 | 19 | acceptable continuation projection, watch fan-out |
| `runtime/workflowExecutionCoordinator.ts` | 1358 | 0 | 47 | partial new monolith |
| `planning/workflowTaskPlan.ts` | 1672 | 1 | 28 | partial new monolith |
| `result/workflowRuntimeProjection.ts` | 197 | 3 | 5 | acceptable projection |
| `verification/verificationStage.ts` | 116 | 1 | 8 | acceptable stage facade |
| `edit/mutationRuntimeStage.ts` | 156 | 8 | 10 | acceptable stage facade |
| `repair/crossFileRepairStage.ts` | 321 | 2 | 9 | acceptable repair stage, watch |
| `entrypoints/cli.tsx` | 24 | 0 | 3 | thin executable compatibility shim |
| `orchestration/runMvpIntegratedFlow.ts` | 8 | 10 | 0 | thin compatibility shim |
| `session/SessionManager.ts` | 926 | 33 | 47 | facade plus partial monolith |

## Old Monolith Status

- `orchestration/runMvpIntegratedFlow.ts`: genuine facade. It only re-exports
  `runMvpIntegratedFlow`, `streamMvpIntegratedFlow`, and types from the runtime
  coordinator.
- `entrypoints/cli.tsx`: genuine executable shim. It wires process globals to
  `runCliProcess` and delegates fatal formatting to `handleCliFatalError`.
- `runtime/workflowExecutionCoordinator.ts`: reduced from earlier audit size but
  still a broad coordinator with execution-stage domain logic.
- `planning/workflowTaskPlan.ts`: still the largest Phase 3 product owner and
  still combines unrelated pre-execution planning rules.
- `session/SessionManager.ts`: much smaller than its earlier audit baseline but
  still high fan-in/high fan-out and still owns multiple session subdomains.

