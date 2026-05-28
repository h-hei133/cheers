# Phase 3 CLI Route 1: Bootstrap Context, Startup Surface, Print, Replay, And Stdin Mode Extraction

## Purpose

Start reducing:

packages/ts-shell/src/entrypoints/cli.tsx

The audit classified cli.tsx as a valid executable compatibility entrypoint plus a partial CLI monolith.

This route combines compatible low-risk startup and non-interactive responsibilities:

1. Bootstrap context and startup surface.
2. Print, replay, and stdin mode consolidation.

This is implementation work, not another audit.

This route must not touch provider default behavior, approval policy, runtime result truth, interactive readline routing, session persistence, workspace policy, MCP implementation, package scripts, or live provider behavior.

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
- packages/ts-shell/src/entrypoints/cliArgs.ts
- packages/ts-shell/src/entrypoints/cliModeDispatch.ts
- packages/ts-shell/src/entrypoints/cliPrintModeRunner.ts
- packages/ts-shell/src/entrypoints/cliStdinModeRunner.ts
- packages/ts-shell/src/entrypoints/cliRuntimeModule.ts
- packages/ts-shell/src/entrypoints/cliDoctor.ts
- packages/ts-shell/src/entrypoints/cliStartupSurface.ts if present
- packages/ts-shell/src/cli-baseline.test.ts
- scripts/verify-cli-entry.mjs

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

- cli/bootstrap/
- cli/print/
- cli/output/
- cli/errors/
- cli/args/
- entrypoints/ only for compatibility facades
- shell/ only for shell-owned startup behavior
- session/ only for session-owned recovery facts

Expected destinations, subject to inspection:

- packages/ts-shell/src/cli/bootstrap/cliBootstrapContext.ts
- packages/ts-shell/src/cli/bootstrap/cliBootstrapRunner.ts
- packages/ts-shell/src/cli/bootstrap/cliStartupSurface.ts
- packages/ts-shell/src/cli/errors/cliBootstrapErrorBoundary.ts
- packages/ts-shell/src/cli/print/stdinPromptCapture.ts
- packages/ts-shell/src/cli/print/printModeRouter.ts
- packages/ts-shell/src/cli/print/replayModeRunner.ts
- packages/ts-shell/src/cli/print/stdinBatchModeRunner.ts
- packages/ts-shell/src/cli/output/projectedLineRenderer.ts

If files already exist, integrate into them instead of duplicating.

## Goal

Make cli.tsx visibly smaller while keeping it as the executable shim.

cli.tsx should keep:

- shebang
- process.argv and process.cwd handoff
- main().catch fatal boundary
- top-level call to bootstrap / mode runner
- package entry compatibility

cli.tsx should stop deeply owning:

- root/config setup
- session/renderer service construction
- recovery startup projection
- bootstrap call details
- bootstrap error rendering details
- startup surface selection
- stdin capture implementation
- replay/print/stdin branch dependency bundling
- projected line rendering adapter

## Required Scope

Complete both categories unless safety blocks:

1. Bootstrap context/startup surface extraction.
2. Print/replay/stdin mode consolidation.

If bootstrap extraction cannot complete safely, stop before print/stdin and report PARTIAL.

If bootstrap completes but print/stdin cannot complete safely, report PARTIAL with bootstrap committed if green.

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

## Checkpoint B: Bootstrap Context And Startup Surface

Move startup/bootstrap details into cli/bootstrap and cli/errors owners.

Candidates:

- trace/logger/argv/cwd setup except minimal process handoff
- parse/version/doctor branch wiring only if safe
- workspace root and git root setup
- runtime config setup
- session manager and renderer construction
- recovery candidate and blocked notice lookup
- shell bootstrap call
- bootstrap error rendering
- runtime context materialization
- initial MCP gateway creation only if lifecycle remains compatible
- startup plan and startup surface selection
- session initialized log projection if safe

Must preserve:

- --version output
- parse error behavior
- doctor no-provider/no-runtime shortcut behavior
- root-binding diagnostics wording and exit code
- damaged current session pointer behavior
- startup output strings
- runtime config defaults
- provider default-off behavior
- no new provider credential read path
- package entry path

Do not move provider credential refresh closure in this checkpoint.

## Checkpoint C: Print, Replay, And Stdin Mode Consolidation

