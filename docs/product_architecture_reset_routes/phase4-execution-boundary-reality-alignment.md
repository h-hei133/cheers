# Phase 4: Execution Boundary Reality Alignment

## Purpose

Fix the language architecture boundary before continuing feature development.

The project is currently TypeScript-first. Rust exists and has real executor-related pieces, but Rust is not yet the current default execution plane. Python is offline evaluation only. The previous wording that TypeScript is the control plane and Rust is the execution plane is too strong for current code reality.

This route must align documentation, implementation boundaries, and enforcement checks.

This route does not try to make Rust larger for appearance. It makes the TypeScript execution boundary real and Rust-ready.

## Current Architecture Decision

Use this wording going forward:

- TypeScript is the primary product runtime and control plane.
- Execution is an explicit boundary/interface, currently implemented mostly in TypeScript.
- Rust is a native executor candidate for OS, process, sandbox, isolation, cancellation, timeout, daemon, distribution, and audit needs.
- Contracts carry serialized cross-runtime schemas, lifecycle states, permission semantics, and execution events when there is a real cross-runtime consumer.
- Python is offline evaluation only and must not own production runtime semantics.

Do not claim Rust is the current default execution plane unless runtime code proves that claim.

## Combined Phase Structure

This route combines the previous five conceptual phases into three execution phases:

### Phase A: Reality Alignment And Documentation

Update architecture wording and create documentation under:

docs/product-architecture-reset/executionBoundary/

Required files:

- README.md
- 00-current-language-reality.md
- 01-side-effect-entrypoint-inventory.md
- 02-execution-boundary-contract.md
- 03-boundary-enforcement-plan.md
- 04-rust-readiness-triggers.md
- 05-python-eval-isolation.md

The documentation must explain:

- current TypeScript-first runtime reality
- current Rust role
- current contracts role
- current Python eval isolation
- current side-effect owners
- what makes the execution boundary real
- what triggers future Rust expansion

### Phase B: Execution Boundary And Side-Effect Inventory

Create or strengthen the execution boundary in TypeScript.

If an existing abstraction is already the right boundary, document it and strengthen it.

If the boundary is missing or too weak, add a minimal runtime-neutral TypeScript boundary in the correct owner location, expected to be near:

packages/ts-shell/src/runtime/execution/

The boundary should cover at least:

- run command
- read text file
- write text file
- list files or glob-style reads if used by tools
- structured command results or execution events
- timeout, cancellation, and failure classification where current code supports them

Do not invent a large unused abstraction.

The boundary must be used by at least one real runtime path. Prefer moving core tool command and file side effects through it when safe.

Inventory side-effect entrypoints:

- child_process, spawn, exec, execFile
- writable fs operations such as writeFile, rm, unlink, mkdir, rename, appendFile
- apply patch and workspace mutation paths
- shell and PTY execution
- browser process and browser external runner side effects
- MCP process side effects
- runtime network side effects where relevant
- provider fetch side effects where relevant

Classify each as:

- sanctioned owner
- transitional owner
- forbidden direct usage
- test or fixture only
- future migration candidate

### Phase C: Boundary Enforcement And Validation

Add or update a lightweight enforcement check.

Acceptable implementation:

- a script under scripts/
- a focused test
- an existing validation command extension

The check must cover at least:

- no production TypeScript runtime import from packages/python-eval
- no production TypeScript runtime import from docs, scripts, dev-history, or route reports
- no direct child_process import outside sanctioned execution or process owners
- no direct writable fs operations outside sanctioned file, workspace, session, browser, config, or execution owners
- contracts must not import product runtime or control-plane modules

Use explicit allowlists for current owners.

The scanner is a guardrail, not a broad architecture theorem. Keep exceptions narrow and documented.

## Required Reading

Read before editing:

- root AGENTS.md
- agent-rules/architecture-boundaries.md
- agent-rules/provider-and-secret-boundary.md
- agent-rules/evidence-and-truthfulness.md
- agent-rules/testing-and-validation.md
- current TypeScript runtime execution, command, file, tool, patch, browser, MCP modules
- current Rust package under packages/rust-core
- current contracts package
- packages/python-eval if present
- current package scripts related to verification

Use current code as truth.

## Documentation Wording Requirements

Replace over-strong language such as:

TypeScript equals control plane and Rust equals execution plane

with current-reality wording:

TypeScript is the primary product runtime and control plane. Execution is an explicit boundary currently implemented mostly in TypeScript. Rust is a native executor candidate for OS, process, sandbox, isolation, daemon, timeout, cancellation, distribution, and audit-critical responsibilities.

The docs must not imply Rust is unused. They must describe Rust as a real candidate and optional executor path where current code supports that.

