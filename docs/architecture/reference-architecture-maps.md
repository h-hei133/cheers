# Reference Architecture Maps

Route: `docs/agent-routes/route131-module-atlas.md`

This document reconstructs each reference project in its own terms before translating lessons into this project's module system. It is evidence-informed by targeted scans of the reference repository structures and representative boundary files. It is not a file-by-file log and does not imply code should be copied.

## Executive Summary

The references do not converge on one folder structure. They converge on a few stronger boundaries:

- A durable loop or processor owns turn progression, not every capability detail.
- Tools expose typed input, execution context, result metadata, and permission hooks.
- Runtime execution is separated from agent decision logic when the project is mature enough.
- Session, transcript, compact, and replay are first-class in coding-agent products.
- Browser projects separate observe/act/extract, target evidence, and browser lifecycle.
- Eval projects treat task, solver, scorer, log, event, and report as separate products.
- Smaller agents can deliberately collapse boundaries, but only when their scope is also small.

For this project, the useful pattern is not "make folders look like references." The useful pattern is to make capability lifecycle ownership explicit: availability, policy, planning, execution, observation, evidence, result mapping, transcript, continue/replay, eval, report, cleanup, and redaction.

## ClaudeCode

Evidence sampled:

- `/home/wang/projects/source-claudecode/query.ts`
- `/home/wang/projects/source-claudecode/services/tools/toolOrchestration.ts`
- `/home/wang/projects/source-claudecode/services/tools/StreamingToolExecutor.ts`
- `/home/wang/projects/source-claudecode/services/compact/compact.ts`
- `/home/wang/projects/source-claudecode/services/compact/autoCompact.ts`
- `/home/wang/projects/source-claudecode/services/SessionMemory/sessionMemory.ts`
- `/home/wang/projects/source-claudecode/commands.ts`
- `/home/wang/projects/source-claudecode/tools/FileEditTool/FileEditTool.ts`
- `/home/wang/projects/source-claudecode/tools/FileEditTool/UI.tsx`
- `/home/wang/projects/source-claudecode/tools/FileEditTool/utils.ts`
- `/home/wang/projects/source-claudecode/tools/PowerShellTool/PowerShellTool.tsx`
- `/home/wang/projects/source-claudecode/utils/sessionRestore.ts`

### Native Module Map

- Query loop: `query.ts` is the turn engine and imports token budget, compaction, command lifecycle, API normalization, tool orchestration, streaming, session storage, and message transitions.
- Tool system: `Tool`, `services/tools`, and per-tool folders define tool schemas, UI, permission, execution, and result summaries.
- Compact/context: `services/compact/*` owns compact prompt construction, auto compact, microcompact, session-memory compact, and post-compact cleanup.
- Session/memory: `services/SessionMemory/*`, `utils/sessionRestore.ts`, transcript/session storage utilities.
- CLI/commands: `commands.ts`, command lifecycle utilities, queue manager.
- File edit: `tools/FileEditTool/*` is a concentrated but coherent edit product: input/output schema, UI, permission, read-first checks, diagnostics, diff, write, and summaries.

### Organizing Principle

ClaudeCode organizes around a product turn loop with rich tool products. Some central files are large, but tool and compact semantics have named services and per-tool packages.

### First-Class Concepts

- Query transition and continuation.
- Tool execution orchestration.
- Tool-specific UI/result surface.
- Context compaction and memory attachments.
- File edit read-first/stale handling.
- Permission and filesystem policy.

### Embedded Concepts

- Provider/model details, tool summaries, and context budget decisions are still pulled into the query loop.
- Some user-visible result rendering remains near tool definitions.

### Strong Boundaries

- Per-tool schema/UI/execution boundaries are strong enough to reason about file edit, shell, MCP, and web tools separately.
- Compact is a service family rather than ad hoc query-loop text.
- File edit has explicit permission, stale/read, diagnostic, and diff surfaces.

### Weak Coupling / Ad-Hoc Areas

- `query.ts` is necessarily broad and couples many lifecycle concerns.
- Feature flags and optional modules make static ownership harder.

### Lessons for This Project

Adopt:

- Tool products should own typed contracts, execution metadata, and user-facing result summaries.
- Compact/continue should remain a first-class lifecycle family.
- File mutation should keep read-first/stale/readability and permission semantics explicit.

Adapt:

- Keep the target project's safer bounded mutation lanes instead of copying ClaudeCode's broader edit capability.
- Convert large-loop responsibilities into capability projections before extracting full subsystems.

Reject:

- Do not copy the central query-loop size as an acceptable endpoint.
- Do not merge terminal rendering into tool execution when a result-surface projection can own it.

## opencode

Evidence sampled:

- `/home/wang/projects/opencode/packages/opencode/src/session/processor.ts`
- `/home/wang/projects/opencode/packages/opencode/src/session/session.ts`
- `/home/wang/projects/opencode/packages/opencode/src/session/compaction.ts`
- `/home/wang/projects/opencode/packages/opencode/src/tool/tool.ts`
- `/home/wang/projects/opencode/packages/opencode/src/permission/index.ts`
- `/home/wang/projects/opencode/packages/opencode/src/patch/index.ts`
- `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`
- `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`
- `/home/wang/projects/opencode/packages/opencode/src/provider/provider.ts`
- `/home/wang/projects/opencode/packages/opencode/src/acp/agent.ts`

### Native Module Map

- Session processor: `session/processor.ts` is a service depending on session, config, bus, snapshot, agent, LLM, permission, plugin, summary, and status services.
- Tool contract: `tool/tool.ts` defines typed tool definitions, execution context, metadata, attachments, and permission ask.
- Permission: `permission/index.ts` defines request/reply, allow/deny/ask rules, bus events, and typed rejected/denied/corrected errors.
- Patch: `patch/index.ts` parses add/delete/update/move patch structures and separates parse, apply, and affected path concepts.
- Snapshot/revert: snapshot tracking and session revert are explicit capabilities.
- Provider/config/plugin: provider and config are service modules, not hidden inside the loop.

### Organizing Principle

opencode is service-oriented. The session processor composes services through Effect layers, while tools, permission, patch, snapshot, and provider have explicit contracts.

### First-Class Concepts

- Session processor.
- Tool definition and execution context.
- Permission request/reply lifecycle.
- Patch parser/apply model.
- Snapshot/revert.
- Provider and plugin services.
- Bus events.

### Embedded Concepts

- Some runtime execution and UI projection details live in product-specific service consumers.
- The patch model is broad and powerful, so safety relies on surrounding permission/snapshot layers.

### Strong Boundaries

- Permission ask/reply is separate from tool execution result.
- Tool result metadata and attachments are typed.
- Snapshot before LLM/tool execution creates a rollback/revert story absent from this project.

### Weak Coupling / Ad-Hoc Areas

- The service graph is powerful but heavy.
- Broad patch capability requires stronger atomicity/revert discipline than this project currently has.

### Lessons for This Project

Adopt:

- Permission request/reply, tool completed/error, and session status should remain separable events.
- Snapshot/revert should become an explicit future module before broad mutation support.
- Patch parsing and patch application should not be hidden in the loop.

Adapt:

- Use a smaller contract-first subset rather than Effect-style full service layering.
- Continue bounded mutation route projections before adopting broad patch semantics.

Reject:

- Do not open broad add/delete/move/multi-file patch just because opencode supports it.
- Do not make snapshot/revert implicit; it must be explicit or unsupported.

## OpenHands

Evidence sampled:

- `/home/wang/projects/OpenHands/openhands/app_server/app_conversation/README.md`
- `/home/wang/projects/OpenHands/openhands/app_server/app_conversation/*`
- `/home/wang/projects/OpenHands/openhands/app_server/event/README.md`
- `/home/wang/projects/OpenHands/openhands/app_server/event/*`
- `/home/wang/projects/OpenHands/openhands/app_server/config_api/*`
- `/home/wang/projects/OpenHands/openhands/app_server/file_store/memory.py`
- `/home/wang/projects/OpenHands/openhands/app_server/mcp/*`
- `/home/wang/projects/OpenHands/openhands/app_server/status/*`

### Native Module Map

This checkout is app-server centric. It exposes:

- Conversation management: app conversations, lifecycle, routers, SQL-backed variants, live status.
- Event management: storage, querying, pagination, streaming, multiple backends.
- Config/model API: LLM profile/config surfaces.
- File store: memory-backed file store.
- MCP/server integration and status surfaces.

### Organizing Principle

OpenHands models a coding agent as a conversation service backed by event streams and sandboxed runtime lifecycle. In this checkout, the server-facing modules are first-class.

### First-Class Concepts

- Conversation lifecycle.
- Event store/stream.
- Status.
- Config/LLM profiles.
- Server routers and service interfaces.

### Embedded Concepts

- The agent controller/runtime internals were not present in this checkout path at the same depth as the app-server modules, so the reconstructed map is server-surface heavy.
- Browser/action details appear as integrations rather than the sampled native center.

### Strong Boundaries

- Conversation CRUD/status is separated from event storage and streaming.
- Event storage has abstract service and backend implementations.

### Weak Coupling / Ad-Hoc Areas

- The available checkout makes server and product surfaces more visible than low-level agent loop internals.
- Integration-heavy products can blur agent runtime, app server, and external services.

### Lessons for This Project

Adopt:

- Treat session/conversation and event transcript as durable products, not incidental logs.
- Keep event storage/streaming distinct from capability execution.

Adapt:

- The target project should keep a lighter local-first session layer, but use event-store thinking for transcript and replay.

Reject:

- Do not make HTTP/server conversation topology the default architecture for a CLI-first product.

## Stagehand

Evidence sampled:

- `/home/wang/projects/stagehand/packages/core/lib/v3/handlers/actHandler.ts`
- `/home/wang/projects/stagehand/packages/core/lib/v3/handlers/observeHandler.ts`
- `/home/wang/projects/stagehand/packages/core/lib/v3/handlers/extractHandler.ts`
- `/home/wang/projects/stagehand/packages/core/lib/v3/llm/LLMClient.ts`
- `/home/wang/projects/stagehand/packages/core/lib/v3/agent/AgentClient.ts`
- `/home/wang/projects/stagehand/packages/core/lib/v3/agent/tools/*`
- `/home/wang/projects/stagehand/packages/core/lib/v3/cache/*`
- `/home/wang/projects/stagehand/packages/core/lib/v3/understudy/*`
- `/home/wang/projects/stagehand/packages/core/lib/v3/types/public/*`
- `/home/wang/projects/stagehand/packages/evals/*`

### Native Module Map

- Browser methods: observe, act, extract handlers.
- Understudy/browser abstraction: page/context wrappers, accessibility snapshots.
- LLM clients/providers: OpenAI, Anthropic, Google, Cerebras, Groq, AI SDK.
- Agent clients/tools: CUA agent providers and browser tools such as click, type, extract, screenshot, aria tree, scroll, goto.
- Cache: action and agent caches.
- Public/private type contracts.
- Eval package: browser-focused evaluation framework and tasks.

### Organizing Principle

Stagehand is browser-first. Observe/act/extract are product primitives and the LLM is a planner over browser snapshots and action targets.

### First-Class Concepts

- Observe.
- Act.
- Extract.
- Browser snapshot.
- Action target confidence/normalization.
- LLM client/provider.
- Browser-specific cache.
- Browser eval.

### Embedded Concepts

- General agent loop is embedded in browser-agent clients and tools rather than a coding-agent loop.
- Permission and session/continue are not the center of the product.

### Strong Boundaries

- Observe/act/extract handlers are clear browser capability modules.
- Public/private type separation helps keep SDK surface from internal mechanics.
- Browser evidence is tied to snapshot/action/result concepts.

### Weak Coupling / Ad-Hoc Areas

- Browser handler constructors accept many knobs and can accumulate orchestration concerns.
- Browser repair/self-heal behavior can become tightly coupled to snapshot internals.

### Lessons for This Project

Adopt:

- Browser Engineering should own observe/act/extract, snapshot evidence, repair, cache, and browser-specific eval.

Adapt:

- Keep browser as one capability under the coding-agent lifecycle, not the whole architecture.
- Reuse the observe/act/extract separation for browser transaction docs and future module ownership.