Move non-interactive mode wiring into cli/print owners.

Candidates:

- readStdinToEnd
- stdin transport/captured prompt handling
- non-interactive prompt materialization
- replay branch dependency bundling
- stdin stream branch dependency bundling
- print branch dependency bundling
- stdin batch branch dependency bundling
- renderProjectedLines adapter

Likely owners:

- cli/print/stdinPromptCapture.ts
- cli/print/printModeRouter.ts
- cli/print/replayModeRunner.ts
- cli/print/stdinBatchModeRunner.ts
- cli/output/projectedLineRenderer.ts

Must preserve:

- resolveCliMode compatibility
- replay precedence over print/stdin
- stdin stream vs captured batch distinction
- empty stdin behavior
- missing prompt behavior and exit surface
- print vs stdin result surfaces
- no output wording changes except mechanical move
- no runtime result truth changes

Do not move interactive readline or command router.

## Strict Non-Goals

Do not move ShellSessionRuntime runPrompt closure.

Do not move provider credential semantics.

Do not move approval bridge or approval audit mapping.

Do not change provider defaults.

Do not change live-provider behavior.

Do not move interactive readline loop.

Do not move slash command routing.

Do not move session/workspace/MCP command routing.

Do not change result truth classification.

Do not change output wording intentionally.

Do not change package scripts or executable path.

Do not run live provider.

Do not mass-format unrelated files.

## Compatibility

Keep entrypoints/cli.tsx as the executable path.

Keep existing entrypoints compatibility facades where used:

- cliPrintModeRunner.ts
- cliStdinModeRunner.ts
- cliRuntimeModule.ts
- cliModeDispatch.ts

New cli/* modules must not import entrypoints/cli.tsx.

Avoid import cycles between cli/bootstrap, cli/print, entrypoints compatibility modules, shell, session, and runtime owners.

## Validation

Required after Checkpoint B:

- npm test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts src/entrypoints/cliDoctor.test.ts src/entrypoints/cliCoreSplit.test.ts
- focused cli-baseline cases for version, doctor, startup, root binding, damaged current session pointer if available
- node scripts/verify-cli-entry.mjs or npm run verify:product:cli-entry if available
- npm run build -w packages/ts-shell
- git diff --check

Required after Checkpoint C and final:

- npm test -w packages/ts-shell -- src/entrypoints/cliModeDispatch.test.ts src/entrypoints/cliPrintModeRunner.test.ts src/entrypoints/cliStdinModeRunner.test.ts
- focused cli-baseline cases for print, stdin, replay, missing prompt, synthetic read-only print, and print/stdin parity if available
- node scripts/verify-cli-entry.mjs or npm run verify:product:cli-entry if available
- npm run build -w packages/ts-shell
- import scan ensuring product runtime does not import entrypoints/cli.tsx
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Run npm run verify:result-contract only if terminal/result output surfaces are touched.

Run Route221 anti-false-success gate only if result truth or evidence surfaces are touched.

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership table completed before edits
- bootstrap context/startup surface extracted
- print/replay/stdin mode consolidation extracted
- cli.tsx visibly smaller and remains executable shim
- no generic helper/cliUtils bucket movement
- public executable path preserved
- parse/version/doctor/root/startup behavior preserved
- print/stdin/replay behavior preserved
- no provider default, approval, result truth, or output wording drift
- focused tests and build pass
- remaining cli.tsx responsibilities listed

PARTIAL if:

- only bootstrap lands
- print/stdin consolidation is unsafe
- tests fail
- behavior compatibility is uncertain

BLOCKED if:

- extraction requires provider/approval/runtime invocation changes
- entrypoint path compatibility cannot be preserved
- output/result truth would drift

## Serena Policy

Use Serena if available for symbol overview, references, call graph, and ownership clustering.

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit green checkpoint if useful.

Suggested prefix:

phase3-cli-route1:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Bootstrap files moved/created
4. Print/stdin/replay files moved/created
5. Compatibility strategy
6. Product behavior changed yes/no
7. CLI behavior impact
8. Provider/default impact
9. Output/result truth impact
10. Validation results
11. Serena usage
12. Remaining cli.tsx responsibilities
13. cli.tsx line count
14. Commit hash if committed
15. Whether safe to start next CLI route
