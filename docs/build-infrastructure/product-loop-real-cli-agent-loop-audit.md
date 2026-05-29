# Real CLI Agent Loop Product Integration Audit

Status: PL001 audit.
Date: 2026-05-29.

## Scope

This is an audit and planning document for connecting the current real CLI
coding path to the BI016 agent loop spine. It does not implement product code.

Inspection used:

- Serena targeted symbol inspection of the CLI prompt path, shell session
  runtime, runtime invocation bridge, workflow execution coordinator, loop
  trajectory projection, runtime event projection, session/context projections,
  provider readiness, tool interception, execution receipts, and product
  surface renderer.
- Targeted repository search for call sites and current tests around the same
  surfaces.
- BI017 closeout documents under `docs/build-infrastructure`.

No external repositories, real provider configuration, product code edits,
route runners, verifier scripts, JSON reports, package scripts, dependencies,
provider calls, tool behavior changes, or session schema changes were used.

## Current CLI Product Path Map

| Step | Current surface | Owner | Current behavior | Loop integration status |
|---|---|---|---|---|
| CLI prompt entry | `entrypoints/cliRuntimeModule.ts` | CLI / host adapter | `runNonInteractivePrompt` trims input, resolves shell actions, and delegates executable prompts to `executeResolvedPromptTurn`. | Host adapter only; should not own loop facts. |
| Interactive prompt entry | `cli/interactive/interactivePromptRunner.ts` | CLI / host adapter | `runInteractivePromptExecution` delegates interactive prompts into `executeResolvedPromptTurn`. | Host adapter only; should not own loop facts. |
| Turn boundary and prompt execution | `entrypoints/cliRuntimeModule.ts` | CLI / host adapter | `executeResolvedPromptTurn` logs prompt receipt, builds continuity, materializes approval mode, and calls `ShellSessionRuntime.executePrompt`. | Can pass through future observations but should not create them. |
| Session runtime | `core/shell/sessionRuntime.ts` | `core/shell` host/session adapter | `ShellSessionRuntime.executePrompt` builds prompt injections, persists user prompt barrier, streams `runPrompt` events, appends query events, renders surfaces, persists assistant turn, saves completed/error/interrupted state. | Consumer of projected loop facts later; not the primary emitter. |
| CLI runtime construction | `cli/runtime/cliSessionRuntimeFactory.ts` | CLI / host adapter | Creates `ShellSessionRuntime` and wires `runPrompt` to `streamCliRuntimePrompt` with provider credential resolution and approval escalation bridge. | Adapter boundary; should remain thin. |
| Runtime invocation bridge | `cli/runtime/cliRuntimeInvocationBridge.ts` | CLI / runtime bridge | Converts CLI options into `runCliRuntimeInvocation` input, including apply-patch runtime route and planning mutation options. | Adapter boundary; avoid making it the loop owner. |
| Runtime invocation selection | `entrypoints/cliRuntimeInvocation.ts` | runtime invocation | `runCliRuntimeInvocation` builds request; `streamCliRuntimeInvocation` chooses apply-patch route, lightweight route, provider readiness gate, or integrated flow. | Safe place to expose event stream later, but not the richest fact owner. |
| Product loop execution | `runtime/workflowExecutionCoordinator.ts` | `runtime` | `runMvpIntegratedFlow` builds environment and runs `MultiAgentOrchestrator`; `executeWorkflowTaskPlan` owns task plan stages, runtime tool dispatch, mutation, verification, result contract, notes, events, and execution receipts. | Safest primary seam to emit loop trajectory facts because it already observes turn, provider mode, events, receipts, result, and save point boundary. |
| Query event persistence/rendering | `core/shell/sessionRuntime.ts`, `core/shell/sessionTerminalState.ts` | `core/shell`, `presentation` adapter | Query events are appended to session, digested, rendered, and terminal state is saved. Product surface currently receives status, terminal facts, and coding result. | Consumer/rendering seam after runtime facts exist. |
| Product surface rendering | `presentation/productSurface.ts`, `core/shell/cliSessionProductSurface.ts` | `presentation`, `core/shell` adapter | Projects and renders fact sections. Loop trajectory sections already exist in presentation code, but current CLI terminal rendering does not pass a loop trajectory. | Render-only consumer; not fact owner. |

## BI016 Loop Spine Fit

