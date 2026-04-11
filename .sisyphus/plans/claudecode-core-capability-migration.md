# ClaudeCode Core Capability Migration Plan

## Goal

Refocus the rewrite effort from productization features to **core ClaudeCode capability migration**, using the existing TS/Rust/Python foundation only as the target runtime base.

## Current Checkpoint

This migration phase is no longer at the initial execution-start stage. The core migration pass has been implemented through W1-W5, and the repository is now in a documentation-sync and next-backlog-definition checkpoint.

Verified state at this checkpoint:

- `npm run build` ✅
- `npm test` ✅
- `npm run doctor` ✅
- supporting migration evidence exists under `.sisyphus/evidence/`

This phase is explicitly about migrating the **core execution architecture** from the ClaudeCode source snapshot into the private multi-language rewrite, in the following order:

1. QueryEngine / query execution flow
2. tool runtime / permission model
3. MCP client / gateway
4. command registry / slash workflow
5. shell session orchestration

## Scope Boundaries

### IN SCOPE
- Porting responsibilities, boundaries, and runtime behavior from the ClaudeCode core execution path
- Rebuilding equivalent capability inside the private TS shell + Rust core architecture
- Preserving key operational properties: interruptibility, streaming, tool gating, session continuity, and command/tool orchestration

### OUT OF SCOPE
- Further productization-only features unless directly required by core migration
- Broad UX polish unrelated to ClaudeCode core runtime behavior
- Full parity with every ClaudeCode feature flag or ant-only path

## Source-of-Truth Architecture To Migrate

Primary execution spine identified from the source snapshot:

- `entrypoints/cli.tsx`
- `main.tsx`
- `setup.ts`
- `QueryEngine.ts`
- `query.ts`
- `tools.ts`
- `commands.ts`
- `services/mcp/**`
- shared runtime helpers in `utils/**`, `services/tools/**`, `bootstrap/**`

## Migration Principles

1. **Preserve responsibility boundaries before optimizing implementation.**
2. **Migrate the execution spine in dependency order, not by file size or convenience.**
3. **Rebuild source-of-truth registries before leaf behaviors.**
4. **Model runtime behavior first, product UX second.**
5. **Prefer a capability-complete subset over a wide but shallow imitation.**

## Ordered Workstreams

- [x] 1. QueryEngine / query execution flow migration
  - Map current query lifecycle responsibilities into the private runtime
  - Rebuild turn state, stream lifecycle, stop conditions, retry/error propagation, and result normalization
  - Define which state remains in TS shell and which execution hooks defer to Rust later
  - Target rewrite modules:
    - `packages/ts-shell/src/core/query/QueryEngine.ts`
    - `packages/ts-shell/src/core/query/queryLoop.ts`
    - `packages/ts-shell/src/core/query/transitions.ts`
    - `packages/ts-shell/src/core/query/runtimeState.ts`
    - `packages/ts-shell/src/core/query/resultMapper.ts`
  - Acceptance criteria:
    - A single-turn execution loop exists outside CLI code
    - Stop reasons / retries / turn transitions are modeled explicitly
    - Streamed results and final result objects are normalized by the new core query layer
  - QA scenarios:
    - Run a query-loop unit suite proving completed, stopped_max_turns, and invalid-transition outcomes
    - Run an integration test proving streamed chunks and final result summary stay consistent

- [x] 2. Tool runtime / permission model migration
  - Rebuild tool registry semantics around source-of-truth tool/runtime separation
  - Port approval flow, permission context propagation, tool execution lifecycle, and result handling shape
  - Align current sandbox model with ClaudeCode’s runtime permission behavior
  - Target rewrite modules:
    - `packages/ts-shell/src/core/tools/registry.ts`
    - `packages/ts-shell/src/core/tools/runtime.ts`
    - `packages/ts-shell/src/core/tools/permissionContext.ts`
    - `packages/ts-shell/src/core/tools/toolResultLifecycle.ts`
    - `packages/ts-shell/src/core/tools/approvalFlow.ts`
  - Acceptance criteria:
    - Registry and execution runtime are separate concerns
    - Permission context is passed end-to-end into tool execution
    - Approval/denial results are preserved in runtime-visible result objects
  - QA scenarios:
    - Run tool-runtime tests for allowed, denied, escalated, and runtime-error outcomes
    - Run an integration test proving tool-call results flow back into the core query execution state

