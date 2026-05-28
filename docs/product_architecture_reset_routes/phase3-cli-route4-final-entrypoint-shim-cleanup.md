# Phase 3 CLI Route 4: Final Entrypoint Shim Cleanup

## Purpose

Finish the current CLI entrypoint cleanup:

packages/ts-shell/src/entrypoints/cli.tsx

Routes 1-3 extracted bootstrap/startup, print/replay/stdin, provider/approval/runtime bridges, interactive loop, cancellation, and command router.

cli.tsx is now small, but it still owns executable shim, argv/cwd handoff, bootstrap/startup call, print-mode dispatch, runInteractiveLoop call, and fatal catch.

This route decides whether cli.tsx is now clean enough or can be reduced further into a final executable shim.

This is implementation work.

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
- Route 1, Route 2, and Route 3 CLI owner modules and tests
- packages/ts-shell/package.json
- package.json if package entry scripts are relevant
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
- cli/process/
- cli/errors/
- cli/print/
- cli/interactive/
- entrypoints/ only for executable shim compatibility

Expected destinations, subject to inspection:

- packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts
- packages/ts-shell/src/cli/errors/cliFatalErrorBoundary.ts
- existing cli/bootstrap, cli/print, cli/interactive owners

If files already exist, integrate into them instead of duplicating.

## Goal

Reduce cli.tsx to the smallest safe executable compatibility shim.

Ideal final cli.tsx contents:

- shebang
- import a named process runner
- call process runner with process.argv.slice(2), process.cwd(), process/env adapters if needed
- top-level fatal catch, or delegate fatal rendering to cli/errors while preserving process exit behavior

cli.tsx may keep only what must stay for package executable compatibility.

cli.tsx should stop owning:

- bootstrap orchestration details
- print/non-interactive dispatch details
- interactive loop selection details
- fatal error formatting details if safely movable
- remaining local adapters
- unnecessary import fan-in

## Required Scope

Complete all categories unless safety blocks:

1. Final process runner extraction.
2. Fatal boundary extraction if still locally meaningful.
3. Import fan-in cleanup.
4. Compatibility facade cleanup with proof.
5. Final CLI entrypoint audit.

If a category is already thin enough, prove it and leave it.

## Checkpoint A: Ownership Audit Before Edits

Before editing, produce an in-thread table:

- region/symbol
- current responsibility
- owner domain
- target file
- why it can or cannot stay in cli.tsx
- compatibility strategy
- tests
- stop risk

No edits before this table exists.

## Checkpoint B: Process Runner Extraction

Move remaining startup/non-interactive/interactive composition into a named process runner if cli.tsx still coordinates more than process handoff.

Candidate destination:

- cli/bootstrap/cliProcessRunner.ts

Must preserve:

- package executable path
- process.argv behavior
- process.cwd behavior
- parse/version/doctor behavior
- startup/bootstrap behavior
- print/replay/stdin behavior
- interactive loop behavior
- no output wording drift
- no provider/default/approval/result truth drift

## Checkpoint C: Fatal Boundary Extraction

Move fatal error formatting into cli/errors if still local and safe.

Candidate destination:

- cli/errors/cliFatalErrorBoundary.ts

Must preserve:

- stderr wording
- exit code
- thrown error behavior
- startup fatal behavior
- no swallowing of errors

If fatal boundary is already minimal and safer in cli.tsx, leave it and document why.

## Checkpoint D: Import And Compatibility Cleanup

Remove unused imports and dead private adapters only with proof.

Allowed:

- remove local imports no longer needed
- move import fan-in into process runner
- delete private local adapters proven unused
- keep compatibility facades still used by tests/scripts/package entry

Forbidden:

- package script changes
- executable path rename
- removing entrypoints/cli.tsx
- deleting compatibility facades still imported by tests/scripts/package metadata
- moving route docs/reports

## Strict Non-Goals

Do not change provider defaults.

Do not change approval policy.

Do not change runtime invocation behavior.

Do not change interactive command behavior.

Do not change print/stdin/replay behavior.

Do not change output wording intentionally.

Do not change result truth classification.

Do not run live provider.

Do not move package scripts.

Do not mass-format unrelated files.

## Compatibility

Keep packages/ts-shell/src/entrypoints/cli.tsx as the stable executable path.

New cli/* modules must not import entrypoints/cli.tsx.

No product runtime module should import entrypoints/cli.tsx.

Do not remove entrypoint compatibility facades still referenced by tests, scripts, or package metadata.

## Validation

Required:

- node scripts/verify-cli-entry.mjs or npm run verify:product:cli-entry if available
- focused cli-baseline CLI entry parity cases:
  - version
  - doctor
  - print
  - stdin
  - replay
  - interactive startup
  - EOF
  - root binding
  - damaged current session pointer
  - session current/switch smoke if available
- npm test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts src/entrypoints/cliModeDispatch.test.ts src/entrypoints/cliPrintModeRunner.test.ts src/entrypoints/cliStdinModeRunner.test.ts src/entrypoints/cliInteractiveLoopState.test.ts src/entrypoints/cliCommandExecutionBridge.test.ts src/entrypoints/cliModuleBoundary.test.ts
- npm run build -w packages/ts-shell
- import scan:
  rg -n "entrypoints/cli\\.(js|tsx)|from \\\".*entrypoints/cli" packages/ts-shell/src scripts package.json packages/ts-shell/package.json
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Run npm run verify:result-contract only if result/output truth surfaces are touched.

Run npm run verify:route221-anti-false-success-gate only if false-success surfaces are touched.

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership table completed before edits
- cli.tsx reduced to final executable shim, or explicit proof current 159-line shape is the minimum safe shim
- process runner extracted if meaningful
- fatal boundary extracted or justified as staying
- unused import/local residue cleaned with proof
- package executable path preserved
- no provider/default/approval/output/result truth drift
- tests/build/entry gate pass
- final cli.tsx line count listed
- explicit final judgment whether CLI entrypoint cleanup is complete

PARTIAL if:

- process runner extraction is incomplete
- cli.tsx remains behavior-heavy without justification
- tests fail
- compatibility is uncertain

BLOCKED if:

- cleanup requires package entrypoint rename
- cleanup would change CLI behavior
- import cycles cannot be avoided

## Serena Policy

Use Serena if available for symbol overview, references, call graph, and ownership clustering.

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit if green.

Suggested prefix:

phase3-cli-route4:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Process runner files moved/created
4. Fatal boundary files moved/created or reason it stayed
5. Compatibility cleanup done
6. Product behavior changed yes/no
7. CLI behavior impact
8. Provider/default impact
9. Output/result truth impact
10. Validation results
11. Serena usage
12. Remaining cli.tsx responsibilities
13. cli.tsx line count
14. Commit hash if committed
15. Whether CLI entrypoint cleanup is complete
