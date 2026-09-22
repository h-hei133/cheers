# BI001 Planning Summary

Final status: planning complete if the BI001 validation commands pass.

This route created planning documents only. No product code was changed.

## Serena Inspection Summary

Serena was used on both required repositories:

- Current project: `/home/wang/projects/cheers`
- Pi reference repo: `/home/wang/projects/pi`

Current project inspected areas:

- runtime workflow coordinator
- ExecutionService
- tool registry
- SessionManager
- Result Surface
- session runtime
- CLI bootstrap/runtime bridge
- turn facade and role draft stage
- provider, planning, proposal, edit, verification, evidence, and context stages

Pi inspected areas:

- `AgentHarness`
- low-level agent loop
- turn snapshot and save point methods
- phase model
- session tree
- tool runtime and hooks
- resource loader
- provider/model registry
- `ExecutionEnv`
- SDK/RPC/UI-adjacent host separation

Serena unavailable status: not applicable. Serena was available.

Pi repo unavailable status: not applicable. `/home/wang/projects/pi` was
inspectable.

## Documents Created

- `docs/build-infrastructure/pi-reference-inspection-notes.md`
- `docs/build-infrastructure/pi-pattern-adoption-matrix.md`
- `docs/build-infrastructure/local-architecture-gap-analysis.md`
- `docs/build-infrastructure/build-infrastructure-roadmap.md`
- `docs/build-infrastructure/bi001-planning-summary.md`

Existing input retained:

- `docs/build-infrastructure/pi_structure.md`
- `docs/build-infrastructure/route/route-bi001-pi-inspired-architecture-planning.md`

## Final Recommendation

Adopt Pi's harness ideas through local owner domains, not through Pi naming or a
copy of Pi's package structure.

The next route should start with a Runtime / Turn boundary:

- frozen turn snapshot
- explicit phase model
- evidence-only save point
- no provider default enablement
- no session schema migration
- no compatibility shim growth
- no product route-numbered files

## Top 5 Adopt-Now Patterns

1. AgentHarness-style boundary above the low-level loop
   - Local owner: Runtime / Turn and Agent Loop.
   - Target: `packages/ts-shell/src/runtime` and `packages/ts-shell/src/turn`.

2. Frozen turn snapshot
   - Local owner: Turn, Runtime, Session / Continue.
   - Target: turn snapshot type and runtime handoff projection.

3. Save point after tool/result batch
   - Local owner: Runtime, Session / Continue, Evidence, Result Surface.
   - Target: runtime turn boundary and session/evidence projection.

4. Explicit phase model
   - Local owner: Runtime, Session / Continue, CLI / UX.
   - Target: runtime phase vocabulary consumed by shell/session surfaces.

5. Tool result content/details split
   - Local owner: Tool, Runtime, Result Surface, Session / Continue.
   - Target: runtime receipt/result projection.

Additional adopt-now pattern:

- Result-style low-level error taxonomy through ExecutionService and Result
  Surface.

## Top 5 Adapt-Later Patterns

1. Resource loader for skills, prompts, themes, extensions, and packages.
2. Session tree with active leaf and branch summary.
3. Host-neutral event stream for CLI/SDK/RPC separation.
4. Per-request provider auth resolution beyond the current opt-in gates.
5. Steering, follow-up, and next-turn delivery modes.

## Rejected Patterns

- Direct TUI package separation in the next cycle.
- Copying Pi package names, file names, or product structure.
- Dynamic resource discovery by default.
- Shell/filesystem execution abstraction that bypasses `ExecutionService`.
- Tool hooks that can rewrite success without Result Surface verdict.
- Session tree persistence migration as the first step.

## Owner Domains Affected

- Runtime / Turn
- Agent Loop
- Session / Continue
- Result Surface
- Evidence
- Tool / Runtime
- Runtime / Execution
- Policy
- CLI / UX
- Provider / Model, only for deferred opt-in work
- Runtime / Resources, only for deferred explicit-resource work

## Architecture Risks

- A harness boundary can become a new orchestration dumping ground if it is not
  limited to snapshot, phase, queue, and save-point responsibilities.
- Resource loading can weaken local no-discovery guarantees if adopted before a
  policy contract.
- Session tree adoption can break replay/recovery if it starts with persistence
  migration instead of projection.
- Tool hooks can weaken truthfulness if they mutate success/error outside Result
  Surface.
- ExecutionEnv adoption can bypass `ExecutionService` if copied instead of
  adapted.
- Provider registry changes can accidentally default-enable or expose real
  provider configuration.

## Immediate Next Route Name

`Runtime Turn Snapshot And Save Point`

This should be a product implementation route only after BI001 is accepted. It
should not use BI001 or route numbers in product file names.

## No-Code-Change Confirmation

BI001 intentionally changed only documentation under `docs/build-infrastructure`.
No product code, package scripts, provider gates, runtime behavior, tests, or
build configuration were changed.

## Validation To Run

Required by BI001:

- `rtk git diff --check`
- `rtk git status --short --branch`

No build or test result is claimed in this document.