- [x] 3. MCP client / gateway migration
  - Recreate MCP client connection model, server resource access, tool/resource invocation boundaries, and gateway orchestration seams
  - Define stable TS-side interfaces that can later bridge to Rust-backed execution where appropriate
  - Target rewrite modules:
    - `packages/ts-shell/src/core/mcp/client.ts`
    - `packages/ts-shell/src/core/mcp/connectionManager.ts`
    - `packages/ts-shell/src/core/mcp/gateway.ts`
    - `packages/ts-shell/src/core/mcp/types.ts`
    - `packages/ts-shell/src/core/mcp/resourceBridge.ts`
  - Acceptance criteria:
    - MCP client lifecycle is isolated from command/tool registry logic
    - Tool/resource/prompt access goes through a single typed MCP surface
    - Gateway layer can fan in multiple MCP connections without leaking transport details upward
  - QA scenarios:
    - Run MCP client tests with mocked server capabilities and failed initialization cases
    - Run an integration test proving a tool/resource fetch can cross the gateway boundary

- [x] 4. Command registry / slash workflow migration
  - Rebuild command registry semantics from `commands.ts` and command modules
  - Distinguish prompt commands, local commands, slash-routing, and execution-time side effects
  - Define what belongs in CLI parsing vs runtime orchestration vs tool invocation
  - Target rewrite modules:
    - `packages/ts-shell/src/core/commands/registry.ts`
    - `packages/ts-shell/src/core/commands/slashRouter.ts`
    - `packages/ts-shell/src/core/commands/commandTypes.ts`
    - `packages/ts-shell/src/core/commands/localCommandRuntime.ts`
    - `packages/ts-shell/src/core/commands/promptCommandRuntime.ts`
  - Acceptance criteria:
    - Command categories are explicit in the rewrite registry
    - Slash parsing/routing is decoupled from CLI line reading
    - Local/prompt command behavior is testable without starting the full shell
  - QA scenarios:
    - Run routing tests for prompt command, local command, unknown slash, and disabled command cases
    - Run an integration test proving a slash command mutates runtime state without bypassing the core loop

- [x] 5. Shell session orchestration migration
  - Rebuild setup/session bootstrapping behavior from `setup.ts` and CLI entry flow
  - Cover cwd, git/worktree context, session persistence, resume, and runtime initialization ordering
  - Make shell orchestration the final integrator of the prior four workstreams
  - Target rewrite modules:
    - `packages/ts-shell/src/core/shell/setup.ts`
    - `packages/ts-shell/src/core/shell/sessionBootstrap.ts`
    - `packages/ts-shell/src/core/shell/runtimeContext.ts`
    - `packages/ts-shell/src/core/shell/orchestratedCli.ts`
    - `packages/ts-shell/src/core/shell/sessionRecovery.ts`
  - Acceptance criteria:
    - Shell startup is a thin integrator over migrated query/tools/MCP/commands modules
    - Session bootstrap order is explicit and testable
    - Resume and recovery behavior work without embedding core logic in the CLI entrypoint
  - QA scenarios:
    - Run startup tests proving clean bootstrap with and without resume state
    - Run an end-to-end CLI smoke test that exercises branch/worktree context + session recovery + migrated execution loop

## Dependency Order

- W1 QueryEngine/query -> blocks W2, W3, W4, W5
- W2 Tool runtime/permissions -> blocks W3, W4, W5
- W3 MCP client/gateway -> blocks W5
- W4 Command registry/slash workflow -> blocks W5
- W5 Shell session orchestration -> final integration layer

