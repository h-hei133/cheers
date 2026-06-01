# Model Tool Batch Handoff Audit

Status: audit and planning.
Date: 2026-06-01.

## Scope

This is an audit-only task. It does not implement product code, command
aliases, verification scripts, JSON reports, package scripts, new
dependencies, provider calls, provider streaming, fallback execution, tool
execution changes, command allowlist expansion, prompt behavior changes, CLI
behavior changes, edit/apply changes, verification execution changes, repair
changes, session schema migration, SDK/RPC/TUI/MCP/browser/plugin/package
loading surfaces, product loop replacement, or compatibility shim growth.

Inspection used Serena targeted inspection first. Serena was available. Targeted
`rtk rg` and `rtk sed` reads were used only where whole-file symbol extraction
was too large or where docs/tests needed line-oriented evidence.

No real provider configuration was read, printed, copied, summarized, or
modified. No provider call or tool execution was performed for this audit.

Inspected current source and tests:

- `packages/ts-shell/src/provider/response/boundary.ts`
- `packages/ts-shell/src/provider/response/stream.ts`
- `packages/ts-shell/src/runtime/loop/modelBoundary.ts`
- `packages/ts-shell/src/turn/assistantResponse.ts`
- `packages/ts-shell/src/tools/toolCallBatch.ts`
- `packages/ts-shell/src/tools/toolBatchDispatch.ts`
- `packages/ts-shell/src/tools/dispatch/dispatcher.ts`
- `packages/ts-shell/src/tools/policy/interception.ts`
- `packages/ts-shell/src/tools/result/split.ts`
- `packages/ts-shell/src/turn/toolResultMessage.ts`
- `packages/ts-shell/src/core/tools/registry.ts`
- `packages/ts-shell/src/runtime/execution/service.ts`
- `packages/ts-shell/src/runtime/execution/receipt.ts`
- `packages/ts-shell/src/runtime/loop/contract.ts`
- `packages/ts-shell/src/runtime/loop/trajectory.ts`
- `packages/ts-shell/src/runtime/events/projection.ts`
- `packages/ts-shell/src/runtime/events/stream.ts`
- `packages/ts-shell/src/turn/turnSnapshot.ts`
- `packages/ts-shell/src/turn/nextTurnBundle.ts`
- `packages/ts-shell/src/evidence/savepoint/model.ts`
- `packages/ts-shell/src/presentation/surface/model.ts`
- `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts`
- `packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts`
- Focused tests discovered around the same surfaces:
  `provider/response/boundary.test.ts`, `turn/assistantResponse.test.ts`,
  `tools/toolCallBatch.test.ts`, `tools/toolBatchDispatch.test.ts`,
  `tools/policy/interception.test.ts`, `turn/toolResultMessage.test.ts`,
  `runtime/execution/receipt.test.ts`, `runtime/execution/service.test.ts`,
  `runtime/loop/contract.test.ts`, `runtime/loop/trajectory.test.ts`,
  `runtime/events/projection.test.ts`, `runtime/events/stream.test.ts`,
  `evidence/savepoint/model.test.ts`, `presentation/surface/model.test.ts`,
  `runtime/workflowExecutionCoordinator.test.ts`, and
  `entrypoints/cliRuntimeInvocation.test.ts`.

## Current Model-To-Tool Path Map

