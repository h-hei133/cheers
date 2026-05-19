# CLI Boundary Map

Route: `docs/agent-routes/route136-control-plane-atlas.md`

Owner file:

- `packages/ts-shell/src/entrypoints/cli.tsx`

Current size:

- about 2.9k lines at Route 136 start

## Boundary Map

| Area | Current owner | Existing helper boundary | Future direction |
|---|---|---|---|
| argument parsing | `parseCliArgs` via `cliArgs.ts` | yes | keep out of entrypoint |
| command routing | main mode branches and slash command handling | partial: `cliModeDispatch.ts`, `slashCommandRegistry.ts`, `core/commands/*` | route through a CLI core facade |
| interactive shell | readline loop, prompt execution, turn boundaries | partial: `ShellSessionRuntime`, signal handlers | keep entrypoint as wiring only |
| print/stdin/replay mode | mode dispatch and prompt runners | yes: print/stdin runners; replay still local | move replay command runner later |
| slash command bridge | command map, session/permissions/connect/MCP branches | partial | keep runtime semantics in `core/commands` |
| session selection | bootstrap, recovery candidate, switch helpers | partial: shell bootstrap/runtime context | extract switch diagnostics/display |
| result rendering | startup surface, session surfaces, turn result fallback | partial | keep renderers outside entrypoint |
| compatibility behavior | version, doctor, target project resolution, stdin transport | mixed | preserve exactly while extracting helpers |
| approval bridge | non-interactive and interactive prompt handler wiring | partial: `approvalPromptBridge.ts` | keep CLI-specific rendering here, policy elsewhere |
| provider snapshot | credential resolution closure for runtime invocation | partial: `cliRuntimeInvocation.ts` | do not move auth into orchestration |

## Current Strengths

- parser, mode dispatch, print/stdin runners, provider readiness surface, MCP
  control surface, slash registry, and workspace surface already exist.
- approval bridge has a named CLI-specific module.
- `ShellSessionRuntime` owns most prompt execution state after startup.

## Remaining Coupling

1. The entrypoint still owns session switch details, permissions list/explain
   rendering, workspace-info prompt detection, replay file execution, and
   provider snapshot closure wiring.
2. Runtime context updates and session switching are close to rendering code.
3. Approval-mode materialization and ambiguity handling are in the entrypoint,
   even though the data comes from session continuity.

## Capability Lifecycle Coverage

CLI owns user-visible entry stages:

- startup availability display
- session/project selection
- command routing
- approval prompt UX
- output mode selection
- compatibility behavior

CLI should not own:

- result truthfulness
- write authorization
- provider auth core
- browser/edit capability behavior
- session schema or replay semantics

## Safe Extraction Candidates

1. permissions list/explain display helper
2. session switch diagnostics helper
3. replay prompt script runner
4. workspace-info prompt detector
5. approval mode materialization projector

## Unsafe Areas

- changing slash command UX
- changing default print/stdin/replay behavior
- changing provider credential lookup or default provider mode
- changing approval semantics while moving display helpers
- redesigning CLI/core split in one route
