# Phase 4: Execution Contract Fixture And Rust Smoke

## Purpose

Strengthen the TypeScript-first, Rust-ready execution boundary by adding a minimal cross-runtime contract fixture and Rust smoke validation.

The previous execution-boundary routes established:

- TypeScript is the primary product runtime.
- ExecutionService is the TypeScript execution boundary.
- ExecutionService requests now carry explicit authority and request metadata.
- CommandExecutionResult now includes structured execution events.
- Python eval remains offline-only.
- Rust remains a native executor candidate, not the default execution plane.

This route must prove the boundary is not TypeScript-only by validating that Rust can consume the same serialized execution request and event/result shapes.

This is not a Rust migration route.

This is not a feature route.

This is a contract-readiness and smoke route.

## Core Goal

Create or strengthen a minimal serialized execution contract surface that can be consumed by both TypeScript and Rust.

COMPLETE requires:

1. A stable execution fixture or schema source for request/result/event shape.
2. TypeScript tests proving the fixture matches ExecutionService request/result/event semantics.
3. Rust smoke test proving Rust can parse the fixture and preserve key fields.
4. No business logic added to contracts.
5. No runtime behavior change.

## Required Reading

Read before editing:

- docs/product-architecture-reset/executionBoundary/README.md
- docs/product-architecture-reset/executionBoundary/00-current-language-reality.md
- docs/product-architecture-reset/executionBoundary/02-execution-boundary-contract.md
- docs/product-architecture-reset/executionBoundary/03-boundary-enforcement-plan.md
- docs/product-architecture-reset/executionBoundary/04-rust-readiness-triggers.md
- packages/ts-shell/src/runtime/execution/executionService.ts
- packages/ts-shell/src/runtime/execution/executionService.test.ts
- scripts/verify-execution-boundary.mjs
- contracts package
- packages/rust-core package
- existing Rust tests and fixtures

Use current code as truth.

## Combined Phase Structure

This route combines contract inspection, fixture creation, TypeScript validation, Rust smoke validation, and enforcement documentation into one route.

Do not split into tiny routes unless safety blocks you.

## Phase A: Contract Placement Audit Before Edits

Before editing, produce an in-thread table:

- candidate contract or fixture location
- current owner
- whether it belongs in contracts, ts-shell test fixtures, rust-core fixtures, or docs
- why not business logic
- TypeScript validation plan
- Rust validation plan
- compatibility strategy
- stop risk

No edits before this table exists.

## Phase B: Serialized Execution Fixture Or Schema

Add the smallest useful serialized execution fixture or schema representation.

Preferred low-risk options:

- JSON fixture under contracts fixtures if contracts already owns runtime protocol fixtures.
- JSON fixture under a shared contract fixture directory if one already exists.
- If contracts is not ready, use a documented fixture under a test fixture location and explain why it is not elevated to contracts yet.

The fixture should cover:

- run command request metadata
- operation kind
- authority mode
- caller
- reason
- report-safe projection
- workspace root or cwd shape
- timeout shape
- completed command result
- failed command result
- timed out command result
- cancelled command result
- execution events such as started, exited, failed, timed_out, cancelled

Keep it minimal.

Do not add model, provider, shell, UI, route, or business orchestration fields.

Do not add file system helper code to contracts.

## Phase C: TypeScript Fixture Validation

Add or update a TypeScript focused test that proves the fixture matches current ExecutionService types.

Acceptable validation:

- fixture satisfies ExecutionService request/result/event TypeScript types
- fixture round-trips through a parse or validation function if one exists
- fixture has all required authority and event fields
- no vague authority booleans appear
- report-safe projection exists where expected

Do not add broad runtime behavior changes.

Do not rewrite ExecutionService behavior unless the fixture exposes a real type mismatch.

## Phase D: Rust Smoke Validation

Add a minimal Rust smoke test only if low-risk.

The Rust smoke should parse the serialized fixture and assert key fields:

- operation kind
- authority mode
- execution event types
- status values
- exit code where present
- timeout or cancelled state where present
- failure kind where present

The Rust smoke must not implement product runtime behavior.

The Rust smoke must not become a second source of business truth.

If current Rust package structure makes this unsafe or too broad, stop and report PARTIAL with exact blocker. Do not force a large Rust refactor.

## Phase E: Enforcement And Documentation

Update documentation only where needed:

- execution boundary contract doc
- Rust readiness triggers doc
- boundary enforcement plan doc

Update scanner only if needed to protect the new fixture or contract placement.

The scanner should continue to enforce:

- production runtime does not import python-eval
- contracts do not import product runtime
- runtime does not import docs, scripts, dev-history, or route reports
- execution request shapes avoid vague authority booleans

## Strict Non-Goals

Do not:

- add product features
- run live provider
- migrate execution to Rust
- make Rust the default execution path
- move Python eval into runtime
- change provider defaults
- change production write defaults
- change CLI or session output behavior
- change runtime behavior except type compatibility fixes
- put business orchestration into contracts
- put IO helpers into contracts
- weaken evidence or verdict truthfulness
- convert stopped, blocked, partial, skipped, not-run, failed, timeout, cancelled, no-provider, or not-proven into success
- change package scripts unless a narrow existing test command already needs fixture discovery
- mass-format unrelated files

## Contracts Rules

Contracts may contain:

- schemas
- serialized fixtures
- event type definitions
- permission or authority type definitions
- lifecycle state definitions
- versioned request and response shapes

Contracts must not contain:

- runtime adapters
- shell execution helpers
- file system helpers
- model/provider calls
- UI helpers
- convenience mocks
- business orchestration

If contracts is not the right owner yet, document why and use a narrower fixture placement.

## Validation

Required:

- focused TypeScript execution fixture or ExecutionService tests
- Rust smoke test if Rust files are changed
- contracts tests if contracts files are changed
- node scripts/verify-execution-boundary.mjs
- npm run build -w packages/ts-shell if TypeScript code changed
- git diff --check
- git status --short --branch

Do not run live provider.

Do not run broad unrelated tests unless touched files require them.

## Completion Criteria

COMPLETE requires:

- contract placement audit table completed before edits
- serialized execution fixture or schema exists in the correct owner location
- TypeScript focused validation passes
- Rust smoke validation passes if Rust was touched
- contracts remain free of business logic and IO helpers
- boundary scanner still passes
- Python eval remains offline-only
- no product behavior/default change
- validation passes

PARTIAL if:

- fixture exists but Rust cannot safely parse it yet
- contracts placement is unresolved
- TypeScript validation passes but Rust smoke is blocked by package structure
- scanner cannot safely cover the new shape
- only docs change

BLOCKED if:

- Rust smoke requires broad Rust refactor
- contracts package cannot safely own any serialized fixture
- execution request shape is too unstable to serialize without behavior change

## Commit

Commit if green.

Suggested prefix:

execution-contract:

Do not push.

## Final Report

Include:

1. Final status
2. Contract placement audit summary
3. Fixture or schema location
4. TypeScript validation result
5. Rust smoke result
6. Contracts boundary status
7. Scanner/enforcement status
8. Python eval isolation status
9. Product behavior changed yes/no
10. Validation results
11. Remaining execution contract debt
12. Commit hash if committed
