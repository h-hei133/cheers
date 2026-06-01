# Model Tool Batch Handoff Roadmap

Status: audit roadmap.
Date: 2026-06-01.

## Roadmap Rule

Model-produced tool calls must become a safe Agent Loop tool phase through
owner-domain facts before any execution can occur. The block must connect to
the Provider Streaming And Model Boundary block, tool policy interception,
ExecutionService authority, tool result messages, runtime events, product
surface, save point, next-turn preparation, and result truthfulness.

The next task must not implement real tool execution by default. It should make
non-executed, blocked, authority-required, malformed, unsupported, and unknown
tool calls visible and replay-safe.

## Recommended Implementation Sequence

| Task | Implements | Defers | Owner domains | Validation expectations | Completion criteria |
|---|---|---|---|---|---|
| MTB002 Safe Model Tool Batch Handoff And Non-Executed Result Messages | Explicit handoff from completed model boundary to normalized tool batch facts; malformed/unsupported/unknown classification; before-policy and authority projection; dispatch eligibility; non-executed tool result messages; runtime events; save-point and next-turn ids; product surface observation. | Real tool execution, command allowlist expansion, provider calls, provider streaming, fallback execution, next provider turn execution, edit/apply/verification/repair changes, session schema migration, SDK/RPC/TUI/MCP/browser/plugin/package loading. | `tools`, `turn`, `runtime/loop`, `runtime/events`, `evidence`, `presentation`, with `runtime/execution` as authority/receipt consumer only. | Focused tests for extraction/handoff, malformed/unsupported/unknown calls, policy and authority projection, not-dispatched messages, runtime events/JSON stream, save point/next-turn preparation, product surface not-proven claims, result truth if touched, package build if product TypeScript changes. | A completed model-boundary fixture can produce a report-safe tool batch handoff, policy/authority facts, non-executed tool result messages, save-point/next-turn references, and product surface sections without tool execution or success upgrade. |
| MTB003 Sanctioned Tool Dispatch Receipt Observation | Dispatch eligible calls only through existing sanctioned tool/runtime boundaries when authority is proven and a dispatch seam is explicitly provided. | New tools, command allowlist expansion, parallel execution, dynamic plugin execution, verification/edit/repair behavior changes. | `tools`, `runtime/execution`, `core/tools`, `runtime/loop`, `evidence`, `result`. | Tool dispatcher tests, ExecutionService tests, receipt tests, authority denied/granted tests, abort tests, no-success-from-tool tests. | Executed tools produce redacted receipts and result details while terminal success remains evidence/verdict-owned. |
| MTB004 Next-Turn Tool Result Delivery | Feed prepared tool result messages into next model request preparation without executing a provider turn by default. | Live provider continuation, session schema migration, storage-backed branching, SDK/RPC/TUI surfaces. | `turn`, `runtime/loop`, `provider/request`, `context`, `session`, `evidence`. | Next-turn bundle tests, delivery policy tests, request-prep tests, redaction tests, continuation not-success tests. | Tool result messages can be included in a waiting next-turn request bundle with delivery status and not-proven claims preserved. |

## Immediate Next Task

Task title:

`MTB002 Safe Model Tool Batch Handoff And Non-Executed Result Messages`

Goal:

- Add a report-safe handoff fact that consumes completed model-boundary facts
  and existing assistant accumulation/tool call extraction.
- Preserve malformed, unsupported, unknown, partial, and not-dispatched states.
- Require before-tool policy and authority projection before dispatch
  eligibility.
- Prepare tool result messages for non-executed outcomes.
- Project runtime events, JSON stream entries, save point ids, next-turn bundle
  inputs, and product surface state.
- Keep result/evidence/verdict truth unchanged.

## Owner Domains

| Owner domain | Responsibility |
|---|---|
| `tools` | Normalized tool call batch, tool handoff facts, malformed/unsupported/unknown classification, dispatch plan facts, non-executed result detail facts. |
| `turn` | Assistant accumulation input and report-safe tool result message projection for next-turn preparation. |
| `runtime/loop` | Phase transition from model boundary to tool phase, save point, next-turn waiting state, not-proven propagation. |
| `runtime/events` | Redacted observation events and JSON stream entries. |
| `runtime/execution` | Authority and execution receipt boundary only; no default dispatch in MTB002. |
| `core/tools` | Registry of sanctioned tools; consumer only unless later execution task scopes it. |
| `evidence` | Evidence-only save point and receipt id persistence. |
| `presentation` | Product surface rendering as consumer. |
| `result` | Terminal truth and false-success guardrails. |

## Likely Files To Inspect Or Change

Likely inspect:

- `packages/ts-shell/src/provider/response/boundary.ts`
- `packages/ts-shell/src/runtime/loop/modelBoundary.ts`
- `packages/ts-shell/src/turn/assistantResponse.ts`
- `packages/ts-shell/src/tools/toolCallBatch.ts`
- `packages/ts-shell/src/tools/toolBatchDispatch.ts`
- `packages/ts-shell/src/tools/policy/interception.ts`
- `packages/ts-shell/src/tools/dispatch/dispatcher.ts`
- `packages/ts-shell/src/core/tools/registry.ts`
- `packages/ts-shell/src/runtime/execution/service.ts`
- `packages/ts-shell/src/runtime/execution/receipt.ts`
- `packages/ts-shell/src/turn/toolResultMessage.ts`
- `packages/ts-shell/src/runtime/loop/contract.ts`
- `packages/ts-shell/src/runtime/loop/trajectory.ts`
- `packages/ts-shell/src/runtime/events/projection.ts`
- `packages/ts-shell/src/runtime/events/stream.ts`
- `packages/ts-shell/src/evidence/savepoint/model.ts`
- `packages/ts-shell/src/turn/nextTurnBundle.ts`
- `packages/ts-shell/src/presentation/surface/model.ts`
- `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts`
- `packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts`

Likely change, if implementation proceeds:

- Add or extend a `tools`-owned handoff projection near current tool batch
  contracts.
- Extend `turn` result message projection only for missing non-executed
  categories.
- Extend `runtime/loop` as consumer of handoff facts and owner of phase
  ordering.
- Extend `runtime/events` and `presentation` only after owner facts exist.
- Extend focused tests beside the touched owner files.

Do not add new product file names or product text with process-history words,
external project names, or origin vocabulary. Use local domain terms such as
task, block, contract, boundary, owner, runtime, loop, handoff, event, surface,
and evidence.

## What Can Be Combined In MTB002

- Model-boundary-to-tool handoff fact.
- Normalized tool batch plan with explicit source response/assistant ids.
- Malformed, unsupported, unknown, partial, and not-dispatched classifications.
- Before-tool policy and authority projection.
- Non-executed tool result details/messages.
- Runtime event and JSON stream projection.
- Evidence-only save-point ids and next-turn bundle source ids.
- Product surface tool/authority/save-point observations.
- Result truthfulness tests proving no success upgrade.

These can be combined because they are observation and handoff facts, not side
effects.

## What Must Be Deferred

- Real tool execution expansion.
- Command allowlist expansion.
- Parallel tool execution.
- Provider calls or provider streaming.
- Fallback execution.
- Next provider/model turn execution.
- Browser or external tool execution.
- Dynamic plugin execution.
- Package loading.
- Session schema migration.
- SDK/RPC/TUI/MCP/browser/plugin surfaces.
- Product loop replacement.
- Compatibility shim growth.
- Prompt behavior, CLI behavior, edit/apply, verification, or repair changes.

## Validation Plan For MTB002

Run focused validation tied to changed files:

- Tool-call extraction/handoff tests for empty, prepared, malformed,
  unsupported, unknown, partial, duplicate ids, argument key projection,
  redaction, and `dispatchStatus: not_dispatched`.
- Policy and authority tests for blocked, rejected, unsupported,
  authority-required, allowed-without-authority-grant, and no command allowlist
  expansion.
- Tool result message tests for not-dispatched, blocked, authority-required,
  unsupported, unknown, malformed, execution-unavailable, receipt-observed,
  execution-failed, and execution-succeeded-as-tool-fact-only.
- Agent Loop contract and trajectory tests if phase facts change.
- Runtime event and JSON stream tests for observation-only redacted tool
  handoff events.
- Save-point and next-turn bundle tests if ids or pending facts change.
- Product surface tests if rendered sections change.
- Result truthfulness tests if terminal/result mapping is touched.
- `rtk npm run build -w packages/ts-shell` if product TypeScript changes.
- `rtk git diff --check`.
- `rtk git status --short --branch`.

No build or tests are required for this docs-only audit.

## Completion Criteria For MTB002

MTB002 is complete only when:

- Tool batch handoff consumes completed model-boundary facts and does not
  reconstruct provider/model state.
- Source response, assistant, turn, and batch ids are preserved.
- Normalized calls carry safe name/kind, argument keys, redaction status,
  malformed/unsupported/unknown/partial status, and not-proven claims.
- Before-tool policy and authority requirements are projected before any
  dispatch eligibility.
- Execution defaults to not-dispatched unless an explicitly scoped sanctioned
  seam is provided.
- Non-executed result messages exist for blocked, authority-required,
  unsupported, unknown, malformed, and not-dispatched calls.
- Runtime events and JSON stream entries are observation-only and redacted.
- Save point and next-turn bundle reference safe ids without executing a new
  provider turn.
- Product surface renders tool handoff state without owning success.
- Result/evidence/verdict truth is unchanged unless explicitly validated.
- No provider call, fallback execution, tool execution, command allowlist
  expansion, edit/apply, verification, repair, prompt behavior, CLI behavior,
  session schema, host API, package loading, compatibility shim, or product loop
  replacement is introduced outside scope.

## Next Task Name

`MTB002 Safe Model Tool Batch Handoff And Non-Executed Result Messages`

Start with fake/default-safe or injected completed model-boundary facts. Real
tool execution belongs to a later task after policy, authority, receipts,
events, save points, next-turn preparation, and truthfulness are proven.
