# Validation Plan

This audit route itself requires only document existence, `git diff --check`,
and `git status --short --branch`. No build or tests are required because
runtime code is not changed.

Future implementation routes should use the following focused gates.

## Route 1: Bootstrap Context and Fatal Boundary

Required:

- `npm test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts src/entrypoints/cliDoctor.test.ts src/entrypoints/cliCoreSplit.test.ts`
- Focused `packages/ts-shell/src/cli-baseline.test.ts` cases for:
  `supports --version flag`, doctor if covered by baseline, root binding
  diagnostics, damaged current session pointer, startup smoke.
- `node scripts/verify-cli-entry.mjs` or the package script alias if present.
- `npm run build -w packages/ts-shell`
- `git diff --check`

Also run:

- Import scan ensuring product runtime does not import `entrypoints/cli.tsx`.

## Route 2: Runtime Invocation Factory and Provider/Approval Bridge

Required:

- `npm test -w packages/ts-shell -- src/entrypoints/cliRuntimeInvocation.test.ts src/entrypoints/cliPlanningMutationExecution.test.ts src/entrypoints/cliModuleBoundary.test.ts src/entrypoints/approvalPromptBridge.test.ts`
- Focused `cli-baseline.test.ts` cases for provider readiness, approval deny,
  approval allow, apply_patch no-write route, apply_patch workspace write
  opt-in, stopped/continue behavior.
- `npm run verify:result-contract` if terminal/result output surfaces are
  touched.
- Route221 anti-false-success gate only if result truth or evidence projection
  surfaces are touched.
- `npm run build -w packages/ts-shell`
- `git diff --check`

Do not run live provider for this extraction unless a future route explicitly
opens that gate.

## Route 3: Print, Replay, and Stdin Mode Runner Consolidation

Required:

- `npm test -w packages/ts-shell -- src/entrypoints/cliModeDispatch.test.ts src/entrypoints/cliPrintModeRunner.test.ts src/entrypoints/cliStdinModeRunner.test.ts`
- Focused `cli-baseline.test.ts` cases for print, stdin, replay, print/stdin/
  interactive parity, missing prompt, and synthetic read-only print.
- `node scripts/verify-cli-entry.mjs`
- `npm run build -w packages/ts-shell`
- `git diff --check`

## Route 4: Interactive Loop and Command Router

Required:

- New focused tests for `cli/interactive/interactiveLoop.ts`,
  `interactiveCommandRouter.ts`, and `interactiveCancellation.ts`.
- `npm test -w packages/ts-shell -- src/entrypoints/cliInteractiveLoopState.test.ts src/entrypoints/cliCommandExecutionBridge.test.ts`
- Focused `cli-baseline.test.ts` cases for interactive startup, interactive
  sessions current, EOF, Ctrl+C, stopped follow-up smoke, in-flight/cancel if
  covered, and approval prompts.
- `npm run build -w packages/ts-shell`
- `git diff --check`

## Route 5: Session, Workspace, MCP, Help, and Mode Command Routing

Required:

- `npm test -w packages/ts-shell -- src/entrypoints/cliModuleBoundary.test.ts src/entrypoints/cliWorkspaceSurface.test.ts src/entrypoints/cliMcpModule.test.ts src/entrypoints/mcpControlCliSurface.test.ts src/entrypoints/slashCommandRegistry.test.ts`
- Focused `cli-baseline.test.ts` cases for sessions current/switch/last,
  workspace current/attach, MCP status/tools/refresh/doctor, provider readiness
  slash command surface, view mode, agent mode, and permission command surface.
- Session tests if root binding or recovery selection logic moves.
- `npm run build -w packages/ts-shell`
- `git diff --check`

## Route 6: Entrypoint Shim Cleanup

Required:

- `node scripts/verify-cli-entry.mjs`
- Focused `cli-baseline.test.ts` CLI entry parity cases.
- `npm run build -w packages/ts-shell`
- Import scan:
  `rg -n "entrypoints/cli\\.(js|tsx)|from \\\".*entrypoints/cli" packages/ts-shell/src scripts package.json packages/ts-shell/package.json`
- `git diff --check`
- `git status --short --branch`

## Trigger-Based Additions

| If touched | Add validation |
| --- | --- |
| CLI flags or prompt derivation | `cliArgs.test.ts`, mode dispatch tests, CLI entry gate. |
| Runtime invocation or result rendering | `cliRuntimeInvocation.test.ts`, `verify:result-contract`, focused baseline result surface cases. |
| Provider readiness/defaults | Provider readiness tests and redaction checks; no live provider unless explicitly requested. |
| Approval policy | Approval module tests, permission module tests, focused baseline approval persistence cases. |
| Session commands or recovery | Session manager/session module focused tests and `/continue` baseline cases. |
| Workspace commands/root selection | Workspace module/surface tests and root-binding baseline cases. |
| MCP control surface | MCP module/surface tests and MCP baseline cases. |
| Interactive loop transport | Pipe-spawn interactive baseline cases, Ctrl+C, EOF, stopped follow-up. |
| Output strings | Snapshot-like exact string tests or focused baseline cases that assert current strings. |
