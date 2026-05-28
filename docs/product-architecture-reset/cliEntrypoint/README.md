# CLI Entrypoint Audit

Status: COMPLETE for this audit route. Runtime code, source files, tests,
package scripts, live-provider behavior, and CLI behavior were not changed.

This audit covers `packages/ts-shell/src/entrypoints/cli.tsx` as the Phase 3
CLI entrypoint ownership check. Current code is the authority; earlier
architecture docs were used only as context.

Final verdict: `cli.tsx` is a valid executable compatibility entrypoint plus a
partial CLI monolith. It legitimately owns the shebang, process argv handoff,
top-level mode selection, executable fatal boundary, module construction, and
current package entry compatibility. It also still directly owns too much
interactive loop control, slash-action routing, approval audit adaptation,
provider credential refresh wiring, print/stdin/replay mode handoff details,
MCP gateway refresh timing, and bootstrap/recovery/startup composition.

The file should remain the executable shim for `agents`, `npm start`, and
`tsx src/entrypoints/cli.tsx`, but future routes should move named
responsibilities into owner modules under `cli/bootstrap`, `cli/interactive`,
`cli/commands`, `cli/print`, `cli/provider`, `cli/approval`, `cli/errors`,
`cli/session`, `cli/workspace`, `mcp`, `shell`, and `runtime`. Do not replace
these with helper, utils, misc, common, support, cliUtils, or
entrypointHelpers modules.

Artifacts:

- `00-current-map.md`: file size, imports, executable paths, regions, tests,
  and consumers.
- `01-ownership-audit.md`: classification of every major symbol and
  high-density region.
- `02-stay-vs-move.md`: stay, move, split, and deprecate matrix.
- `03-extraction-targets.md`: concrete extraction targets grouped by future
  implementation route.
- `04-risk-register.md`: CLI behavior, provider, approval, session, MCP,
  output, truthfulness, and import-cycle risks.
- `05-validation-plan.md`: future implementation route validation gates.
- `06-next-implementation-routes.md`: recommended grouped implementation
  sequence.

Evidence used:

- `cli.tsx`: 758 lines, 22.9K.
- Required adjacent modules were inspected: `cliRuntimeModule.ts`,
  `cliSessionModule.ts`, `cliWorkspaceModule.ts`, `cliDoctor.ts`,
  `cliMcpModule.ts`, `sessionRuntime.ts`, `sessionTerminalState.ts`,
  `SessionManager.ts`, `workflowExecutionCoordinator.ts`, and
  `turnFacade.ts`.
- Adjacent tests and gates were identified, including `cli-baseline.test.ts`,
  focused `entrypoints/*` tests, and `scripts/verify-cli-entry.mjs`.
- Serena was used for symbol overview and ownership clustering. Serena
  onboarding attempted to create/read project memory but failed because
  `.serena/memories/memory_maintenance.md` was missing; no Serena memory was
  written.

Implementation recommendation: it is safe to start implementation with a
compatibility-preserving interactive command router plus bootstrap context
extraction. Do not combine provider default behavior, approval policy,
result-truth surfaces, or output string changes in that first route.
