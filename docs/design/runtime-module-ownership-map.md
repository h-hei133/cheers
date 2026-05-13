# Runtime Module Ownership Map

Route: 18
Date: 2026-05-13
Status: planning only

This document is a concrete migration map. It does not implement migrations,
does not change product behavior, does not change scripts or package gates, and
does not make a readiness claim.

## 1. Executive summary

The runtime still concentrates too many responsibilities in three files:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` is 12,301
  lines.
- `packages/ts-shell/src/session/SessionManager.ts` is 5,857 lines.
- `packages/ts-shell/src/entrypoints/cli.tsx` is 3,693 lines.

Route 17 already extracted shell result assembly into
`packages/ts-shell/src/orchestration/shellResultAssembly.ts`. Route 18 should
not keep extracting opportunistic helpers. The next implementation routes
should move complete runtime responsibilities into named modules with focused
tests, while preserving the current TypeScript control-plane, Rust
execution-plane, and `contracts/` boundary.

First recommended migration: extract runtime outcome projection from
`runMvpIntegratedFlow.ts` into
`packages/ts-shell/src/orchestration/runtimeOutcomeProjection.ts`.

## 2. Why module ownership is now required

The deterministic evidence stack is strong enough for the current bounded
surface. The maintainability risk is now ownership drift: result projection,
provider interpretation, mutation handoff, session continuity, CLI dispatch,
approval prompting, and terminal rendering still require edits in very large
files.

Module ownership is required so future routes can change one responsibility
without accidentally changing provider behavior, MCP behavior, writer reach,
default gates, or readiness claims.

## 3. Current giant-file responsibility boundaries

### `runMvpIntegratedFlow.ts`

Current boundary: high-level orchestration entrypoints, apply-patch route
pre-check, integrated runner construction, query loop coordination, provider
adapter setup, tool dispatch/event emission, workflow planning, mutation target
selection, mutation execution integration, continuation lineage, result
handoff, and provider/model helper logic.

Already extracted but still called here:
`mutationRoutingProjection.ts`, `shellResultAssembly.ts`,
`toolLifecycleProjection.ts`, `toolExecutionProvenance.ts`, and
`patchResult/*`.

### `SessionManager.ts`

Current boundary: session data model, project/root binding, current-session
selection, create/resume/delete/rename, transcript and state persistence,
turn lifecycle, recovery seed construction, replay preparation, reentry
summaries, compact retention, stopped continuity, mutation/planned-files
continuity, approval audit memory, and low-level durability.

Already extracted but still called here:
`compactContinuitySummary.ts`, `stoppedSessionContinuity.ts`, and focused
continuity/actionable-failure helpers.

### `cli.tsx`

Current boundary: CLI option parsing, provider credential resolution,
startup/bootstrap, print/stdin/replay/interactive modes, slash command bridge,
approval prompt bridge, provider readiness display, session switching,
workspace attach/status rendering, MCP control-plane rendering, runtime
invocation, terminal output behavior, and user help.

Already extracted but still called here:
`slashRouter.ts`, `sessionRuntime.ts`, `sessionStateSurface.ts`,
`providerReadiness.ts`, approval renderers, prompt transport helpers, and root
binding helpers.

## 4. Keep lists

### `runMvpIntegratedFlow.ts`

| Responsibility | Why it should stay | Calls | Must not grow into |
| --- | --- | --- | --- |
| Exported `runMvpIntegratedFlow` / `streamMvpIntegratedFlow` entrypoints | This file remains the orchestration composition boundary. | Query runtime, integrated runner, route projections. | CLI parsing, session persistence, provider config loading. |
| Query loop coordination | The coordinator should sequence planner/coder/verification turns. | Provider adapter, tool dispatcher, result/outcome projection modules. | Result wording, mutation policy, provider failure taxonomy. |
| Dependency wiring for dispatcher, MCP gateway, sandbox, provider mode, and abort signal | Wiring belongs at orchestration level. | Tool runtime, MCP snapshot, provider helpers. | Tool lifecycle classification or MCP readiness claims. |
| Call boundary to provider readiness/provider adapter | The orchestrator decides whether a provider path is needed. | Provider outcome module and `providerReadiness.ts`. | Reading private provider files, redaction policy, network retry policy. |
| Call boundary to mutation routing/execution | The orchestrator coordinates the route, but should not own route semantics. | `mutationRoutingProjection.ts`, mutation execution modules. | New mutation capability, 3-file writes, delete/move, rollback. |
| High-level approval bridge input forwarding | Approval decisions are part of turn coordination. | Approval prompt handler and tool dispatcher. | Trust-policy persistence or permission UI semantics. |
| Runtime trace/debug event forwarding | Trace events are orchestration observability. | Runtime trace/debug projection module. | User-facing result wording or release claims. |

### `SessionManager.ts`

| Responsibility | Why it should stay | Calls | Must not grow into |
| --- | --- | --- | --- |
| Public session lifecycle facade | Existing callers depend on `SessionManager` as the session API. | Persistence gateway, replay builder, continuity builders. | Low-level JSON parsing or compact policy internals. |
| Session project binding facade | Binding must stay close to create/resume/current-session operations. | Project binding module. | CLI rendering or root-mode diagnostics text. |
| Current session selection facade | Callers should keep a simple current-session API. | Current-session selector module. | Reentry scoring, transcript replay, CLI switch rendering. |
| Turn lifecycle state transitions | The facade should expose active/completed/error/interrupted transitions. | Persistence gateway and durability helpers. | Runtime result projection or terminal wording. |
| Session persistence gateway call boundary | `SessionManager` owns when persistence happens, not every I/O detail. | `sessionPersistenceGateway.ts`. | Lock retry implementation, atomic write mechanics, schema parsing policy. |

### `cli.tsx`

| Responsibility | Why it should stay | Calls | Must not grow into |
| --- | --- | --- | --- |
| Process entrypoint and startup bootstrap | `cli.tsx` is the Node CLI composition root. | Mode dispatcher, bootstrap module, runtime invoker. | Slash command semantics or provider readiness classification. |
| Minimal CLI option collection | The entrypoint should collect raw args and pass parsed options onward. | CLI args module. | Approval policy, route capability decisions, provider auth logic. |
| Top-level mode dispatch | It should choose print/stdin/replay/interactive once options are parsed. | Mode runner modules. | Prompt execution loops or terminal result rendering details. |
| Runtime invocation bridge | CLI should call the shared runtime through a narrow adapter. | `ShellSessionRuntime`, `streamMvpIntegratedFlow`. | Query loop semantics, session persistence, writer capability. |
| Process exit/error boundary | The entrypoint owns process-level failure handling. | Mode dispatcher result. | Product-level failure taxonomy or result contract shaping. |

## 5. Migrate lists

### `runMvpIntegratedFlow.ts`

| Responsibility | Current source area / functions | Target module | Target responsibility | Inputs | Outputs | Side effects | Forbidden responsibilities | Priority | Risk | Local validation | Batch validation | Why it matters | Too risky if |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Shell result assembly | Already moved from action-result delivery and coding result builders | `shellResultAssembly.ts` | Keep owning pure coding result and actionable blocker assembly | Task kind, changed/failed files, verification, evidence | `CodingResultSummary`, user-facing output | None | Provider calls, writes, session persistence | Done | Low | `rtk npm run test -w packages/ts-shell -- src/orchestration/shellResultAssembly.test.ts` | `rtk npm run verify:result-contract` | Route 17 established the first result projection seam. | It starts absorbing provider/tool/session policy. |
| Runtime outcome projection | terminal/stopped/failure result shaping around query completion | `runtimeOutcomeProjection.ts` | Convert workflow state and terminal facts into an orchestration outcome | Query terminal, coding result, stop reason, continuation reason | Terminal reason/classification, stop reason, notes | None | Query loop control, provider calls, writer policy | P0 | Low-medium | `rtk npm run verify:result-contract` | `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation` | Separates user-visible truthfulness from orchestration control flow. | It requires changing result contract fields. |
| Provider outcome projection | provider mode/model/adapter failure interpretation near provider setup | `providerOutcomeProjection.ts` | Redacted provider outcome and model-output classification | Provider mode, selected model, adapter result/failure | Provider outcome object, redacted stop reason | None | Reading config, auth construction, network calls | P0 | Medium | `rtk npm run verify:provider-readiness:real -- --classification-self-test` | `rtk npm run verify:release:deterministic` | Protects redaction and failure attribution before more provider work. | It touches credential loading or private config. |
| Tool execution outcome projection | tool dispatch result handling and verification failure mapping | `toolExecutionOutcomeProjection.ts` | Convert tool lifecycle/provenance into query events and next-action facts | Tool result, lifecycle projection, approval outcome | Query events, provenance summary, verification blocker | None | Tool registration, MCP gateway invocation, sandbox policy | P1 | Medium | `rtk npm run verify:mcp:error-taxonomy` | `rtk npm run verify:mcp:local-execution` | Reduces risk in MCP/tool result surfaces. | It changes allowlists or MCP execution. |
| Mutation session handoff | mutation verification aggregation and continuity evidence assembly | `mutationSessionHandoff.ts` | Project mutation results into session continuity facts | Mutation result, verification, planned/changed/failed files | Handoff summary, continuity evidence, planned/changed/failed projections | None | Routing, patch application, workspace authority | P1 | Medium | `rtk npm run verify:real-user-capabilities:planned-files-continuity` | `rtk npm run verify:session-durability:long` | Keeps write evidence distinct from session persistence. | It changes write capability or route gates. |
| Stopped/failure result projection | stopped/error branches and fallback coding-result projection | `stoppedResultProjection.ts` | Produce stopped/error coding result and terminal facts | Failure reason, task plan, continuity state, provenance | Stopped `OrchestrationResult` facts | None | Runtime retries, session save, CLI rendering | P1 | Medium | `rtk npm run verify:real-user-capabilities:unsupported-patch-e2e` | `rtk npm run verify:result-contract` | Prevents success-like surfaces on failures. | It rewrites terminal reason taxonomy. |
| DoNext / next-action projection | next-action strings for blockers, verification, commands | `nextActionProjection.ts` | Normalize next-action guidance for runtime blockers | Blocker kind, verification status, failure reason | `nextAction`, evidence marker | None | CLI help text, provider/network classification | P2 | Low-medium | `rtk npm run verify:result-contract` | `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation` | Makes user repair guidance testable. | It changes compact result wording broadly. |
| Actionable blocker formatting | Remaining blocker evidence and do-next formatting not in shell result assembly | `actionableBlockerProjection.ts` or keep inside `shellResultAssembly.ts` | Single projection for blocker kind/reason/do-next | Reason, verification, evidence | Blocker contract | None | Terminal mapping, session persistence | P2 | Low | `rtk npm run test -w packages/ts-shell -- src/orchestration/shellResultAssembly.test.ts` | `rtk npm run verify:result-contract` | Avoids duplicate blocker classification. | It duplicates `resultMapper.ts` truthfulness logic. |
| Provider readiness call boundary | direct readiness calls and terminal event creation | Keep call in orchestrator; migrate projection to `providerOutcomeProjection.ts` | Orchestrator calls, module classifies | Provider readiness result | Redacted terminal event facts | None | Config load, credential print, default real execution | P0 | Medium | `rtk npm run verify:provider-readiness:real` | `rtk npm run verify:release:deterministic` | Keeps opt-in real behavior explicit. | It requires reading real-provider home directly. |
| Permission / approval bridge | approval requested/resolved event handling | `approvalBridgeProjection.ts` | Project approval request/resolution into query events and continuity facts | Approval request, decision, provenance | Query events, approval audit facts | None | Trust-policy storage, prompt UI | P2 | Medium | `rtk npm run verify:result-contract` | `rtk npm run verify:session-durability:long` | Makes approval continuity easier to reason about. | It changes approval authorization semantics. |
| Query loop control | `executeWorkflowTaskPlan`, turn sequencing | Keep in `runMvpIntegratedFlow.ts` | Coordinate planning/coder/verify turns | Prompt, plan, dependencies | Query events/result | Provider/tool I/O through injected dependencies | Result wording, session persistence, writer policy | Keep | High | N/A | N/A | This is the file's core job. | It becomes a broad runtime rewrite. |
| Runtime trace/debug projection | workflow/action seed decision trace helpers | `runtimeTraceProjection.ts` | Format debug/trace facts from runtime decisions | Plan, continuity, seed facts | Trace entries/evidence strings | None | User result wording, route policy | P2 | Low | `rtk npm run verify:result-contract` | `rtk npm run verify:release:deterministic` | Moves observability strings out of control flow. | It changes public compact output. |

### `SessionManager.ts`

| Responsibility | Current source area / functions | Target module | Target responsibility | Inputs | Outputs | Side effects | Forbidden responsibilities | Priority | Risk | Local validation | Batch validation | Why it matters | Too risky if |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Session project binding | create/resume root metadata, root rebinding, current project context | `sessionProjectBinding.ts` | Resolve and persist session/project/root binding facts | Requested root, git root, session metadata | Binding decision, diagnostics | Metadata write via gateway | CLI rendering, runtime capability | P1 | Medium | `rtk npm run verify:session-durability:long` | `rtk npm run verify:release:core` | Reduces cross-process resume/root drift risk. | It changes root-mode behavior. |
| Session replay builder | transcript normalization and runtime seed/replay preparation | `sessionReplayBuilder.ts` | Build replay prompts, transcript slices, and runtime seeds | Transcript events, state snapshot | Replay seed, prompt continuity facts | None | File I/O, current-session selection | P0 | Medium | `rtk npm run verify:session-durability:long` | `rtk npm run verify:result-contract` | Replay is central to `/continue` and durability. | It changes transcript schema. |
| Current session selection | current-session read/write by project root | `currentSessionSelector.ts` | Pick and update the current session for a project | Project root, session list, requested id | Session id/selection result | Current pointer write via gateway | Reentry scoring, CLI rendering | P1 | Medium | `rtk npm run verify:session-durability:long` | `rtk npm run verify:release:core` | Isolates one frequent source of continuity bugs. | It changes session fallback behavior. |
| Compact retention planner | auto-compact thresholds and retention decisions | `compactRetentionPlanner.ts` | Decide when and how transcript/state should compact | Transcript, state, thresholds | Retention plan | None | Summary text construction, persistence write | P0 | Medium | `rtk npm run verify:session-durability:long` | `rtk npm run verify:release:deterministic` | Makes long-session behavior testable without storage churn. | It changes retained evidence. |
| Compact summary builder | remaining summary/evidence extraction around `compactContinuitySummary.ts` | `compactSummaryBuilder.ts` | Build compact summaries before persistence | Transcript, continuity, approval/write facts | Summary entries, continuity object | None | Retention decision, file writes | P1 | Medium | `rtk npm run verify:real-user-capabilities:planned-files-continuity` | `rtk npm run verify:session-durability:long` | Keeps planned/changed/write continuity distinct. | It loses approval or write evidence. |
| Stopped-session resume context | continuity snapshot and stopped resume facts around extracted helper | `sessionResumeContextBuilder.ts` | Build stopped/active continuity snapshots and resume eligibility | State snapshot, transcript, current prompt | `SessionContinuitySnapshot`, eligibility | None | Session selection, compact writes | P0 | Medium | `rtk npm run verify:real-user-capabilities:planned-files-continuity` | `rtk npm run verify:session-durability:long` | Supports reliable `/continue` without expanding runtime. | It changes stopped terminal recovery behavior. |
| Mutation continuity state | changed/failed/verified/write continuity parsing | `mutationContinuityState.ts` | Normalize mutation continuity stored in session state | Coding result, state continuity | Mutation continuity facts | None | Patch application, route capability | P1 | Medium | `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation` | `rtk npm run verify:session-durability:long` | Keeps session state from knowing route internals. | It changes write success/failure semantics. |
| PlannedFiles continuity state | planned-files extraction/persistence for no-write planning | `plannedFilesContinuityState.ts` | Preserve planned targets distinct from changed files | Coding result, continuity entries | Planned target facts | None | Writer invocation, 3-file write support | P0 | Low-medium | `rtk npm run verify:real-user-capabilities:planned-files-continuity` | `rtk npm run verify:release:deterministic` | Protects Route 12 invariant. | It labels planned files as changed. |
| Approval context persistence | approval audit memory and permission request facts | `approvalContextPersistence.ts` | Persist and parse approval audit/request context | Approval records, state snapshot | Approval continuity facts | State write via gateway | Authorization decisions, prompt UI | P2 | Medium | `rtk npm run verify:result-contract` | `rtk npm run verify:session-durability:long` | Separates memory from authorization. | It changes trust policy. |
| Session persistence gateway | metadata/state/transcript paths, atomic writes, lock retry | `sessionPersistenceGateway.ts` | Low-level durable session I/O | Session id, metadata/state/events | Loaded/written records | Filesystem reads/writes under configured home | Resume policy, compact policy, CLI rendering | P2 | High | `rtk npm run verify:session-durability:long` | `rtk npm run verify:release:core` | Makes storage mechanics explicit. | It touches schema migration broadly. |
| History compaction | transcript compaction and summary replacement mechanics | `sessionHistoryCompaction.ts` | Apply a retention plan to transcript/history state | Retention plan, transcript | Compacted transcript/state | State/transcript write via gateway | Compact planning, summary content | P2 | High | `rtk npm run verify:session-durability:long` | `rtk npm run verify:release:deterministic` | Prevents compact mechanics from mixing with policy. | It risks data loss. |
| Cleanup/durability behavior | stale sessions, transient I/O, cleanup markers | `sessionDurabilityMaintenance.ts` | Cleanup and durability housekeeping | Session paths, timestamps, policies | Cleanup result | Filesystem cleanup under session home | Current-session selection, runtime result policy | Later | High | `rtk npm run verify:session-durability:long` | `rtk npm run verify:release:core` | Useful, but too risky before pure builders move. | It requires broad storage migration. |

### `cli.tsx`

| Responsibility | Current source area / functions | Target module | Target responsibility | Inputs | Outputs | Side effects | Forbidden responsibilities | Priority | Risk | Local validation | Batch validation | Why it matters | Too risky if |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CLI arg parsing | option parsing in `main`, `parseNonInteractiveApprovalMode`, prompt arg derivation | `cliArgs.ts` | Parse raw argv into typed CLI options | `process.argv.slice(2)` | `CliOptions`, parse diagnostics | None | Runtime invocation, provider auth loading | P0 | Low-medium | `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts` | `rtk npm run verify:cli-entry` | Makes modes testable before changing mode runners. | It changes CLI compatibility. |
| Mode dispatch | `main` branches for replay/print/stdin/interactive | `cliModeDispatcher.ts` | Choose and call the correct mode runner | Parsed options, bootstrap context | Mode result/exit status | Calls runner only | Prompt execution, result rendering | P0 | Medium | `rtk npm run verify:cli-entry` | `rtk npm run verify:release:core` | Reduces entrypoint branching. | It changes stdin/print precedence. |
| Print mode runner | non-interactive print prompt execution | `printModeRunner.ts` | Execute one prompt through shared runtime in print mode | Runtime context, prompt, approval mode | Rendered output/status | Session/runtime calls | CLI arg parsing, query semantics | P1 | Medium | `rtk npm run verify:cli-entry` | `rtk npm run verify:real-user-capabilities:two-file-cli-evidence` | Keeps print path evidence local. | It bypasses shared runtime. |
| Stdin mode runner | piped sequential prompt handling | `stdinModeRunner.ts` | Stream and execute stdin prompts in order | stdin text/stream, runtime context | Mode status | Session/runtime calls | Prompt normalization policy outside module | P1 | Medium | `rtk npm run verify:cli-entry` | `rtk npm run verify:release:core` | Preserves transport parity. | It changes prompt splitting. |
| Interactive bootstrap | readline setup, prompt chrome, turn loop setup | `interactiveModeRunner.ts` | Own interactive loop and prompt refresh | Runtime context, renderer, readline | Mode status | Readline I/O | Slash command semantics, approval policy | P1 | Medium-high | `rtk npm run verify:cli-entry` | `rtk npm run verify:release:core` | Makes live shell path less entangled. | It requires live TTY behavior changes. |
| Slash command registry | bridge around `routeSlashCommand` command actions | `cliSlashCommandBridge.ts` | Execute parsed slash commands against runtime/session surfaces | Slash result, runtime context | Command handled/not-handled result | Session/MCP calls as needed | Slash parser, runtime mutation policy | P0 | Medium | `rtk npm run verify:cli-entry` | `rtk npm run verify:mcp:local-execution` | Removes command semantics from entrypoint. | It changes command grammar. |
| Continue command bridge | `/continue`, `/resume`, session resume-like actions | `continueCommandBridge.ts` | Resolve continuation commands to runtime seeds/context | Slash result, session manager | Resume bridge result | Session calls | Replay builder internals, CLI render text | P0 | Medium | `rtk npm run verify:session-durability:long` | `rtk npm run verify:release:core` | Protects stopped-session continuity. | It changes reentry eligibility. |
| Approval prompt bridge | `createCliEscalationPromptHandler` and approval-mode object handling | `cliApprovalBridge.ts` | Resolve non-interactive and interactive approval decisions | Prompt, trust policy, approval mode object | Approval decision/audit record | Readline prompt, trust-policy writes | Runtime authorization, provider config | P1 | Medium | `rtk npm run verify:result-contract` | `rtk npm run verify:session-durability:long` | Isolates sensitive approval UX. | It infers write authorization from prompt text. |
| Provider readiness display | readiness display and preflight branches | `providerReadinessSurface.ts` | Render readiness outcome and call readiness checker through explicit opt-in | Credential snapshot, provider mode | Rendered readiness/status facts | Optional readiness call | Credential loading, redaction rules | P1 | Medium | `rtk npm run verify:provider-readiness:real` | `rtk npm run verify:release:deterministic` | Keeps provider display from leaking secrets. | It prints config paths/secrets. |
| Session selection bridge | session switch/list/current diagnostics | `sessionSelectionBridge.ts` | Resolve and render session switch/list/current operations | Session manager, reference, project root | Switch/list result | Session manager calls | Session persistence internals | P1 | Medium | `rtk npm run verify:session-durability:long` | `rtk npm run verify:cli-entry` | Makes session commands testable. | It changes current-session selection. |
| Runtime invocation | `streamOrchestratedResponse` and `ShellSessionRuntime` construction | `runtimeInvocationBridge.ts` | Build runtime dependencies and call orchestration | Runtime context, provider snapshot, mcp gateway | Async query events/output | Runtime/session calls | Query loop, provider auth core | P2 | Medium | `rtk npm run verify:result-contract` | `rtk npm run verify:release:core` | Narrows CLI-to-runtime seam. | It changes provider mode or MCP wiring. |
| Terminal result display | result blocks, startup/session/workspace/MCP surfaces | `terminalResultSurface.ts` plus existing surfaces | Render terminal/session/MCP summaries | Runtime result, renderer, mode | Printed lines | Terminal output | Runtime result classification | P2 | Medium | `rtk npm run verify:result-contract` | `rtk npm run verify:release:deterministic` | Lets output wording be tested separately. | It changes compact output contract broadly. |
| Startup/environment bootstrap | runtime config, project root, provider snapshot, session bootstrap | `cliBootstrap.ts` | Build CLI runtime context from process environment and args | cwd, options, env-derived config | Bootstrap context, notices | Session creation/resume | Mode dispatch, provider network calls | P1 | Medium | `rtk npm run verify:cli-entry` | `rtk npm run verify:release:core` | Reduces `main` setup sprawl. | It changes project root resolution. |

## 6. Target module map

| Target module | Source | Owns | Must not own |
| --- | --- | --- | --- |
| `orchestration/runtimeOutcomeProjection.ts` | `runMvpIntegratedFlow.ts` | Terminal reason/classification and stopped/completed outcome projection | Query loop, provider calls, session writes |
| `orchestration/providerOutcomeProjection.ts` | `runMvpIntegratedFlow.ts` | Provider/model-output outcome classification and redacted stop facts | Credential loading, network calls |
| `orchestration/toolExecutionOutcomeProjection.ts` | `runMvpIntegratedFlow.ts` | Tool lifecycle event/result projection | MCP gateway invocation, sandbox policy |
| `orchestration/mutationSessionHandoff.ts` | `runMvpIntegratedFlow.ts` | Mutation-to-session continuity handoff facts | Patch routing/application |
| `orchestration/stoppedResultProjection.ts` | `runMvpIntegratedFlow.ts` | Stopped/error result projection | Terminal display, session persistence |
| `orchestration/runtimeTraceProjection.ts` | `runMvpIntegratedFlow.ts` | Trace/debug evidence formatting | User-facing compact output |
| `session/sessionReplayBuilder.ts` | `SessionManager.ts` | Transcript replay and runtime seed construction | File I/O |
| `session/sessionResumeContextBuilder.ts` | `SessionManager.ts` | Continuity snapshots and resume eligibility | Current-session selection |
| `session/compactRetentionPlanner.ts` | `SessionManager.ts` | Compact retention decisions | Summary text or writes |
| `session/compactSummaryBuilder.ts` | `SessionManager.ts` | Compact summary/evidence construction | Retention policy or persistence mechanics |
| `session/plannedFilesContinuityState.ts` | `SessionManager.ts` | Planned-file continuity projection | Write support |
| `session/sessionPersistenceGateway.ts` | `SessionManager.ts` | Durable session I/O | Resume/compact policy |
| `entrypoints/cliArgs.ts` | `cli.tsx` | Typed CLI option parsing | Runtime execution |
| `entrypoints/cliModeDispatcher.ts` | `cli.tsx` | Mode selection | Mode internals |
| `entrypoints/cliSlashCommandBridge.ts` | `cli.tsx` | Slash command execution bridge | Slash grammar |
| `entrypoints/continueCommandBridge.ts` | `cli.tsx` | Continue/resume bridge | Replay internals |
| `entrypoints/cliApprovalBridge.ts` | `cli.tsx` | CLI approval decisions and prompt bridge | Authorization policy expansion |
| `entrypoints/providerReadinessSurface.ts` | `cli.tsx` | Readiness display | Credential/config loading |

## 7. Migration priority table

| Rank | Source file | Target module | Why this priority | Expected maintainability impact | Expected risk | Local validation | Batch validation |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | `runMvpIntegratedFlow.ts` | `runtimeOutcomeProjection.ts` | Closest follow-up to Route 17; pure enough and user-visible. | High | Low-medium | `rtk npm run verify:result-contract` | `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation` |
| 2 | `SessionManager.ts` | `sessionResumeContextBuilder.ts` | Protects `/continue` and stopped continuity. | High | Medium | `rtk npm run verify:real-user-capabilities:planned-files-continuity` | `rtk npm run verify:session-durability:long` |
| 3 | `cli.tsx` | `cliArgs.ts` | Low-risk path to shrink CLI and unlock mode tests. | Medium-high | Low-medium | `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts` | `rtk npm run verify:cli-entry` |
| 4 | `cli.tsx` | `cliModeDispatcher.ts` | Separates mode precedence from entrypoint setup. | High | Medium | `rtk npm run verify:cli-entry` | `rtk npm run verify:release:core` |
| 5 | `SessionManager.ts` | `compactRetentionPlanner.ts` | Pure decision extraction for long-session safety. | High | Medium | `rtk npm run verify:session-durability:long` | `rtk npm run verify:release:deterministic` |
| 6 | `runMvpIntegratedFlow.ts` | `providerOutcomeProjection.ts` | Redaction/failure attribution is sensitive and should be local. | Medium-high | Medium | `rtk npm run verify:provider-readiness:real -- --classification-self-test` | `rtk npm run verify:release:deterministic` |
| 7 | `cli.tsx` | `cliSlashCommandBridge.ts` | Slash command semantics currently dominate the entrypoint. | High | Medium | `rtk npm run verify:cli-entry` | `rtk npm run verify:mcp:local-execution` |
| 8 | `SessionManager.ts` | `plannedFilesContinuityState.ts` | Preserves no-write planning invariants. | Medium-high | Low-medium | `rtk npm run verify:real-user-capabilities:planned-files-continuity` | `rtk npm run verify:release:deterministic` |
| 9 | `runMvpIntegratedFlow.ts` | `mutationSessionHandoff.ts` | Isolates route result facts from session continuity. | High | Medium | `rtk npm run verify:real-user-capabilities:planned-files-continuity` | `rtk npm run verify:session-durability:long` |
| 10 | `cli.tsx` | `continueCommandBridge.ts` | Keeps CLI session actions aligned with resume semantics. | Medium-high | Medium | `rtk npm run verify:session-durability:long` | `rtk npm run verify:release:core` |
| 11 | `runMvpIntegratedFlow.ts` | `toolExecutionOutcomeProjection.ts` | Helps MCP/tool failures stay projection-only. | Medium-high | Medium | `rtk npm run verify:mcp:error-taxonomy` | `rtk npm run verify:mcp:local-execution` |
| 12 | `SessionManager.ts` | `sessionReplayBuilder.ts` | Replay seed behavior is important but schema-adjacent. | High | Medium | `rtk npm run verify:session-durability:long` | `rtk npm run verify:result-contract` |
| 13 | `cli.tsx` | `cliApprovalBridge.ts` | Sensitive UX path; defer until CLI args/modes are stable. | Medium | Medium | `rtk npm run verify:result-contract` | `rtk npm run verify:session-durability:long` |
| 14 | `SessionManager.ts` | `sessionPersistenceGateway.ts` | High value but storage-heavy; defer. | High | High | `rtk npm run verify:session-durability:long` | `rtk npm run verify:release:core` |
| 15 | `cli.tsx` | `providerReadinessSurface.ts` | Important for redaction but depends on bootstrap seams. | Medium | Medium | `rtk npm run verify:provider-readiness:real` | `rtk npm run verify:release:deterministic` |

## 8. Migration batches

### Batch 1: orchestration outcome and handoff

- Goal: make `runMvpIntegratedFlow.ts` an orchestration coordinator instead of
  an outcome/result/failure projection owner.
- Migrations included: `runtimeOutcomeProjection.ts`,
  `providerOutcomeProjection.ts`, `mutationSessionHandoff.ts`,
  `stoppedResultProjection.ts`, `toolExecutionOutcomeProjection.ts`,
  `runtimeTraceProjection.ts`.
- Why these belong together: they all convert runtime facts into typed outcome,
  evidence, or handoff projections without owning provider calls, patch writes,
  or session persistence.
- Allowed files: new modules/tests under `packages/ts-shell/src/orchestration/`
  and minimal wiring in `runMvpIntegratedFlow.ts`.
- Forbidden files: `cli.tsx`, `SessionManager.ts`, provider/auth core, MCP core,
  scripts, `package.json`, default gates, capability limits.
- Local validation after each migration: the local command listed in the
  migration row.
- Full validation after batch:
  - `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`
  - `rtk npm run verify:real-user-capabilities:planned-files-continuity`
  - `rtk npm run verify:result-contract`
  - `rtk npm run verify:mcp:local-execution`
  - `rtk npm run build -w packages/ts-shell`
  - `rtk npm run verify:release:deterministic`
- Success criteria: compact result output, stopped/error classification,
  mutation handoff, provider redaction, and MCP/tool failure surfaces are
  unchanged except for code ownership.
- Failure criteria: any changed default gate, real-provider default execution,
  capability expansion, secret/config printing, or changed mutation support.
- Rollback plan: revert only the batch module/wiring changes and keep any
  independent tests that still pass and document current behavior.
- Stop conditions: provider/auth core changes, broad mutation support,
  external MCP readiness, terminal taxonomy expansion, or session schema
  changes.

### Batch 2: session compact, replay, and continuity

- Goal: make `SessionManager.ts` a facade over named session services.
- Migrations included: `sessionResumeContextBuilder.ts`,
  `sessionReplayBuilder.ts`, `compactRetentionPlanner.ts`,
  `compactSummaryBuilder.ts`, `mutationContinuityState.ts`,
  `plannedFilesContinuityState.ts`, then later
  `sessionPersistenceGateway.ts` and `sessionHistoryCompaction.ts`.
- Why these belong together: they all shape durable continuation behavior and
  should preserve stopped, compact, planned-files, approval, and mutation
  continuity.
- Allowed files: new modules/tests under `packages/ts-shell/src/session/` and
  minimal wiring in `SessionManager.ts`.
- Forbidden files: `cli.tsx`, provider/auth core, MCP core, patch application,
  mutation capability modules, scripts, `package.json`.
- Local validation after each migration: the local command listed in the
  migration row.
- Full validation after batch:
  - `rtk npm run verify:real-user-capabilities:planned-files-continuity`
  - `rtk npm run verify:session-durability:long`
  - `rtk npm run verify:result-contract`
  - `rtk npm run build -w packages/ts-shell`
  - `rtk npm run verify:release:deterministic`
- Success criteria: `/continue`, compact-equivalent continuity, planned files,
  approval memory, and mutation handoff evidence remain unchanged.
- Failure criteria: planned files become changed files, writer reach expands,
  compact loses evidence, resume eligibility changes unexpectedly, or storage
  residue appears.
- Rollback plan: revert the latest service extraction first; do not rewrite
  storage schema as a rollback shortcut.
- Stop conditions: schema migration, new persistence layer, arbitrary recovery
  behavior, rollback/atomicity claims, or broad history compaction changes.

### Batch 3: CLI mode, command, approval, and surface

- Goal: make `cli.tsx` a process entrypoint and dispatcher over named CLI
  modules.
- Migrations included: `cliArgs.ts`, `cliModeDispatcher.ts`,
  `printModeRunner.ts`, `stdinModeRunner.ts`, `interactiveModeRunner.ts`,
  `cliSlashCommandBridge.ts`, `continueCommandBridge.ts`,
  `cliApprovalBridge.ts`, `providerReadinessSurface.ts`,
  `sessionSelectionBridge.ts`, and `runtimeInvocationBridge.ts`.
- Why these belong together: they all reduce entrypoint responsibility while
  preserving shared turn execution and CLI parity.
- Allowed files: new modules/tests under `packages/ts-shell/src/entrypoints/`
  and minimal wiring in `cli.tsx`.
- Forbidden files: `runMvpIntegratedFlow.ts` except runtime invocation adapter
  type imports, `SessionManager.ts` except public API calls, provider/auth core,
  MCP core, scripts, `package.json`, default gates.
- Local validation after each migration: the local command listed in the
  migration row.
- Full validation after batch:
  - `rtk npm run verify:cli-entry`
  - `rtk npm run verify:real-user-capabilities:two-file-cli-evidence`
  - `rtk npm run verify:session-durability:long`
  - `rtk npm run verify:mcp:local-execution`
  - `rtk npm run verify:result-contract`
  - `rtk npm run build -w packages/ts-shell`
  - `rtk npm run verify:release:deterministic`
- Success criteria: print/stdin/replay/interactive dispatch precedence, slash
  commands, `/continue`, approval prompts, provider readiness display, and
  result blocks are behavior-preserving.
- Failure criteria: CLI mode precedence changes, prompt text grants write
  authorization, provider config is printed, or shared runtime is bypassed.
- Rollback plan: revert the most recent runner/bridge extraction and keep
  parsed option tests only if they still reflect current entrypoint behavior.
- Stop conditions: UI redesign, slash grammar rewrite, provider config
  migration, non-default real-provider execution, or live TTY readiness claims.

## 9. Local validation strategy

Local validation must run after each individual migration and should be focused
on the responsibility moved:

- Result/outcome projection: `rtk npm run verify:result-contract`.
- Candidate mutation handoff/result: `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`.
- Planned-files continuity: `rtk npm run verify:real-user-capabilities:planned-files-continuity`.
- Long-session/replay/compact: `rtk npm run verify:session-durability:long`.
- CLI args/modes: `rtk npm run verify:cli-entry` and, where possible,
  `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts`.
- MCP/tool projection: `rtk npm run verify:mcp:error-taxonomy` or
  `rtk npm run verify:mcp:local-execution`.
- Provider readiness surface: `rtk npm run verify:provider-readiness:real` and
  `rtk npm run verify:provider-readiness:real -- --classification-self-test`.
- Type safety: `rtk npm run build -w packages/ts-shell`.

Local validation is not permission to broaden the route. If the focused command
does not cover the moved responsibility, add a focused module test in the
implementation route before relying on broad gates.

## 10. Batch validation strategy

Batch validation should run after completing a group of related migrations:

- Orchestration batch:
  - `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`
  - `rtk npm run verify:real-user-capabilities:planned-files-continuity`
  - `rtk npm run verify:mcp:local-execution`
  - `rtk npm run verify:result-contract`
  - `rtk npm run build -w packages/ts-shell`
- Session batch:
  - `rtk npm run verify:real-user-capabilities:planned-files-continuity`
  - `rtk npm run verify:session-durability:long`
  - `rtk npm run verify:result-contract`
  - `rtk npm run build -w packages/ts-shell`
- CLI batch:
  - `rtk npm run verify:cli-entry`
  - `rtk npm run verify:real-user-capabilities:two-file-cli-evidence`
  - `rtk npm run verify:session-durability:long`
  - `rtk npm run verify:mcp:local-execution`
  - `rtk npm run verify:result-contract`
  - `rtk npm run build -w packages/ts-shell`

Every batch should finish with `rtk npm run verify:release:deterministic` unless
the implementation route explicitly scopes a smaller pre-commit gate and leaves
that broader gate for a later checkpoint.

## 11. Full validation strategy

Before committing an implementation route that follows this map, run:

- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`
- `rtk npm run verify:real-user-capabilities:planned-files-continuity`
- `rtk npm run verify:session-durability:long`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk npm run verify:release:deterministic`
- `rtk git diff --check`
- `rtk git status --short --branch`

Run provider-readiness gates only when the route touches provider-facing
behavior, and never run full opt-in real-provider mutation execution unless the
route explicitly opens that gate.

## 12. Stop conditions

Stop the migration route if the next step requires any of these:

- Product capability expansion.
- Broad `apply_patch`, 3-file writes, 3+ mutation support, delete/move,
  rollback, fuzzy patching, or atomic multi-file recovery.
- Provider/auth core changes.
- Reading, printing, copying, parsing, cleaning, or summarizing
  `/home/wang/.private-agents-real`.
- External MCP readiness or arbitrary external MCP server execution.
- Default gate or package script changes.
- Session schema migration or new persistence layer.
- Moving TypeScript control-plane semantics into Rust.
- CLI grammar rewrite or UI redesign.
- Release/general-readiness claim expansion.

## 13. What must not change

- No product code changes in Route 18.
- No scripts or `package.json` changes in Route 18.
- No default gate changes.
- No provider/MCP behavior changes.
- No mutation capability expansion.
- No readiness claim expansion.
- No real-provider default execution.
- No secret or provider config printing.

## 14. First recommended migration

Extract `runtimeOutcomeProjection.ts` from `runMvpIntegratedFlow.ts`.

Why first:

- It builds directly on Route 17's result assembly seam.
- It is mostly pure projection and can be tested without provider, MCP, or
  filesystem writes.
- It reduces user-visible truthfulness risk before more provider/tool/session
  changes.
- It does not require changing default gates, provider auth, writer capability,
  or session schema.

Initial validation:

- `rtk npm run verify:result-contract`
- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`
- `rtk npm run build -w packages/ts-shell`

## 15. Second and third recommended migrations

Second: extract `sessionResumeContextBuilder.ts` from `SessionManager.ts`.

- Reason: stopped-session continuity and `/continue` are central user-facing
  behavior, and the extraction can be pure over loaded session state.
- Validation: `rtk npm run verify:real-user-capabilities:planned-files-continuity`
  and `rtk npm run verify:session-durability:long`.

Third: extract `cliArgs.ts` from `cli.tsx`.

- Reason: CLI parsing is low enough risk to unlock mode dispatch extraction and
  focused tests.
- Validation: `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts`
  and `rtk npm run verify:cli-entry`.

## 16. Definition of success for architecture maintainability 4/5

Maintainability reaches 4/5 when:

- `runMvpIntegratedFlow.ts` owns orchestration coordination, not result,
  provider, tool, mutation handoff, and failure projection policy.
- `SessionManager.ts` owns the public session facade, not every compact,
  replay, continuity, approval-memory, and persistence detail.
- `cli.tsx` owns process entrypoint composition, not all mode runners, command
  bridges, approval prompts, provider readiness display, and terminal surfaces.
- Each extracted module has a focused responsibility, typed input/output shape,
  and focused test or verifier.
- Compact output, result contract truthfulness, stopped continuity, MCP/tool
  failure projection, provider redaction, and mutation capability limits remain
  unchanged.
- No extraction route becomes a broad rewrite or capability expansion.

## 17. Appendix: commands run and results

Baseline commands for Route 18:

| Command | Result |
| --- | --- |
| `rtk git status --short --branch` | Passed before edits: `main...origin/main`, clean tracked state. |
| `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation` | Passed. Six synthetic candidate mutation cases passed; real-provider cases skipped by default; `realProviderTouched=false`; `defaultMvpAffected=false`. |
| `rtk npm run verify:real-user-capabilities:planned-files-continuity` | Passed. `realProviderTouched=false`; `changedFiles=none`; `writerInvoked=false`; `workspaceUnchanged=true`. |
| `rtk npm run verify:session-durability:long` | Passed. Synthetic long-session durability test file passed: 2 tests. |
| `rtk npm run verify:result-contract` | Passed. Result mapper, terminal classification, provider-readiness terminal result, synthetic print/replay, and hard gate passed. |
| `rtk npm run build -w packages/ts-shell` | Passed. `tsc -p tsconfig.build.json`. |
| `rtk npm run verify:release:deterministic` | Passed. `realProviderTouched=false`; `candidateMutationRealExecuted=false`; `externalMcpServerUsed=false`; `userMcpConfigUsed=false`; `realProviderOptInEnvCleared=true`; `broadReleaseReady=false`. |
| `rtk git diff --check` | Passed. |
| `rtk git status --short --branch` | Passed after cleanup: only `docs/design/runtime-module-ownership-map.md` is untracked for Route 18. |

No full opt-in real-provider mutation execution was run for this route.
