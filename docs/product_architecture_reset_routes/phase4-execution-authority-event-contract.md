# Phase 4: Execution Authority And Event Contract Hardening

## Purpose

Strengthen the execution boundary created by the previous execution-boundary route.

The previous route corrected the language/runtime reality:

- TypeScript is the primary product runtime and control plane.
- Execution is an explicit boundary/interface, currently implemented mostly in TypeScript.
- Rust is a native executor candidate for OS/process/sandbox/isolation/distribution-critical responsibilities.
- Python eval is offline-only.
- ExecutionService now exists as the TypeScript execution boundary.

This route must make that boundary harder to misuse.

The goal is not to migrate execution to Rust.

The goal is to ensure execution requests carry explicit authority semantics and execution outputs have stable structured event/result semantics that can later be mirrored by Rust.

## Current Problem

ExecutionService is now a real entrypoint, but a boundary is only strong if it carries the semantics that protect it.

Potential gaps to inspect:

- Execution requests may not clearly represent authority, approval, dry-run, preview, sandbox, timeout, or cancellation semantics.
- Execution results may still be too adapter-specific instead of event/contract shaped.
- Tool callers may still treat command/file operations as convenience calls rather than capability-bound execution requests.
- Contracts may not yet have enough schema/event shape to verify cross-runtime readiness.
- Rust may not have a minimal smoke proving it can parse or mirror execution request/result/event shapes.
- The scanner may enforce import boundaries but not semantic request shape boundaries.

This route should close these gaps where current code supports it.

## Required Reading

Read before editing:

- docs/product-architecture-reset/executionBoundary/README.md
- docs/product-architecture-reset/executionBoundary/00-current-language-reality.md
- docs/product-architecture-reset/executionBoundary/01-side-effect-entrypoint-inventory.md
- docs/product-architecture-reset/executionBoundary/02-execution-boundary-contract.md
- docs/product-architecture-reset/executionBoundary/03-boundary-enforcement-plan.md
- docs/product-architecture-reset/executionBoundary/04-rust-readiness-triggers.md
- docs/product-architecture-reset/executionBoundary/05-python-eval-isolation.md
- packages/ts-shell/src/runtime/execution/executionService.ts
- packages/ts-shell/src/runtime/execution/executionService.test.ts
- packages/ts-shell/src/core/tools/registry.ts
- packages/ts-shell/src/daemon/client.ts
- current permission, workspace authority, edit/write, command execution, and result/evidence modules
- current contracts package
- current packages/rust-core package

Use current code as truth.

## Combined Phase Structure

This route combines four conceptual phases into one goal:

1. Authority and request semantics audit.
2. Structured execution event/result hardening.
3. Contracts and Rust readiness smoke where safe.
4. Enforcement and validation.

## Phase A: Authority And Request Semantics Audit

Before editing, produce an in-thread table:

- execution caller or request shape
- current operation type
- current authority signal
- missing authority or lifecycle semantics
- proposed owner/type change
- compatibility strategy
- tests
- stop risk

No edits before this table exists.

Inspect at least:

- runCommand request shape
- readTextFile request shape
- writeTextFile request shape
- listFilesRecursive request shape
- bash/git-status/git-diff tool callers
- read/write/edit/glob callers
- workspace authority and apply_patch routes
- command permission or allowlist paths
- timeout/cancellation paths
- daemon fallback path

## Phase B: Authority Shape Hardening

Add or strengthen explicit request fields only where behavior can be preserved.

Do not invent fake permission enforcement.

If current code cannot enforce a permission token yet, represent the current authority reality honestly.

Acceptable additions include stable structured metadata such as:

- operation kind
- reason
- workspace root
- authority mode
- dry-run or preview indicator
- approval or permission state if already known
- timeout
- cancellation signal
- sandbox requirement or sandbox check result if already known
- caller label for audit only
- report-safe command or path projection

Do not make authority optional if the current path actually requires it.

Do not require a real token everywhere if current callers do not have one. Instead, define a transitional authority shape with explicit states and mark token-backed enforcement as a future trigger.

Potential authority states:

- none-required
- read-only
- preview
- permission-pending
- denied
- approved-for-write
- command-allowlisted
- sandbox-approved
- sandbox-rejected
- unknown-transitional

