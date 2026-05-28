# Current Map

## File Facts

| Item | Current evidence |
| --- | --- |
| Audited file | `packages/ts-shell/src/entrypoints/cli.tsx` |
| Size | 758 lines, 22.9K |
| Public exports | None |
| Executable boundary | Shebang at line 1 and `main().catch(...)` at lines 755-758 |
| Package entry consumers | `packages/ts-shell/package.json` bin `agents`, `start`, and `dev` point at this entry path or its built output |
| Direct product import direction | CLI imports runtime, shell, session, renderer, workflow git context, and CLI modules; no product runtime imports `cli.tsx` |

## Import Map

| Lines | Imports | Ownership signal |
| --- | --- | --- |
| 2-3 | `process`, `readline` | Valid executable and interactive transport ownership, but readline lifecycle is still deep in the entrypoint. |
| 4-24 | runtime config, shell bootstrap, continue runtime, startup renderer, provider credentials, stdin prompt input | Bootstrap and mode handoff are valid; provider and startup projection should be owned by CLI/provider and CLI/bootstrap surfaces. |
| 25-33 | `ShellSessionRuntime`, shell-action predicates, signal handlers | Runtime construction is wiring; interactive shell action handling is still too detailed. |
| 34-45 | daemon probe, observability, renderer, `SessionManager`, git context | Composition root can construct these, but recovery/session probing before bootstrap is more than thin wiring. |
| 46-91 | CLI modules: args, command bridge, doctor, display, prompt chrome, mode dispatch, planning mutation, print/stdin, MCP, approval, runtime, permission, session, workspace, startup, slash registry | Evidence that prior extraction exists. Remaining issue is that `cli.tsx` still coordinates these modules at branch-by-branch detail. |

## Executable Flow

| Lines | Region | Current behavior |
| --- | --- | --- |
| 93-110 | `main()` initial process setup | Creates trace context/logger, reads argv/cwd, creates approval trust policy, parses args, handles parse errors and version. |
| 112-125 | workspace and doctor setup | Resolves project root, git root, runtime config, and doctor shortcut. |
| 127-133 | credential snapshot closure | Captures `runtimeContext` later, refreshes runtime config, applies CLI provider/api-key overrides. |
| 135-180 | session manager, renderer, recovery, bootstrap | Constructs session/runtime owners, queries recovery candidates and blocked notices, bootstraps shell runtime, handles bootstrap fatal diagnostics. |
| 181-240 | runtime context, MCP gateway, stdin/mode/startup surface | Creates MCP gateway, resolves stdin transport, reads captured stdin, materializes non-interactive prompts, projects mode/startup facts, renders startup surface, logs session initialization. |
| 242-324 | `ShellSessionRuntime` construction and `runPrompt` closure | Creates runtime facade and embeds provider refresh, approval escalation bridge, approval audit payload shaping, apply_patch runtime opt-in projection, planning mutation options, and stream invocation. |
| 326-416 | replay, stdin stream, print, stdin batch branches | Top-level mode dispatch delegates to modules but still wires every runtime dependency and active approval setter. |
| 418-449 | readline creation and SIGINT | Creates interactive readline prompt, local prompt refresh closure, and SIGINT bridge. |
| 451-686 | interactive line handler | Owns blank-input guard, in-flight guard, workspace-info shortcut, command bridge call, resume bridge, slash-action routing, mode mutation, permission command, normal prompt execution, error rendering/logging, prompt/resume lifecycle. |
| 688-730 | close and keypress handling | Bridges close handler, configures keypress events, owns double-Esc cancellation timing and messages. |
| 733-744 | `readStdinToEnd` | Local process stdin collector for captured batch mode. |
| 746-753 | `renderProjectedLines` | Local rendering loop used for projected display lines. |
| 755-758 | fatal catch | Process-level fatal boundary. |

## Major Symbols

| Symbol | Lines | Role |
| --- | --- | --- |
| `main` | 93-731 | Executable composition root plus current partial monolith. |
| `resolveCredentialSnapshot` | 127-132 | Provider credential refresh closure embedded in `main`. |
| `refreshInteractivePromptChrome` | 428-439 | Interactive prompt projection updater embedded in `main`. |
| `rl.on("line")` callback | 453-686 | Interactive command and prompt dispatcher. |
| `process.stdin.on("keypress")` callback | 700-727 | Double-Esc cancellation behavior. |
| `readStdinToEnd` | 733-744 | Stdin capture adapter. |
| `renderProjectedLines` | 746-753 | Output projection adapter. |
| `main().catch` callback | 755-758 | Fatal boundary. |

## Adjacent Modules Already Present

| Module | Lines | Current responsibility |
| --- | ---: | --- |
| `cliArgs.ts` | 422 | Argument parsing policy and prompt derivation. |
| `cliModeDispatch.ts` | 31 | Mode plan selection. |
| `cliRuntimeModule.ts` | 545 | Replay, non-interactive prompt, stdin stream, resolved prompt execution, orchestrated response handoff. |
| `cliSessionModule.ts` | 360 | Session list/current/switch and runtime session context switching. |
| `cliWorkspaceModule.ts` | 275 | Workspace info prompt, target project root, workspace commands, project context attach. |
| `cliMcpModule.ts` | 69 | MCP command gateway and rendering. |
| `cliDoctor.ts` | 29 | Doctor output wrapper. |
| `cliApprovalModule.ts` | 561 | Approval bridge and mode materialization. |
| `cliPrintModeRunner.ts` | 23 | Print runner sequencing and missing-prompt error. |
| `cliStdinModeRunner.ts` | 37 | Stdin stream/batch runner. |

## Tests and Validation Surfaces

| Surface | Evidence |
| --- | --- |
| Whole CLI behavior | `packages/ts-shell/src/cli-baseline.test.ts` drives `entrypoints/cli.tsx` through `tsx`, pipes, stdin, print, interactive smoke, sessions, MCP, provider readiness, approval, apply_patch routes, and continuity. |
| CLI modules | `packages/ts-shell/src/entrypoints/cliArgs.test.ts`, `cliModeDispatch.test.ts`, `cliPrintModeRunner.test.ts`, `cliStdinModeRunner.test.ts`, `cliRuntimeInvocation.test.ts`, `cliCommandExecutionBridge.test.ts`, `cliModuleBoundary.test.ts`, `cliMcpModule.test.ts`, `cliDoctor.test.ts`, `cliWorkspaceSurface.test.ts`, `cliCoreSplit.test.ts`. |
| CLI entry gate | `scripts/verify-cli-entry.mjs` drives `src/entrypoints/cli.tsx` with synthetic home/provider mode and checks packaged entry existence, result markers, session migration, stdin, replay, and root behavior. |
| Package executable | `packages/ts-shell/package.json` points bin/dev/start at the current path. |

## Current Verdict

`cli.tsx` is not a thin executable entrypoint yet. It is also not the old
unacceptable 3K+ line CLI monolith because major domains already have owner
modules. The correct classification is partial CLI monolith with a valid
compatibility executable shim.