| Area | Current path | Classification | Notes |
|---|---|---|---|
| Model response boundary | `createModelResponseBoundary` creates report-safe response facts with status, provider/model labels, assistant summary, tool count, redaction, and not-proven claims. | Contract ready. | It is not task success and does not prove provider success. |
| Assistant accumulation | `accumulateAssistantResponse` consumes chunks with text deltas and tool call candidates, redacts unsafe content, and records accumulation status. | Contract ready. | Content delta or safe summary is not final success. |
| Tool call extraction | `extractToolCallBatch` consumes assistant candidates plus response boundary and returns a normalized batch. | Ready for handoff facts. | It sets `dispatchStatus: not_dispatched` and carries tool/result/verification/task success as not-proven. |
| Malformed calls | `normalizeToolCall` classifies non-object or incomplete candidates as `malformed`. | Ready as non-executable fact. | Malformed is counted in `malformedCallCount`; all-malformed extraction becomes `failed`. |
| Unsupported calls | Tool kind classification marks unsupported kinds; the batch records `unsupportedCallCount`. | Ready as non-executable fact. | Unsupported is not an execution failure because execution must not start. |
| Unknown tool names | Current extraction can preserve safe names and classify kind/risk, while dispatch planning later marks unsupported or metadata-only states. | Partial. | A dedicated unknown-tool category should be made explicit before product integration. |
| Argument projection | Tool extraction reports sorted argument keys and a bounded redacted argument summary. | Ready. | Raw arguments are not a product surface or event-stream payload. |
| Before-tool policy | `planToolBatchDispatch` creates interception intent and before-policy decision per normalized call. | Projection ready. | Policy decision is not authority and not execution. |
| Authority requirement | Policy decisions carry `authorityRequirement`; plans collect authority-required call ids. | Projection ready. | Prompt text cannot grant authority. |
| Dispatch eligibility | `planToolBatchDispatch` computes `blocked`, `authority_required`, `unsupported`, `not_dispatched`, or `dispatched`. | Projection ready. | Default dispatch policy is metadata-only; parallel is unsupported. |
| Tool dispatcher | `ToolDispatcher` can dispatch against a runtime and interception policy. | Product capability exists outside this handoff seam. | The next task should not route model output directly to this dispatcher. |
| Core registry | `createCoreToolRegistry` maps sanctioned tools to runtime-backed execution functions. | Product runtime owner exists. | Registry execution is separate from model-to-tool handoff and should not be expanded here. |
| ExecutionService | `ExecutionService` owns command and file side effects and produces execution metadata/events. | Sanctioned execution boundary. | Handoff may reference authority requirements but must not bypass this boundary. |
| Execution receipts | `createCommandExecutionReceipt` produces redacted receipt facts with authority, status, exit code, cancellation, timeout, and not-proven claims. | Ready as evidence fact if execution later occurs. | Receipt exists is not task success; exit zero is not verification success. |
| Tool result details | `dispatchToolBatch` creates detail records for executed, not-dispatched, blocked, authority-required, unsupported, rejected, failed, and succeeded tool facts. | Projection ready; execution optional. | In the next handoff task, default should stay not-dispatched unless an injected seam is explicitly tested. |
| Tool result messages | `prepareToolResultMessages` turns dispatch plan/details into report-safe tool-role message projections. | Ready for next-turn preparation. | Tool result message is not next-turn completion. |
| Runtime events | `projectRuntimeEvents` emits extraction, dispatch plan, before-policy, authority, blocked, receipt, result detail, result message, save point, and next-turn events. | Projection ready. | Events are observation-only and redacted. |
| JSON stream | `projectJsonRuntimeEventStream` serializes ordered runtime events with `observationOnly: true` and `terminalSuccessClaim: false`. | Ready as consumer. | JSON stream rendered is not success. |
| Save point | `createEvidenceOnlySavePoint` records safe ids, receipts, tool result message/detail ids, policy decision ids, pending next-turn facts, and not-proven claims. | Ready as consumer. | Save point is not success. |
| Next-turn bundle | `prepareNextTurnBundle` connects assistant response, tool result messages, queues, save point, delivery policy, and delivery status. | Ready as consumer. | Next-turn bundle prepared is not next-turn executed. |
| Product surface | `projectProductSurfaceViewModel` already renders loop trajectory tool, execution, save point, event, and not-proven sections. | Consumer ready. | Surface rendering is not success and must not own handoff facts. |
| CLI product seam | `cliRuntimeInvocation` delegates to `streamProductTurn`; `workflowExecutionCoordinator` currently projects existing product output into loop trajectory with zero extracted tool calls. | Current product path is observation-only. | It is not a model-driven tool execution path. |

## Agent Loop Tool Phase Fit

| Tool phase fact | Current status | Integration fit |
|---|---|---|
| Model boundary complete or partial | Previous block owns the model-boundary fact. | Dependency. Do not bypass it. |
| Assistant accumulation | Present as turn-owned state. | Ready for model-to-tool input. |
| Completed extracted call batch | `extractToolCallBatch` exists. | Ready for a handoff boundary if fed only completed model facts. |
| Malformed or unsupported calls | Present in normalized batch counts and call statuses. | Ready, but unknown-tool category should be sharpened. |
| Tool batch plan | `planToolBatchDispatch` exists and defaults to metadata-only. | Ready as planning/projection, not execution. |
| Before-tool policy decision | Present through interception policy. | Ready as required gate. |
| Authority requirement | Present on policy decision and dispatch plan. | Ready as requirement, not grant. |
| Dispatch eligibility | Present as per-call and batch dispatch statuses. | Ready for not-dispatched handoff; unsafe for default execution. |
| Execution not-run state | Present through `not_dispatched`, metadata-only plan, result details, and events. | Ready and should be the default for this block. |
| Execution receipt if available | Present through ExecutionService/receipt projection. | Consumer-only for this block. |
| Tool result message | Present through `prepareToolResultMessages`. | Ready as next-turn input fact. |
| After-tool annotation | Present through interception annotation projection. | Ready if a dispatch result exists; otherwise deferred. |
| Save point | Present through evidence-only save point. | Ready as consumer of safe ids. |
| Next-turn bundle | Present through turn bundle and delivery policy. | Ready for preparation only, not execution. |
| Runtime events | Present for extraction, plan, policy, authority, blocked, not-run, result message, save point, and next turn. | Ready as consumer. |
| Product surface | Present through trajectory sections. | Consumer-ready; should not become source of truth. |
| Result truth | Result/evidence/verdict remain terminal truth owners. | Must remain unchanged. |

