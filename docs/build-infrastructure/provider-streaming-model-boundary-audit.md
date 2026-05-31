# Provider Streaming And Model Boundary Audit

Status: PS001 audit and planning.
Date: 2026-05-31.

## Scope

This is an audit-only route. It does not implement product code, route runners,
verify scripts, JSON reports, package scripts, provider calls, live streaming,
fallback execution, tool execution changes, prompt behavior changes, CLI
behavior changes, edit/apply changes, verification execution changes, repair
changes, session schema migration, SDK/RPC/TUI/MCP/browser/plugin/package
loading surfaces, product loop replacement, new dependencies, or compatibility
shim growth.

Inspection used:

- Serena targeted inspection first for provider fetch, provider draft,
  provider registry/failure classification, readiness/config resolution,
  context-aware prompt construction, planning live provider proposal, model
  response boundary, assistant accumulation, tool-call extraction, Agent Loop
  contract, trajectory projection, runtime event and JSON stream projections,
  turn/save point, tool result messages, CP006 summary, product surface, result
  truth adapters, provider proposal facade, and CLI invocation.
- Targeted `rtk rg` and `rtk sed` only where symbol locations or non-code docs
  were needed.
- No real provider configuration was read, printed, copied, summarized, or
  modified. No provider call was made.

Inspected current source and tests:

- `packages/ts-shell/src/model-adapters/types.ts`
- `packages/ts-shell/src/model-adapters/client.ts`
- `packages/ts-shell/src/model-adapters/providerFetch.ts`
- `packages/ts-shell/src/model-adapters/providers/openai/OpenAIModelAdapter.ts`
- `packages/ts-shell/src/model-adapters/providers/openai/normalize.ts`
- `packages/ts-shell/src/provider/providerDraftStage.ts`
- `packages/ts-shell/src/provider/modelResponseBoundary.ts`
- `packages/ts-shell/src/provider/providerRegistry.ts`
- `packages/ts-shell/src/turn/assistantResponse.ts`
- `packages/ts-shell/src/turn/toolResultMessage.ts`
- `packages/ts-shell/src/runtime/loop/agentLoopContract.ts`
- `packages/ts-shell/src/runtime/loop/trajectoryProjection.ts`
- `packages/ts-shell/src/runtime/events/runtimeEventProjection.ts`
- `packages/ts-shell/src/runtime/events/jsonEventStream.ts`
- `packages/ts-shell/src/runtime/turnBoundary.ts`
- `packages/ts-shell/src/evidence/runtimeSavePoint.ts`
- `packages/ts-shell/src/tools/toolCallBatch.ts`
- `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts`
- `packages/ts-shell/src/orchestration/contextAwareProviderPrompt.ts`
- `packages/ts-shell/src/orchestration/providerPromptAudit.ts`
- `packages/ts-shell/src/orchestration/planningRuntimeProductProposal.ts`
- `packages/ts-shell/src/orchestration/realProviderProposalDryRun.ts`
- `packages/ts-shell/src/proposal/providerProposalFacade.ts`
- `packages/ts-shell/src/core/shell/providerCredentials.ts`
- `packages/ts-shell/src/core/shell/providerReadiness.ts`
- `packages/ts-shell/src/core/shell/providerFailureRedaction.ts`
- `packages/ts-shell/src/core/shell/cliSessionProductSurface.ts`
- `packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts`
- `packages/ts-shell/src/result/sessionResultTruthAdapter.ts`
- `packages/ts-shell/src/core/query/resultMapper.ts`
- Focused tests discovered around the same surfaces:
  `providerFetch.test.ts`, `OpenAIModelAdapter.test.ts`, `normalize.test.ts`,
  `modelResponseBoundary.test.ts`, `assistantResponse.test.ts`,
  `toolCallBatch.test.ts`, `toolBatchDispatch.test.ts`,
  `toolResultMessage.test.ts`, `agentLoopContract.test.ts`,
  `trajectoryProjection.test.ts`, `runtimeEventProjection.test.ts`,
  `jsonEventStream.test.ts`, `providerRegistry.test.ts`,
  `providerReadiness.test.ts`, `providerCredentials.test.ts`,
  `providerPromptAudit.test.ts`, `realProviderProposalDryRun.test.ts`,
  `planningRuntimeProductExecution.test.ts`, `providerProposalFacade.test.ts`,
  `productSurface.test.ts`, `cliSessionProductSurface.test.ts`,
  `sessionResultTruthAdapter.test.ts`, and `cliRuntimeInvocation.test.ts`.

