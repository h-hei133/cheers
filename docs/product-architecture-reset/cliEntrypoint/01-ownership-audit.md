# Ownership Audit

Classification vocabulary:

- Valid CLI entrypoint ownership.
- Domain logic in wrong owner.
- Compatibility glue.
- Temporary adapter.
- Extraction candidate.
- Deprecated/legacy residue.

## Whole-File Classification

`cli.tsx` should remain the executable compatibility shim, but it should not
continue to own the detailed runtime, provider, approval, session, workspace,
MCP, print, and interactive command choreography. Current classification:
partial CLI monolith with valid executable ownership.

## Symbol and Region Audit

| Lines | Symbol/region | Current responsibility | Classification | Final owner domain | Action |
| --- | --- | --- | --- | --- | --- |
| 1 | Shebang | Node executable marker. | Valid CLI entrypoint ownership. | `entrypoints/cli.tsx` | Stay. |
| 2-91 | Import fan-in | Pulls process/readline, shell, runtime, session, provider, CLI modules, MCP, approval, display, workspace. | Compatibility glue plus extraction signal. | `entrypoints/cli.tsx` for top-level shim; owner modules for details. | Split later by extracting bootstrap/interactive modules until imports are mostly owner facades. |
| 93-100 | `main` initial trace/logger/argv/cwd/policy state | Process setup and local mutable state. | Valid CLI entrypoint ownership for trace/argv/cwd; extraction candidate for approval state. | `cli/bootstrap`, `cli/approval`. | Split approval state into approval runtime bridge. |
| 102-110 | Parse errors and version | Minimal argv handoff and version shortcut. | Valid CLI entrypoint ownership plus compatibility glue. | `cli/args`, `entrypoints/cli.tsx`. | Stay until a bootstrap runner owns process exits. |
| 112-120 | Runtime base, git root, config | Workspace root and runtime config selection. | Extraction candidate. | `cli/bootstrap/cliBootstrapContext.ts`, `cli/workspace`, `shell/bootstrap`. | Move root/config projection behind bootstrap context; preserve exact root migration behavior. |
| 122-125 | Doctor shortcut | Delegates doctor output. | Compatibility glue. | `cli/commands/cliCommandRouter.ts` or `cli/doctor`. | Move with command routing route if doctor branches consolidate. |
| 127-133 | `resolveCredentialSnapshot` | Provider credential refresh using runtime config and CLI overrides. | Extraction candidate; provider logic in wrong owner if it grows. | `cli/provider/cliProviderRuntimeBridge.ts` or `provider/credentialResolutionBridge.ts`. | Move as named provider bridge. |
| 135-150 | Session manager, renderer, recovery candidate and blocked notice | Constructs session/display owners and queries recovery state before bootstrap. | Extraction candidate. | `cli/bootstrap/cliStartupContext.ts`, `session/recovery`, `cli/session`. | Move startup recovery projection; keep construction wiring in entrypoint or bootstrap module. |
| 151-180 | Bootstrap IIFE and `SessionBootstrapError` handling | Calls shell bootstrap and renders fatal root diagnostics. | Valid bootstrap coordination plus extraction candidate for fatal formatting. | `cli/bootstrap/cliBootstrapRunner.ts`, `cli/errors/cliFatalBoundary.ts`. | Split bootstrap call from fatal rendering. |
| 181-183 | Runtime context and MCP gateway creation | Materializes runtime context and MCP gateway. | Compatibility glue; extraction candidate for gateway lifecycle. | `cli/bootstrap`, `mcp/cliMcpGatewayLifecycle.ts`. | Move gateway refresh policy with interactive route. |
| 185-201 | Stdin transport, piped input, non-interactive prompts, mode plan | Captures stdin and chooses CLI mode. | Valid mode dispatch handoff plus extraction candidate for process stdin adapter. | `cli/args`, `cli/print`, `cli/bootstrap`. | Keep high-level dispatch; move `readStdinToEnd` and prompt materialization into print/stdin bootstrap. |
| 202-235 | Startup plan and startup surface | Projects startup facts and renders startup surface. | Compatibility glue; output projection is already delegated but selection remains here. | `cli/bootstrap/cliStartupSurface.ts`, `cli/output`. | Move startup surface decision and projection call into bootstrap owner. |
| 237-240 | Session initialized log | Logs session id and bootstrap phases. | Valid CLI entrypoint ownership. | `entrypoints/cli.tsx` or `cli/bootstrap`. | Stay or move with bootstrap context route. |
| 242-244 | Readline and turn counters | Interactive runtime state. | Extraction candidate. | `cli/interactive/interactiveLoop.ts`. | Move with interactive loop route. |
| 245-324 | `ShellSessionRuntime` construction and `runPrompt` closure | Embeds provider refresh, approval prompt bridge, approval audit payload shaping, runtime stream invocation, apply_patch runtime opt-in, planning mutation options, provider smoke env check. | Extraction candidate; provider/approval/runtime policy too deep for entrypoint. | `cli/runtime/cliSessionRuntimeFactory.ts`, `cli/approval/cliApprovalBridge.ts`, `cli/provider/cliProviderRuntimeBridge.ts`, `runtime/cliRuntimeInvocationBridge.ts`. | Move as a runtime factory with narrow injected process/env adapters. |
| 250-284 | Approval escalation handler and audit payload mapping | Converts approval records to session audit memory payload. | Domain logic in wrong owner and extraction candidate. | `cli/approval/cliApprovalAuditBridge.ts`, `session/approval`. | Move; preserve `ApprovalAuditMemoryState` fields and redaction. |
| 285-322 | `streamOrchestratedResponse` call | Runtime invocation and mutation option construction. | Compatibility glue plus extraction candidate. | `cli/runtime/cliRuntimeInvocationBridge.ts`, `runtime`, `policy`. | Move together with current tests; do not alter success/stopped/error classification. |
| 326-343 | Replay branch | Delegates replay runner with dependency bundle. | Compatibility glue. | `cli/print/cliReplayModeRunner.ts` or `cli/runtime`. | Move branch wiring behind mode runner route. |
| 345-364 | Stdin stream branch | Delegates live stdin stream runner. | Compatibility glue. | `cli/print/cliStdinModeRunner.ts`. | Keep high-level mode switch or move into command router. |
| 366-389 | Print branch | Delegates print runner and non-interactive prompt runner. | Compatibility glue. | `cli/print/printModeRunner.ts`. | Move dependency bundling into print mode context. |
| 391-416 | Stdin batch branch | Delegates batch runner with render/run callbacks. | Compatibility glue plus temporary adapter. | `cli/print/stdinBatchModeRunner.ts`. | Move with print/stdin route. |
| 418-439 | Readline creation and prompt refresh | Creates readline and refreshes prompt chrome. | Extraction candidate. | `cli/interactive/interactiveLoop.ts`, `cli/interactive/promptChrome.ts`. | Move; preserve prompt text and project/session/agent mode updates. |
| 441-449 | SIGINT bridge | Connects process signal to shell handler. | Valid entrypoint signal wiring plus compatibility glue. | `entrypoints/cli.tsx`, `cli/interactive/interactiveSignals.ts`. | Entry may keep process signal registration; move context bundling later. |
| 451-467 | Interactive input guard | Blank input and in-flight turn rejection. | Extraction candidate. | `cli/interactive/interactiveLoop.ts`. | Move with interactive route; preserve strings. |
| 469-480 | Workspace-info prompt shortcut | Special read-only workspace info command before slash resolution. | Domain logic in wrong owner. | `cli/workspace/cliWorkspaceInfoCommand.ts` or `cli/commands`. | Move into command router. |
| 482-495 | Command execution bridge and shell-action extraction | Resolves local command or prompt execution. | Compatibility glue. | `cli/commands/cliCommandRouter.ts`. | Move routing loop; preserve `handled`, `shell-action`, and `execute` states. |
| 497-535 | Resume-like shell action | Runs resume bridge, updates turn number, refreshes MCP gateway and prompt. | Extraction candidate; session/continue logic in interactive loop. | `cli/session/cliResumeCommand.ts`, `cli/interactive/interactiveCommandRouter.ts`. | Move with session command route; preserve fallback recovery behavior. |
| 537-542 | Cancel run action | Cancels current runtime and renders cancellation text. | Extraction candidate. | `cli/interactive/interactiveCommandRouter.ts`. | Move with command router. |
| 544-560 | Session commands | Calls `runCliSessionCommand`, refreshes gateway/prompt after switch. | Compatibility glue plus extraction candidate. | `cli/session/cliSessionCommands.ts`, `cli/interactive`. | Move routing and refresh hooks out of entrypoint. |
| 562-577 | Workspace commands | Calls `runCliWorkspaceCommand`, refreshes gateway/prompt after project context switch. | Compatibility glue plus extraction candidate. | `cli/workspace/cliWorkspaceCommands.ts`, `cli/interactive`. | Move routing and refresh hooks out of entrypoint. |
| 579-588 | MCP commands | Calls `runCliMcpCommand`. | Compatibility glue. | `mcp/cliMcpCommandRouter.ts` or `cli/commands`. | Move into interactive command router. |
| 590-594 | Help command | Renders slash help. | Compatibility glue. | `cli/commands/cliHelpCommand.ts`. | Move with command router. |
| 596-633 | View and agent mode commands | Reads/writes runtime view/agent mode and output projections. | Extraction candidate; shell display mode policy should not live in entrypoint. | `shell/viewMode`, `cli/commands/cliModeCommands.ts`, `cli/output`. | Move and preserve prompt refresh on agent mode changes. |
| 636-646 | Permission command | Calls approval trust policy command. | Compatibility glue plus policy bridge. | `cli/approval/cliPermissionCommands.ts`, `policy/approval`. | Move with approval route; preserve trust policy state. |
| 648-679 | Normal prompt execution and error rendering | Increments turn number, executes resolved prompt, renders/logs non-interrupted errors. | Extraction candidate; interactive runtime internals. | `cli/interactive/interactivePromptRunner.ts`, `cli/errors`. | Move; preserve no false success and interrupted suppression. |
| 681-686 | Prompt/finally lifecycle | Prompts, clears in-flight flag, resumes readline. | Extraction candidate. | `cli/interactive/interactiveLoop.ts`. | Move with interactive route. |
| 688-696 | Readline close bridge | Calls shell close handler. | Valid signal/transport wiring plus extraction candidate. | `cli/interactive/interactiveSignals.ts`. | Move context bundling later. |
| 698-727 | Keypress/double-Esc cancellation | Owns cancellation timing, state, and strings. | Extraction candidate. | `cli/interactive/interactiveCancellation.ts`. | Move; preserve 3-second double-Esc behavior and messages. |
| 730 | Initial prompt | Starts interactive prompt. | Valid interactive runner responsibility, not final entrypoint responsibility. | `cli/interactive/interactiveLoop.ts`. | Move with loop. |
| 733-744 | `readStdinToEnd` | Process stdin capture and fallback empty string on error. | Temporary adapter and extraction candidate. | `cli/print/stdinPromptCapture.ts`. | Move; preserve null/empty behavior. |
| 746-753 | `renderProjectedLines` | Renders projected output lines. | Temporary adapter and extraction candidate. | `cli/output/projectedLineRenderer.ts`. | Move or reuse module-local renderer in output owner. |
| 755-758 | `main().catch` | Fatal process error boundary. | Valid CLI entrypoint ownership. | `entrypoints/cli.tsx`, later `cli/errors/cliFatalErrorBoundary.ts`. | Stay until fatal boundary extraction is explicit. |

## Deprecated or Legacy Residue

No clearly dead runtime code was proven in this audit. The local adapters
`readStdinToEnd` and `renderProjectedLines` are not deprecated; they are
temporary ownership residue because current owner modules do not yet expose
the process stdin/output adapter seams. The `0.1.0 (ts-shell MVP)` version
string is compatibility surface, not removable residue.
