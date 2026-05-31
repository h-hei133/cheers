# Provider Streaming And Model Boundary Roadmap

Status: PS001 roadmap.
Date: 2026-05-31.

## Roadmap Rule

Provider streaming must be integrated as an Agent Loop model-boundary phase,
not as an isolated provider subsystem and not as a CLI rewrite. CP006 context
and planning facts must feed model request preparation. Result/evidence/verdict
remain terminal truth owners.

## Recommended Implementation Sequence

| Route | Implements | Defers | Owner domains | Validation expectations | Completion criteria |
|---|---|---|---|---|---|
| PS002 Model Request, Stream Accumulation, And Tool-Call Handoff | Model request boundary consuming CP facts, stream lifecycle projection, assistant accumulation from normalized stream events, completed tool-call handoff to `extractToolCallBatch`, streaming failure taxonomy, abort/cancel projection, runtime events, product surface section. | Default live provider enablement, fallback execution, tool execution, prompt behavior changes, CLI behavior changes, edit/apply/verification/repair changes, SDK/RPC/TUI/MCP/browser/plugin/package loading, session schema migration. | `provider`, `turn`, `runtime/loop`, `runtime/events`, `tools` for extraction only, `presentation` as consumer, `result`/`evidence` for truth guardrails. | Focused tests for request prep from CP facts, stream lifecycle accumulation, partial/malformed tool calls, abort/cancel, failure classification, runtime events/JSON stream, product surface not-proven claims, result-contract if terminal truth is touched, package build if product TypeScript changes. | A fake/default-safe or injected stream can become a report-safe model response boundary, assistant accumulation, and not-dispatched tool-call batch with CP not-proven claims preserved and no success upgrade. |
| PS003 Opt-In Real Provider Stream Smoke Through Product Boundary | Explicit opt-in real provider stream smoke through the PS002 boundary and approved readiness/config gates. | Default provider enablement, fallback execution, tool execution, apply/verification/repair behavior, broad provider matrix. | `provider`, `model-adapters`, `runtime/loop`, `runtime/events`, `evidence`, `result`. | Opt-in only smoke tests/gates, skip/ready/failure classification tests, redaction checks, result-contract, build. | A real provider can be called only through explicit opt-in and yields classified report-safe stream/model facts; provider-called is still not success. |
| PS004 Tool Batch Dispatch From Model Boundary | Dispatch completed PS002 tool-call batches through sanctioned tool/runtime execution boundaries and prepare tool result messages for next model turn. | Command allowlist expansion, edit behavior changes, verification/repair changes, fallback provider execution. | `tools`, `runtime/execution`, `runtime/loop`, `policy`, `turn`, `evidence`, `result`. | Before-tool policy tests, authority required/denied tests, execution receipt tests, tool result message tests, abort tests, no-success-from-tool tests. | Extracted tool calls can be policy-gated and produce ordered report-safe tool result messages; tool execution remains distinct from task success. |
| PS005 Save Point And Next-Turn Model Input After Stream/Tools | Place replay-safe save points and prepare next-turn model input from model boundary and tool result messages. | Session schema migration, storage-backed branch/compaction, SDK/RPC host, product loop replacement. | `evidence`, `turn`, `runtime/loop`, `session`, `context`. | Save point tests, next-turn input tests, queue ordering/abort tests, redaction tests, continuation not-success tests. | Next-turn input is prepared from owner facts without executing a new turn by default or claiming continuation success. |

## Immediate Next Route

Route title:

`PS002 Model Request, Stream Accumulation, And Tool-Call Handoff`

Goal:

- Build the owner-domain model request boundary that consumes CP006 context and
  planning facts.
- Adapt normalized stream events into report-safe assistant accumulation and a
  completed model response boundary.
- Extract only completed normalized tool calls into a not-dispatched tool-call
  batch.
- Classify abort/cancel/failure states for streaming without executing fallback
  or tools.
- Emit runtime events and product surface facts without changing terminal truth.

## Owner Domains

| Owner domain | Responsibility |
|---|---|
| `provider` | Provider/model safe metadata, readiness projection, request prep metadata, stream lifecycle/failure taxonomy, normalized provider events. |
| `turn` | Assistant response accumulation and safe final assistant message projection. |
| `runtime/loop` | Model boundary phase ordering, CP fact consumption contract, tool-call handoff, save point facts, next-turn pending facts, not-proven propagation. |
| `runtime/events` | Host-neutral redacted event and JSON stream projection. |
| `tools` | Tool-call normalization/extraction only; no dispatch in PS002. |
| `presentation` | Render model-boundary facts as consumer only. |
| `result` and `evidence` | Preserve terminal truth and false-success guardrails. |

## Likely Files To Inspect Or Change

Likely inspect:

- `packages/ts-shell/src/orchestration/contextPlanningSummary.ts`
- `packages/ts-shell/src/provider/modelResponseBoundary.ts`
- `packages/ts-shell/src/provider/providerRegistry.ts`
- `packages/ts-shell/src/provider/providerDraftStage.ts`
- `packages/ts-shell/src/model-adapters/types.ts`
- `packages/ts-shell/src/model-adapters/client.ts`
- `packages/ts-shell/src/model-adapters/providers/openai/OpenAIModelAdapter.ts`
- `packages/ts-shell/src/model-adapters/providers/openai/normalize.ts`
- `packages/ts-shell/src/turn/assistantResponse.ts`
- `packages/ts-shell/src/tools/toolCallBatch.ts`
- `packages/ts-shell/src/runtime/loop/agentLoopContract.ts`
- `packages/ts-shell/src/runtime/loop/trajectoryProjection.ts`
- `packages/ts-shell/src/runtime/events/runtimeEventProjection.ts`
- `packages/ts-shell/src/runtime/events/jsonEventStream.ts`
- `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts`
- `packages/ts-shell/src/presentation/productSurface.ts`
- `packages/ts-shell/src/core/query/resultMapper.ts`

Likely change, if PS002 implementation proceeds:

- Add a provider-owned request/stream boundary projection near
  `packages/ts-shell/src/provider/`.
- Add or extend turn-owned assistant stream accumulation near
  `packages/ts-shell/src/turn/assistantResponse.ts`.
- Extend runtime-loop contract/event/trajectory projections only as consumers of
  provider/turn facts.
- Extend product surface rendering only after owner facts exist.

Do not place new behavior in vague `utils`, `common`, route-numbered product
files, CLI shims, or compatibility wrappers.

## What Can Be Combined In PS002

- CP006 fact consumption for model request preparation.
- Stream lifecycle projection for fake/default-safe or injected normalized
  events.
- Assistant content accumulation from deltas.
- Completed tool-call extraction and malformed/unsupported/partial tool-call
  classification.
- Abort/cancel/failure taxonomy for the model boundary.
- Runtime event and JSON stream projection.
- Product surface model-boundary section.
- Result truthfulness tests proving no success upgrade.

Combining these is safe because they are all model-boundary facts and can be
tested without real provider calls or tool execution.

## What Must Be Deferred

- Default live provider streaming execution.
- Real fallback execution.
- Tool execution or dispatch from model output.
- Command allowlist expansion.
- Edit/apply changes.
- Verification execution changes.
- Repair changes.
- Prompt behavior changes in current product paths.
- CLI behavior changes.
- Session schema migration.
- SDK/RPC/TUI/MCP/browser/plugin/package-loading surfaces.
- Product loop replacement.
- Compatibility shim growth.
- New dependencies.

## Validation Plan For PS002

Run focused validation tied to touched files:

- Provider/model request boundary tests for CP fact ingestion, missing facts,
  no-write constraints, provider/model safe labels, and not-proven propagation.
- Stream accumulator tests for start, content delta, complete, partial, abort,
  timeout, provider error, malformed stream event, hidden/reasoning exclusion,
  and redaction.
- Tool-call handoff tests for partial, completed, malformed, unsupported,
  duplicate ids, argument key projection, redaction, and
  `dispatchStatus: not_dispatched`.
- Agent Loop contract/trajectory tests if phase facts change.
- Runtime event and JSON stream tests if new event types are added.
- Product surface tests if a model-boundary section is rendered.
- Result-contract gate if any terminal/result mapping changes.
- `rtk npm run build -w packages/ts-shell` if product TypeScript changes.
- `rtk git diff --check`.
- `rtk git status --short --branch`.

No build or tests are required for this PS001 docs-only audit.

## Completion Criteria For PS002

PS002 is complete only when:

- Model request preparation consumes CP006 facts and carries missing/stale/no
  write/not-proven facts forward.
- Provider/model readiness and metadata are projected as report-safe facts.
- Stream start, content delta, tool-call delta, complete, abort, timeout,
  provider failure, and partial states are distinguishable.
- Assistant response accumulation produces report-safe content summary/final
  state without persisting or printing raw provider output.
- Completed tool calls are normalized into a not-dispatched tool-call batch.
- Partial/malformed/unsupported tool calls cannot execute.
- Runtime events and JSON stream entries are redacted and observation-only.
- Product surface renders model-boundary state without owning success.
- Result/evidence/verdict truth is unchanged unless explicitly validated.
- No provider call, fallback execution, tool execution, edit/apply,
  verification, repair, CLI behavior, prompt behavior, session schema, host API,
  package loading, compatibility shim, or product loop replacement is introduced
  outside route scope.

## Next Route Name

`PS002 Model Request, Stream Accumulation, And Tool-Call Handoff`

This route should start with fake/default-safe or injected normalized stream
events. Real provider opt-in streaming belongs to PS003 after PS002 proves the
model-boundary facts and truthfulness guardrails.