## Current Provider Path Map

| Area | Current path | Classification | Notes |
|---|---|---|---|
| Provider opt-in | CLI builds `providerMode` from env/default and passes `realProvider` credential resolution into `streamProductTurn`; real mode readiness runs before integrated flow. | Production path for readiness gating; no success proof. | Default real provider behavior remains explicitly gated. |
| Credential resolution | `resolveProviderCredential` selects CLI, active connection, env, connection, or config credential without exposing secrets to product surface. | Production path for config selection. | Audit did not read private config. |
| Readiness | `checkRealProviderReadiness` checks provider support, key/account auth, base URL/model for OpenAI-compatible providers, `/models` reachability for API-key style, and maps missing key/config/auth/network/unknown. | Production readiness gate. | Readiness is not provider success and not model response success. |
| Fetch boundary | `createProviderFetchFromEnv` builds undici direct/proxy dispatchers, timeouts, proxy/no-proxy decisions, and optional diagnostics. | Production transport helper for provider adapters. | It is fetch transport, not Agent Loop model boundary. |
| Adapter stream | `OpenAIModelAdapter.streamResponse` calls OpenAI-compatible or account-auth endpoints, parses SSE frames, yields normalized start/content/tool/complete events, and normalizes errors. | Provider adapter exists; not product-integrated as the CLI Agent Loop model phase. | Chat-completions JSON parse failures currently bubble to normalized provider errors, not a stream protocol taxonomy. |
| Model client | `createModelClient` wraps an adapter with retry, provider health, and degraded fallback eligibility. | Adapter-level client; not product path fallback execution. | Degraded/fallback eligible is not fallback executed. |
| Provider draft | `runProviderDraftStage` delegates to `streamTurnRoleDraft`, used by `workflowExecutionCoordinator` for planner/coder/reviewer draft stages. | Product path draft stage. | It returns accumulated role text, not structured Agent Loop model response state. |
| Context-aware proposal prompt | `buildContextAwareProviderPrompt`, `buildLiveProviderPromptContext`, and `auditProviderPrompt` build redacted/budgeted no-write provider proposal prompts from context/planning facts. | Proposal path, not general model-boundary request prep. | Mutation authority remains `not-granted`. |
| Live provider proposal | `prepareLiveProviderProposal` gates attempts, preflight, prompt context, dry-run provider call, fallback eligibility, output validation, anchor classification, and no-write evidence. | Explicit opt-in proposal path. | Provider-called, exact-ready, review-only, and fallback-eligible stay separate from apply or success. |
| Provider registry/failure | `projectProviderRegistry` and `classifyProviderFailure` project metadata and classes for config/auth/network/endpoint/rate limit/timeout/output/redaction/route/unknown. | Projection and partial taxonomy. | Streaming-specific classes are missing. |
| Redaction | Provider failure redaction, prompt audit, assistant/model boundary redaction, runtime events, JSON stream, and product surface exclude private config/raw output. | Production guardrail surfaces. | Raw provider output must remain excluded from reports and persisted events. |
| Product model observation | `projectProductPathLoopTrajectory` creates `ModelResponseBoundary` from existing `userFacingOutput`, accumulates that output as one safe chunk, extracts zero tool calls, then projects trajectory/events. | Product-integrated observation only. | This is not live provider streaming and not model response completion from provider stream. |

