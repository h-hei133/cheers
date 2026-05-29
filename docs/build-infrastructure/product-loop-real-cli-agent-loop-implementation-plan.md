# Real CLI Agent Loop Product Integration Plan

Status: PL001 implementation plan.
Date: 2026-05-29.

## Recommended Next Implementation Route

Route title:

`Real CLI Agent Loop Observation Integration`

Goal:

Connect the BI016 agent loop trajectory spine to the current real CLI coding
path as an observation surface. Do this without replacing the current product
loop, changing provider defaults, expanding tool behavior, migrating session
schema, or allowing loop observations to change terminal success.

Primary seam:

`runtime/workflowExecutionCoordinator.ts` should assemble a loop trajectory from
facts already owned by existing domains, then pass that observation through the
current query event/session/runtime surface for rendering.

Consumer seams:

- `core/shell/sessionRuntime.ts` may consume or persist the projected
  observation only as part of existing query event handling.
- `presentation/productSurface.ts` and
  `core/shell/cliSessionProductSurface.ts` may render the observation.
- `runtime/events` may expose the observation through existing host-neutral
  runtime events and JSON stream projection.

## Owner Domains

| Domain | Planned responsibility | Boundary |
|---|---|---|
| `runtime` | Assemble product-path observation in the coordinator and keep current product loop authoritative. | No product loop rewrite; no provider/tool/session truth ownership. |
| `runtime/loop` | Project loop trajectory and missing/not-proven facts. | Observation only; no execution behavior. |
| `runtime/events` | Project host-neutral runtime events and JSON event stream entries. | No SDK/RPC server. |
| `turn` | Provide turn snapshot facts. | No execution or verdict ownership. |
| `provider` | Provide registry/readiness metadata. | Default-off, explicit opt-in, no private config reads. |
| `tools` | Provide tool policy/result split observations. | No authority bypass; no tool success as task success. |
| `runtime/execution` | Provide execution receipts. | Exit code is evidence, not terminal success. |
| `evidence` | Provide save point and verdict/evidence guardrails. | Save point is not success. |
| `session` | Provide active path projection. | No schema migration. |
| `context` | Provide report-safe context rebuild projection. | No raw transcript or unsafe content. |
| `presentation` | Render view model sections. | Renderer is not fact owner. |
| `result` | Preserve terminal truth and result contract. | Loop observation must not upgrade verdict/status. |
| `core/shell` | Host adapter for CLI session runtime and display. | Consumer only; no loop fact ownership. |

## Files Likely To Inspect Or Change

Likely inspect:

- `packages/ts-shell/src/entrypoints/cliRuntimeModule.ts`
- `packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts`
- `packages/ts-shell/src/cli/runtime/cliRuntimeInvocationBridge.ts`
- `packages/ts-shell/src/cli/runtime/cliSessionRuntimeFactory.ts`
- `packages/ts-shell/src/core/shell/sessionRuntime.ts`
- `packages/ts-shell/src/core/shell/sessionTerminalState.ts`
- `packages/ts-shell/src/core/shell/cliSessionProductSurface.ts`
- `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts`
- `packages/ts-shell/src/runtime/loop/trajectoryProjection.ts`
- `packages/ts-shell/src/runtime/loop/agentLoopContract.ts`
- `packages/ts-shell/src/runtime/events/runtimeEventProjection.ts`
- `packages/ts-shell/src/runtime/events/jsonEventStream.ts`
- `packages/ts-shell/src/evidence/runtimeSavePoint.ts`
- `packages/ts-shell/src/runtime/execution/executionReceipt.ts`
- `packages/ts-shell/src/tools/interception.ts`
- `packages/ts-shell/src/tools/resultSplit.ts`
- `packages/ts-shell/src/provider/providerRegistry.ts`
- `packages/ts-shell/src/core/shell/providerReadiness.ts`
- `packages/ts-shell/src/session/sessionTreeProjection.ts`
- `packages/ts-shell/src/context/sessionContextRebuildProjection.ts`
- `packages/ts-shell/src/presentation/productSurface.ts`
- `packages/ts-shell/src/presentation/terminalMessageRenderer.ts`
- `packages/ts-shell/src/result/workflowRuntimeProjection.ts`
- `packages/ts-shell/src/result/terminal/queryTerminalTruth.ts`

Likely focused tests:

- `packages/ts-shell/src/entrypoints/cliRuntimeInvocation.test.ts`
- `packages/ts-shell/src/core/shell/sessionRuntime.test.ts`
- `packages/ts-shell/src/core/shell/sessionRuntimeBoundary.test.ts`
- `packages/ts-shell/src/core/shell/cliSessionProductSurface.test.ts`
- `packages/ts-shell/src/runtime/workflowExecutionCoordinator.test.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`
- `packages/ts-shell/src/runtime/loop/trajectoryProjection.test.ts`
- `packages/ts-shell/src/runtime/events/runtimeEventProjection.test.ts`
- `packages/ts-shell/src/runtime/events/jsonEventStream.test.ts`
- `packages/ts-shell/src/presentation/productSurface.test.ts`
- `packages/ts-shell/src/session/sessionProjection.test.ts`
- `packages/ts-shell/src/tools/interception.test.ts`
- `packages/ts-shell/src/tools/resultSplit.test.ts`
- `packages/ts-shell/src/runtime/execution/executionReceipt.test.ts`
- `packages/ts-shell/src/result/workflowRuntimeProjection.test.ts`
- `packages/ts-shell/src/core/query/resultMapper.test.ts`

## What To Combine In One Route

The next implementation route can safely combine:

1. Coordinator-level loop trajectory observation for the current CLI coding
   path, using existing owner projections.
2. Provider/model metadata attachment when already available from explicit
   CLI/provider readiness surfaces.
3. Tool policy, tool result split, and execution receipt attachment when those
   facts are already produced by current stages.
4. Save point linkage from the runtime turn boundary without changing save point
   semantics.
5. Session active path and context rebuild projection attachment, using current
   projection-only APIs.
6. Runtime event and JSON event stream projection for the loop observation.
7. Product surface rendering of loop trajectory sections.
8. Result truthfulness tests proving loop observation never changes verdict,
   terminal classification, or verification status.

This grouping is useful because it produces a visible end-to-end observation
path while staying projection-only.

## What To Defer

Defer:

- Replacing `workflowExecutionCoordinator`, `ShellSessionRuntime`, or the
  current product loop.
- Real provider streaming or real model-driven tool call batch execution.
- Any default real-provider enablement or manual private config handling.
- Tool behavior expansion, new command execution paths, or authority changes.
- Edit behavior changes, verification behavior changes, or repair behavior
  changes.
- Session schema migration, storage-backed branching, or storage-backed
  compaction.
- SDK package, RPC server, TUI, renderer plugins, dynamic extension execution,
  package loading, package installation, dynamic discovery, or new dependencies.
- Browser or external tool product path integration.

## Phased Implementation Plan

### Phase 1: Observation Data Shape

- Define or reuse a coordinator-local projection attachment shape that can carry
  `LoopTrajectoryProjection` without altering terminal result semantics.
- Keep naming owner-domain-first; do not add route-numbered or process-term
  product files.
- Add tests showing absence of facts becomes explicit not-proven state.

Completion evidence:

- Trajectory shape is available from the product path.
- `terminalSuccessClaim` remains false.
- No result status or terminal classification changes.

### Phase 2: Coordinator Emission

- In `workflowExecutionCoordinator`, assemble trajectory input from facts
  already present in the current flow: prompt, turn snapshot, provider mode,
  events, execution receipts, save point, result facts, and available tool
  observations.
- Pull session/context/provider projections only through existing sanctioned
  owner APIs.
- Do not make the coordinator compute provider success, tool success, session
  truth, context truth, or result verdict.

Completion evidence:

- Coordinator boundary tests prove trajectory exists on relevant CLI coding
  outcomes.
- Missing unavailable facts are not-proven, not silently omitted as success.

### Phase 3: Runtime Events And Stream

- Connect trajectory events to `runtime/events` and JSON event stream only as
  host-neutral observations.
- Preserve redaction and not-proven claims in stream entries.

Completion evidence:

- Runtime event tests and JSON stream tests show report-safe facts,
  deterministic ordering, and terminal success false.

### Phase 4: Shell And Presentation Consumption

- Pass the trajectory through the existing shell session terminal surface.
- Render loop trajectory sections through `presentation/productSurface.ts` and
  `core/shell/cliSessionProductSurface.ts`.
- Keep `ShellSessionRuntime` a consumer and persistence/rendering adapter.

Completion evidence:

- Session runtime tests show no terminal-state regression.
- Product surface tests show not-proven claims and redaction are visible.

### Phase 5: Truthfulness Closeout

- Add focused result/evidence tests proving trajectory, provider observations,
  tool observations, receipts, save points, JSON stream entries, and rendered
  sections never upgrade task success.
- Run result-contract gate if terminal/result behavior is touched.

Completion evidence:

- Existing success semantics remain owned by result/evidence/verdict.
- No provider-called, command exit zero, save point, rendered surface, or event
  emission is treated as success.

## Completion Criteria For Next Route

The next implementation route is complete only when:

- Current CLI product path emits a loop trajectory observation.
- The observation maps prompt, turn snapshot, provider boundary metadata, tool
  policy/result facts when available, execution receipts when available, save
  point, session/context projections, runtime events, JSON stream, product
  surface sections, result facts, and not-proven claims.
- `workflowExecutionCoordinator` remains the product composition seam, not a new
  fact owner for provider/tool/session/context/result domains.
- `ShellSessionRuntime` and presentation consume/render the observation without
  owning facts or changing terminal truth.
- All missing or projection-only facts are represented as not-proven.
- No product loop replacement, provider default enablement, tool behavior
  expansion, edit/verification behavior change, session schema migration,
  SDK/RPC/TUI/plugin/package loading, or new dependency is introduced.
- Focused tests and required validation pass.

## Tests And Validation

Minimum validation for a product-code route:

- Focused CLI invocation/session runtime tests for touched CLI/shell surfaces.
- `workflowExecutionCoordinator` or `runMvpIntegratedFlow` focused tests for the
  new observation attachment.
- `runtime/loop/trajectoryProjection.test.ts`.
- `runtime/events/runtimeEventProjection.test.ts` and
  `runtime/events/jsonEventStream.test.ts` if event/stream projection is
  touched.
- `presentation/productSurface.test.ts` and
  `core/shell/cliSessionProductSurface.test.ts` for rendering.
- `session/sessionProjection.test.ts` and context projection tests if
  session/context facts are attached.
- `tools/interception.test.ts`, `tools/resultSplit.test.ts`, and
  `runtime/execution/executionReceipt.test.ts` if tool/receipt facts are
  attached.
- `result/workflowRuntimeProjection.test.ts` and result-contract gate if result
  or terminal behavior is touched.
- Package build for touched TypeScript package.
- `git diff --check`.
- `git status --short --branch`.

Do not claim build or tests passed unless they actually ran and passed.
