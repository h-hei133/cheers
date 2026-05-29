# Product Loop Agent Loop Remaining Phases Audit

Status: PL003 audit and planning.
Date: 2026-05-29.

## Scope

This audit defines the remaining Agent Loop productization phases after PL002.
It is planning only. It does not implement product code, route runners, verify
scripts, JSON reports, package scripts, provider calls, tool behavior changes,
command allowlist changes, session schema migrations, SDK/RPC hosts, TUI
surfaces, dynamic plugin execution, package loading, or product loop
replacement.

Inspection used:

- Serena targeted inspection of current Agent Loop product surfaces in
  `packages/ts-shell/src`: runtime loop contract, trajectory projection,
  `workflowExecutionCoordinator`, shell session runtime, CLI invocation path,
  provider registry/readiness, provider draft boundary, tool interception,
  tool result split, `ExecutionService`, execution receipts, turn/save point
  boundary, session/context projections, verification stage, repair facade,
  runtime event and JSON stream projections, product surface renderer, and
  result mapping.
- Targeted repository search where symbol location was unknown, especially for
  turn boundary, `ExecutionService`, verification, repair, and provider draft
  surfaces.
- Serena targeted inspection of the local architecture study repository
  `/home/wang/projects/pi`, limited to Agent Loop comparison: `agent-loop.ts`,
  `agent.ts`, `types.ts`, `stream.ts`, session runtime/manager, and compaction.
- Recent build-infrastructure docs listed by the route, including PL001
  audit/plan, next product roadmap, loop connection map, deferred patterns, and
  owner domain map.

Serena note: onboarding for this repository failed because
`.serena/memories/memory_maintenance.md` is absent, but targeted symbol
inspection worked and was used first.

## Inspected Current Surfaces

| Area | Inspected files or symbols | Current classification |
|---|---|---|
| Runtime loop contract | `runtime/loop/agentLoopContract.ts`, `runAgentLoopContract` | Contract/projection loop; not the product CLI loop. |
| Loop trajectory projection | `runtime/loop/trajectoryProjection.ts`, `projectLoopTrajectory` | Projection-only surface with not-proven claims and `terminalSuccessClaim: false`. |
| Product path coordinator | `runtime/workflowExecutionCoordinator.ts`, `runMvpIntegratedFlow`, `executeWorkflowTaskPlan`, `projectProductPathLoopTrajectory` | Product-integrated observation composition; not a real model/tool loop. |
| Shell runtime | `core/shell/sessionRuntime.ts`, `ShellSessionRuntime.executePrompt` | Product-integrated consumer of query events and terminal state; not loop fact owner. |
| Terminal state | `core/shell/sessionTerminalState.ts` | Product-integrated terminal/product-surface consumer of `loopTrajectory`. |
| CLI runtime path | `entrypoints/cliRuntimeModule.ts`, `entrypoints/cliRuntimeInvocation.ts` | Product-integrated host path; adapter only. |
| Provider metadata/readiness | `provider/providerRegistry.ts`, `core/shell/providerReadiness.ts` | Projection/readiness boundary; provider success not proven. |
| Provider draft boundary | `provider/providerDraftStage.ts`, `turn/roleDraftStage.ts` | Draft/role boundary exists, but not integrated as the main loop model response accumulator. |
| Tool policy/interception | `tools/interception.ts` | Contract/projection for before/after tool policy; no product loop batch dispatch. |
| Tool result split | `tools/resultSplit.ts` | Product-safe split; tool result is not task success. |
| Execution boundary | `runtime/execution/executionService.ts` | Product execution boundary for commands/files; side effects belong here or sanctioned owners. |
| Execution receipt | `runtime/execution/executionReceipt.ts` | Product-integrated evidence projection; exit zero is not success. |
| Save point and turn boundary | `turn/turnSnapshot.ts`, `runtime/turnBoundary.ts`, `evidence/runtimeSavePoint.ts` | Product-integrated observation/evidence boundary; save point is not success. |
| Session active path | `session/sessionTreeProjection.ts` | Projection-only; durable branch migration not done. |
| Context rebuild | `context/sessionContextRebuildProjection.ts` | Projection-only; safe summary, not next-turn input proof. |
| Verification command stage | `verification/commandStage.ts`, `verification/verificationStage.ts` | Product-integrated stage outside Agent Loop phase semantics. |
| Repair flow | `repair/repairFacade.ts` | Projection/facade; repair proposal/apply cannot be success without re-verification. |
| Runtime events | `runtime/events/runtimeEventProjection.ts` | Product projection; event emission is not success. |
| JSON event stream | `runtime/events/jsonEventStream.ts` | JSON-safe projection; not SDK/RPC host. |
| Product surface | `presentation/productSurface.ts` | Renderer only; consumes facts and not-proven claims. |
| Result truthfulness | `core/query/resultMapper.ts`, result/evidence surfaces | Terminal truth remains owned by result/evidence/verdict, not loop observation. |

