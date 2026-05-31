# Structure Tree Pressure Report

Status: current structure pressure report for SR005.

## Scope

This report measures visible tree pressure under `packages/ts-shell/src` for the structure-only cleanup of presentation, runtime, context, planning, provider, tools, and execution adjacency. It records structure changes only; no feature behavior or runtime semantics were intentionally changed.

## Before Snapshot

Top crowded directories by direct file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 415 |
| `core/context` | 356 |
| `orchestration/patchResult` | 130 |
| `core/harness` | 92 |
| `session` | 66 |
| `core/shell` | 49 |
| `entrypoints` | 46 |
| `context` | 28 |
| `core/commands` | 26 |
| `edit` | 25 |

Route-target direct counts before editing:

| Directory | Direct files before |
|---|---:|
| `orchestration` | 415 |
| `core` | 0 |
| `presentation` | 4 |
| `runtime/events` | 7 |
| `runtime/loop` | 15 |
| `runtime/resources` | 9 |
| `context` | 28 |
| `context/acquisition` | 5 |
| `context/discovery` | 2 |
| `context/memory` | 2 |
| `planning` | 11 |
| `planning/grounded` | 2 |
| `planning/handoff` | 3 |
| `planning/runtime` | 4 |
| `provider` | 7 |
| `provider/registry` | 2 |
| `provider/request` | 4 |
| `provider/response` | 2 |
| `tools` | 14 |
| `tools/dispatch` | 2 |
| `tools/policy` | 2 |
| `tools/result` | 2 |
| `runtime/execution` | 10 |

Other before measurements:

- SR002-SR004 compatibility-only export files present: 35.
- Compatibility files containing business logic: 0.
- SR002-SR004 old long-name compatibility files still visible: 35.
- Long basename files over 24 characters in route-target trees: 794.
- Tests still in old broad folders for moved implementations: 28 present, plus `orchestration/planningRuntimeProductProjection.test.ts` absent.
- Real TypeScript imports using old SR002-SR004 compatibility paths: 3.

## After Snapshot

Top crowded directories by direct file count:

| Directory | Direct files |
|---|---:|
| `orchestration` | 404 |
| `core/context` | 356 |
| `orchestration/patchResult` | 130 |
| `core/harness` | 92 |
| `session` | 66 |
| `core/shell` | 49 |
| `entrypoints` | 46 |
| `context` | 28 |
| `core/commands` | 26 |
| `edit` | 25 |

Route-target direct counts after editing:

| Directory | Direct files after |
|---|---:|
| `orchestration` | 404 |
| `core` | 0 |
| `presentation` | 3 |
| `runtime/events` | 7 |
| `runtime/loop` | 15 |
| `runtime/resources` | 9 |
| `context` | 28 |
| `context/acquisition` | 9 |
| `context/discovery` | 3 |
| `context/memory` | 3 |
| `planning` | 11 |
| `planning/grounded` | 3 |
| `planning/handoff` | 5 |
| `planning/runtime` | 6 |
| `provider` | 4 |
| `provider/registry` | 3 |
| `provider/request` | 5 |
| `provider/response` | 3 |
| `tools` | 11 |
| `tools/dispatch` | 3 |
| `tools/policy` | 3 |
| `tools/result` | 3 |
| `runtime/execution` | 10 |

Other after measurements:

- SR002-SR004 compatibility-only export files present: 35.
- Compatibility files containing business logic: 0.
- SR002-SR004 old long-name compatibility files still visible: 35.
- Long basename files over 24 characters in route-target trees: 779.
- Tests still in old broad folders for moved implementations: 0.
- Real TypeScript imports using old SR002-SR004 compatibility paths: 0.

## Directories Improved

- `orchestration`: 415 to 404 direct files by relocating 11 context/planning tests beside owner files.
- `presentation`: 4 to 3 direct files by relocating the product surface test to `presentation/surface/model.test.ts`.
- `provider`: 7 to 4 direct files by relocating provider registry, draft, and response boundary tests beside owner files.
- `tools`: 14 to 11 direct files by relocating dispatcher, interception, and split tests beside owner files.
- Old long-name test pressure in the route-target trees dropped by 15 files using short local test names.

## Tests Relocated

Relocated tests:

- `orchestration/repoIntelligence.test.ts` -> `context/discovery/scan.test.ts`
- `orchestration/contextEngine.test.ts` -> `context/acquisition/engine.test.ts`
- `orchestration/contextGraphPlanning.test.ts` -> `context/acquisition/graph.test.ts`
- `orchestration/contextAcquisitionProjection.test.ts` -> `context/acquisition/projection.test.ts`
- `orchestration/contextPlanningSummary.test.ts` -> `context/acquisition/summary.test.ts`
- `orchestration/contextMemory.test.ts` -> `context/memory/model.test.ts`
- `orchestration/groundedPlanningProjection.test.ts` -> `planning/grounded/projection.test.ts`
- `orchestration/planningRuntime.test.ts` -> `planning/runtime/engine.test.ts`
- `orchestration/planningRuntimeProductProposal.test.ts` -> `planning/runtime/proposal.test.ts`
- `orchestration/planningMutationHandoffProjection.test.ts` -> `planning/handoff/mutation.test.ts`
- `orchestration/planningMutationProposalBridge.test.ts` -> `planning/handoff/bridge.test.ts`
- `presentation/productSurface.test.ts` -> `presentation/surface/model.test.ts`
- `runtime/events/runtimeEventProjection.test.ts` -> `runtime/events/projection.test.ts`
- `runtime/events/jsonEventStream.test.ts` -> `runtime/events/stream.test.ts`
- `runtime/loop/agentLoopContract.test.ts` -> `runtime/loop/contract.test.ts`
- `runtime/loop/productLoopAdapter.test.ts` -> `runtime/loop/adapter.test.ts`
- `runtime/loop/trajectoryProjection.test.ts` -> `runtime/loop/trajectory.test.ts`
- `runtime/resources/staticResourceProjection.test.ts` -> `runtime/resources/projection.test.ts`
- `runtime/resources/packageInventory.test.ts` -> `runtime/resources/inventory.test.ts`
- `provider/providerRegistry.test.ts` -> `provider/registry/provider.test.ts`
- `provider/providerDraftStage.test.ts` -> `provider/request/draft.test.ts`
- `provider/modelResponseBoundary.test.ts` -> `provider/response/boundary.test.ts`
- `tools/dispatcher.test.ts` -> `tools/dispatch/dispatcher.test.ts`
- `tools/interception.test.ts` -> `tools/policy/interception.test.ts`
- `tools/resultSplit.test.ts` -> `tools/result/split.test.ts`
- `runtime/execution/executionService.test.ts` -> `runtime/execution/service.test.ts`
- `runtime/execution/executionReceipt.test.ts` -> `runtime/execution/receipt.test.ts`
- `runtime/execution/executionErrorTaxonomy.test.ts` -> `runtime/execution/error.test.ts`

Deferred because the old test file was not present:

- `orchestration/planningRuntimeProductProjection.test.ts` -> `planning/runtime/projection.test.ts`
- `presentation/terminalMessageRenderer.test.ts` -> `presentation/terminal/renderer.test.ts`

## Compatibility Files

Kept in old locations as thin compatibility exports:

- Presentation: `presentation/productSurface.ts`, `presentation/terminalMessageRenderer.ts`.
- Runtime events: `runtime/events/runtimeEventProjection.ts`, `runtime/events/jsonEventStream.ts`.
- Runtime loop: `runtime/loop/agentLoopContract.ts`, `runtime/loop/trajectoryProjection.ts`, `runtime/loop/productLoopAdapter.ts`, `runtime/loop/featureContract.ts`, `runtime/loop/infrastructureMap.ts`.
- Runtime resources: `runtime/resources/staticResourceDescriptor.ts`, `runtime/resources/staticResourceProjection.ts`, `runtime/resources/packageInventory.ts`.
- Context and planning: `orchestration/repoIntelligence.ts`, `orchestration/contextEngine.ts`, `orchestration/contextGraphPlanning.ts`, `orchestration/contextAcquisitionProjection.ts`, `orchestration/contextPlanningSummary.ts`, `orchestration/contextMemory.ts`, `orchestration/groundedPlanningProjection.ts`, `orchestration/planningRuntime.ts`, `orchestration/planningRuntimeProductProjection.ts`, `orchestration/planningRuntimeProductProposal.ts`, `orchestration/planningMutationHandoffProjection.ts`, `orchestration/planningMutationProposalBridge.ts`.
- Provider: `provider/providerRegistry.ts`, `provider/providerDraftStage.ts`, `provider/modelResponseBoundary.ts`, `orchestration/contextAwareProviderPrompt.ts`, `model-adapters/providerFetch.ts`.
- Tools and execution: `tools/interception.ts`, `tools/resultSplit.ts`, `tools/dispatcher.ts`, `runtime/execution/executionService.ts`, `runtime/execution/executionReceipt.ts`, `runtime/execution/executionErrorTaxonomy.ts`.

No compatibility files were removed. Their old import paths remain compatibility surfaces until a dedicated retirement decision confirms no public or historical import requirement remains.

Deletion criteria:

- Internal imports stay at zero for the old path.
- The old path is not documented as a public or route-history compatibility surface.
- Package exports, generated declarations, and downstream consumers do not rely on the old path.
- The deletion route can prove removal with focused tests, build, and import search.

## Imports Updated

Updated `runtime/workflowExecutionCoordinator.ts` away from these compatibility imports:

- `./loop/agentLoopContract.js` -> `./loop/contract.js`
- `./loop/productLoopAdapter.js` -> `./loop/adapter.js`
- `./loop/trajectoryProjection.js` -> `./loop/trajectory.js`

Relocated tests had their real imports mechanically rewritten to the new local owner paths. Remaining old-path strings are fixture content inside tests that model repository examples; they are not product imports.

## Remaining Visible Structure Debt

- `orchestration` still has 404 direct files and remains the largest active broad root.
- `core/context` has 356 direct files and is the largest non-orchestration crowded directory, but it was outside this route's safe rewrite scope.
- `orchestration/patchResult` has 130 direct files and includes long route-era test names; it belongs to edit/apply and was intentionally not touched.
- SR002-SR004 compatibility files remain visible in old locations. They are thin, but retirement requires a separate compatibility policy decision.

## Validation Evidence

- Focused relocated tests: `npm test -w packages/ts-shell -- --run ...` passed 28 files and 142 tests.
- Build, diff check, and final status are recorded in the closeout response for the run that updates this report.

## Recommended Next Step

Return to Provider Streaming And Model Boundary work if provider work is no longer blocked by visible structure pressure. If one more structure pass is needed first, target a narrow compatibility-retirement audit or a `core/context` tree pressure audit without touching browser/provider/auth behavior.
