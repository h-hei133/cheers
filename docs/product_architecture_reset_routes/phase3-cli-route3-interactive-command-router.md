# Phase 3 CLI Route 3: Interactive Loop, Cancellation, And Command Router Extraction

## Purpose

Continue reducing:

packages/ts-shell/src/entrypoints/cli.tsx

Route 1 extracted bootstrap/startup and print/replay/stdin mode routing.
Route 2 extracted provider, approval, runtime invocation, and ShellSessionRuntime factory.

Route 3 combines the next tightly coupled interactive areas:

1. Interactive readline loop, prompt lifecycle, close/SIGINT/key handling, and double-Esc cancellation.
2. Interactive command router for workspace info, resume, cancel, session, workspace, MCP, help, view/agent mode, permission, and normal prompt execution.

This is implementation work.

This route must make cli.tsx closer to a thin executable shim while preserving interactive CLI behavior exactly.

## Required Reading

Read before editing:

- docs/product-architecture-reset/cliEntrypoint/README.md
- docs/product-architecture-reset/cliEntrypoint/00-current-map.md
- docs/product-architecture-reset/cliEntrypoint/01-ownership-audit.md
- docs/product-architecture-reset/cliEntrypoint/02-stay-vs-move.md
- docs/product-architecture-reset/cliEntrypoint/03-extraction-targets.md
- docs/product-architecture-reset/cliEntrypoint/04-risk-register.md
- docs/product-architecture-reset/cliEntrypoint/05-validation-plan.md
- docs/product-architecture-reset/cliEntrypoint/06-next-implementation-routes.md
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/entrypoints/cliCommandExecutionBridge.ts
- packages/ts-shell/src/entrypoints/cliSessionModule.ts
- packages/ts-shell/src/entrypoints/cliWorkspaceModule.ts
- packages/ts-shell/src/entrypoints/cliMcpModule.ts
- packages/ts-shell/src/entrypoints/slashCommandRegistry.ts
- packages/ts-shell/src/entrypoints/cliPermissionModule.ts if present
- packages/ts-shell/src/entrypoints/cliDisplayModule.ts if present
- Route 1 and Route 2 CLI owner modules and tests

Use current code as truth.

## Core Rule

Destination by ownership.

Do not create generic buckets:

- helper
- helpers
- utils
- misc
- common
- support
- cliUtils
- entrypointHelpers

Use named owners:

- cli/interactive/
- cli/commands/
- cli/session/
- cli/workspace/
- cli/approval/
- cli/output/
- mcp/
- shell/
- runtime/

Expected destinations, subject to inspection:

- packages/ts-shell/src/cli/interactive/interactiveLoop.ts
- packages/ts-shell/src/cli/interactive/interactiveCommandRouter.ts
- packages/ts-shell/src/cli/interactive/interactivePromptRunner.ts
- packages/ts-shell/src/cli/interactive/interactiveCancellation.ts
- packages/ts-shell/src/cli/interactive/interactiveSignals.ts
- packages/ts-shell/src/cli/interactive/promptChrome.ts
- packages/ts-shell/src/cli/commands/cliCommandRouter.ts
- packages/ts-shell/src/cli/commands/cliShellModeCommands.ts
- packages/ts-shell/src/cli/session/cliResumeCommand.ts
- packages/ts-shell/src/cli/session/cliSessionCommands.ts
- packages/ts-shell/src/cli/workspace/cliWorkspaceCommands.ts
- packages/ts-shell/src/mcp/cliMcpCommandRouter.ts
- packages/ts-shell/src/cli/approval/cliPermissionCommands.ts
- packages/ts-shell/src/cli/output/projectedLineRenderer.ts if still local

If files already exist, integrate into them instead of duplicating.

## Goal

Make cli.tsx delegate interactive transport and command routing to named owners.

cli.tsx should keep:

- executable shim
- argv/cwd handoff
- bootstrap usage
- non-interactive mode dispatch already extracted
- process-level fatal catch
- high-level call to runInteractiveLoop

cli.tsx should stop deeply owning:

- readline creation
- prompt refresh closure
- blank input guard
- in-flight turn guard
- interactive line handler
- workspace-info shortcut
- command bridge branching
- resume-like action branch
- cancel-run branch
- session/workspace/MCP command routing
- help/view/agent mode/permission command branches
- normal prompt execution branch
- error rendering in interactive prompt branch
- readline close context
- double-Esc cancellation timing and messages
- initial prompt lifecycle

## Required Scope

Complete all categories unless safety blocks:

1. Interactive loop and prompt lifecycle extraction.
2. Cancellation and signal/close handling extraction.
3. Interactive command router extraction.
4. Session/workspace/MCP/help/mode/permission branch extraction.
5. Normal prompt execution branch extraction.

If interactive loop extraction cannot complete safely, stop before command router extraction and report PARTIAL.

If loop extraction completes but command routing cannot complete safely, report PARTIAL with loop committed if green.

## Checkpoint A: Ownership Audit Before Edits

Before editing, produce an in-thread table:

- region/symbol
- current responsibility
- owner domain
- target file
- why not cli.tsx executable shim
- compatibility strategy
- tests
- stop risk

No edits before this table exists.

## Checkpoint B: Interactive Loop, Prompt Chrome, Signals, And Cancellation

Move readline lifecycle, prompt refresh, close bridge, SIGINT context, keypress handling, and double-Esc cancellation into cli/interactive owners.

Candidates:

- readline creation
- refreshInteractivePromptChrome closure
- blank-input guard
- in-flight guard
- rl.on("line") loop shell, excluding command-specific action bodies if needed
- rl.on("close") bridge
- emitKeypressEvents / raw mode setup if local
- process.stdin keypress callback
- double-Esc timing state
- cancellation strings
- initial rl.prompt()

