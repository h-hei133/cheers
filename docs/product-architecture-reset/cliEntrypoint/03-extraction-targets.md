# Extraction Targets

These targets are grouped into implementation routes. They are intended to be
aggressive enough to reduce `cli.tsx` meaningfully, but bounded enough to
preserve current CLI behavior.

## Route 1: Bootstrap Context and Fatal Boundary

Source regions:

- Lines 93-125: trace/logger/argv/cwd, parse/version/doctor, root/config setup.
- Lines 135-183: service construction, recovery candidates, bootstrap call,
  bootstrap error rendering, runtime context, MCP gateway creation.
- Lines 202-240: startup plan/surface and session initialized log.

Destination files:

- `packages/ts-shell/src/cli/bootstrap/cliBootstrapContext.ts`
- `packages/ts-shell/src/cli/bootstrap/cliStartupSurface.ts`
- `packages/ts-shell/src/cli/errors/cliBootstrapErrorBoundary.ts`

Compatibility strategy:

- Keep `entrypoints/cli.tsx` as the executable shim.
- Export a bootstrap result object containing `runtimeContext`,
  `sessionManager`, `renderer`, `logger`, `recoveryCandidate`,
  `recoveryCandidateSummary`, `recoveryBlockedNotice`,
  `lifecycleNotices`, `approvalTrustPolicy`, and initial `mcpGateway`.
- Preserve exact parse error/version/doctor output and process exit behavior.
- Preserve root-binding diagnostics wording and exit code.

Tests:

- `packages/ts-shell/src/entrypoints/cliArgs.test.ts`
- `packages/ts-shell/src/entrypoints/cliDoctor.test.ts`
- `packages/ts-shell/src/entrypoints/cliCoreSplit.test.ts`
- `packages/ts-shell/src/cli-baseline.test.ts` focused cases for version,
  doctor, startup, root binding, and damaged current session pointer.
- `npm run verify:product:cli-entry` if package scripts expose it; otherwise
  `node scripts/verify-cli-entry.mjs`.

Stop conditions:

- Do not change runtime config defaults.
- Do not change session root migration behavior.
- Do not change startup output strings.
- Do not introduce a new provider credential read path.

## Route 2: Runtime Invocation Factory and Provider/Approval Bridge

Source regions:

- Lines 127-133: provider credential snapshot closure.
- Lines 245-324: `ShellSessionRuntime` construction, approval prompt bridge,
  audit payload mapping, `streamOrchestratedResponse`, apply_patch runtime
  opt-in, planning mutation options, provider-smoke env check.

Destination files:

- `packages/ts-shell/src/cli/runtime/cliSessionRuntimeFactory.ts`
- `packages/ts-shell/src/cli/provider/cliProviderRuntimeBridge.ts`
- `packages/ts-shell/src/cli/approval/cliApprovalAuditBridge.ts`
- `packages/ts-shell/src/cli/runtime/cliRuntimeInvocationBridge.ts`

Compatibility strategy:

- Keep current `cliRuntimeModule.ts` public exports until callers migrate.
- Factory accepts process/env adapters instead of reading private config.
- Preserve `activeNonInteractiveApprovalMode` mutation through an explicit
  state object.
- Preserve `ApprovalAuditMemoryState` payload keys and input key filtering.
- Preserve apply_patch no-write/write opt-in distinctions and planning mutation
  controlled workspace behavior.

Tests:

- `packages/ts-shell/src/entrypoints/cliRuntimeInvocation.test.ts`
- `packages/ts-shell/src/entrypoints/cliPlanningMutationExecution.test.ts`
- `packages/ts-shell/src/entrypoints/cliModuleBoundary.test.ts`
- `packages/ts-shell/src/entrypoints/approvalPromptBridge.test.ts`
- Relevant `cli-baseline.test.ts` approval, provider readiness, apply_patch,
  and stopped/continue cases.
- `npm run verify:result-contract` if result truth/output changes.
- Route221 anti-false-success gate only if touched result truth surfaces
  move across this route.

Stop conditions:

- Do not enable live provider by default.
- Do not weaken redaction or expose API keys/base auth material.
- Do not convert denied, stopped, interrupted, not-run, partial, or
  not-proven states into success.
- Do not combine with output wording changes.

## Route 3: Print, Replay, and Stdin Mode Runner Consolidation

Source regions:

- Lines 185-201: stdin transport, `readStdinToEnd`, non-interactive prompts,
  mode plan.
- Lines 326-416: replay, stdin stream, print, and stdin batch branches.
- Lines 733-744: `readStdinToEnd`.

Destination files:

- `packages/ts-shell/src/cli/print/stdinPromptCapture.ts`
- `packages/ts-shell/src/cli/print/printModeRouter.ts`
- `packages/ts-shell/src/cli/print/replayModeRunner.ts`
- Existing compatibility files may re-export from the new owners:
  `entrypoints/cliPrintModeRunner.ts` and `entrypoints/cliStdinModeRunner.ts`.

Compatibility strategy:

- Keep current `cliModeDispatch.ts` behavior unchanged.
- Keep missing prompt error and exit behavior from `runCliPrintMode`.
- Preserve stdin stream vs captured batch distinction.
- Preserve replay precedence over print/stdin.