| Loop spine fact | Current product owner | Current evidence | Fit status | Notes |
|---|---|---|---|---|
| Prompt input | CLI/runtime invocation | Prompt reaches `executeResolvedPromptTurn`, `ShellSessionRuntime.executePrompt`, and `runMvpIntegratedFlow`. | Ready for product integration | Must be summarized/redacted; prompt text is not success or write authority. |
| Turn snapshot | `turn`, `runtime` | `workflowExecutionCoordinator` already creates `RuntimeTurnSnapshot`. | Ready for product integration | Best emitted near coordinator turn setup. |
| Model/provider boundary | `runtime/loop`, `provider` | Loop contract has model boundary; CLI invocation gates real provider readiness before integrated flow. | Projection/contract now | Provider called/readiness is not provider success. |
| Provider/model metadata | `provider`, `core/shell` readiness | `projectProviderRegistry` and readiness metadata keep default enablement disabled and terminal success false. | Projection-only | Can attach explicit metadata, not secret state or real-provider success. |
| Tool policy | `tools`, `policy` | Tool interception surfaces expose before-tool decisions and not-proven claims. | Ready when available | Must preserve authority and denied/pending/write states. |
| Tool result details | `tools` | `createCommandToolResultSplit` separates report-safe projection from details. | Ready when available | Tool result observed is not task success. |
| Execution receipt | `runtime/execution` | `RuntimeExecutionReceiptProjection` exists; direct command stage already returns receipts into `WorkflowExecutionResult`. | Ready where coordinator has receipts | Exit zero remains evidence, not verification success by itself. |
| Save point | `evidence`, `runtime` | `workflowExecutionCoordinator` notifies runtime turn boundary with evidence save point; `runtimeSavePoint` preserves terminal success false. | Ready for product integration | Save point created is not task success. |
| Next turn preparation | `runtime/loop`, `session`, `context` | Agent loop contract and trajectory projection support next-turn facts. | Projection-only | Do not claim next turn is executable or successful until product route proves it. |
| Session active path | `session` | `projectSessionTree` produces active path projection from current linear session schema. | Projection-only | Storage-backed branching remains not-proven. |
| Context rebuild | `context` | `projectSessionContextRebuild` projects report-safe context rebuild facts and missing facts. | Projection-only | Excludes raw transcript, tool details, and resource details. |
| Runtime events | `runtime/events` | `projectRuntimeEvents` projects host-neutral observations. | Ready for product integration | Events are observations, not terminal truth. |
| JSON event stream | `runtime/events` | `projectJsonRuntimeEventStream` exists and forces terminal success false in stream truthfulness. | Ready as projection | Not an SDK/RPC server. |
| Product surface | `presentation` | Product surface can accept `loopTrajectory`; current CLI terminal surface does not pass it. | Ready as consumer | Renderer must not become fact owner. |
| Result facts | `result`, `evidence` | `projectWorkflowExecutionResultContract`, terminal truth adapters, verdict facade, and result mapper hold terminal truth. | Ready as guardrail | Loop facts must not override verdict/result. |
| Not-proven claims | `runtime/loop`, `runtime/events`, `presentation`, `result` | Loop trajectory, runtime events, JSON stream, provider metadata, session/context projections preserve not-proven claims. | Ready | Must remain visible in the next route. |

## Candidate Integration Seams

| Candidate seam | Owner domain | Benefit | Risk | Test strategy | Decision |
|---|---|---|---|---|---|
| `workflowExecutionCoordinator` emits loop trajectory facts | `runtime`, consuming owner projections | Closest to turn snapshot, provider mode, task plan stages, runtime events, execution receipts, save point notification, result contract, and current product loop. Smallest semantic gap. | Could grow a central orchestrator if it starts owning provider/tool/session facts instead of collecting projections. | Coordinator boundary tests, trajectory tests with mixed available/missing facts, no terminal success from trajectory, result-contract gate if terminal behavior changes. | Chosen primary seam, with owner facts delegated to existing owner modules. |
| `ShellSessionRuntime` consumes loop trajectory facts | `core/shell` host adapter | Natural point for session persistence and terminal rendering after query events. | If it emits facts, host adapter becomes product loop owner. It currently lacks the full coordinator facts before terminal event. | Session runtime tests for pass-through/persistence/rendering only. | Accept as consumer later; reject as primary emitter. |
| Runtime API exposes loop trajectory facts | `runtime/api`, `runtime/events` | Host-neutral surface for future API clients. | Current route must not create SDK/RPC promises or widen external API. | Runtime API projection tests once product path emits trajectory. | Defer until CLI product path has facts. |
| Product surface renders loop trajectory facts | `presentation` | User-visible value from existing `loopTrajectory` sections. | Rendering can hide uncertainty or become a fact owner. | Product surface tests for not-proven claims, terminalSuccessClaim false, redaction. | Accept as consumer in next route after runtime fact emission. |
| Session summary persists compact loop observation | `session` | Makes resume/continue able to see prior loop observation. | Durable session schema migration or unclear storage semantics. | Session projection tests only after a non-schema compact observation is proven. | Defer; no session schema migration in next route. |
| Result projection attaches loop observation without changing verdict | `result`, `runtime/events` | Keeps terminal truth in result/evidence while exposing observations. | If attached too near result mapper, trajectory could be mistaken for success evidence. | Result truth tests: trajectory observed never upgrades status/classification. | Accept only as non-verdict observation after coordinator emits facts. |

