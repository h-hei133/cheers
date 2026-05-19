# Reference Module Matrix

Route: `docs/agent-routes/route131-module-atlas.md`

This matrix compares responsibility boundaries across the reference projects and maps them to the proposed modules in this project. Reference names are native where possible; they are not forced into this project's folder structure.

## Responsibility Matrix

| Responsibility | ClaudeCode | opencode | OpenHands | Stagehand | Playwright MCP | Inspect AI | mini-swe-agent | gemini-cli | Proposed project module |
|---|---|---|---|---|---|---|---|---|---|
| Turn progression | `query.ts` | `session/processor.ts` | conversation lifecycle services | browser agent/client handlers | external client owns loop | solver/generate inside eval | `DefaultAgent.run/step` | core turn/client + CLI | Agent Loop Engineering |
| Tool definition | `Tool`, per-tool dirs | `tool/tool.ts` | server/service actions | browser agent tools | MCP tool schemas | `tool/*` | model action format + env execute | core tools | Tool Engineering |
| Runtime execution | shell/powershell tools, services | pty, snapshot, session processor | sandbox/conversation services | browser page/context runtime | Playwright backend | sandbox utilities | local/docker environments | core tools/sandbox config | Runtime Engineering |
| Context assembly | attachments/context utilities | session prompt/context | conversation/event context | browser snapshot/context | accessibility snapshot | task state/model messages | templates + env/model vars | prompt processors/memory | Context Engineering |
| Memory | SessionMemory, compact | session summary/compaction | file store/conversation memory | cache, browser context | persistent browser context | store/state events | trajectory file | memory service | Memory Engineering |
| Harness | testing utilities and profiler surfaces | tests/service fixtures | app-server tests | eval package | tests/specs | eval runner infra | benchmark runners | integration tests | Harness Engineering |
| Eval / benchmark | less central | less central | task trajectory/integrations | `packages/evals` | capability specs | task/solver/scorer/log | SWE-bench runners | evals/perf tests | Eval / Benchmark Engineering |
| Permission / policy | filesystem/tool permissions | `permission/index.ts` | server auth/config policy | browser action constraints | MCP client/server boundary | approval policies | yolo/confirmation minimal | policy/safety | Permission / Policy Engineering |
| Result surface | tool UI, terminal output | message parts/projectors/acp | event/status APIs | method results/logs | MCP results | log/view/report | trajectory/final output | CLI UI/components | Result Surface Engineering |
| Session / continue | session restore/compact | session, compaction, retry, revert | conversations/events | not primary | external to server | logs/checkpoints | trajectory output | session resume utilities | Session / Continue Engineering |
| Provider/model | model utilities/API | provider service/auth | LLM profile APIs | LLM clients/providers | none | model module | model wrappers | Gemini/core model | Provider / Model Engineering |
| CLI / UX | commands/Ink UI | app/console/acp/commands | app server/frontend | CLI package | MCP server CLI | CLI/view | Typer CLI | CLI package/UI | CLI / UX Engineering |
| Workspace/file context | FileRead/FileEdit, cwd utils | file/protected/ripgrep | file store/git services | browser DOM/page context | page context | dataset/files/sandbox | environment cwd | `@file` processors | Workspace / File Context Engineering |
| Edit / patch | FileEditTool | patch/snapshot/revert | action/observation integrations | browser act only | browser actions only | tools/sandbox not patch product | shell command edits | tools/file shell support | Edit / Patch Engineering |
| Browser | web/browser tools | optional/browser via tools | browser/action integrations | core product | core product adapter | browser examples | not primary | browser MCP wrapper | Browser Engineering |
| Capability contract | implicit in query/tool UI | services + typed schemas | event/conversation APIs | method contracts | MCP schemas | task/event/log/scorer | trajectory schema | core/CLI contracts | Capability Contract Architecture |

## Adopt / Adapt / Reject Matrix