Reject:

- Do not move general tool permission/session semantics into browser-specific modules.

## Playwright MCP

Evidence sampled:

- `/home/wang/projects/playwright-mcp/README.md`
- `/home/wang/projects/playwright-mcp/index.js`
- `/home/wang/projects/playwright-mcp/src/README.md`
- `/home/wang/projects/playwright-mcp/tests/*.spec.ts`

### Native Module Map

- MCP server packaging around Playwright.
- Browser automation exposed as MCP tools.
- Accessibility snapshots rather than screenshots as the primary LLM-facing evidence.
- Persistent browser context/lifecycle is valuable for MCP workflows.
- This package points to the Playwright monorepo for the actual source implementation.

### Organizing Principle

The native product is a protocol adapter: expose Playwright browser operations through MCP with structured accessibility evidence.

### First-Class Concepts

- MCP server.
- Browser tool schema.
- Accessibility snapshot.
- Browser lifecycle.
- Tool result contract.

### Embedded Concepts

- Agent loop, session, provider, and permission are external to the server.
- Coding-agent CLI workflows are explicitly called out as better served by CLI/skills in some cases.

### Strong Boundaries

- MCP backend boundary is clear: the server provides tools; the client owns the agent loop.
- Snapshot-based evidence is optimized for LLM consumption.

### Weak Coupling / Ad-Hoc Areas

- The standalone checkout is a package wrapper; deeper source is upstream in the Playwright monorepo.
- MCP schemas can be token-heavy for code agents.

### Lessons for This Project

Adopt:

- Browser tool results should include structured evidence and lifecycle state.
- MCP integration should be an adapter boundary, not the internal browser architecture.

Adapt:

- Prefer local deterministic browser harnesses for release gates; keep external MCP as separate readiness.

Reject:

- Do not claim external MCP readiness from local fixtures.
- Do not force every browser workflow through MCP.

## Inspect AI

Evidence sampled:

- `/home/wang/projects/inspect_ai/src/inspect_ai/_eval/eval.py`
- `/home/wang/projects/inspect_ai/src/inspect_ai/solver/_solver.py`
- `/home/wang/projects/inspect_ai/src/inspect_ai/scorer/_scorer.py`
- `/home/wang/projects/inspect_ai/src/inspect_ai/event/_event.py`
- `/home/wang/projects/inspect_ai/src/inspect_ai/log/*`
- `/home/wang/projects/inspect_ai/src/inspect_ai/model/*`
- `/home/wang/projects/inspect_ai/src/inspect_ai/tool/*`
- `/home/wang/projects/inspect_ai/src/inspect_ai/approval/*`
- `/home/wang/projects/inspect_ai/src/inspect_ai/dataset/*`
- `/home/wang/projects/inspect_ai/src/inspect_ai/_view/*`

### Native Module Map

- Eval runner: resolves tasks, model roles, solver, scanner, sandbox, approval, logs, display, concurrency, and checkpoint configuration.
- Solver: transforms `TaskState` and controls whether generation resolves tool calls in loop/single/none mode.
- Scorer: evaluates `TaskState` against targets and produces scores/metrics.
- Event transcript: typed union of sample, sandbox, state, store, model, tool, approval, branch, compaction, score, error, span, step, and subtask events.
- Model/tool/approval/dataset/log/view modules are separate product surfaces.

### Organizing Principle

Inspect AI is eval-first. It treats execution as reproducible task runs with explicit dataset, solver, model, tool, event, scorer, log, and report boundaries.

### First-Class Concepts

- Task/dataset.
- Solver.
- Model.
- Tool.
- Approval.
- Event.
- Scorer/metric.
- Log/report/view.
- Sandbox/checkpoint.

### Embedded Concepts

- Agent loop is solver/generate behavior, not a standalone coding-agent product.
- UX is mostly eval CLI/viewer rather than interactive coding session.

### Strong Boundaries

- Scorer is independent from solver.
- Events are typed transcript records.
- Logs and viewer are downstream from run events.
- Approval is explicit and pluggable.

### Weak Coupling / Ad-Hoc Areas