## Chosen Next Route Seam

The safest next implementation seam is:

`workflowExecutionCoordinator` collects existing owner-domain projections and
emits a loop trajectory observation as part of the current product path, while
`ShellSessionRuntime` and presentation consume that observation for rendering
and persistence without becoming fact owners.

The seam should be implemented as a projection attachment, not a product loop
replacement. The coordinator may assemble facts it already has or can obtain
from sanctioned owners:

- turn snapshot from `turn`
- provider mode/readiness metadata from `provider`/CLI readiness surfaces
- tool policy/result/receipt facts from `tools` and `runtime/execution`
- save point from `evidence`
- session active path from `session`
- context rebuild from `context`
- runtime events and JSON stream from `runtime/events`
- result facts from `result`
- renderable sections from `presentation`

The coordinator must not own provider secrets, tool authority, session schema,
context raw contents, presentation truth, or result verdicts.

## Rejected Or Deferred Seams

- `ShellSessionRuntime` as primary emitter: rejected because it is a shell host
  adapter and persistence/rendering boundary, not the owner of runtime facts.
- `cliRuntimeInvocationBridge` as primary emitter: rejected because it adapts CLI
  options into runtime invocation and lacks execution, verification, receipt,
  save point, and result details.
- Product surface as primary emitter: rejected because presentation renders
  facts and must not become the fact owner.
- Runtime API first: deferred because it would imply external API stability
  before the CLI product path proves the observation contract.
- Session schema persistence first: deferred because PL001 and the next product
  route should not migrate durable session schema.
- Product loop replacement: rejected for the next route. The current
  `workflowExecutionCoordinator` and `ShellSessionRuntime` remain authoritative.
- Real provider streaming, real model-driven tool batches, SDK/RPC, TUI,
  dynamic extension execution, package loading, and browser/external tool paths:
  deferred by BI017 and unchanged by this audit.

## Truthfulness Risks And Guardrails

| Risk | Guardrail |
|---|---|
| Loop trajectory observed becomes task success. | `LoopTrajectoryProjection.terminalSuccessClaim` stays false; result/evidence/verdict remain terminal truth owners. |
| Provider boundary observed becomes provider success. | Provider metadata/readiness facts must keep not-proven claims such as provider success, model compatibility, and auth-secret availability. |
| Provider called becomes success. | Provider call/readiness can only be observational; terminal success must come from result/evidence/verdict. |
| Tool result observed becomes task success. | Tool result split remains report-safe/details split; tool success is not terminal success. |
| Command exit zero becomes verification success. | Execution receipt exit code is evidence only; verification success requires verification owner status and relevant command evidence. |
| Save point created becomes success. | Save point has `terminalSuccessClaim: false` and not-proven claims. |
| Next turn prepared becomes success. | Next-turn facts remain projection-only and must not update terminal classification. |
| Product surface rendered becomes success. | Renderer must display owner facts and not-proven claims; it cannot compute verdicts. |
| Prompt text grants write authority. | Approval mode, workspace authority, and tool policy remain separate from prompt text. |
| CLI display hides not-proven claims. | Product surface and JSON event stream must carry visible not-proven claims and terminalSuccessClaim false. |
| Real provider defaults become enabled. | Real provider stays explicit opt-in; private config is not manually read or summarized. |
| Session/context projection leaks raw content. | Context rebuild keeps raw transcript, tool details, resource details, arbitrary file contents, secrets, and hidden reasoning excluded. |

## Validation Strategy For Next Implementation Route

Focused validation should cover:

- CLI product path tests around `runNonInteractivePrompt`,
  `executeResolvedPromptTurn`, and interactive prompt execution when touched.
- `ShellSessionRuntime` tests proving trajectory consumption/rendering does not
  change terminal state or persistence semantics.
- `workflowExecutionCoordinator` boundary tests proving trajectory facts are
  emitted from existing owner projections and missing facts remain not-proven.
- `runtime/loop/trajectoryProjection` tests for mixed real product facts,
  redaction, missing facts, JSON stream ids, and terminalSuccessClaim false.
- `runtime/events` and JSON stream tests if event projection is extended.
- Product surface rendering tests for loop trajectory sections and visible
  not-proven claims.
- Session/context projection tests if active path or context rebuild projections
  are attached.
- Tool interception, tool result split, and execution receipt tests if those
  facts are newly connected.
- Result-contract gate if terminal result behavior, result mapping, or CLI
  terminal output changes.
- Build for the touched package when product code changes.
- `git diff --check` and `git status --short --branch`.

## Audit Conclusion

The current real CLI product path can begin emitting and consuming agent loop
trajectory facts without replacing the current product loop. The next route
should integrate through a coordinator-owned projection attachment and a
shell/presentation consumption path. The integration must stay observational,
owner-domain-first, and truthfulness-preserving.