## Deliverables Per Workstream

### W1. QueryEngine / query
- responsibility map from source files to rewrite files
- migrated execution-loop design
- explicit state model for turns, retries, stops, tool-result transitions
- implementation checklist for the first coding pass
- proof target: `packages/ts-shell/src/core/query/*.test.ts`

#### W1 Source Responsibility Anchors

- `QueryEngine.ts`
  - long-lived conversation/session wrapper around the query loop
  - prompt/context assembly
  - transcript durability timing
  - SDK/headless-facing message normalization and final result synthesis
- `query.ts`
  - core query state machine
  - turn transitions, recoveries, tool execution phase, stop hooks, continuation logic
- `query/config.ts`
  - immutable per-query config snapshot seed
- `query/deps.ts`
  - current dependency injection seam for side effects
- `query/stopHooks.ts`
  - stop-hook control boundary in the loop
- `query/tokenBudget.ts`
  - token-budget continuation logic
- closely coupled helpers:
  - `utils/queryContext.ts`
  - `utils/processUserInput/processUserInput.ts`
  - `services/tools/toolOrchestration.ts`
  - `utils/queryHelpers.ts`
  - `bootstrap/state.ts`

#### W1 Migration Notes

- The rewrite must preserve a split between:
  - **core query state machine**
  - **host/session wrapper**
  - **side-effect adapters**
- `QueryEngine.ts` is not the core loop; it is the persistent wrapper that prepares inputs and normalizes outputs.
- `query.ts` is the actual execution spine and must be migrated as a state-machine-first design, not rewritten as ad hoc orchestration.
- Transcript timing and withheld-recovery behavior are load-bearing and must be treated as correctness constraints, not implementation details.

### W2. Tool runtime / permissions
- registry/runtime split design
- permission-context propagation design
- migrated approval lifecycle design
- implementation checklist for tool/runtime parity subset
- proof target: `packages/ts-shell/src/core/tools/*.test.ts`

#### W2 Source Responsibility Anchors

- `tools.ts`
  - source-of-truth for available tools
  - feature-flag and environment gating
  - registry-level enable/disable decisions
- `Tool.ts`
  - shared runtime contracts: `ToolPermissionContext`, `ToolUseContext`, tool lifecycle surface
  - central type boundary between query/runtime/tool execution
- `services/tools/toolOrchestration.ts`
  - batch partitioning of tool calls
  - concurrency-safe vs serial execution decisions
  - context mutation ordering after tool completion
- `services/tools/StreamingToolExecutor.ts`
  - streaming-time tool execution model
  - queued/executing/completed state tracking
  - sibling cancellation, synthetic error messages, interruption semantics
- `utils/permissions/permissions.ts`
  - permission rule evaluation
  - ask/allow/deny rule resolution
  - permission request messaging and policy decision plumbing
- `utils/shell/shellToolUtils.ts`
  - shell tool gating, especially platform/runtime gates for PowerShell/Bash behavior

#### W2 Migration Notes

- The rewrite must not treat the current `packages/ts-shell/src/tools/registry.ts` as equivalent to ClaudeCode parity.
- ClaudeCode’s actual runtime split is: **registry (`tools.ts`) -> shared contracts (`Tool.ts`) -> execution orchestrator (`services/tools/*`) -> permission policy (`utils/permissions/*`)**.
- The migration should preserve that split instead of keeping registry/permission/runtime fused together.

### W3. MCP client / gateway
- connection lifecycle model
- client/gateway API surface in rewrite runtime
- migration checklist for resources/tools/prompts surface
- proof target: `packages/ts-shell/src/core/mcp/*.test.ts`

#### W3 Source Responsibility Anchors

- `services/mcp/types.ts`
  - MCP config schema types
  - transport variants
  - connection state union (`connected` / `failed` / `needs-auth` / `pending` / `disabled`)
  - serialized CLI-facing MCP state