## Prior Block Dependency

The tool handoff must consume the Provider Streaming And Model Boundary block
instead of reconstructing model facts. The required upstream facts are:

- Model request and response ids.
- Model response boundary status: completed, partial, failed, cancelled,
  output invalid, output insufficient, or redaction failed.
- Assistant accumulation status and report-safe content summary.
- Stream completion versus content delta versus tool-call partial.
- Completed normalized tool-call candidates only.
- Provider failure classification and fallback eligibility without fallback
  execution.
- Abort or cancellation facts.
- Redaction status and excluded raw fields.
- CP006 context/planning not-proven claims, especially missing facts, no-write
  handoff, and mutation authority not granted.

Tool batch preparation must not treat model boundary completion as task success.
It should refuse executable handoff when the model boundary is partial, aborted,
failed, output-invalid, output-insufficient, or redaction-failed. Partial tool
call deltas remain non-executable facts until the upstream model boundary
produces completed tool-call candidates.

## Safe Handoff Requirements

The next implementation should introduce a report-safe handoff fact owned by
`tools` and consumed by `runtime/loop`. It should include:

- Handoff id and batch id.
- Source model response boundary id and turn id.
- Source assistant response id.
- Normalized tool call ids.
- Safe tool name and local tool kind.
- Argument key projection and redaction status.
- Malformed, unsupported, unknown, and partial status.
- Before-tool policy requirement.
- Authority requirement.
- Dispatch eligibility.
- Execution status, defaulting to `not_dispatched`.
- Tool result message readiness if a non-executed message is prepared.
- Save-point and next-turn ids only after those consumers run.
- Not-proven claims for tool execution, tool result, next-turn delivery,
  verification, task, and terminal success.

Required invariants:

- Extracted tool call is not executed tool.
- Tool batch planned is not tool result.
- Tool batch handoff prepared is not task success.
- Raw arguments and command output stay out of product surface and JSON stream.
- Unknown, malformed, unsupported, blocked, and authority-required calls are
  visible as facts and never hidden behind empty success.

## Policy And Authority Requirements

Before-tool policy and ExecutionService authority should interact in this
order:

1. Tool extraction produces normalized call facts only.
2. Tool batch planning creates interception intents and before-policy decisions.
3. Policy may block, reject, mark unsupported, request authority, or allow
   metadata-only dispatch eligibility.
4. Authority requirements stay explicit. Authority requested is not authority
   granted.
5. ExecutionService may receive a call only after policy permits dispatch,
   authority is granted by a sanctioned owner, the tool is supported, arguments
   are well-formed and redacted, and the dispatch seam is explicitly provided.
6. Denied, blocked, malformed, unsupported, unknown, and authority-required
   calls still produce report-safe tool result message projections so the next
   turn can observe the refusal without implying execution.
7. Execution receipts, when present, attach to result details and save points as
   evidence facts only.

No command allowlist expansion is required or safe for this block. Prompt text,
model output, product surface text, and CP plan handoff cannot grant tool,
command, edit, verification, repair, or provider authority.

## Tool Result Message Requirements

Tool result message projection should cover these categories even when
execution is not run:

- `not-dispatched`: model tool call observed but no sanctioned dispatch.
- `blocked-by-policy`: before-tool policy blocked or rejected execution.
- `authority-required`: tool needs authority that was not granted.
- `unsupported-tool`: tool kind or dispatch policy unsupported.
- `unknown-tool`: safe name is not in the supported registry.
- `malformed-arguments`: candidate could not be normalized safely.
- `execution-unavailable`: supported execution seam unavailable.
- `execution-receipt-observed`: execution owner returned a receipt.
- `execution-failed`: receipt/result says execution failed.
- `execution-succeeded-as-tool-fact-only`: tool success observed but terminal
  task success remains not proven.

Each message should carry a stable message id, source call id, safe tool name,
delivery status, redaction status, safe summary, not-proven claims, and
`terminalSuccessClaim: false`.

## Runtime Event And Product Surface Requirements

Runtime events should be emitted as observation-only facts for:

- Tool batch extracted.
- Tool batch planned.
- Before-tool policy observed.
- Authority required.
- Tool call blocked.
- Tool call not dispatched.
- Tool result message prepared.
- Tool batch partial or failed extraction.
- Tool batch completed as observation.
- Save point observed after tool facts.
- Next-turn bundle prepared from tool result messages.

The JSON event stream should continue to set `observationOnly: true` and
`terminalSuccessClaim: false`. It should carry ids, counts, statuses, redaction
state, and not-proven claims, not raw arguments or command output.