Avoid ambiguous booleans such as allowed, approved, enabled, or safe without a precise enum.

## Phase C: Structured Execution Event And Result Hardening

Add or strengthen structured execution events or result unions.

The goal is to make execution output stable enough for future Rust mirroring.

Events or result shapes may include:

- execution.started
- execution.stdout
- execution.stderr
- execution.exited
- execution.failed
- execution.timed_out
- execution.cancelled
- execution.permission_required
- execution.sandbox_rejected
- file.read.completed
- file.write.completed
- file.write.denied
- file.write.failed

Do not force a streaming event implementation if current code is synchronous.

A minimal stable result/event union is acceptable if it preserves current behavior and prepares the boundary.

Keep result fields report-safe where applicable.

Preserve:

- execution path
- status
- exit code
- stdout
- stderr
- failure kind
- recovery reason
- timeout status
- cancelled status
- daemon metadata when present

## Phase D: Contracts And Rust Readiness

Inspect contracts and Rust code.

Do not move business logic into contracts.

Do not migrate product runtime logic to Rust.

If safe and low-risk, add a minimal cross-runtime readiness smoke:

- TypeScript execution request/result/event fixture
- contracts schema or fixture only if current contracts package is the right owner
- Rust test that parses a fixture or verifies compatible request/result shape

If contracts or Rust are not ready for this without broad churn, do not force it. Instead, document:

- why it is not safe yet
- what exact trigger should introduce contracts schema elevation
- what Rust smoke should eventually validate

Rust should remain a candidate executor unless current code proves a stronger role.

## Phase E: Enforcement Hardening

Update the boundary enforcement scan if useful.

Possible checks:

- no new direct child_process imports outside sanctioned owners
- no new writable fs operations outside sanctioned owners
- production runtime still does not import python-eval
- contracts still do not import product runtime
- executionService request/result types are the required import path for core tool execution
- no new execution request shape uses vague allowed or approved booleans without enum authority state

Do not create a brittle scanner that blocks legitimate existing owners without a narrow allowlist.

## Strict Non-Goals

Do not:

- add product features
- run live provider
- migrate execution broadly to Rust
- move Python eval into runtime
- change provider defaults
- change production write defaults
- change CLI/session output behavior
- rewrite command execution behavior broadly
- rewrite patch/workspace write behavior broadly
- weaken evidence or verdict truthfulness
- turn stopped, blocked, partial, skipped, not-run, failed, timeout, cancelled, no-provider, or not-proven into success
- introduce fake permission token enforcement that current runtime cannot actually honor
- put business logic into contracts
- mass-format unrelated files

## Validation

Required:

- focused executionService tests
- focused tool runtime tests if tool callers change
- boundary enforcement script
- npm run build -w packages/ts-shell if TypeScript code changed
- contracts tests only if contracts changed
- Rust tests only if Rust files changed
- npm run verify:result-contract if result/evidence semantics are touched
- git diff --check
- git status --short --branch

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- authority/request audit table completed before edits
- ExecutionService request shapes have explicit authority/lifecycle semantics or a documented transitional authority state
- execution results/events are more structured or confirmed already sufficient with focused tests
- contracts/Rust readiness is either implemented with a minimal smoke or explicitly documented as not yet safe
- boundary enforcement scan is updated or confirmed adequate
- Python eval remains offline-only
- no product behavior/default change
- validation passes

PARTIAL if:

- only documentation changes
- authority remains ambiguous without explicit transitional documentation
- execution event/result shape remains purely ad hoc
- scanner does not cover the updated boundary
- validation is skipped without reason

BLOCKED if:

- safe authority hardening requires a broad permission redesign
- event/result hardening would alter product behavior
- contracts/Rust smoke requires broad cross-package churn

## Commit

Commit if green.

Suggested prefix:

execution-authority:

Do not push.

## Final Report

Include:

1. Final status
2. Authority audit summary
3. Request shape changes
4. Event/result shape changes
5. Contracts/Rust readiness result
6. Enforcement changes
7. Python eval isolation status
8. Product behavior changed yes/no
9. Truthfulness impact
10. Validation results
11. Remaining boundary debt
12. Commit hash if committed
