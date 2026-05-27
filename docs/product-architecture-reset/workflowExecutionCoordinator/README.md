# workflowExecutionCoordinator Audit

Status: COMPLETE for the audit route. Runtime code was not edited.

This audit covers `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts` after `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` became a compatibility wrapper. The core question is whether the runtime file is only coordinating product-owned domain modules or has become the new monolithic `runMvpIntegratedFlow` container.

Current conclusion: `workflowExecutionCoordinator.ts` is a legitimate compatibility runtime entrypoint plus a partial new monolith. The public entrypoints, environment setup, orchestrator handoff, and stream/result parity are valid runtime coordination. The large `executeWorkflowTaskPlan` body still owns too much domain behavior: discovery/fenced edit activation, workspace authority wiring, mutation execution sequencing, cross-file repair strategy, low-risk verification semantics, read/repo explain projection decisions, and final evidence/result handoff assembly.

The audit uses current code as truth. Route history documents and prior runMvp planning docs were read as context only.

Artifacts:

- `00-current-map.md`: current file map, imports, exports, regions, tests, and consumers.
- `01-ownership-audit.md`: major symbol and region ownership classification.
- `02-stay-vs-move.md`: stay/move/split/delete matrix.
- `03-extraction-targets.md`: grouped extraction targets with owners, compatibility, tests, and stop conditions.
- `04-risk-register.md`: route risks and mitigation requirements.
- `05-validation-plan.md`: validation gates for future implementation routes.
- `06-next-implementation-routes.md`: recommended grouped implementation routes.

Audit evidence:

- File size: 3282 lines.
- Imports: 51 import declarations.
- Major public exports: `MvpIntegratedFlowOptions`, `runMvpIntegratedFlow`, `streamMvpIntegratedFlow`, `ApplyPatchRuntimeRouteOptions`.
- Major local functions: `createIntegratedRunner`, `executeWorkflowTaskPlan`, continuation/prompt helper predicates, transform evidence helpers, mutation failure guard, target-resolution mutation guard, path normalization.
- Serena used for symbol overview and references. It reported direct runtime references through the orchestration compatibility wrapper, `turn/turnFacade.ts`, browser harness tests, observability tests, fenced edit tests, the large legacy `runMvpIntegratedFlow.test.ts`, and the focused `workflowExecutionCoordinator.test.ts`.