## Agent Loop Model Boundary Fit

| Fact or phase | Current status | Fit for PS002 |
|---|---|---|
| Prompt input | Ready for integration through CLI/session/coordinator inputs and CP facts. | Use safe summaries and explicit CP evidence ids, not raw transcript dumps. |
| CP006 context planning summary | Ready as request-prep input. | Consume as bounded facts, missing facts, constraints, no-write state, and not-proven claims. |
| Model request preparation | Missing owner seam for general Agent Loop model boundary. | Add under provider/turn/runtime-loop boundary, not CLI or compatibility wrappers. |
| Provider registry metadata | Projection-ready. | Attach provider/model safe labels, capability flags, and unknown compatibility status. |
| Auth/readiness projection | Ready as gate input. | Must remain readiness, not success. |
| Stream start | Adapter event exists as `response.started`. | Product event requirement missing; stream start is not response complete. |
| Assistant content delta | Adapter event exists as `content.delta`; assistant accumulator accepts chunks. | Need streaming accumulator contract and event projection without raw output persistence. |
| Tool call delta | Adapter event exists as `tool.call.delta`; OpenAI normalizer accumulates partials internally. | Need product-level partial state that is not executable until completed and normalized. |
| Stream complete | Adapter event exists as `response.completed`. | Need model-boundary completion object with finish reason, usage safety, redaction, and not-proven claims. |
| Model response boundary | `createModelResponseBoundary` exists and is report-safe. | Extend or compose with streaming lifecycle facts rather than replacing it. |
| Tool-call batch handoff | `extractToolCallBatch` exists and sets `dispatchStatus: not_dispatched`. | Feed only completed normalized tool calls; partial/malformed/unsupported remain not executable. |
| Save point | Evidence-only save point exists. | Save after model boundary and optional tool-call batch observation; save point is not success. |
| Next-turn preparation | Contract/projection exists. | Include model-boundary and tool-call facts for later tool route; do not execute next turn. |
| Runtime events | Event types for model response, assistant accumulation, and tool-call extraction exist. | Add streaming-specific lifecycle events only if needed. |
| JSON event stream | Report-safe ordered stream exists. | Stream entries remain observation-only and redacted. |
| Product surface | Renderer consumes sections and not-proven claims. | Add model-boundary section as a consumer only. |
| Result truth | Result/evidence/verdict remain terminal truth owners. | Model complete is not task success. |

## CP Block Dependency

Provider streaming must not bypass CP006. Model request preparation should
consume these CP facts as inputs:

- Discovery: selected and competing candidates, omitted candidate count,
  ambiguity state, missing discovery facts.
- Acquisition: staged read status, read budget, packet provenance count, graph
  confidence, unavailable graph components, stale facts, required and optional
  missing facts, next read suggestions, context sufficiency.
- Planning: quality status, confidence, assumptions, constraints, and next
  action.
- Handoff: edit handoff status, no-write status, `mutationAuthority:
  not-granted`, exact proposal readiness, verification selected-not-run status.
- Continuation: memory reuse status, freshness requirement, refresh reads,
  continuation readiness, replay-safe planning state ids.
- Not-proven claims: every request prep output must carry CP not-proven claims
  forward instead of collapsing them into readiness.

Required guardrail: CP plan handoff is input evidence for request preparation,
not mutation authority. Missing required facts or review-only/no-write
constraints must be present in the request-prep boundary and visible to runtime
events/product surface.

## Streaming Response Model Requirements

The next implementation should define a report-safe streaming response model
owned by `provider`, `turn`, and `runtime/loop`:

- Request prepared: provider safe label, model safe label, capability flags,
  CP summary ids, missing fact counts, constraints, no-write state, redaction
  status, and not-proven claims.
- Stream lifecycle: `prepared`, `started`, `delta_observed`,
  `tool_call_partial_observed`, `completed`, `aborted`, `failed`, and
  `partial`.