## Architecture Study Findings

The local architecture study repository at `/home/wang/projects/pi` has a
concrete Agent Loop that the current project only partially approximates.

| Study surface | Inspected file or symbol | Relevant target behavior |
|---|---|---|
| Main loop | `packages/agent/src/agent-loop.ts`, `runLoop` | Outer loop waits for follow-up messages after the agent would stop; inner loop alternates assistant response, tool calls/results, steering messages, prepare-next-turn, and stop checks. |
| Assistant streaming | `streamAssistantResponse` | Streams assistant partials into context, emits start/update/end, and replaces the partial with final accumulated message. |
| Tool extraction | `runLoop`, `executeToolCalls` | Extracts `toolCall` content from the assistant message and chooses sequential or parallel batch execution. |
| Tool dispatch | `executeToolCallsSequential`, `executeToolCallsParallel` | Dispatches batch entries, emits start/end/update events, preserves ordered tool result messages, and respects abort. |
| Tool result messages | `createToolResultMessage` | Constructs `toolResult` messages with call id/name/content/details/error state for the next model turn. |
| Next turn | `Agent.createLoopConfig`, `prepareNextTurn` | Allows owner code to rewrite context/model/thinking state between turns. |
| Queues | `Agent`, `PendingMessageQueue` | Steering and follow-up queues are explicit, mode-controlled, drainable state. |
| Abort/cancellation | `Agent.runWithLifecycle`, `Agent.abort`, loop `signal` checks | Active abort signal propagates to model stream, tool execution, listeners, and run failure handling. |
| Event emission | `AgentEvent`, `Agent.processEvents` | Message, turn, agent, and tool lifecycle events update active state and notify listeners. |
| Session context rebuild | `coding-agent/src/core/session-manager.ts`, `buildSessionContext` | Session entries rebuild model/thinking/messages as executable context. |
| Compaction interaction | `core/compaction/compaction.ts`, interactive mode queue handling | Compaction chooses retained context and queues messages during compaction for later steering/follow-up delivery. |

Local implication: the target is not just a rendered trajectory. It is an
executable, evidence-safe turn loop where assistant messages, tool result
messages, next-turn context, queues, abort, session rebuild, and events all
share a single product ordering model.

## Target Agent Loop Phase Model

| Phase | Target owner domain | Current status | Notes |
|---|---|---|---|
| 1. Prompt intake and turn boundary | `core/shell`, `entrypoints`, `turn` | Already product-integrated | Prompt reaches `ShellSessionRuntime` and coordinator; turn snapshot exists. |
| 2. Provider/model request boundary | `provider`, `runtime/loop` | Contract/projection-only | Real provider defaults remain off; readiness is not provider success. |
| 3. Assistant streaming and response accumulation | `provider`, `turn`, `runtime/loop` | Missing from product loop | Draft/role surfaces exist, but no product loop accumulator equivalent to the study target. |
| 4. Tool call extraction from assistant response | `runtime/loop`, `tools` | Contract-only | `AgentLoopContract` can model tool calls, but product path does not extract model-driven calls. |
| 5. Before-tool policy | `tools`, `policy` | Contract/projection-only for loop; product-owned elsewhere | Existing interception facts must gate any future loop dispatch. |
| 6. Tool batch dispatch | `tools`, `runtime/execution` | Missing from product loop | Current execution happens through existing stages, not model-driven loop batches. |
| 7. Tool result split and result messages | `tools`, `runtime/loop` | Split exists; result-message construction missing | `createCommandToolResultSplit` is present; next model turn message construction is not product-integrated. |
| 8. After-tool annotation | `tools` | Projection-only | Annotation exists as observation, not loop phase handoff. |
| 9. Save point | `evidence`, `turn` | Already product-integrated as evidence-only | Save point remains not success. |
| 10. Prepare next turn | `runtime/loop`, `context`, `session` | Contract/projection-only | Pending facts are projected; executable next-turn context is not proven. |
| 11. Steering delivery | `session`, `core/shell`, `runtime/loop` | Contract-only | Queue/delivery semantics are not a product loop feature yet. |
| 12. Follow-up delivery | `session`, `core/shell`, `runtime/loop` | Contract-only | Product continuation exists elsewhere, but not as loop delivery ordering. |
| 13. Verification handoff | `verification`, `runtime/execution`, `evidence` | Product-integrated stage outside loop | Needs loop phase handoff later; selected/not-run cannot be success. |
| 14. Repair handoff | `repair`, `verification`, `evidence` | Projection/facade outside loop | Needs original failure preservation and re-verification inside loop ordering. |
| 15. Session continuation and context rebuild | `session`, `context` | Projection-only for loop | Current rebuild projections are report-safe; executable next-turn input remains not proven. |
| 16. Runtime events and JSON stream | `runtime/events` | Product-integrated projection | Host-neutral stream exists; not an SDK/RPC server. |
| 17. Product surface | `presentation`, `core/shell` | Already product-integrated consumer | Renderer cannot own facts or success. |
| 18. Product loop adapter consolidation | `runtime`, `runtime/loop`, owners above | Deferred | Unsafe until model/tool/next-turn phases are product-proven. |
| 19. SDK/RPC host integration | future host owner plus `runtime/events` | Deferred | Only after local CLI loop is stable. |