The docs must not imply Python eval is part of production runtime.

## Execution Boundary Requirements

The boundary must not be ceremonial.

It must satisfy at least one of these:

- existing real runtime callers use it
- this route moves real command or file tool calls through it
- an existing boundary is made explicit and enforced by scan or tests

The route should prefer a minimal but real boundary over a large unused abstraction.

Where possible, represent execution results with structured fields instead of raw strings only.

Important concepts:

- execution path
- completed
- failed
- timeout
- cancelled
- exit code
- stdout
- stderr
- failure kind
- recovery reason when fallback happens
- sandbox rejection if current code supports it
- permission requirement if current code supports it

Do not change existing user-visible behavior unless required to preserve boundary correctness.

## Permission And Write Boundary Requirements

Do not hide write authority behind booleans or prompt text.

Where touched, preserve explicit concepts:

- dry-run
- preview
- permission-pending
- denied
- blocked
- approved-for-write
- write-success
- verification-not-run
- verification-failed
- verification-passed
- sandbox-rejected
- execution-timeout
- execution-cancelled

Do not weaken existing authority semantics.

Do not convert stopped, blocked, partial, skipped, not-run, no-provider, failed, timeout, or not-proven into success.

## Contracts Boundary Requirements

Contracts may contain:

- schemas
- event types
- permission request and response types
- lifecycle states
- serialization rules
- versioning rules
- cross-runtime semantic invariants

Contracts must not contain:

- business orchestration
- model calls
- shell helpers
- file system helpers
- UI helpers
- runtime side-effect code
- test mock convenience

If the current contracts package should not change in this route, document why and keep it untouched.

## Rust Boundary Requirements

Do not migrate logic to Rust just to satisfy the old design.

Rust expansion should be triggered by real needs such as:

- OS or process guarantees
- reliable process tree cleanup
- cancellation or timeout reliability
- sandbox or isolation enforcement
- PTY or process lifecycle reliability
- single-binary distribution
- security-sensitive execution audit
- daemon reliability

This route may add a tiny Rust smoke only if the current repo already has a low-risk path for it. Otherwise, document Rust readiness triggers and do not touch Rust code.

## Python Boundary Requirements

Python is offline evaluation only.

Python may read traces, datasets, evaluation artifacts, and write evaluation outputs.

Python must not own:

- production orchestration
- permissions
- replay
- recovery
- runtime persistence
- agent loop execution
- production tool lifecycle
- production runtime side effects

Add or confirm an enforcement check that production runtime packages do not import Python eval.

## Strict Non-Goals

Do not:

- add product features
- run live provider
- migrate broadly to Rust
- move Python into runtime
- change provider defaults
- change production write defaults
- change package scripts unless adding a narrow verification alias is clearly needed
- weaken evidence or verdict truthfulness
- change CLI/session/product output behavior
- rewrite command execution behavior broadly
- rewrite patch or workspace write behavior broadly
- mass-format unrelated files

## Validation

Required:

- path existence check for docs/product-architecture-reset/executionBoundary files
- focused tests for any added or changed execution boundary code
- boundary enforcement script or test
- npm run build -w packages/ts-shell if TypeScript code changed
- contracts tests only if contracts changed
- Rust tests only if Rust files changed
- git diff --check
- git status --short --branch

Do not run live provider.

If package scripts are changed, validate the old behavior and the new alias.

## Completion Criteria

COMPLETE requires:

- architecture wording no longer overclaims Rust as current default execution plane
- executionBoundary docs exist and are non-empty
- side-effect inventory exists
- execution boundary is implemented or an existing boundary is clearly documented and strengthened
- at least one real runtime path uses the execution boundary, unless a stronger existing use is documented
- boundary enforcement scan or test exists
- Python eval isolation is checked
- contracts dependency direction is clarified and checked
- no product behavior or defaults changed except internal boundary routing
- validation passes

PARTIAL if:

- only docs change and no enforcement exists
- side-effect inventory is incomplete
- execution boundary remains purely aspirational
- Rust, Python, or contracts wording remains misleading
- validation is skipped without reason

BLOCKED if:

- current side effects are too scattered to classify safely
- enforcement requires broad runtime rewrite
- boundary changes would alter product behavior

## Commit

Commit if green.

Suggested prefix:

execution-boundary:

Do not push.

## Final Report

Include:

1. Final status
2. Wording changes
3. Execution boundary added or confirmed
4. Real runtime path routed through the boundary
5. Side-effect inventory summary
6. Boundary enforcement added
7. Rust readiness status
8. Python eval isolation status
9. Contracts boundary status
10. Product behavior changed yes/no
11. Validation results
12. Remaining boundary debt
13. Commit hash if committed