- Content deltas: accumulated only into safe/redacted summaries or bounded safe
  content already covered by current `AssistantResponseState` redaction.
- Hidden/reasoning channels: excluded unless a future route explicitly creates
  a report-safe, non-raw projection.
- Tool partials: tracked as partial until completed; malformed partials become
  stream/model boundary failure facts, not executable calls.
- Unsupported tool shapes: preserved as unsupported tool-call facts and
  not-proven claims.
- Final assistant message: created only after stream completion or explicit
  partial/abort classification; content delta alone is not final response.
- Usage metadata: optional and safe only when token counts are numeric and do
  not include raw prompts or provider payloads.
- Abort/timeout/network/provider errors: classified distinctly and surfaced as
  model-boundary not-success.
- Redaction: every event and final boundary must exclude api keys,
  `provider.env`, raw provider output, auth headers, hidden reasoning, full
  transcripts, and unsafe file contents.

## Tool Call Handoff Requirements

Tool-call handoff should reuse `extractToolCallBatch` and the Agent Loop
contract. The streaming boundary must produce completed normalized tool-call
candidates with:

- Stable normalized ids.
- Safe tool names or safe kinds.
- Argument key projection and redaction status.
- Malformed, unsupported, or partial status.
- Authority requirement and before-tool policy requirement.
- `dispatchStatus: not_dispatched` until the tool route runs.
- Not-proven claims for tool dispatch, tool result, verification, task, and
  terminal success.

Tool call extracted is not tool executed. Tool batch ready is not task success.
Partial tool calls are not executable.

## Abort And Cancellation Requirements

Abort handling must leave replay-safe and report-safe facts:

- User abort before request preparation: no provider call, model boundary
  `aborted`, no response complete.
- User abort after stream start: stream cancelled/aborted, partial assistant
  state classified partial, no final response.
- Timeout abort: distinct timeout failure class, no retry/fallback success claim.
- Provider stream abort: provider cancellation/failure event, no model complete.
- Tool-call accumulation abort: partial tool calls marked non-executable.
- Session stop or continuation cancellation: save only safe ids and pending
  facts; no next-turn execution.

Abort must propagate through existing `AbortSignal` surfaces where already
available: CLI invocation, `streamMvpIntegratedFlow`, Agent Loop contract,
model client/adapter, and tool dispatch context. Abort is not success.

## Provider Failure Taxonomy Requirements

Current taxonomy covers config, auth, network, endpoint, rate-limited, timeout,
output invalid, output insufficient, redaction failure, route error, and
unknown. Streaming needs finer projection:

- `provider_config`
- `provider_auth`
- `provider_network`
- `provider_endpoint`
- `provider_rate_limited`
- `provider_timeout`
- `provider_cancelled`
- `provider_stream_protocol_error`
- `provider_stream_event_malformed`
- `provider_output_invalid`
- `provider_output_insufficient`
- `provider_redaction_failure`
- `provider_fallback_eligible`
- `provider_fallback_ineligible`
- `provider_unknown`

Retry/fallback eligibility must be a fact, not execution. If model-client
degraded mode or fallback policy is observed, product events must say whether
fallback was attempted, skipped, or ineligible.

## Runtime Event And Product Surface Requirements

Runtime events should stay host-neutral, ordered, redacted, and observation-only.
Potential events for PS002:

- `model-request-prepared`
- `provider-readiness-observed`
- `provider-stream-started`
- `assistant-delta-observed`
- `tool-call-delta-observed`
- `model-response-accumulated`
- `tool-call-batch-extracted`
- `provider-stream-cancelled`
- `provider-stream-failed`
- `model-boundary-completed`
- `model-boundary-partial`
- `fallback-eligible-observed`
- `fallback-not-attempted`