## PL002 Actual Completion Classification

PL002 completed the observation connection, not the Agent Loop itself.

Completed:

- Real CLI product path can carry `LoopTrajectoryProjection` as an observation.
- `workflowExecutionCoordinator` assembles a report-safe trajectory from facts it
  already has or can obtain from existing owner projections.
- `AgentExecutionOutput` and `OrchestrationResult` can carry `loopTrajectory`.
- `resultMapper` passes the latest transcript trajectory without changing
  terminal truth.
- `ShellSessionRuntime` terminal state consumes `loopTrajectory` from
  `query.completed`.
- `productSurface` renders loop trajectory sections alongside coding result
  sections.
- Observation surfaces keep `terminalSuccessClaim: false`.

Not completed:

- Product loop replacement.
- Real provider streaming or response accumulation.
- Model-driven tool call extraction in the CLI product loop.
- Tool batch dispatch as a loop phase.
- Tool result message construction for next model turn.
- Prepare-next-turn as executable product semantics.
- Steering/follow-up queue ownership and delivery ordering.
- Verification/repair handoff inside the loop.
- Session context rebuild as proven next-turn input.
- Storage-backed branching/compaction behavior.
- SDK/RPC/TUI/browser host integration.

## Gap Analysis

| Gap | Current evidence | Risk if implemented too early | Route implication |
|---|---|---|---|
| Model response accumulation | Study target has streamed partial replacement; local product path only observes synthetic workflow response ids. | Raw provider output, secret/auth leakage, provider-called success. | PL004 first, with fake/default-safe provider boundary and no default enablement. |
| Tool call extraction | Local contract models calls; product path does not extract assistant tool calls. | Tool calls could bypass policy or be treated as success. | Combine with PL004 only as extraction/normalization, not execution. |
| Tool batch dispatch | Study target dispatches sequential/parallel batches; local path has `ExecutionService` and tool projections separately. | Authority bypass, command allowlist expansion, write side effects. | PL005, after PL004 creates real call batches. |
| Tool result messages | Study target appends `toolResult` messages to context; local split is report-safe but not next-turn message construction. | Tool result becomes task success or leaks details. | PL005 with dispatch because validation and owner domains match. |
| Save point and prepare-next-turn | Local save point exists; pending facts are not executable next-turn context. | Save point/prepared turn masquerades as success. | PL006, after tool result messages exist. |
| Steering/follow-up delivery | Local contract has queued messages; study target has drain modes and delivery ordering. | Queue behavior can reorder user intent or hide cancellation. | PL006 with prepare-next-turn only if kept queue-scoped and no session migration. |
| Verification handoff | Verification stage exists outside loop. | Command exit zero or selected-not-run becomes success. | PL007, separate from tool dispatch. |
| Repair handoff | Repair facade preserves truthfulness but is not loop phase. | Repair proposal/apply becomes success without re-verification. | PL007 with verification because same evidence chain. |
| Session rebuild as next-turn input | Projection exists; study target rebuilds executable context from entries. | Raw transcript leakage or stale/insufficient context claim. | PL008, separate from queues if schema migration is not needed. |
| Product loop adapter consolidation | Current coordinator remains authoritative. | Central rewrite can collapse owner boundaries. | PL009 only after PL004-PL008 prove phases. |
| SDK/RPC/JSON host | JSON projection exists only. | External API promises before loop stability. | PL010 optional after local CLI loop stabilization. |

