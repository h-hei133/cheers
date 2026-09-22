# Pi Reference Inspection Notes

BI001 is a planning route for `docs/build-infrastructure`. It did not change
product code.

## Inputs Used

- Uploaded Pi architecture summary: `docs/build-infrastructure/pi_structure.md`
- Local Pi reference repository: `/home/wang/projects/pi`
- Current project repository: `/home/wang/projects/cheer`
- Serena semantic inspection for both repositories
- Current route plan: `docs/build-infrastructure/route/route-bi001-pi-inspired-architecture-planning.md`
- Current project constraints from `AGENTS.md`, `docs/ACTIVE_CONTEXT.md`,
  `docs/DOC_STATUS.md`, and the product architecture reset execution boundary

## Serena Inspection Scope

Serena was available and used for targeted symbol/file inspection. Broad source
dumps were avoided. Shell `find` was used only to locate reference files and
repo shape.

Current project activated with Serena:

- `/home/wang/projects/cheer`

Pi reference project activated with Serena:

- `/home/wang/projects/pi`

Serena onboarding was surfaced by the tool for first-time projects, but this
route is doc-only planning and did not create or update Serena memory files.

## Pi Areas Inspected

Pi files inspected with Serena symbol overviews or targeted symbol bodies:

- `packages/agent/src/harness/agent-harness.ts`
  - `AgentHarness`
  - `AgentHarness/createTurnState`
  - `AgentHarness/createLoopConfig`
  - `AgentHarness/flushPendingSessionWrites`
  - `AgentHarness/prompt`
- `packages/agent/src/harness/types.ts`
  - `AgentHarnessPhase`
  - `SavePointEvent`
  - `ExecutionEnv`
  - `FileSystem`
  - `Shell`
  - session tree and resource types
- `packages/agent/src/agent-loop.ts`
  - `runAgentLoop`
  - `runLoop`
  - `executeToolCalls`
  - sequential/parallel tool dispatch
- `packages/agent/src/types.ts`
  - `AgentTool`
  - `AgentToolResult`
  - tool hook and event contracts
- `packages/agent/src/harness/env/nodejs.ts`
  - `NodeExecutionEnv`
  - file and shell abstraction implementation
- `packages/agent/src/harness/session/session.ts`
  - `Session`
  - `buildSessionContext`
- `packages/agent/src/harness/skills.ts`
  - skill frontmatter and loading diagnostics
- `packages/ai/src/api-registry.ts`
  - provider registration and lookup
- `packages/ai/src/env-api-keys.ts`
  - environment API key resolution
- `packages/coding-agent/src/core/agent-session.ts`
  - `AgentSession`
  - extension binding, prompt, steering, follow-up, compaction, runtime rebuild
- `packages/coding-agent/src/core/agent-session-runtime.ts`
  - `AgentSessionRuntime`
  - session host lifecycle
- `packages/coding-agent/src/core/session-manager.ts`
  - append-only session entries, parent/leaf tree, branch/fork operations
- `packages/coding-agent/src/core/resource-loader.ts`
  - `DefaultResourceLoader`
  - skills, prompts, themes, extensions, AGENTS files
- `packages/coding-agent/src/core/sdk.ts`
  - `createAgentSession`
  - SDK-facing session creation
- `packages/coding-agent/src/core/event-bus.ts`
  - small event bus controller
- `packages/coding-agent/src/core/model-registry.ts`
  - provider/model registry and request auth resolution
- `packages/coding-agent/src/core/extensions/types.ts`
  - extension API, event, tool, provider, UI, and command contracts
- `packages/coding-agent/src/core/tools/index.ts`
  - coding tool definition assembly
- `packages/coding-agent/src/core/tools/tool-definition-wrapper.ts`
  - conversion from tool definitions to agent tools
- `packages/coding-agent/src/modes/rpc/rpc-mode.ts`
  - RPC host separation

## Current Project Areas Inspected

Current project files inspected with Serena symbol overviews or targeted search:

- `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts`
  - current runtime owner of `runMvpIntegratedFlow`
  - `MvpIntegratedFlowOptions`
  - `runMvpIntegratedFlow`
  - `executeWorkflowTaskPlan`
  - `streamMvpIntegratedFlow`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
  - thin compatibility re-export surface observed through shell read
- `packages/ts-shell/src/runtime/execution/executionService.ts`
  - `ExecutionService`
  - authority modes, operation kinds, local vs rust-daemon execution path
- `packages/ts-shell/src/core/tools/registry.ts`
  - `createCoreToolRegistry`
  - ExecutionService use for read, write, and command tools
- `packages/ts-shell/src/session/SessionManager.ts`
  - `SessionManager`
  - session persistence, replay, recovery, continuity, approval memory
- `packages/ts-shell/src/core/query/resultMapper.ts`
  - `mapTerminalToOrchestrationResult`
  - result truthfulness handoff
