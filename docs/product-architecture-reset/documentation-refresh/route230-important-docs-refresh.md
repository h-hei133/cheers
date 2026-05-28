# Route230 Important Documentation Refresh

This note records durable documentation alignment after the product architecture
reset. It is not a branch-status log, token ledger, or transient route report.

## Docs Inspected

- `AGENTS.md`
- `agent-rules/README.md`
- `agent-rules/architecture-boundaries.md`
- `agent-rules/file-placement-and-naming.md`
- `agent-rules/development-workflow.md`
- `agent-rules/evidence-and-truthfulness.md`
- `agent-rules/provider-and-secret-boundary.md`
- `agent-rules/testing-and-validation.md`
- `agent-rules/compatibility-and-history.md`
- `ARCHITECTURE.md`
- `RUNBOOK.md`
- `PROJECT_STATE.md`
- `docs/DOC_STATUS.md`
- `docs/product-architecture-reset/finalConcentrationAudit/08-phase3-final-stop-verdict.md`
- `docs/product-architecture-reset/executionBoundary/README.md`
- `docs/product-architecture-reset/executionBoundary/00-current-language-reality.md`
- `docs/product-architecture-reset/executionBoundary/01-side-effect-entrypoint-inventory.md`
- `docs/product-architecture-reset/executionBoundary/02-execution-boundary-contract.md`
- `docs/product-architecture-reset/executionBoundary/03-boundary-enforcement-plan.md`
- `docs/product-architecture-reset/executionBoundary/04-rust-readiness-triggers.md`
- `docs/product-architecture-reset/executionBoundary/05-python-eval-isolation.md`
- current source ownership surfaces including `runMvpIntegratedFlow.ts`,
  `workflowExecutionCoordinator.ts`, `workflowTaskPlan.ts`,
  `SessionManager.ts`, `entrypoints/cli.tsx`,
  `runtime/execution/executionService.ts`, and the `edit`, `evidence`,
  `result`, `verification`, `repair`, `context`, `provider`, `proposal`,
  `packages/rust-core`, `contracts`, and `packages/python-eval` areas

`README.md` was checked as a candidate and is not present at the repository
root.

## Docs Updated

- `PROJECT_STATE.md`
- `ARCHITECTURE.md`
- `RUNBOOK.md`
- `docs/DOC_STATUS.md`
- `docs/product-architecture-reset/documentation-refresh/route230-important-docs-refresh.md`

## Stale Claims Corrected

- Replaced the stale Rust execution-plane durable framing in
  `PROJECT_STATE.md` with TypeScript-first runtime, explicit execution
  boundary, and Rust optional native executor candidate/path language.
- Added Python offline-eval isolation to durable project-state wording.
- Marked older route closeout and readiness snapshots in `PROJECT_STATE.md` as
  historical evidence, not automatic current truth.
- Tightened `ARCHITECTURE.md` so Python eval is offline evaluation, not
  production runtime, and Rust is not described as the default execution plane.
- Corrected `ARCHITECTURE.md` daemon-unavailable wording to match current
  `executionService.ts`: an enabled-but-unavailable Rust daemon reports a
  failed `rust-daemon` result with recovery metadata, while the TypeScript local
  path is normal when the daemon is disabled.
- Added post-reset owner-module guidance for `runMvpIntegratedFlow.ts`,
  `workflowExecutionCoordinator.ts`, `workflowTaskPlan.ts`,
  `entrypoints/cli.tsx`, `SessionManager.ts`, and owner domains under
  `edit`, `evidence`, `result`, `verification`, `repair`, `context`,
  `provider`, and `proposal`.
- Replaced the stale commit-specific RUNBOOK readiness snapshot with a durable
  readiness evidence policy.
- Added the execution-boundary and Route230 refresh docs to `docs/DOC_STATUS.md`
  so future sessions can find current architecture guidance without broad
  history loading.

## Intentionally Historical Docs

- Route docs under `docs/agent-routes/` remain route history unless a current
  route prompt explicitly targets one.
- Historical route reports and evidence snapshots remain history/compatibility
  artifacts. They must not be read as current product readiness without current
  code and validation evidence.
- Older product architecture reset inventory, phase, and route planning docs
  remain useful for archaeology and compatibility context. They are not
  automatic current truth when they conflict with current code, `AGENTS.md`,
  `agent-rules/`, or the execution-boundary docs.
- The detailed RUNBOOK command index remains an operator aid, but route-era
  evidence descriptions in it are bounded by the refreshed readiness evidence
  policy.

## Current Durable Architecture Summary

- TypeScript is the primary product runtime and control plane.
- Execution is an explicit runtime boundary/interface, currently implemented
  mostly in TypeScript.
- `packages/ts-shell/src/runtime/execution/executionService.ts` is the current
  command/file side-effect boundary for core tool registry paths where
  applicable.
- Rust is a native executor candidate and optional execution path for
  OS/process/sandbox/isolation, timeout/cancellation, daemon, distribution, and
  audit-critical responsibilities. Rust is not the current default execution
  plane unless a concrete runtime path enables and proves it.
- `contracts/` carries schemas, lifecycle states, permission semantics,
  serialized events, and cross-runtime protocol surfaces. It does not own
  business orchestration or side-effect helpers.
- `packages/python-eval/` is offline evaluation only and is not production
  runtime.
- `runMvpIntegratedFlow.ts` and `entrypoints/cli.tsx` are thin compatibility or
  executable shims.
- `workflowExecutionCoordinator.ts`, `workflowTaskPlan.ts`, and
  `SessionManager.ts` are legitimate owner/coordinator modules when they hold
  runtime coordination, planning, and session lifecycle responsibilities.
- New product logic should go to focused owner domains. Compatibility shims
  should delegate and must not gain business logic.
- Evidence and presentation layers must not upgrade skipped, blocked, not-run,
  partial, failed, timeout, no-provider, or not-proven states into success.
  Redaction and report-safe projections must remain intact.

## Remaining Optional Documentation Debt

- `RUNBOOK.md` still contains a large operator command index with route-era
  examples. It is now bounded by the readiness evidence policy, but it could be
  split later into a short runbook plus historical command ledger.
- `PROJECT_STATE.md` remains a large historical orientation file. Future docs
  work could archive old route-delta sections after replacement current-state
  docs are stable.
- Several `docs/architecture/*` module-reference files still describe older
  route snapshots. They should be updated only when a route touches the related
  module or when a concrete stale claim is likely to mislead future work.

## Validation

Route230 validation run for this documentation-only refresh:

- refresh note path check: passed
- grep/check that updated docs do not overclaim Rust as the current default
  execution plane: passed
- grep/check that updated docs do not describe Python eval as production
  runtime: passed
- root `AGENTS.md` short/index-like check: passed, 94 lines
- `git diff --check`: passed
- `git status --short --branch`: passed with only expected markdown changes
  before commit

No build or test sweep is required for this route because the changes are
markdown-only.