| Responsibility | Reference Pattern | Decision | Why |
|---|---|---|---|
| Tool execution context | opencode `tool/tool.ts` passes session/message/agent/abort/messages/metadata/ask | Adopt | This keeps tool execution, permission asking, and result metadata explicit. |
| Per-tool UI/result | ClaudeCode FileEditTool UI and summaries | Adapt | Useful for user surface, but this project should project into generic result/session contracts. |
| Broad patch parser | opencode `patch/index.ts` | Adapt later | Strong parser model, but unsafe without snapshot/revert and current bounded write policy. |
| Snapshot/revert | opencode snapshot and session revert | Adopt later | Required before broad mutation claims. Not needed for docs-only Route 131. |
| Event transcript union | Inspect AI event union | Adopt concept | A typed event vocabulary would strengthen session/continue and eval. |
| Eval task/solver/scorer split | Inspect AI | Adapt | Use for gates and scenario reports, not for the interactive runtime itself. |
| Browser observe/act/extract | Stagehand | Adopt for Browser Engineering | Matches browser capability lifecycle and current browser modules. |
| MCP browser adapter | Playwright MCP | Adapt | Treat as external adapter; do not make it internal browser ownership. |
| Conversation service architecture | OpenHands | Adapt lightly | Good event/conversation separation, but target product remains CLI-first. |
| Minimal agent loop | mini-swe-agent | Adopt as clarity standard | Keep loop understandable; do not copy minimal safety model. |
| CLI/core split | gemini-cli | Adopt direction | Entry points should be thin; core should own runtime semantics. |
| Direct local shell execution | mini-swe-agent | Reject as default | Too weak for permission/sandbox claims. |
| Feature-flagged central query growth | ClaudeCode | Reject as endpoint | Acceptable reference reality, not the target modular goal. |
| Browser-specific session ownership | Stagehand | Reject | General session/continue must not live inside Browser Engineering. |
| Default external MCP readiness from local fixture | Playwright MCP/local tests | Reject | External MCP readiness needs its own config/server evidence. |

## Project Translation

The references imply these translation rules:

- If a concept has independent availability/policy/execution/evidence, make it a capability module.
- If a concept only formats user output from already-classified results, keep it in Result Surface Engineering.
- If a concept persists or replays state, keep it in Session / Continue Engineering.
- If a concept scores or validates behavior, keep it in Harness or Eval.
- If a concept touches secrets, providers, external servers, or workspace writes, its policy must be explicit and testable.

## Module Coverage Checklist

| Proposed Project Module | Reference Pressure | Current Project Pressure |
|---|---|---|
| Agent Loop Engineering | ClaudeCode query, opencode processor, mini-swe-agent loop | `runMvpIntegratedFlow.ts` still owns too much. |
| Tool Engineering | ClaudeCode tools, opencode tools, gemini core tools | registry, lifecycle projection, MCP bridge, browser tools. |
| Runtime Engineering | opencode pty/snapshot, OpenHands sandbox, mini environments | Rust daemon/local command/browser runtime. |
| Context Engineering | ClaudeCode attachments/compact, gemini prompt processors | browser context, project memory injection, future-turn context. |
| Memory Engineering | ClaudeCode SessionMemory, gemini memory, Inspect state/store | project memory stores and compact checkpoints. |
| Harness Engineering | Inspect runner, Stagehand evals, mini benchmarks | many scenario runners and verification scripts. |
| Eval / Benchmark Engineering | Inspect scorer/log, Stagehand eval package | browser eval gate, release deterministic gate. |
| Permission / Policy Engineering | opencode permission, ClaudeCode filesystem permissions | approval bridge, workspace authority, browser/MCP policy. |
| Result Surface Engineering | ClaudeCode UI, opencode projectors, Inspect logs | resultMapper/sessionRuntime/sessionStateSurface. |
| Session / Continue Engineering | opencode session/compaction/revert, OpenHands conversation/event | SessionManager, compact/replay/continuity. |
| Provider / Model Engineering | opencode provider, gemini core, Stagehand LLM clients | provider readiness, model adapters. |
| CLI / UX Engineering | gemini CLI, ClaudeCode commands, opencode app/console | cli.tsx and command runtimes. |
| Workspace / File Context Engineering | opencode file/protected, ClaudeCode file read/edit | workspace authority, target resolution, file constraints. |
| Edit / Patch Engineering | opencode patch, ClaudeCode FileEditTool | patch lanes, bounded writes, no-partial apply. |
| Browser Engineering | Stagehand, Playwright MCP, gemini browser tools | browser transaction/action/cache/runtime/eval files. |
| Capability Contract Architecture | Inspect events/logs, opencode schemas, MCP schemas | currently implicit and route-by-route. |