- The eval runner necessarily composes many knobs.
- Agent-like behavior is secondary to eval semantics.

### Lessons for This Project

Adopt:

- Harness/Eval should own task, scenario, scorer, report, and transcript evidence separately.
- Capability gates should emit typed evidence that can be scored without re-running product logic.

Adapt:

- Use a lighter capability contract rather than full Inspect eval framework inside runtime.

Reject:

- Do not turn user-facing CLI runtime into an eval runner.

## mini-swe-agent

Evidence sampled:

- `/home/wang/projects/mini-swe-agent/src/minisweagent/agents/default.py`
- `/home/wang/projects/mini-swe-agent/src/minisweagent/environments/local.py`
- `/home/wang/projects/mini-swe-agent/src/minisweagent/environments/docker.py`
- `/home/wang/projects/mini-swe-agent/src/minisweagent/models/*`
- `/home/wang/projects/mini-swe-agent/src/minisweagent/config/*`
- `/home/wang/projects/mini-swe-agent/src/minisweagent/run/mini.py`
- `/home/wang/projects/mini-swe-agent/src/minisweagent/run/benchmarks/*`

### Native Module Map

- Agent: `DefaultAgent` owns messages, step loop, model query, action execution, limits, serialization, and trajectory saving.
- Environment: local/docker/singularity execution returns output/returncode/exception info.
- Model: provider wrappers and action formatting/parsing.
- Config: YAML-driven composition of agent/model/environment.
- Run: CLI entrypoints and benchmark runners.

### Organizing Principle

mini-swe-agent intentionally collapses the loop into a small educational/runtime core: model + environment + agent + config + trajectory.

### First-Class Concepts

- Agent step loop.
- Environment command execution.
- Model action parsing/formatting.
- YAML config.
- Trajectory output.

### Embedded Concepts

- Permission, rich session/continue, result surface, and patch safety are intentionally minimal or absent.
- Eval is run/benchmark scripts rather than a broad harness platform.

### Strong Boundaries

- Model and environment are cleanly separated.
- Trajectory serialization is simple and reproducible.

### Weak Coupling / Ad-Hoc Areas

- The default agent owns many lifecycle stages because the product scope is small.
- Direct local shell execution is not a sufficient safety model for this project.

### Lessons for This Project

Adopt:

- Keep a minimal conceptual loop visible even as modules grow.
- Preserve simple trajectory/evidence outputs for debugging.

Adapt:

- Use mini-swe-agent as a baseline for loop clarity, not as a permission/session architecture.

Reject:

- Do not collapse policy, execution, transcript, and result into one default agent class for this larger product.

## gemini-cli

Evidence sampled:

- `/home/wang/projects/gemini-cli/packages/cli/src/config/*`
- `/home/wang/projects/gemini-cli/packages/cli/src/commands/*`
- `/home/wang/projects/gemini-cli/packages/cli/src/services/prompt-processors/*`
- `/home/wang/projects/gemini-cli/packages/cli/src/ui/*`
- `/home/wang/projects/gemini-cli/packages/cli/src/utils/sessions.ts`
- `/home/wang/projects/gemini-cli/packages/cli/src/ui/hooks/useSessionResume.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/core/*`
- `/home/wang/projects/gemini-cli/packages/core/src/tools/*`
- `/home/wang/projects/gemini-cli/packages/core/src/mcp/*`
- `/home/wang/projects/gemini-cli/packages/core/src/services/memoryService.ts`
- `/home/wang/projects/gemini-cli/packages/core/src/safety/*`

### Native Module Map

- CLI package: config, auth, command registry, prompt processors, UI hooks/components, session utilities.
- Core package: core client/turn behavior, tools, MCP auth/provider/token storage, memory service, safety context.
- Extensions/skills: CLI-managed extension and skill surfaces.
- Browser agent tooling appears as core agent/browser MCP wrappers.

### Organizing Principle

gemini-cli has an explicit CLI/core split. CLI owns user interaction, config, commands, and UI. Core owns model/tool/MCP/memory/safety behavior.

### First-Class Concepts

