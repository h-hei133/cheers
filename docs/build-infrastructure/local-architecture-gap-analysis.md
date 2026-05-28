# Local Architecture Gap Analysis

BI001 compares the current project with Pi architecture patterns for planning
only. It does not authorize product code changes.

## Current Strengths After Architecture Cleanup

The current project has already completed important cleanup work:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` is a thin
  compatibility re-export, not the real owner of the runtime flow.
- `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts` is the current
  runtime workflow owner for integrated flow execution.
- `ExecutionService` in `packages/ts-shell/src/runtime/execution` is the
  explicit side-effect boundary for command, file read, file write, and file
  listing operations.
- Tool execution in `core/tools/registry.ts` uses `ExecutionService` and records
  authority facts before side effects.
- Result truthfulness is centralized through `resultMapper` and
  `queryTerminalTruth`.
- `SessionManager` has been narrowed toward a stateful session substrate, with
  many projection/store/continuity/recovery helpers extracted.
- CLI entrypoint code is thin and delegates bootstrap to CLI-owned modules.
- Provider behavior remains opt-in, and local docs/rules forbid reading private
  provider configuration directly.
- Python is not a product runtime and Rust remains a native executor candidate,
  not the default execution plane.

## Remaining Architectural Gaps

### Turn Runtime Boundary

The project has a `turn` owner area, but it does not yet provide the same
boundary that Pi's `AgentHarness` provides:

- no frozen turn snapshot that records the exact model/tool/runtime/session
  inputs for one turn
- no named save point between tool/result batch completion and the next model
  request
- no shared phase vocabulary for prompt, compact, retry, branch/navigation, and
  continuation operations

This gap is the best fit for the first post-planning implementation route.

### Evidence Flush and Next-Turn Refresh

Current evidence and result surfaces are strong, but there is no single runtime
checkpoint equivalent to Pi's `prepareNextTurn`:

- session writes are handled by the shell/session runtime
- command/edit/verification/browser evidence is capability-specific
- terminal truthfulness remains in Result Surface

A local save-point concept should be evidence-only and must not imply success.

### Session Tree and Branch Semantics

Current `SessionManager` persists session state, transcript events, recovery,
replay, compact retention, approval memory, and continuity snapshots. Pi's
session model additionally makes parent ids, active leaf, branch/fork, labels,
and branch summaries central.

Local adoption should not start with a schema migration. A safer first step is a
schema-neutral session tree projection that reads existing evidence and models
future branch operations without changing persistence semantics.

### Resource and Extension System

Pi has a mature resource loader for skills, prompt templates, extensions,
themes, custom providers, and packages. The current project explicitly blocks
dynamic skills/MCP discovery and automatic startup injection in several product
surfaces.

The local gap is not "missing dynamic discovery." The local gap is the absence
of a sanctioned resource contract that could later support static, explicit,
redacted, opt-in resources without weakening provider/tool/browser gates.

### Host-Neutral Event Stream

The project has `QueryEvent`, `streamMvpIntegratedFlow`, and CLI runtime bridges.
Pi separates CLI, RPC, SDK, TUI, and agent core more aggressively.

The local gap is a stable event stream contract that CLI can consume as one host
without making CLI output the runtime truth source.

### Tool Result Structure

Current local tool/runtime results already carry metadata and receipts, but
capability branches still sometimes build user-facing strings near execution.
Pi's explicit split between tool-result `content` and structured `details` is a
good shape for local result projection, provided local Result Surface remains
the truthfulness owner.

## Where Pi Can Help

Pi should inform these local architecture moves:

- define a local turn snapshot that freezes turn inputs
- define a save point that flushes safe session/evidence writes before a next
  turn
- define a phase model for structural operations
- keep low-level event stream contracts host-neutral
- split model-facing content from structured redacted details
- keep resource loading explicit and owner-scoped
- keep provider/auth resolution request-scoped and opt-in
- use file/shell abstraction ideas only through `ExecutionService`

## Where Pi Should Not Be Copied

Do not copy these Pi shapes directly:

- Pi package names or product file names.
- Pi's `utils` areas or any dumping-ground structure.
- Dynamic extension/resource discovery as a default behavior.
- Provider customization that bypasses existing opt-in gates.
- Shell or filesystem execution paths that bypass `ExecutionService`.
- TUI package separation without a route that specifically needs it.
- Session tree persistence migration before schema-neutral projection and replay
  safety are proven.
- Tool hooks that can rewrite success, evidence, or terminal truth without
  Result Surface validation.

## Risks of Overfitting to Pi

- Pi is a cleaner general harness, but this project has stronger truthfulness,
  evidence, provider, and write-authority constraints.
- Pi's extension model is valuable but can conflict with local default-disabled
  discovery and provider boundaries.
- Pi's session tree is attractive, but direct migration could break existing
  replay, recovery, compact, and continuation guarantees.
- Pi's execution environment abstraction overlaps with local `ExecutionService`.
  Introducing a second side-effect path would violate the current architecture.
- Pi's UI/SDK separation could cause large CLI churn before the runtime event
  contract is stable.

## Risks of Route-Grown Relapse

The next implementation route must avoid these relapse patterns:

- adding route-numbered product files
- naming product files after BI001, Pi, route, sprint, MVP, closeout, or
  planning artifacts
- growing compatibility shims beyond delegate/re-export behavior
- putting turn runtime, resources, or event stream code into `utils`, `common`,
  `helpers`, or central orchestration buckets
- treating evidence markers as terminal success
- default-enabling provider, browser, tool, or resource discovery behavior
- adding contracts schemas before a real cross-runtime consumer exists
- treating Python as a runtime owner

## Best-Fit Local Owner Domains

The next planning-to-implementation path should use these owners:

- Runtime / Turn: turn snapshot, save point, phase model.
- Session / Continue: safe persistence flush, future session tree projection.
- Result Surface: terminal truthfulness and evidence interpretation.
- Tool / Runtime: content/details projection and runtime receipt alignment.
- Runtime / Execution: Result-style error taxonomy through `ExecutionService`.
- Policy: resource/provider/tool gates and opt-in boundaries.
- CLI / UX: host behavior only after event stream and runtime boundaries are
  stable.

## Current Recommendation

Start with a narrow Runtime / Turn route:

- define a local turn snapshot type
- define a phase vocabulary for structural operations
- define an evidence-only save-point projection
- integrate only at characterization seams
- do not move provider, tool, edit, browser, or session schema behavior
- prove no product behavior change with focused tests in the implementation
  route

This is the smallest adoption path that uses Pi's strongest architecture idea
without copying Pi or reintroducing route-era product structure.