Product surface should render a model-boundary section with provider readiness,
stream state, assistant accumulation state, tool-call extraction state,
failure/fallback facts, redaction status, next action, and not-proven claims.
It must not render raw provider output, hidden reasoning, full prompt content,
auth details, or success claims.

## Chosen Implementation Seam

The safest seam for the next route is a new owner-domain model request and
stream projection seam that composes:

- `provider`: request/readiness/registry/failure taxonomy and stream event
  normalization metadata.
- `turn`: assistant response accumulation and final safe assistant message
  projection.
- `runtime/loop`: model boundary phase transition, tool-call batch handoff,
  save point facts, next-turn pending facts, runtime events, and not-proven
  propagation.
- `presentation`: model-boundary rendering only after owner facts exist.

This seam should sit before tool dispatch and after CP006 request-prep input. It
should adapt normalized provider stream events into existing
`ModelResponseBoundary`, `AssistantResponseState`, and `NormalizedToolCallBatch`
facts instead of rewriting CLI runtime or growing compatibility wrappers.

## Rejected Seams

- `workflowExecutionCoordinator` rewrite: too broad and risks making runtime
  orchestration own provider, tool, session, verification, and result truth.
- CLI invocation seam: CLI is host/adapter code and should not own model facts,
  CP consumption, streaming accumulation, or tool handoff semantics.
- `OpenAIModelAdapter` as product boundary: adapter should normalize provider
  events and errors, not own Agent Loop phases, CP dependencies, product
  surface, or terminal truth.
- `runProviderDraftStage` growth: draft stage delegates to role drafting and
  would conflate planner/coder/reviewer draft text with the general model
  response boundary.
- Product surface first: renderer cannot become source of facts or success.
- Provider proposal path reuse as general model loop: proposal/dry-run paths
  are no-write exact/review proposal surfaces, not the general assistant
  streaming loop.
- Tool dispatch route first: unsafe because partial/extracted tool calls are
  not yet proven as model-boundary handoff facts.
- Compatibility shim growth: shims must delegate/re-export only.
- Session schema migration or SDK/RPC host: out of scope and premature before
  local model boundary facts are proven.

## False-Success Guardrails

| Risk | Guardrail |
|---|---|
| Provider called becomes provider success. | Keep `providerCalled`, readiness, and provider success separate; require response completion plus classified status, still not task success. |
| Stream started becomes model response complete. | Emit started and completed as distinct lifecycle facts; started carries `model-response-complete` not-proven. |
| Content delta becomes final assistant response. | Accumulate deltas into partial state; final response requires completion or explicit partial/abort classification. |
| Tool call partial becomes executable tool call. | Partial tool calls are non-executable until completed and normalized; malformed/unsupported remain not dispatched. |
| Tool call extracted becomes tool executed. | `extractToolCallBatch` keeps `dispatchStatus: not_dispatched`; dispatch is a later owner route. |
| Fallback eligible becomes fallback executed. | Record eligible/skipped/attempted separately; default next route should not execute fallback. |
| Provider output parsed becomes patch correctness. | Parsed response is model output only; edit/apply proof remains with edit owners and explicit authority. |
| Model response complete becomes task success. | Result/evidence/verdict own task success; model complete is only a loop phase. |
| Product surface rendered becomes success. | Product surface consumes facts and not-proven claims only. |
| CP plan handoff becomes mutation authority. | Carry `mutationAuthority: not-granted` and no-write facts into request prep and product surface. |

## Audit Conclusion

The current codebase has most contract pieces needed for a safe streaming model
boundary: provider adapters normalize stream events, model response and
assistant accumulation projections exist, tool-call extraction exists, Agent
Loop contract and trajectory/events can observe model/tool phases, CP006 emits
bounded context/planning facts, and product surface can render owner facts.

The missing product-safe seam is the coherent model request/stream boundary that
consumes CP006 facts, classifies streaming lifecycle/failures/abort, and hands
completed normalized tool calls to the Agent Loop without executing them or
claiming success.