- CLI config/policy.
- Prompt processors.
- Commands.
- Core tools.
- MCP auth and token storage.
- Memory service.
- Safety.
- Session resume utilities.

### Embedded Concepts

- Some session and UI behavior remains coupled through hooks.
- Provider/model concerns are framed around Gemini-first client behavior.

### Strong Boundaries

- Package split between CLI and core is a strong layering cue.
- Prompt processors make `@file` and shell injection handling explicit.
- MCP auth/token storage is a distinct concern.

### Weak Coupling / Ad-Hoc Areas

- CLI UX and session state can still couple through UI hooks.
- Gemini-first assumptions may not translate to multi-provider private agent architecture.

### Lessons for This Project

Adopt:

- Keep entrypoint parsing, prompt transport, commands, and runtime core separated.
- Treat prompt processors as a capability boundary, not incidental CLI string handling.

Adapt:

- Maintain multi-provider readiness taxonomy rather than Gemini-specific provider assumptions.

Reject:

- Do not bury provider readiness or session replay under UI hooks.

## Cross-Project Architecture Patterns

| Pattern | Seen in | Lesson |
|---|---|---|
| Turn loop composes services but should not own every policy | ClaudeCode, opencode, mini-swe-agent | Keep one visible loop, extract policy/result/session/tool projections. |
| Tools are products with schema, execution context, metadata, and result surface | ClaudeCode, opencode, gemini-cli, Inspect AI | Tool Engineering needs typed lifecycle ownership. |
| Permission ask/reply must be separate from execution failure | opencode, ClaudeCode, Inspect AI | Approval provenance must not collapse into success/error booleans. |
| Session transcript/event store is a product surface | ClaudeCode, opencode, OpenHands, Inspect AI | Continue/replay/compact needs durable event semantics. |
| Browser capabilities are observe/act/extract plus snapshot/evidence | Stagehand, Playwright MCP, gemini-cli browser tools | Browser Engineering should be capability-specific but contract-aligned. |
| Eval separates task/solver/scorer/log/report | Inspect AI, Stagehand evals, mini-swe-agent benchmarks | Harness and Eval modules should not be runtime side effects. |
| Snapshot/revert enables broad mutation confidence | opencode | Do not broaden patch without snapshot/revert or explicit no-rollback claim. |
| Small agents can collapse modules only when scope is small | mini-swe-agent | This project has outgrown single-loop ownership. |

## Patterns to Adopt

- Event/transcript semantics for session and result continuity.
- Typed tool context and result metadata.
- Explicit permission request/reply/result provenance.
- Browser observe/act/extract and snapshot evidence.
- Eval task/scorer/report separation.
- Capability-specific evidence that can be consumed by result surface and gates.

## Patterns to Adapt

- ClaudeCode compact/session behavior should be adapted into focused session/continue modules rather than copied into the loop.
- opencode patch/snapshot should be adapted only after bounded mutation contracts remain green.
- Stagehand browser primitives should be adapted as a browser capability under this agent's lifecycle.
- Inspect AI eval semantics should be adapted into deterministic gates without making runtime an eval framework.
- gemini-cli CLI/core split should inform entrypoint cleanup, but this repo must preserve TS control-plane/Rust execution-plane contracts.

## Patterns to Reject

- Broad patch writes without rollback/atomicity policy.
- External MCP readiness claims from local fixtures.
- Server-first conversation architecture as the default for CLI-first runtime.
- Browser-specific concepts owning general session, permission, or provider semantics.
- Test/gate scripts becoming the only place where product readiness is defined.

## Lessons for This Project

The next-stage architecture should define modules as responsibility owners:

- Agent Loop Engineering owns turn progression and capability selection.
- Capability modules own lifecycle contracts and evidence.
- Tool Engineering owns execution contracts and provenance.
- Permission / Policy Engineering owns asks, denials, allowlists, and trust boundaries.
- Session / Continue Engineering owns transcript, replay, compact, and handoff.
- Result Surface Engineering owns terminal/session truthfulness.
- Harness and Eval own reproducible verification, not product behavior.

The main risk is not missing folders. The main risk is cross-layer concentration where loop, policy, execution, result mapping, transcript, and gates accumulate in the same files.
