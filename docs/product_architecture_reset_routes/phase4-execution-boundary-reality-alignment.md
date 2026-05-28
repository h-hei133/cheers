# Phase 4: Execution Boundary Reality Alignment

## Purpose

Align the language architecture with current reality and make the future execution boundary enforceable.

The project is currently TypeScript-first. Rust exists, but it is not yet the real execution plane. Python is evaluation-only. The previous wording "TypeScript = control plane, Rust = execution plane" is too strong for the current codebase and can become architectural fiction.

This route must correct that.

The goal is not to write more Rust.

The goal is to make execution boundaries real inside the current TypeScript-first architecture so Rust can later take over OS/process/isolation-critical execution without rewriting the agent product runtime.

## Core Decision

Use this current architecture wording:

- TypeScript is the primary product runtime and control plane.
- Execution is an explicit boundary/interface, currently implemented mostly in TypeScript.
- Rust is a future native executor candidate for OS/process/sandbox/isolation/distribution-critical responsibilities.
- Contracts are serialized schemas, lifecycle states, permission semantics, and execution events shared across runtimes when there is a real cross-runtime consumer.
- Python is offline eval only and must not participate in production runtime semantics.

Do not claim Rust owns the execution plane until the code proves it.

## Required Reading

Read before editing:

- root AGENTS.md
- agent-rules/architecture-boundaries.md
- agent-rules/development-workflow.md
- agent-rules/file-placement-and-naming.md
- agent-rules/evidence-and-truthfulness.md
- agent-rules/testing-and-validation.md
- current TypeScript runtime/execution/command/file-write modules
- current Rust package under packages/rust-core
- current contracts package
- packages/python-eval if present
- current package scripts related to build/test/verification

Use current code as truth.

## Output Documentation

Create:

```text
docs/product-architecture-reset/executionBoundary/
````

Required docs:

```text
README.md
00-current-language-reality.md
01-side-effect-entrypoint-inventory.md
02-execution-boundary-contract.md
03-boundary-enforcement-plan.md
04-rust-readiness-triggers.md
05-python-eval-isolation.md
```

## Required Code/Rule Work

This route must do more than write docs.

It must add or verify enforceable boundaries.

Expected work:

1. Update root AGENTS.md and agent-rules/architecture-boundaries.md to replace over-strong Rust execution-plane wording with TypeScript-first / Rust-ready wording.
2. Audit direct external side effects in TypeScript:

   * child_process / spawn / exec
   * fs write/delete/mkdir/rename operations
   * apply patch / write file / workspace mutation
   * PTY / shell / command execution
   * browser or MCP side effects
   * network calls if used as runtime side effects
3. Identify current sanctioned side-effect owners and unsanctioned direct usage.
4. Add or confirm an ExecutionService / execution adapter boundary.
5. Add or confirm structured execution event and request types.
6. Add an enforceable boundary check or focused test that prevents new direct side-effect imports outside allowed owners.
7. Ensure Python eval is not imported by production runtime packages.
8. Ensure contracts do not become a business-logic or IO-helper dumping ground.

## Execution Boundary Requirements

Do not create a ceremonial interface that nobody can use.

If an equivalent execution abstraction already exists, document it and strengthen it.

If no equivalent exists, add a minimal runtime-neutral TypeScript interface in the correct owner location, for example:

```text
packages/ts-shell/src/runtime/execution/
```

or another current-code-justified runtime owner.

The boundary should represent concepts like:

* run command
* cancel command
* read file
* write file
* apply patch
* sandbox/preflight check
* structured execution events
* permission/capability requirement

Do not force all runtime callers to migrate in this route unless safe.

A minimal first step is acceptable only if it is enforceable:

* a stable interface exists
* sanctioned side-effect owners are listed
* direct forbidden imports are scanned
* future violations fail a check
* current exceptions are narrow and documented

## Permission Boundary Requirements

Do not hide write authority behind booleans or prompt text.

Where this route touches execution or write types, preserve or introduce explicit concepts such as:

* permission token
* authority token
* dry-run
* preview
* permission-pending
* denied
* approved-for-write
* write-success
* execution-started
* execution-exited
* execution-timed-out
* execution-cancelled
* sandbox-rejected

Do not weaken existing authority semantics.

## Contracts Boundary Requirements

Contracts may contain:

* schemas
* event types
* permission/request/response types
* lifecycle states
* serialization/versioning rules

Contracts must not contain:

* business orchestration
* model calls
* shell helpers
* file system helpers
* UI helpers
* test mock convenience
* runtime side-effect code

If the current contracts package is too small to justify changes, do not force new contract files. Document the current state and the trigger for future contract elevation.

## Rust Boundary Requirements

Do not migrate logic to Rust just to satisfy the old design.

Rust should only own responsibilities that need:

* OS/process guarantees
* process tree cleanup
* cancellation/timeout reliability
* sandbox or isolation enforcement
* PTY/process lifecycle reliability
* single-binary distribution
* security-sensitive execution audit

This route may add a small Rust contract smoke only if the current repo already has a reasonable Rust/contracts path and it is low-risk. Otherwise, document the trigger and do not add Rust code.

## Python Boundary Requirements

Python is offline eval only.

Python may read traces, datasets, and evaluation artifacts.

Python must not own:

* production orchestration
* permissions
* replay
* recovery
* persistence
* agent loop
* runtime side effects
* production tool lifecycle

Add or verify an import/dependency check that production runtime packages do not import Python eval.

## Boundary Enforcement

Add or update a lightweight boundary check if practical.

Acceptable forms:

* script that scans forbidden imports
* test that scans source files
* existing validation command extended with execution-boundary checks
* package script alias for the boundary check if useful

The check should cover at least:

* no production runtime import from packages/python-eval
* no direct child_process import outside sanctioned execution owners
* no direct fs write/delete/mkdir/rename outside sanctioned file/workspace owners
* no production runtime import from docs/scripts/dev-history/route reports
* contracts package does not import runtime/control-plane modules

Existing exceptions must be explicit and narrow.

Do not create a huge brittle scanner that blocks known legitimate files without a documented allowlist.

## Non-Goals

Do not:

* add features
* run live provider
* rewrite command execution behavior
* rewrite file write behavior
* migrate execution to Rust broadly
* move Python eval into runtime
* change provider defaults
* change production write defaults
* change package scripts unless adding a narrow verification alias
* weaken evidence/verdict truthfulness
* break existing tests
* mass-format unrelated files

## Required Phases

### Phase A: Reality Alignment

Update architecture wording in AGENTS/rules and create current-language reality docs.

### Phase B: Side-Effect Inventory

Create side-effect entrypoint inventory with sanctioned owners, direct usages, exceptions, and next actions.

### Phase C: Execution Boundary

Add or strengthen the ExecutionService / execution adapter boundary. Do not create unused ceremony. If an existing abstraction is already the correct boundary, document and expose it clearly.

### Phase D: Boundary Enforcement

Add or update a lightweight scan/test for dependency direction and forbidden side-effect imports.

### Phase E: Validation

Run appropriate checks.

## Validation

Required:

* path existence check for executionBoundary docs
* focused tests for added/changed execution boundary code
* boundary scan/test if added
* npm run build -w packages/ts-shell if TypeScript code changed
* npm run test -w packages/rust-core or equivalent only if Rust code changed
* contracts tests only if contracts changed
* git diff --check
* git status --short --branch

If package scripts are changed, validate old behavior and new alias if added.

Do not run live provider.

## Completion Criteria

COMPLETE requires:

* AGENTS/rules no longer overclaim Rust as current execution plane
* docs/product-architecture-reset/executionBoundary docs exist
* side-effect inventory exists
* execution boundary is either implemented or existing boundary is clearly documented and strengthened
* boundary enforcement scan/test exists or is explicitly integrated into an existing check
* Python eval is confirmed offline-only from runtime dependency perspective
* contracts boundary is clarified
* no product behavior change unless explicitly justified as boundary preservation
* validation passes

PARTIAL if:

* only docs change and no enforceable boundary check exists
* side-effect inventory is incomplete
* execution boundary remains purely aspirational
* Rust/Python/contracts wording remains misleading

BLOCKED if:

* current execution side effects are too scattered to safely classify
* enforcement would require broad runtime rewrite
* boundary changes would alter product behavior

## Commit

Commit if green.

Suggested prefix:

execution-boundary:

Do not push.

## Final Report

Include:

1. Final status
2. Wording changes
3. Side-effect inventory summary
4. Execution boundary added or confirmed
5. Boundary enforcement added
6. Rust readiness status
7. Python eval isolation status
8. Contracts boundary status
9. Product behavior changed yes/no
10. Validation results
11. Remaining boundary debt
12. Commit hash if committed

