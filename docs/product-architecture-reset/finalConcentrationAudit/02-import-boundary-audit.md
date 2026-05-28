# Import Boundary Audit

## Summary

No product runtime import from docs, scripts, dev-history, or route reports was
found in current `packages/ts-shell/src` non-test TypeScript files.

Important compatibility debt remains:

- `cli/*` modules import many `entrypoints/cli*` compatibility modules.
- Several product surfaces still import the `SessionManager.ts` facade directly.
- `turn/turnFacade.ts` and `entrypoints/cliRuntimeInvocation.ts` still import
  the `orchestration/runMvpIntegratedFlow.ts` compatibility wrapper.

These are directional cleanup issues, not evidence of runtime importing route
reports or docs.

## Forbidden Runtime Imports

Scan target:

- `packages/ts-shell/src`
- TypeScript and TSX files
- Non-test files, excluding `__tests__`

Patterns checked:

- imports from docs
- imports from scripts
- imports from dev-history
- imports from route reports
- dynamic imports containing docs/scripts/dev-history/route names

Result: no non-test product runtime matches.

One test-only match exists:

- `packages/ts-shell/src/daemon/client.test.ts` imports
  `scripts/toolchain.mjs`.

This is test harness coupling, not product runtime leakage.

## CLI Boundary

No `cli/*` module imports the executable `entrypoints/cli.tsx`.

However, many `cli/*` modules import `entrypoints/cli*` compatibility modules,
including:

- `cli/runtime/cliPlanningMutationBridge.ts`
- `cli/runtime/cliSessionRuntimeFactory.ts`
- `cli/runtime/cliRuntimeInvocationBridge.ts`
- `cli/print/replayModeRunner.ts`
- `cli/print/printModeRouter.ts`
- `cli/interactive/interactiveCommandRouter.ts`
- `cli/interactive/interactivePromptRunner.ts`
- `cli/interactive/interactiveLoop.ts`
- `cli/bootstrap/cliStartupSurface.ts`
- `cli/bootstrap/cliBootstrapContext.ts`
- `cli/bootstrap/cliProcessRunner.ts`
- `cli/approval/cliApprovalModeState.ts`
- `cli/approval/cliApprovalEscalationBridge.ts`

Judgment: acceptable for compatibility after the CLI shim cleanup, but not the
target architecture. A future CLI owner route should move reusable CLI contracts
out of `entrypoints/`.

## Session Boundary

No non-test module under `packages/ts-shell/src/session` imports
`SessionManager.ts`. Test and process-fixture imports remain.

External product imports of the `SessionManager.ts` facade are still common:

- `cli/runtime/cliSessionRuntimeFactory.ts`
- `cli/interactive/interactiveCommandRouter.ts`
- `cli/interactive/interactivePromptRunner.ts`
- `cli/interactive/interactiveLoop.ts`
- `cli/bootstrap/cliBootstrapContext.ts`
- `cli/approval/cliApprovalEscalationBridge.ts`
- `cli/approval/cliApprovalAuditBridge.ts`
- `core/shell/*`
- `entrypoints/cli*`

Judgment: the session facade is still the public compatibility surface. This is
acceptable while `SessionManager.ts` remains the facade, but it explains the
high fan-in and should be reduced only after stable session sub-facades exist.

## Orchestration Compatibility Imports

Non-test imports of `orchestration/runMvpIntegratedFlow.ts`:

- `turn/turnFacade.ts`
- `entrypoints/cliRuntimeInvocation.ts`

Judgment: these are compatibility imports into an 8-line shim. They are not a
new monolith, but the target architecture should eventually import the runtime
facade directly.

## Suspicious Direction Findings

- Runtime/planning/edit/verification/repair/result owners do not import docs,
  scripts, or route report files.
- `runtime/workflowExecutionCoordinator.ts` has high fan-out and should shed
  domain-stage logic, but its imports are product modules rather than route
  reports.
- `planning/workflowTaskPlan.ts` has high fan-out and should shed owner-specific
  planning rules, but no forbidden docs/scripts import was found.
- `core/harness` remains mixed with product source and uses route-era fixture
  names. That is harness namespace debt, not direct forbidden import leakage.