Tests:

- `packages/ts-shell/src/entrypoints/cliModeDispatch.test.ts`
- `packages/ts-shell/src/entrypoints/cliPrintModeRunner.test.ts`
- `packages/ts-shell/src/entrypoints/cliStdinModeRunner.test.ts`
- `cli-baseline.test.ts` print, stdin, replay, and parity cases.
- `scripts/verify-cli-entry.mjs`.

Stop conditions:

- Do not change prompt materialization ordering.
- Do not change empty stdin semantics.
- Do not change print vs stdin result surfaces.

## Route 4: Interactive Loop and Command Router

Source regions:

- Lines 418-439: readline creation and prompt refresh.
- Lines 451-686: interactive line handler.
- Lines 688-730: close, keypress, double-Esc cancellation, initial prompt.
- Lines 746-753: projected line rendering if still needed.

Destination files:

- `packages/ts-shell/src/cli/interactive/interactiveLoop.ts`
- `packages/ts-shell/src/cli/interactive/interactiveCommandRouter.ts`
- `packages/ts-shell/src/cli/interactive/interactivePromptRunner.ts`
- `packages/ts-shell/src/cli/interactive/interactiveCancellation.ts`
- `packages/ts-shell/src/cli/output/projectedLineRenderer.ts`

Compatibility strategy:

- Keep `cli.tsx` registering process-level startup and calling
  `runInteractiveLoop`.
- Move slash-action routing into a router that returns prompt lifecycle actions
  such as `prompt`, `resume`, `switch-session`, and `execute`.
- Preserve `interactiveTurnNumber`, in-flight guard, prompt refresh after
  session/workspace/agent-mode changes, and interrupted-error suppression.
- Preserve exact user-visible strings for in-flight rejection, cancel-run,
  double-Esc notices, and generic error rendering.

Tests:

- New focused `cli/interactive/interactiveLoop.test.ts` or equivalent.
- Existing `cliInteractiveLoopState.test.ts`.
- `cliCommandExecutionBridge.test.ts`.
- `cli-baseline.test.ts` interactive startup, EOF, sessions current, stopped
  follow-up, Ctrl+C, and approval cases.

Stop conditions:

- Do not change readline prompt shape.
- Do not change cancellation timing.
- Do not change slash command grammar.
- Do not change session continuity or `/continue` fallback behavior.

## Route 5: Session, Workspace, MCP, Help, and Mode Command Routing

Source regions:

- Lines 469-646: workspace info, resume, cancel, sessions, workspace, MCP,
  help, view, agent mode, and permission command branches.

Destination files:

- `packages/ts-shell/src/cli/commands/cliCommandRouter.ts`
- `packages/ts-shell/src/cli/session/cliResumeCommand.ts`
- `packages/ts-shell/src/cli/session/cliSessionCommands.ts`
- `packages/ts-shell/src/cli/workspace/cliWorkspaceCommands.ts`
- `packages/ts-shell/src/mcp/cliMcpCommandRouter.ts`
- `packages/ts-shell/src/cli/commands/cliShellModeCommands.ts`
- `packages/ts-shell/src/cli/approval/cliPermissionCommands.ts`

Compatibility strategy:

- Keep existing `entrypoints/cliSessionModule.ts`,
  `entrypoints/cliWorkspaceModule.ts`, and `entrypoints/cliMcpModule.ts` as
  compatibility facades until imports migrate.
- Router should consume `slashResult` and runtime services; it must not parse
  argv or execute provider turns.
- Preserve MCP gateway refresh after session/workspace switches.

Tests:

- `cliSessionModule` tests through existing baseline and any new focused tests.
- `cliWorkspaceSurface.test.ts` and `cliModuleBoundary.test.ts`.
- `cliMcpModule.test.ts` and `mcpControlCliSurface.test.ts`.
- `cli-baseline.test.ts` sessions, workspace, MCP, and mode command cases.

Stop conditions:

- Do not change session switch root-binding diagnostics.
- Do not change workspace attach root selection.
- Do not hide MCP unavailable-server blockers.
- Do not move session persistence into CLI command owners.

## Route 6: Entrypoint Shim Cleanup

Source regions:

- Remaining top-level imports and any now-unused local adapters after Routes
  1-5.

Destination files:

- `packages/ts-shell/src/entrypoints/cli.tsx` remains the executable shim.
- `packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts` may own the
  composed run if import fan-in remains high.

Compatibility strategy:

- Keep package bin/start/dev path unchanged unless a narrow compatibility alias
  is explicitly added.
- No route-history move, no package script behavior change, no CLI behavior
  change.

Tests:

- `scripts/verify-cli-entry.mjs`.
- `packages/ts-shell/src/cli-baseline.test.ts` focused CLI entry parity cases.
- Build if TS source changed.
- Import boundary scan to ensure product runtime does not import entrypoint
  implementation details.

Stop conditions:

- Do not rename the public executable path in the same route as behavior
  extraction.
- Do not delete compatibility facades still referenced by tests, scripts, or
  package metadata.