- `services/mcp/client.ts`
  - actual MCP client runtime
  - transport creation (`stdio`, `sse`, `http`, `ws`, `sdk`)
  - auth/session-expiry handling
  - tool/resource/prompt retrieval and tool-call normalization
- `services/mcp/MCPConnectionManager.tsx`
  - React/context integration boundary around reconnect/toggle behavior
  - indicates connection lifecycle concerns separate from raw client protocol code

#### W3 Migration Notes

- The rewrite should separate:
  - **config/type layer**
  - **protocol client/transport layer**
  - **gateway/aggregation layer**
  - **shell/UI integration layer**
- `services/mcp/client.ts` is too broad to port 1:1; migration should extract typed client/gateway boundaries first.

### W4. Command registry / slash workflow
- registry design and command category mapping
- slash-routing model
- migration checklist for command execution categories
- proof target: `packages/ts-shell/src/core/commands/*.test.ts`

#### W4 Source Responsibility Anchors

- `commands.ts`
  - master registry for built-in commands
  - feature-gated command loading
  - command availability filtering
  - dynamic skill/plugin/workflow command merge order
- `commands/**`
  - concrete command modules carrying type/category semantics (`prompt`, local command, etc.)
  - slash behavior is distributed through command type contracts rather than one flat parser

#### W4 Migration Notes

- The rewrite must port registry semantics, not just a list of commands.
- Critical responsibilities to preserve:
  - built-in vs dynamic command ordering
  - availability filtering before enabled filtering
  - category split between prompt/local/other execution styles

### W5. Shell session orchestration
- startup ordering design
- session/bootstrap state graph
- integration checklist connecting W1-W4 into the shell runtime
- proof target: `packages/ts-shell/src/core/shell/*.test.ts`

#### W5 Source Responsibility Anchors

- `setup.ts`
  - shell startup/bootstrapping order
  - cwd/session/project-root setup
  - worktree/tmux/session switching
  - hook watcher initialization
  - prefetch/background initialization boundaries
- closely coupled runtime surfaces:
  - `bootstrap/state.ts`
  - session/worktree helpers under `utils/worktree.js`, `utils/sessionStorage.js`, hooks/watcher utilities

#### W5 Migration Notes

- Shell orchestration is not just CLI parsing; it is the final runtime integrator of session, git/worktree, hooks, startup checks, and query runtime.
- This workstream must come last because it consumes the migrated query, tools, MCP, and command subsystems.

## Phase Acceptance Criteria

- [x] The migration plan identifies a concrete target module for each major ClaudeCode core responsibility
- [x] The dependency order prevents shell/session work from outpacing runtime/tool/query migration
- [x] The plan distinguishes source-inspired architecture from prior productization add-ons
- [x] The next implementation step can begin with W1 without ambiguity about scope

## Current Remaining Work

- synchronize plan and workspace documents with the implemented W1-W5 state
- refresh top-level architecture/workspace docs so they describe the current TS control plane and Rust execution plane split accurately
- define the next backlog only after documentation and checkpoint status are aligned

## Completed Evidence Anchors

- `.sisyphus/evidence/w1-queryengine-query-migration.txt`
- `.sisyphus/evidence/w2-tool-runtime-permissions-migration.txt`
- `.sisyphus/evidence/c4-c5-shell-actions-and-registry.txt`
- `.sisyphus/evidence/d4-d5-shell-substrate.txt`
- `.sisyphus/evidence/e4-visible-tool-pool.txt`
- `.sisyphus/evidence/b4-b5-rust-execution-mainline.txt`
- `.sisyphus/evidence/a3-a5-durability-replay-closure.txt`

## Next Planning Guardrail

The next phase should preserve the current architectural rule already proven in code:

> TypeScript owns the control plane.
> Rust owns the execution plane.

Future work should deepen Rust only for execution-bound responsibilities and should not move shell, session, orchestration, permission UX, or MCP capability policy out of the TS runtime.