- `packages/ts-shell/src/core/shell/sessionRuntime.ts`
  - `ShellSessionRuntime`
  - query event consumption, persistence projection, terminal surface
- `packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts`
  - `runCliProcess`
  - CLI host bootstrap
- `packages/ts-shell/src/turn/turnFacade.ts`
  - `runProductTurn`
  - product turn facade and handoff projection
- `packages/ts-shell/src/turn/roleDraftStage.ts`
  - role draft stage and provider adapter hook
- `packages/ts-shell/src/provider/providerDraftStage.ts`
  - provider draft stage
- `packages/ts-shell/src/planning/planningRuntimeStage.ts`
  - planning runtime stage
- `packages/ts-shell/src/proposal/anchoredProposalStage.ts`
  - anchored proposal stage
- `packages/ts-shell/src/edit/workflowMutationRuntime.ts`
  - workflow mutation runtime and aggregate result shape
- `packages/ts-shell/src/verification/verificationStage.ts`
  - workflow verification stage
- `packages/ts-shell/src/evidence/turnEvidenceLedger.ts`
  - turn evidence ledger hook
- `packages/ts-shell/src/context/readRuntimeStage.ts`
  - read runtime stage
- `packages/ts-shell/src/result/terminal/queryTerminalTruth.ts`
  - terminal truth derivation
- `packages/ts-shell/src/runtime/integratedFlowEnvironment.ts`
  - runtime environment composition
- `packages/ts-shell/src/core/query/events.ts`
  - `QueryEvent` event surface
- `packages/ts-shell/src/cli/runtime/cliRuntimeInvocationBridge.ts`
  - CLI runtime prompt streaming bridge

## Key Pi Findings

- Pi has a distinct `AgentHarness` above the low-level agent loop. The harness
  owns runtime configuration, resources, session persistence, queued messages,
  phase gating, and pending session writes.
- Pi freezes per-turn state in `createTurnState`. The turn state includes
  session messages, resources, stream options, session id, system prompt, model,
  thinking level, all tools, and active tools.
- Pi refreshes mutable runtime configuration only at a save point. In
  `createLoopConfig`, `prepareNextTurn` flushes pending session writes, creates
  the next turn state, and returns the new context/model/thinking level.
- Pi models structural lifecycle with `AgentHarnessPhase`, including idle, turn,
  compaction, branch summary, and retry phases.
- Pi separates low-level agent loop mechanics from harness concerns. The loop
  handles streaming, tool calls, tool result messages, steering, follow-up, and
  next-turn preparation.
- Pi's tool contract separates model-facing `content` from structured `details`
  and supports before/after tool hooks plus sequential or parallel execution.
- Pi's session model is an append-only tree with ids, parent ids, active leaf,
  branch/fork operations, compaction entries, and session context reconstruction.
- Pi has an explicit `ExecutionEnv` abstraction with `FileSystem` and `Shell`
  interfaces, implemented by `NodeExecutionEnv`.
- Pi separates provider registry/auth resolution in the AI/model layers from
  coding-agent host behavior.
- Pi keeps CLI, RPC/SDK, TUI, and extension/resource loading outside the low-level
  agent core.

## Key Local Findings

- The old product `runMvpIntegratedFlow.ts` path is now a thin compatibility
  re-export. The real flow is in `runtime/workflowExecutionCoordinator.ts`.
- `ExecutionService` is the current side-effect boundary and already records
  authority mode, authority source, caller, operation kind, and execution path.
- Tool execution already goes through `ExecutionService` in
  `core/tools/registry.ts`.
- `SessionManager` is a stateful substrate with many extracted facades, but the
  current session model is not a Pi-style tree with active leaf and parent id
  navigation as the primary abstraction.
- Result truthfulness is centralized through `resultMapper` and
  `queryTerminalTruth`.
- The project has a `turn` owner area, but it currently contains a product turn
  facade and role draft stage rather than a frozen turn snapshot/save point
  runtime.
- Resource/extension loading is deliberately absent or blocked in current product
  surfaces. Search results show explicit "no dynamic MCP/skills discovery" and
  "no automatic memory/startup injection" language in context/sidebar surfaces.
- Provider behavior remains opt-in and must not be default-enabled.

## What Was Not Inspected

- Pi implementation files outside the focused architecture areas, including most
  UI components, provider implementation internals, generated model files, image
  support, release tooling, and broad tests.
- Current project reference repositories other than `/home/wang/projects/pi`.
- Real provider configuration or private runtime homes.
- Full test suites or builds. This route is docs-only and only requires diff
  validation.

## Confidence

Confidence: medium-high.

The planning is grounded in direct Serena symbol inspection of both repos plus
the uploaded Pi summary. Confidence is not high because no live runtime
experiments, tests, or builds were run, and the route intentionally avoids
implementation.