Must preserve:

- readline prompt shape
- blank input behavior
- in-flight rejection string
- pause/resume/finally behavior
- close behavior
- SIGINT bridge behavior
- double-Esc 3-second timing
- double-Esc notices and cancellation behavior
- interrupted-error suppression
- no output wording drift

## Checkpoint C: Interactive Command Router

Move slash/action branch routing out of cli.tsx into command owners.

Candidates:

- workspace-info prompt shortcut
- command execution bridge result handling
- resume-like shell action branch
- cancel-run branch
- session command branch
- workspace command branch
- MCP command branch
- help command branch
- view mode branch
- agent mode branch
- permission command branch
- normal prompt execution branch

Must preserve:

- slash command grammar
- workspace info output
- resume and /continue fallback behavior
- session switch/current/root behavior
- workspace attach/current/root behavior
- MCP unavailable-server diagnostics
- MCP gateway refresh after session/workspace switches
- help output
- view mode and agent mode strings
- permission command behavior
- normal prompt turn numbering
- prompt refresh after session/workspace/agent changes
- error rendering and logging behavior
- no false success

## Checkpoint D: Prompt Runner And Router Result Contract

Make the interactive loop consume a typed router result instead of embedding branch behavior.

Router result should explicitly represent actions such as:

- prompt again
- resume readline
- switch session context
- switch workspace context
- refresh prompt chrome
- refresh MCP gateway
- execute normal prompt
- cancel current run
- handled command
- fatal/reportable error

Do not create a generic command result helper. Name it by interactive command routing responsibility.

Must preserve:

- interactiveTurnNumber behavior
- active session/workspace context updates
- current prompt lifecycle
- interrupted/stopped error distinction
- no result truth classification changes

## Strict Non-Goals

Do not move provider bridge again.

Do not move approval escalation/audit bridge again except permission command routing.

Do not change provider defaults.

Do not run live provider.

Do not change print/stdin/replay routing.

Do not change package scripts or executable path.

Do not change result truth classification.

Do not change output wording intentionally.

Do not move session persistence into CLI command owners.

Do not change workspace root/write policy.

Do not change MCP implementation behavior; routing only.

Do not mass-format unrelated files.

## Compatibility

Keep entrypoints/cli.tsx as executable path.

Keep existing entrypoints compatibility modules where used:

- cliSessionModule.ts
- cliWorkspaceModule.ts
- cliMcpModule.ts
- cliCommandExecutionBridge.ts
- slashCommandRegistry.ts

New cli/* modules must not import entrypoints/cli.tsx.

Avoid import cycles between cli/interactive, cli/commands, cli/session, cli/workspace, mcp, shell, runtime, and entrypoints compatibility modules.

## Validation

Required after Checkpoint B:

- npm test -w packages/ts-shell -- src/entrypoints/cliInteractiveLoopState.test.ts src/entrypoints/cliCommandExecutionBridge.test.ts
- focused tests for new interactive loop/cancellation/signal modules
- focused cli-baseline cases for interactive startup, EOF, Ctrl+C, and interrupted/cancel behavior if available
- npm run build -w packages/ts-shell
- git diff --check

Required after Checkpoint C/D and final:

- npm test -w packages/ts-shell -- src/entrypoints/cliInteractiveLoopState.test.ts src/entrypoints/cliCommandExecutionBridge.test.ts
- npm test -w packages/ts-shell -- src/entrypoints/cliModuleBoundary.test.ts src/entrypoints/cliWorkspaceSurface.test.ts src/entrypoints/cliMcpModule.test.ts src/entrypoints/mcpControlCliSurface.test.ts src/entrypoints/slashCommandRegistry.test.ts
- focused tests for new interactive command router, session command, workspace command, MCP router, mode command, permission command modules
- focused cli-baseline cases for interactive sessions current/switch/last, workspace current/attach, MCP status/tools/refresh, view mode, agent mode, permission command, stopped follow-up, approval prompt, and normal prompt smoke if available
- node scripts/verify-cli-entry.mjs or npm run verify:product:cli-entry if available
- npm run build -w packages/ts-shell
- import scan ensuring new cli/mcp modules do not import entrypoints/cli.tsx
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Run npm run verify:result-contract if terminal/result output surfaces are touched.

Run npm run verify:route221-anti-false-success-gate if result truth or evidence surfaces are touched.

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership table completed before edits
- interactive loop and prompt lifecycle extracted
- cancellation/signal/close handling extracted
- interactive command router extracted
- session/workspace/MCP/help/mode/permission routing extracted
- normal prompt execution branch extracted
- cli.tsx visibly smaller and remains executable shim
- no generic helper/cliUtils bucket movement
- readline prompt/cancellation/session/workspace/MCP behavior preserved
- no output wording, provider default, approval policy, or result truth drift
- focused tests/build pass
- remaining cli.tsx responsibilities listed

PARTIAL if:

- only loop transport moves
- command routing remains deeply local without reason
- tests fail
- behavior compatibility is uncertain

BLOCKED if:

- extraction would change readline behavior
- extraction would change slash command grammar
- extraction would weaken result truth
- import cycles cannot be avoided

## Serena Policy

Use Serena if available for symbol overview, references, call graph, and ownership clustering.

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit green checkpoint if useful.

Suggested prefix:

phase3-cli-route3:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Interactive loop files moved/created
4. Command router files moved/created
5. Session/workspace/MCP/mode/permission files moved/created
6. Compatibility strategy
7. Product behavior changed yes/no
8. Interactive behavior impact
9. Session/workspace/MCP impact
10. Output/result truth impact
11. Validation results
12. Serena usage
13. Remaining cli.tsx responsibilities
14. cli.tsx line count
15. Commit hash if committed
16. Whether safe to start final CLI route
