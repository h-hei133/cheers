# Stay vs Move

| Symbol/region | Stay? | Move? | Split? | Delete/deprecate later? | Final destination | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| Shebang and executable invocation | Yes | No | No | No | `entrypoints/cli.tsx` | Package bin/start/dev compatibility requires a stable executable shim. |
| `main().catch` fatal process boundary | Yes | Later | Yes | No | `entrypoints/cli.tsx`, later `cli/errors/cliFatalErrorBoundary.ts` | Process exit handling is valid entrypoint ownership, but fatal formatting can be named. |
| `process.argv.slice(2)` and `process.cwd()` handoff | Yes | No | No | No | `entrypoints/cli.tsx` | Minimal process handoff is legitimate. |
| Parse error and version handling | Yes | Later | No | No | `cli/args/cliArgsParser.ts`, `cli/bootstrap/cliProcessRunner.ts` | Current parser owns policy; entrypoint can keep compatibility exit behavior until runner extraction. |
| Workspace root, git root, runtime config setup | No | Yes | Yes | No | `cli/bootstrap/cliBootstrapContext.ts`, `cli/workspace/cliWorkspaceRoot.ts` | Root/config setup is product bootstrap policy, not executable boilerplate. |
| Doctor shortcut | No | Yes | No | No | `cli/commands/cliCommandRouter.ts`, `cli/doctor/cliDoctorCommand.ts` | It is a command branch, not executable bootstrap. |
| Provider credential snapshot closure | No | Yes | Yes | No | `cli/provider/cliProviderRuntimeBridge.ts` | Provider override and runtime config refresh should be named provider bridge behavior. |
| Session manager and renderer construction | Partial | Later | Yes | No | `cli/bootstrap/cliRuntimeServices.ts` | Entry may compose services, but service bundle construction should be testable without process startup. |
| Recovery candidate and blocked notice lookup | No | Yes | Yes | No | `cli/session/cliRecoveryStartup.ts`, `session/recovery` | Recovery projection is session startup behavior. |
| Bootstrap call | Partial | Later | Yes | No | `cli/bootstrap/cliBootstrapRunner.ts` | Entry can call one bootstrap runner, not own error branches and diagnostics. |
| Bootstrap error rendering | No | Yes | No | No | `cli/errors/cliBootstrapErrorBoundary.ts` | Fatal display surface should be testable and stable. |
| MCP gateway creation | No | Yes | Yes | No | `mcp/cliMcpGatewayLifecycle.ts` | Gateway refresh is coupled to session/workspace switches, not process start alone. |
| Stdin transport and prompt materialization | Partial | Yes | Yes | No | `cli/print/stdinPromptCapture.ts`, `cli/args/cliPromptInput.ts` | High-level mode dispatch can stay; process stdin details should move. |
| Startup plan and surface rendering | No | Yes | Yes | No | `cli/bootstrap/cliStartupSurface.ts`, `cli/output/cliStartupRenderer.ts` | Startup output selection and rendering are output/bootstrap concerns. |
| `ShellSessionRuntime` construction | No | Yes | Yes | No | `cli/runtime/cliSessionRuntimeFactory.ts` | It embeds provider, approval, apply_patch, planning mutation, and runtime invocation bridges. |
| Approval audit payload mapping | No | Yes | No | No | `cli/approval/cliApprovalAuditBridge.ts`, `session/approval` | Audit shape is safety-sensitive and should not be inline closure logic. |
| Apply-patch runtime opt-in projection | No | Yes | No | No | `cli/runtime/cliRuntimeInvocationBridge.ts`, `policy/applyPatch` | Write/no-write state projection must remain explicit and testable. |
| Planning mutation execution options | No | Yes | No | No | `cli/runtime/cliPlanningMutationBridge.ts` | Provider-smoke env and workspace-controlled inputs are route policy, not entrypoint logic. |
| Replay mode branch | Partial | Yes | No | No | `cli/print/cliReplayModeRunner.ts` | Entry should dispatch mode, not bundle every dependency. |
| Stdin stream branch | Partial | Yes | No | No | `cli/print/cliStdinModeRunner.ts` | Runner exists; entrypoint still owns dependency bundle. |
| Print branch | Partial | Yes | No | No | `cli/print/printModeRunner.ts` | Runner exists; prompt runtime bundle should move. |
| Stdin batch branch | Partial | Yes | No | No | `cli/print/stdinBatchModeRunner.ts` | Runner exists; render/run adapters should move. |
| Readline creation | No | Yes | No | No | `cli/interactive/interactiveLoop.ts` | Transport lifecycle is large enough to own separately. |
| Prompt chrome refresh | No | Yes | No | No | `cli/interactive/promptChrome.ts` | Prompt rendering is already pure; refresh timing belongs to interactive loop owner. |
| SIGINT registration | Partial | Later | Yes | No | `entrypoints/cli.tsx`, `cli/interactive/interactiveSignals.ts` | Process signal registration may stay, context assembly should move. |
| Interactive line handler | No | Yes | Yes | No | `cli/interactive/interactiveLoop.ts`, `cli/commands/interactiveCommandRouter.ts` | This is the largest remaining monolith region. |
| Workspace info shortcut | No | Yes | No | No | `cli/workspace/cliWorkspaceInfoCommand.ts` | It is command behavior, not loop plumbing. |
| Resume-like action branch | No | Yes | Yes | No | `cli/session/cliResumeCommand.ts`, `cli/interactive/interactiveCommandRouter.ts` | Resume/session continuity behavior should be isolated. |
| Session command branch | No | Yes | No | No | `cli/session/cliSessionCommands.ts` | Existing module owns command; entrypoint should not route it manually. |
| Workspace command branch | No | Yes | No | No | `cli/workspace/cliWorkspaceCommands.ts` | Existing module owns command; entrypoint should not route it manually. |
| MCP command branch | No | Yes | No | No | `mcp/cliMcpCommandRouter.ts` | MCP command routing belongs with MCP CLI surface. |
| Help/view/agent mode branches | No | Yes | Yes | No | `cli/commands/cliShellModeCommands.ts`, `cli/output` | Output and shell mode mutation should be named and covered. |
| Permission command branch | No | Yes | No | No | `cli/approval/cliPermissionCommands.ts` | Approval policy bridge should not remain in entrypoint loop. |
| Normal prompt execution branch | No | Yes | Yes | No | `cli/interactive/interactivePromptRunner.ts`, `runtime` | Turn counting and interrupted-error behavior are interactive runtime concerns. |
| Readline close handler | Partial | Later | Yes | No | `cli/interactive/interactiveSignals.ts` | Process transport close handling can be encapsulated. |
| Double-Esc cancellation | No | Yes | No | No | `cli/interactive/interactiveCancellation.ts` | Timing-sensitive behavior needs focused tests. |
| `readStdinToEnd` | No | Yes | No | No | `cli/print/stdinPromptCapture.ts` | Process stdin adapter for print/stdin modes. |
| `renderProjectedLines` | No | Yes | No | No | `cli/output/projectedLineRenderer.ts` | Output projection adapter should not live in executable shim. |