## Current Owner Map

| Owner domain | PL004+ responsibility | Boundary |
|---|---|---|
| `provider` | Provider/model registry, readiness, response metadata, fake/default-safe response boundary tests. | No private config reads, no default real provider, no provider-called success. |
| `turn` | Runtime turn snapshot and assistant response accumulation boundary facts. | No execution or verdict ownership. |
| `runtime/loop` | Loop phase ordering, model boundary contract, tool-call batch shape, prepare-next-turn semantics. | No provider secrets, no tool side-effect authority, no terminal truth. |
| `tools` | Tool call normalization, before/after policy, report-safe result split, tool result message projection. | No terminal success and no command allowlist expansion. |
| `runtime/execution` | `ExecutionService` dispatch boundary and receipts. | Exit status is evidence only. |
| `verification` | Task-relevant verification command stage and status. | No selected-not-run success. |
| `repair` | Repair handoff and original failure preservation. | Repair proposal/apply are not success without re-verification. |
| `session` | Active path, continuation, queue ownership, future branch/compaction durability. | No schema migration by convenience. |
| `context` | Safe context rebuild and next-turn context projection. | No raw transcript or unsafe file dumps. |
| `runtime/events` | Host-neutral runtime events and JSON event stream. | No SDK/RPC server behavior. |
| `presentation` | Rendering owner facts and not-proven claims. | No verdict ownership. |
| `result` and `evidence` | Terminal truth, verdict, save points, evidence rows. | Loop observation cannot upgrade success. |
| `core/shell` and CLI entrypoints | Host/session adapters and user-visible CLI path. | Consumers only; not loop fact owners. |

## What Can Be Combined

- PL004 can combine model response boundary, assistant response accumulation,
  and tool call extraction because all three share the provider/turn/runtime
  loop boundary and can be tested without executing tools.
- PL005 can combine tool batch dispatch, before-tool policy application,
  execution receipt attachment, after-tool annotation, and tool result message
  construction because they share `tools` plus `runtime/execution` validation.
- PL006 can combine save point, prepare-next-turn, steering delivery, follow-up
  delivery, and next-turn ordering only if no durable session schema migration
  is introduced.
- PL007 can combine verification failure handoff and repair handoff because
  both rely on the same evidence/verdict chain and re-verification guardrails.
- PL008 can combine session context rebuild and continuation loop hardening
  because both prove executable next-turn input.

## What Must Stay Separate

- Real provider streaming must stay separate from default provider enablement.
- Tool execution behavior must stay separate from command allowlist expansion.
- Session schema migration must stay separate from product loop adapter
  consolidation.
- SDK/RPC server work must stay separate from CLI product loop stabilization.
- Browser/external tools must stay separate from local tool loop stabilization.
- Dynamic plugin/package execution must stay separate from tool result message
  construction.

## Risk And Truthfulness Guardrails

These facts must remain observation-only in PL004 and the next few routes:

- terminal success
- provider readiness, provider-called, provider response observed, or provider
  metadata
- tool allowed, tool executed, tool result observed, or tool result message
  constructed
- command exit zero or execution receipt observed
- save point created
- next turn prepared
- steering or follow-up delivered
- session context rebuilt
- JSON stream event emitted
- product surface rendered
- repair proposal generated or repair apply attempted

Success remains proven only by the appropriate evidence/verdict/result owner.

## Immediate Next Block

The next implementation block should be PL004: model response and tool-call
boundary.

Rationale:

- It is the first missing dependency after PL002 observation.
- PL005 cannot safely dispatch tools until PL004 produces a real, normalized,
  policy-ready tool-call batch from an assistant response.
- PL006 cannot prove prepare-next-turn semantics until tool result messages
  exist or the model stop path is explicitly represented.
- Verification/repair/session/API routes depend on a stable local turn loop
  shape.

PL004 should stay fake/default-safe by default. It may create or connect a
provider/model response boundary and assistant response accumulator in the
right owner domains, but it must not call real providers unless a later route
explicitly opens that gate.