The product surface should remain a renderer. It may show tool batch status,
policy status, authority-required ids, receipt count, result message count,
save-point ids, and next-turn waiting status. It must not transform rendered
tool facts into success.

## Save Point And Next-Turn Connection

The safe sequence is:

1. Model boundary completes or produces a classified non-complete state.
2. Assistant accumulation records report-safe content and completed tool
   candidates.
3. Tool batch handoff records normalized tool facts with dispatch not run.
4. Optional metadata-only dispatch plan records policy and authority facts.
5. Tool result messages are prepared for non-executed, blocked,
   authority-required, unsupported, unknown, malformed, or observed execution
   facts.
6. Evidence-only save point records ids and pending next-turn facts.
7. Next-turn bundle references tool result message ids and delivery policy.
8. Next provider/model turn remains waiting unless a later task explicitly
   scopes execution.

Replay safety requires ids and safe summaries, not raw provider output, raw
arguments, raw command output, hidden reasoning, or full transcripts.

## Chosen Implementation Seam

The safest seam for the next implementation task is:

- `tools` owns normalized tool call batch, handoff facts, dispatch plan facts,
  unsupported/malformed/unknown classifications, and tool result message source
  facts.
- `runtime/loop` owns phase ordering from completed model boundary to tool
  phase, save point, and next-turn preparation.
- `runtime/events` owns event and JSON stream projection as a consumer.
- `turn` owns assistant accumulation and tool result message projection.
- `runtime/execution` remains the sanctioned side-effect boundary and is
  consumer-only until a later execution task explicitly scopes dispatch.
- `presentation` renders only owner facts.
- `result` and `evidence` remain truth owners.

This seam reuses existing contracts while keeping execution disabled by
default.

## Rejected Seams

- CLI invocation as owner: too close to flags and user I/O; it would mix
  product command wiring with tool authority.
- `workflowExecutionCoordinator` rewrite: current path is observation over
  existing product output and should not become the model-to-tool owner.
- `ToolDispatcher` direct call from model output: bypasses model-boundary
  completion, policy planning, authority projection, and save-point facts.
- Core tool registry as handoff owner: registry owns available tools, not model
  response normalization or loop phase transition.
- ExecutionService as handoff owner: it owns side effects and receipts, not
  model facts or tool planning.
- Product surface as source of tool facts: renderer cannot create authority,
  execution, result, or success facts.
- Provider/model adapter as tool owner: provider streaming can identify
  completed tool calls, but tool policy and authority belong to tool/runtime
  owners.
- Compatibility shims: delegate/re-export only; no business logic growth.
- Session schema, SDK/RPC/TUI/MCP/browser/plugin/package-loading routes: outside
  this block and unsafe as an implementation shortcut.

## False-Success Guardrails

| Risk | Guardrail |
|---|---|
| Tool call extracted becomes tool executed. | Batch carries `dispatchStatus: not_dispatched`; execution receipts are absent unless a sanctioned dispatch seam runs. |
| Tool batch planned becomes tool result. | Dispatch plan and result detail/message ids stay separate. |
| Policy allowed becomes authority granted. | Policy decision carries authority requirement; authority grant must come from sanctioned owner evidence. |
| Authority requested becomes authority granted. | Authority-required ids remain blocked/not-dispatched until explicit grant evidence exists. |
| Execution receipt exists becomes task success. | Receipt is evidence only; result/evidence/verdict decide terminal truth. |
| Command exit zero becomes verification success. | Verification owner must classify relevance and pass status separately. |
| Tool result message becomes next-turn completion. | Message delivery/preparation is separate from next provider/model turn execution. |
| Save point created becomes success. | Save point records evidence and pending facts with not-proven claims. |
| Product surface rendered becomes success. | Surface sections render owner facts and keep terminal success false. |
| Unknown or malformed calls disappear. | Handoff must classify and preserve them as non-executable tool result messages. |

## Next Implementation Task

Recommended next task:

`MTB002 Safe Model Tool Batch Handoff And Non-Executed Result Messages`

Goal:

- Consume the completed model-boundary output from the previous block.
- Create an explicit tool batch handoff fact with normalized call ids,
  malformed/unsupported/unknown classification, redaction, policy requirement,
  authority requirement, dispatch eligibility, execution not-run status, and
  not-proven claims.
- Prepare non-executed tool result messages for blocked, authority-required,
  unsupported, unknown, malformed, and not-dispatched calls.
- Project runtime events, JSON stream entries, save-point ids, next-turn bundle
  inputs, and product surface sections without executing tools or changing
  terminal truth.

This task should start with fake/default-safe or injected model-boundary facts.
It should not call providers, stream live responses, execute tools, expand
command allowlists, or execute the next model turn.
