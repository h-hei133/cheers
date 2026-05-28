# Route230: Important Documentation Refresh

## Purpose

Refresh important durable project documentation so future Codex sessions are not misled by stale architecture, route-era status, outdated module maps, or old language-boundary assumptions.

This route is documentation-only.

It must update durable project-level documentation based on current code and current architecture reality. It must not record transient branch status, route logs, token usage, temporary baseline counts, or short-lived roadmap claims.

## Current Context

The project has recently completed major architecture reset work:

- AGENTS.md was shortened into a startup index.
- Detailed agent rules moved under agent-rules.
- runMvpIntegratedFlow.ts became a compatibility wrapper.
- CLI entrypoint became a thin executable shim.
- planning and runtime responsibilities were moved into rightful owners.
- SessionManager was audited and corrected as a session lifecycle owner, not a hollow facade.
- edit, evidence, result, and patch result ownership was improved.
- script taxonomy and route vocabulary were partially cleaned.
- execution boundary reality was aligned: TypeScript-first runtime, explicit execution boundary, Rust-ready native executor, Python offline eval only.
- ExecutionService and execution boundary enforcement were added.

Many older docs may still describe previous assumptions. This route must update the important ones.

## Required Reading

Before editing, inspect current code and docs.

Must read:

- AGENTS.md
- agent-rules/README.md
- agent-rules/architecture-boundaries.md
- agent-rules/file-placement-and-naming.md
- agent-rules/development-workflow.md
- agent-rules/evidence-and-truthfulness.md
- agent-rules/provider-and-secret-boundary.md
- agent-rules/testing-and-validation.md
- agent-rules/compatibility-and-history.md
- docs/product-architecture-reset/finalConcentrationAudit/08-phase3-final-stop-verdict.md if present
- docs/product-architecture-reset/executionBoundary/README.md if present
- docs/product-architecture-reset/executionBoundary/00-current-language-reality.md if present
- docs/product-architecture-reset/executionBoundary/01-side-effect-entrypoint-inventory.md if present
- docs/product-architecture-reset/executionBoundary/02-execution-boundary-contract.md if present
- docs/product-architecture-reset/executionBoundary/03-boundary-enforcement-plan.md if present
- docs/product-architecture-reset/executionBoundary/04-rust-readiness-triggers.md if present
- docs/product-architecture-reset/executionBoundary/05-python-eval-isolation.md if present
- ARCHITECTURE.md if present
- RUNBOOK.md if present
- README.md if present
- docs/DOC_STATUS.md if present
- PROJECT_STATE.md if present
- PLANS.*.md files only if they are still referenced as durable guidance

Must inspect current source ownership:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts
- packages/ts-shell/src/planning/workflowTaskPlan.ts
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/runtime/execution/executionService.ts if present
- packages/ts-shell/src/edit
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/verification
- packages/ts-shell/src/repair
- packages/ts-shell/src/context
- packages/ts-shell/src/provider
- packages/ts-shell/src/proposal
- packages/rust-core if present
- contracts if present
- packages/python-eval if present

Use current code as truth.

## Goal

Update important durable docs so they reflect the current architecture.

COMPLETE requires:

1. Identify stale durable documentation.
2. Update the important docs that future Codex sessions are likely to read.
3. Preserve only stable, project-level guidance.
4. Avoid route logs and transient status.
5. Add a concise documentation refresh note explaining what was updated and what remains intentionally historical.

## Important Documentation Candidates

Codex must inspect and decide which files need updates. Likely candidates include:

- ARCHITECTURE.md
- RUNBOOK.md
- README.md
- docs/DOC_STATUS.md
- PROJECT_STATE.md only if it is still used as durable state guidance
- docs/product-architecture-reset final summary docs
- docs/product-architecture-reset execution boundary docs
- docs/product-architecture-reset final concentration audit docs
- any top-level docs that still claim Rust is the current default execution plane
- any docs that still present runMvpIntegratedFlow.ts as a large owner
- any docs that still present entrypoints/cli.tsx as owning reusable CLI contracts
- any docs that still present SessionManager as something that must become a hollow facade
- any docs that still encourage placing new product logic in old orchestration paths
- any docs that still treat route reports as current product truth
- any docs that still describe Python eval as runtime-capable

## Required Updates

### Architecture Reality

Docs must reflect:

- TypeScript is the primary product runtime and control plane.
- Execution is an explicit boundary, currently mostly implemented in TypeScript.
- Rust is a native executor candidate and optional execution path for OS, process, sandbox, isolation, daemon, timeout, cancellation, distribution, and audit-critical responsibilities.
- Rust is not the current default execution plane unless a specific runtime path proves it.
- contracts carry schemas, lifecycle states, permission semantics, serialized events, and cross-runtime protocol surfaces.
- contracts must not own business orchestration or side-effect helpers.
- Python eval is offline evaluation only and must not participate in production runtime semantics.

### Post-reset Ownership

Docs must reflect:

- AGENTS.md is a short startup index.
- Detailed rules live under agent-rules.
- runMvpIntegratedFlow.ts is a compatibility wrapper.
- entrypoints/cli.tsx is an executable shim.
- workflowExecutionCoordinator.ts is a runtime coordinator.
- workflowTaskPlan.ts is a planning owner.
- SessionManager.ts is a right-sized session lifecycle owner, not a hollow facade target.
- ExecutionService is the execution boundary for core tool command and file side effects where applicable.
- New product code must go to owner modules, not route-era orchestration dumping paths.
- Compatibility shims must stay thin and must not gain business logic.

### Evidence And Truthfulness

Docs must preserve:

- provider-called is not proposal success
- exact-ready is not write authority
- write authority is not verification success
- apply without verification is not verified success
- repair proposal is not repair success
- repair apply without re-verification is not repair success
- skipped, blocked, not-run, partial, failed, timeout, no-provider, and not-proven states must not become success
- redaction and report-safe projections must remain intact

### History And Compatibility

Docs must distinguish:

- current product truth
- historical route reports
- compatibility adapters
- dev-history
- evidence-history
- old aliases

Historical artifacts may remain reachable, but they must not be described as current product readiness unless current code and current validation support that claim.

## Documentation Refresh Note

Create or update:

docs/product-architecture-reset/documentation-refresh/route230-important-docs-refresh.md

The note must include:

- docs inspected
- docs updated
- stale claims corrected
- docs intentionally left historical
- current durable architecture summary
- remaining optional documentation debt
- validation run

This note is not a route log with branch status or token usage. It is a durable explanation of documentation alignment.

## Strict Non-Goals

Do not:

- edit runtime source code
- edit tests
- edit package scripts
- edit provider config
- run live provider
- change build behavior
- change runtime behavior
- create new architecture claims not supported by current code
- update docs with temporary branch state
- add token usage or elapsed time
- record completed route logs as durable architecture truth
- use project-state docs as automatic truth over current code
- make outdated docs look current if they are intentionally historical

## Handling Historical Docs

Some docs are historical and should not be rewritten as if they were current.

If a doc is historical:

- add a short status note only if useful
- point readers to current docs
- do not rewrite history
- do not delete historical context
- do not claim historical reports are current readiness

If a doc is still used as current guidance, update it to current reality.

## Validation

Required:

- path existence check for docs/product-architecture-reset/documentation-refresh/route230-important-docs-refresh.md
- grep or equivalent check that updated docs no longer overclaim Rust as the current default execution plane
- grep or equivalent check that updated docs do not describe Python eval as production runtime
- grep or equivalent check that root AGENTS.md still stays short and index-like
- git diff --check
- git status --short --branch

If only markdown changes, do not run build/tests.

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- important stale durable docs are updated
- current architecture reality is reflected
- TypeScript-first and Rust-ready boundary is documented consistently
- Python offline eval isolation is documented consistently
- post-reset owner modules are described accurately
- historical route reports are not described as current product truth
- documentation refresh note exists
- no runtime code, tests, package scripts, provider behavior, or build behavior changed
- validation passes

PARTIAL if:

- only the refresh note is created
- important stale docs remain obviously misleading
- docs still overclaim Rust as current execution plane
- docs still imply Python eval can own runtime semantics
- validation is skipped without reason

BLOCKED if:

- current code and docs conflict too much to safely update
- necessary source files cannot be inspected
- required target docs are missing and cannot be classified as historical or current

## Commit

Commit if green.

Suggested prefix:

docs-refresh:

Do not push.

## Final Report

Include:

1. Final status
2. Docs inspected
3. Docs updated
4. Stale claims corrected
5. Docs intentionally left historical
6. Runtime/package behavior changed yes/no
7. Validation results
8. Remaining documentation debt
9. Commit hash if committed
