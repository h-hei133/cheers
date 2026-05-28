# Phase 3: CLI Entrypoint Ownership Audit

## Purpose

Audit:

packages/ts-shell/src/entrypoints/cli.tsx

Previous cleanup waves reduced runMvpIntegratedFlow.ts, workflowExecutionCoordinator.ts, workflowTaskPlan.ts, and SessionManager.ts into compatibility facades or acceptable coordinators.

The next likely architecture concentration point is the CLI entrypoint.

This route determines whether cli.tsx is a legitimate thin CLI composition root or a CLI monolith.

This is audit-only.

Do not edit runtime code.
Do not move source files.
Do not rewrite tests.
Do not change package scripts.
Do not run live provider.
Do not change CLI behavior.

## Output Directory

Write all audit artifacts under:

docs/product-architecture-reset/cliEntrypoint/

Required outputs:

- docs/product-architecture-reset/cliEntrypoint/README.md
- docs/product-architecture-reset/cliEntrypoint/00-current-map.md
- docs/product-architecture-reset/cliEntrypoint/01-ownership-audit.md
- docs/product-architecture-reset/cliEntrypoint/02-stay-vs-move.md
- docs/product-architecture-reset/cliEntrypoint/03-extraction-targets.md
- docs/product-architecture-reset/cliEntrypoint/04-risk-register.md
- docs/product-architecture-reset/cliEntrypoint/05-validation-plan.md
- docs/product-architecture-reset/cliEntrypoint/06-next-implementation-routes.md

## Required Reading

Read before conclusions:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/entrypoints/cliRuntimeModule.ts if present
- packages/ts-shell/src/entrypoints/cliSessionModule.ts if present
- packages/ts-shell/src/entrypoints/cliWorkspaceModule.ts if present
- packages/ts-shell/src/entrypoints/cliDoctor.ts if present
- packages/ts-shell/src/entrypoints/cliMcpModule.ts if present
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionTerminalState.ts
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts
- packages/ts-shell/src/turn/turnFacade.ts if present
- CLI, entrypoint, shell, and session tests under packages/ts-shell/src
- docs/product-architecture-reset/runMvp/README.md
- docs/product-architecture-reset/workflowExecutionCoordinator/README.md
- docs/product-architecture-reset/workflowTaskPlan/README.md
- docs/product-architecture-reset/sessionManager/README.md

Use current code as truth. Older docs are context only.

## Core Question

Does cli.tsx only compose CLI-owned modules, or does it still own too many unrelated behaviors?

A valid CLI entrypoint may own:

- executable bootstrap
- top-level mode dispatch
- minimal argv handoff
- fatal error boundary
- wiring CLI modules together
- compatibility with current CLI flags

cli.tsx must not deeply own:

- argument parsing policy if it can be cli/args
- output rendering if it can be cli/output or shell surface owner
- session command logic if it can be cli/session
- workspace command logic if it can be cli/workspace
- provider flag/default behavior if it can be provider/config or cli/provider
- approval policy if it can be policy/approval
- runtime execution behavior
- result truth classification
- evidence projection
- session persistence
- MCP control-plane implementation
- doctor diagnostics implementation
- interactive readline loop internals if it can be cli/interactive
- print/non-interactive execution internals if it can be cli/print

If those appear in the file, classify them as extraction candidates.

## Ownership Standard

A clean CLI entrypoint should become:

- a small executable composition root
- a compatibility facade for current CLI invocation
- a delegator to cli-owned modules

It should not be a place where runtime, session, provider, approval, result, MCP, or output logic accumulates.

## Required Analysis

For every major symbol, type, function, constant, branch, local helper, and high-density region, record:

- current responsibility
- classification:
  - valid CLI entrypoint ownership
  - domain logic in wrong owner
  - compatibility glue
  - temporary adapter
  - extraction candidate
  - deprecated/legacy residue
- final owner domain
- should stay / move / split / delete later
- proposed destination file
- compatibility needs
- test coverage needed
- extraction risk
- suggested implementation route

Do not leave large regions unmapped.

## Destination Rules

Use real owner modules:

- cli/args/
- cli/commands/
- cli/session/
- cli/workspace/
- cli/output/
- cli/interactive/
- cli/print/
- cli/provider/
- cli/approval/
- cli/errors/
- cli/bootstrap/
- entrypoints/ only for executable compatibility shim
- provider/
- policy/
- runtime/
- session/
- result/
- mcp/
- shell/

Do not propose vague destinations:

- helper
- helpers
- utils
- misc
- common
- support
- cliUtils
- entrypointHelpers

If proposing files, name them by product responsibility.

Good examples:

- cli/args/cliArgsParser.ts
- cli/commands/cliCommandRouter.ts
- cli/session/cliSessionCommands.ts
- cli/output/cliResultRenderer.ts
- cli/interactive/interactiveLoop.ts
- cli/print/printModeRunner.ts
- cli/provider/cliProviderOptions.ts
- cli/approval/cliApprovalBridge.ts
- cli/errors/cliFatalErrorBoundary.ts
- entrypoints/cli.tsx as thin executable shim

Bad examples:

- cli/helpers.ts
- cli/utils.ts
- entrypoints/cliSupport.ts
- cli/misc.ts

## Required Outputs

### README.md

Summarize purpose, status, artifact list, and final verdict.

### 00-current-map.md

Map file size, imports, exports, executable entrypoints, argv paths, command modes, major functions, local helpers, high-density regions, tests, and consumers.

### 01-ownership-audit.md

Classify every major symbol/region as:

- valid CLI entrypoint ownership
- domain logic in wrong owner
- compatibility glue
- temporary adapter
- extraction candidate
- deprecated/legacy residue

### 02-stay-vs-move.md

A table with:

- symbol/region
- stay?
- move?
- split?
- delete/deprecate later?
- final destination
- reason

### 03-extraction-targets.md

Concrete extraction targets grouped by implementation route.

Each target must include:

- source symbols/regions
- destination file
- compatibility strategy
- tests
- stop conditions

### 04-risk-register.md

Risks such as:

- CLI behavior drift
- flag parsing drift
- provider default drift
- live-provider accidental enablement
- approval policy drift
- print vs interactive parity drift
- result truthfulness drift
- session command drift
- workspace root drift
- MCP command drift
- output string drift
- import cycles
- deletion of compatibility paths still used by tests or scripts

### 05-validation-plan.md

Validation for future implementation routes:

- CLI entry tests
- CLI baseline tests
- cliSessionModule tests
- cliRuntimeModule tests
- cliWorkspaceModule tests
- cliDoctor / cliMcp tests if touched
- sessionRuntime tests if runtime invocation changes
- verify:product:cli-entry
- verify:result-contract if result truth/output changes
- Route221 gate if false-success surfaces are touched
- build
- import scan

### 06-next-implementation-routes.md

Recommend aggressive but safe grouped implementation routes.

Do not split into too many tiny routes.

Group compatible extraction targets together.

Answer clearly:

- safe to implement now?
- first implementation route?
- what should not be combined?

## Suggested Route Grouping To Evaluate

Codex must verify against current code, but should consider these groupings:

1. Args / mode dispatch / command routing boundary.
2. Print mode / non-interactive runtime invocation / result rendering.
3. Interactive loop / readline / interrupt handling / approval bridge.
4. Session and workspace CLI commands.
5. Provider flags / provider default-off policy / live-provider guard.
6. MCP / doctor / diagnostic compatibility cleanup.
7. Dead residue and entrypoint shim cleanup.

Merge compatible routes if safe, but do not combine provider default changes with output rendering or approval policy changes unless the compatibility plan is explicit.

## Serena Policy

Use Serena if available for:

- symbol overview
- find symbol
- find references
- caller/callee inspection
- ownership clustering
- import cycle risk review

Do not use Serena as validation replacement.

If onboarding asks for memory writes and this audit does not need memory changes, skip onboarding and continue.

## Validation For This Audit Route

Required:

- all required docs exist
- git diff --check
- git status --short --branch

No build/tests required because source code must not change.

## Completion Criteria

COMPLETE requires:

- all required docs exist
- whole file is mapped
- every major symbol/region has ownership classification
- clear answer:
  - valid thin CLI entrypoint
  - partial CLI monolith
  - unacceptable CLI monolith
- concrete grouped implementation routes exist if cleanup is needed
- validation plan exists
- no runtime or CLI behavior changed

PARTIAL if:

- only high-level overview exists
- large regions are unmapped
- destinations are vague
- implementation routes are vague

BLOCKED if:

- file cannot be inspected
- symbol structure cannot be recovered enough for audit

## Final Report

Include:

1. Final status
2. Docs created
3. Serena usage
4. File size and major symbols
5. Whether cli.tsx is a valid thin entrypoint or CLI monolith
6. What should stay
7. Biggest extraction targets
8. Recommended grouped implementation routes
9. Validation summary
10. Whether safe to start implementation or move to next file
